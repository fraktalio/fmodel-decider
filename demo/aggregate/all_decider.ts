/**
 * Combined domain deciders for the Aggregate pattern.
 *
 * @remarks
 * This module combines Restaurant and Order aggregates into a single unified decider
 * using the `combineViaTuples()` method. This approach is similar to the DCB pattern
 * but maintains traditional aggregate boundaries.
 *
 * **Key characteristics:**
 * - Uses `combineViaTuples()` which sends commands to ALL deciders
 * - Each decider handles unrecognized commands gracefully (returns empty array)
 * - State is a tuple: `[Restaurant | null, Order | null]`
 * - Maintains strong consistency boundaries per aggregate entity
 *
 * **How combineViaTuples() works:**
 * When you send a `CreateRestaurantCommand`:
 * 1. `restaurantDecider` processes it ✅ (creates RestaurantCreatedEvent)
 * 2. `orderDecider` processes it ✅ (returns [] in default case)
 *
 * When you send a `CreateOrderCommand`:
 * 1. `restaurantDecider` processes it ✅ (returns [] in default case)
 * 2. `orderDecider` processes it ✅ (creates OrderCreatedEvent)
 *
 * All deciders process every command, but only the relevant one produces events.
 *
 * **Comparison with DCB pattern:**
 * - Both use `combineViaTuples()` for composition
 * - Aggregate: Fixed boundaries per entity (Restaurant, Order)
 * - DCB: Dynamic boundaries per use case (CreateRestaurant, PlaceOrder, etc.)
 *
 * **Usage:**
 * ```ts
 * // Option 1: Use combined decider through single repository
 * const repository = new AllDeciderRepository(kv);
 * await repository.execute(createRestaurantCommand);
 * await repository.execute(createOrderCommand);
 *
 * // Option 2: Use individual deciders through separate repositories
 * const restaurantRepo = new RestaurantRepository(kv);
 * const orderRepo = new OrderRepository(kv);
 * await restaurantRepo.execute(createRestaurantCommand);
 * await orderRepo.execute(createOrderCommand);
 * ```
 *
 * Both approaches are valid. The combined approach is simpler for application code,
 * while separate repositories provide more explicit boundaries.
 */

import { restaurantDecider } from "./restaurantDecider.ts";
import { orderDecider } from "./orderDecider.ts";

// Export individual deciders
export { restaurantDecider } from "./restaurantDecider.ts";
export { orderDecider } from "./orderDecider.ts";

/**
 * Combined decider for all aggregates using tuple-based composition.
 *
 * @remarks
 * This combined decider uses `combineViaTuples()` which sends commands to ALL deciders.
 * Each decider handles unrecognized commands gracefully by returning empty arrays.
 *
 * **How it works:**
 * - ALL deciders process EVERY command
 * - Unrecognized commands return [] in default case
 * - Only the relevant decider produces events
 *
 * **State composition:**
 * The combined state is a tuple: `[Restaurant | null, Order | null]`
 * - First element: Restaurant aggregate state
 * - Second element: Order aggregate state
 *
 * **Event handling:**
 * Events are processed by ALL deciders:
 * - RestaurantEvent → restaurantDecider.evolve() updates first element
 * - OrderEvent → orderDecider.evolve() updates second element
 * - Each decider returns unchanged state for unrecognized events
 *
 * This approach maintains traditional DDD aggregate boundaries while using
 * tuple-based composition similar to the DCB pattern.
 */
export const all_domain_decider = restaurantDecider.combineViaTuples(
  orderDecider,
);
