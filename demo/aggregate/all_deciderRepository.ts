/**
 * Combined repository for all Aggregate deciders.
 *
 * @remarks
 * This repository provides a unified interface for handling all domain commands
 * using the combined `all_domain_decider`. It demonstrates the Aggregate pattern's
 * tuple-based composition approach using `combineViaTuples()`.
 *
 * **How it works:**
 * When you send a `CreateRestaurantCommand`:
 * 1. The `combineViaTuples()` method sends the command to ALL deciders
 * 2. `restaurantDecider` processes it ✅ (creates RestaurantCreatedEvent)
 * 3. `orderDecider` processes it ✅ (returns [] in default case)
 *
 * When you send a `CreateOrderCommand`:
 * 1. The `combineViaTuples()` method sends the command to ALL deciders
 * 2. `restaurantDecider` processes it ✅ (returns [] in default case)
 * 3. `orderDecider` processes it ✅ (creates OrderCreatedEvent)
 *
 * **Comparison with DCB pattern:**
 *
 * **Aggregate pattern (this file):**
 * - Uses `combineViaTuples()` for composition
 * - ALL deciders process EVERY command
 * - Strong consistency boundaries per entity (Restaurant, Order)
 * - State is tuple: `[Restaurant | null, Order | null]`
 * - Fixed aggregate boundaries
 *
 * **DCB pattern:**
 * - Uses `combineViaTuples()` for composition
 * - ALL deciders process EVERY command
 * - Dynamic consistency boundaries per use case
 * - State varies per use case
 * - Flexible use-case-driven boundaries
 *
 * **Two valid approaches for Aggregate pattern:**
 *
 * **1. Combined approach (this repository):**
 * ```ts
 * const repository = new AllDeciderRepository(kv);
 * await repository.execute(createRestaurantCommand);
 * await repository.execute(createOrderCommand);
 * ```
 * - Single repository handles all commands
 * - Simpler application code (one repository instance)
 * - All deciders process every command
 * - Single query pattern must handle all aggregates
 *
 * **2. Separate repositories:**
 * ```ts
 * const restaurantRepo = new RestaurantRepository(kv);
 * const orderRepo = new OrderRepository(kv);
 * await restaurantRepo.execute(createRestaurantCommand);
 * await orderRepo.execute(createOrderCommand);
 * ```
 * - Each repository uses only its specific decider
 * - More repository instances to manage
 * - Only relevant decider processes each command (more efficient)
 * - Simpler query patterns (focused on single aggregate)
 * - More explicit aggregate boundaries
 *
 * **Choose based on your needs:**
 * - Combined: Simpler application code, good for smaller domains
 * - Separate: Better performance, clearer boundaries, better for larger domains
 */

import {
  DenoKvEventRepository,
  type EventMetadata,
} from "../../denoKvEventRepository.ts";
import { all_domain_decider } from "./all_decider.ts";
import type { Command, Event } from "./api.ts";

/**
 * Combined repository for all aggregates.
 *
 * @remarks
 * This repository demonstrates the combined approach with Aggregate deciders.
 * It uses `combine()` for efficient command routing - only the relevant
 * aggregate decider processes each command.
 *
 * **Query pattern:**
 * The query function determines which events to load based on command type.
 * It must handle all aggregate types since this is a unified repository.
 */
export class AllDeciderRepository {
  private readonly repository: DenoKvEventRepository<
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
    this.repository = new DenoKvEventRepository(
      kv,
      (cmd) => {
        // Route query pattern based on aggregate type
        switch (cmd.decider) {
          case "Restaurant":
            // Load all restaurant events for this restaurant ID
            return [
              ["restaurantId:" + cmd.restaurantId, "RestaurantCreatedEvent"],
              [
                "restaurantId:" + cmd.restaurantId,
                "RestaurantMenuChangedEvent",
              ],
              [
                "restaurantId:" + cmd.restaurantId,
                "RestaurantOrderPlacedEvent",
              ],
            ];

          case "Order":
            // Load all order events for this order ID
            return [
              ["orderId:" + cmd.orderId, "OrderCreatedEvent"],
              ["orderId:" + cmd.orderId, "OrderPreparedEvent"],
            ];

          default: {
            // Exhaustive check
            const _exhaustiveCheck: never = cmd;
            return _exhaustiveCheck;
          }
        }
      },
    );
  }

  /**
   * Executes any domain command.
   *
   * @param command - The command to execute (Restaurant or Order command)
   * @returns Newly created events with metadata
   * @throws Error - Domain errors (e.g., "Restaurant already exist!", "Order does not exist!")
   *
   * @remarks
   * This method uses `combineViaTuples()` which sends commands to ALL deciders:
   * - restaurantDecider processes every command
   * - orderDecider processes every command
   * - Only the relevant decider produces events (others return [])
   */
  execute(
    command: Command,
  ): Promise<readonly (Event & EventMetadata)[]> {
    return this.repository.execute(command, all_domain_decider);
  }
}
