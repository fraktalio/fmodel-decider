/**
 * Combined repository for all DCB deciders.
 *
 * @remarks
 * **IMPORTANT: This file demonstrates the combined approach with DCB deciders.**
 *
 * This repository creates a single repository that handles all commands using
 * the combined `all_domain_decider`. This approach works because all deciders
 * handle null commands gracefully (returning empty arrays for unrecognized commands).
 *
 * **How it works:**
 * When you send a `CreateRestaurantCommand`:
 * 1. `crateRestaurantDecider` processes it ✅ (creates RestaurantCreatedEvent)
 * 2. `changeRestaurantManuDecider` processes it ✅ (returns [] in default case)
 * 3. `placeOrderDecider` processes it ✅ (returns [] in default case)
 * 4. `markOrderAsPreparedDecider` processes it ✅ (returns [] in default case)
 *
 * All deciders process the command, but only the relevant one produces events.
 *
 * **Two approaches for DCB:**
 *
 * **1. Combined approach (this repository):**
 * ```ts
 * const repository = new AllDeciderRepository(kv);
 * await repository.execute(createRestaurantCommand);
 * await repository.execute(placeOrderCommand);
 * ```
 * - Single repository handles all commands
 * - Simpler application code (one repository instance)
 * - All deciders process every command (more computation)
 * - Single query pattern must handle all use cases
 *
 * **2. Sliced approach (separate repositories):**
 * ```ts
 * const createRepo = new CreateRestaurantRepository(kv);
 * const placeOrderRepo = new PlaceOrderRepository(kv);
 * await createRepo.execute(createRestaurantCommand);
 * await placeOrderRepo.execute(placeOrderCommand);
 * ```
 * - Each repository uses only its specific decider
 * - More repository instances to manage
 * - Only relevant decider processes each command (less computation)
 * - Simpler query patterns (focused on single use case)
 * - Explicit use case boundaries
 *
 * **Comparison with Aggregate pattern:**
 * - Aggregate pattern: Uses `combine()` which routes commands to the right decider
 * - DCB pattern: Uses `combineViaTuples()` which sends commands to ALL deciders
 *
 * **Choose based on your needs:**
 * - Combined: Simpler application code, acceptable for small domains
 * - Sliced: Better performance, clearer boundaries, better for larger domains
 *
 * This file exists for educational purposes to demonstrate both approaches.
 */

import {
  DenoKvEventSourcedRepository,
  type EventMetadata,
} from "../../denoKvRepository.ts";
import { all_domain_decider } from "./all_decider.ts";
import type { Command, Event } from "./api.ts";

/**
 * Combined repository - for educational purposes.
 *
 * @remarks
 * This repository demonstrates a combined approach with DCB deciders.
 * It works because `combineViaTuples()` sends commands to all deciders,
 * and each decider handles null commands gracefully.
 *
 * **Two valid approaches:**
 * - Combined (this): Single repository, simpler application code
 * - Sliced: Separate repositories per use case, better performance
 *
 * Choose based on your domain size and performance requirements.
 */
export class AllDeciderRepository {
  private readonly repository: DenoKvEventSourcedRepository<
    Command,
    Event,
    Event
  >;

  /**
   * Creates a new AllDeciderRepository.
   *
   * @param kv - Deno KV instance for storage
   */
  constructor(kv: Deno.Kv) {
    this.repository = new DenoKvEventSourcedRepository(
      kv,
      (cmd) => {
        // Determine which events to load based on command type
        switch (cmd.kind) {
          case "CreateRestaurantCommand":
            return [
              [cmd.id, "RestaurantCreatedEvent"], // Check if restaurant exists
            ];

          case "ChangeRestaurantMenuCommand":
            return [
              [cmd.id, "RestaurantCreatedEvent"], // Check if restaurant exists
            ];

          case "PlaceOrderCommand":
            return [
              [cmd.restaurantId, "RestaurantCreatedEvent"], // Load restaurant state
              [cmd.restaurantId, "RestaurantMenuChangedEvent"], // Load menu changes
              [cmd.id, "RestaurantOrderPlacedEvent"], // Check if order exists (cmd.id = orderId)
            ];

          case "MarkOrderAsPreparedCommand":
            return [
              [cmd.id, "RestaurantOrderPlacedEvent"], // Check if order exists
              [cmd.id, "OrderPreparedEvent"], // Check if already prepared
            ];

          default: {
            // Exhaustive check
            const _exhaustiveCheck: never = cmd;
            return [];
          }
        }
      },
    );
  }

  /**
   * Executes any domain command.
   *
   * @param command - The command to execute (any command type)
   * @returns Newly created events with metadata
   * @throws Error - Domain errors (e.g., "Restaurant does not exist!", "Order already exist!")
   *
   * @remarks
   * This method processes commands through all combined deciders.
   * All deciders handle the command, but only the relevant one produces events.
   */
  execute(
    command: Command,
  ): Promise<readonly (Event & EventMetadata)[]> {
    // WARNING: This will fail because all_domain_decider uses combineViaTuples()
    // which causes ALL deciders to process EVERY command
    return this.repository.execute(command, all_domain_decider);
  }
}
