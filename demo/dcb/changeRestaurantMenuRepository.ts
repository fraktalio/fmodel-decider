/**
 * Repository for ChangeRestaurantMenu decider.
 *
 * Handles restaurant menu update commands by persisting RestaurantMenuChangedEvent
 * to Deno KV storage with optimistic locking.
 */

import {
  DenoKvEventSourcedRepository,
  type EventMetadata,
} from "../../denoKvRepository.ts";
import type {
  ChangeRestaurantMenuCommand,
  RestaurantCreatedEvent,
  RestaurantMenuChangedEvent,
} from "./api.ts";

/**
 * Repository for ChangeRestaurantMenu decider.
 *
 * **Query Pattern:**
 * Loads events using tuple: `[(restaurantId, "RestaurantCreatedEvent")]`
 */
export class ChangeRestaurantMenuRepository {
  private readonly repository: DenoKvEventSourcedRepository<
    ChangeRestaurantMenuCommand,
    RestaurantCreatedEvent,
    RestaurantMenuChangedEvent
  >;

  /**
   * Creates a new ChangeRestaurantMenuRepository.
   *
   * @param kv - Deno KV instance for storage
   */
  constructor(kv: Deno.Kv) {
    this.repository = new DenoKvEventSourcedRepository(
      kv,
      (cmd) => [["id:" + cmd.id, "RestaurantCreatedEvent"]], // Load RestaurantCreatedEvent by restaurant ID
      ["id"], // Index by id field
    );
  }

  /**
   * Executes a command.
   *
   * @param command - The command to execute
   * @returns Newly created RestaurantMenuChangedEvent with metadata
   * @throws Error if restaurant does not exist
   * @throws OptimisticLockingError if concurrent modification detected
   */
  async execute(
    command: ChangeRestaurantMenuCommand,
  ): Promise<readonly (RestaurantMenuChangedEvent & EventMetadata)[]> {
    const { changeRestaurantManuDecider } = await import(
      "./changeRestaurantMenuDecider.ts"
    );
    return this.repository.execute(command, changeRestaurantManuDecider);
  }
}
