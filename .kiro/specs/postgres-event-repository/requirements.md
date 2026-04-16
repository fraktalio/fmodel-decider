# Requirements Document

## Introduction

This feature introduces a `PostgresEventRepository` that implements the same
`IEventRepository<C, Ei, Eo, CM, EM>` interface as the existing
`DenoKvEventRepository`, but backed by PostgreSQL using the
`@bartlomieju/postgres` JSR client and a predefined SQL schema
(`dcb_schema.sql`). The repository provides event-sourced command processing
with optimistic locking, tag-based querying, bytea serialization, and both
single-command and batch-command execution — enabling the DCB and aggregate
patterns to run against a PostgreSQL database.

## Glossary

- **PostgresEventRepository**: The TypeScript class implementing
  `IEventRepository` using PostgreSQL as the event store via the
  `@bartlomieju/postgres` client and the `dcb` schema functions.
- **Client**: The PostgreSQL client instance from `@bartlomieju/postgres` used
  to execute SQL queries against the database.
- **IEventRepository**: The generic repository interface defined in
  `application.ts` providing `execute()`, `executeBatch()`, and `load()` methods
  for event-sourced command processing.
- **IEventLoader**: The read-only interface defined in `application.ts`
  providing `load()` for loading events by query tuples without the
  decide-persist cycle.
- **QueryTuple**: A tuple of the form `[...tags, eventType]` used to specify
  which events to load from the store.
