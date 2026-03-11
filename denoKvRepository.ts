/**
 * Event-sourced repository infrastructure and implementations for DCB pattern.
 *
 * This module provides the core types, error classes, generic repository
 * implementation, and concrete repository classes for event-sourced repositories
 * using Deno KV with a two-index architecture and optimistic locking.
 */

import { monotonicUlid } from "@std/ulid";
import type { IEventComputation } from "./decider.ts";
import type { IEventRepository } from "./application.ts";

/**
 * Shape constraint for commands.
 *
 * Commands must have a `kind` field identifying the command type.
 */
export type CommandShape = {
  readonly kind: string; // The kind/type/name of the command
};

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
 * Shape constraint for events with type-safe tagFields.
 *
 * Events must have a `kind` field identifying the event type.
 * Events can optionally declare `tagFields` - an array of field names to be indexed as tags.
 */
export type EventShape = {
  readonly kind: string; // The kind/type/name of the event
  readonly tagFields?: readonly string[]; // Optional: fields to index as tags (constrained in concrete types)
};

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
 * Query tuple type supporting zero or more tags followed by event type.
 *
 * Examples:
 * - ["RestaurantOrderPlacedEvent"] - no tags
 * - ["tenant:acme", "RestaurantOrderPlacedEvent"] - one tag
 * - ["tenant:acme", "priority:high", "RestaurantOrderPlacedEvent"] - two tags
 */
export type QueryTuple<Ei extends EventShape> = [...string[], Ei["kind"]];

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
 * @property indexKeys - Array of index keys with versionstamps for optimistic locking
 */
export interface LoadedEvents<E> {
  readonly events: readonly E[];
  readonly indexKeys: { key: Deno.KvKey; versionstamp: string }[];
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
 * Tags are automatically extracted from event fields specified in the `tagFields`
 * constructor parameter. Only string-typed fields can be configured as tag fields.
 * The repository generates all possible tag subset combinations (2^n - 1) as index
 * entries, trading write amplification for O(1) query performance.
 *
 * To query by entityId, include "id" in your tagFields configuration.
 *
 * Maximum 5 tag fields are allowed to bound write amplification to 31 index entries
 * per event (2^5 - 1 tag subsets).
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
   */
  constructor(
    private readonly kv: Deno.Kv,
    private readonly getQueryTuples: (
      command: C,
    ) => QueryTuple<Ei>[],
    private readonly maxRetries: number = 10,
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
   * Loads events using query tuples.
   *
   * For backward compatibility, this implementation treats query tuples as
   * [entityId, eventType] pairs (ignoring any additional tags for now).
   * Full tag-based querying will be implemented in subsequent tasks.
   *
   * 1. Scan type indexes to collect ULIDs and versionstamps for each query tuple
   * 2. Fetch full events from primary storage
   * 3. Sort events by ULID for chronological ordering
   *
   * @param queryTuples - Array of query tuples to process
   * @returns Loaded events with versionstamps
   * @throws RepositoryError if load operation fails
   */
  private async loadEvents(
    queryTuples: QueryTuple<Ei>[],
  ): Promise<LoadedEvents<Ei>> {
    try {
      const indexKeys: {
        key: Deno.KvKey;
        versionstamp: string;
        eventId: string;
      }[] = [];

      // Process each query tuple
      for (const tuple of queryTuples) {
        // Extract event type (last element)
        const eventType = tuple[tuple.length - 1] as Ei["kind"];

        // Extract tags (all elements except last)
        const tags = tuple.slice(0, -1) as string[];

        // Sort extracted tags alphabetically
        const sortedTags = this.sortTags(tags);

        // Build index prefix
        const prefix: Deno.KvKey = ["events_by_type", eventType, ...sortedTags];

        // Scan index
        const iter = this.kv.list({ prefix });

        for await (const entry of iter) {
          const eventId = entry.value as string; // Pointer pattern
          indexKeys.push({
            key: entry.key,
            versionstamp: entry.versionstamp,
            eventId,
          });
        }
      }

      // Sort by event ID (ULID) and deduplicate
      const sortedKeys = indexKeys.sort((a, b) =>
        a.eventId.localeCompare(b.eventId)
      );
      const uniqueEventIds = [...new Set(sortedKeys.map((k) => k.eventId))];

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
        indexKeys: sortedKeys.map(({ key, versionstamp }) => ({
          key,
          versionstamp,
        })),
      };
    } catch (error) {
      throw new RepositoryError("load", error as Error);
    }
  }

  /**
   * Persists events with optimistic locking.
   *
   * Creates an atomic operation that:
   * 1. Checks all loaded event versionstamps
   * 2. Writes new events to primary storage
   * 3. Writes pointers to type indexes
   *
   * @param events - Events to persist
   * @param indexKeys - Index keys with versionstamps for conflict detection
   * @returns Persisted events with metadata, or null if conflict detected
   * @throws RepositoryError if persist operation fails
   */
  private async persistEvents(
    events: readonly Eo[],
    indexKeys: { key: Deno.KvKey; versionstamp: string }[],
  ): Promise<readonly (Eo & EventMetadata)[] | null> {
    try {
      const atomic = this.kv.atomic();
      const timestamp = Date.now();
      const eventsWithMetadata: (Eo & EventMetadata)[] = [];

      // Check all loaded event versionstamps using stored keys
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
          if (tagFields.length > 5) {
            throw new TagFieldConfigurationError(
              tagFields.length,
              5,
              tagFields as readonly string[],
            );
          }

          const tags = this.extractTags(event, tagFields as readonly string[]);
          const sortedTags = this.sortTags(tags);
          const subsets = this.generateSubsets(sortedTags);

          for (const subset of subsets) {
            atomic.set(
              ["events_by_type", eventType, ...subset, eventId],
              eventId, // Store ULID as value (pointer pattern)
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
