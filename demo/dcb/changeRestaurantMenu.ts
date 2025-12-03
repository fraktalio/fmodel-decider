import { DcbDecider } from "../../decider.ts";
import type {
  ChangeRestaurantMenuCommand,
  RestaurantCreatedEvent,
  RestaurantId,
  RestaurantMenuChangedEvent,
} from "./api.ts";

/**
 * State for the Change Restaurant Menu decider
 * Tracks restaurant ID
 */
type ChangeRestaurantMenuState = RestaurantId | null;

/**
 * Change Restaurant Menu Decider
 *
 * Requirements:
 * - Can only change menu if restaurant exists
 */
export const changeRestaurantManuDecider: DcbDecider<
  ChangeRestaurantMenuCommand,
  ChangeRestaurantMenuState,
  RestaurantCreatedEvent,
  RestaurantMenuChangedEvent
> = new DcbDecider<
  ChangeRestaurantMenuCommand,
  RestaurantId | null,
  RestaurantCreatedEvent,
  RestaurantMenuChangedEvent
>(
  (command, currentState) => {
    if (currentState === null) {
      throw new Error("Restaurant does not exist!");
    }
    return [
      {
        kind: "RestaurantMenuChangedEvent",
        restaurantId: command.id,
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
