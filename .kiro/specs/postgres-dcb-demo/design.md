# Design Document: Postgres DCB Demo

## Overview

This design extends the `demo/dcb/` directory to support PostgreSQL as an
alternative event store backend alongside the existing Deno KV implementation.
The approach leverages the existing `PostgresEventRepository` and
`PostgresEventLoader` classes (from `postgresEventRepository.ts`) and the
existing SQL schema (`dcb_schema.sql`) — no new infrastructure code is needed.
The work consists of:

1. Testcontainers integration for automatic PostgreSQL provisioning in tests
2. A `docker-compose.yml` for manual Postgres provisioning and documentation
3. Postgres-backed repository factory functions mirroring the Deno KV ones
4. Separate Postgres-specific test files that mirror the existing Deno KV test
   structure
5. README documentation updates

The key design decision is **separate Postgres test files**: rather than
parameterizing the existing Deno KV tests, we create dedicated
`*PostgresRepository_test.ts` files that mirror the same domain behavior
assertions (happy paths, error cases) but target the Postgres backend. The
existing Deno KV tests remain completely untouched. Each Postgres test file is
gated behind `TESTCONTAINERS=true` or `DATABASE_URL` — the entire file is
skipped when neither is set. Testcontainers handles automatic PostgreSQL
lifecycle management — no manual `docker compose up` needed for running tests.

## Architecture

```mermaid
graph TB
    subgraph "Domain Layer (unchanged)"
        D[Deciders] --> API[api.ts types]
        V[Views] --> API
    end

    subgraph "Application Layer (unchanged)"
        H[EventSourcedCommandHandler] --> D
        QH[EventSourcedQueryHandler] --> V
    end

    subgraph "Infrastructure Layer"
        subgraph "Deno KV Backend"
            KVR[DenoKvEventRepository]
            KVL[DenoKvEventLoader]
        end
        subgraph "Postgres Backend"
            PGR[PostgresEventRepository]
            PGL[PostgresEventLoader]
        end
    end

    subgraph "Demo DCB Factories"
        KVF["Deno KV Factories<br/>(existing *Repository.ts)"]
        PGF["Postgres Factories<br/>(new postgresRepositories.ts)"]
    end

    H --> KVF --> KVR
    H --> PGF --> PGR
    QH --> KVL
    QH --> PGL

    subgraph "Test Layer"
        KVT["Deno KV Tests<br/>(*Repository_test.ts — unchanged)"]
        PGT["Postgres Tests<br/>(*PostgresRepository_test.ts — new)"]
    end

    KVT --> KVF
    PGT --> PGF

    subgraph "Test Infrastructure"
        TC["Testcontainers<br/>(@testcontainers/postgresql)"] --> PG[(PostgreSQL 17)]
        SQL[dcb_schema.sql] --> TC
        DC[docker-compose.yml] -.->|manual/docs| PG
    end

    PGR --> PG
    PGL --> PG
```

### Design Rationale

- **No new repository classes**: `PostgresEventRepository` and
  `PostgresEventLoader` already exist with the same API surface as their Deno KV
  counterparts. We only need thin factory functions.
- **Testcontainers for automatic provisioning**: Tests use
  `@testcontainers/postgresql` to start a fresh PostgreSQL container with
  `dcb_schema.sql` loaded automatically. No manual Docker setup required — just
  set `TESTCONTAINERS=true`.
- **Separate test files, not parameterization**: Instead of modifying existing
  Deno KV tests, we create dedicated Postgres test files (e.g.,
  `createRestaurantPostgresRepository_test.ts`) that mirror the same domain
  behavior assertions. This keeps the existing tests pristine and avoids
  coupling the two backends in the same file.
- **Dual gating**: Postgres test files are entirely gated behind
  `TESTCONTAINERS=true` (auto-provision) or `DATABASE_URL` (external instance).
  When neither is set, the Postgres test files skip all tests immediately.

## Components and Interfaces

### 1. Testcontainers Integration (`demo/dcb/testcontainers.ts`)

A shared test helper module that provides PostgreSQL container lifecycle
management using `@testcontainers/postgresql`. This module:

- Starts a PostgreSQL 17 container
- Copies `dcb_schema.sql` from the project root into the container and executes
  it
- Returns a connection string for `@bartlomieju/postgres` `Client`
- Provides cleanup (stop container) on teardown

