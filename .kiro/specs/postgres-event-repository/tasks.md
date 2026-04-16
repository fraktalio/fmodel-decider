# Implementation Plan: postgres-event-repository

## Overview

Implement a `PostgresEventRepository` and `PostgresEventLoader` backed by
PostgreSQL, mirroring the `DenoKvEventRepository` API. The plan starts by
extracting shared types into `infrastructure.ts`, then adds the Postgres
dependency, implements the repository and loader, adds property-based and unit
tests, and wires everything into `mod.ts`.

## Tasks

-
  1. [x] Extract shared types to `infrastructure.ts`
  - [x] 1.1 Create `infrastructure.ts` at the project root
    - Move `EventMetadata`, `RepositoryError`, `OptimisticLockingError`,
      `matchesQueryTuple`, `Tag`, `StringFields`, `TypeSafeEventShape` from
      `denoKvEventRepository.ts` into `infrastructure.ts`
    - Include necessary imports from `application.ts` (`EventShape`,
      `QueryTuple`, `CommandShape`)
    - _Requirements: 1.3, 5.1, 5.2, 8.1_

  - [x] 1.2 Update `denoKvEventRepository.ts` to import from `infrastructure.ts`
        and re-export
    - Replace local definitions with imports from `infrastructure.ts`
    - Add re-exports of all moved types for backward compatibility
    - _Requirements: 1.3_

  - [x] 1.3 Update `mod.ts` exports
    - Add `export * from "./infrastructure.ts";` to `mod.ts`
    - Ensure no duplicate exports conflict with `denoKvEventRepository.ts`
      re-exports
    - _Requirements: 1.3_

  - [x] 1.4 Update `demo/dcb/api.ts` import path
    - Change `TypeSafeEventShape` import from `denoKvEventRepository.ts` to
      `infrastructure.ts`
    - _Requirements: 1.3_

-
  2. [x] Checkpoint - Verify extraction
  - Run `deno test --unstable-kv` to ensure all existing tests still pass after
    the refactoring
  - Ensure all tests pass, ask the user if questions arise.

-
  3. [x] Add `@bartlomieju/postgres` dependency
  - [x] 3.1 Add the dependency to `deno.json`
    - Add `"@bartlomieju/postgres": "jsr:@bartlomieju/postgres@^0"` to the
      `imports` map in `deno.json`
    - Add `"fast-check": "npm:fast-check"` to the `imports` map for
      property-based testing
    - _Requirements: 1.1_

-
  4. [x] Implement `postgresEventRepository.ts`
  - [x] 4.1 Define `Serializer`, `Deserializer` types and default
        implementations
    - Export `Serializer<E>` and `Deserializer<E>` type aliases
    - Export `defaultSerializer` and `defaultDeserializer` using
      `TextEncoder`/`TextDecoder` and `JSON.stringify`/`JSON.parse`
    - _Requirements: 6.1, 6.2, 12.1, 12.2_

  - [x] 4.2 Implement internal helper functions
    - `mapQueryTuplesToSql<Ei>` — converts `QueryTuple[]` to
      `dcb_query_item_tt[]` SQL literal (last element → `types`, rest → `tags`)
    - `extractTags<Eo>` — extracts `"fieldName:fieldValue"` tags from event
      `tagFields`, skipping undefined/null/empty
    - `buildEventTuples<Eo>` — converts output events to `dcb_event_tt[]` SQL
      literal using serializer and `extractTags`
    - _Requirements: 5.1, 5.2, 5.3, 8.1, 8.2, 8.3_

  - [x] 4.3 Implement `PostgresEventRepository` class
    - Constructor accepting `Client`, `getQueryTuples`, `maxRetries` (default
      10), `idempotent` (default true), `serializer`, `deserializer`
    - Implement
      `IEventRepository<C, Ei, Eo, Record<PropertyKey, never>, EventMetadata>`
    - `load()` — calls `select_last_events_by_tags` (idempotent) or
      `select_events_by_tags` (full-replay), deserializes `data` bytea, returns
      events sorted by `id` ascending
    - `execute()` — load → `computeNewEvents` → `conditional_append` with retry
      loop, enrich returned events with `EventMetadata` (`eventId`, `timestamp`,
      `versionstamp` from `id`/`created_at`), return empty array when decider
      produces zero events
    - `executeBatch()` — load using first command's tuples, process commands
      sequentially with `matchesQueryTuple` filtering of accumulated events,
      single `conditional_append` for all events, retry entire batch on NULL,
      return empty array for empty commands array
    - Wrap database errors in `RepositoryError` (operation `"load"` or
      `"persist"`), propagate domain errors directly, throw
      `OptimisticLockingError` after `maxRetries`
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3,
      3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 4.4, 4.5, 7.1, 7.2, 7.3, 9.1, 9.2, 9.3,
      11.1, 11.2, 11.3_

  - [x] 4.4 Implement `PostgresEventLoader` class
    - Constructor accepting `Client`, `deserializer` (default
      `defaultDeserializer`), `idempotent` (default true)
    - Implement `IEventLoader<Ei>`
    - `load()` — same query logic as repository's load, using
      `select_last_events_by_tags` or `select_events_by_tags`
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

