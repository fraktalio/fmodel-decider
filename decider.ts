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

/**
 * The foundational contract for decision-making algorithms with independent type parameters.
 *
 * @remarks
 * Most generic form in the progressive refinement model allowing complex cross-concept scenarios.
 *
 * @typeParam C - Command type representing the intent or instruction to be processed
 * @typeParam Si - Input state type used by the decide function to make decisions
 * @typeParam So - Output state type produced by the evolve function, may differ from Si for transformations
 * @typeParam Ei - Input event type consumed by the evolve function to update state
 * @typeParam Eo - Output event type produced by the decide function, may differ from Ei for cross-concept scenarios
 */
export interface IDecider<C, Si, So, Ei, Eo> {
  /**
   * Computes output events from a command and current state.
   *
   * @param command - The command representing the intent or instruction to be processed
   * @param state - The current input state used to make the decision
   * @returns A readonly array of output events representing what should happen as a result of the command
   */
  readonly decide: (command: C, state: Si) => readonly Eo[];

  /**
   * Computes the next state from the current state and an input event.
   *
   * @param state - The current input state before applying the event
   * @param event - The input event containing information about what happened
   * @returns The new output state after applying the event
   */
  readonly evolve: (state: Si, event: Ei) => So;

  /**
   * The initial state representing the starting point for state evolution.
   */
  readonly initialState: So;
}

/**
 * The foundational implementation of decision-making algorithms with independent type parameters.
 *
 * @remarks
 * Most generic form in the progressive refinement model supporting transformations and combinations.
 *
 * @typeParam C - Command type representing the intent or instruction to be processed
 * @typeParam Si - Input state type used by the decide function
 * @typeParam So - Output state type produced by the evolve function
 * @typeParam Ei - Input event type consumed by the evolve function
 * @typeParam Eo - Output event type produced by the decide function
 *
 * @author Иван Дугалић / Ivan Dugalic / @idugalic
 */
export class Decider<C, Si, So, Ei, Eo> implements IDecider<C, Si, So, Ei, Eo> {
  /**
   * Creates a new Decider instance with the specified decision logic, state evolution logic, and initial state.
   *
   * @param decide - The decision function that computes output events from a command and current state
   * @param evolve - The state evolution function that computes the next state from current state and an event
   * @param initialState - The starting state for the decider
   */
  constructor(
    readonly decide: (c: C, s: Si) => readonly Eo[],
    readonly evolve: (s: Si, e: Ei) => So,
    readonly initialState: So,
  ) {}

  /**
   * Transforms the command type of this decider by applying a contravariant mapping function.
   *
   * @typeParam Cn - The new command type that the resulting decider will accept
   * @param f - Mapping function that transforms the new command type to the original command type
   * @returns A new `Decider` instance that accepts commands of type `Cn` while preserving all other behavior
   */
  mapContraOnCommand<Cn>(f: (cn: Cn) => C): Decider<Cn, Si, So, Ei, Eo> {
    return new Decider(
      (cn: Cn, s: Si) => this.decide(f(cn), s),
      (s: Si, e: Ei) => this.evolve(s, e),
      this.initialState,
    );
  }

  /**
   * Transforms both input and output event types of this decider using dimap.
   *
   * @typeParam Ein - New input event type that the resulting decider will consume in its evolve function
   * @typeParam Eon - New output event type that the resulting decider will produce from its decide function
   * @param fl - Contravariant mapping function that transforms new input events to original input events
   * @param fr - Covariant mapping function that transforms original output events to new output events
   * @returns A new `Decider` instance with transformed event types while preserving command and state behavior
   */
  dimapOnEvent<Ein, Eon>(
    fl: (ein: Ein) => Ei,
    fr: (eo: Eo) => Eon,
  ): Decider<C, Si, So, Ein, Eon> {
    return new Decider(
      (c: C, s: Si) => this.decide(c, s).map(fr),
      (s: Si, ein: Ein) => this.evolve(s, fl(ein)),
      this.initialState,
    );
  }

  /**
   * Transforms both input and output state types of this decider using dimap.
   *
   * @typeParam Sin - New input state type that the resulting decider will consume in its decide function
   * @typeParam Son - New output state type that the resulting decider will produce from its evolve function
   * @param fl - Contravariant mapping function that transforms new input state to original input state
   * @param fr - Covariant mapping function that transforms original output state to new output state
   * @returns A new `Decider` instance with transformed state types while preserving command and event behavior
   */
  dimapOnState<Sin, Son>(
    fl: (sin: Sin) => Si,
    fr: (so: So) => Son,
  ): Decider<C, Sin, Son, Ei, Eo> {
    return new Decider(
      (c: C, sin: Sin) => this.decide(c, fl(sin)),
      (sin: Sin, e: Ei) => fr(this.evolve(fl(sin), e)),
      fr(this.initialState),
    );
  }

