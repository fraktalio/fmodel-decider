/**
 * Event-sourced repository infrastructure and implementations for DCB pattern.
 *
 * This module provides the core types, error classes, generic repository
 * implementation, and concrete repository classes for event-sourced repositories
 * using Deno KV with a two-index architecture and optimistic locking.
 */

import { monotonicUlid } from "@std/ulid";
import type { IEventComputation } from "./decider.ts";
import type {
  CommandShape,
  EventShape,
  IEventRepository,
  QueryTuple,
} from "./application.ts";

// Re-export from application.ts for backward compatibility
export type { CommandShape, EventShape, QueryTuple } from "./application.ts";

/**
 * Extracts string-typed field names from an event type.
 *
 * This mapped type filters event fields to only those with string values,
 * enabling type-safe tag field configuration.
 */
export type StringFields<E> = {
  [K in keyof E]: E[K] extends string ? K : never;
}[keyof E];

/**
 * Type-safe event with constrained tagFields.
 *
 * This helper enforces that tagFields can only contain string-typed field names
 * from the event definition. The tagFields parameter is separate to enable proper
 * type validation.
 *
 * @example
 * ```typescript
 * // Define the event structure without tagFields
 * type MyEventData = {
 *   kind: "MyEvent";
 *   entityId: string;
 *   tenantId: string;
 *   count: number;
 * };
 *
 * // Apply type-safe tagFields
 * type MyEvent = TypeSafeEventShape<MyEventData, ["entityId", "tenantId"]>;
 * // ✅ Type-safe! Only string fields allowed
 *
 * // This would error:
 * // type BadEvent = TypeSafeEventShape<MyEventData, ["count"]>;
 * // ❌ Error: "count" is not a string field
 *
 * // Optional tagFields (no second parameter)
 * type MyEventNoTags = TypeSafeEventShape<MyEventData>;
 * // ✅ tagFields is optional
 * ```
 */
export type TypeSafeEventShape<
  T extends { kind: string },
  TagFields extends readonly StringFields<T>[] = never,
> =
  & T
  & EventShape
  & (
    [TagFields] extends [never]
      ? { readonly tagFields?: readonly StringFields<T>[] }
      : { readonly tagFields: readonly [...TagFields] }
  );

/**
 * Tag in "fieldName:fieldValue" format.
 */
export type Tag = string;

/**
 * Metadata attached to persisted events.
 *
 * @property eventId - ULID identifier for the event
 * @property timestamp - Unix timestamp in milliseconds when event was created
 * @property versionstamp - Deno KV versionstamp for optimistic locking
 */
export interface EventMetadata {
  readonly eventId: string;
  readonly timestamp: number;
  readonly versionstamp: string;
}

/**
 * Events loaded from storage with their index keys for optimistic locking.
 *
 * @property events - Array of events in chronological order (sorted by ULID)
 * @property indexKeys - Array of last_event pointer keys with versionstamps for optimistic locking
 *                       (optimization: only last_event pointers are mutable and need conflict detection)
 */
export interface LoadedEvents<E> {
  readonly events: readonly E[];
  readonly indexKeys: { key: Deno.KvKey; versionstamp: string | null }[];
}

/**
 * Base error class for repository operations.
 *
 * Wraps underlying storage errors with context about the operation that failed.
 */
export class RepositoryError extends Error {
  constructor(
    public readonly operation: "load" | "persist",
    public override readonly cause: Error,
  ) {
    super(`Repository ${operation} failed: ${cause.message}`);
    this.name = "RepositoryError";
  }
}

/**
 * Error thrown when optimistic locking fails after maximum retry attempts.
 *
 * This indicates that concurrent modifications prevented the operation from
 * completing successfully within the configured retry limit.
 */
export class OptimisticLockingError extends Error {
  constructor(
    public readonly attempts: number,
    public readonly entityId: string,
  ) {
    super(
      `Optimistic locking failed after ${attempts} attempts for entity ${entityId}`,
    );
    this.name = "OptimisticLockingError";
  }
}

/**
 * Error thrown when tag field configuration is invalid.
 *
 * This error is thrown at repository construction time when the number
 * of configured tag fields exceeds the maximum allowed (5 fields).
 */
export class TagFieldConfigurationError extends Error {
  constructor(
    public readonly fieldCount: number,
    public readonly maxCount: number,
    public readonly fields: readonly string[],
  ) {
    super(
      `Tag field count exceeds maximum: ${fieldCount} > ${maxCount}. ` +
        `Configured fields: [${fields.join(", ")}]`,
    );
    this.name = "TagFieldConfigurationError";
  }
}

