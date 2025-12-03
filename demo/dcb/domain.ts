import { crateRestaurantDecider } from "./createRestaurantDecider.ts";
import { changeRestaurantManuDecider } from "./changeRestaurantMenuDecider.ts";
import { placeOrderDecider } from "./placeOrderDecider.ts";
import { markOrderAsPreparedDecider } from "./markOrderAsPreparedDecider.ts";
import { restaurantView } from "./restaurantView.ts";
import { orderView } from "./orderView.ts";

/**
 * Export all individual deciders for direct use
 */
export {
  changeRestaurantManuDecider,
  crateRestaurantDecider,
  markOrderAsPreparedDecider,
  placeOrderDecider,
};

/**
 * Combined domain decider that handles all commands
 *
 * @remarks
 * This combines all four deciders/slices into a single unified decider:
 * - createRestaurant: Creates new restaurants
 * - changeRestaurantMenu: Updates restaurant menus
 * - placeOrder: Places orders at restaurants
 * - markOrderAsPrepared: Marks orders as prepared
 *
 * The combined decider uses tuple-based state composition to keep each decider's state separate.
 * State structure: readonly [readonly [readonly [CreateRestaurantState, ChangeRestaurantMenuState], PlaceOrderState], MarkOrderAsPreparedState]
 *
 * This demonstrates how multiple independent deciders can be composed into a single
 * decision-making component that handles all domain commands.
 */
export const all_domain_decider = crateRestaurantDecider
  .combineViaTuples(changeRestaurantManuDecider)
  .combineViaTuples(placeOrderDecider)
  .combineViaTuples(markOrderAsPreparedDecider);

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
