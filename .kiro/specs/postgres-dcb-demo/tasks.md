# Implementation Plan: Postgres DCB Demo

## Overview

Extend `demo/dcb/` to support PostgreSQL as an alternative event store backend.
The SQL schema (`dcb_schema.sql`) and core Postgres repository/loader classes
(`postgresEventRepository.ts`) already exist. This plan creates Docker Compose
configuration, Postgres-backed repository factories, a testcontainers helper,
separate Postgres-specific test files that mirror the existing Deno KV test
structure, and README updates. The existing Deno KV tests remain completely
untouched.

## Tasks

-
  1. [x] Create Docker Compose configuration
  - [x] 1.1 Create `docker-compose.yml` at the project root
    - Define a `postgres` service using `postgres:17` image
    - Set environment variables: `POSTGRES_USER=postgres`,
      `POSTGRES_PASSWORD=postgres`, `POSTGRES_DB=fmodel`
    - Expose port `${POSTGRES_PORT:-5432}:5432`
    - Mount `./dcb_schema.sql` to
      `/docker-entrypoint-initdb.d/01-dcb-schema.sql`
    - Add health check using `pg_isready -U postgres`
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

-
  2. [x] Create Postgres repository factories (one file per slice)
  - [x] 2.1 Create `demo/dcb/createRestaurantPostgresRepository.ts`
    - Import `PostgresEventRepository` from `../../postgresEventRepository.ts`
    - Accept a `Client` from `@bartlomieju/postgres`
    - Use the same query tuple pattern as `createRestaurantRepository.ts`:
      `[["restaurantId:" + cmd.restaurantId, "RestaurantCreatedEvent"]]`
    - Type:
      `PostgresEventRepository<CreateRestaurantCommand, RestaurantCreatedEvent, RestaurantCreatedEvent>`
    - _Requirements: 3.1, 3.5_

  - [x] 2.2 Create `demo/dcb/changeRestaurantMenuPostgresRepository.ts`
    - Same pattern as above, mirroring `changeRestaurantMenuRepository.ts`
    - Query tuple:
      `[["restaurantId:" + cmd.restaurantId, "RestaurantCreatedEvent"]]`
    - Type:
      `PostgresEventRepository<ChangeRestaurantMenuCommand, RestaurantCreatedEvent, RestaurantMenuChangedEvent>`
    - _Requirements: 3.2, 3.5_

  - [x] 2.3 Create `demo/dcb/placeOrderPostgresRepository.ts`
    - Same pattern, mirroring `placeOrderRepository.ts`
    - Query tuples: restaurant created, menu changed, and order placed (by
      orderId)
    - Type:
      `PostgresEventRepository<PlaceOrderCommand, RestaurantCreatedEvent | RestaurantMenuChangedEvent | RestaurantOrderPlacedEvent, RestaurantOrderPlacedEvent>`
    - _Requirements: 3.3, 3.5_

  - [x] 2.4 Create `demo/dcb/markOrderAsPreparedPostgresRepository.ts`
    - Same pattern, mirroring `markOrderAsPreparedRepository.ts`
    - Query tuples: order placed and order prepared (by orderId)
    - Type:
      `PostgresEventRepository<MarkOrderAsPreparedCommand, RestaurantOrderPlacedEvent | OrderPreparedEvent, OrderPreparedEvent>`
    - _Requirements: 3.4, 3.5_

-
  3. [x] Checkpoint - Verify factories compile
  - Run
    `deno check demo/dcb/createRestaurantPostgresRepository.ts demo/dcb/changeRestaurantMenuPostgresRepository.ts demo/dcb/placeOrderPostgresRepository.ts demo/dcb/markOrderAsPreparedPostgresRepository.ts`
    to verify compilation
  - Ensure all tests pass, ask the user if questions arise.

-
  4. [x] Create testcontainers helper module
  - [x] 4.1 Create `demo/dcb/testcontainers.ts`
    - Import `PostgreSqlContainer` from `npm:@testcontainers/postgresql`
    - Import `Client` from `@bartlomieju/postgres`
    - Implement `startPostgresContainer()` that starts a `postgres:17` container
      with `dcb_schema.sql` copied to
      `/docker-entrypoint-initdb.d/01-dcb-schema.sql`
    - Implement `createPostgresClient(connectionString)` that creates and
      connects a `Client`
    - No truncation helper needed — each test file gets a fresh container with a
      clean schema (true slice isolation)
    - _Requirements: 4.2, 4.7, 5.2_

