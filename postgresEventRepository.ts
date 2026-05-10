/**
 * Event-sourced repository and loader implementations for DCB pattern using PostgreSQL.
 *
 * This module provides the PostgreSQL-specific repository and loader implementations,
 * delegating storage, indexing, and conflict detection to predefined SQL functions
 * in the `dcb` schema via any PostgreSQL client that implements the `SqlClient` interface.
 *
 * The Postgres repository mirrors the `DenoKvEventRepository` API surface — same
 * generic type parameters, same `execute`/`executeBatch`/`load` methods — so that
 * switching from Deno KV to Postgres requires only swapping the repository instance.
 */

import type { IEventComputation } from "./decider.ts";
import type {
  CommandShape,
  EventShape,
  IEventLoader,
  IEventRepository,
  QueryTuple,
} from "./application.ts";
import {
  IdempotencyConflictError,
  matchesQueryTuple,
  OptimisticLockingError,
  RepositoryError,
} from "./infrastructure.ts";
import type { CommandMetadata, EventMetadata } from "./infrastructure.ts";

// ---------------------------------------------------------------------------
// Serializer / Deserializer
// ---------------------------------------------------------------------------

/**
 * Converts an event object into a `Uint8Array` for storage as bytea.
 */
export type Serializer<E> = (event: E) => Uint8Array;

/**
 * Converts a `Uint8Array` (bytea) back into a typed event object.
 */
export type Deserializer<E> = (data: Uint8Array) => E;

/**
 * Default JSON serializer: event → JSON string → Uint8Array via TextEncoder.
 */
export const defaultSerializer: Serializer<unknown> = (event) =>
  new TextEncoder().encode(JSON.stringify(event));

/**
 * Default JSON deserializer: Uint8Array → JSON string → object via TextDecoder.
 */
export const defaultDeserializer: Deserializer<unknown> = (data) =>
  JSON.parse(new TextDecoder().decode(data));

// ---------------------------------------------------------------------------
// SqlClient – minimal interface for PostgreSQL client abstraction
// ---------------------------------------------------------------------------

/**
 * Minimal SQL client interface for the PostgreSQL event repository.
 *
 * Any Postgres client library can be adapted to this single-method interface.
 * The built-in `@bartlomieju/postgres` `Client` satisfies it out of the box.
 *
 * @example Adapter for node-postgres (`pg`) / `@neondatabase/serverless`:
 * ```typescript
 * import pg from "pg";
 * const pgClient = new pg.Client("postgres://...");
 * const client: SqlClient = { queryObject: (sql) => pgClient.query(sql) };
 * ```
 *
 * @example Adapter for `postgres.js` (porsager):
 * ```typescript
 * import postgres from "postgres";
 * const sql = postgres("postgres://...");
 * const client: SqlClient = {
 *   queryObject: async <T>(query: string) =>
 *     ({ rows: await sql.unsafe(query) as T[] }),
 * };
 * ```
 */
export interface SqlClient {
  /** Execute a SQL string and return rows as typed objects. */
  queryObject<T>(sql: string): Promise<{ rows: T[] }>;
}

// ---------------------------------------------------------------------------
// Internal helpers (exported for property-based testing)
// ---------------------------------------------------------------------------

