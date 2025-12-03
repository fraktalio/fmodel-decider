import { AggregateDecider } from "../../decider.ts";
import type { Order, OrderCommand, OrderEvent } from "./api.ts";

/**
 * Order `pure` event-sourced command handler / a decision-making component
 * ___
 * A pure command handling algorithm, responsible for evolving the state of the order.
 * It does not produce any side effects, such as I/O, logging, etc.
 * It utilizes type narrowing to make sure that the command is handled exhaustively.
 * https://www.typescriptlang.org/docs/handbook/2/narrowing.html#exhaustiveness-checking
 * ___
 * @param c - command type that is being handled - `OrderCommand`
 * @param s - state type that is being evolved - `Order | null`
 * @param e - event type that is being produced / a fact / an outcome of the decision - `Order`Event`
 */
export const orderDecider: AggregateDecider<
  OrderCommand,
  Order | null,
  OrderEvent
> = new AggregateDecider<OrderCommand, Order | null, OrderEvent>(
  (command, currentState) => {
    switch (command.kind) {
      case "CreateOrderCommand":
        if (currentState !== null && currentState.orderId !== undefined) {
          throw new Error("Order already exist!");
        }
        return [
          {
            version: 1,
            decider: "Order",
            kind: "OrderCreatedEvent",
            id: command.id,
            restaurantId: command.restaurantId,
            menuItems: command.menuItems,
            final: false,
          },
        ];
      case "MarkOrderAsPreparedCommand":
        if (currentState === null) {
          throw new Error("Order does not exist!");
        }
        return [
          {
            version: 1,
            decider: "Order",
            kind: "OrderPreparedEvent",
            id: currentState.orderId,
            final: false,
          },
        ];
      default: {
        // Exhaustive matching of the command type
        const _exhaustiveCheck: never = command;
        return [];
      }
    }
  },
  (currentState, event) => {
    switch (event.kind) {
      case "OrderCreatedEvent":
        return {
          orderId: event.id,
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