-
  5. [x] Checkpoint - Verify compilation
  - Run `deno check postgresEventRepository.ts` to verify the new module
    compiles without errors
  - Ensure all tests pass, ask the user if questions arise.

-
  6. [ ] Write property-based tests for pure functions
  - [ ]* 6.1 Write property test for QueryTuple to `dcb_query_item_tt` mapping
    - **Property 1: QueryTuple to dcb_query_item_tt mapping preserves
      structure**
    - Generate random QueryTuples with 1–5 elements, verify mapping produces
      same-length array where each entry's `types` contains exactly the last
      element and `tags` contains all preceding elements in order
    - Use `fast-check` with minimum 100 iterations
    - Tag:
      `Feature: postgres-event-repository, Property 1: QueryTuple to dcb_query_item_tt mapping preserves structure`
    - **Validates: Requirements 5.1, 5.2, 5.3**

  - [ ]* 6.2 Write property test for default JSON serialization round-trip
    - **Property 2: Default JSON serialization round-trip**
    - Generate random JSON-serializable objects with a `kind` string field,
      verify `defaultDeserializer(defaultSerializer(obj))` deeply equals the
      original
    - Use `fast-check` with minimum 100 iterations
    - Tag:
      `Feature: postgres-event-repository, Property 2: Default JSON serialization round-trip`
    - **Validates: Requirements 6.3, 12.3**

  - [ ]* 6.3 Write property test for tag extraction
    - **Property 3: Tag extraction produces correct "fieldName:fieldValue"
      format**
    - Generate random events with `tagFields` arrays (including edge cases:
      missing fields, null, empty string), verify output format and exclusion
      rules
    - Use `fast-check` with minimum 100 iterations
    - Tag:
      `Feature: postgres-event-repository, Property 3: Tag extraction produces correct fieldName:fieldValue format`
    - **Validates: Requirements 8.1, 8.2, 8.3**

-
  7. [ ] Write unit tests for specific scenarios
  - [ ]* 7.1 Write unit tests for `postgresEventRepository.ts`
    - Test `defaultSerializer`/`defaultDeserializer` with known inputs
    - Test `mapQueryTuplesToSql` with specific query tuples (no tags, single
      tag, multiple tags)
    - Test `extractTags` with events that have tagFields, empty tagFields, and
      missing/null/empty field values
    - Test `buildEventTuples` with known events and verify SQL literal output
    - _Requirements: 5.1, 5.2, 5.3, 6.1, 6.2, 8.1, 8.2, 8.3, 12.1, 12.2_

-
  8. [x] Update `mod.ts` to export the new module
  - [x] 8.1 Add `postgresEventRepository.ts` export to `mod.ts`
    - Add `export * from "./postgresEventRepository.ts";`
    - _Requirements: 1.3, 12.1, 12.2_

-
  9. [x] Final checkpoint - Ensure all tests pass
  - Run `deno test --unstable-kv` to verify all existing and new tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design
  document
- Unit tests validate specific examples and edge cases
- Integration tests (requiring a running PostgreSQL instance with dcb schema)
  are not included as coding tasks since they require external infrastructure;
  they should be added once a test database is available
- The `extractTags` and `mapQueryTuplesToSql` helpers must be exported (or
  test-accessible) to enable property-based testing
