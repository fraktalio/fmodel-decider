/**
 * Repository for CreateRestaurant decider.
 *
 * Handles restaurant creation commands by persisting RestaurantCreatedEvent
 * to Deno KV storage with optimistic locking.
 */

import { type EventMetadata, EventSourcedRepository } from "./repository.ts";
import type { CreateRestaurantCommand, RestaurantCreatedEvent } from "./api.ts";

/**
 * Repository for CreateRestaurant decider.
 *
 * **Query Pattern:**
 * Loads events using tuple: `[(restaurantId, "RestaurantCreatedEvent")]`
 */
export class CreateRestaurantRepository {
  private readonly repository: EventSourcedRepository<
    CreateRestaurantCommand,
    RestaurantCreatedEvent,
    RestaurantCreatedEvent
  >;

  /**
   * Creates a new CreateRestaurantRepository.
   *
   * @param kv - Deno KV instance for storage
   */
  constructor(kv: Deno.Kv) {
    this.repository = new EventSourcedRepository(
      kv,
      (cmd) => [[cmd.restaurantId, "RestaurantCreatedEvent"]], // Load RestaurantCreatedEvent by restaurant ID
      (evt) => evt.restaurantId, // Entity ID from event
    );
  }

  /**
   * Executes a CreateRestaurantCommand.
   *
   * @param command - The restaurant creation command
   * @returns Newly created RestaurantCreatedEvent with metadata
   * @throws Error if restaurant already exists
   * @throws OptimisticLockingError if concurrent creation detected
   */
  async execute(
    command: CreateRestaurantCommand,
  ): Promise<readonly (RestaurantCreatedEvent & EventMetadata)[]> {
    const { crateRestaurantDecider } = await import(
      "./createRestaurantDecider.ts"
    );
    return this.repository.execute(command, crateRestaurantDecider);
  }
}