- **EventMetadata**: The shared metadata type extracted to `infrastructure.ts`
  and reused by both repository implementations. Contains `eventId` (string
  representation of the bigserial `id` from `dcb.events`), `timestamp` (numeric
  Unix timestamp in milliseconds derived from the `created_at` column), and
  `versionstamp` (string representation of the bigserial `id`, serving as the
  version/position marker analogous to Deno KV's versionstamp).
- **Decider**: A pure functional component implementing
  `IEventComputation<C, Ei, Eo>` that computes new events from event history and
  a command.
- **conditional_append**: The PostgreSQL function
  `dcb.conditional_append(query_items, after_id, new_events)` that atomically
  checks for conflicts after a given event id and appends new events only if no
  conflicts exist.
- **unconditional_append**: The internal PostgreSQL function
  `dcb.unconditional_append(new_events)` that inserts events and their tags
  without conflict checking.
- **select_events_by_tags**: The PostgreSQL function
  `dcb.select_events_by_tags(query_items, after_id, limit_count)` that loads
  events matching DCB query items with tag-based filtering.
- **select_last_events_by_tags**: The PostgreSQL function
  `dcb.select_last_events_by_tags(query_items)` that returns the last event per
  query item group for idempotent loading.
- **select_max_id**: The PostgreSQL function `dcb.select_max_id()` that returns
  the maximum event id in the store.
- **dcb_event_tt**: The PostgreSQL composite type
  `(type text, data bytea, tags text[])` used to pass new events to append
  functions.
- **dcb_query_item_tt**: The PostgreSQL composite type
  `(types text[], tags text[])` used to pass query specifications to read and
  append functions.
- **Serializer**: A function that converts an event object into a `Uint8Array`
  (bytea) for storage in the `dcb.events.data` column.
- **Deserializer**: A function that converts a `Uint8Array` (bytea) from the
  `dcb.events.data` column back into a typed event object.
- **OptimisticLockingError**: An error thrown when `conditional_append` detects
  a conflict and the maximum retry count has been exhausted.
- **Tag**: A string in `"fieldName:fieldValue"` format extracted from event
  fields declared in `tagFields`.

## Requirements

### Requirement 1: Repository Construction

**User Story:** As a developer, I want to construct a `PostgresEventRepository`
with a Postgres client, query tuple function, and configuration options, so that
I can use it as a drop-in replacement for `DenoKvEventRepository`.

#### Acceptance Criteria

1. THE PostgresEventRepository SHALL accept a Client instance, a
   `getQueryTuples` function mapping commands to QueryTuple arrays, an optional
   `maxRetries` parameter (default 10), and an optional `idempotent` flag
   (default true) as constructor parameters.
2. THE PostgresEventRepository SHALL accept a Serializer function and a
   Deserializer function as constructor parameters for converting events to and
   from bytea representation.
3. THE PostgresEventRepository SHALL implement the
   `IEventRepository<C, Ei, Eo, Record<PropertyKey, never>, EventMetadata>`
   interface, reusing the `EventMetadata` type from `denoKvEventRepository.ts`.

### Requirement 2: Single Command Execution

**User Story:** As a developer, I want to execute a single command through the
repository, so that events are computed by the decider and persisted to
PostgreSQL with optimistic locking.

#### Acceptance Criteria

1. WHEN a command is executed, THE PostgresEventRepository SHALL load events
   matching the command's query tuples, pass the events and command to the
   decider's `computeNewEvents` method, and persist the resulting events using
   `dcb.conditional_append`.
2. WHEN the decider produces zero new events, THE PostgresEventRepository SHALL
   return an empty array without calling any append function.
3. WHEN `dcb.conditional_append` returns NULL (conflict detected), THE
   PostgresEventRepository SHALL retry the full load-decide-persist cycle.
4. WHEN the retry count exceeds `maxRetries`, THE PostgresEventRepository SHALL
   throw an OptimisticLockingError.
5. WHEN `dcb.conditional_append` returns a non-NULL `max_id`, THE
   PostgresEventRepository SHALL return the new events enriched with
   EventMetadata.
6. IF the decider throws a domain error during `computeNewEvents`, THEN THE
   PostgresEventRepository SHALL propagate the error immediately without
   attempting persistence or retry.

### Requirement 3: Batch Command Execution

**User Story:** As a developer, I want to execute multiple commands as a batch,
so that all resulting events are persisted in a single atomic
`conditional_append` call with accumulated event propagation between commands.

#### Acceptance Criteria

1. WHEN a batch of commands is executed, THE PostgresEventRepository SHALL load
   events using the first command's query tuples, then process each command
   sequentially, accumulating produced events.
2. WHEN processing subsequent commands in a batch, THE PostgresEventRepository
   SHALL filter accumulated events from prior commands through the current
   command's query tuples using `matchesQueryTuple`, and append matching events
   to the initially-loaded events before calling `computeNewEvents`.
3. WHEN all commands in the batch have been processed, THE
   PostgresEventRepository SHALL persist all accumulated events in a single
   `dcb.conditional_append` call.
4. WHEN `dcb.conditional_append` returns NULL for a batch, THE
   PostgresEventRepository SHALL retry the entire batch from the beginning.
5. WHEN an empty command array is provided, THE PostgresEventRepository SHALL
   return an empty array without executing any queries.
6. IF any decider throws a domain error during batch processing, THEN THE
   PostgresEventRepository SHALL propagate the error immediately without
   persisting any events from the batch.

### Requirement 4: Event Loading

**User Story:** As a developer, I want to load events by query tuples without
executing the decide-persist cycle, so that I can build read-side projections
and inspect event history.

#### Acceptance Criteria

1. THE PostgresEventRepository SHALL implement the `load` method from
   `IEventLoader<Ei>`.
2. WHILE the `idempotent` flag is true, THE PostgresEventRepository SHALL use
   `dcb.select_last_events_by_tags` to load at most one event per query tuple
   group.
3. WHILE the `idempotent` flag is false, THE PostgresEventRepository SHALL use
   `dcb.select_events_by_tags` to load all matching events.
4. WHEN loading events, THE PostgresEventRepository SHALL deserialize the `data`
   bytea column back into typed event objects using the Deserializer function.
5. WHEN loading events, THE PostgresEventRepository SHALL return events sorted
   in chronological order by their `id` (ascending).

### Requirement 5: Query Tuple to SQL Mapping

**User Story:** As a developer, I want query tuples in `[...tags, eventType]`
format to be correctly mapped to `dcb_query_item_tt` arrays, so that the
PostgreSQL functions receive properly structured query parameters.

#### Acceptance Criteria

1. WHEN a QueryTuple is mapped, THE PostgresEventRepository SHALL extract the
   last element as the event type and place it into the `types` text array of
   `dcb_query_item_tt`.
2. WHEN a QueryTuple is mapped, THE PostgresEventRepository SHALL extract all
   elements except the last as tags and place them into the `tags` text array of
   `dcb_query_item_tt`.
3. WHEN multiple QueryTuples are provided, THE PostgresEventRepository SHALL
   produce a `dcb_query_item_tt[]` array with one entry per tuple.

### Requirement 6: Event Serialization and Deserialization

**User Story:** As a developer, I want events to be serialized to bytea for
storage and deserialized back to typed objects on load, so that the repository
correctly round-trips event data through PostgreSQL.

#### Acceptance Criteria

1. WHEN persisting events, THE PostgresEventRepository SHALL call the Serializer
   function to convert each event object into a `Uint8Array` for the `data`
   column of `dcb_event_tt`.
2. WHEN loading events, THE PostgresEventRepository SHALL call the Deserializer
   function to convert each `data` bytea value back into a typed event object.
3. FOR ALL valid event objects, serializing then deserializing SHALL produce an
   object deeply equal to the original event (round-trip property).

### Requirement 7: Event Metadata

**User Story:** As a developer, I want persisted events to be enriched with
EventMetadata containing the database-assigned id, timestamp, and versionstamp,
so that I can track event identity and ordering consistently with the Deno KV
repository.

#### Acceptance Criteria

1. WHEN events are successfully persisted, THE PostgresEventRepository SHALL
   enrich each returned event with an `eventId` field containing the string
   representation of the `id` bigserial from `dcb.events`.
2. WHEN events are successfully persisted, THE PostgresEventRepository SHALL
   enrich each returned event with a `timestamp` field containing the numeric
   Unix timestamp in milliseconds derived from the `created_at` column.
3. WHEN events are successfully persisted, THE PostgresEventRepository SHALL
   enrich each returned event with a `versionstamp` field containing the string
   representation of the `id` bigserial from `dcb.events`.

### Requirement 8: Tag Extraction from Events

**User Story:** As a developer, I want the repository to extract tags from event
fields declared in `tagFields`, so that events are stored with proper tag arrays
for the PostgreSQL tag index.

#### Acceptance Criteria

1. WHEN persisting an event that declares `tagFields`, THE
   PostgresEventRepository SHALL extract each tag field value and format it as
   `"fieldName:fieldValue"` strings in the `tags` text array of `dcb_event_tt`.
2. WHEN an event does not declare `tagFields` or declares an empty array, THE
   PostgresEventRepository SHALL pass an empty `tags` array in the
   `dcb_event_tt`.
3. WHEN a tag field value is undefined, null, or an empty string, THE
   PostgresEventRepository SHALL skip that field and exclude it from the tags
   array.

### Requirement 9: Optimistic Locking via after_id

**User Story:** As a developer, I want the repository to use the `after_id`
pattern from `dcb.conditional_append` for optimistic locking, so that concurrent
modifications are detected and retried.

#### Acceptance Criteria

1. WHEN loading events for command execution, THE PostgresEventRepository SHALL
   record the `max_id` returned by the load query (or from
   `dcb.select_max_id()`) as the `after_id` for the subsequent
   `conditional_append` call.
2. WHEN `dcb.conditional_append` returns NULL, THE PostgresEventRepository SHALL
   interpret the result as a conflict and increment the retry counter.
3. WHEN `dcb.conditional_append` returns a non-NULL value, THE
   PostgresEventRepository SHALL interpret the result as a successful append.

### Requirement 10: Standalone Event Loader

**User Story:** As a developer, I want a standalone `PostgresEventLoader` class
implementing `IEventLoader<Ei>`, so that I can load events for read-side
projections via `EventSourcedQueryHandler` without the full repository.

#### Acceptance Criteria

1. THE PostgresEventLoader SHALL implement the `IEventLoader<Ei>` interface.
2. THE PostgresEventLoader SHALL accept a Client instance, a Deserializer
   function, and an optional `idempotent` flag (default true) as constructor
   parameters.
3. WHILE the `idempotent` flag is true, THE PostgresEventLoader SHALL use
   `dcb.select_last_events_by_tags` to load events.
4. WHILE the `idempotent` flag is false, THE PostgresEventLoader SHALL use
   `dcb.select_events_by_tags` to load all matching events.
5. WHEN loading events, THE PostgresEventLoader SHALL deserialize the `data`
   bytea column using the Deserializer function and return events sorted by `id`
   ascending.

### Requirement 11: Error Handling

**User Story:** As a developer, I want clear error handling for database
failures, so that I can distinguish between domain errors, optimistic locking
conflicts, and infrastructure failures.

#### Acceptance Criteria

1. IF a database query fails during event loading, THEN THE
   PostgresEventRepository SHALL throw a RepositoryError with operation set to
   "load" and the original error as the cause.
2. IF a database query fails during event persistence (excluding conflict
   detection), THEN THE PostgresEventRepository SHALL throw a RepositoryError
   with operation set to "persist" and the original error as the cause.
3. IF the decider throws an error, THEN THE PostgresEventRepository SHALL
   propagate the error directly without wrapping it in a RepositoryError.

### Requirement 12: Default JSON Serialization

**User Story:** As a developer, I want a default JSON-based serializer and
deserializer provided out of the box, so that I can use the repository without
implementing custom serialization.

#### Acceptance Criteria

1. THE PostgresEventRepository module SHALL export a default Serializer function
   that converts event objects to `Uint8Array` via `JSON.stringify` and
   `TextEncoder`.
2. THE PostgresEventRepository module SHALL export a default Deserializer
   function that converts `Uint8Array` back to event objects via `TextDecoder`
   and `JSON.parse`.
3. FOR ALL valid event objects containing JSON-serializable values, the default
   serializer followed by the default deserializer SHALL produce an object
   deeply equal to the original event (round-trip property).
