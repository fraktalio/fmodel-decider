import type { IAggregateDecider, IDcbDecider } from "./decider.ts";
import type { IProjection } from "./view.ts";

// ---------------------------------------------------------------------------
// Assertion abstraction – inject your own test framework
// ---------------------------------------------------------------------------

/**
 * Minimal assertion interface for the Given-When-Then DSL.
 *
 * Any test framework can be adapted to this two-method interface.
 * Deno's `@std/assert` satisfies it structurally out of the box.
 *
 * @example Adapter for Jest / Vitest:
 * ```typescript
 * const assertions: Assertions = {
 *   assertEquals: (actual, expected) => expect(actual).toEqual(expected),
 *   assert: (condition) => expect(condition).toBeTruthy(),
 * };
 * ```
 *
 * @example Adapter for Node.js built-in assert:
 * ```typescript
 * import nodeAssert from "node:assert";
 * const assertions: Assertions = {
 *   assertEquals: (actual, expected) => nodeAssert.deepStrictEqual(actual, expected),
 *   assert: (condition) => nodeAssert.ok(condition),
 * };
 * ```
 */
export interface Assertions {
  assertEquals<T>(actual: T, expected: T): void;
  assert(condition: boolean): void;
}

// ---------------------------------------------------------------------------
// Specification type definitions
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Spec builder types
// ---------------------------------------------------------------------------

/** Builder for event-sourced decider specifications. */
export type DeciderEventSourcedSpecBuilder = {
  for: <C, S, Ei, Eo>(
    decider: IDcbDecider<C, S, Ei, Eo>,
  ) => DeciderESSpecification<C, Ei, Eo>;
};

/** Builder for state-stored decider specifications. */
export type DeciderStateStoredSpecBuilder = {
  for: <C, S, E>(
    decider: IAggregateDecider<C, S, E>,
  ) => DeciderSSSpecification<C, S>;
};

/** Builder for view/projection specifications. */
export type ViewSpecificationBuilder = {
  for: <S, E>(view: IProjection<S, E>) => ViewSpecification<S, E>;
};

/** All three spec builders returned by {@link createSpecs}. */
export interface SpecBuilders {
  DeciderEventSourcedSpec: DeciderEventSourcedSpecBuilder;
  DeciderStateStoredSpec: DeciderStateStoredSpecBuilder;
  ViewSpecification: ViewSpecificationBuilder;
}

// ---------------------------------------------------------------------------
// Factory – create all three spec builders with your assertions
// ---------------------------------------------------------------------------

/**
 * Creates Given-When-Then spec builders wired to your assertion library.
 *
 * This is the runtime-agnostic entry point. Pass any {@link Assertions}
 * implementation and get back all three spec builders pre-wired.
 *
 * @example Deno (default – just use the exported constants instead):
 * ```typescript
 * import { DeciderEventSourcedSpec } from "./test_specification.ts";
 * ```
 *
 * @example Jest / Vitest:
 * ```typescript
 * import { createSpecs } from "./test_specification.ts";
 *
 * const { DeciderEventSourcedSpec, ViewSpecification } = createSpecs({
 *   assertEquals: (a, e) => expect(a).toEqual(e),
 *   assert: (c) => expect(c).toBeTruthy(),
 * });
 * ```
 *
 * @example Node.js built-in assert:
 * ```typescript
 * import { createSpecs } from "./test_specification.ts";
 * import nodeAssert from "node:assert";
 *
 * const { DeciderEventSourcedSpec } = createSpecs({
 *   assertEquals: (a, e) => nodeAssert.deepStrictEqual(a, e),
 *   assert: (c) => nodeAssert.ok(c),
 * });
 * ```
 */
export function createSpecs(assertions: Assertions): SpecBuilders {
  const { assertEquals, assert } = assertions;

  const DeciderEventSourcedSpec: DeciderEventSourcedSpecBuilder = {
    for: <C, S, Ei, Eo>(
      decider: IDcbDecider<C, S, Ei, Eo>,
    ): DeciderESSpecification<C, Ei, Eo> => ({
      given: (events: Ei[]) => ({
        when: (command: C) => {
          const handle = () => decider.computeNewEvents(events, command);
          return {
            then: (expectedEvents: Eo[]) => {
              assertEquals(handle(), expectedEvents);
            },
            thenThrows: (check?: (error: Error) => boolean) => {
              try {
                handle();
                throw new Error(
                  "Expected command to throw, but it did not.",
                );
              } catch (error) {
                if (check) assert(check(error as Error));
              }
            },
          };
        },
      }),
    }),
  };

  const DeciderStateStoredSpec: DeciderStateStoredSpecBuilder = {
    for: <C, S, E>(
      decider: IAggregateDecider<C, S, E>,
    ): DeciderSSSpecification<C, S> => ({
      given: (state: S) => ({
        when: (command: C) => {
          const handle = () => decider.computeNewState(state, command);
          return {
            then: (expectedState: S) => {
              assertEquals(handle(), expectedState);
            },
            thenThrows: (check?: (error: Error) => boolean) => {
              try {
                handle();
                throw new Error(
                  "Expected command to throw, but it did not.",
                );
              } catch (error) {
                if (check) assert(check(error as Error));
              }
            },
          };
        },
      }),
    }),
  };

  const ViewSpecification: ViewSpecificationBuilder = {
    for: <S, E>(
      view: IProjection<S, E>,
    ): ViewSpecification<S, E> => ({
      given: (events: E[]) => {
        const handle = () => events.reduce<S>(view.evolve, view.initialState);
        return {
          then: (expectedState: S) => {
            assertEquals(handle(), expectedState);
          },
          thenThrows: (check?: (error: Error) => boolean) => {
            try {
              handle();
              throw new Error(
                "Expected projection to throw, but it did not.",
              );
            } catch (error) {
              if (check) assert(check(error as Error));
            }
          },
        };
      },
    }),
  };

  return { DeciderEventSourcedSpec, DeciderStateStoredSpec, ViewSpecification };
}