/**
 * Generic event-sourced repository implementation using Deno KV.
 *
 * Implements the two-index architecture with pointer pattern:
 * - Primary storage: ["events", eventId] → full event data
 * - Tag indexes: ["events_by_type", eventType, ...tags, eventId] → eventId (pointer)
 *
 * Provides optimistic locking with automatic retry for concurrent modifications.
 *
 * **Query Tuple Pattern:**
 *
 * The repository uses a flexible tuple-based approach for loading events, where each
 * tuple specifies zero or more tags followed by an event type. This allows querying
 * events by type and tag combinations in a single operation.
 *
 * **Example - No tags (all events of type):**
 * ```typescript
 * getQueryTuples: (cmd) => [
 *   ["RestaurantCreatedEvent"]  // Load all RestaurantCreatedEvent
 * ]
 * ```
 *
 * **Example - Single tag:**
 * ```typescript
 * getQueryTuples: (cmd) => [
 *   ["tenant:acme", "RestaurantOrderPlacedEvent"]  // Orders for tenant acme
 * ]
 * ```
 *
 * **Example - Multiple tags:**
 * ```typescript
 * getQueryTuples: (cmd) => [
 *   ["tenant:acme", "priority:high", "RestaurantOrderPlacedEvent"]  // High priority orders for tenant acme
 * ]
 * ```
 *
 * **Tag-Based Indexing:**
 *
 * Tags are automatically extracted from event fields specified in the event's `tagFields`
 * property. Only string-typed fields can be configured as tag fields.
 * The repository generates all possible tag subset combinations (2^n - 1) as index
 * entries, trading write amplification for O(1) query performance.
 *
 * To query by entityId, include "id" in your event's tagFields configuration.
 *
 * The maximum number of tag fields per event is configurable via the `maxTagFields`
 * constructor parameter (default: 5, which generates 2^5-1=31 index entries per event).
 *
 * @typeParam C - Command type (must conform to CommandShape)
 * @typeParam Ei - Input event type (consumed by decider, must conform to EventShape)
 * @typeParam Eo - Output event type (produced by decider, must conform to EventShape)
 */
export class DenoKvEventSourcedRepository<
  C extends CommandShape,
  Ei extends EventShape,
  Eo extends EventShape,
