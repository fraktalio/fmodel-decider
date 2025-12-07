import { crateRestaurantDecider } from "./createRestaurantDecider.ts";
import { changeRestaurantManuDecider } from "./changeRestaurantMenuDecider.ts";
import { placeOrderDecider } from "./placeOrderDecider.ts";
import { markOrderAsPreparedDecider } from "./markOrderAsPreparedDecider.ts";
import { type RestaurantView, restaurantView } from "./restaurantView.ts";
import { type OrderView, orderView } from "./orderView.ts";
import type { IProjection } from "../../view.ts";
import type { Command, Event } from "./api.ts";
import type { IDcbDecider } from "../../decider.ts";

/**
 * Export all individual deciders for direct use
 */
export {
  changeRestaurantManuDecider,
  crateRestaurantDecider,
  markOrderAsPreparedDecider,
  placeOrderDecider,
};

/**
 * Combined domain decider that handles all commands
 *
 * @remarks
 * This combines all four deciders/slices into a single unified decider:
 * - createRestaurant: Creates new restaurants
 * - changeRestaurantMenu: Updates restaurant menus
 * - placeOrder: Places orders at restaurants
 * - markOrderAsPrepared: Marks orders as prepared
 *
 * The combined decider uses tuple-based state composition to keep each decider's state separate.
 * State structure: readonly [readonly [readonly [CreateRestaurantState, ChangeRestaurantMenuState], PlaceOrderState], MarkOrderAsPreparedState]
 *
 * This demonstrates how multiple independent deciders can be composed into a single
 * decision-making component that handles all domain commands.
 */
export const all_domain_decider = crateRestaurantDecider
  .combineViaTuples(changeRestaurantManuDecider)
  .combineViaTuples(placeOrderDecider)
  .combineViaTuples(markOrderAsPreparedDecider);

/**
 * Combined domain view that handles all events
 *
 * @remarks
 * This combines all four views/slices into a single unified view:
 * - restaurantView: Handles RestaurantCreatedEvent and RestaurantMenuChangedEvent
 * - orderView: Handles RestaurantOrderPlacedEvent and OrderPreparedEvent
 *
 * The combined view uses tuple-based state composition to keep each view's state separate.
 * State structure: readonly [readonly [RestaurantViewState, OrderViewState]
 *
 * This demonstrates how multiple independent views can be composed into a single
 * component that handles all domain events.
 */
export const all_domain_views = restaurantView
  .combineViaTuples(orderView);

/**
 * Generic command handler for event-sourced systems
 *
 * @remarks
 * This generic function orchestrates the complete command handling flow:
 * 1. Fetches the current event history for the command
 * 2. Uses a decider to compute new events based on command and history
 * 3. For each new event, retrieves the corresponding view state
 * 4. Sequentially projects each event onto its view state to produce updated read models
 *
 * This demonstrates the separation between write-side (deciders producing events)
 * and read-side (views consuming events) in CQRS/Event Sourcing architectures.
 *
 * @typeParam C - Command type
 * @typeParam Ei - Event input type
 * @typeParam Eo - Event output type
 * @typeParam S - State type
 * @typeParam VS - View state type
 *
 * @param command - The command to handle
 * @param currentEvents - Async function that fetches the event history for the command
 * @param currentViewState - Async function that retrieves the view state for a specific event
 * @param decider - The decider that computes new events from command and history
 * @param view - The view that evolves state from events
 *
 * @returns Promise resolving to an object containing:
 * - `newEvents`: The events produced by handling the command
 * - `newViewState`: The updated view state after sequentially projecting all new events
 *
 * @example
 * ```ts
 * const result = await handleCommandGeneric(
 *   createRestaurantCommand,
 *   async (cmd) => await eventStore.getEvents(cmd.id),
 *   async (evt) => await viewStore.getStateForEvent(evt),
 *   restaurantDecider,
 *   restaurantView
 * );
 * ```
 *
 * @author Fraktalio
 */
export const handleCommandGeneric = async <C, S, Ei, Eo, VS>(
  command: C,
  currentEvents: (cmd: C) => Promise<readonly Ei[]>,
  currentViewState: (evt: Eo) => Promise<VS>,
  decider: IDcbDecider<C, S, Ei, Eo>,
  view: IProjection<VS, Eo>,
) => {
  const events = await currentEvents(command);
  const newEvents = decider.computeNewEvents(events, command);
  let newViewState = view.initialState;
  for (const event of newEvents) {
    const stateFromEvent = await currentViewState(event);
    newViewState = view.evolve(stateFromEvent, event);
  }

  return { newEvents, newViewState };
};

/**
 * Domain-specific command handler for restaurant and order operations
 *
 * @remarks
 * This is a specialized version of {@link handleCommandGeneric} configured for the
 * restaurant/order domain. It uses the combined domain slices (deciders and views) to handle
 * all commands in a unified way.
 *
 * @param command - The command to handle
 * @param currentEvents - Async function that fetches the event history for the command
 * @param currentViewState - Async function that retrieves the view state for a specific event
 *
 * @returns Promise resolving to an object containing:
 * - `newEvents`: The events produced by handling the command
 * - `newViewState`: The updated view state after sequentially projecting all new events
 *
 * @example
 * ```ts
 * const result = await handleCommand(
 *   { kind: "CreateRestaurantCommand", id: "r1", name: "Bistro", menu: {...} },
 *   async (cmd) => await eventStore.getEvents(cmd.id),
 *   async (evt) => await viewStore.getStateForEvent(evt)
 * );
 * // result.newEvents: [RestaurantCreatedEvent]
 * // result.newViewState: [{ restaurantId: "r1", ... }, null]
 * ```
 */
export const handleCommand = (
  command: Command,
  currentEvents: (cmd: Command) => Promise<readonly Event[]>,
  currentViewState: (evt: Event) => Promise<
    readonly [RestaurantView | null, OrderView | null]
  >,
) => {
  return handleCommandGeneric(
    command,
    currentEvents,
    currentViewState,
    all_domain_decider,
    all_domain_views,
  );
};
