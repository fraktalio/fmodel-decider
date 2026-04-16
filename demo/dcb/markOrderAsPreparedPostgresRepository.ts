/**
 * Postgres repository for MarkOrderAsPrepared decider.
 *
 * Handles order preparation commands by persisting OrderPreparedEvent
 * to PostgreSQL storage via `dcb.conditional_append` with optimistic locking.
 *
 * This repository queries events by order ID to check if the order exists
 * and whether it has already been prepared.
 */

import type { Client } from "@bartlomieju/postgres";
import { PostgresEventRepository } from "../../postgresEventRepository.ts";
import type {
  MarkOrderAsPreparedCommand,
  OrderPreparedEvent,
  RestaurantOrderPlacedEvent,
} from "./api.ts";

/**
 * Creates a Postgres-backed repository for MarkOrderAsPrepared decider.
 *
 * **Query Pattern:**
 * Loads events using tuples:
 * - `[(orderId, "RestaurantOrderPlacedEvent")]` - Check if order exists
 * - `[(orderId, "OrderPreparedEvent")]` - Check if order already prepared
 *
 * @param client - PostgreSQL client instance
 * @returns Repository instance for handling MarkOrderAsPreparedCommand
 */
export const markOrderAsPreparedPostgresRepository = (
  client: Client,
): PostgresEventRepository<
  MarkOrderAsPreparedCommand,
  RestaurantOrderPlacedEvent | OrderPreparedEvent,
  OrderPreparedEvent
> =>
  new PostgresEventRepository<
    MarkOrderAsPreparedCommand,
    RestaurantOrderPlacedEvent | OrderPreparedEvent,
    OrderPreparedEvent
  >(
    client,
    (cmd) => [
      ["orderId:" + cmd.orderId, "RestaurantOrderPlacedEvent"],
      ["orderId:" + cmd.orderId, "OrderPreparedEvent"],
    ],
  );
