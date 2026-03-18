/**
 * Repository for PlaceOrder decider.
 *
 * Handles order placement commands by persisting RestaurantOrderPlacedEvent
 * to Deno KV storage with optimistic locking.
 *
 * This repository spans multiple entities (Restaurant and Order) and loads
 * events related to both the restaurant state and existing orders.
 */

import { DenoKvEventSourcedRepository } from "../../denoKvRepository.ts";
import type {
  PlaceOrderCommand,
  RestaurantCreatedEvent,
  RestaurantMenuChangedEvent,
  RestaurantOrderPlacedEvent,
} from "./api.ts";

/**
 * Creates a repository for PlaceOrder decider.
 *
 * **Query Pattern:**
 * Loads events using tuples:
 * - `[(restaurantId, "RestaurantCreatedEvent")]`
 * - `[(restaurantId, "RestaurantMenuChangedEvent")]`
 * - `[(orderId, "RestaurantOrderPlacedEvent")]` - Query by ORDER ID to check if this specific order exists
 *
 * **Indexing Strategy:**
 * RestaurantOrderPlacedEvent is indexed by BOTH order ID (primary) and restaurant ID (additional).
 * This supports:
 * - PlaceOrder use case: Query by order ID to check if order exists
 * - Future queries: Query by restaurant ID to get all orders for a restaurant
 *
 * @param kv - Deno KV instance for storage
 * @returns Repository instance for handling PlaceOrderCommand
 *
 * @example
 * ```typescript
 * const kv = await Deno.openKv();
 * const repository = placeOrderRepository(kv);
 * const events = await repository.execute(command, placeOrderDecider);
 * ```
 */
export const placeOrderRepository = (kv: Deno.Kv): DenoKvEventSourcedRepository<
  PlaceOrderCommand,
  | RestaurantCreatedEvent
  | RestaurantMenuChangedEvent
  | RestaurantOrderPlacedEvent,
  RestaurantOrderPlacedEvent
> =>
  new DenoKvEventSourcedRepository<
    PlaceOrderCommand,
    | RestaurantCreatedEvent
    | RestaurantMenuChangedEvent
    | RestaurantOrderPlacedEvent,
    RestaurantOrderPlacedEvent
  >(
    kv,
    (cmd) => [
      ["restaurantId:" + cmd.restaurantId, "RestaurantCreatedEvent"], // Query by restaurant ID
      ["restaurantId:" + cmd.restaurantId, "RestaurantMenuChangedEvent"], // Query by restaurant ID
      ["orderId:" + cmd.orderId, "RestaurantOrderPlacedEvent"], // Query by ORDER ID to check if this order exists
    ],
  );
