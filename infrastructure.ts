/**
 * Shared infrastructure types and utilities for event-sourced repositories.
 *
 * This module provides the core types, error classes, and utility functions
 * shared across repository implementations (Deno KV, PostgreSQL, etc.).
 */

import type { EventShape, QueryTuple } from "./application.ts";

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
 * Infrastructure metadata required on every command submission.
 * The CM type parameter in repositories and handlers extends this interface.
 */
export interface CommandMetadata {
  readonly idempotencyKey: string;
}

/**
 * Metadata attached to persisted events.
 *
 * @property eventId - ULID identifier for the event
 * @property timestamp - Unix timestamp in milliseconds when event was created
 * @property versionstamp - Deno KV versionstamp for optimistic locking
 * @property idempotencyKey - The idempotency key from the originating command
 */
export interface EventMetadata {
  readonly eventId: string;
  readonly timestamp: number;
  readonly versionstamp: string;
  readonly idempotencyKey: string;
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
 * Internal error raised when a DB unique constraint violation occurs
 * due to a race condition on the idempotency key. Never propagates to callers.
 */
export class IdempotencyConflictError extends Error {
  constructor(public readonly idempotencyKey: string) {
    super(`Idempotency conflict: key=${idempotencyKey} already exists`);
    this.name = "IdempotencyConflictError";
  }
}

/**
 * Checks whether an event matches a query tuple.
 *
 * A query tuple has the format `[...tags, eventType]` where:
 * - The last element is the event type (matched against `event.kind`)
 * - All preceding elements are tags in `"fieldName:fieldValue"` format
 *
 * Returns true if and only if the event's `kind` equals the tuple's event type
 * AND every tag's fieldName:fieldValue matches the corresponding event property.
 *
 * @param event - The event to check
 * @param tuple - The query tuple to match against
 * @returns true if the event satisfies the query tuple
 */
export function matchesQueryTuple<
  Eo extends EventShape,
  Ei extends EventShape,
>(event: Eo, tuple: QueryTuple<Ei>): boolean {
  // Extract eventType (last element) and tags (all preceding elements)
  const eventType = tuple[tuple.length - 1];
  if ((event as { kind: string }).kind !== eventType) return false;

  const tags = tuple.slice(0, -1) as string[];
  for (const tag of tags) {
    const colonIndex = tag.indexOf(":");
    if (colonIndex === -1) return false;
    const fieldName = tag.substring(0, colonIndex);
    const fieldValue = tag.substring(colonIndex + 1);
    if ((event as Record<string, unknown>)[fieldName] !== fieldValue) {
      return false;
    }
  }
  return true;
}
