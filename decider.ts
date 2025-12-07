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

import { identity } from "@fraktalio/fmodel-decider";
import type { IProjection, IView } from "./view.ts";

/**
 * The foundational contract for decision-making algorithms with independent type parameters.
 *
 * @remarks
 * This is the most generic form in the progressive refinement model, allowing all five type parameters
 * to vary independently. This flexibility enables complex cross-concept scenarios such as:
 * - Policies that transform between different bounded contexts
 * - Sagas that coordinate across multiple aggregates
 * - Projections that build read models from event streams
 *
 * The independent type parameters allow input state (`Si`) to differ from output state (`So`), and
 * input events (`Ei`) to differ from output events (`Eo`). This enables transformations and
 * cross-boundary integrations that aren't possible with more constrained forms.
 *
 * Progressive refinement: This interface is the foundation. More specialized forms like `IDcbDecider`
 * and `IAggregateDecider` add constraints that enable additional capabilities.
 *
 * @typeParam C - Command type representing the intent or instruction to be processed
 * @typeParam Si - Input state type used by the decide function to make decisions
 * @typeParam So - Output state type produced by the evolve function, may differ from Si for transformations
 * @typeParam Ei - Input event type consumed by the evolve function to update state
 * @typeParam Eo - Output event type produced by the decide function, may differ from Ei for cross-concept scenarios
 *
 * @author Fraktalio
 */
export interface IDecider<C, Si, So, Ei, Eo> extends IView<Si, So, Ei> {
  /**
   * Computes output events from a command and current state.
   *
   * @param command - The command representing the intent or instruction to be processed
   * @param state - The current input state used to make the decision
   * @returns A readonly array of output events representing what should happen as a result of the command
   */
  readonly decide: (command: C, state: Si) => readonly Eo[];
}

/**
 * The first refinement step constraining input and output state types to be identical.
 *
 * @remarks
 * This interface enforces the constraint `Si = So = S`, meaning the state type is consistent throughout
 * the decider's lifecycle. This constraint enables **event-sourced computation** via the `computeNewEvents`
 * method, which derives current state from a complete event history before making decisions.
 *
 * Progressive refinement: By constraining state types to be identical, we gain the ability to replay
 * events to reconstruct state. This is the first step toward a fully event-sourced aggregate.
 *
 * Use this when:
 * - You need event-sourced computation (deriving state from event history)
 * - Your state structure remains consistent (no transformations)
 * - You may still need different input/output event types for cross-boundary scenarios
 *
 * @typeParam C - Command type representing the intent or instruction to be processed
 * @typeParam S - State type (both input and output), constrained to be identical for consistent event-sourced evolution
 * @typeParam Ei - Input event type consumed by the evolve function to update state
 * @typeParam Eo - Output event type produced by the decide function, may differ from Ei for cross-boundary scenarios
 *
 * @author Fraktalio
 */
