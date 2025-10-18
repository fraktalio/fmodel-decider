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
 * The `IDecider` interface defines the contract for decision-making algorithms.
 *
 * @typeParam C - Command type
 * @typeParam Si - Input state type
 * @typeParam So - Output state type
 * @typeParam Ei - Input event type
 * @typeParam Eo - Output event type
 */
interface IDecider<C, Si, So, Ei, Eo> {
  /**
   * Compute events from a command and a current state.
   *
   * @param command - The command to evaluate
   * @param state - The current state
   * @returns A list of output events
   */
  readonly decide: (command: C, state: Si) => readonly Eo[];

  /**
   * Compute the next state from a state and an input event.
   *
   * @param state - The current state
   * @param event - The input event
   * @returns The next state
   */
  readonly evolve: (state: Si, event: Ei) => So;

  /**
   * The initial state.
   */
  readonly initialState: So;
}

/**
 * A `Decider` models a decision-making algorithm over commands, states, and events.
 *
 * @remarks
 * A `Decider` is parameterized by five generic types:
 * - `C`: command
 * - `Si`: input state
 * - `So`: output state
 * - `Ei`: input event
 * - `Eo`: output event
 *
 * A `Decider` is polymorphic in these types; changing them does not alter its
 * fundamental behavior. For example, both `C = CreateOrder | PlaceOrder` and
 * `C = number` are valid.
 *
 * The core responsibilities of a `Decider` are:
 * - **decide**: compute new events given a command and a current state
 * - **evolve**: compute a new state given a state and an event
 * - **initialState**: the starting state
 *
 * @example
 * ```ts
 * const d = new Decider(
 *   (cmd: string, state: number) => cmd === "inc" ? [1] : [],
 *   (state: number, event: number) => state + event,
 *   0,
 * );
 *
 * const events = d.decide("inc", 0); // [1]
 * const next = d.evolve(0, 1);       // 1
 * ```
 *
 * @typeParam C - Command type
 * @typeParam Si - Input state type
 * @typeParam So - Output state type
 * @typeParam Ei - Input event type
 * @typeParam Eo - Output event type
 *
 * @author Иван Дугалић / Ivan Dugalic / @idugalic
 */
class Decider<C, Si, So, Ei, Eo> implements IDecider<C, Si, So, Ei, Eo> {
  constructor(
    readonly decide: (c: C, s: Si) => readonly Eo[],
    readonly evolve: (s: Si, e: Ei) => So,
    readonly initialState: So,
  ) {}

  /**
   * Contra (Left) map on the command (`C`) parameter (contravariant).
   *
   * @typeParam Cn - New command type
   * @param f - Mapping function from new command to old command
   * @returns A new `Decider` with updated command type
   */
  mapContraOnCommand<Cn>(f: (cn: Cn) => C): Decider<Cn, Si, So, Ei, Eo> {
    return new Decider(
      (cn: Cn, s: Si) => this.decide(f(cn), s),
      (s: Si, e: Ei) => this.evolve(s, e),
      this.initialState,
    );
  }

