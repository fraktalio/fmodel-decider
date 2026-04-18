/**
 * Postgres repository for CreateRestaurant decider.
 *
 * Handles restaurant creation commands by persisting RestaurantCreatedEvent
 * to PostgreSQL storage via `dcb.conditional_append` with optimistic locking.
 */

import type { SqlClient } from "../../postgresEventRepository.ts";
import { PostgresEventRepository } from "../../postgresEventRepository.ts";
import type { CreateRestaurantCommand, RestaurantCreatedEvent } from "./api.ts";

/**
 * Creates a Postgres-backed repository for CreateRestaurant decider.
 *
 * **Query Pattern:**
 * Loads events using tuple: `[(restaurantId, "RestaurantCreatedEvent")]`
 *
 * @param client - PostgreSQL client instance
 * @returns Repository instance for handling CreateRestaurantCommand
 */
export const createRestaurantPostgresRepository = (
  client: SqlClient,
): PostgresEventRepository<
  CreateRestaurantCommand,
  RestaurantCreatedEvent,
  RestaurantCreatedEvent
> =>
  new PostgresEventRepository<
    CreateRestaurantCommand,
    RestaurantCreatedEvent,
    RestaurantCreatedEvent
  >(
    client,
    (cmd) => [["restaurantId:" + cmd.restaurantId, "RestaurantCreatedEvent"]],
  );
