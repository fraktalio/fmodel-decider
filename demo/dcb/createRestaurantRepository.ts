/**
 * Repository for CreateRestaurant decider.
 *
 * Handles restaurant creation commands by persisting RestaurantCreatedEvent
 * to Deno KV storage with optimistic locking.
 */

import {
  DenoKvEventSourcedRepository,
  type EventMetadata,
} from "../../denoKvRepository.ts";
import type { CreateRestaurantCommand, RestaurantCreatedEvent } from "./api.ts";

/**
 * Repository for CreateRestaurant decider.
 *
 * **Query Pattern:**
 * Loads events using tuple: `[(restaurantId, "RestaurantCreatedEvent")]`
 */
export class CreateRestaurantRepository {
  private readonly repository: DenoKvEventSourcedRepository<
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
    this.repository = new DenoKvEventSourcedRepository(
      kv,
      (cmd) => [[cmd.id, "RestaurantCreatedEvent"]], // Load RestaurantCreatedEvent by restaurant ID
    );
  }

  /**
   * Executes a command.
   *
   * @param command - The command to execute
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
