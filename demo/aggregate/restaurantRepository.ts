/**
 * Repository for Restaurant aggregate.
 *
 * Handles restaurant commands by persisting RestaurantEvent
 * to Deno KV storage with optimistic locking.
 */

import { DenoKvEventSourcedRepository } from "../../denoKvRepository.ts";
import type { RestaurantCommand, RestaurantEvent } from "./api.ts";

/**
 * Creates a repository for Restaurant aggregate.
 *
 * **Query Pattern:**
 * Loads events using tuples:
 * - `[(restaurantId, "RestaurantCreatedEvent")]`
 * - `[(restaurantId, "RestaurantMenuChangedEvent")]`
 * - `[(restaurantId, "RestaurantOrderPlacedEvent")]`
 *
 * @param kv - Deno KV instance for storage
 * @returns Repository instance for handling RestaurantCommand
 *
 * @example
 * ```typescript
 * const kv = await Deno.openKv();
 * const repository = restaurantRepository(kv);
 * const events = await repository.execute(command, restaurantDecider);
 * ```
 */
export const restaurantRepository = (kv: Deno.Kv) =>
  new DenoKvEventSourcedRepository<
    RestaurantCommand,
    RestaurantEvent,
    RestaurantEvent
  >(
    kv,
    (cmd) => [
      ["restaurantId:" + cmd.restaurantId, "RestaurantCreatedEvent"],
      ["restaurantId:" + cmd.restaurantId, "RestaurantMenuChangedEvent"],
      ["restaurantId:" + cmd.restaurantId, "RestaurantOrderPlacedEvent"],
    ],
  );
