/*
 * Copyright 2025 Fraktalio D.O.O. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the
 * License. You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "
 * AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific
 * language governing permissions and limitations under the License.
 */

import type { IAggregateDecider } from "./decider.ts";

/**
 * Process manager interface that acts as a ToDo list for orchestrating business processes.
 *
 * @remarks
 * A process manager maintains a ToDo list of actions and determines:
 * - **All pending actions** based on current state (complete ToDo list)
 * - **Ready actions** when events occur (subset of ToDo list that events make ready)
 *
 * The relationship: `react(state, event)` returns a subset of `pending(state)`.
 *
 * @typeParam AR - Action Result type
 * @typeParam S - State type
 * @typeParam E - Event type
 * @typeParam A - Action type
 *
 * @author Иван Дугалић / Ivan Dugalic / @idugalic
 */
export interface IProcess<AR, S, E, A> extends IAggregateDecider<AR, S, E> {
  /**
   * Determines which actions from the ToDo list are made ready by an event.
   *
   * @param state - Current state of the process
   * @param event - Event that makes certain actions ready
   * @returns Subset of pending actions that this event makes ready to execute
   */
  readonly react: (state: S, event: E) => readonly A[];
  /**
   * Returns the complete ToDo list of actions based on current state.
   *
   * @param state - Current state of the process
   * @returns Complete list of actions that could be executed (the full ToDo list)
   */
  readonly pending: (state: S) => readonly A[];
}

/**
 * Process manager that acts as a ToDo list for orchestrating business processes.
 *
 * @remarks
 * Manages a ToDo list of actions where:
 * - `pending(state)` returns the complete ToDo list
 * - `react(state, event)` returns actions that the event makes ready (subset of pending)
 *
 * @typeParam AR - Action Result type
 * @typeParam S - State type
 * @typeParam E - Event type
 * @typeParam A - Action type
 *
 * @author Иван Дугалић / Ivan Dugalic / @idugalic
 */
export class Process<AR, S, E, A> implements IProcess<AR, S, E, A> {
  /**
   * Creates a new Process instance.
   *
   * @param decide - Decision function: `(ActionResult, State) → Event[]`
   * @param evolve - State evolution function: `(State, Event) → State`
   * @param initialState - Starting state for the process
   * @param react - Determines ready actions: `(State, Event) → Action[]` (subset of pending)
   * @param pending - Returns complete ToDo list: `State → Action[]`
   */
  constructor(
    readonly decide: (actionResult: AR, state: S) => readonly E[],
    readonly evolve: (state: S, event: E) => S,
    readonly initialState: S,
    readonly react: (state: S, event: E) => readonly A[],
    readonly pending: (state: S) => readonly A[],
  ) {}

  /**
   * Computes the next state from an action result using state-stored computation.
   *
   * @param state - Current state of the process
   * @param actionResult - Action result to process
   * @returns New state after processing the action result
   */
  computeNewState(state: S, actionResult: AR): S {
    const events = this.decide(actionResult, state);
    return events.reduce(
      (currentState, event) => this.evolve(currentState, event),
      state,
    );
  }

  /**
   * Computes new events from existing events and an action result using event-sourced computation.
   *
   * @param events - Existing events representing the process history
   * @param actionResult - Action result to process
   * @returns New events to append to the event stream
   */
  computeNewEvents(events: readonly E[], actionResult: AR): readonly E[] {
    const currentState = events.reduce(
      (state, event) => this.evolve(state, event),
      this.initialState,
    );
    return this.decide(actionResult, currentState);
  }

  /**
   * Transforms the action result type using contravariant mapping.
   *
   * @typeParam ARn - New action result type
   * @param f - Mapping function from new to original action result type
   * @returns New Process instance that accepts the new action result type
   */
  mapContraOnActionResult<ARn>(f: (arn: ARn) => AR): Process<ARn, S, E, A> {
    return new Process(
      (arn: ARn, s: S) => this.decide(f(arn), s),
      this.evolve,
      this.initialState,
      this.react,
      this.pending,
    );
  }

  /**
   * Transforms the action type using covariant mapping.
   *
   * @typeParam An - New action type
   * @param f - Mapping function from original to new action type
   * @returns New Process instance that produces the new action type
   */
  mapOnAction<An>(f: (a: A) => An): Process<AR, S, E, An> {
    return new Process(
      this.decide,
      this.evolve,
      this.initialState,
      (s: S, e: E) => this.react(s, e).map(f),
      (s: S) => this.pending(s).map(f),
    );
  }
}
