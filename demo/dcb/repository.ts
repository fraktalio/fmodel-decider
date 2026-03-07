/**
 * Event-sourced repository infrastructure and implementations for DCB pattern.
 *
 * This module provides the core types, error classes, generic repository
 * implementation, and concrete repository classes for event-sourced repositories
 * using Deno KV with a two-index architecture and optimistic locking.
 */

import { monotonicUlid } from "@std/ulid";
import type { IEventComputation } from "../../decider.ts";
import type { IEventRepository } from "../../application.ts";

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
 * Events loaded from storage with their versionstamps.
 *
 * @property events - Array of events in chronological order (sorted by ULID)
 * @property versionstamps - Map of event ID to versionstamp for optimistic locking
 */
export interface LoadedEvents<E> {
  readonly events: readonly E[];
  readonly versionstamps: Map<string, string>;
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
 * Generic event-sourced repository implementation using Deno KV.
 *
 * Implements the two-index architecture with pointer pattern:
 * - Primary storage: ["events", eventId] → full event data
 * - Type index: ["events_by_type", eventType, entityId, eventId] → eventId (pointer)
 *
 * Provides optimistic locking with automatic retry for concurrent modifications.
 *
 * **Tuple-Based Query Pattern:**
 *
 * The repository uses a flexible tuple-based approach for loading events, where each
 * tuple specifies an (entityId, eventType) pair. This allows querying events from
 * multiple entities and types in a single operation, which is essential for DCB patterns.
 *
 * **Example - Simple case (CreateRestaurant):**
 * ```typescript
 * getEntityIdEventTypePairs: (cmd) => [
 *   [cmd.id, "RestaurantCreatedEvent"]  // Load RestaurantCreatedEvent by restaurant ID
 * ]
 * ```
 *
 * **Example - Complex case (PlaceOrder spanning multiple entities):**
 * ```typescript
 * getEntityIdEventTypePairs: (cmd) => [
 *   [cmd.id, "RestaurantCreatedEvent"],      // Restaurant events by restaurant ID
 *   [cmd.id, "RestaurantMenuChangedEvent"],  // Menu changes by restaurant ID
 *   [cmd.id, "RestaurantOrderPlacedEvent"],  // Orders by restaurant ID
 *   [cmd.orderId, "OrderPreparedEvent"]      // Order status by order ID (different entity!)
 * ]
 * ```
 *
 * This flexibility allows DCB deciders to define consistency boundaries that span
 * multiple entities while maintaining type safety and optimistic locking.
 *
 * @typeParam C - Command type
 * @typeParam Ei - Input event type (consumed by decider)
 * @typeParam Eo - Output event type (produced by decider)
 */
export class EventSourcedRepository<C, Ei, Eo>
  implements
    IEventRepository<C, Ei, Eo, Record<PropertyKey, never>, EventMetadata> {
  /**
   * Creates a new EventSourcedRepository.
   *
   * @param kv - Deno KV instance for storage
   * @param getEntityIdEventTypePairs - Returns array of [entityId, eventType] tuples to load for this command
   * @param getEventEntityId - Extracts entity ID from event for indexing
   * @param maxRetries - Maximum optimistic locking retry attempts (default: 10)
   */
  constructor(
    private readonly kv: Deno.Kv,
    private readonly getEntityIdEventTypePairs: (
      command: C,
    ) => [string, string][],
    private readonly getEventEntityId: (event: Ei | Eo) => string,
    private readonly maxRetries: number = 10,
  ) {}

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

      // 1. Load events with versionstamps
      const entityIdEventTypePairs = this.getEntityIdEventTypePairs(command);
      const { events, versionstamps } = await this.loadEvents(
        entityIdEventTypePairs,
      );

      // 2. Compute new events using decider
      const newEvents = decider.computeNewEvents(events, command);

      if (newEvents.length === 0) {
        return []; // No events to persist
      }

      // 3. Attempt to persist with optimistic locking
      const persistedEvents = await this.persistEvents(
        newEvents,
        versionstamps,
      );

      if (persistedEvents) {
        return persistedEvents;
      }

      // Conflict detected (persistedEvents is null), retry
    }

    // Extract first entity ID for error message
    const pairs = this.getEntityIdEventTypePairs(command);
    const firstEntityId = pairs.length > 0 ? pairs[0][0] : "unknown";
    throw new OptimisticLockingError(attempts, firstEntityId);
  }

  /**
   * Loads events using the double-read pattern.
   *
   * 1. Scan type indexes to collect ULIDs and versionstamps for each (entityId, eventType) pair
   * 2. Fetch full events from primary storage
   * 3. Sort events by ULID for chronological ordering
   *
   * @param entityIdEventTypePairs - Array of [entityId, eventType] tuples to query
   * @returns Loaded events with versionstamps
   * @throws RepositoryError if load operation fails
   */
  private async loadEvents(
    entityIdEventTypePairs: [string, string][],
  ): Promise<LoadedEvents<Ei>> {
    try {
      const ulidMap = new Map<string, string>(); // ULID → versionstamp

      // Scan type indexes for all (entityId, eventType) pairs
      for (const [entityId, eventType] of entityIdEventTypePairs) {
        const iter = this.kv.list({
          prefix: ["events_by_type", eventType, entityId],
        });

        for await (const entry of iter) {
          const eventId = entry.value as string; // Pointer pattern
          ulidMap.set(eventId, entry.versionstamp);
        }
      }

      // Fetch full events from primary storage
      const ulids = Array.from(ulidMap.keys()).sort(); // Sort by ULID
      const events = await Promise.all(
        ulids.map(async (eventId) => {
          const result = await this.kv.get(["events", eventId]);
          if (result.value === null) {
            throw new Error(`Event ${eventId} not found in primary storage`);
          }
          return result.value as Ei;
        }),
      );

      return { events, versionstamps: ulidMap };
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
   * @param versionstamps - Versionstamps of loaded events for conflict detection
   * @returns Persisted events with metadata, or null if conflict detected
   * @throws RepositoryError if persist operation fails
   */
  private async persistEvents(
    events: readonly Eo[],
    versionstamps: Map<string, string>,
  ): Promise<readonly (Eo & EventMetadata)[] | null> {
    try {
      const atomic = this.kv.atomic();
      const timestamp = Date.now();
      const eventsWithMetadata: (Eo & EventMetadata)[] = [];

      // Check all loaded event versionstamps
      for (const [eventId, versionstamp] of versionstamps) {
        // Get event to determine its type and entity ID
        const result = await this.kv.get(["events", eventId]);
        if (result.value !== null) {
          const event = result.value as Ei;
          const eventType = (event as { kind: string }).kind;
          const entityId = this.getEventEntityId(event);

          atomic.check({
            key: ["events_by_type", eventType, entityId, eventId],
            versionstamp: versionstamp,
          });
        }
      }

      // Write new events
      for (const event of events) {
        const eventId = monotonicUlid();
        const eventType = (event as { kind: string }).kind;
        const entityId = this.getEventEntityId(event);

        // Primary storage
        atomic.set(["events", eventId], event);

        // Type index (pointer)
        atomic.set(
          ["events_by_type", eventType, entityId, eventId],
          eventId, // Store ULID as value (pointer pattern)
        );

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
}

// Export concrete repositories
export { CreateRestaurantRepository } from "./createRestaurantRepository.ts";
export { ChangeRestaurantMenuRepository } from "./changeRestaurantMenuRepository.ts";
export { PlaceOrderRepository } from "./placeOrderRepository.ts";
export { MarkOrderAsPreparedRepository } from "./markOrderAsPreparedRepository.ts";
