import { Projection } from "../../view.ts";
import type {
  MenuItem,
  OrderId,
  OrderPreparedEvent,
  OrderStatus,
  RestaurantId,
  RestaurantOrderPlacedEvent,
} from "./api.ts";

/**
 * A pure event handling algorithm, responsible for translating the events into denormalized view state, which is more adequate for querying.
 * ___
 * It does not produce any side effects, such as I/O, logging, etc.
 * It utilizes type narrowing to make sure that the event is handled exhaustively.
 * https://www.typescriptlang.org/docs/handbook/2/narrowing.html#exhaustiveness-checking
 * ___
 * @param s - a view state that is being evolved out of the events - `OrderView | null`
 * @param e - event type that is being handled - `OrderEvent`
 */
export const orderView: Projection<OrderView | null, OrderEvent> =
  new Projection<
    OrderView | null,
    OrderEvent
  >(
    (currentState, event) => {
      switch (event.kind) {
        case "RestaurantOrderPlacedEvent":
          return {
            orderId: event.orderId,
            restaurantId: event.restaurantId,
            menuItems: event.menuItems,
            status: "CREATED",
          };
        case "OrderPreparedEvent":
          return currentState !== null
            ? {
              orderId: currentState.orderId,
              restaurantId: currentState.restaurantId,
              menuItems: currentState.menuItems,
              status: "PREPARED",
            }
            : currentState;
        default: {
          // Exhaustive matching of the event type
          const _exhaustiveCheck: never = event;
          return currentState;
        }
      }
    },
    null,
  );

type OrderEvent = OrderPreparedEvent | RestaurantOrderPlacedEvent;

export type OrderView = {
  readonly orderId: OrderId;
  readonly restaurantId: RestaurantId;
  readonly menuItems: MenuItem[];
  readonly status: OrderStatus;
};