  /**
   * Right apply on S/State parameter - Applicative
   *
   * @typeParam Son - New output State
   */
  applyOnState<Son>(
    ff: Decider<C, Si, (so: So) => Son, Ei, Eo>,
  ): Decider<C, Si, Son, Ei, Eo> {
    return new Decider(
      (c: C, s: Si) => ff.decide(c, s).concat(this.decide(c, s)),
      (s: Si, e: Ei) => ff.evolve(s, e)(this.evolve(s, e)),
      ff.initialState(this.initialState),
    );
  }

  /**
   * Right product on S/State parameter - Applicative
   *
   * @typeParam Son - New output State
   */
  productOnState<Son>(
    fb: Decider<C, Si, Son, Ei, Eo>,
  ): Decider<C, Si, So & Son, Ei, Eo> {
    return this.applyOnState(
      fb.dimapOnState(identity, (son: Son) => (so: So) => {
        return Object.assign({}, so, son);
      }),
    );
  }

  /**
   * Right product on S/State parameter - Applicative
   *
   * @typeParam Son - New output State
   */
  productViaTuplesOnState<Son>(
    fb: Decider<C, Si, Son, Ei, Eo>,
  ): Decider<C, Si, readonly [So, Son], Ei, Eo> {
    return this.applyOnState(
      fb.dimapOnState(identity, (b: Son) => (a: So) => [a, b]),
    );
  }

  /**
   * Combines this decider with another decider, merging their behavior using intersection types.
   *
   * @typeParam C2 - Command type of the other decider to combine with
   * @typeParam Si2 - Input state type of the other decider to combine with
   * @typeParam So2 - Output state type of the other decider to combine with
   * @typeParam Ei2 - Input event type of the other decider to combine with
   * @typeParam Eo2 - Output event type of the other decider to combine with
   * @param y - The other decider to combine with this one
   * @returns A new `Decider` that handles both sets of commands/events and maintains an intersected state
   */
  combine<C2, Si2, So2, Ei2, Eo2>(
    y: Decider<C2, Si2, So2, Ei2, Eo2>,
  ): Decider<C | C2, Si & Si2, So & So2, Ei | Ei2, Eo | Eo2> {
    const deciderX = this.mapContraOnCommand<C | C2>((c) => c as C)
      .dimapOnState<Si & Si2, So>(
        (sin) => sin as Si,
        identity,
      )
      .dimapOnEvent<Ei | Ei2, Eo | Eo2>(
        (ein) => ein as Ei,
        identity,
      );

    const deciderY = y
      .mapContraOnCommand<C | C2>((c) => c as C2)
      .dimapOnState<Si & Si2, So2>(
        (sin) => sin as Si2,
        identity,
      )
      .dimapOnEvent<Ei | Ei2, Eo | Eo2>(
        (ein) => ein as Ei2,
        identity,
      );

    return deciderX.productOnState(deciderY);
  }

  /**
   * Combines this decider with another decider using tuple-based state merging.
   *
   * @remarks
   * Keeps states separate using tuple types, ideal for independent domain concepts without property conflicts.
   *
   * @typeParam C2 - Command type of the other decider to combine with
   * @typeParam Si2 - Input state type of the other decider to combine with
   * @typeParam So2 - Output state type of the other decider to combine with
   * @typeParam Ei2 - Input event type of the other decider to combine with
   * @typeParam Eo2 - Output event type of the other decider to combine with
   * @param y - The other decider to combine with this one
   * @returns A new `Decider` that handles both sets of commands/events and maintains a tuple-structured state
   */
  combineViaTuples<C2, Si2, So2, Ei2, Eo2>(
    y: Decider<C2, Si2, So2, Ei2, Eo2>,
  ): Decider<
    C | C2,
    readonly [Si, Si2],
    readonly [So, So2],
    Ei | Ei2,
    Eo | Eo2
  > {
    const deciderX = this.mapContraOnCommand<C | C2>((c) => c as C)
      .dimapOnState<readonly [Si, Si2], So>((sin) => sin[0], identity)
      .dimapOnEvent<Ei | Ei2, Eo | Eo2>(
        (ein) => ein as Ei,
        (eo) => eo,
      );

    const deciderY = y
      .mapContraOnCommand<C | C2>((c) => c as C2)
      .dimapOnState<readonly [Si, Si2], So2>((sin) => sin[1], identity)
      .dimapOnEvent<Ei | Ei2, Eo | Eo2>(
        (ein) => ein as Ei2,
        (eo2) => eo2,
      );

    return deciderX.productViaTuplesOnState(deciderY);
  }
}

