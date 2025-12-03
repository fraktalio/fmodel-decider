import { crateRestaurantDecider } from "./createRestaurantDecider.ts";
import { changeRestaurantManuDecider } from "./changeRestaurantMenuDecider.ts";
import { placeOrderDecider } from "./placeOrderDecider.ts";
import { markOrderAsPreparedDecider } from "./markOrderAsPreparedDecider.ts";

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
