import { Projection } from "../../view.ts";
import type {
  RestaurantCreatedEvent,
  RestaurantId,
  RestaurantMenu,
  RestaurantMenuChangedEvent,
  RestaurantName,
  RestaurantOrderPlacedEvent,
} from "./api.ts";

/**
 * A pure event handling algorithm, responsible for translating the events into denormalized view state, which is more adequate for querying.
 * ___
 * It does not produce any side effects, such as I/O, logging, etc.
 * It utilizes type narrowing to make sure that the event is handled exhaustively.
 * https://www.typescriptlang.org/docs/handbook/2/narrowing.html#exhaustiveness-checking
 * ___
 * @param s - a view state that is being evolved out of the events - `RestaurantView | null`
 * @param e - event type that is being handled - `RestaurantEvent`
 */
export const restaurantView: Projection<
  RestaurantView | null,
  RestaurantEvent
> = new Projection<RestaurantView | null, RestaurantEvent>(
  (currentState, event) => {
    switch (event.kind) {
      case "RestaurantCreatedEvent":
        return {
          restaurantId: event.restaurantId,
          name: event.name,
          menu: event.menu,
        };
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

export type RestaurantEvent =
  | RestaurantCreatedEvent
  | RestaurantMenuChangedEvent
  | RestaurantOrderPlacedEvent;

export type RestaurantView = {
  readonly restaurantId: RestaurantId;
  readonly name: RestaurantName;
  readonly menu: RestaurantMenu;
};
