# Requirements Document

## Introduction

Extend the `demo/dcb/` directory to support PostgreSQL as an alternative event
store backend alongside the existing Deno KV implementation. This includes
testcontainers-based automatic PostgreSQL provisioning in tests, a first-class
SQL schema artifact defining the `dcb` schema, Postgres-backed repository
factories mirroring the existing Deno KV ones, parameterized tests that run the
same assertions against both backends, a Docker Compose file for
manual/production use, and updated documentation.

## Glossary

- **DCB_Demo**: The `demo/dcb/` directory containing Dynamic Consistency
  Boundary deciders, repositories, views, and tests for a restaurant/order
  domain.
- **Deno_KV_Repository**: The existing `DenoKvEventRepository` class that stores
  events in Deno KV with tuple-based queries and optimistic locking.
- **Postgres_Repository**: The existing `PostgresEventRepository` class that
  stores events in PostgreSQL via SQL functions in the `dcb` schema.
- **Postgres_Loader**: The existing `PostgresEventLoader` class that loads
  events from PostgreSQL via SQL functions in the `dcb` schema.
- **SQL_Schema**: The PostgreSQL DDL file (`dcb_schema.sql` at the project root)
  defining the `dcb` schema, tables (`dcb.events`, `dcb.event_tags`), custom
  types (`dcb.dcb_event_tt`, `dcb.dcb_query_item_tt`), indexes, and functions
  (`dcb.conditional_append`, `dcb.unconditional_append`,
  `dcb.select_events_by_tags`, `dcb.select_events_by_type`,
  `dcb.select_last_events_by_tags`, `dcb.select_max_id`), plus access control
  rules.
- **Docker_Compose_Setup**: A `docker-compose.yml` file that provisions a
  PostgreSQL container and initializes the SQL_Schema on startup, for manual use
  and documentation purposes.
- **Testcontainers**: The `npm:testcontainers` library
  (`@testcontainers/postgresql`) used to programmatically start a PostgreSQL
  container in tests, loading `dcb_schema.sql` from the project root for schema
  initialization.
- **Repository_Factory**: A function that accepts a backend connection (Deno KV
  instance or Postgres Client) and returns a typed repository instance for a
  specific decider use case.
- **DATABASE_URL**: An environment variable containing a PostgreSQL connection
  string; when set, Postgres tests connect to this external database instead of
  starting a testcontainer.
- **TESTCONTAINERS**: An environment variable flag; when set to `true`, Postgres
  tests use testcontainers to automatically provision a PostgreSQL instance with
  the DCB schema.
- **Test_Parameterization**: A pattern where the same test assertions run
  against multiple backend implementations by iterating over a list of
  repository factory functions.
- **EventSourcedCommandHandler**: The application-layer bridge that connects a
  decider with a repository to process commands.

## Requirements

### Requirement 1: SQL Schema Artifact

**User Story:** As a developer, I want a first-class SQL schema file that
defines the complete `dcb` PostgreSQL schema, so that the database structure is
documented, version-controlled, and usable for automated provisioning.

#### Acceptance Criteria

1. THE SQL_Schema SHALL reside at the path `dcb_schema.sql` in the project root.
2. THE SQL_Schema SHALL define a PostgreSQL schema named `dcb` containing the
   `dcb.events` table with columns for `id` (bigserial primary key), `type`
   (text, NOT NULL), `data` (bytea), `tags` (text[], NOT NULL), and `created_at`
   (timestamptz, NOT NULL, default `now()`).
3. THE SQL_Schema SHALL define the `dcb.event_tags` table with columns `tag`
   (text, NOT NULL) and `main_id` (bigint, NOT NULL, foreign key to
   `dcb.events.id`), with a composite primary key on `(tag, main_id)`.
4. THE SQL_Schema SHALL define the composite types `dcb.dcb_event_tt` (with
   fields `type text`, `data bytea`, `tags text[]`) and `dcb.dcb_query_item_tt`
   (with fields `types text[]`, `tags text[]`).
5. THE SQL_Schema SHALL define covering and composite indexes:
   `events_id_cover_type_idx` on `dcb.events(id) INCLUDE (type)` and
   `events_type_id_idx` on `dcb.events(type, id)`.
