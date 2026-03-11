import { DcbDecider } from "../../decider.ts";
import {
  type ChangeRestaurantMenuCommand,
  type RestaurantCreatedEvent,
  type RestaurantId,
  type RestaurantMenuChangedEvent,
  RestaurantNotFoundError,
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
 * - Handles null commands gracefully (returns empty array)
 * - Handles null events gracefully (returns current state)
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
    switch (command?.kind) {
      case "ChangeRestaurantMenuCommand":
        if (currentState === null) {
          throw new RestaurantNotFoundError(command.restaurantId);
        }
        return [
          {
            kind: "RestaurantMenuChangedEvent",
            restaurantId: command.restaurantId,
            menu: command.menu,
            final: false,
            tagFields: ["restaurantId"],
          },
        ];
      default: {
        // Handle null commands gracefully
        return [];
      }
    }
  },
  (currentState, event) => {
    switch (event?.kind) {
      case "RestaurantCreatedEvent":
        return event.restaurantId;
      default: {
        // Handle null events gracefully
        return currentState;
      }
    }
  },
  null,
);
