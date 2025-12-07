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

import type { IAggregateDecider, IDcbDecider, IDecider } from "./decider.ts";
import { identity } from "@fraktalio/fmodel-decider";

/**
 * The foundational process manager interface with independent type parameters.
 *
 * @remarks
 * Most generic form in the progressive refinement model allowing complex cross-concept scenarios.
 * Acts as a ToDo list for orchestrating business processes with maximum flexibility.
 *
 * @typeParam AR - Action Result type representing results from executed actions
 * @typeParam Si - Input state type used by the decide function and process methods
 * @typeParam So - Output state type produced by the evolve function, may differ from Si for transformations
 * @typeParam Ei - Input event type consumed by the evolve function and react method
 * @typeParam Eo - Output event type produced by the decide function, may differ from Ei for cross-concept scenarios
 * @typeParam A - Action type representing actions that can be executed as part of the business process
 */
export interface IProcess<AR, Si, So, Ei, Eo, A>
  extends IDecider<AR, Si, So, Ei, Eo> {
  /**
   * Determines which actions from the ToDo list are made ready by an event.
   *
   * @param state - Current input state of the process
   * @param event - Input event that makes certain actions ready
   * @returns Subset of pending actions that this event makes ready to execute
   */
  readonly react: (state: Si, event: Ei) => readonly A[];

  /**
   * Returns the complete ToDo list of actions based on current state.
   *
   * @param state - Current input state of the process
   * @returns Complete list of actions that could be executed (the full ToDo list)
   */
  readonly pending: (state: Si) => readonly A[];
}

/**
 * The first refinement step in the process manager hierarchy constraining input and output state types to be identical.
 *
 * @remarks
 * Event-sourced process manager with `Si = So = S` constraint enabling consistent state evolution.
 * Acts as a ToDo list for orchestrating business processes with event-sourced computation capabilities.
 *
 * @typeParam AR - Action Result type representing results from executed actions
 * @typeParam S - State type (both input and output), constrained to be identical for consistent event-sourced evolution
 * @typeParam Ei - Input event type consumed by the evolve function and react method
 * @typeParam Eo - Output event type produced by the decide function, may differ from Ei for cross-boundary scenarios
 * @typeParam A - Action type representing actions that can be executed as part of the business process
 */
export interface IDcbProcess<AR, S, Ei, Eo, A>
  extends IProcess<AR, S, S, Ei, Eo, A>, IDcbDecider<AR, S, Ei, Eo> {
}

/**
 * The most refined form in the progressive process manager hierarchy with dual computation capabilities.
 *
 * @remarks
 * Final refinement step with dual constraints `Si = So = S` and `Ei = Eo = E`, supporting both event-sourced and state-stored computation patterns.
 * Acts as a ToDo list for orchestrating business processes within aggregate boundaries with maximum type safety.
 *
 * A process manager maintains a ToDo list of actions and determines:
 * - **All pending actions** based on current state (complete ToDo list)
 * - **Ready actions** when events occur (subset of ToDo list that events make ready)
 *
 * The relationship: `react(state, event)` returns a subset of `pending(state)`.
 *
 * @typeParam AR - Action Result type representing results from executed actions within the aggregate boundary
 * @typeParam S - State type (both input and output), representing the aggregate's consistent internal state
 * @typeParam E - Event type (both input and output), representing state changes and domain events within the aggregate boundary
 * @typeParam A - Action type representing actions that can be executed as part of the business process
 */
export interface IAggregateProcess<AR, S, E, A>
  extends IDcbProcess<AR, S, E, E, A>, IAggregateDecider<AR, S, E> {
}

/**
 * The foundational process manager implementation with independent type parameters.
 *
 * @remarks
 * Most generic form in the progressive refinement model supporting transformations and combinations.
 * Acts as a ToDo list for orchestrating business processes with maximum flexibility.
 *
 * @typeParam AR - Action Result type representing results from executed actions
 * @typeParam Si - Input state type used by the decide function and process methods
 * @typeParam So - Output state type produced by the evolve function
 * @typeParam Ei - Input event type consumed by the evolve function and react method
 * @typeParam Eo - Output event type produced by the decide function
 * @typeParam A - Action type representing actions that can be executed as part of the business process
 */
