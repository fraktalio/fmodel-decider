/**
 * Repository for CreateRestaurant decider.
 *
 * Handles restaurant creation commands by persisting RestaurantCreatedEvent
 * to Deno KV storage with optimistic locking.
 */

import { DenoKvEventSourcedRepository } from "../../denoKvRepository.ts";
import type { CreateRestaurantCommand, RestaurantCreatedEvent } from "./api.ts";

/**
 * Creates a repository for CreateRestaurant decider.
 *
 * **Query Pattern:**
 * Loads events using tuple: `[(restaurantId, "RestaurantCreatedEvent")]`
 *
 * @param kv - Deno KV instance for storage
 * @returns Repository instance for handling CreateRestaurantCommand
 *
 * @example
 * ```typescript
 * const kv = await Deno.openKv();
 * const repository = createRestaurantRepository(kv);
 * const events = await repository.execute(command, crateRestaurantDecider);
 * ```
 */
export const createRestaurantRepository = (
  kv: Deno.Kv,
): DenoKvEventSourcedRepository<
  CreateRestaurantCommand,
  RestaurantCreatedEvent,
  RestaurantCreatedEvent
> =>
  new DenoKvEventSourcedRepository<
    CreateRestaurantCommand,
    RestaurantCreatedEvent,
    RestaurantCreatedEvent
  >(
    kv,
    (cmd) => [["restaurantId:" + cmd.restaurantId, "RestaurantCreatedEvent"]], // Load RestaurantCreatedEvent by restaurant ID
  );
