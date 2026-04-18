/**
 * Postgres repository for PlaceOrder decider.
 *
 * Handles order placement commands by persisting RestaurantOrderPlacedEvent
 * to PostgreSQL storage via `dcb.conditional_append` with optimistic locking.
 *
 * This repository spans multiple entities (Restaurant and Order) and loads
 * events related to both the restaurant state and existing orders.
 */

import type { SqlClient } from "../../postgresEventRepository.ts";
import { PostgresEventRepository } from "../../postgresEventRepository.ts";
import type {
  PlaceOrderCommand,
  RestaurantCreatedEvent,
  RestaurantMenuChangedEvent,
  RestaurantOrderPlacedEvent,
} from "./api.ts";

/**
 * Creates a Postgres-backed repository for PlaceOrder decider.
 *
 * **Query Pattern:**
 * Loads events using tuples:
 * - `[(restaurantId, "RestaurantCreatedEvent")]`
 * - `[(restaurantId, "RestaurantMenuChangedEvent")]`
 * - `[(orderId, "RestaurantOrderPlacedEvent")]` - Query by ORDER ID to check if this specific order exists
 *
 * @param client - PostgreSQL client instance
 * @returns Repository instance for handling PlaceOrderCommand
 */
export const placeOrderPostgresRepository = (
  client: SqlClient,
): PostgresEventRepository<
  PlaceOrderCommand,
  | RestaurantCreatedEvent
  | RestaurantMenuChangedEvent
  | RestaurantOrderPlacedEvent,
  RestaurantOrderPlacedEvent
> =>
  new PostgresEventRepository<
    PlaceOrderCommand,
    | RestaurantCreatedEvent
    | RestaurantMenuChangedEvent
    | RestaurantOrderPlacedEvent,
    RestaurantOrderPlacedEvent
  >(
    client,
    (cmd) => [
      ["restaurantId:" + cmd.restaurantId, "RestaurantCreatedEvent"],
      ["restaurantId:" + cmd.restaurantId, "RestaurantMenuChangedEvent"],
      ["orderId:" + cmd.orderId, "RestaurantOrderPlacedEvent"],
    ],
  );
