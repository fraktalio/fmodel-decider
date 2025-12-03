// Re-export all components from their individual files
export { restaurantDecider } from "./restaurantDecider.ts";
export { restaurantView } from "./restaurantView.ts";
export { orderDecider } from "./orderDecider.ts";
export { orderView } from "./orderView.ts";
export { restaurantOrderWorkflow } from "./restaurantOrderWorkflow.ts";

// Import for combined exports
import { restaurantDecider } from "./restaurantDecider.ts";
import { orderDecider } from "./orderDecider.ts";

// Re-export types
export type { Order, OrderView, Restaurant, RestaurantView } from "./api.ts";

/**
 * Combined decider that handles all restaurant and order operations
 *
 * @remarks
 * This combines the restaurant and order deciders using tuple-based composition.
 * The resulting decider can handle all command types and maintains separate state for each aggregate.
 *
 * State structure: readonly [Restaurant | null, Order | null]
 */
export const combinedDecider = restaurantDecider.combineViaTuples(orderDecider);