-
  5. [ ] Revert Deno KV tests and create separate Postgres repository tests
  - [ ] 5.1 Revert `demo/dcb/createRestaurantRepository_test.ts` to original
        Deno KV-only state
    - Remove the parameterized Group 2 Postgres tests that were added
    - Restore the file to its original structure with only Deno KV tests
    - _Requirements: 4.1, 5.1_

  - [ ] 5.2 Revert `demo/dcb/changeRestaurantMenuRepository_test.ts` to original
        Deno KV-only state
    - Remove the parameterized Group 2 Postgres tests that were added
    - Restore the file to its original structure with only Deno KV tests
    - _Requirements: 4.1, 5.1_

  - [ ] 5.3 Revert `demo/dcb/placeOrderRepository_test.ts` to original Deno
        KV-only state
    - Remove the parameterized Group 2 Postgres tests that were added
    - Restore the file to its original structure with only Deno KV tests
    - _Requirements: 4.1, 5.1_

  - [ ] 5.4 Revert `demo/dcb/markOrderAsPreparedRepository_test.ts` to original
        Deno KV-only state
    - Remove the parameterized Group 2 Postgres tests that were added
    - Restore the file to its original structure with only Deno KV tests
    - _Requirements: 4.1, 5.1_

  - [ ] 5.5 Revert `demo/dcb/all_deciderRepository_test.ts` to original Deno
        KV-only state
    - Remove the parameterized Group 2 Postgres tests that were added
    - Restore the file to its original structure with only Deno KV tests
    - _Requirements: 4.1, 5.1_

  - [ ] 5.6 Create `demo/dcb/createRestaurantPostgresRepository_test.ts`
    - Test create restaurant happy path and duplicate rejection against Postgres
    - Gate entire file behind `TESTCONTAINERS=true` or `DATABASE_URL`
    - Use testcontainers for automatic PostgreSQL provisioning with
      `dcb_schema.sql`
    - Assert domain behavior only (event kinds, field values, error types)
    - _Requirements: 4.2, 4.3, 4.5, 4.7, 5.2, 5.3, 5.4_

  - [ ] 5.7 Create `demo/dcb/changeRestaurantMenuPostgresRepository_test.ts`
    - Test menu change happy path, restaurant not found, and sequential updates
      against Postgres
    - Gate entire file behind `TESTCONTAINERS=true` or `DATABASE_URL`
    - Use testcontainers for automatic PostgreSQL provisioning with
      `dcb_schema.sql`
    - Assert domain behavior only (event kinds, field values, error types)
    - _Requirements: 4.2, 4.3, 4.5, 4.7, 5.2, 5.3, 5.4_

  - [ ] 5.8 Create `demo/dcb/placeOrderPostgresRepository_test.ts`
    - Test order placement happy path, restaurant not found, invalid items,
      duplicate order, and menu change against Postgres
    - Gate entire file behind `TESTCONTAINERS=true` or `DATABASE_URL`
    - Use testcontainers for automatic PostgreSQL provisioning with
      `dcb_schema.sql`
    - Assert domain behavior only (event kinds, field values, error types)
    - _Requirements: 4.2, 4.3, 4.5, 4.7, 5.2, 5.3, 5.4_

  - [ ] 5.9 Create `demo/dcb/markOrderAsPreparedPostgresRepository_test.ts`
    - Test mark prepared happy path, order not found, and already prepared
      against Postgres
    - Gate entire file behind `TESTCONTAINERS=true` or `DATABASE_URL`
    - Use testcontainers for automatic PostgreSQL provisioning with
      `dcb_schema.sql`
    - Assert domain behavior only (event kinds, field values, error types)
    - _Requirements: 4.2, 4.3, 4.5, 4.7, 5.2, 5.3, 5.4_

  - [ ] 5.10 Create `demo/dcb/all_deciderPostgresRepository_test.ts`
    - Test combined repository happy path, error cases, and batch execution
      against Postgres
    - Gate entire file behind `TESTCONTAINERS=true` or `DATABASE_URL`
    - Use testcontainers for automatic PostgreSQL provisioning with
      `dcb_schema.sql`
    - Assert domain behavior only (event kinds, field values, error types)
    - _Requirements: 4.2, 4.3, 4.5, 4.7, 5.2, 5.3, 5.4_