export class Process<AR, Si, So, Ei, Eo, A>
  implements IProcess<AR, Si, So, Ei, Eo, A> {
  /**
   * Creates a new Process instance.
   *
   * @param decide - Decision function: `(ActionResult, InputState) → OutputEvent[]`
   * @param evolve - State evolution function: `(InputState, InputEvent) → OutputState`
   * @param initialState - Starting output state for the process
   * @param react - Determines ready actions: `(InputState, InputEvent) → Action[]` (subset of pending)
   * @param pending - Returns complete ToDo list: `InputState → Action[]`
   */
  constructor(
    readonly decide: (actionResult: AR, state: Si) => readonly Eo[],
    readonly evolve: (state: Si, event: Ei) => So,
    readonly initialState: So,
    readonly react: (state: Si, event: Ei) => readonly A[],
    readonly pending: (state: Si) => readonly A[],
  ) {}

  /**
   * Transforms the action result type using contravariant mapping.
   *
   * @typeParam ARn - New action result type
   * @param f - Mapping function from new to original action result type
   * @returns New Process instance that accepts the new action result type
   */
  mapContraOnActionResult<ARn>(
    f: (arn: ARn) => AR,
  ): Process<ARn, Si, So, Ei, Eo, A> {
    return new Process(
      (arn: ARn, s: Si) => this.decide(f(arn), s),
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
  mapOnAction<An>(f: (a: A) => An): Process<AR, Si, So, Ei, Eo, An> {
    return new Process(
      this.decide,
      this.evolve,
      this.initialState,
      (s: Si, e: Ei) => this.react(s, e).map(f),
      (s: Si) => this.pending(s).map(f),
    );
  }
  /**
   * Transforms both input and output event types using dimap.
   *
   * @typeParam Ein - New input event type
   * @typeParam Eon - New output event type
   * @param fl - Contravariant mapping function that transforms new input events to original input events
   * @param fr - Covariant mapping function that transforms original output events to new output events
   * @returns New Process instance with transformed event types
   */
  dimapOnEvent<Ein, Eon>(
    fl: (ein: Ein) => Ei,
    fr: (eo: Eo) => Eon,
  ): Process<AR, Si, So, Ein, Eon, A> {
    return new Process(
      (ar: AR, s: Si) => this.decide(ar, s).map(fr),
      (s: Si, ein: Ein) => this.evolve(s, fl(ein)),
      this.initialState,
      (s: Si, ein: Ein) => this.react(s, fl(ein)),
      this.pending,
    );
  }

  /**
   * Transforms both input and output state types using dimap.
   *
   * @typeParam Sin - New input state type
   * @typeParam Son - New output state type
   * @param fl - Contravariant mapping function that transforms new input state to original input state
   * @param fr - Covariant mapping function that transforms original output state to new output state
   * @returns New Process instance with transformed state types
   */
  dimapOnState<Sin, Son>(
    fl: (sin: Sin) => Si,
    fr: (so: So) => Son,
  ): Process<AR, Sin, Son, Ei, Eo, A> {
    return new Process(
      (ar: AR, sin: Sin) => this.decide(ar, fl(sin)),
      (sin: Sin, e: Ei) => fr(this.evolve(fl(sin), e)),
      fr(this.initialState),
      (sin: Sin, e: Ei) => this.react(fl(sin), e),
      (sin: Sin) => this.pending(fl(sin)),
    );
  }

  /**
   * Right apply on So/Output State parameter - Applicative
   *
   * @typeParam Son - New output State
   */
  applyOnState<Son>(
    ff: Process<AR, Si, (so: So) => Son, Ei, Eo, A>,
  ): Process<AR, Si, Son, Ei, Eo, A> {
    return new Process(
      (ar: AR, s: Si) => ff.decide(ar, s).concat(this.decide(ar, s)),
      (s: Si, e: Ei) => ff.evolve(s, e)(this.evolve(s, e)),
      ff.initialState(this.initialState),
      (s: Si, e: Ei) => ff.react(s, e).concat(this.react(s, e)),
      (s: Si) => ff.pending(s).concat(this.pending(s)),
    );
  }

  /**
   * Right product on So/Output State parameter - Applicative
   *
   * @typeParam Son - New output State
   */
  productOnState<Son>(
    fb: Process<AR, Si, Son, Ei, Eo, A>,
  ): Process<AR, Si, So & Son, Ei, Eo, A> {
    return this.applyOnState(
      fb.dimapOnState(identity, (son: Son) => (so: So) => {
        return Object.assign({}, so, son);
      }),
    );
  }

  /**
   * Right product on So/Output State parameter - Applicative
   *
   * @typeParam Son - New output State
   */
  productViaTuplesOnState<Son>(
    fb: Process<AR, Si, Son, Ei, Eo, A>,
  ): Process<AR, Si, readonly [So, Son], Ei, Eo, A> {
    return this.applyOnState(
      fb.dimapOnState(identity, (b: Son) => (a: So) => [a, b]),
    );
  }
  /**
   * Combines this process with another process, merging their behavior using intersection types.
   *
   * @typeParam AR2 - Action Result type of the other process to combine with
   * @typeParam Si2 - Input state type of the other process to combine with
   * @typeParam So2 - Output state type of the other process to combine with
   * @typeParam Ei2 - Input event type of the other process to combine with
   * @typeParam Eo2 - Output event type of the other process to combine with
   * @typeParam A2 - Action type of the other process to combine with
   * @param y - The other process to combine with this one
   * @returns A new Process that handles both sets of action results/events and maintains an intersected state
   */
  combine<AR2, Si2, So2, Ei2, Eo2, A2>(
    y: Process<AR2, Si2, So2, Ei2, Eo2, A2>,
  ): Process<AR | AR2, Si & Si2, So & So2, Ei | Ei2, Eo | Eo2, A | A2> {
    const processX = this.mapContraOnActionResult<AR | AR2>((ar) => ar as AR)
      .dimapOnState<Si & Si2, So>(
        (sin) => sin as Si,
        identity,
      )
      .dimapOnEvent<Ei | Ei2, Eo | Eo2>(
        (ein) => ein as Ei,
        identity,
      )
      .mapOnAction<A | A2>(identity);

    const processY = y
      .mapContraOnActionResult<AR | AR2>((ar) => ar as AR2)
      .dimapOnState<Si & Si2, So2>(
        (sin) => sin as Si2,
        identity,
      )
      .dimapOnEvent<Ei | Ei2, Eo | Eo2>(
        (ein) => ein as Ei2,
        identity,
      )
      .mapOnAction<A | A2>(identity);

    return processX.productOnState(processY);
  }

  /**
   * Combines this process with another process using tuple-based state merging.
   *
   * @remarks
   * Keeps states separate using tuple types, ideal for independent domain concepts without property conflicts.
   *
   * @typeParam AR2 - Action Result type of the other process to combine with
   * @typeParam Si2 - Input state type of the other process to combine with
   * @typeParam So2 - Output state type of the other process to combine with
   * @typeParam Ei2 - Input event type of the other process to combine with
   * @typeParam Eo2 - Output event type of the other process to combine with
   * @typeParam A2 - Action type of the other process to combine with
   * @param y - The other process to combine with this one
   * @returns A new Process that handles both sets of action results/events and maintains a tuple-structured state
   */
  combineViaTuples<AR2, Si2, So2, Ei2, Eo2, A2>(
    y: Process<AR2, Si2, So2, Ei2, Eo2, A2>,
  ): Process<
    AR | AR2,
    readonly [Si, Si2],
    readonly [So, So2],
    Ei | Ei2,
    Eo | Eo2,
    A | A2
  > {
    const processX = this.mapContraOnActionResult<AR | AR2>((ar) => ar as AR)
      .dimapOnState<readonly [Si, Si2], So>((sin) => sin[0], identity)
      .dimapOnEvent<Ei | Ei2, Eo | Eo2>(
        (ein) => ein as Ei,
        (eo) => eo,
      )
      .mapOnAction<A | A2>((a) => a);

    const processY = y
      .mapContraOnActionResult<AR | AR2>((ar) => ar as AR2)
      .dimapOnState<readonly [Si, Si2], So2>((sin) => sin[1], identity)
      .dimapOnEvent<Ei | Ei2, Eo | Eo2>(
        (ein) => ein as Ei2,
        (eo2) => eo2,
      )
      .mapOnAction<A | A2>((a2) => a2);

    return processX.productViaTuplesOnState(processY);
  }
}

/**
 * The first refinement step in the process manager hierarchy constraining input and output state types to be identical.
 *
 * @remarks
 * Event-sourced process manager with `Si = So = S` constraint for consistent state evolution.
 * Acts as a ToDo list for orchestrating business processes with event-sourced computation capabilities.
 *
 * @typeParam AR - Action Result type representing results from executed actions
 * @typeParam S - State type (both input and output) representing the consistent state structure throughout the process lifecycle
 * @typeParam Ei - Input event type consumed by the evolve function and react method
 * @typeParam Eo - Output event type produced by the decide function, may differ from Ei for cross-boundary scenarios
 * @typeParam A - Action type representing actions that can be executed as part of the business process
 */
export class DcbProcess<AR, S, Ei, Eo, A>
  implements IDcbProcess<AR, S, Ei, Eo, A> {
  private readonly _process: Process<AR, S, S, Ei, Eo, A>;

  /**
   * Creates a new DcbProcess instance.
   *
   * @param decide - Decision function: `(ActionResult, State) → OutputEvent[]`
   * @param evolve - State evolution function: `(State, InputEvent) → State`
   * @param initialState - Starting state for the process
   * @param react - Determines ready actions: `(State, InputEvent) → Action[]` (subset of pending)
   * @param pending - Returns complete ToDo list: `State → Action[]`
   */
  constructor(
    readonly decide: (actionResult: AR, state: S) => readonly Eo[],
    readonly evolve: (state: S, event: Ei) => S,
    readonly initialState: S,
    readonly react: (state: S, event: Ei) => readonly A[],
    readonly pending: (state: S) => readonly A[],
  ) {
    this._process = new Process(decide, evolve, initialState, react, pending);
  }

  /**
   * Computes new events from existing events and an action result using event-sourced computation.
   *
   * @param events - Existing events representing the process history
   * @param actionResult - Action result to process
   * @returns New events to append to the event stream
   */
  computeNewEvents(events: readonly Ei[], actionResult: AR): readonly Eo[] {
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
   * @returns New DcbProcess instance that accepts the new action result type
   */
  mapContraOnActionResult<ARn>(
    f: (arn: ARn) => AR,
  ): DcbProcess<ARn, S, Ei, Eo, A> {
    const mappedProcess = this._process.mapContraOnActionResult(f);
    return new DcbProcess(
      mappedProcess.decide,
      mappedProcess.evolve,
      mappedProcess.initialState,
      mappedProcess.react,
      mappedProcess.pending,
    );
  }

  /**
   * Transforms the action type using covariant mapping.
   *
   * @typeParam An - New action type
   * @param f - Mapping function from original to new action type
   * @returns New DcbProcess instance that produces the new action type
   */
  mapOnAction<An>(f: (a: A) => An): DcbProcess<AR, S, Ei, Eo, An> {
    const mappedProcess = this._process.mapOnAction(f);
    return new DcbProcess(
      mappedProcess.decide,
      mappedProcess.evolve,
      mappedProcess.initialState,
      mappedProcess.react,
      mappedProcess.pending,
    );
  }

  /**
   * Transforms both input and output event types using dimap.
   *
   * @typeParam Ein - New input event type
   * @typeParam Eon - New output event type
   * @param fl - Contravariant mapping function that transforms new input events to original input events
   * @param fr - Covariant mapping function that transforms original output events to new output events
   * @returns New DcbProcess instance with transformed event types
   */
  dimapOnEvent<Ein, Eon>(
    fl: (ein: Ein) => Ei,
    fr: (eo: Eo) => Eon,
  ): DcbProcess<AR, S, Ein, Eon, A> {
    const mappedProcess = this._process.dimapOnEvent(fl, fr);
    return new DcbProcess(
      mappedProcess.decide,
      mappedProcess.evolve,
      mappedProcess.initialState,
      mappedProcess.react,
      mappedProcess.pending,
    );
  }

  /**
   * Transforms the state type using dimap with the constraint that input and output state types are identical.
   *
   * @typeParam Sn - New state type (both input and output)
   * @param fl - Contravariant mapping function that transforms new state to original state
   * @param fr - Covariant mapping function that transforms original state to new state
   * @returns New DcbProcess instance with transformed state type
   */
  dimapOnState<Sn>(
    fl: (sn: Sn) => S,
    fr: (s: S) => Sn,
  ): DcbProcess<AR, Sn, Ei, Eo, A> {
    const mappedProcess = this._process.dimapOnState(fl, fr);
    return new DcbProcess(
      mappedProcess.decide,
      mappedProcess.evolve,
      mappedProcess.initialState,
      mappedProcess.react,
      mappedProcess.pending,
    );
  }

  /**
   * Combines this DcbProcess with another DcbProcess, merging their behavior using intersection types.
   *
   * @typeParam AR2 - Action Result type of the other process to combine with
   * @typeParam S2 - State type of the other process to combine with
   * @typeParam Ei2 - Input event type of the other process to combine with
   * @typeParam Eo2 - Output event type of the other process to combine with
   * @typeParam A2 - Action type of the other process to combine with
   * @param y - The other DcbProcess to combine with this one
   * @returns A new DcbProcess that handles both sets of action results/events and maintains an intersected state
   */
  combine<AR2, S2, Ei2, Eo2, A2>(
    y: DcbProcess<AR2, S2, Ei2, Eo2, A2>,
  ): DcbProcess<AR | AR2, S & S2, Ei | Ei2, Eo | Eo2, A | A2> {
    const combinedProcess = this._process.combine(y._process);
    return new DcbProcess(
      combinedProcess.decide,
      combinedProcess.evolve,
      combinedProcess.initialState,
      combinedProcess.react,
      combinedProcess.pending,
    );
  }

  /**
   * Combines this DcbProcess with another DcbProcess using tuple-based state merging.
   *
   * @remarks
   * Keeps states separate using tuple types, ideal for independent domain concepts without property conflicts.
   *
   * @typeParam AR2 - Action Result type of the other process to combine with
   * @typeParam S2 - State type of the other process to combine with
   * @typeParam Ei2 - Input event type of the other process to combine with
   * @typeParam Eo2 - Output event type of the other process to combine with
   * @typeParam A2 - Action type of the other process to combine with
   * @param y - The other DcbProcess to combine with this one
   * @returns A new DcbProcess that handles both sets of action results/events and maintains a tuple-structured state
   */
  combineViaTuples<AR2, S2, Ei2, Eo2, A2>(
    y: DcbProcess<AR2, S2, Ei2, Eo2, A2>,
  ): DcbProcess<
    AR | AR2,
    readonly [S, S2],
    Ei | Ei2,
    Eo | Eo2,
    A | A2
  > {
    const combinedProcess = this._process.combineViaTuples(y._process);
    return new DcbProcess(
      combinedProcess.decide,
      combinedProcess.evolve,
      combinedProcess.initialState,
      combinedProcess.react,
      combinedProcess.pending,
    );
  }
}

/**
 * The most refined form in the progressive process manager hierarchy with dual computation capabilities.
 *
 * @remarks
 * Final refinement step with dual constraints `Si = So = S` and `Ei = Eo = E`, supporting both event-sourced and state-stored computation patterns.
 * Domain aggregate process specialist that acts as a ToDo list for orchestrating business processes within aggregate boundaries.
 *
 * Manages a ToDo list of actions where:
 * - `pending(state)` returns the complete ToDo list
 * - `react(state, event)` returns actions that the event makes ready (subset of pending)
 *
 * @typeParam AR - Action Result type representing results from executed actions within the aggregate boundary
 * @typeParam S - State type (both input and output) representing the consistent aggregate state structure
 * @typeParam E - Event type (both input and output) representing domain events that directly correspond to state changes
 * @typeParam A - Action type representing actions that can be executed as part of the business process
 */
export class AggregateProcess<AR, S, E, A>
  implements IAggregateProcess<AR, S, E, A> {
  private readonly _process: Process<AR, S, S, E, E, A>;

  /**
   * Creates a new AggregateProcess instance.
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
  ) {
    this._process = new Process(decide, evolve, initialState, react, pending);
  }

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
   * @returns New AggregateProcess instance that accepts the new action result type
   */
  mapContraOnActionResult<ARn>(
    f: (arn: ARn) => AR,
  ): AggregateProcess<ARn, S, E, A> {
    const mappedProcess = this._process.mapContraOnActionResult(f);
    return new AggregateProcess(
      mappedProcess.decide,
      mappedProcess.evolve,
      mappedProcess.initialState,
      mappedProcess.react,
      mappedProcess.pending,
    );
  }

  /**
   * Transforms the action type using covariant mapping.
   *
   * @typeParam An - New action type
   * @param f - Mapping function from original to new action type
   * @returns New AggregateProcess instance that produces the new action type
   */
  mapOnAction<An>(f: (a: A) => An): AggregateProcess<AR, S, E, An> {
    const mappedProcess = this._process.mapOnAction(f);
    return new AggregateProcess(
      mappedProcess.decide,
      mappedProcess.evolve,
      mappedProcess.initialState,
      mappedProcess.react,
      mappedProcess.pending,
    );
  }

  /**
   * Transforms both input and output event types using dimap.
   *
   * @typeParam En - New event type (both input and output)
   * @param fl - Contravariant mapping function that transforms new events to original events
   * @param fr - Covariant mapping function that transforms original events to new events
   * @returns New AggregateProcess instance with transformed event types
   */
  dimapOnEvent<En>(
    fl: (en: En) => E,
    fr: (e: E) => En,
  ): AggregateProcess<AR, S, En, A> {
    const mappedProcess = this._process.dimapOnEvent(fl, fr);
    return new AggregateProcess(
      mappedProcess.decide,
      mappedProcess.evolve,
      mappedProcess.initialState,
      mappedProcess.react,
      mappedProcess.pending,
    );
  }

  /**
   * Transforms the state type using dimap with the constraint that input and output state types are identical.
   *
   * @typeParam Sn - New state type (both input and output)
   * @param fl - Contravariant mapping function that transforms new state to original state
   * @param fr - Covariant mapping function that transforms original state to new state
   * @returns New AggregateProcess instance with transformed state type
   */
  dimapOnState<Sn>(
    fl: (sn: Sn) => S,
    fr: (s: S) => Sn,
  ): AggregateProcess<AR, Sn, E, A> {
    const mappedProcess = this._process.dimapOnState(fl, fr);
    return new AggregateProcess(
      mappedProcess.decide,
      mappedProcess.evolve,
      mappedProcess.initialState,
      mappedProcess.react,
      mappedProcess.pending,
    );
  }

  /**
   * Combines this AggregateProcess with another AggregateProcess, merging their behavior using intersection types.
   *
   * @typeParam AR2 - Action Result type of the other process to combine with
   * @typeParam S2 - State type of the other process to combine with
   * @typeParam E2 - Event type of the other process to combine with
   * @typeParam A2 - Action type of the other process to combine with
   * @param y - The other AggregateProcess to combine with this one
   * @returns A new AggregateProcess that handles both sets of action results/events and maintains an intersected state
   */
  combine<AR2, S2, E2, A2>(
    y: AggregateProcess<AR2, S2, E2, A2>,
  ): AggregateProcess<AR | AR2, S & S2, E | E2, A | A2> {
    const combinedProcess = this._process.combine(y._process);
    return new AggregateProcess(
      combinedProcess.decide,
      combinedProcess.evolve,
      combinedProcess.initialState,
      combinedProcess.react,
      combinedProcess.pending,
    );
  }

  /**
   * Combines this AggregateProcess with another AggregateProcess using tuple-based state merging.
   *
   * @remarks
   * Keeps states separate using tuple types, ideal for independent domain concepts without property conflicts.
   *
   * @typeParam AR2 - Action Result type of the other process to combine with
   * @typeParam S2 - State type of the other process to combine with
   * @typeParam E2 - Event type of the other process to combine with
   * @typeParam A2 - Action type of the other process to combine with
   * @param y - The other AggregateProcess to combine with this one
   * @returns A new AggregateProcess that handles both sets of action results/events and maintains a tuple-structured state
   */
  combineViaTuples<AR2, S2, E2, A2>(
    y: AggregateProcess<AR2, S2, E2, A2>,
  ): AggregateProcess<
    AR | AR2,
    readonly [S, S2],
    E | E2,
    A | A2
  > {
    const combinedProcess = this._process.combineViaTuples(y._process);
    return new AggregateProcess(
      combinedProcess.decide,
      combinedProcess.evolve,
      combinedProcess.initialState,
      combinedProcess.react,
      combinedProcess.pending,
    );
  }
}