6. THE SQL_Schema SHALL define the read functions `dcb.select_max_id`,
   `dcb.select_events_by_type`, `dcb.select_events_by_tags`, and
   `dcb.select_last_events_by_tags`.
7. THE SQL_Schema SHALL define the append functions `dcb.unconditional_append`
   (internal helper) and `dcb.conditional_append` (with optimistic locking via
   table-level EXCLUSIVE lock and conflict detection).
8. THE SQL_Schema SHALL revoke public access on `dcb.unconditional_append` so
   external callers cannot bypass the EXCLUSIVE lock in
   `dcb.conditional_append`.

### Requirement 2: Docker Compose Setup

**User Story:** As a developer, I want a Docker Compose configuration that
starts a PostgreSQL instance and initializes the DCB schema, so that I can run a
Postgres instance manually for development or production use.

#### Acceptance Criteria

1. THE Docker_Compose_Setup SHALL define a PostgreSQL service using the
   `postgres:17` image with a health check that uses `pg_isready`.
2. THE Docker_Compose_Setup SHALL mount the SQL_Schema file (`dcb_schema.sql`
   from the project root) into the PostgreSQL container's
   `/docker-entrypoint-initdb.d/` directory so that the schema DDL is executed
   on container initialization.
3. THE Docker_Compose_Setup SHALL expose PostgreSQL on a configurable host port
   (default 5432) and set default credentials (`postgres`/`postgres`) and
   database name (`fmodel`).
4. THE Docker_Compose_Setup SHALL reside at the path `docker-compose.yml` in the
   project root.

### Requirement 3: Postgres Repository Factories

**User Story:** As a developer, I want Postgres-backed repository factory
functions for each DCB decider use case, so that I can swap the storage backend
from Deno KV to PostgreSQL without changing decider or application logic.

#### Acceptance Criteria

1. WHEN a Postgres Client is provided, THE DCB_Demo SHALL expose a
   `createRestaurantPostgresRepository` factory that returns a
   `PostgresEventRepository` typed for `CreateRestaurantCommand`,
   `RestaurantCreatedEvent` input, and `RestaurantCreatedEvent` output, using
   the same query tuple pattern as the Deno KV equivalent.
2. WHEN a Postgres Client is provided, THE DCB_Demo SHALL expose a
   `changeRestaurantMenuPostgresRepository` factory that returns a
   `PostgresEventRepository` typed for `ChangeRestaurantMenuCommand`,
   `RestaurantCreatedEvent` input, and `RestaurantMenuChangedEvent` output,
   using the same query tuple pattern as the Deno KV equivalent.
3. WHEN a Postgres Client is provided, THE DCB_Demo SHALL expose a
   `placeOrderPostgresRepository` factory that returns a
   `PostgresEventRepository` typed for `PlaceOrderCommand`,
   `RestaurantCreatedEvent | RestaurantMenuChangedEvent | RestaurantOrderPlacedEvent`
   input, and `RestaurantOrderPlacedEvent` output, using the same query tuple
   pattern as the Deno KV equivalent.
4. WHEN a Postgres Client is provided, THE DCB_Demo SHALL expose a
   `markOrderAsPreparedPostgresRepository` factory that returns a
   `PostgresEventRepository` typed for `MarkOrderAsPreparedCommand`,
   `RestaurantOrderPlacedEvent | OrderPreparedEvent` input, and
   `OrderPreparedEvent` output, using the same query tuple pattern as the Deno
   KV equivalent.
5. THE Postgres repository factories SHALL follow the same one-file-per-slice
   pattern as the Deno KV repositories, with each factory in its own file (e.g.,
   `demo/dcb/createRestaurantPostgresRepository.ts`,
   `demo/dcb/changeRestaurantMenuPostgresRepository.ts`,
   `demo/dcb/placeOrderPostgresRepository.ts`,
   `demo/dcb/markOrderAsPreparedPostgresRepository.ts`).

### Requirement 4: Parameterized Repository Tests

**User Story:** As a developer, I want the existing DCB repository integration
tests to run against both Deno KV and PostgreSQL backends using the same
assertions, so that I can verify both implementations produce identical domain
behavior.

#### Acceptance Criteria