  /**
   * Dimap on the event parameter:
   * - Contravariant on input events
   * - Covariant on output events
   *
   * @typeParam Ein - New input event type
   * @typeParam Eon - New output event type
   * @param fl - Mapping function for input events
   * @param fr - Mapping function for output events
   * @returns A new `Decider` with updated event types
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
   * Dimap on the state parameter:
   * - Contravariant on input state (`Si`)
   * - Covariant on output state (`So`)
   *
   * @typeParam Sin - New input state type
   * @typeParam Son - New output state type
   * @param fl - Mapping function for input state
   * @param fr - Mapping function for output state
   * @returns A new `Decider` with updated state types
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
  private applyOnState<Son>(
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
   * Combines state via intersection (So & Son)
   *
   * @typeParam Son - New output State
   */
  private productOnState<Son>(
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
   * Combines state via tuple [So, Son]
   *
   * @typeParam Son - New output State
   */
  private productViaTuplesOnState<Son>(
    fb: Decider<C, Si, Son, Ei, Eo>,
  ): Decider<C, Si, readonly [So, Son], Ei, Eo> {
    return this.applyOnState(
      fb.dimapOnState(identity, (b: Son) => (a: So) => [a, b]),
    );
  }

  /**
   * Combine this `Decider` with another, merging their behavior.
   *
   * States are combined via **intersection** (`So & So2`).
   *
   * @typeParam C2 - Other command type
   * @typeParam Si2 - Other input state type
   * @typeParam So2 - Other output state type
   * @typeParam Ei2 - Other input event type
   * @typeParam Eo2 - Other output event type
   * @param y - Another `Decider`
   * @returns A combined `Decider` with intersected state
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
   * Combine this `Decider` with another, merging their behavior.
   *
   * States are combined via **tuples** (`[So, So2]`).
   *
   * @typeParam C2 - Other command type
   * @typeParam Si2 - Other input state type
   * @typeParam So2 - Other output state type
   * @typeParam Ei2 - Other input event type
   * @typeParam Eo2 - Other output event type
   * @param y - Another `Decider`
   * @returns A combined `Decider` with tuple state
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
 * A specialized Decider where input and output state types are the same.
 *
 * @typeParam C - Command type
 * @typeParam S - State type (both input and output)
 * @typeParam Ei - Input event type
 * @typeParam Eo - Output event type
 */
export interface IDcbDecider<C, S, Ei, Eo> extends IDecider<C, S, S, Ei, Eo> {
  /**
   * Computes new events from a command by first replaying all past events
   * to derive the current state.
   *
   * @param events - A sequence of historical input events that represent the past behavior of the system.
   * @param command - The new command to evaluate against the current state derived from `events`.
   * @returns The list of newly produced output events.
   *
   * @remarks
   * This method models the **event-sourced decision loop**:
   * ```
   * events → state → command → new events
   * ```
   */
  computeNewEvents(events: readonly Ei[], command: C): readonly Eo[];
}

/**
 * A concrete implementation of IDcbDecider where input and output states are the same type.
 *
 * @typeParam C - Command type
 * @typeParam S - State type (input and output)
 * @typeParam Ei - Input event type
 * @typeParam Eo - Output event type
 */
export class DcbDecider<C, S, Ei, Eo> extends Decider<C, S, S, Ei, Eo>
  implements IDcbDecider<C, S, Ei, Eo> {
  constructor(
    override readonly decide: (c: C, s: S) => readonly Eo[],
    override readonly evolve: (s: S, e: Ei) => S,
    override readonly initialState: S,
  ) {
    super(decide, evolve, initialState);
  }

  computeNewEvents(events: readonly Ei[], command: C): readonly Eo[] {
    const currentState = events.reduce(
      this.evolve,
      this.initialState,
    );
    return this.decide(command, currentState);
  }
}

/**
 * A specialized Decider where input and output state types and event types are the same.
 *
 * @typeParam C - Command type
 * @typeParam S - State type (both input and output)
 * @typeParam E - Event type (both input and output)
 */
export interface IAggregateDecider<C, S, E> extends IDcbDecider<C, S, E, E> {
  /**
   * Computes the next state directly from a command and a current state.
   *
   * @param state - The current state.
   * @param command - The command to evaluate.
   * @returns The new state after applying all events produced by the command.
   *
   * @remarks
   * This models the **state-stored decision loop**:
   * ```
   * state → command → events → new state
   * ```
   */
  computeNewState(state: S, command: C): S;
}

/**
 * A concrete implementation of IAggregateDecider where input and output states are the same type.
 *
 * @typeParam C - Command type
 * @typeParam S - State type (input and output)
 * @typeParam Ei - Input event type
 * @typeParam Eo - Output event type
 */
export class AggregateDecider<C, S, E> extends DcbDecider<C, S, E, E>
  implements IAggregateDecider<C, S, E> {
  constructor(
    override readonly decide: (c: C, s: S) => readonly E[],
    override readonly evolve: (s: S, e: E) => S,
    override readonly initialState: S,
  ) {
    super(decide, evolve, initialState);
  }

  computeNewState(state: S, command: C): S {
    const events = this.decide(command, state);
    return events.reduce(this.evolve, state);
  }
}

/**
 * The identity function: returns its input unchanged.
 */
const identity = <T>(t: T) => t;
