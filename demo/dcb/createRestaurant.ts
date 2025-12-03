import { DcbDecider } from "../../decider.ts";
import type {
  CreateRestaurantCommand,
  RestaurantCreatedEvent,
  RestaurantId,
} from "./api.ts";

/**
 * State for the Create Restaurant decider
 * Tracks restaurant ID
 */
export type CreateRestaurantState = RestaurantId | null;

/**
 * Create/Register Restaurant Decider
 *
 * Requirements:
 * - Can only create a restaurant if it does not already exist
 */
export const crateRestaurantDecider: DcbDecider<
  CreateRestaurantCommand,
  CreateRestaurantState,
  RestaurantCreatedEvent,
  RestaurantCreatedEvent
> = new DcbDecider<
  CreateRestaurantCommand,
  RestaurantId | null,
  RestaurantCreatedEvent,
  RestaurantCreatedEvent
>(
  (command, currentState) => {
    if (currentState !== null) {
      throw new Error("Restaurant already exist!");
    }
    return [
      {
        kind: "RestaurantCreatedEvent",
        restaurantId: command.id,
        name: command.name,
        menu: command.menu,
        final: false,
      },
    ];
  },
  (_currentState, event) => {
    return event.restaurantId;
  },
  null,
);