/**
 * The first refinement step constraining input and output state types to be identical.
 *
 * @remarks
 * Enforces `Si = So = S` constraint enabling event-sourced computation where state is derived from historical events.
 *
 * @typeParam C - Command type representing the intent or instruction to be processed
 * @typeParam S - State type (both input and output), constrained to be identical for consistent event-sourced evolution
 * @typeParam Ei - Input event type consumed by the evolve function to update state
 * @typeParam Eo - Output event type produced by the decide function, may differ from Ei for cross-boundary scenarios
 */
export interface IDcbDecider<C, S, Ei, Eo> extends IDecider<C, S, S, Ei, Eo> {
  /**
   * Computes new events from a command by first replaying all past events to derive the current state.
   *
   * @param events - A readonly array of historical input events representing the complete past behavior of the system
   * @param command - The new command to evaluate against the current state derived from the event history
   * @returns A readonly array of newly produced output events representing the decisions made based on the command and current state
   */
  computeNewEvents(events: readonly Ei[], command: C): readonly Eo[];
}

/**
 * The second step in the progressive refinement model constraining input and output state types to be identical.
 *
 * @remarks
 * Event-sourced computation specialist with `Si = So = S` constraint for consistent state evolution.
 *
 * @typeParam C - Command type representing the intent or instruction to be processed
 * @typeParam S - State type (both input and output) representing the consistent state structure throughout the decider lifecycle
 * @typeParam Ei - Input event type consumed by the evolve function to update state
 * @typeParam Eo - Output event type produced by the decide function, may differ from Ei for cross-boundary scenarios
 *
 * @author Иван Дугалић / Ivan Dugalic / @idugalic
 */
export class DcbDecider<C, S, Ei, Eo> implements IDcbDecider<C, S, Ei, Eo> {
  private readonly _decider: Decider<C, S, S, Ei, Eo>;

  constructor(
    readonly decide: (c: C, s: S) => readonly Eo[],
    readonly evolve: (s: S, e: Ei) => S,
    readonly initialState: S,
  ) {
    this._decider = new Decider(decide, evolve, initialState);
  }

  /**
   * Computes new output events by first deriving the current state from historical events, then applying decision logic.
   *
   * @param events - Historical events representing the complete event stream for this entity
   * @param command - The command to be processed against the derived current state
   * @returns A readonly array of new output events representing what should happen as a result of processing the command
   */
  computeNewEvents(events: readonly Ei[], command: C): readonly Eo[] {
    const currentState = events.reduce(
      this.evolve,
      this.initialState,
    );
    return this.decide(command, currentState);
  }

  /**
   * Transforms the command type of this DcbDecider by applying a contravariant mapping function.
   *
   * @typeParam Cn - The new command type that the resulting DcbDecider will accept
   * @param f - Mapping function that transforms the new command type to the original command type
   * @returns A new `DcbDecider` instance that accepts commands of type `Cn`
   */
  mapContraOnCommand<Cn>(f: (cn: Cn) => C): DcbDecider<Cn, S, Ei, Eo> {
    const mappedDecider = this._decider.mapContraOnCommand(f);
    return new DcbDecider(
      mappedDecider.decide,
      mappedDecider.evolve,
      mappedDecider.initialState,
    );
  }

  /**
   * Transforms both input and output event types of this DcbDecider using dimap.
   *
   * @typeParam Ein - New input event type that the resulting DcbDecider will consume
   * @typeParam Eon - New output event type that the resulting DcbDecider will produce
   * @param fl - Contravariant mapping function that transforms new input events to original input events
   * @param fr - Covariant mapping function that transforms original output events to new output events
   * @returns A new `DcbDecider` instance with transformed event types
   */
  dimapOnEvent<Ein, Eon>(
    fl: (ein: Ein) => Ei,
    fr: (eo: Eo) => Eon,
  ): DcbDecider<C, S, Ein, Eon> {
    const mappedDecider = this._decider.dimapOnEvent(fl, fr);
    return new DcbDecider(
      mappedDecider.decide,
      mappedDecider.evolve,
      mappedDecider.initialState,
    );
  }

