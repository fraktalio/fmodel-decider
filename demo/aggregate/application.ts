// Re-export all components from their individual files
export { restaurantDecider } from "./restaurantDecider.ts";
export { restaurantView } from "./restaurantView.ts";
export { orderDecider } from "./orderDecider.ts";
export { orderView } from "./orderView.ts";
export { restaurantOrderWorkflow } from "./restaurantOrderWorkflow.ts";

// Import for combined exports
import { restaurantDecider } from "./restaurantDecider.ts";
import { orderDecider } from "./orderDecider.ts";
import { restaurantView } from "./restaurantView.ts";
import { orderView } from "./orderView.ts";

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
export const all_domain_deciders = restaurantDecider.combineViaTuples(
  orderDecider,
);

/**
 * Combined domain view that handles all events
 *
 * @remarks
 * This combines all four views/slices into a single unified view:
 * - restaurantView: Handles RestaurantCreatedEvent and RestaurantMenuChangedEvent
 * - orderView: Handles RestaurantOrderPlacedEvent and OrderPreparedEvent
 *
 * The combined view uses tuple-based state composition to keep each view's state separate.
 * State structure: readonly [readonly [RestaurantViewState, OrderViewState]
 *
 * This demonstrates how multiple independent views can be composed into a single
 * component that handles all domain events.
 */
export const all_domain_views = restaurantView
  .combineViaTuples(orderView);