-
  6. [x] Checkpoint - Verify Deno KV tests still pass
  - Run `deno test --unstable-kv demo/dcb/` to ensure all existing Deno KV tests
    pass after reverting
  - Ensure all tests pass, ask the user if questions arise.

-
  7. [ ] Create separate Postgres view event loader tests
  - [ ] 7.1 Create `demo/dcb/restaurantViewPostgresEventLoader_test.ts`
    - Test restaurant view projection from events using `PostgresEventLoader`
    - Persist events via Postgres repository, then load and project via
      `PostgresEventLoader`
    - Gate entire file behind `TESTCONTAINERS=true` or `DATABASE_URL`
    - Assert domain behavior only — same view assertions as the Deno KV event
      loader tests
    - _Requirements: 6.1, 6.2, 6.3_

  - [ ] 7.2 Create `demo/dcb/orderViewPostgresEventLoader_test.ts`
    - Test order view projection from events using `PostgresEventLoader`
    - Persist events via Postgres repository, then load and project via
      `PostgresEventLoader`
    - Gate entire file behind `TESTCONTAINERS=true` or `DATABASE_URL`
    - Assert domain behavior only — same view assertions as the Deno KV event
      loader tests
    - _Requirements: 6.1, 6.2, 6.3_

-
  8. [ ] Checkpoint - Verify all tests pass
  - Run `deno test --unstable-kv demo/dcb/` to ensure all Deno KV tests pass
  - Run `TESTCONTAINERS=true deno test -A --unstable-kv demo/dcb/` to verify
    Postgres tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ]* 9. Write property test for backend equivalence (command execution)
  - **Property 1: Repository backend equivalence for command execution**
  - Generate random valid command sequences (create restaurant, change menu,
    place order, mark as prepared) using `fast-check`
  - Execute each sequence against both Deno KV and Postgres backends via
    `EventSourcedCommandHandler`
  - Assert that produced events have identical `kind` values and identical
    domain field values (excluding `eventId`, `timestamp`, `versionstamp`)
  - Minimum 100 iterations
  - Tag:
    `Feature: postgres-dcb-demo, Property 1: Repository backend equivalence for command execution`
  - **Validates: Requirements 4.4**

- [ ]* 10. Write property test for backend equivalence (view projection)
  - **Property 2: Event loader backend equivalence for view projection**
  - Generate random valid event sequences, persist via both backends
  - Load events via `DenoKvEventLoader` and `PostgresEventLoader` with the same
    query tuples
  - Fold through the same view and assert identical projected state
  - Minimum 100 iterations
  - Tag:
    `Feature: postgres-dcb-demo, Property 2: Event loader backend equivalence for view projection`
  - **Validates: Requirements 6.3**

-
  11. [ ] Update README documentation
  - [ ] 11.1 Update `README.md`
    - Document that the DCB demo supports both Deno KV and PostgreSQL backends
    - Document `dcb_schema.sql` as the first-class PostgreSQL schema artifact
    - Add instructions for running tests with testcontainers:
      `TESTCONTAINERS=true deno test -A --unstable-kv demo/dcb/`
    - Add instructions for running tests via Docker Compose:
      `docker compose up -d` then
      `DATABASE_URL=postgres://postgres:postgres@localhost:5432/fmodel deno test --unstable-kv demo/dcb/`
    - Document that `deno test --unstable-kv` without env vars runs only Deno KV
      tests
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

-
  12. [ ] Final checkpoint - Ensure all tests pass
  - Run `deno test --unstable-kv demo/dcb/` to verify all Deno KV tests pass
  - Run `TESTCONTAINERS=true deno test -A --unstable-kv demo/dcb/` to verify all
    Postgres tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Requirement 1 (SQL Schema Artifact) is already complete — `dcb_schema.sql`
  exists at the project root
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate the two correctness properties from the design
  document
- Separate Postgres test files assert on domain behavior only (event kinds,
  field values, error types) — not backend-specific metadata
- Existing Deno KV tests remain completely untouched after the revert (tasks
  5.1–5.5)
- Deno KV-specific infrastructure tests (index keys, versionstamps) remain in
  the original test files as Deno KV-only tests
- Testcontainers integration requires Docker daemon; when unavailable, only
  Postgres tests are skipped
- Each Postgres test file is gated behind `TESTCONTAINERS=true` or
  `DATABASE_URL` — the entire file skips when neither is set