  /**
   * Transforms both input and output state types of this DcbDecider using dimap.
   *
   * @typeParam Sn - New state type (both input and output)
   * @param fl - Contravariant mapping function that transforms new state to original state
   * @param fr - Covariant mapping function that transforms original state to new state
   * @returns A new `DcbDecider` instance with transformed state types
   */
  dimapOnState<Sn>(
    fl: (sn: Sn) => S,
    fr: (s: S) => Sn,
  ): DcbDecider<C, Sn, Ei, Eo> {
    const mappedDecider = this._decider.dimapOnState(fl, fr);
    return new DcbDecider(
      mappedDecider.decide,
      mappedDecider.evolve,
      mappedDecider.initialState,
    );
  }

  /**
   * Combines this DcbDecider with another DcbDecider using intersection-based state merging.
   *
   * @typeParam C2 - Command type of the second DcbDecider
   * @typeParam S2 - State type of the second DcbDecider
   * @typeParam Ei2 - Input event type of the second DcbDecider
   * @typeParam Eo2 - Output event type of the second DcbDecider
   * @param other - The second DcbDecider to combine with
   * @returns A new `DcbDecider` with combined functionality
   */
  combine<C2, S2, Ei2, Eo2>(
    other: DcbDecider<C2, S2, Ei2, Eo2>,
  ): DcbDecider<C | C2, S & S2, Ei | Ei2, Eo | Eo2> {
    const combinedDecider = this._decider.combine(other._decider);
    return new DcbDecider(
      combinedDecider.decide,
      combinedDecider.evolve,
      combinedDecider.initialState,
    );
  }

  /**
   * Combines this DcbDecider with another DcbDecider using tuple-based state composition.
   *
   * @typeParam C2 - Command type of the second DcbDecider
   * @typeParam S2 - State type of the second DcbDecider
   * @typeParam Ei2 - Input event type of the second DcbDecider
   * @typeParam Eo2 - Output event type of the second DcbDecider
   * @param other - The second DcbDecider to combine with
   * @returns A new `DcbDecider` with tuple-based combined state
   */
  combineViaTuples<C2, S2, Ei2, Eo2>(
    other: DcbDecider<C2, S2, Ei2, Eo2>,
  ): DcbDecider<C | C2, readonly [S, S2], Ei | Ei2, Eo | Eo2> {
    const combinedDecider = this._decider.combineViaTuples(other._decider);
    return new DcbDecider(
      combinedDecider.decide,
      combinedDecider.evolve,
      combinedDecider.initialState,
    );
  }
}

/**
 * The most refined form in the progressive type system, constraining both state and event types to be identical.
 *
 * @remarks
 * Final refinement step with dual constraints `Si = So = S` and `Ei = Eo = E`, supporting both event-sourced and state-stored computation patterns.
 *
 * @typeParam C - Command type representing the intent or instruction to be processed by the aggregate
 * @typeParam S - State type (both input and output), representing the aggregate's consistent internal state
 * @typeParam E - Event type (both input and output), representing state changes and domain events within the aggregate boundary
 */
export interface IAggregateDecider<C, S, E> extends IDcbDecider<C, S, E, E> {
  /**
   * Computes the next state directly from a command and current state using the state-stored computation pattern.
   *
   * @param state - The current state of the aggregate
   * @param command - The command to evaluate against the current state
   * @returns The new state after applying all events produced by the command
   */
  computeNewState(state: S, command: C): S;
}

/**
 * The most refined form in the progressive refinement model with dual computation capabilities.
 *
 * @remarks
 * Domain aggregate specialist with dual constraints `Si = So = S` and `Ei = Eo = E` supporting both event-sourced and state-stored computation.
 *
 * @typeParam C - Command type representing the intent or instruction to be processed by the aggregate
 * @typeParam S - State type (both input and output) representing the consistent aggregate state structure
 * @typeParam E - Event type (both input and output) representing domain events that directly correspond to state changes
 *
 * @author Иван Дугалић / Ivan Dugalic / @idugalic
 */
export class AggregateDecider<C, S, E> implements IAggregateDecider<C, S, E> {
  private readonly _decider: Decider<C, S, S, E, E>;

  constructor(
    readonly decide: (c: C, s: S) => readonly E[],
    readonly evolve: (s: S, e: E) => S,
    readonly initialState: S,
  ) {
    this._decider = new Decider(decide, evolve, initialState);
  }

