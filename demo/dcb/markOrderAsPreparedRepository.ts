/**
 * Repository for MarkOrderAsPrepared decider.
 *
 * Handles order preparation commands by persisting OrderPreparedEvent
 * to Deno KV storage with optimistic locking.
 *
 * This repository queries events by order ID to check if the order exists
 * and whether it has already been prepared.
 */

import { DenoKvEventSourcedRepository } from "../../denoKvRepository.ts";
import type {
  MarkOrderAsPreparedCommand,
  OrderPreparedEvent,
  RestaurantOrderPlacedEvent,
} from "./api.ts";

/**
 * Creates a repository for MarkOrderAsPrepared decider.
 *
 * **Query Pattern:**
 * Loads events using tuples:
 * - `[(orderId, "RestaurantOrderPlacedEvent")]` - Check if order exists
 * - `[(orderId, "OrderPreparedEvent")]` - Check if order already prepared
 *
 * **Indexing Strategy:**
 * OrderPreparedEvent is indexed by order ID (primary).
 *
 * @param kv - Deno KV instance for storage
 * @returns Repository instance for handling MarkOrderAsPreparedCommand
 *
 * @example
 * ```typescript
 * const kv = await Deno.openKv();
 * const repository = markOrderAsPreparedRepository(kv);
 * const events = await repository.execute(command, markOrderAsPreparedDecider);
 * ```
 */
export const markOrderAsPreparedRepository = (kv: Deno.Kv) =>
  new DenoKvEventSourcedRepository<
    MarkOrderAsPreparedCommand,
    RestaurantOrderPlacedEvent | OrderPreparedEvent,
    OrderPreparedEvent
  >(
    kv,
    (cmd) => [
      ["orderId:" + cmd.orderId, "RestaurantOrderPlacedEvent"], // Query by order ID to check if order exists
      ["orderId:" + cmd.orderId, "OrderPreparedEvent"], // Query by order ID to check if already prepared
    ],
  );
