/**
 * Repository for Restaurant aggregate.
 *
 * Handles restaurant commands by persisting RestaurantEvent
 * to Deno KV storage with optimistic locking.
 */

import {
  DenoKvEventSourcedRepository,
  type EventMetadata,
} from "../../denoKvRepository.ts";
import type { RestaurantCommand, RestaurantEvent } from "./api.ts";

/**
 * Repository for Restaurant aggregate.
 *
 * **Query Pattern:**
 * Loads events using tuples:
 * - `[(restaurantId, "RestaurantCreatedEvent")]`
 * - `[(restaurantId, "RestaurantMenuChangedEvent")]`
 * - `[(restaurantId, "RestaurantOrderPlacedEvent")]`
 */
export class RestaurantRepository {
  private readonly repository: DenoKvEventSourcedRepository<
    RestaurantCommand,
    RestaurantEvent,
    RestaurantEvent
  >;

  /**
   * Creates a new RestaurantRepository.
   *
   * @param kv - Deno KV instance for storage
   */
  constructor(kv: Deno.Kv) {
    this.repository = new DenoKvEventSourcedRepository(
      kv,
      (cmd) => [
        ["restaurantId:" + cmd.restaurantId, "RestaurantCreatedEvent"],
        ["restaurantId:" + cmd.restaurantId, "RestaurantMenuChangedEvent"],
        ["restaurantId:" + cmd.restaurantId, "RestaurantOrderPlacedEvent"],
      ],
    );
  }

  /**
   * Executes a command.
   *
   * @param command - The command to execute
   * @returns Newly created RestaurantEvent with metadata
   * @throws Error if restaurant validation fails
   * @throws OptimisticLockingError if concurrent modification detected
   */
  async execute(
    command: RestaurantCommand,
  ): Promise<readonly (RestaurantEvent & EventMetadata)[]> {
    const { restaurantDecider } = await import("./restaurantDecider.ts");
    return this.repository.execute(command, restaurantDecider);
  }
}
