/**
 * Repository for ChangeRestaurantMenu decider.
 *
 * Handles restaurant menu update commands by persisting RestaurantMenuChangedEvent
 * to Deno KV storage with optimistic locking.
 */

import { DenoKvEventSourcedRepository } from "../../denoKvRepository.ts";
import type {
  ChangeRestaurantMenuCommand,
  RestaurantCreatedEvent,
  RestaurantMenuChangedEvent,
} from "./api.ts";

/**
 * Creates a repository for ChangeRestaurantMenu decider.
 *
 * **Query Pattern:**
 * Loads events using tuple: `[(restaurantId, "RestaurantCreatedEvent")]`
 *
 * @param kv - Deno KV instance for storage
 * @returns Repository instance for handling ChangeRestaurantMenuCommand
 *
 * @example
 * ```typescript
 * const kv = await Deno.openKv();
 * const repository = changeRestaurantMenuRepository(kv);
 * const events = await repository.execute(command, changeRestaurantManuDecider);
 * ```
 */
export const changeRestaurantMenuRepository = (
  kv: Deno.Kv,
): DenoKvEventSourcedRepository<
  ChangeRestaurantMenuCommand,
  RestaurantCreatedEvent,
  RestaurantMenuChangedEvent
> =>
  new DenoKvEventSourcedRepository<
    ChangeRestaurantMenuCommand,
    RestaurantCreatedEvent,
    RestaurantMenuChangedEvent
  >(
    kv,
    (cmd) => [["restaurantId:" + cmd.restaurantId, "RestaurantCreatedEvent"]], // Load RestaurantCreatedEvent by restaurant ID
  );
