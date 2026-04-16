/**
 * Postgres repository for ChangeRestaurantMenu decider.
 *
 * Handles restaurant menu update commands by persisting RestaurantMenuChangedEvent
 * to PostgreSQL storage via `dcb.conditional_append` with optimistic locking.
 */

import type { Client } from "@bartlomieju/postgres";
import { PostgresEventRepository } from "../../postgresEventRepository.ts";
import type {
  ChangeRestaurantMenuCommand,
  RestaurantCreatedEvent,
  RestaurantMenuChangedEvent,
} from "./api.ts";

/**
 * Creates a Postgres-backed repository for ChangeRestaurantMenu decider.
 *
 * **Query Pattern:**
 * Loads events using tuple: `[(restaurantId, "RestaurantCreatedEvent")]`
 *
 * @param client - PostgreSQL client instance
 * @returns Repository instance for handling ChangeRestaurantMenuCommand
 */
export const changeRestaurantMenuPostgresRepository = (
  client: Client,
): PostgresEventRepository<
  ChangeRestaurantMenuCommand,
  RestaurantCreatedEvent,
  RestaurantMenuChangedEvent
> =>
  new PostgresEventRepository<
    ChangeRestaurantMenuCommand,
    RestaurantCreatedEvent,
    RestaurantMenuChangedEvent
  >(
    client,
    (cmd) => [["restaurantId:" + cmd.restaurantId, "RestaurantCreatedEvent"]],
  );
