import { DcbDecider } from "../../decider.ts";
import {
  MenuItemsNotAvailableError,
  OrderAlreadyExistsError,
  type PlaceOrderCommand,
  type RestaurantCreatedEvent,
  type RestaurantId,
  type RestaurantMenu,
  type RestaurantMenuChangedEvent,
  RestaurantNotFoundError,
  type RestaurantOrderPlacedEvent,
} from "./api.ts";

/**
 * State for the place order decider
 * Tracks restaurant ID, menu, and whether THIS order has been placed
 */
type PlaceOrderState = {
  readonly restaurantId: RestaurantId | null;
  readonly menu: RestaurantMenu | null;
  readonly orderPlaced: boolean; // Whether THIS specific order has been placed
};

/**
 * Place Order Decider
 *
 * Requirements:
 * - Can only place order if restaurantId is not null
 * - Can only place order if orderId does not exist (not placed already)
 * - Can only place order if all menu items in command are on the menu
 * - Handles null commands gracefully (returns empty array)
 * - Handles null events gracefully (returns current state)
 */
export const placeOrderDecider: DcbDecider<
  PlaceOrderCommand,
  PlaceOrderState,
  | RestaurantCreatedEvent
  | RestaurantMenuChangedEvent
  | RestaurantOrderPlacedEvent,
  RestaurantOrderPlacedEvent
> = new DcbDecider<
  PlaceOrderCommand,
  PlaceOrderState,
  | RestaurantCreatedEvent
  | RestaurantMenuChangedEvent
  | RestaurantOrderPlacedEvent,
  RestaurantOrderPlacedEvent
>(
  (command, currentState) => {
    switch (command?.kind) {
      case "PlaceOrderCommand": {
        // Check if restaurant exists
        if (currentState.restaurantId === null) {
          throw new RestaurantNotFoundError(command.restaurantId);
        }

        // Check if THIS specific order already exists
        // (Repository filters by order ID, so we only see events for this order)
        if (currentState.orderPlaced) {
          throw new OrderAlreadyExistsError(command.orderId);
        }

        // Check if menu exists
        if (currentState.menu === null) {
          throw new RestaurantNotFoundError(command.restaurantId);
        }

        // Validate all command menu items are on the restaurant menu
        const menuItemIds = new Set(
          currentState.menu.menuItems.map((item) => item.menuItemId),
        );
        const unavailableItems = command.menuItems
          .filter((item) => !menuItemIds.has(item.menuItemId))
          .map((item) => item.menuItemId);

        if (unavailableItems.length > 0) {
          throw new MenuItemsNotAvailableError(unavailableItems);
        }

        // All checks passed - place the order
        return [
          {
            kind: "RestaurantOrderPlacedEvent",
            restaurantId: command.restaurantId,
            orderId: command.orderId,
            menuItems: command.menuItems,
            final: false,
            tagFields: ["restaurantId", "orderId"],
          },
        ];
      }
      default: {
        // Handle null commands gracefully
        return [];
      }
    }
  },
  (currentState, event) => {
    switch (event?.kind) {
      case "RestaurantCreatedEvent":
        return {
          restaurantId: event.restaurantId,
          menu: event.menu,
          orderPlaced: false,
        };

      case "RestaurantMenuChangedEvent":
        return {
          ...currentState,
          menu: event.menu,
        };

      case "RestaurantOrderPlacedEvent":
        return {
          ...currentState,
          orderPlaced: true,
        };

      default: {
        // Handle null events gracefully
        return currentState;
      }
    }
  },
  { restaurantId: null, menu: null, orderPlaced: false },
);
