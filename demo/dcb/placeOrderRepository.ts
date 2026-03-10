/**
 * Repository for PlaceOrder decider.
 *
 * Handles order placement commands by persisting RestaurantOrderPlacedEvent
 * to Deno KV storage with optimistic locking.
 *
 * This repository spans multiple entities (Restaurant and Order) and loads
 * events related to both the restaurant state and existing orders.
 */

import {
  DenoKvEventSourcedRepository,
  type EventMetadata,
} from "../../denoKvRepository.ts";
import type {
  PlaceOrderCommand,
  RestaurantCreatedEvent,
  RestaurantMenuChangedEvent,
  RestaurantOrderPlacedEvent,
} from "./api.ts";

/**
 * Repository for PlaceOrder decider.
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
 */
export class PlaceOrderRepository {
  private readonly repository: DenoKvEventSourcedRepository<
    PlaceOrderCommand,
    | RestaurantCreatedEvent
    | RestaurantMenuChangedEvent
    | RestaurantOrderPlacedEvent,
    RestaurantOrderPlacedEvent
  >;

  /**
   * Creates a new PlaceOrderRepository.
   *
   * @param kv - Deno KV instance for storage
   */
  constructor(kv: Deno.Kv) {
    this.repository = new DenoKvEventSourcedRepository(
      kv,
      (cmd) => [
        ["restaurantId:" + cmd.restaurantId, "RestaurantCreatedEvent"], // Query by restaurant ID
        ["restaurantId:" + cmd.restaurantId, "RestaurantMenuChangedEvent"], // Query by restaurant ID
        ["orderId:" + cmd.orderId, "RestaurantOrderPlacedEvent"], // Query by ORDER ID to check if this order exists
      ],
    );
  }

  /**
   * Executes a command.
   *
   * @param command - The command to execute
   * @returns Newly created RestaurantOrderPlacedEvent with metadata
   * @throws Error if restaurant does not exist
   * @throws Error if menu items are invalid
   * @throws Error if order already exists
   * @throws OptimisticLockingError if concurrent modification detected
   */
  async execute(
    command: PlaceOrderCommand,
  ): Promise<readonly (RestaurantOrderPlacedEvent & EventMetadata)[]> {
    const { placeOrderDecider } = await import("./placeOrderDecider.ts");
    return this.repository.execute(command, placeOrderDecider);
  }
}