```typescript
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "npm:@testcontainers/postgresql";
import { Client } from "@bartlomieju/postgres";
import * as path from "@std/path";

export async function startPostgresContainer(): Promise<{
  container: StartedPostgreSqlContainer;
  connectionString: string;
}> {
  const schemaPath = path.resolve("dcb_schema.sql");

  const container = await new PostgreSqlContainer("postgres:17")
    .withCopyFilesToContainer([{
      source: schemaPath,
      target: "/docker-entrypoint-initdb.d/01-dcb-schema.sql",
    }])
    .start();

  return {
    container,
    connectionString: container.getConnectionUri(),
  };
}

export async function createPostgresClient(
  connectionString: string,
): Promise<Client> {
  const client = new Client(connectionString);
  await client.connect();
  return client;
}
```

No truncation helper is needed — each test file gets a fresh container with a
clean schema (true slice isolation).

### 2. Docker Compose Configuration (`docker-compose.yml`)

A single-service Docker Compose file at the project root for manual use and
documentation:

```yaml
services:
  postgres:
    image: postgres:17
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: fmodel
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    volumes:
      - ./dcb_schema.sql:/docker-entrypoint-initdb.d/01-dcb-schema.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5
```

The `dcb_schema.sql` file is mounted into `/docker-entrypoint-initdb.d/` so the
schema is auto-initialized on first container start. The `01-` prefix ensures
ordering if additional init scripts are added later.

### 3. Postgres Repository Factories (one file per slice)

Following the same one-file-per-slice pattern as the Deno KV repositories, each
Postgres factory lives in its own file:

| File                                        | Factory Function                         | Command Type                  | Input Events                                                                         | Output Events                | Mirrors                             |
| ------------------------------------------- | ---------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------ | ---------------------------- | ----------------------------------- |
| `createRestaurantPostgresRepository.ts`     | `createRestaurantPostgresRepository`     | `CreateRestaurantCommand`     | `RestaurantCreatedEvent`                                                             | `RestaurantCreatedEvent`     | `createRestaurantRepository.ts`     |
| `changeRestaurantMenuPostgresRepository.ts` | `changeRestaurantMenuPostgresRepository` | `ChangeRestaurantMenuCommand` | `RestaurantCreatedEvent`                                                             | `RestaurantMenuChangedEvent` | `changeRestaurantMenuRepository.ts` |
| `placeOrderPostgresRepository.ts`           | `placeOrderPostgresRepository`           | `PlaceOrderCommand`           | `RestaurantCreatedEvent \| RestaurantMenuChangedEvent \| RestaurantOrderPlacedEvent` | `RestaurantOrderPlacedEvent` | `placeOrderRepository.ts`           |
| `markOrderAsPreparedPostgresRepository.ts`  | `markOrderAsPreparedPostgresRepository`  | `MarkOrderAsPreparedCommand`  | `RestaurantOrderPlacedEvent \| OrderPreparedEvent`                                   | `OrderPreparedEvent`         | `markOrderAsPreparedRepository.ts`  |

Each factory accepts a `Client` (from `@bartlomieju/postgres`) and returns a
`PostgresEventRepository` with the same query tuple logic as its Deno KV
counterpart. Example:

```typescript
// demo/dcb/createRestaurantPostgresRepository.ts
import type { Client } from "@bartlomieju/postgres";
import { PostgresEventRepository } from "../../postgresEventRepository.ts";
import type { CreateRestaurantCommand, RestaurantCreatedEvent } from "./api.ts";

export const createRestaurantPostgresRepository = (client: Client) =>
  new PostgresEventRepository<
    CreateRestaurantCommand,
    RestaurantCreatedEvent,
    RestaurantCreatedEvent
  >(
    client,
    (cmd) => [["restaurantId:" + cmd.restaurantId, "RestaurantCreatedEvent"]],
  );
```

### 4. Postgres Event Loader Factories

For view tests, we also need `PostgresEventLoader` instances. These will be
created inline in the Postgres test files since they only need a `Client` and
have no command-specific query tuple logic:

```typescript
import { PostgresEventLoader } from "../../postgresEventRepository.ts";

// In test setup:
const loader = new PostgresEventLoader<OrderEvent>(client);
```

### 5. Separate Postgres Test Files