  /**
   * Computes the new state by applying decision logic to produce events, then immediately applying those events to update the state.
   *
   * @param state - The current state of the aggregate before applying the command
   * @param command - The command to be processed against the current state
   * @returns The new state after applying the command and all resulting events
   */
  computeNewState(state: S, command: C): S {
    const events = this.decide(command, state);
    return events.reduce(this.evolve, state);
  }

  /**
   * Computes new events from a command by first replaying all past events to derive the current state.
   */
  computeNewEvents(events: readonly E[], command: C): readonly E[] {
    const currentState = events.reduce(
      this.evolve,
      this.initialState,
    );
    return this.decide(command, currentState);
  }

  /**
   * Transforms the command type of this AggregateDecider by applying a contravariant mapping function.
   *
   * @typeParam Cn - The new command type that the resulting AggregateDecider will accept
   * @param f - Mapping function that transforms the new command type to the original command type
   * @returns A new `AggregateDecider` instance that accepts commands of type `Cn`
   */
  mapContraOnCommand<Cn>(f: (cn: Cn) => C): AggregateDecider<Cn, S, E> {
    const mappedDecider = this._decider.mapContraOnCommand(f);
    return new AggregateDecider(
      mappedDecider.decide,
      mappedDecider.evolve,
      mappedDecider.initialState,
    );
  }

  /**
   * Transforms both input and output event types of this AggregateDecider using dimap.
   *
   * @typeParam En - New event type (both input and output)
   * @param fl - Contravariant mapping function that transforms new events to original events
   * @param fr - Covariant mapping function that transforms original events to new events
   * @returns A new `AggregateDecider` instance with transformed event types
   */
  dimapOnEvent<En>(
    fl: (en: En) => E,
    fr: (e: E) => En,
  ): AggregateDecider<C, S, En> {
    const mappedDecider = this._decider.dimapOnEvent(fl, fr);
    return new AggregateDecider(
      mappedDecider.decide,
      mappedDecider.evolve,
      mappedDecider.initialState,
    );
  }

  /**
   * Transforms both input and output state types of this AggregateDecider using dimap.
   *
   * @typeParam Sn - New state type (both input and output)
   * @param fl - Contravariant mapping function that transforms new state to original state
   * @param fr - Covariant mapping function that transforms original state to new state
   * @returns A new `AggregateDecider` instance with transformed state types
   */
  dimapOnState<Sn>(
    fl: (sn: Sn) => S,
    fr: (s: S) => Sn,
  ): AggregateDecider<C, Sn, E> {
    const mappedDecider = this._decider.dimapOnState(fl, fr);
    return new AggregateDecider(
      mappedDecider.decide,
      mappedDecider.evolve,
      mappedDecider.initialState,
    );
  }

  /**
   * Combines this AggregateDecider with another AggregateDecider using intersection-based state merging.
   *
   * @typeParam C2 - Command type of the second AggregateDecider
   * @typeParam S2 - State type of the second AggregateDecider
   * @typeParam E2 - Event type of the second AggregateDecider
   * @param other - The second AggregateDecider to combine with
   * @returns A new `AggregateDecider` with combined functionality
   */
  combine<C2, S2, E2>(
    other: AggregateDecider<C2, S2, E2>,
  ): AggregateDecider<C | C2, S & S2, E | E2> {
    const combinedDecider = this._decider.combine(other._decider);
    return new AggregateDecider(
      combinedDecider.decide,
      combinedDecider.evolve,
      combinedDecider.initialState,
    );
  }

  /**
   * Combines this AggregateDecider with another AggregateDecider using tuple-based state composition.
   *
   * @typeParam C2 - Command type of the second AggregateDecider
   * @typeParam S2 - State type of the second AggregateDecider
   * @typeParam E2 - Event type of the second AggregateDecider
   * @param other - The second AggregateDecider to combine with
   * @returns A new `AggregateDecider` with tuple-based combined state
   */
  combineViaTuples<C2, S2, E2>(
    other: AggregateDecider<C2, S2, E2>,
  ): AggregateDecider<C | C2, readonly [S, S2], E | E2> {
    const combinedDecider = this._decider.combineViaTuples(other._decider);
    return new AggregateDecider(
      combinedDecider.decide,
      combinedDecider.evolve,
      combinedDecider.initialState,
    );
  }
}

/**
 * The identity function: returns its input unchanged.
 */
const identity = <T>(t: T) => t;
