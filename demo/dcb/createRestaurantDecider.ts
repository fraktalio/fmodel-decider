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
 * - Handles null commands gracefully (returns empty array)
 * - Handles null events gracefully (returns current state)
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
    switch (command?.kind) {
      case "CreateRestaurantCommand":
        if (currentState !== null) {
          throw new Error("Restaurant already exist!");
        }
        return [
          {
            kind: "RestaurantCreatedEvent",
            restaurantId: command.restaurantId,
            name: command.name,
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
