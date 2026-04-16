/**
 * Combined Postgres repository for all DCB deciders.
 *
 * @remarks
 * This is the Postgres equivalent of `AllDeciderRepository` (Deno KV).
 * It uses `PostgresEventRepository` instead of `DenoKvEventRepository`
 * and accepts a `Client` from `@bartlomieju/postgres`.
 *
 * See `all_deciderRepository.ts` for detailed documentation on the
 * combined vs sliced approach.
 */

import type { Client } from "@bartlomieju/postgres";
import { PostgresEventRepository } from "../../postgresEventRepository.ts";
import type { EventMetadata } from "../../infrastructure.ts";
import { all_domain_decider } from "./all_decider.ts";
import type { Command, Event } from "./api.ts";

/**
 * Combined Postgres repository — for educational purposes.
 *
 * @remarks
 * Postgres equivalent of `AllDeciderRepository`. Uses the same
 * `all_domain_decider` and query tuple pattern, backed by
 * `PostgresEventRepository` instead of `DenoKvEventRepository`.
 */
export class AllDeciderPostgresRepository {
  private readonly repository: PostgresEventRepository<Command, Event, Event>;

  constructor(client: Client) {
    this.repository = new PostgresEventRepository(
      client,
      (cmd) => {
        switch (cmd.kind) {
          case "CreateRestaurantCommand":
            return [
              ["restaurantId:" + cmd.restaurantId, "RestaurantCreatedEvent"],
            ];
          case "ChangeRestaurantMenuCommand":
            return [
              ["restaurantId:" + cmd.restaurantId, "RestaurantCreatedEvent"],
            ];
          case "PlaceOrderCommand":
            return [
              ["restaurantId:" + cmd.restaurantId, "RestaurantCreatedEvent"],
              [
                "restaurantId:" + cmd.restaurantId,
                "RestaurantMenuChangedEvent",
              ],
              ["orderId:" + cmd.orderId, "RestaurantOrderPlacedEvent"],
            ];
          case "MarkOrderAsPreparedCommand":
            return [
              ["orderId:" + cmd.orderId, "RestaurantOrderPlacedEvent"],
              ["orderId:" + cmd.orderId, "OrderPreparedEvent"],
            ];
          default: {
            const _exhaustiveCheck: never = cmd;
            return [];
          }
        }
      },
    );
  }

  execute(command: Command): Promise<readonly (Event & EventMetadata)[]> {
    return this.repository.execute(command, all_domain_decider);
  }

  executeBatch(
    commands: readonly Command[],
  ): Promise<readonly (Event & EventMetadata)[]> {
    return this.repository.executeBatch(commands, all_domain_decider);
  }
}