> implements
  IEventRepository<C, Ei, Eo, Record<PropertyKey, never>, EventMetadata> {
  /**
   * Creates a new EventSourcedRepository.
   *
   * @param kv - Deno KV instance for storage
   * @param getQueryTuples - Returns array of query tuples to load for this command
   * @param maxRetries - Maximum optimistic locking retry attempts (default: 10)
   * @param maxTagFields - Maximum number of tag fields per event (default: 5, generates 2^5-1=31 indexes)
   * @param idempotent - When true, loads only the latest event per query tuple via last_event pointers (O(1) per tuple). When false, performs a full events_by_type range scan. Default: true
   */
  constructor(
    private readonly kv: Deno.Kv,
    private readonly getQueryTuples: (
      command: C,
    ) => QueryTuple<Ei>[],
    private readonly maxRetries: number = 10,
    private readonly maxTagFields: number = 5,
    private readonly idempotent: boolean = true,
  ) {
  }

  /**
   * Executes a command by loading events, computing new events, and persisting them.
   *
   * Implements optimistic locking with automatic retry:
   * 1. Load events with versionstamps
   * 2. Compute new events using decider
   * 3. Attempt to persist with versionstamp checks
   * 4. Retry on conflict up to maxRetries
   *
   * @param command - The command to execute
   * @param decider - The decider that computes new events
   * @returns Newly produced events with metadata
   * @throws OptimisticLockingError if max retries exceeded
   * @throws RepositoryError if storage operations fail
   */
  async execute(
    command: C,
    decider: IEventComputation<C, Ei, Eo>,
  ): Promise<readonly (Eo & EventMetadata)[]> {
    let attempts = 0;

    while (attempts < this.maxRetries) {
      attempts++;

      // 1. Load events with index keys
      const queryTuples = this.getQueryTuples(command);
      const { events, indexKeys } = await this.loadEvents(
        queryTuples,
      );

      // 2. Compute new events using decider
      const newEvents = decider.computeNewEvents(events, command);

      if (newEvents.length === 0) {
        return []; // No events to persist
      }

      // 3. Attempt to persist with optimistic locking
      const persistedEvents = await this.persistEvents(
        newEvents,
        indexKeys,
      );

      if (persistedEvents) {
        return persistedEvents;
      }

      // Conflict detected (persistedEvents is null), retry
    }

    // Extract first entity ID for error message (no generic id field available)
    throw new OptimisticLockingError(attempts, "unknown");
  }

  /**
   * Loads events matching the given query tuples without executing the decide-persist cycle.
   *
   * Useful for building read-side projections, debugging, or any scenario where
   * you need to inspect the event history for specific query patterns.
   *
   * @param queryTuples - Array of query tuples specifying which events to load
   * @returns A promise resolving to the loaded events in chronological order
   */
  async load(queryTuples: QueryTuple<Ei>[]): Promise<readonly Ei[]> {
    const { events } = await this.loadEvents(queryTuples);
    return events;
  }

  /**
   * Loads events using query tuples.
   *
   * Supports two modes controlled by `this.idempotent`:
   *
   * **Idempotent mode** (default): For each query tuple, reads the `last_event`
   * pointer to obtain at most one eventId per tuple. This is O(1) per tuple and
   * correct for snapshot-style events where only the latest event matters.
   *
   * **Full-replay mode**: Scans the `events_by_type` index to collect all eventIds
   * per tuple. This is O(n) per tuple and required for accumulation-style events.
   *
   * Both modes use `last_event` pointer versionstamps for optimistic locking.
   *
   * @param queryTuples - Array of query tuples to process
   * @returns Loaded events with last_event pointer keys for optimistic locking
   * @throws RepositoryError if load operation fails
   */
  private async loadEvents(
    queryTuples: QueryTuple<Ei>[],
  ): Promise<LoadedEvents<Ei>> {
    try {
      const eventIds: string[] = [];
      const lastEventKeys: { key: Deno.KvKey; versionstamp: string | null }[] =
        [];

      // Process each query tuple
      for (const tuple of queryTuples) {
        // Extract event type (last element)
        const eventType = tuple[tuple.length - 1] as Ei["kind"];

        // Extract tags (all elements except last)
        const tags = tuple.slice(0, -1) as string[];

        // Sort extracted tags alphabetically
        const sortedTags = this.sortTags(tags);

        // last_event pointer key — used for locking in both modes
        const lastEventKey: Deno.KvKey = [
          "last_event",
          eventType,
          ...sortedTags,
        ];

        if (this.idempotent) {
          // Idempotent path: read last_event pointer directly (O(1) per tuple)
          const lastEventEntry = await this.kv.get(lastEventKey);

          // Record pointer for optimistic locking (null versionstamp if no events yet)
          lastEventKeys.push({
            key: lastEventKey,
            versionstamp: lastEventEntry.versionstamp,
          });

          // If pointer exists, collect the single eventId
          if (lastEventEntry.value !== null) {
            eventIds.push(lastEventEntry.value as string);
          }
        } else {
          // Full-replay path: scan events_by_type index (O(n) per tuple)
          const prefix: Deno.KvKey = [
            "events_by_type",
            eventType,
            ...sortedTags,
          ];

          const iter = this.kv.list({ prefix });
          for await (const entry of iter) {
            eventIds.push(entry.value as string);
          }

          // Load last_event pointer for conflict detection
          const lastEventEntry = await this.kv.get(lastEventKey);
          lastEventKeys.push({
            key: lastEventKey,
            versionstamp: lastEventEntry.versionstamp,
          });
        }
      }

      // Sort by event ID (ULID) and deduplicate
      const uniqueEventIds = [...new Set(eventIds)].sort((a, b) =>
        a.localeCompare(b)
      );

      // Fetch full events from primary storage
      const events = await Promise.all(
        uniqueEventIds.map(async (eventId) => {
          const result = await this.kv.get(["events", eventId]);
          if (result.value === null) {
            throw new Error(`Event ${eventId} not found in primary storage`);
          }
          return result.value as Ei;
        }),
      );

      return {
        events,
        indexKeys: lastEventKeys,
      };
    } catch (error) {
      throw new RepositoryError("load", error as Error);
    }
  }

  /**
   * Persists events with optimistic locking.
   *
   * Creates an atomic operation that:
   * 1. Checks all loaded last_event pointer versionstamps (including null for empty result sets)
   * 2. Writes new events to primary storage
   * 3. Writes pointers to type indexes
   * 4. Updates last_event pointers for all tag subsets
   *
   * @param events - Events to persist
   * @param indexKeys - Last_event pointer keys with versionstamps for conflict detection
   * @returns Persisted events with metadata, or null if conflict detected
   * @throws RepositoryError if persist operation fails
   */
  private async persistEvents(
    events: readonly Eo[],
    indexKeys: { key: Deno.KvKey; versionstamp: string | null }[],
  ): Promise<readonly (Eo & EventMetadata)[] | null> {
    try {
      const atomic = this.kv.atomic();
      const timestamp = Date.now();
      const eventsWithMetadata: (Eo & EventMetadata)[] = [];

      // Check all loaded last_event pointer versionstamps
      for (const { key, versionstamp } of indexKeys) {
        atomic.check({ key, versionstamp });
      }

      // Write new events
      for (const event of events) {
        const eventId = monotonicUlid();
        const eventType = (event as { kind: string }).kind;

        // Primary storage
        atomic.set(["events", eventId], event);

        // Tag-based indexes - extract tagFields from the event itself
        const tagFields = event.tagFields;
        if (tagFields && tagFields.length > 0) {
          // Validate tag field count
          if (tagFields.length > this.maxTagFields) {
            throw new TagFieldConfigurationError(
              tagFields.length,
              this.maxTagFields,
              tagFields as readonly string[],
            );
          }

          const tags = this.extractTags(event, tagFields as readonly string[]);
          const sortedTags = this.sortTags(tags);
          const subsets = this.generateSubsets(sortedTags);

          for (const subset of subsets) {
            // Write event index pointer
            atomic.set(
              ["events_by_type", eventType, ...subset, eventId],
              eventId, // Store ULID as value (pointer pattern)
            );

            // Update last_event pointer for this query pattern
            atomic.set(
              ["last_event", eventType, ...subset],
              eventId, // Update pointer to latest event
            );
          }
        }

        eventsWithMetadata.push({
          ...event,
          eventId,
          timestamp,
          versionstamp: "", // Will be set after commit
        });
      }

      const result = await atomic.commit();

      if (!result.ok) {
        return null; // Conflict detected
      }

      // Update versionstamps from commit result
      return eventsWithMetadata.map((event) => ({
        ...event,
        versionstamp: result.versionstamp,
      }));
    } catch (error) {
      throw new RepositoryError("persist", error as Error);
    }
  }
  /**
   * Extracts tags from event fields in "fieldName:fieldValue" format.
   *
   * Iterates through configured tag fields and extracts string values from the event.
   * Skips undefined, null, and empty string values. Each tag is formatted as
   * "fieldName:fieldValue" with exactly one colon separator.
   *
   * @param event - Event to extract tags from
   * @param tagFields - Fields to extract as tags
   * @returns Array of tags in "fieldName:fieldValue" format
   */
  private extractTags(
    event: Eo,
    tagFields: readonly string[],
  ): Tag[] {
    const tags: Tag[] = [];

    for (const field of tagFields) {
      const value = (event as Record<string, unknown>)[field];

      // Skip undefined, null, or empty string values
      if (value === undefined || value === null || value === "") {
        continue;
      }

      // Type assertion safe due to StringFields constraint
      const stringValue = value as string;
      tags.push(`${String(field)}:${stringValue}`);
    }

    return tags;
  }

  /**
   * Sorts tags alphabetically for deterministic index keys.
   *
   * @param tags - Tags to sort
   * @returns Sorted tags in ascending lexicographic order
   */
  private sortTags(tags: Tag[]): Tag[] {
    return [...tags].sort((a, b) => a.localeCompare(b));
  }

  /**
   * Generates all non-empty subsets of tags using binary enumeration.
   *
   * Algorithm: For n tags, iterate from 1 to 2^n - 1. Each number's binary
   * representation indicates which tags to include in that subset.
   *
   * Example: tags = ["a", "b", "c"]
   * - 001 (1) → ["a"]
   * - 010 (2) → ["b"]
   * - 011 (3) → ["a", "b"]
   * - 100 (4) → ["c"]
   * - 101 (5) → ["a", "c"]
   * - 110 (6) → ["b", "c"]
   * - 111 (7) → ["a", "b", "c"]
   *
   * @param tags - Sorted tags to generate subsets from
   * @returns Array of tag subsets, each maintaining sorted order
   */
  private generateSubsets(tags: Tag[]): Tag[][] {
    if (tags.length === 0) {
      return [];
    }

    const subsets: Tag[][] = [];
    const n = tags.length;
    const totalSubsets = Math.pow(2, n) - 1; // Exclude empty set

    for (let i = 1; i <= totalSubsets; i++) {
      const subset: Tag[] = [];

      for (let j = 0; j < n; j++) {
        // Check if j-th bit is set in i
        if ((i & (1 << j)) !== 0) {
          subset.push(tags[j]);
        }
      }

      subsets.push(subset);
    }

    return subsets;
  }
}

// Export concrete repository factory functions
export { createRestaurantRepository } from "./demo/dcb/createRestaurantRepository.ts";
export { changeRestaurantMenuRepository } from "./demo/dcb/changeRestaurantMenuRepository.ts";
export { placeOrderRepository } from "./demo/dcb/placeOrderRepository.ts";
export { markOrderAsPreparedRepository } from "./demo/dcb/markOrderAsPreparedRepository.ts";
export { restaurantRepository } from "./demo/aggregate/restaurantRepository.ts";
export { orderRepository } from "./demo/aggregate/orderRepository.ts";
