-- ============================================================
-- Dynamic Consistency Boundary (DCB) – PostgreSQL Implementation
-- ============================================================

-- ------------------------------------------------------------
-- 1. Composite types
-- ------------------------------------------------------------

CREATE TYPE dcb_event_tt AS (
    type text,
    data bytea,
    tags text[]
);

CREATE TYPE dcb_query_item_tt AS (
    types text[],
    tags  text[]
);

-- ------------------------------------------------------------
-- 2. Tables
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS events (
    id              bigserial    PRIMARY KEY,
    type            text         NOT NULL,
    data            bytea,
    tags            text[]       NOT NULL,
    idempotency_key text         NOT NULL,
    created_at      timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
    idempotency_key text        PRIMARY KEY,
    command_kind    text        NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 3. Indexes
-- ------------------------------------------------------------

-- Covering index: id lookups that also need type (used by filtered_ids joins)
CREATE UNIQUE INDEX IF NOT EXISTS events_id_cover_type_idx
    ON events (id) INCLUDE (type);

-- Composite index: type-filtered range scans (select_events_by_type, poll_partition)
CREATE INDEX IF NOT EXISTS events_type_id_idx
    ON events (type, id);

-- Regular index for idempotency key lookups (NOT unique — multiple events share one key)
CREATE INDEX IF NOT EXISTS idx_events_idempotency_key
    ON events (idempotency_key);

-- GIN index on tags for `tags @> qi.tags` containment lookups (select/conditional_append)
CREATE INDEX IF NOT EXISTS events_tags_gin_idx
    ON events USING GIN (tags);

-- ------------------------------------------------------------
-- 4. Read functions
-- ------------------------------------------------------------

-- 4.1 Select max event id
CREATE OR REPLACE FUNCTION select_max_id()
RETURNS bigint
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
    SELECT MAX(id) FROM events;
$$;

-- 4.2 Select events by type
CREATE OR REPLACE FUNCTION select_events_by_type(
    event_type  text,
    after_id    bigint DEFAULT 0,
    limit_count bigint DEFAULT 9223372036854775807
)
RETURNS SETOF events
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
    SELECT *
      FROM events
     WHERE type = event_type
       AND id > COALESCE(after_id, 0)
     ORDER BY id ASC
     LIMIT COALESCE(limit_count, 9223372036854775807);
$$;

-- 4.3 Select events by DCB query (tag containment, GIN-index-friendly)
--
-- An event matches a query item when its tags are a superset of the query
-- item's tags (`e.tags @> qi.tags`) and, if the query item restricts types,
-- the event's type is one of them.
CREATE OR REPLACE FUNCTION select_events_by_tags(
    query_items dcb_query_item_tt[],
    after_id    bigint DEFAULT 0,
    limit_count bigint DEFAULT 9223372036854775807
)
RETURNS SETOF events
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
    SELECT e.*
      FROM events e
     WHERE e.id > COALESCE(after_id, 0)
       AND EXISTS (
           SELECT 1
             FROM unnest(query_items) qi
            WHERE e.tags @> qi.tags
              AND (array_length(qi.types, 1) IS NULL
                   OR array_length(qi.types, 1) = 0
                   OR e.type = ANY(qi.types))
       )
     ORDER BY e.id ASC
     LIMIT COALESCE(limit_count, 9223372036854775807);
$$;

-- 4.4 Select last event per query item group (for last_event_only mode)
--
-- Same `events.tags @> qi.tags` containment check as 4.3, `DISTINCT ON` per
-- query-item group (`ordinality`) to keep only the newest matching event in
-- each group.
CREATE OR REPLACE FUNCTION select_last_events_by_tags(
    query_items dcb_query_item_tt[]
)
RETURNS SETOF events
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
    WITH query_items_cte AS (
        SELECT * FROM unnest(query_items) WITH ORDINALITY
    ),
    last_ids AS (
        SELECT DISTINCT ON (qi.ordinality) e.id
          FROM query_items_cte qi
          JOIN events e ON e.tags @> qi.tags
         WHERE array_length(qi.types, 1) IS NULL
            OR array_length(qi.types, 1) = 0
            OR e.type = ANY(qi.types)
         ORDER BY qi.ordinality, e.id DESC
    )
    SELECT *
      FROM events
     WHERE id IN (SELECT id FROM last_ids)
     ORDER BY id ASC;
$$;

-- ------------------------------------------------------------
-- 5. Append functions
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION unconditional_append(
    new_events      dcb_event_tt[],
    idempotency_key TEXT,
    command_kind    TEXT
)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
    max_id       bigint;
    event_record dcb_event_tt;
    inserted_id  bigint;
BEGIN
    -- Insert into idempotency_keys table (PK rejects duplicates)
    INSERT INTO idempotency_keys (idempotency_key, command_kind)
    VALUES (unconditional_append.idempotency_key, unconditional_append.command_kind);

    max_id := 0;

    FOREACH event_record IN ARRAY new_events
    LOOP
        INSERT INTO events (type, data, tags, idempotency_key)
        VALUES (event_record.type, event_record.data, event_record.tags, unconditional_append.idempotency_key)
        RETURNING id INTO inserted_id;

        max_id := GREATEST(max_id, inserted_id);
    END LOOP;

    RETURN max_id;
END;
$$;

CREATE OR REPLACE FUNCTION conditional_append(
    query_items     dcb_query_item_tt[],
    after_id        bigint,
    new_events      dcb_event_tt[],
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
    LOCK TABLE events IN EXCLUSIVE MODE;

    SELECT EXISTS (
        SELECT 1
          FROM events e
         WHERE e.id > COALESCE(after_id, 0)
           AND EXISTS (
               SELECT 1
                 FROM unnest(query_items) qi
                WHERE e.tags @> qi.tags
                  AND (array_length(qi.types, 1) IS NULL
                       OR array_length(qi.types, 1) = 0
                       OR e.type = ANY(qi.types))
           )
    )
    INTO conflict_exists;

    IF NOT conflict_exists THEN
        RETURN unconditional_append(new_events, conditional_append.idempotency_key, conditional_append.command_kind);
    END IF;

    RETURN NULL;
END;
$$;

-- ------------------------------------------------------------
-- 6. Access control
-- ------------------------------------------------------------

-- unconditional_append is an internal helper called only by conditional_append.
-- Revoke public access so external callers cannot bypass the EXCLUSIVE lock.
REVOKE ALL ON FUNCTION unconditional_append(dcb_event_tt[], TEXT, TEXT) FROM PUBLIC;