Instead of parameterizing the existing Deno KV tests, we create dedicated
Postgres-specific test files that mirror the same domain behavior assertions.
The existing Deno KV `*Repository_test.ts` files remain completely untouched.

#### Postgres Test File Mapping

| Existing Deno KV Test                    | New Postgres Test                                |
| ---------------------------------------- | ------------------------------------------------ |
| `createRestaurantRepository_test.ts`     | `createRestaurantPostgresRepository_test.ts`     |
| `changeRestaurantMenuRepository_test.ts` | `changeRestaurantMenuPostgresRepository_test.ts` |
| `placeOrderRepository_test.ts`           | `placeOrderPostgresRepository_test.ts`           |
| `markOrderAsPreparedRepository_test.ts`  | `markOrderAsPreparedPostgresRepository_test.ts`  |
| `all_deciderRepository_test.ts`          | `all_deciderPostgresRepository_test.ts`          |
| `restaurantViewEventLoader_test.ts`      | `restaurantViewPostgresEventLoader_test.ts`      |
| `orderViewEventLoader_test.ts`           | `orderViewPostgresEventLoader_test.ts`           |

#### Test File Gating Pattern

Each Postgres test file gates its entire contents behind environment variables.
When neither `TESTCONTAINERS` nor `DATABASE_URL` is set, all tests in the file
are skipped immediately:

```typescript
// demo/dcb/createRestaurantPostgresRepository_test.ts
import {
  createPostgresClient,
  startPostgresContainer,
} from "./testcontainers.ts";
import { createRestaurantPostgresRepository } from "./createRestaurantPostgresRepository.ts";
import { createRestaurantDecider } from "./createRestaurantDecider.ts";
import { EventSourcedCommandHandler } from "../../application.ts";
// ... other imports

const DATABASE_URL = Deno.env.get("DATABASE_URL");
const USE_TESTCONTAINERS = Deno.env.get("TESTCONTAINERS") === "true";

// Skip entire file when Postgres is not available
if (DATABASE_URL || USE_TESTCONTAINERS) {
  Deno.test("Postgres: Create Restaurant - success", async () => {
    // Setup: start container or connect to external DB
    let container: StartedPostgreSqlContainer | undefined;
    let connectionString: string;

    if (DATABASE_URL) {
      connectionString = DATABASE_URL;
    } else {
      const result = await startPostgresContainer();
      container = result.container;
      connectionString = result.connectionString;
    }

    const client = await createPostgresClient(connectionString);

    try {
      const repository = createRestaurantPostgresRepository(client);
      const handler = new EventSourcedCommandHandler(
        createRestaurantDecider,
        repository,
      );

      // Same domain assertions as the Deno KV test
      const events = await handler.handle({
        kind: "CreateRestaurantCommand",
        restaurantId: "restaurant-1",
        name: "Italian Bistro",
        menu: testMenu,
      });

      assertEquals(events.length, 1);
      assertEquals(events[0].kind, "RestaurantCreatedEvent");
      assertEquals(events[0].restaurantId, "restaurant-1");
      // ... domain field assertions
    } finally {
      await client.end();
      await container?.stop();
    }
  });

  Deno.test("Postgres: Create Restaurant - duplicate rejection", async () => {
    // Same pattern: setup, domain assertions, teardown
    // ...
  });
}
```

#### Key Principles

- **Existing Deno KV tests are never modified** — they remain exactly as they
  are
- **Each Postgres test file mirrors the domain behavior tests** from its Deno KV
  counterpart (happy paths, error cases)
- **Postgres test files do NOT duplicate KV-specific infrastructure tests**
  (index structure, versionstamp assertions) — those are Deno KV-only concerns
- **Each test gets a fresh container** (when using testcontainers) for true
  slice isolation
- **Assertions focus on domain behavior** — event kinds, domain field values,
  domain error types

### 6. Test Isolation Strategy

- **Deno KV**: Each test uses `Deno.openKv(":memory:")` — fully isolated, no
  cleanup needed beyond `kv.close()`.
- **Postgres**: Each test file gets a fresh container with `dcb_schema.sql`
  pre-loaded — true slice isolation with a clean schema, no truncation needed.
  The container is stopped in teardown. When using `DATABASE_URL`, the external
  instance is used directly (caller is responsible for ensuring a clean state).

