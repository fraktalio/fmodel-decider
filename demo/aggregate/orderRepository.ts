/**
 * Repository for Order aggregate.
 *
 * Handles order commands by persisting OrderEvent
 * to Deno KV storage with optimistic locking.
 */

import { DenoKvEventSourcedRepository } from "../../denoKvRepository.ts";
import type { OrderCommand, OrderEvent } from "./api.ts";

/**
 * Creates a repository for Order aggregate.
 *
 * **Query Pattern:**
 * Loads events using tuples:
 * - `[(orderId, "OrderCreatedEvent")]`
 * - `[(orderId, "OrderPreparedEvent")]`
 *
 * @param kv - Deno KV instance for storage
 * @returns Repository instance for handling OrderCommand
 *
 * @example
 * ```typescript
 * const kv = await Deno.openKv();
 * const repository = orderRepository(kv);
 * const events = await repository.execute(command, orderDecider);
 * ```
 */
export const orderRepository = (kv: Deno.Kv) =>
  new DenoKvEventSourcedRepository<
    OrderCommand,
    OrderEvent,
    OrderEvent
  >(
    kv,
    (cmd) => [
      ["orderId:" + cmd.orderId, "OrderCreatedEvent"],
      ["orderId:" + cmd.orderId, "OrderPreparedEvent"],
    ],
  );