/** Escapes single quotes in SQL string literals by doubling them. */
function escapeSqlString(s: string): string {
  return s.replace(/'/g, "''");
}

/** Converts a Uint8Array to a hex string for use in SQL bytea literals. */
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Converts `QueryTuple[]` into the SQL literal representation of `dcb_query_item_tt[]`.
 *
 * Each `QueryTuple` `[...tags, eventType]` maps to a `dcb_query_item_tt`:
 * - `types`: single-element text array containing the last element (event type)
 * - `tags`: text array of all preceding elements
 *
 * @example
 * ```
 * mapQueryTuplesToSql([["restaurantId:r1", "RestaurantCreatedEvent"]])
 * // → "ARRAY[ROW(ARRAY['RestaurantCreatedEvent'],ARRAY['restaurantId:r1'])::dcb.dcb_query_item_tt]"
 * ```
 */
export function mapQueryTuplesToSql<Ei extends EventShape>(
  queryTuples: QueryTuple<Ei>[],
): string {
  const items = queryTuples.map((tuple) => {
    const eventType = tuple[tuple.length - 1] as string;
    const tags = tuple.slice(0, -1) as string[];
    const typesLiteral = `ARRAY['${escapeSqlString(eventType)}']`;
    const tagsLiteral = tags.length === 0
      ? "ARRAY[]::text[]"
      : `ARRAY[${tags.map((t) => `'${escapeSqlString(t)}'`).join(",")}]`;
    return `ROW(${typesLiteral},${tagsLiteral})::dcb.dcb_query_item_tt`;
  });
  return `ARRAY[${items.join(",")}]`;
}

/**
 * Extracts tags from an event's `tagFields` in `"fieldName:fieldValue"` format.
 *
 * Iterates through the event's declared `tagFields` and extracts string values.
 * Skips undefined, null, and empty string values.
 */
export function extractTags<Eo extends EventShape>(event: Eo): string[] {
  const tagFields = event.tagFields;
  if (!tagFields || tagFields.length === 0) return [];

  const tags: string[] = [];
  for (const field of tagFields) {
    const value = (event as Record<string, unknown>)[field as string];
    if (value === undefined || value === null || value === "") continue;
    tags.push(`${String(field)}:${value as string}`);
  }
  return tags;
}

/**
 * Converts output events into the SQL literal representation of `dcb_event_tt[]`.
 *
 * Each event maps to `ROW(type, data, tags)::dcb.dcb_event_tt` where:
 * - `type` is `event.kind`
 * - `data` is the serialized bytea as a hex-encoded literal (`'\x...'`)
 * - `tags` is the extracted tag array
 */
export function buildEventTuples<Eo extends EventShape>(
  events: readonly Eo[],
  serializer: Serializer<Eo>,
): string {
  const items = events.map((event) => {
    const serialized = serializer(event);
    const hexData = `'\\x${toHex(serialized)}'`;
    const tags = extractTags(event);
    const tagsLiteral = tags.length === 0
      ? "ARRAY[]::text[]"
      : `ARRAY[${tags.map((t) => `'${escapeSqlString(t)}'`).join(",")}]`;
    return `ROW('${
      escapeSqlString(event.kind)
    }',${hexData},${tagsLiteral})::dcb.dcb_event_tt`;
  });
  return `ARRAY[${items.join(",")}]`;
}

// ---------------------------------------------------------------------------
// PostgresEventRepository
// ---------------------------------------------------------------------------

/**
 * Generic event-sourced repository implementation using PostgreSQL.
 *
 * Delegates all storage, indexing, and conflict detection to predefined SQL
 * functions in the `dcb` schema:
 * - `dcb.conditional_append` — atomic conflict check + append
 * - `dcb.select_events_by_tags` — full-replay event loading
 * - `dcb.select_last_events_by_tags` — idempotent (last-event) loading
 * - `dcb.select_max_id` — current max event id
 *
 * Optimistic locking uses an integer `after_id` (the max event id at load time)
 * instead of Deno KV versionstamps, and all atomicity is handled server-side.
 *
 * @typeParam C - Command type (must conform to CommandShape)
 * @typeParam Ei - Input event type (consumed by decider, must conform to EventShape)
 * @typeParam Eo - Output event type (produced by decider, must conform to EventShape)
 */
export class PostgresEventRepository<
  C extends CommandShape,
  Ei extends EventShape,
  Eo extends EventShape,
> implements IEventRepository<C, Ei, Eo, CommandMetadata, EventMetadata> {
  constructor(
    private readonly client: SqlClient,
    private readonly getQueryTuples: (command: C) => QueryTuple<Ei>[],
    private readonly maxRetries: number = 10,
    private readonly idempotent: boolean = true,
    private readonly serializer: Serializer<Eo> =
      defaultSerializer as Serializer<Eo>,
    private readonly deserializer: Deserializer<Ei & Eo> =
      defaultDeserializer as Deserializer<Ei & Eo>,
  ) {}

  /**
   * Loads events matching the given query tuples.
   *
   * Uses `select_last_events_by_tags` in idempotent mode or
   * `select_events_by_tags` in full-replay mode.
   */
  async load(queryTuples: QueryTuple<Ei>[]): Promise<readonly Ei[]> {
    const { events } = await this.loadEvents(queryTuples);
    return events;
  }

  /**
   * Executes a command by loading events, computing new events via the decider,
   * and persisting them with optimistic locking via `conditional_append`.
   *
   * Implements idempotency circuit-break:
   * 1. Check if idempotencyKey already exists — if so, return existing events
   * 2. Load events with query tuples
   * 3. Compute new events using decider
   * 4. Persist with idempotencyKey
   * 5. Retry on conflict (optimistic lock or idempotency race)
   */
  async execute(
    command: C & CommandMetadata,
    decider: IEventComputation<C, Ei, Eo>,
  ): Promise<readonly (Eo & EventMetadata)[]> {
    let attempts = 0;
    const { idempotencyKey } = command;

    while (attempts < this.maxRetries) {
      attempts++;

      // Step 1: Idempotency check — circuit-break if key already used
      const existing = await this.loadEventsByIdempotencyKey(idempotencyKey);
      if (existing.length > 0) {
        return existing;
      }

      // Step 2: Normal flow — load events for decider
      const queryTuples = this.getQueryTuples(command);
      const { events, afterId } = await this.loadEvents(queryTuples);

      // Step 3: Decider errors propagate directly — never wrapped
      const newEvents = decider.computeNewEvents(events, command);

      if (newEvents.length === 0) return [];

      // Step 4: Persist with idempotencyKey
      try {
        const result = await this.persistEvents(
          newEvents,
          queryTuples,
          afterId,
          idempotencyKey,
        );

        if (result !== null) {
          return result;
        }
        // NULL → optimistic locking conflict, retry
      } catch (error) {
        if (error instanceof IdempotencyConflictError) {
          // Race condition: another execution persisted with same key
          // Retry — next iteration's idempotency check will find existing events
          continue;
        }
        throw error;
      }
    }

    throw new OptimisticLockingError(attempts, "unknown");
  }

  /**
   * Executes a batch of commands: load once using first command's tuples,
   * process each command sequentially with accumulated event propagation,
   * single `conditional_append` for all events.
   *
   * The single `idempotencyKey` from the first command's metadata deduplicates
   * the entire batch as one logical operation.
   */
  async executeBatch(
    commands: readonly (C & CommandMetadata)[],
    decider: IEventComputation<C, Ei, Eo>,
  ): Promise<readonly (Eo & EventMetadata)[]> {
    if (commands.length === 0) return [];

    // Use the idempotencyKey from the first command for the entire batch
    const { idempotencyKey } = commands[0];

    let attempts = 0;

    while (attempts < this.maxRetries) {
      attempts++;

      // Step 1: Idempotency check — circuit-break if key already used
      const existing = await this.loadEventsByIdempotencyKey(idempotencyKey);
      if (existing.length > 0) {
        return existing;
      }

      // Step 2: Load events using first command's tuples
      const firstQueryTuples = this.getQueryTuples(commands[0]);
      const { events: initialEvents, afterId } = await this.loadEvents(
        firstQueryTuples,
      );

      // Collect all query tuples for the conditional_append conflict check
      const allQueryTuples = [...firstQueryTuples];

      const accumulatedEvents: Eo[] = [];
      const allNewEvents: Eo[] = [];

      // Decider errors propagate directly — never wrapped
      for (let i = 0; i < commands.length; i++) {
        const command = commands[i];
        const queryTuples = i === 0
          ? firstQueryTuples
          : this.getQueryTuples(command);

        if (i > 0) {
          // Collect additional query tuples for conflict detection
          for (const qt of queryTuples) {
            allQueryTuples.push(qt);
          }
        }

        // Filter accumulated events by this command's query tuples
        let eventsForCommand: readonly Ei[];
        if (i === 0) {
          eventsForCommand = initialEvents;
        } else {
          const matchingAccumulated = accumulatedEvents.filter((event) =>
            queryTuples.some((tuple) => matchesQueryTuple<Eo, Ei>(event, tuple))
          );
          eventsForCommand = [
            ...initialEvents,
            ...matchingAccumulated as unknown as Ei[],
          ];
        }

        const newEvents = decider.computeNewEvents(eventsForCommand, command);
        accumulatedEvents.push(...newEvents);
        allNewEvents.push(...newEvents);
      }

      // Step 3: Persist all events with idempotencyKey
      try {
        const result = await this.persistEvents(
          allNewEvents,
          allQueryTuples,
          afterId,
          idempotencyKey,
        );

        if (result !== null) {
          return result;
        }
        // NULL → optimistic locking conflict, retry entire batch
      } catch (error) {
        if (error instanceof IdempotencyConflictError) {
          // Race condition: another execution persisted with same key
          // Retry — next iteration's idempotency check will find existing events
          continue;
        }
        throw error;
      }
    }

    throw new OptimisticLockingError(attempts, "batch");
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Loads events and determines the `after_id` for optimistic locking.
   */
  private async loadEvents(
    queryTuples: QueryTuple<Ei>[],
  ): Promise<{ events: readonly Ei[]; afterId: bigint }> {
    try {
      const queryItemsSql = mapQueryTuplesToSql(queryTuples);

      let rows: {
        id: bigint;
        type: string;
        data: Uint8Array;
        created_at: Date;
      }[];

      if (this.idempotent) {
        const result = await this.client.queryObject<{
          id: bigint;
          type: string;
          data: Uint8Array;
          created_at: Date;
        }>(
          `SELECT e.id, e.type, e.data, e.created_at FROM dcb.select_last_events_by_tags(${queryItemsSql}::dcb.dcb_query_item_tt[]) AS e ORDER BY e.id ASC`,
        );
        rows = result.rows;
      } else {
        const result = await this.client.queryObject<{
          id: bigint;
          type: string;
          data: Uint8Array;
          created_at: Date;
        }>(
          `SELECT e.id, e.type, e.data, e.created_at FROM dcb.select_events_by_tags(${queryItemsSql}::dcb.dcb_query_item_tt[], 0, NULL) AS e ORDER BY e.id ASC`,
        );
        rows = result.rows;
      }

      // Determine after_id: max id from loaded events, or from select_max_id()
      let afterId: bigint;
      if (rows.length > 0) {
        afterId = rows[rows.length - 1].id;
      } else {
        const maxIdResult = await this.client.queryObject<{
          select_max_id: bigint;
        }>(
          `SELECT dcb.select_max_id()`,
        );
        afterId = maxIdResult.rows[0].select_max_id ?? BigInt(0);
      }

      // Deserialize events
      const events = rows.map((row) => this.deserializer(row.data));

      return { events, afterId };
    } catch (error) {
      throw new RepositoryError("load", error as Error);
    }
  }

  /**
   * Loads events by idempotency key for circuit-break detection.
   *
   * Queries `dcb.events` for all events with the given idempotency key.
   * If events exist, deserializes and returns them with full EventMetadata.
   * If no events exist, returns an empty array.
   *
   * @param idempotencyKey - The idempotency key to look up
   * @returns Events with metadata if found, empty array otherwise
   */
  private async loadEventsByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<readonly (Eo & EventMetadata)[]> {
    try {
      const escapedKey = escapeSqlString(idempotencyKey);
      const result = await this.client.queryObject<{
        id: bigint;
        type: string;
        data: Uint8Array;
        created_at: Date;
      }>(
        `SELECT id, type, data, created_at FROM dcb.events WHERE idempotency_key = '${escapedKey}' ORDER BY id ASC`,
      );

      if (result.rows.length === 0) {
        return [];
      }

      return result.rows.map((row) => {
        const event = this.deserializer(row.data) as Eo;
        return {
          ...event,
          eventId: String(row.id),
          timestamp: row.created_at.getTime(),
          versionstamp: String(row.id),
          idempotencyKey,
        };
      });
    } catch (error) {
      throw new RepositoryError("load", error as Error);
    }
  }

  /**
   * Persists events via `conditional_append` and enriches with EventMetadata.
   * Returns null on conflict (NULL from conditional_append).
   * Throws IdempotencyConflictError on PK violation on dcb.idempotency_keys.
   */
  private async persistEvents(
    events: readonly Eo[],
    queryTuples: QueryTuple<Ei>[],
    afterId: bigint,
    idempotencyKey: string,
  ): Promise<readonly (Eo & EventMetadata)[] | null> {
    try {
      const queryItemsSql = mapQueryTuplesToSql(queryTuples);
      const eventTuplesSql = buildEventTuples(events, this.serializer);
      const escapedKey = escapeSqlString(idempotencyKey);

      // Call conditional_append with idempotency key
      const appendResult = await this.client.queryObject<{
        conditional_append: unknown;
      }>(
        `SELECT dcb.conditional_append(${queryItemsSql}::dcb.dcb_query_item_tt[], ${afterId}::bigint, ${eventTuplesSql}::dcb.dcb_event_tt[], '${escapedKey}')`,
      );

      const returnedValue = appendResult.rows[0]?.conditional_append;

      // NULL means optimistic locking conflict
      if (returnedValue === null || returnedValue === undefined) {
        return null;
      }

      // Success — fetch metadata for newly persisted events
      const metadataResult = await this.client.queryObject<{
        id: bigint;
        created_at: Date;
      }>(
        `SELECT id, created_at FROM dcb.events WHERE id > ${afterId} ORDER BY id ASC`,
      );

      const metadataRows = metadataResult.rows;

      // Enrich events with metadata including idempotencyKey
      return events.map((event, i) => {
        const meta = metadataRows[i];
        return {
          ...event,
          eventId: String(meta.id),
          timestamp: meta.created_at.getTime(),
          versionstamp: String(meta.id),
          idempotencyKey,
        };
      });
    } catch (error) {
      // Check for PK violation on dcb.idempotency_keys (unique_violation = 23505)
      const pgError = error as { code?: string; message?: string };
      if (
        pgError.code === "23505" ||
        (pgError.message && pgError.message.includes("idempotency_keys"))
      ) {
        throw new IdempotencyConflictError(idempotencyKey);
      }
      throw new RepositoryError("persist", error as Error);
    }
  }
}

// ---------------------------------------------------------------------------
// PostgresEventLoader
// ---------------------------------------------------------------------------

/**
 * Standalone PostgreSQL event loader implementing `IEventLoader`.
 *
 * Provides read-only event loading by query tuples without the
 * decide-persist cycle of the full repository. Useful for on-demand
 * projections via `EventSourcedQueryHandler`.
 *
 * @typeParam Ei - Event type to load
 */
export class PostgresEventLoader<Ei extends EventShape>
  implements IEventLoader<Ei> {
  constructor(
    private readonly client: SqlClient,
    private readonly deserializer: Deserializer<Ei> =
      defaultDeserializer as Deserializer<Ei>,
    private readonly idempotent: boolean = true,
  ) {}

  /**
   * Loads events matching the given query tuples.
   *
   * Uses `select_last_events_by_tags` in idempotent mode or
   * `select_events_by_tags` in full-replay mode.
   */
  async load(queryTuples: QueryTuple<Ei>[]): Promise<readonly Ei[]> {
    try {
      const queryItemsSql = mapQueryTuplesToSql(queryTuples);

      let rows: {
        id: bigint;
        type: string;
        data: Uint8Array;
        created_at: Date;
      }[];

      if (this.idempotent) {
        const result = await this.client.queryObject<{
          id: bigint;
          type: string;
          data: Uint8Array;
          created_at: Date;
        }>(
          `SELECT e.id, e.type, e.data, e.created_at FROM dcb.select_last_events_by_tags(${queryItemsSql}::dcb.dcb_query_item_tt[]) AS e ORDER BY e.id ASC`,
        );
        rows = result.rows;
      } else {
        const result = await this.client.queryObject<{
          id: bigint;
          type: string;
          data: Uint8Array;
          created_at: Date;
        }>(
          `SELECT e.id, e.type, e.data, e.created_at FROM dcb.select_events_by_tags(${queryItemsSql}::dcb.dcb_query_item_tt[], 0, NULL) AS e ORDER BY e.id ASC`,
        );
        rows = result.rows;
      }

      return rows.map((row) => this.deserializer(row.data));
    } catch (error) {
      throw new RepositoryError("load", error as Error);
    }
  }
}