1. THE DCB_Demo test suite SHALL always run all repository tests against the
   Deno KV backend.
2. WHEN TESTCONTAINERS is set to `true`, THE DCB_Demo test suite SHALL use
   testcontainers to start a PostgreSQL container with the `dcb_schema.sql`
   schema and run all repository tests against the PostgreSQL backend in
   addition to Deno KV.
3. WHEN DATABASE_URL is set, THE DCB_Demo test suite SHALL connect to the
   specified PostgreSQL instance and run all repository tests against the
   PostgreSQL backend in addition to Deno KV.
4. THE parameterized tests SHALL use the same command inputs, the same decider
   instances, and the same assertion logic for both backends.
5. THE parameterized tests SHALL verify domain behavior (event kinds, event
   field values, domain error types) without asserting on backend-specific
   metadata (Deno KV versionstamps, Deno KV index keys, PostgreSQL row IDs).
6. WHEN using testcontainers, THE test setup SHALL start a fresh PostgreSQL
   container per test file with `dcb_schema.sql` pre-loaded, providing true
   slice isolation with a clean schema — no per-test truncation needed.
7. WHEN all Postgres tests complete, THE test teardown SHALL close the Postgres
   client connection and stop the testcontainer (if applicable).

### Requirement 5: Postgres-Gated Test Execution

**User Story:** As a developer, I want Postgres tests to be gated behind
environment variables, so that `deno test --unstable-kv` continues to work
without Docker or a running PostgreSQL instance.

#### Acceptance Criteria

1. WHEN neither TESTCONTAINERS nor DATABASE_URL is set, THE DCB_Demo test runner
   SHALL run only Deno KV-backed test cases without failure.
2. WHEN TESTCONTAINERS is set to `true`, THE DCB_Demo test runner SHALL use
   `@testcontainers/postgresql` to start a PostgreSQL container, copy
   `dcb_schema.sql` from the project root into the container for schema
   initialization, and execute PostgreSQL-backed test cases.
3. WHEN DATABASE_URL is set to a valid PostgreSQL connection string, THE
   DCB_Demo test runner SHALL connect to that database and execute
   PostgreSQL-backed test cases without starting a testcontainer.
4. IF TESTCONTAINERS is set but Docker is unavailable, THEN THE DCB_Demo test
   runner SHALL report a container startup error for the PostgreSQL test cases
   only, without affecting Deno KV test results.

### Requirement 6: Parameterized View Event Loader Tests

**User Story:** As a developer, I want the existing DCB view event loader tests
to run against both Deno KV and PostgreSQL backends, so that I can verify
projections work identically regardless of the storage backend.

#### Acceptance Criteria

1. WHEN TESTCONTAINERS or DATABASE_URL is set, THE DCB_Demo test suite SHALL run
   view event loader tests (restaurant view, order view) against both the Deno
   KV `DenoKvEventLoader` and the PostgreSQL `PostgresEventLoader`.
2. WHEN neither TESTCONTAINERS nor DATABASE_URL is set, THE DCB_Demo test suite
   SHALL run view event loader tests against the Deno KV `DenoKvEventLoader`
   only.
3. THE parameterized view tests SHALL use the same event inputs, the same view
   instances, and the same assertion logic for both backends.

### Requirement 7: README Documentation Update

**User Story:** As a developer, I want the README to document that the project
supports both Deno KV and PostgreSQL backends, including Docker Compose setup
instructions, so that new contributors can set up and run the full test suite.

#### Acceptance Criteria

1. THE README SHALL document that the DCB demo supports both Deno KV and
   PostgreSQL backends.
2. THE README SHALL document the `dcb_schema.sql` file as the first-class
   PostgreSQL schema artifact.
3. THE README SHALL include instructions for running tests with testcontainers
   (`TESTCONTAINERS=true deno test -A --unstable-kv demo/dcb/`).
4. THE README SHALL include instructions for running tests against an external
   Postgres instance via Docker Compose (`docker compose up -d` followed by
   `DATABASE_URL=postgres://postgres:postgres@localhost:5432/fmodel deno test --unstable-kv demo/dcb/`).
5. THE README SHALL document that running `deno test --unstable-kv` without
   TESTCONTAINERS or DATABASE_URL executes only the Deno KV tests.
