import { assert, assertEquals } from "@std/assert";
import type { IAggregateDecider, IDcbDecider } from "./decider.ts";
import type { IProjection } from "./view.ts";

/**
 * A Given–When–Then test DSL for **event-sourced deciders**.
 *
 * @remarks
 * `DeciderEventSourcedSpec` allows testing any decider that derives its current
 * state from past events and computes new events in response to a command.
 *
 * It supports both {@link DcbDecider} and {@link AggregateDecider}, since both
 * implement event-sourced behavior. Unlike the state-stored version, this
 * specification does not operate directly on state but on event histories.
 *
 * @typeParam C - Command type representing the intent or instruction to be processed
 * @typeParam Ei - Input event type consumed by the decider's evolve function
 * @typeParam Eo - Output event type produced by the decider's decide function
 *
 * @example
 * Restaurant menu management testing:
 * ```ts
 * DeciderEventSourcedSpec.for(restaurantDecider)
 *   .given([restaurantCreated])
 *   .when(changeMenu)
 *   .then([menuChanged]);
 * ```
 *
 * @example
 * Payment policy testing:
 * ```ts
 * DeciderEventSourcedSpec.for(paymentPolicy)
 *   .given([paymentReceived])
 *   .when({ type: "TriggerShipping" })
 *   .then([shippingStarted]);
 * ```
 */
export const DeciderEventSourcedSpec = {
  for: <C, S, Ei, Eo>(
    decider: IDcbDecider<C, S, Ei, Eo>,
  ): DeciderESSpecification<C, Ei, Eo> => ({
    given: (events: Ei[]) => ({
      when: (command: C) => {
        const handle = () => decider.computeNewEvents(events, command);

        return {
          then: (expectedEvents: Eo[]) => {
            const result = handle();
            assertEquals(result, expectedEvents);
          },

          thenThrows: (check?: (error: Error) => boolean) => {
            try {
              handle();
              throw new Error("Expected command to throw, but it did not.");
            } catch (error) {
              if (check) assert(check(error as Error));
            }
          },
        };
      },
    }),
  }),
};

/**
 * A Given–When–Then test DSL for **state-stored deciders** (aggregates).
 *
 * @remarks
 * `DeciderStateStoredSpec` is used to test deciders that compute a new state
 * directly from a given state and a command — typically {@link AggregateDecider}.
 *
 * This reflects aggregates that use the same event type for both input and
 * output (`E`), allowing both **state-stored** and **event-sourced** testing.
 *
 * @typeParam C - Command type representing the intent or instruction to be processed
 * @typeParam S - State type representing the aggregate's internal state
 * @typeParam E - Event type (both consumed and produced) representing state changes
 *
 * @example
 * Order processing testing:
 * ```ts
 * DeciderStateStoredSpec.for(orderDecider)
 *   .given({ status: "Pending" })
 *   .when({ type: "ShipOrder" })
 *   .then({ status: "Shipped" });
 * ```
 */
export const DeciderStateStoredSpec = {
  for: <C, S, E>(
    decider: IAggregateDecider<C, S, E>,
  ): DeciderSSSpecification<C, S> => ({
    given: (state: S) => ({
      when: (command: C) => {
        const handle = () => decider.computeNewState(state, command);

        return {
          then: (expectedState: S) => {
            const result = handle();
            assertEquals(result, expectedState);
          },

          thenThrows: (check?: (error: Error) => boolean) => {
            try {
              handle();
              throw new Error("Expected command to throw, but it did not.");
            } catch (error) {
              if (check) assert(check(error as Error));
            }
          },
        };
      },
    }),
  }),
};

/**
 * Event-sourced specification type definition.
 */
export type DeciderESSpecification<C, Ei, Eo> = {
  given: (events: Ei[]) => {
    when: (command: C) => {
      then: (expectedEvents: Eo[]) => void;
      thenThrows: (assertion: (error: Error) => boolean) => void;
    };
  };
};

/**
 * State-stored specification type definition.
 */
export type DeciderSSSpecification<C, S> = {
  given: (state: S) => {
    when: (command: C) => {
      then: (expectedState: S) => void;
      thenThrows: (assertion: (error: Error) => boolean) => void;
    };
  };
};

/**
 * View specification type definition for Given–Then testing pattern.
 *
 * @typeParam S - State type representing the projection's internal state
 * @typeParam E - Event type that triggers state evolution in the projection
 */
export type ViewSpecification<S, E> = {
  given: (events: E[]) => {
    then: (expectedState: S) => void;
    thenThrows: (assertion: (error: Error) => boolean) => void;
  };
};

/**
 * A Given–Then test DSL for **projections** (event-sourced views).
 *
 * @remarks
 * `ViewSpecification` allows testing projections that evolve state by processing
 * a sequence of events. It tests the projection's ability to build up state from
 * an event stream, which is the core behavior of event-sourced projections.
 *
 * This specification is designed specifically for {@link IProjection} implementations
 * where the input and output state types are identical (Si = So = S), following
 * the progressive refinement pattern.
 *
 * The specification processes events in sequence using the projection's `evolve`
 * function, starting from the `initialState`, and verifies the final computed state.
 *
 * @typeParam S - State type representing the projection's internal state structure
 * @typeParam E - Event type that triggers state evolution in the projection
 *
 * @example
 * Restaurant view testing:
 * ```ts
 * ViewSpecification.for(restaurantProjection)
 *   .given([restaurantCreated, menuChanged, orderPlaced])
 *   .then(expectedRestaurantState);
 * ```
 *
 * @example
 * Order summary projection testing:
 * ```ts
 * ViewSpecification.for(orderSummaryProjection)
 *   .given([orderCreated, itemAdded, itemRemoved])
 *   .then({ totalItems: 1, totalAmount: 25.99 });
 * ```
 *
 * @example
 * Testing projection error handling:
 * ```ts
 * ViewSpecification.for(inventoryProjection)
 *   .given([invalidEvent])
 *   .thenThrows((error) => error.message.includes("Invalid event"));
 * ```
 *
 * @author Fraktalio
 */
export const ViewSpecification = {
  /**
   * Creates a new view specification for testing the given projection.
   *
   * @param view - The projection of type `IProjection<S, E>` to test
   * @returns A specification object that allows defining test scenarios
   */
  for: <S, E>(
    view: IProjection<S, E>,
  ): ViewSpecification<S, E> => {
    return {
      /**
       * Defines the sequence of events to process through the projection.
       *
       * @param events - Array of events to be processed in order by the projection
       * @returns An object with `then` and `thenThrows` methods for assertions
       */
      given: (events: E[]) => {
        const handle = () => {
          return events.reduce<S>(
            view.evolve,
            view.initialState,
          );
        };
        return {
          /**
           * Asserts that processing the given events results in the expected state.
           *
           * @param expectedState - The state that should result from processing all events
           */
          then: (expectedState: S) => {
            const resultState = handle();
            assertEquals(resultState, expectedState);
          },
          /**
           * Asserts that processing the given events throws an error.
           *
           * @param check - Optional function to validate the thrown error
           */
          thenThrows: (check?: (error: Error) => boolean) => {
            try {
              handle();
              throw new Error("Expected projection to throw, but it did not.");
            } catch (error) {
              if (check) assert(check(error as Error));
            }
          },
        };
      },
    };
  },
};