### 7. Assertion Strategy

The Postgres test files assert on **domain behavior only** — event kinds, domain
field values, and domain error types. They do NOT assert on:

- Deno KV-specific: versionstamps, KV index keys, primary storage keys
- Postgres-specific: row IDs, `created_at` timestamps, bigint event IDs

The existing Deno KV tests remain unchanged and may continue to assert on
KV-specific infrastructure details (index structure, versionstamps). The new
Postgres test files focus exclusively on the `EventSourcedCommandHandler` →
domain behavior path.

## Data Models

### Existing SQL Schema (`dcb_schema.sql`)

The schema is already defined and version-controlled. Key structures:

```sql
-- Core event table
CREATE TABLE dcb.events (
    id         bigserial    PRIMARY KEY,
    type       text         NOT NULL,
    data       bytea,
    tags       text[]       NOT NULL,
    created_at timestamptz  NOT NULL DEFAULT now()
);

-- Tag index for query-by-tag
CREATE TABLE dcb.event_tags (
    tag     text   NOT NULL,
    main_id bigint NOT NULL REFERENCES dcb.events(id),
    PRIMARY KEY (tag, main_id)
);

-- Composite types for SQL function parameters
CREATE TYPE dcb.dcb_event_tt AS (type text, data bytea, tags text[]);
CREATE TYPE dcb.dcb_query_item_tt AS (types text[], tags text[]);
```

### Event Serialization

`PostgresEventRepository` uses JSON serialization by default
(`defaultSerializer`/`defaultDeserializer`), encoding events as `Uint8Array`
(bytea). This is transparent to the domain layer — the same event types work
with both backends.

### Metadata Mapping

| Concept            | Deno KV                      | Postgres                                                              |
| ------------------ | ---------------------------- | --------------------------------------------------------------------- |
| Event ID           | ULID string                  | `bigserial` (returned as string in `EventMetadata.eventId`)           |
| Timestamp          | `Date.now()` at persist time | `created_at` column (returned as millis in `EventMetadata.timestamp`) |
| Versionstamp       | Deno KV versionstamp         | Event ID as string (in `EventMetadata.versionstamp`)                  |
| Optimistic locking | KV versionstamp checks       | `conditional_append` with `after_id` bigint                           |

## Correctness Properties

_A property is a characteristic or behavior that should hold true across all
valid executions of a system — essentially, a formal statement about what the
system should do. Properties serve as the bridge between human-readable
specifications and machine-verifiable correctness guarantees._

### Property 1: Repository backend equivalence for command execution

_For any_ valid command sequence (create restaurant, change menu, place order,
mark as prepared) and _for any_ valid command inputs, executing the sequence
against the Deno KV backend and the Postgres backend through
`EventSourcedCommandHandler` SHALL produce events with identical `kind` values
and identical domain field values (excluding backend-specific metadata like
`eventId`, `timestamp`, `versionstamp`).

**Validates: Requirements 4.3**

### Property 2: Event loader backend equivalence for view projection

_For any_ valid event sequence persisted through repositories, loading events
via `DenoKvEventLoader` and `PostgresEventLoader` with the same query tuples and
folding them through the same view SHALL produce identical projected state.

**Validates: Requirements 6.3**

## Error Handling

### Connection Errors

When `TESTCONTAINERS=true` is set but Docker is unavailable:

- The `PostgreSqlContainer.start()` call will throw a container startup error
- This error surfaces as a test failure for Postgres-backed tests only
- Deno KV tests are unaffected since they use in-memory storage

When `DATABASE_URL` is set but the Postgres instance is unreachable:

- The `Client.connect()` call in test setup will throw a connection error
- This error surfaces as a test failure for Postgres-backed tests only
- Deno KV tests are unaffected

### Schema Initialization Errors

If `dcb_schema.sql` fails to execute during container startup (testcontainers)
or is missing:

- Testcontainers: The container will start but SQL functions won't exist,
  causing test failures with clear SQL error messages
- Docker Compose: Same behavior — schema errors surface as SQL
  function-not-found errors

### Domain Error Propagation

Both backends propagate domain errors identically:

- `RestaurantAlreadyExistsError`, `RestaurantNotFoundError`,
  `OrderAlreadyExistsError`, `OrderNotFoundError`, `OrderAlreadyPreparedError`,
  `MenuItemsNotAvailableError`