export interface IDcbDecider<C, S, Ei, Eo>
  extends IDecider<C, S, S, Ei, Eo>, IProjection<S, Ei> {
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
 * The most refined form in the progressive type system, constraining both state and event types to be identical.
 *
 * @remarks
 * This is the final refinement step with dual constraints: `Si = So = S` and `Ei = Eo = E`. These constraints
 * represent a true domain aggregate where events produced by decisions are the same type as events consumed
 * for state evolution. This enables **both event-sourced and state-stored computation patterns**.
 *
 * Progressive refinement: By adding the constraint `Ei = Eo = E`, we gain the ability to use state-stored
 * computation via `computeNewState`. This is the most constrained and most capable form, ideal for
 * traditional domain aggregates.
 *
 * Dual computation modes:
 * - **Event-sourced** (`computeNewEvents`): Replay all events to derive state, then decide
 * - **State-stored** (`computeNewState`): Use current state directly, apply events immediately
 *
 * Use this when:
 * - You're modeling a traditional domain aggregate (Order, Account, Reservation)
 * - Events produced and consumed are within the same bounded context
 * - You need both event-sourced and state-stored computation options
 *
 * @typeParam C - Command type representing the intent or instruction to be processed by the aggregate
 * @typeParam S - State type (both input and output), representing the aggregate's consistent internal state
 * @typeParam E - Event type (both input and output), representing state changes and domain events within the aggregate boundary
 *
 * @author Fraktalio
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
 * The foundational implementation of decision-making algorithms with independent type parameters.
 *
 * @remarks
 * This is the most generic implementation in the progressive refinement model, providing the foundation
 * for all decision-making components. It supports transformations, combinations, and functional composition
 * through methods like `mapContraOnCommand`, `dimapOnEvent`, `dimapOnState`, and `combine`.
 *
 * Functional programming patterns:
 * - **Functor**: `dimapOnEvent` and `dimapOnState` allow mapping over event and state types
 * - **Contravariant functor**: `mapContraOnCommand` maps in the opposite direction for commands
 * - **Applicative**: `applyOnState` and `productOnState` enable combining multiple deciders
 *
 * The class provides rich composition capabilities, allowing you to build complex decision logic
 * from simpler components. Use `combine` for intersection-based state merging or `combineViaTuples`
 * for tuple-based composition when state properties might conflict.
 *
 * @typeParam C - Command type representing the intent or instruction to be processed
 * @typeParam Si - Input state type used by the decide function
 * @typeParam So - Output state type produced by the evolve function
 * @typeParam Ei - Input event type consumed by the evolve function
 * @typeParam Eo - Output event type produced by the decide function
 *
 * @author Fraktalio
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
   * @remarks
   * This implements a **contravariant functor** on the command type. Unlike covariant functors that map
   * outputs, contravariant functors map inputs in the opposite direction. The mapping function `f` converts
   * from the new command type to the original, allowing the decider to accept a broader range of commands.
   *
   * Use this when you need to adapt a decider to accept a different command type, such as wrapping
   * commands in an envelope or extracting commands from a larger message structure.
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
   * Transforms both input and output event types of this decider using dimap (dual mapping).
   *
   * @remarks
   * This implements a **profunctor** pattern, mapping both contravariant inputs and covariant outputs.
   * The `fl` function maps input events (contravariant), while `fr` maps output events (covariant).
   * This is useful for adapting event types when integrating across bounded contexts or event schemas.
   *
   * Use this when you need to:
   * - Translate events between different schemas or versions
   * - Adapt a decider to work with a different event store format
   * - Bridge between internal and external event representations
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
   * Transforms both input and output state types of this decider using dimap (dual mapping).
   *
   * @remarks
   * This implements a **profunctor** pattern on state types, mapping both contravariant inputs and
   * covariant outputs. The `fl` function maps input state (contravariant), while `fr` maps output
   * state (covariant). This enables state transformations and adaptations.
   *
   * Use this when you need to:
   * - Transform state representations (e.g., from domain model to persistence model)
   * - Add or remove fields from state
   * - Adapt a decider to work with a different state structure
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
   * Applies a decider containing a function in its state to this decider's state.
   *
   * @remarks
   * This implements the **applicative functor** pattern, specifically the `apply` operation (also known as `ap`).
   * It allows you to combine two deciders where one contains a function and the other contains a value,
   * producing a new decider with the function applied to the value.
   *
   * This is a low-level composition primitive. Most users should use `productOnState` or `combine` instead,
   * which provide more intuitive interfaces for combining deciders.
   *
   * @typeParam Son - New output state type after applying the function
   * @param ff - A decider whose state contains a function that transforms this decider's state
   * @returns A new `Decider` with the function applied to the state
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
   * Combines this decider with another decider, merging their states using intersection types.
   *
   * @remarks
   * This implements the **applicative product** operation, combining two deciders into one with an
   * intersected state type (`So & Son`). The resulting decider handles commands and events from both
   * deciders and maintains a merged state containing properties from both.
   *
   * This is useful for combining independent aspects of domain logic that share the same command and
   * event types but maintain separate state concerns. The intersection type works well when state
   * properties don't conflict.
   *
   * Note: If state properties might conflict, use `productViaTuplesOnState` instead, which keeps
   * states separate in a tuple.
   *
   * @typeParam Son - Output state type of the other decider
   * @param fb - The other decider to combine with this one
   * @returns A new `Decider` with intersected state type containing properties from both deciders
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
   * Combines this decider with another decider, keeping their states separate in a tuple.
   *
   * @remarks
   * This implements the **applicative product** operation using tuple-based composition instead of
   * intersection types. The resulting decider maintains states as a tuple `[So, Son]`, keeping them
   * completely separate and avoiding any property name conflicts.
   *
   * Use this when:
   * - State properties might conflict between the two deciders
   * - You want to maintain clear separation between state concerns
   * - You prefer explicit tuple access over merged objects
   *
   * Trade-off: Tuple-based composition is more explicit but requires accessing state via indices
   * (`state[0]`, `state[1]`) rather than property names.
   *
   * @typeParam Son - Output state type of the other decider
   * @param fb - The other decider to combine with this one
   * @returns A new `Decider` with tuple-based state containing both states separately
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
   * @remarks
   * This is the primary composition method for combining two independent deciders into a single unified
   * decider. It uses **intersection types** for state (`So & So2`) and **union types** for commands and
   * events (`C | C2`, `Ei | Ei2`, `Eo | Eo2`).
   *
   * The resulting decider can:
   * - Accept commands from either decider
   * - Process events from either decider
   * - Maintain a merged state with properties from both
   *
   * Use this when:
   * - Combining independent domain concerns (e.g., order management + inventory tracking)
   * - State properties don't conflict between deciders
   * - You want a unified interface for multiple concerns
   *
   * Note: Type casts are used internally to align union types. These are safe because the decider
   * logic ensures each command/event is routed to the appropriate handler.
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
    // Type cast is safe: each decider only processes its own command type from the union
    const deciderX = this.mapContraOnCommand<C | C2>((c) => c as C)
      .dimapOnState<Si & Si2, So>(
        // Type cast is safe: intersection type contains all properties of Si
        (sin) => sin as Si,
        identity,
      )
      .dimapOnEvent<Ei | Ei2, Eo | Eo2>(
        // Type cast is safe: each decider only processes its own event type from the union
        (ein) => ein as Ei,
        identity,
      );

    // Type cast is safe: each decider only processes its own command type from the union
    const deciderY = y
      .mapContraOnCommand<C | C2>((c) => c as C2)
      .dimapOnState<Si & Si2, So2>(
        // Type cast is safe: intersection type contains all properties of Si2
        (sin) => sin as Si2,
        identity,
      )
      .dimapOnEvent<Ei | Ei2, Eo | Eo2>(
        // Type cast is safe: each decider only processes its own event type from the union
        (ein) => ein as Ei2,
        identity,
      );

    return deciderX.productOnState(deciderY);
  }

  /**
   * Combines this decider with another decider using tuple-based state composition.
   *
   * @remarks
   * This is an alternative composition method that keeps states completely separate in tuples rather
   * than merging them with intersection types. The resulting state is `readonly [So, So2]`, providing
   * clear separation between the two deciders' state concerns.
   *
   * Use this when:
   * - State properties might conflict between deciders
   * - You want explicit separation of concerns
   * - You prefer tuple access over merged objects
   * - Combining truly independent domain concepts
   *
   * Trade-offs:
   * - **Pro**: No property name conflicts, explicit separation
   * - **Con**: Less convenient access (requires `state[0]` and `state[1]`)
   *
   * Note: Type casts are used internally to align union types. These are safe because each decider
   * only processes its own commands and events, accessing its portion of the tuple state.
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
    // Type cast is safe: each decider only processes its own command type from the union
    const deciderX = this.mapContraOnCommand<C | C2>((c) => c as C)
      .dimapOnState<readonly [Si, Si2], So>((sin) => sin[0], identity)
      .dimapOnEvent<Ei | Ei2, Eo | Eo2>(
        // Type cast is safe: each decider only processes its own event type from the union
        (ein) => ein as Ei,
        (eo) => eo,
      );

    // Type cast is safe: each decider only processes its own command type from the union
    const deciderY = y
      .mapContraOnCommand<C | C2>((c) => c as C2)
      .dimapOnState<readonly [Si, Si2], So2>((sin) => sin[1], identity)
      .dimapOnEvent<Ei | Ei2, Eo | Eo2>(
        // Type cast is safe: each decider only processes its own event type from the union
        (ein) => ein as Ei2,
        (eo2) => eo2,
      );

    return deciderX.productViaTuplesOnState(deciderY);
  }
}

/**
 * The second step in the progressive refinement model constraining input and output state types to be identical.
 *
 * @remarks
 * This class implements event-sourced computation by enforcing the constraint `Si = So = S`. The consistent
 * state type enables the `computeNewEvents` method, which derives current state from a complete event history
 * before making decisions.
 *
 * Progressive refinement: By constraining state types to be identical, we gain event-sourced capabilities
 * while still allowing different input/output event types for cross-boundary scenarios.
 *
 * Internally, this class wraps a `Decider` instance and delegates to it, ensuring all transformation
 * methods maintain the state type constraint.
 *
 * @typeParam C - Command type representing the intent or instruction to be processed
 * @typeParam S - State type (both input and output) representing the consistent state structure throughout the decider lifecycle
 * @typeParam Ei - Input event type consumed by the evolve function to update state
 * @typeParam Eo - Output event type produced by the decide function, may differ from Ei for cross-boundary scenarios
 *
 * @author Fraktalio
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
   * @remarks
   * This combines two event-sourced deciders into a single unified decider. Both deciders maintain
   * the `Si = So = S` constraint, so the resulting decider also supports event-sourced computation
   * via `computeNewEvents`.
   *
   * The combination uses intersection types for state and union types for commands and events,
   * allowing the combined decider to handle both sets of concerns.
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
   * @remarks
   * This combines two event-sourced deciders while keeping their states completely separate in a tuple.
   * Both deciders maintain the `Si = So = S` constraint, so the resulting decider also supports
   * event-sourced computation via `computeNewEvents`.
   *
   * Use this when state properties might conflict or when you want explicit separation between
   * the two deciders' state concerns.
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
 * The most refined form in the progressive refinement model with dual computation capabilities.
 *
 * @remarks
 * This class represents a true domain aggregate with dual constraints: `Si = So = S` and `Ei = Eo = E`.
 * These constraints enable **both event-sourced and state-stored computation patterns**, making it the
 * most capable and most constrained form in the progressive refinement hierarchy.
 *
 * Progressive refinement: By constraining both state and event types to be identical, we gain the ability
 * to use state-stored computation (`computeNewState`) in addition to event-sourced computation
 * (`computeNewEvents`). This is ideal for traditional domain aggregates.
 *
 * Dual computation modes:
 * - **Event-sourced** (`computeNewEvents`): Replay events to derive state, then decide
 * - **State-stored** (`computeNewState`): Use current state directly, apply events immediately
 *
 * Internally, this class wraps a `Decider` instance and delegates to it, ensuring all transformation
 * methods maintain both the state and event type constraints.
 *
 * @typeParam C - Command type representing the intent or instruction to be processed by the aggregate
 * @typeParam S - State type (both input and output) representing the consistent aggregate state structure
 * @typeParam E - Event type (both input and output) representing domain events that directly correspond to state changes
 *
 * @author Fraktalio
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
   * @remarks
   * This combines two domain aggregates into a single unified aggregate. Both aggregates maintain
   * the dual constraints `Si = So = S` and `Ei = Eo = E`, so the resulting aggregate also supports
   * both event-sourced and state-stored computation.
   *
   * The combination uses intersection types for state and union types for commands and events,
   * allowing the combined aggregate to handle multiple domain concerns.
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
   * @remarks
   * This combines two domain aggregates while keeping their states completely separate in a tuple.
   * Both aggregates maintain the dual constraints `Si = So = S` and `Ei = Eo = E`, so the resulting
   * aggregate also supports both event-sourced and state-stored computation.
   *
   * Use this when state properties might conflict or when you want explicit separation between
   * the two aggregates' state concerns.
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

