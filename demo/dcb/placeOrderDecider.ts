import { DcbDecider } from "../../decider.ts";
import type {
  PlaceOrderCommand,
  RestaurantCreatedEvent,
  RestaurantId,
  RestaurantMenu,
  RestaurantMenuChangedEvent,
  RestaurantOrderPlacedEvent,
} from "./api.ts";

/**
 * State for the place order decider
 * Tracks restaurant ID, menu, and whether an order has been placed
 */
type PlaceOrderState = {
  readonly restaurantId: RestaurantId | null;
  readonly menu: RestaurantMenu | null;
  readonly orderPlaced: boolean; // Whether an order has been placed
};

/**
 * Place Order Decider
 *
 * Requirements:
 * - Can only place order if restaurantId is not null
 * - Can only place order if orderId does not exist (not placed already)
 * - Can only place order if all menu items in command are on the menu
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
    // Check if restaurant exists
    if (currentState.restaurantId === null) {
      throw new Error("Restaurant does not exist!");
    }

    // Check if order already placed
    if (currentState.orderPlaced) {
      throw new Error("Order already exist!");
    }

    // Check if menu exists
    if (currentState.menu === null) {
      throw new Error("Restaurant does not exist!");
    }

    // Validate all command menu items are on the restaurant menu
    const menuItemIds = new Set(
      currentState.menu.menuItems.map((item) => item.menuItemId),
    );
    const allItemsOnMenu = command.menuItems.every((item) =>
      menuItemIds.has(item.menuItemId)
    );

    if (!allItemsOnMenu) {
      throw new Error("Menu items not available!");
    }

    // All checks passed - place the order
    return [
      {
        kind: "RestaurantOrderPlacedEvent",
        restaurantId: command.id,
        orderId: command.orderId,
        menuItems: command.menuItems,
        final: false,
      },
    ];
  },
  (currentState, event) => {
    switch (event.kind) {
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
        // Exhaustive matching of the event type
        const _exhaustiveCheck: never = event;
        return currentState;
      }
    }
  },
  { restaurantId: null, menu: null, orderPlaced: false },
);
