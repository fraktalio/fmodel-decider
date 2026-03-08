import { DcbDecider } from "../../decider.ts";
import type {
  MarkOrderAsPreparedCommand,
  OrderId,
  OrderPreparedEvent,
  RestaurantOrderPlacedEvent,
} from "./api.ts";

/**
 * State for the mark order as prepared decider
 * Tracks order ID and whether it has been prepared
 */
type MarkOrderAsPreparedState = {
  readonly orderId: OrderId | null;
  readonly prepared: boolean;
};

/**
 * Mark Order As Prepared Decider
 *
 * Requirements:
 * - Can only mark order as prepared if orderId is not null (order exists)
 * - Can only mark order as prepared if it hasn't been prepared already
 * - Handles null commands gracefully (returns empty array)
 * - Handles null events gracefully (returns current state)
 */
export const markOrderAsPreparedDecider: DcbDecider<
  MarkOrderAsPreparedCommand,
  MarkOrderAsPreparedState,
  RestaurantOrderPlacedEvent | OrderPreparedEvent,
  OrderPreparedEvent
> = new DcbDecider<
  MarkOrderAsPreparedCommand,
  MarkOrderAsPreparedState,
  RestaurantOrderPlacedEvent | OrderPreparedEvent,
  OrderPreparedEvent
>(
  (command, currentState) => {
    switch (command?.kind) {
      case "MarkOrderAsPreparedCommand": {
        // Check if order exists
        if (currentState.orderId === null) {
          throw new Error("Order does not exist!");
        }

        // Check if order already prepared
        if (currentState.prepared) {
          throw new Error("Order already prepared!");
        }

        // Mark order as prepared
        return [
          {
            kind: "OrderPreparedEvent",
            id: command.orderId,
            orderId: command.orderId,
            final: false,
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
      case "RestaurantOrderPlacedEvent":
        return {
          orderId: event.orderId,
          prepared: false,
        };

      case "OrderPreparedEvent":
        return {
          ...currentState,
          prepared: true,
        };

      default: {
        // Handle null events gracefully
        return currentState;
      }
    }
  },
  { orderId: null, prepared: false },
);