- These are thrown by the decider layer, which is backend-agnostic
- The Postgres test files verify the same domain errors are thrown as in the
  Deno KV tests

## Testing Strategy

### Test Organization

Tests are organized into three categories:

1. **Existing Deno KV tests** (unchanged):
   - All existing `*Repository_test.ts` and `*EventLoader_test.ts` files remain
     exactly as they are
   - These include both domain behavior tests and KV-specific infrastructure
     tests (index structure, versionstamp assertions)
   - Run with: `deno test --unstable-kv demo/dcb/`

2. **New Postgres-specific test files** (gated behind env vars):
   - Dedicated `*PostgresRepository_test.ts` and `*PostgresEventLoader_test.ts`
     files
   - Mirror the domain behavior assertions from the Deno KV tests (happy paths,
     error cases)
   - Do NOT duplicate KV-specific infrastructure tests
   - Entire file gated behind `TESTCONTAINERS=true` or `DATABASE_URL`
   - Run with: `TESTCONTAINERS=true deno test -A --unstable-kv demo/dcb/`

3. **Backend-specific infrastructure tests** (Deno KV only, existing):
   - KV index structure verification (primary storage keys, type index keys)
   - Versionstamp-based assertions
   - These remain in the existing test files, untouched

### Postgres Test Files

New test files to create:

| File                                             | Tests                                                                     | Mirrors                                  |
| ------------------------------------------------ | ------------------------------------------------------------------------- | ---------------------------------------- |
| `createRestaurantPostgresRepository_test.ts`     | Create restaurant happy path, duplicate rejection                         | `createRestaurantRepository_test.ts`     |
| `changeRestaurantMenuPostgresRepository_test.ts` | Change menu happy path, restaurant not found                              | `changeRestaurantMenuRepository_test.ts` |
| `placeOrderPostgresRepository_test.ts`           | Place order happy path, restaurant not found, order exists, invalid items | `placeOrderRepository_test.ts`           |
| `markOrderAsPreparedPostgresRepository_test.ts`  | Mark prepared happy path, order not found, already prepared               | `markOrderAsPreparedRepository_test.ts`  |
| `all_deciderPostgresRepository_test.ts`          | Combined repository happy path, error cases                               | `all_deciderRepository_test.ts`          |
| `restaurantViewPostgresEventLoader_test.ts`      | Restaurant view projection from events                                    | `restaurantViewEventLoader_test.ts`      |
| `orderViewPostgresEventLoader_test.ts`           | Order view projection from events                                         | `orderViewEventLoader_test.ts`           |

### Property-Based Testing

Property-based testing using `fast-check` (already in `deno.json` imports) is
applicable for the backend equivalence properties:

- **Property 1** (command execution equivalence): Generate random valid command
  sequences, execute against both backends, compare domain-level results
- **Property 2** (view projection equivalence): Generate random event sequences,
  persist via both backends, load and project, compare view state

Each property test will run a minimum of 100 iterations.

Tag format: **Feature: postgres-dcb-demo, Property {number}: {property_text}**

### Test Gating

Each Postgres test file uses this gating pattern at the top level:

```typescript
const DATABASE_URL = Deno.env.get("DATABASE_URL");
const USE_TESTCONTAINERS = Deno.env.get("TESTCONTAINERS") === "true";

if (DATABASE_URL || USE_TESTCONTAINERS) {
  // All Postgres tests defined here
  Deno.test("Postgres: ...", async () => {/* ... */});
}
```

This ensures:

- `deno test --unstable-kv` → Deno KV only (Postgres test files skip all tests)
- `TESTCONTAINERS=true deno test -A --unstable-kv` → both Deno KV and Postgres
  tests run
- `DATABASE_URL=... deno test --unstable-kv` → both Deno KV and Postgres tests
  run

### Test Commands

```bash
# Deno KV only (no Docker required) — Postgres test files skip automatically
deno test --unstable-kv demo/dcb/

# Both backends via testcontainers (requires Docker daemon)
TESTCONTAINERS=true deno test -A --unstable-kv demo/dcb/

# Both backends via external Postgres (requires running instance)
docker compose up -d
DATABASE_URL=postgres://postgres:postgres@localhost:5432/fmodel deno test --unstable-kv demo/dcb/
```
