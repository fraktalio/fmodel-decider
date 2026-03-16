/**
 * Standalone Deno KV event loader implementing `IEventLoader`.
 *
 * Provides read-only event loading by query tuples without the
 * decide-persist cycle of the full repository. Useful for on-demand
 * projections via `EventSourcedQueryHandler`.
 */

import type { EventShape, IEventLoader, QueryTuple } from "./application.ts";
import type { Tag } from "./denoKvRepository.ts";

/**
 * Deno KV implementation of `IEventLoader`.
 *
 * @remarks
 * Loads events from Deno KV using the same two-index storage layout as
 * `DenoKvEventSourcedRepository`: primary storage at `["events", eventId]`
 * and tag indexes at `["events_by_type", eventType, ...tags, eventId]`.
 *
 * Supports two loading modes:
 * - **Idempotent** (default): Reads `last_event` pointers via a single `kv.getMany()` call
 * - **Full-replay**: Scans `events_by_type` indexes via `kv.list()`
 *
 * Primary storage fetches are always batched into a single `kv.getMany()` call.
 *
 * @typeParam Ei - Event type to load
 */
export class DenoKvEventLoader<Ei extends EventShape>
  implements IEventLoader<Ei> {
  /**
   * @param kv - Deno KV instance for storage
   * @param idempotent - When true, loads only the latest event per query tuple. When false, performs full range scans. Default: true
   */
  constructor(
    private readonly kv: Deno.Kv,
    private readonly idempotent: boolean = true,
  ) {}

  async load(queryTuples: QueryTuple<Ei>[]): Promise<readonly Ei[]> {
    const eventIds: string[] = [];

    const lastEventKeysList: Deno.KvKey[] = queryTuples.map((tuple) => {
      const eventType = tuple[tuple.length - 1] as Ei["kind"];
      const tags = tuple.slice(0, -1) as string[];
      return ["last_event", eventType, ...this.sortTags(tags)];
    });

    if (this.idempotent) {
      const pointerResults = await this.kv.getMany(lastEventKeysList);
      for (const entry of pointerResults) {
        if (entry.value !== null) {
          eventIds.push(entry.value as string);
        }
      }
    } else {
      for (const tuple of queryTuples) {
        const eventType = tuple[tuple.length - 1] as Ei["kind"];
        const tags = tuple.slice(0, -1) as string[];
        const prefix: Deno.KvKey = [
          "events_by_type",
          eventType,
          ...this.sortTags(tags),
        ];
        for await (const entry of this.kv.list({ prefix })) {
          eventIds.push(entry.value as string);
        }
      }
    }

    const uniqueEventIds = [...new Set(eventIds)].sort((a, b) =>
      a.localeCompare(b)
    );

    if (uniqueEventIds.length === 0) return [];

    const primaryKeys = uniqueEventIds.map((id) =>
      ["events", id] as Deno.KvKey
    );
    const results = await this.kv.getMany(primaryKeys);

    return results.map((result, i) => {
      if (result.value === null) {
        throw new Error(
          `Event ${uniqueEventIds[i]} not found in primary storage`,
        );
      }
      return result.value as Ei;
    });
  }

  private sortTags(tags: Tag[]): Tag[] {
    return [...tags].sort((a, b) => a.localeCompare(b));
  }
}
