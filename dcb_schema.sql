-- ============================================================
-- Dynamic Consistency Boundary (DCB) – PostgreSQL Implementation
-- ============================================================

-- ------------------------------------------------------------
-- 1. Schema
-- ------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS dcb;

-- ------------------------------------------------------------
-- 2. Composite types
-- ------------------------------------------------------------

CREATE TYPE dcb.dcb_event_tt AS (
    type text,
    data bytea,
    tags text[]
);

CREATE TYPE dcb.dcb_query_item_tt AS (
    types text[],
    tags  text[]
);

-- ------------------------------------------------------------
-- 3. Tables
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS dcb.events (
    id              bigserial    PRIMARY KEY,
    type            text         NOT NULL,
    data            bytea,
    tags            text[]       NOT NULL,
    idempotency_key text         NOT NULL,
    created_at      timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dcb.idempotency_keys (
    idempotency_key text        PRIMARY KEY,
    command_kind    text        NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dcb.event_tags (
    tag     text   NOT NULL,
    main_id bigint NOT NULL REFERENCES dcb.events(id),
    PRIMARY KEY (tag, main_id)
);

-- ------------------------------------------------------------
-- 4. Indexes
-- ------------------------------------------------------------

-- Covering index: id lookups that also need type (used by filtered_ids joins)
CREATE UNIQUE INDEX IF NOT EXISTS events_id_cover_type_idx
    ON dcb.events (id) INCLUDE (type);

-- Composite index: type-filtered range scans (select_events_by_type, poll_partition)
CREATE INDEX IF NOT EXISTS events_type_id_idx
    ON dcb.events (type, id);

-- Regular index for idempotency key lookups (NOT unique — multiple events share one key)
CREATE INDEX IF NOT EXISTS idx_events_idempotency_key
    ON dcb.events (idempotency_key);

-- Note: event_tags PK on (tag, main_id) replaces the old separate index.

-- ------------------------------------------------------------
-- 5. Read functions
-- ------------------------------------------------------------

-- 5.1 Select max event id
CREATE OR REPLACE FUNCTION dcb.select_max_id()
RETURNS bigint
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
    SELECT MAX(id) FROM dcb.events;
$$;

-- 5.2 Select events by type
CREATE OR REPLACE FUNCTION dcb.select_events_by_type(
    event_type  text,
    after_id    bigint DEFAULT 0,
    limit_count bigint DEFAULT 9223372036854775807
)
RETURNS SETOF dcb.events
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
    SELECT *
      FROM dcb.events
     WHERE type = event_type
       AND id > COALESCE(after_id, 0)
     ORDER BY id ASC
     LIMIT COALESCE(limit_count, 9223372036854775807);
$$;

-- 5.3 Select events by DCB query (tag-first, index-friendly)
CREATE OR REPLACE FUNCTION dcb.select_events_by_tags(
    query_items dcb.dcb_query_item_tt[],
    after_id    bigint DEFAULT 0,
    limit_count bigint DEFAULT 9223372036854775807
)
RETURNS SETOF dcb.events
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
    WITH query_items_cte AS (
        SELECT * FROM unnest(query_items) WITH ORDINALITY
    ),
    initial_matches AS (
        SELECT t.main_id,
               qi.ordinality,
               t.tag,
               qi.tags  AS required_tags,
               qi.types AS allowed_types
          FROM query_items_cte qi
          JOIN dcb.event_tags t ON t.tag = ANY(qi.tags)
         WHERE t.main_id > COALESCE(after_id, 0)
    ),
    matched_groups AS (
        SELECT main_id,
               ordinality,
               COUNT(DISTINCT tag)            AS matched_tag_count,
               array_length(required_tags, 1) AS required_tag_count,
               allowed_types
          FROM initial_matches
         GROUP BY main_id, ordinality, required_tag_count, allowed_types
    ),
    qualified_ids AS (
        SELECT main_id, allowed_types
          FROM matched_groups
         WHERE matched_tag_count = required_tag_count
    ),
    filtered_ids AS (
        SELECT e.id
          FROM dcb.events e
          JOIN qualified_ids q ON q.main_id = e.id
         WHERE e.id > COALESCE(after_id, 0)
           AND (array_length(q.allowed_types, 1) IS NULL
                OR array_length(q.allowed_types, 1) = 0
                OR e.type = ANY(q.allowed_types))
         ORDER BY e.id ASC
         LIMIT COALESCE(limit_count, 9223372036854775807)
    )
    SELECT *
      FROM dcb.events
     WHERE id IN (SELECT id FROM filtered_ids)
     ORDER BY id ASC;
$$;

-- 5.4 Select last event per query item group (for last_event_only mode)
CREATE OR REPLACE FUNCTION dcb.select_last_events_by_tags(
    query_items dcb.dcb_query_item_tt[]
)
RETURNS SETOF dcb.events
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
    WITH query_items_cte AS (
        SELECT * FROM unnest(query_items) WITH ORDINALITY
    ),
    initial_matches AS (
        SELECT t.main_id,
               qi.ordinality,
               t.tag,
               qi.tags  AS required_tags,
               qi.types AS allowed_types
          FROM query_items_cte qi
          JOIN dcb.event_tags t ON t.tag = ANY(qi.tags)
    ),
    matched_groups AS (
        SELECT main_id,
               ordinality,
               COUNT(DISTINCT tag)            AS matched_tag_count,
               array_length(required_tags, 1) AS required_tag_count,
               allowed_types
          FROM initial_matches
         GROUP BY main_id, ordinality, required_tag_count, allowed_types
    ),
    qualified_ids AS (
        SELECT main_id, ordinality, allowed_types
          FROM matched_groups
         WHERE matched_tag_count = required_tag_count
    ),
    filtered_ids AS (
        SELECT e.id,
               q.ordinality,
               ROW_NUMBER() OVER (
                   PARTITION BY q.ordinality
                   ORDER BY e.id DESC
               ) AS rn
          FROM dcb.events e
          JOIN qualified_ids q ON q.main_id = e.id
         WHERE array_length(q.allowed_types, 1) IS NULL
            OR array_length(q.allowed_types, 1) = 0
            OR e.type = ANY(q.allowed_types)
    ),
    last_ids AS (
        SELECT DISTINCT id FROM filtered_ids WHERE rn = 1
    )
    SELECT *
      FROM dcb.events
     WHERE id IN (SELECT id FROM last_ids)
     ORDER BY id ASC;
$$;

-- ------------------------------------------------------------
-- 6. Append functions
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION dcb.unconditional_append(
    new_events      dcb.dcb_event_tt[],
    idempotency_key TEXT,
    command_kind    TEXT
)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
    max_id       bigint;
    event_record dcb.dcb_event_tt;
    inserted_id  bigint;
    tag_item     text;
BEGIN
    -- Insert into idempotency_keys table (PK rejects duplicates)
    INSERT INTO dcb.idempotency_keys (idempotency_key, command_kind)
    VALUES (unconditional_append.idempotency_key, unconditional_append.command_kind);

    max_id := 0;

    FOREACH event_record IN ARRAY new_events
    LOOP
        INSERT INTO dcb.events (type, data, tags, idempotency_key)
        VALUES (event_record.type, event_record.data, event_record.tags, unconditional_append.idempotency_key)
        RETURNING id INTO inserted_id;

        max_id := GREATEST(max_id, inserted_id);

        FOREACH tag_item IN ARRAY event_record.tags
        LOOP
            INSERT INTO dcb.event_tags (tag, main_id)
            VALUES (tag_item, inserted_id);
        END LOOP;
    END LOOP;

    RETURN max_id;
END;
$$;

CREATE OR REPLACE FUNCTION dcb.conditional_append(
    query_items     dcb.dcb_query_item_tt[],
    after_id        bigint,
    new_events      dcb.dcb_event_tt[],
    idempotency_key TEXT,
    command_kind    TEXT
)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
    conflict_exists boolean;
BEGIN
    SET LOCAL lock_timeout = '5s';
    LOCK TABLE dcb.events IN EXCLUSIVE MODE;

    WITH query_items_cte AS (
        SELECT * FROM unnest(query_items) WITH ORDINALITY
    ),
    initial_matches AS (
        SELECT t.main_id,
               qi.ordinality,
               t.tag,
               qi.tags  AS required_tags,
               qi.types AS allowed_types
          FROM query_items_cte qi
          JOIN dcb.event_tags t ON t.tag = ANY(qi.tags)
         WHERE t.main_id > COALESCE(after_id, 0)
    ),
    matched_groups AS (
        SELECT main_id,
               ordinality,
               COUNT(DISTINCT tag)            AS matched_tag_count,
               array_length(required_tags, 1) AS required_tag_count,
               allowed_types
          FROM initial_matches
         GROUP BY main_id, ordinality, required_tag_count, allowed_types
    ),
    qualified_ids AS (
        SELECT main_id, allowed_types
          FROM matched_groups
         WHERE matched_tag_count = required_tag_count
    ),
    conflicts AS (
        SELECT e.id
          FROM dcb.events e
          JOIN qualified_ids q ON q.main_id = e.id
         WHERE e.id > COALESCE(after_id, 0)
           AND (array_length(q.allowed_types, 1) IS NULL
                OR array_length(q.allowed_types, 1) = 0
                OR e.type = ANY(q.allowed_types))
         LIMIT 1
    )
    SELECT EXISTS (SELECT 1 FROM conflicts)
      INTO conflict_exists;

    IF NOT conflict_exists THEN
        RETURN dcb.unconditional_append(new_events, conditional_append.idempotency_key, conditional_append.command_kind);
    END IF;

    RETURN NULL;
END;
$$;

-- ------------------------------------------------------------
-- 7. Access control
-- ------------------------------------------------------------

-- unconditional_append is an internal helper called only by conditional_append.
-- Revoke public access so external callers cannot bypass the EXCLUSIVE lock.
REVOKE ALL ON FUNCTION dcb.unconditional_append(dcb.dcb_event_tt[], TEXT, TEXT) FROM PUBLIC;
