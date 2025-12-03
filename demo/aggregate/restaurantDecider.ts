import { AggregateDecider } from "../../decider.ts";
import type { Restaurant, RestaurantCommand, RestaurantEvent } from "./api.ts";

/**
 * Restaurant `pure` event-sourced command handler / a decision-making component
 * ___
 * A pure command handling algorithm, responsible for evolving the state of the restaurant.
 * It does not produce any side effects, such as I/O, logging, etc.
 * It utilizes type narrowing to make sure that the command is handled exhaustively.
 * https://www.typescriptlang.org/docs/handbook/2/narrowing.html#exhaustiveness-checking
 * ___
 * @param c - command type that is being handled - `RestaurantCommand`
 * @param s - state type that is being evolved - `Restaurant | null`
 * @param e - event type that is being produced / a fact / an outcome of the decision - `RestaurantEvent`
 */
export const restaurantDecider: AggregateDecider<
  RestaurantCommand,
  Restaurant | null,
  RestaurantEvent
> = new AggregateDecider<RestaurantCommand, Restaurant | null, RestaurantEvent>(
  (command, currentState) => {
    switch (command.kind) {
      case "CreateRestaurantCommand":
        if (currentState !== null && currentState.restaurantId !== undefined) {
          throw new Error("Restaurant already exist!");
        }
        return [
          {
            decider: "Restaurant",
            kind: "RestaurantCreatedEvent",
            id: command.id,
            name: command.name,
            menu: command.menu,
            final: false,
          },
        ];
      case "ChangeRestaurantMenuCommand":
        if (currentState === null) {
          throw new Error("Restaurant does not exist!");
        }
        return [
          {
            decider: "Restaurant",
            kind: "RestaurantMenuChangedEvent",
            id: currentState.restaurantId,
            menu: command.menu,
            final: false,
          },
        ];
      case "PlaceOrderCommand":
        if (currentState === null) {
          throw new Error("Restaurant does not exist!");
        }
        return [
          {
            decider: "Restaurant",
            kind: "RestaurantOrderPlacedEvent",
            id: command.id,
            orderId: command.orderId,
            menuItems: command.menuItems,
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
      case "RestaurantCreatedEvent":
        return { restaurantId: event.id, name: event.name, menu: event.menu };
      case "RestaurantMenuChangedEvent":
        return currentState !== null
          ? {
            restaurantId: currentState.restaurantId,
            name: currentState.name,
            menu: event.menu,
          }
          : currentState;
      case "RestaurantOrderPlacedEvent":
        return currentState;
      default: {
        // Exhaustive matching of the event type
        const _exhaustiveCheck: never = event;
        return currentState;
      }
    }
  },
  null,
);
