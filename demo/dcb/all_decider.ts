/**
 * Combined domain deciders for the DCB (Dynamic Consistency Boundary) pattern.
 *
 * @remarks
 * This module exports all individual use-case deciders for the restaurant/order domain.
 * Unlike the aggregate pattern, the DCB pattern does NOT combine deciders into a single
 * unified decider. Instead, each decider is used independently through its own repository.
 *
 * **Key difference from Aggregate pattern:**
 * - Aggregate pattern: Combines deciders using `combine()` into a single decider that routes commands
 * - DCB pattern: Each decider is independent and used through its own repository
 *
 * **Why no combined decider?**
 * The DCB pattern uses `combineViaTuples()` which creates a tuple-based composition where
 * ALL deciders process EVERY command. This doesn't work for use-case-specific deciders
 * because each decider only knows how to handle its specific commands. Attempting to
 * combine them would cause errors when a decider receives a command it doesn't recognize.
 *
 * **Correct usage:**
 * ```ts
 * // Use individual deciders through repositories
 * const createRepo = new CreateRestaurantRepository(kv);
 * const placeOrderRepo = new PlaceOrderRepository(kv);
 *
 * // Each repository uses its specific decider
 * await createRepo.execute(createRestaurantCommand);
 * await placeOrderRepo.execute(placeOrderCommand);
 * ```
 *
 * The individual deciders demonstrate:
 * - Use-case-driven consistency boundaries (each command defines what it needs)
 * - Flexible state composition (each decider has its own state)
 * - Event-sourced only computation (no state-stored mode)
 * - Cross-concept operations (PlaceOrder spans Restaurant + Order)
 */

import { crateRestaurantDecider } from "./createRestaurantDecider.ts";
import { changeRestaurantManuDecider } from "./changeRestaurantMenuDecider.ts";
import { placeOrderDecider } from "./placeOrderDecider.ts";
import { markOrderAsPreparedDecider } from "./markOrderAsPreparedDecider.ts";

// Export individual deciders for use through repositories
export { crateRestaurantDecider } from "./createRestaurantDecider.ts";
export { changeRestaurantManuDecider } from "./changeRestaurantMenuDecider.ts";
export { placeOrderDecider } from "./placeOrderDecider.ts";
export { markOrderAsPreparedDecider } from "./markOrderAsPreparedDecider.ts";

// Export types
export type { CreateRestaurantState } from "./createRestaurantDecider.ts";

/**
 * Combined decider using tuple-based composition.
 *
 * @remarks
 * **WARNING**: This combined decider is provided for completeness but should NOT be used
 * directly in production code. It will throw errors when commands are sent to deciders
 * that don't recognize them.
 *
 * The DCB pattern is designed to use individual deciders through their own repositories,
 * not as a single combined decider. This export exists primarily for demonstration and
 * educational purposes to show the difference between `combineViaTuples()` and `combine()`.
 *
 * **Do NOT use this directly**. Instead, use individual deciders through repositories.
 */
export const all_domain_decider = crateRestaurantDecider
  .combineViaTuples(changeRestaurantManuDecider)
  .combineViaTuples(placeOrderDecider)
  .combineViaTuples(markOrderAsPreparedDecider);
