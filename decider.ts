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
 * The `IDecider` interface defines the foundational contract for decision-making algorithms.
 *
 * @remarks
 * `IDecider` represents the most generic form in the progressive refinement model, where all type parameters are independent.
 * This flexibility allows modeling complex cross-concept scenarios.
 *
 * The interface models the core decision-making pattern:
 * - **decide**: Given a command and current state, produce events representing what should happen
 * - **evolve**: Given a state and an event, compute the next state
 * - **initialState**: The starting point for state evolution
 *
 * **Progressive Refinement Path:**
 * - `IDecider<C, Si, So, Ei, Eo>` → Most generic, all types independent
 * - `IDcbDecider<C, S, Ei, Eo>` → Constrains `Si = So = S` for `event-sourced` scenarios
 * - `IAggregateDecider<C, S, E>` → Further constrains `Ei = Eo = E` for `domain aggregate pattern` scenarios
 *
 * @typeParam C - Command type representing the intent or instruction to be processed
 * @typeParam Si - Input state type used by the decide function to make decisions
 * @typeParam So - Output state type produced by the evolve function, may differ from Si for transformations
 * @typeParam Ei - Input event type consumed by the evolve function to update state
 * @typeParam Eo - Output event type produced by the decide function, may differ from Ei for cross-concept scenarios
 */
interface IDecider<C, Si, So, Ei, Eo> {
  /**
   * Computes output events from a command and current state, representing the decision logic of the system.
   *
   * @param command - The command representing the intent or instruction to be processed. Commands are typically
   *                  immutable data structures that capture user intent or system triggers.
   * @param state - The current input state used to make the decision. This represents the current knowledge
   *                or context needed to evaluate the command and determine what events should be produced.
   * @returns A readonly array of output events representing what should happen as a result of the command.
   *          Returns an empty array if the command should not produce any events in the current state.
   *
   * @remarks
   * This function embodies the core decision-making logic and should be:
   * - **Pure**: Same inputs always produce the same outputs. No side effects or external dependencies
   * - **Deterministic**: Same command and state always produce the same result
   * - **Idempotent**: Applying the same command multiple times should be safe
   *
   * The function models the pattern: `(Command, State) → Events`
   */
  readonly decide: (command: C, state: Si) => readonly Eo[];

  /**
   * Computes the next state from the current state and an input event, representing state evolution logic.
   *
   * @param state - The current input state before applying the event. This represents the system's current
   *                knowledge or data that will be updated based on the event.
   * @param event - The input event containing information about what happened. Events represent facts about
   *                past occurrences and are typically immutable.
   * @returns The new output state after applying the event. The output state type (So) may differ from
   *          the input state type (Si) to support state transformations and projections.
   *
   * @remarks
   * This function represents the state transition logic and should be:
   * - **Pure**: Same inputs always produce the same outputs. No side effects or external dependencies
   * - **Deterministic**: Same state and event always produce the same result
   * - **Idempotent**: Applying the same event multiple times should be safe
   *
   * The function models the pattern: `(State, Event) → State`
   */
  readonly evolve: (state: Si, event: Ei) => So;

  /**
   * The initial state representing the starting point for state evolution.
   *
   * @remarks
   * This value defines the default state when no events have been applied yet. It should represent
   * a valid, empty, or neutral state that serves as the foundation for all state evolution.
   *
   * The initial state is used as:
   * - The starting point for event sourcing (when replaying events from empty state)
   * - The default value for new aggregate instances
   * - The base case for state evolution operations
   */
  readonly initialState: So;
}

/**
 * The `Decider` class is the foundational implementation of decision-making algorithms, representing the most generic form in the progressive refinement model.
 *
 * @remarks
 * The `Decider` class implements the `IDecider` interface and serves as the starting point in the **progressive refinement model**:
 * - **`Decider<C, Si, So, Ei, Eo>`** → Most generic, all types independent ← *You are here*
 * - `DcbDecider<C, S, Ei, Eo>` → Constrains `Si = So = S` for event-sourced scenarios
 * - `AggregateDecider<C, S, E>` → Further constrains `Ei = Eo = E` for domain aggregates
 *
 * **Core Design Principles:**
 * - **Type Polymorphism**: All five type parameters are independent, providing maximum flexibility
 * - **Functional Composition**: Supports transformation and combination operations
 * - **Immutability**: All operations return new instances without mutating existing ones
 * - **Pure Functions**: Decision and evolution logic should be side-effect free
 *
 * **Key Capabilities:**
 * - **Decision Making**: Transform commands and state into events via `decide`
 * - **State Evolution**: Apply events to state to compute new state via `evolve`
 * - **Transformations**: Map over command, state, and event types using contravariant/covariant functors
 * - **Combinations**: Merge multiple deciders using intersection or tuple-based state merging
 *
 * **Type Parameter Independence:**
 * The five generic types are completely independent, enabling complex modeling scenarios:
 * - `C`: Commands can be union types, complex objects, or simple primitives
 * - `Si`/`So`: Input and output states can differ for transformations and projections
 * - `Ei`/`Eo`: Input and output events can differ for cross-boundary event translation
 *
 * @typeParam C - Command type representing the intent or instruction to be processed. Can be union types, objects, or primitives.
 * @typeParam Si - Input state type used by the decide function. Represents the current system knowledge needed for decision making.
 * @typeParam So - Output state type produced by the evolve function. May differ from Si for transformations and projections.
 * @typeParam Ei - Input event type consumed by the evolve function. Represents facts about what happened in the system.
 * @typeParam Eo - Output event type produced by the decide function. May differ from Ei for cross-boundary event translation.
 *
 * @author Иван Дугалић / Ivan Dugalic / @idugalic
 */
class Decider<C, Si, So, Ei, Eo> implements IDecider<C, Si, So, Ei, Eo> {
  /**
   * Creates a new Decider instance with the specified decision logic, state evolution logic, and initial state.
   *
   * @param decide - The decision function that computes output events from a command and current state.
   *                 This function should be pure (no side effects) and deterministic.
   *                 Pattern: `(Command, InputState) → OutputEvent[]`
   * @param evolve - The state evolution function that computes the next state from current state and an event.
   *                 This function should be pure and idempotent (safe to apply the same event multiple times).
   *                 Pattern: `(InputState, InputEvent) → OutputState`
   * @param initialState - The starting state for the decider, representing the default or empty state.
   *                       This value is used as the base case for state evolution and event sourcing operations.
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
   * This method enables **command adaptation** by transforming a new command type into the existing command type
   * that this decider understands. This is particularly useful for:
   * - **Command translation**: Converting external commands to internal domain commands
   * - **Protocol adaptation**: Bridging different command interfaces
   *
   * **Contravariant Mapping:**
   * The mapping function goes from the new command type to the old command type (`Cn → C`), which is
   * contravariant because commands are "consumed" by the decider. This allows the resulting decider
   * to accept the new command type while internally using the original decision logic.
   *
   * **Functional Pattern:**
   * ```
   * Original: Decider<C, Si, So, Ei, Eo>
   * Mapping:  (Cn) → C
   * Result:   Decider<Cn, Si, So, Ei, Eo>
   * ```
   *
   * @typeParam Cn - The new command type that the resulting decider will accept
   * @param f - Mapping function that transforms the new command type to the original command type.
   *            This function should be pure and deterministic to maintain decider properties.
   * @returns A new `Decider` instance that accepts commands of type `Cn` while preserving all other behavior
   *
   * @example
   * Protocol adaptation for external system integration:
   * ```ts
   * type InternalCommand = { operation: string; target: string; payload: Record<string, unknown>; };
   * type ExternalMessage = { messageType: string; destination: string; content: string; };
   *
   * const internalDecider = new Decider<InternalCommand, State, State, Event, Event>(
   *   (cmd, state) => [{ type: 'OperationExecuted', operation: cmd.operation, target: cmd.target }],
   *   (state, event) => ({ ...state, lastOperation: event.operation }),
   *   { lastOperation: '' }
   * );
   *
   * // Adapt external messages to internal commands
   * const externalDecider = internalDecider.mapContraOnCommand<ExternalMessage>(msg => ({
   *   operation: msg.messageType,
   *   target: msg.destination,
   *   payload: JSON.parse(msg.content)
   * }));
   * ```
   */
  mapContraOnCommand<Cn>(f: (cn: Cn) => C): Decider<Cn, Si, So, Ei, Eo> {
    return new Decider(
      (cn: Cn, s: Si) => this.decide(f(cn), s),
      (s: Si, e: Ei) => this.evolve(s, e),
      this.initialState,
    );
  }

  /**
   * Transforms both input and output event types of this decider using dimap (contravariant/covariant mapping).
   *
   * @remarks
   * This method enables **event type transformation** by applying two mapping functions:
   * - **Contravariant mapping** on input events (`Ein → Ei`): Transforms new input events to existing input events
   * - **Covariant mapping** on output events (`Eo → Eon`): Transforms existing output events to new output events
   *
   * **Use Cases:**
   * - **Event format migration**: Adapting between different event schema versions
   * - **Event enrichment/filtering**: Adding metadata or filtering event properties
   * - **Protocol adaptation**: Bridging different event formats across system boundaries
   *
   * **Dimap Pattern:**
   * ```
   * Original: Decider<C, Si, So, Ei, Eo>
   * Input:    Ein → Ei (contravariant - events consumed by evolve)
   * Output:   Eo → Eon (covariant - events produced by decide)
   * Result:   Decider<C, Si, So, Ein, Eon>
   * ```
   *
   * **Why Contravariant/Covariant:**
   * - Input events are **consumed** by `evolve`, so we need `Ein → Ei` (contravariant)
   * - Output events are **produced** by `decide`, so we need `Eo → Eon` (covariant)
   *
   * @typeParam Ein - New input event type that the resulting decider will consume in its evolve function
   * @typeParam Eon - New output event type that the resulting decider will produce from its decide function
   * @param fl - Contravariant mapping function that transforms new input events to original input events.
   *             Used to adapt incoming events before applying them to state evolution.
   * @param fr - Covariant mapping function that transforms original output events to new output events.
   *             Used to adapt outgoing events after decision logic produces them.
   * @returns A new `Decider` instance with transformed event types while preserving command and state behavior
   *
   * @example
   * Event schema migration from V1 to V2 format:
   * ```ts
   * type EventV1 = { type: string; id: string; data: unknown; };
   * type EventV2 = { eventType: string; aggregateId: string; payload: string; version: number; timestamp: Date; };
   *
   * const v1Decider = new Decider<Command, State, State, EventV1, EventV1>(
   *   (cmd, state) => [{ type: 'OrderCreated', id: cmd.orderId, data: cmd }],
   *   (state, event) => ({ ...state, lastEventType: event.type }),
   *   { lastEventType: '' }
   * );
   *
   * // Transform to work with V2 events
   * const v2Decider = v1Decider.dimapOnEvent<EventV2, EventV2>(
   *   // Convert V2 input events to V1 format (contravariant)
   *   (v2Event) => ({
   *     type: v2Event.eventType,
   *     id: v2Event.aggregateId,
   *     data: JSON.parse(v2Event.payload)
   *   }),
   *   // Convert V1 output events to V2 format (covariant)
   *   (v1Event) => ({
   *     eventType: v1Event.type,
   *     aggregateId: v1Event.id,
   *     payload: JSON.stringify(v1Event.data),
   *     version: 2,
   *     timestamp: new Date()
   *   })
   * );
   *
   * // Now works with V2 events
   * const v2Events = v2Decider.decide(command, state);
   * // Result: EventV2 format with eventType, aggregateId, payload, version, timestamp
   * ```
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
   * Transforms both input and output state types of this decider using dimap (contravariant/covariant mapping).
   *
   * @remarks
   * This method enables **state type transformation** by applying two mapping functions:
   * - **Contravariant mapping** on input state (`Sin → Si`): Transforms new input state to existing input state
   * - **Covariant mapping** on output state (`So → Son`): Transforms existing output state to new output state
   *
   * **Use Cases:**
   * - **State schema evolution**: Adapting between different state structure versions
   * - **State normalization/denormalization**: Converting between different state representations
   *
   * **Dimap Pattern:**
   * ```
   * Original: Decider<C, Si, So, Ei, Eo>
   * Input:    Sin → Si (contravariant - state consumed by decide)
   * Output:   So → Son (covariant - state produced by evolve)
   * Result:   Decider<C, Sin, Son, Ei, Eo>
   * ```
   *
   * **Why Contravariant/Covariant:**
   * - Input state is **consumed** by `decide`, so we need `Sin → Si` (contravariant)
   * - Output state is **produced** by `evolve`, so we need `So → Son` (covariant)
   *
   * @typeParam Sin - New input state type that the resulting decider will consume in its decide function
   * @typeParam Son - New output state type that the resulting decider will produce from its evolve function
   * @param fl - Contravariant mapping function that transforms new input state to original input state.
   *             Used to adapt incoming state before applying decision logic.
   * @param fr - Covariant mapping function that transforms original output state to new output state.
   *             Used to adapt outgoing state after evolution logic produces it.
   * @returns A new `Decider` instance with transformed state types while preserving command and event behavior
   *
   * @example
   * State schema migration from detailed to summary format:
   * ```ts
   * type DetailedState = {
   *   orderId: string;
   *   customerId: string;
   *   items: Array<{ id: string; name: string; price: number; quantity: number; }>;
   *   status: 'draft' | 'confirmed' | 'shipped';
   *   createdAt: Date;
   *   updatedAt: Date;
   * };
   *
   * type SummaryState = {
   *   id: string;
   *   customerRef: string;
   *   itemCount: number;
   *   totalValue: number;
   *   currentStatus: string;
   * };
   *
   * const detailedDecider = new Decider<Command, DetailedState, DetailedState, Event, Event>(
   *   (cmd, state) => {
   *     if (cmd.type === 'addItem') {
   *       return [{ type: 'ItemAdded', orderId: state.orderId, item: cmd.item }];
   *     }
   *     return [];
   *   },
   *   (state, event) => {
   *     if (event.type === 'ItemAdded') {
   *       return { ...state, items: [...state.items, event.item], updatedAt: new Date() };
   *     }
   *     return state;
   *   },
   *   {
   *     orderId: '', customerId: '', items: [], status: 'draft',
   *     createdAt: new Date(), updatedAt: new Date()
   *   }
   * );
   *
   * // Transform to work with summary state
   * const summaryDecider = detailedDecider.dimapOnState<SummaryState, SummaryState>(
   *   // Convert summary state to detailed state (contravariant)
   *   (summary) => ({
   *     orderId: summary.id,
   *     customerId: summary.customerRef,
   *     items: [], // Simplified - would need more complex mapping in real scenario
   *     status: summary.currentStatus as 'draft' | 'confirmed' | 'shipped',
   *     createdAt: new Date(),
   *     updatedAt: new Date()
   *   }),
   *   // Convert detailed state to summary state (covariant)
   *   (detailed) => ({
   *     id: detailed.orderId,
   *     customerRef: detailed.customerId,
   *     itemCount: detailed.items.length,
   *     totalValue: detailed.items.reduce((sum, item) => sum + (item.price * item.quantity), 0),
   *     currentStatus: detailed.status
   *   })
   * );
   *
   * // Now works with summary state format
   * const summaryState: SummaryState = { id: 'order-123', customerRef: 'cust-456', itemCount: 2, totalValue: 100, currentStatus: 'draft' };
   * const events = summaryDecider.decide(addItemCommand, summaryState);
   * ```
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
   * Combines this decider with another decider, merging their behavior.
   *
   * @remarks
   * This method creates a new decider that handles commands and events from both deciders while merging
   * their states using **TypeScript intersection types** (`So & So2`). The resulting state contains all
   * properties from both deciders' states, making it ideal for scenarios where you need to compose
   * multiple domain concerns into a single aggregate or entity.
   *
   * **Combination Behavior:**
   * - **Commands**: Accepts union of both command types (`C | C2`)
   * - **Input State**: Requires intersection of both input state types (`Si & Si2`)
   * - **Output State**: Produces intersection of both output state types (`So & So2`)
   * - **Events**: Handles union of both event types (`Ei | Ei2`, `Eo | Eo2`)
   * - **Decision Logic**: Both deciders' `decide` functions are called, events are concatenated
   * - **Evolution Logic**: Both deciders' `evolve` functions are applied, states are merged
   *
   * **When to Use Intersection Combination:**
   * @typeParam C2 - Command type of the other decider to combine with
   * @typeParam Si2 - Input state type of the other decider to combine with
   * @typeParam So2 - Output state type of the other decider to combine with
   * @typeParam Ei2 - Input event type of the other decider to combine with
   * @typeParam Eo2 - Output event type of the other decider to combine with
   * @param y - The other decider to combine with this one. Both deciders will operate on the same combined state.
   * @returns A new `Decider` that handles both sets of commands/events and maintains an intersected state
   *
   * @example
   * Combining order management with inventory tracking:
   * ```ts
   * type OrderCommand = { type: 'createOrder' | 'cancelOrder'; orderId: string; customerId: string; };
   * type OrderState = { orderId: string; status: 'pending' | 'confirmed' | 'cancelled'; customerId: string; };
   * type OrderEvent = { type: 'OrderCreated' | 'OrderCancelled'; orderId: string; };
   *
   * type InventoryCommand = { type: 'reserveItems' | 'releaseItems'; orderId: string; items: string[]; };
   * type InventoryState = { reservedItems: Record<string, string[]>; availableStock: Record<string, number>; };
   * type InventoryEvent = { type: 'ItemsReserved' | 'ItemsReleased'; orderId: string; items: string[]; };
   *
   * const orderDecider = new Decider<OrderCommand, OrderState, OrderState, OrderEvent, OrderEvent>(
   *   (cmd, state) => {
   *     if (cmd.type === 'createOrder' && state.status === 'pending') {
   *       return [{ type: 'OrderCreated', orderId: cmd.orderId }];
   *     }
   *     return [];
   *   },
   *   (state, event) => {
   *     if (event.type === 'OrderCreated') {
   *       return { ...state, orderId: event.orderId, status: 'confirmed' };
   *     }
   *     return state;
   *   },
   *   { orderId: '', status: 'pending', customerId: '' }
   * );
   *
   * const inventoryDecider = new Decider<InventoryCommand, InventoryState, InventoryState, InventoryEvent, InventoryEvent>(
   *   (cmd, state) => {
   *     if (cmd.type === 'reserveItems') {
   *       return [{ type: 'ItemsReserved', orderId: cmd.orderId, items: cmd.items }];
   *     }
   *     return [];
   *   },
   *   (state, event) => {
   *     if (event.type === 'ItemsReserved') {
   *       return {
   *         ...state,
   *         reservedItems: { ...state.reservedItems, [event.orderId]: event.items }
   *       };
   *     }
   *     return state;
   *   },
   *   { reservedItems: {}, availableStock: {} }
   * );
   *
   * // Combine using intersection - creates flat merged state
   * const combinedDecider = orderDecider.combine(inventoryDecider);
   *
   * // Combined state type: OrderState & InventoryState = {
   * //   orderId: string;
   * //   status: 'pending' | 'confirmed' | 'cancelled';
   * //   customerId: string;
   * //   reservedItems: Record<string, string[]>;
   * //   availableStock: Record<string, number>;
   * // }
   *
   * // Can handle both order and inventory commands
   * const orderEvents = combinedDecider.decide(
   *   { type: 'createOrder', orderId: 'order-123', customerId: 'cust-456' },
   *   {
   *     orderId: '', status: 'pending', customerId: '',
   *     reservedItems: {}, availableStock: { 'item-1': 10 }
   *   }
   * );
   *
   * const inventoryEvents = combinedDecider.decide(
   *   { type: 'reserveItems', orderId: 'order-123', items: ['item-1'] },
   *   {
   *     orderId: 'order-123', status: 'confirmed', customerId: 'cust-456',
   *     reservedItems: {}, availableStock: { 'item-1': 10 }
   *   }
   * );
   * ```
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
   * Combines this decider with another decider, merging their behavior using **tuple-based state merging**.
   *
   * @remarks
   * This method creates a new decider that handles commands and events from both deciders while keeping
   * their states **separate and nested** using **TypeScript tuple types** (`[So, So2]`). The resulting
   * state maintains clear boundaries between the two deciders' concerns, making it ideal for scenarios
   * where you need to compose independent domain concepts without state property conflicts.
   *
   * **Combination Behavior:**
   * - **Commands**: Accepts union of both command types (`C | C2`)
   * - **Input State**: Requires tuple of both input state types (`[Si, Si2]`)
   * - **Output State**: Produces tuple of both output state types (`[So, So2]`)
   * - **Events**: Handles union of both event types (`Ei | Ei2`, `Eo | Eo2`)
   * - **Decision Logic**: Both deciders' `decide` functions are called on their respective state portions
   * - **Evolution Logic**: Both deciders' `evolve` functions are applied to their respective state portions
   *
   * **When to Use Tuple Combination:**
   * - Combining independent bounded contexts or domains
   * - Avoiding state property name conflicts
   * - Maintaining clear separation of concerns
   * - Composing deciders with incompatible state structures
   * - Building modular, loosely-coupled systems
   *
   * **Comparison with Intersection Combination:**
   * - **Tuple**: `[{ orderId: string }, { items: Item[] }]` → Nested, separated structure
   * - **Intersection**: `{ orderId: string } & { items: Item[] }` → `{ orderId: string, items: Item[] }` (flat)
   *
   * **State Access Pattern:**
   * ```ts
   * const [leftState, rightState] = combinedState;
   * // Access first decider's state: leftState.property
   * // Access second decider's state: rightState.property
   * ```
   *
   * @typeParam C2 - Command type of the other decider to combine with
   * @typeParam Si2 - Input state type of the other decider to combine with
   * @typeParam So2 - Output state type of the other decider to combine with
   * @typeParam Ei2 - Input event type of the other decider to combine with
   * @typeParam Eo2 - Output event type of the other decider to combine with
   * @param y - The other decider to combine with this one. Each decider will operate on its own portion of the tuple state.
   * @returns A new `Decider` that handles both sets of commands/events and maintains a tuple-structured state
   *
   * @example
   * Combining independent order and shipping domains:
   * ```ts
   * type OrderCommand = { type: 'createOrder' | 'cancelOrder'; orderId: string; };
   * type OrderState = { orderId: string; status: 'pending' | 'confirmed' | 'cancelled'; };
   * type OrderEvent = { type: 'OrderCreated' | 'OrderCancelled'; orderId: string; };
   *
   * type ShippingCommand = { type: 'scheduleShipment' | 'trackPackage'; trackingId: string; };
   * type ShippingState = { trackingId: string; location: string; status: 'preparing' | 'shipped' | 'delivered'; };
   * type ShippingEvent = { type: 'ShipmentScheduled' | 'PackageTracked'; trackingId: string; };
   *
   * const orderDecider = new Decider<OrderCommand, OrderState, OrderState, OrderEvent, OrderEvent>(
   *   (cmd, state) => {
   *     if (cmd.type === 'createOrder') {
   *       return [{ type: 'OrderCreated', orderId: cmd.orderId }];
   *     }
   *     return [];
   *   },
   *   (state, event) => {
   *     if (event.type === 'OrderCreated') {
   *       return { ...state, orderId: event.orderId, status: 'confirmed' };
   *     }
   *     return state;
   *   },
   *   { orderId: '', status: 'pending' }
   * );
   *
   * const shippingDecider = new Decider<ShippingCommand, ShippingState, ShippingState, ShippingEvent, ShippingEvent>(
   *   (cmd, state) => {
   *     if (cmd.type === 'scheduleShipment') {
   *       return [{ type: 'ShipmentScheduled', trackingId: cmd.trackingId }];
   *     }
   *     return [];
   *   },
   *   (state, event) => {
   *     if (event.type === 'ShipmentScheduled') {
   *       return { ...state, trackingId: event.trackingId, status: 'preparing' };
   *     }
   *     return state;
   *   },
   *   { trackingId: '', location: '', status: 'preparing' }
   * );
   *
   * // Combine using tuples - keeps states separate
   * const combinedDecider = orderDecider.combineViaTuples(shippingDecider);
   *
   * // Combined state type: [OrderState, ShippingState] = [
   * //   { orderId: string; status: 'pending' | 'confirmed' | 'cancelled'; },
   * //   { trackingId: string; location: string; status: 'preparing' | 'shipped' | 'delivered'; }
   * // ]
   *
   * const initialState: [OrderState, ShippingState] = [
   *   { orderId: '', status: 'pending' },
   *   { trackingId: '', location: '', status: 'preparing' }
   * ];
   *
   * // Handle order command - affects only first element of tuple
   * const orderEvents = combinedDecider.decide(
   *   { type: 'createOrder', orderId: 'order-123' },
   *   initialState
   * );
   *
   * // Handle shipping command - affects only second element of tuple
   * const shippingEvents = combinedDecider.decide(
   *   { type: 'scheduleShipment', trackingId: 'track-456' },
   *   initialState
   * );
   *
   * // Access state components separately
   * const [orderState, shippingState] = combinedDecider.initialState;
   * console.log('Order ID:', orderState.orderId);
   * console.log('Tracking ID:', shippingState.trackingId);
   * ```
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
 * The `IDcbDecider` interface represents the first refinement step in the progressive type system, constraining input and output state types to be identical.
 *
 * @remarks
 * `IDcbDecider` refines the base `IDecider` by enforcing the constraint `Si = So = S`, meaning the state type remains consistent
 * throughout the decision-making process. This constraint enables **event-sourced computation** where the current state is derived
 * by replaying historical events from an initial state.
 *
 * **Key Constraint: Si = So = S**
 * - Input state type equals output state type
 * - Enables consistent state evolution through event replay
 * - Supports event-sourced architectures where state is not directly stored
 *
 * **Event-Sourced Computation Model:**
 * The `computeNewEvents` method implements the core event-sourcing pattern:
 * ```
 * Historical Events → Current State → Command → New Events
 * ```
 *
 * **Progressive Refinement Context:**
 * - `IDecider<C, Si, So, Ei, Eo>` → All types independent
 * - **`IDcbDecider<C, S, Ei, Eo>`** → Constrains `Si = So = S` ← *You are here*
 * - `IAggregateDecider<C, S, E>` → Further constrains `Ei = Eo = E`
 *
 * @typeParam C - Command type representing the intent or instruction to be processed
 * @typeParam S - State type (both input and output), constrained to be identical for consistent event-sourced evolution
 * @typeParam Ei - Input event type consumed by the evolve function to update state
 * @typeParam Eo - Output event type produced by the decide function, may differ from Ei for cross-boundary scenarios
 */
export interface IDcbDecider<C, S, Ei, Eo> extends IDecider<C, S, S, Ei, Eo> {
  /**
   * Computes new events from a command by first replaying all past events to derive the current state, then applying decision logic.
   *
   * @param events - A readonly array of historical input events representing the complete past behavior of the system.
   *                 These events are replayed in order to reconstruct the current state without requiring state storage.
   * @param command - The new command to evaluate against the current state derived from the event history.
   *                  Commands represent intent or instructions that may produce new events.
   * @returns A readonly array of newly produced output events representing the decisions made based on the command
   *          and current state. Returns an empty array if the command should not produce events in the current state.
   *
   * @remarks
   * This method implements the **event-sourced decision loop**, the core pattern of event-sourced systems:
   * ```
   * Historical Events → Current State → Command → New Events
   * ```
   *
   * **Event Sourcing Benefits:**
   * - **No state storage required**: State is derived from events on-demand
   * - **Complete audit trail**: All changes are captured as immutable events
   * - **Time travel**: Can reconstruct state at any point in history
   * - **Replay capability**: Can reprocess commands against historical states
   *
   * **Implementation Pattern:**
   * 1. Start with `initialState`
   * 2. Apply each historical event using `evolve` to derive current state
   * 3. Use `decide` with the command and current state to produce new events
   * 4. Return the new events (state changes are captured as events, not direct mutations)
   */
  computeNewEvents(events: readonly Ei[], command: C): readonly Eo[];
}

/**
 * The `DcbDecider` class represents the second step in the progressive refinement model, constraining input and output state types to be identical while maintaining flexibility in event types.
 *
 * @remarks
 * `DcbDecider` (Decision-Computation-Behavior Decider) implements the `IDcbDecider` interface and serves as the **event-sourced computation** specialist in the progressive refinement hierarchy:
 * - `Decider<C, Si, So, Ei, Eo>` → Most generic, all types independent
 * - **`DcbDecider<C, S, Ei, Eo>`** → Constrains `Si = So = S` for event-sourced scenarios ← *You are here*
 * - `AggregateDecider<C, S, E>` → Further constrains `Ei = Eo = E` for domain aggregates
 *
 * **Key Constraint: Si = So = S**
 * The fundamental constraint `Si = So = S` means that the state type used for decision-making is identical to the state type produced by event evolution. This constraint is essential for **event-sourced computation** where:
 * - State is derived from historical events, not stored directly
 * - The same state type flows through both decision and evolution phases
 * - State consistency is maintained throughout the event sourcing lifecycle
 *
 * **Event-Sourced Computation Pattern:**
 * ```
 * Historical Events → Derive Current State → Make Decision → Produce New Events
 * [Event1, Event2, ...] → State → Command → [NewEvent1, NewEvent2, ...]
 * ```
 *
 * **Core Capabilities:**
 * - **Event Sourcing**: Derive current state from historical events using `computeNewEvents`
 * - **Decision Making**: Transform commands and derived state into new events
 * - **State Evolution**: Apply events to state to maintain consistency
 * - **Functional Composition**: Inherit all transformation and combination operations from `Decider`
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
   * Computes new output events by first deriving the current state from historical events, then applying decision logic to the command and derived state.
   *
   * @remarks
   * This method implements the **event-sourced computation pattern** that is central to `DcbDecider`:
   * ```
   * Historical Events → Derive Current State → Apply Command → Produce New Events
   * [Event1, Event2, ...] → State → Command → [NewEvent1, NewEvent2, ...]
   * ```
   *
   * **Event Sourcing Process:**
   * 1. **State Derivation**: Apply all historical events to `initialState` using `evolve` function
   * 2. **Decision Making**: Pass the derived state and command to `decide` function
   * 3. **Event Production**: Return new events representing what should happen
   *
   * **Key Benefits:**
   * - **Complete Audit Trail**: All state changes are captured as events
   * - **Time Travel**: Can replay events to any point in time
   * - **Deterministic**: Same events always produce same state
   * - **Immutable History**: Past events cannot be changed, only new events added
   *
   * @param events - Historical events representing the complete event stream for this entity.
   *                 Events are applied in order to derive the current state. An empty array
   *                 results in using `initialState` as the current state.
   * @param command - The command to be processed against the derived current state.
   *                  Commands represent intent or instructions that may produce new events.
   * @returns A readonly array of new output events representing what should happen as a result
   *          of processing the command against the current state. Returns empty array if the
   *          command should not produce any events in the current state.
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
   * Since DcbDecider has Si = So = S, the new state type must be the same for input and output.
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
 * The `IAggregateDecider` interface represents the most refined form in the progressive type system, constraining both state and event types to be identical.
 *
 * @remarks
 * `IAggregateDecider` represents the final refinement step, enforcing dual constraints: `Si = So = S` and `Ei = Eo = E`.
 * This makes it ideal for modeling **domain aggregates** where events and state have consistent types throughout the system.
 * The interface supports both **event-sourced** and **state-stored** computation patterns, making it the most versatile
 * decider type for traditional domain-driven design scenarios.
 *
 * **Key Constraints:**
 * - **State Constraint: Si = So = S** - Input and output state types are identical
 * - **Event Constraint: Ei = Eo = E** - Input and output event types are identical
 * - Enables both event-sourced and state-stored computation patterns
 * - Perfect for domain aggregates where events represent state changes directly
 *
 * **Dual Computation Capabilities:**
 *
 * **1. Event-Sourced Computation** (inherited from `IDcbDecider`):
 * ```
 * Historical Events → Current State → Command → New Events
 * ```
 * - Use `computeNewEvents(events, command)` for event sourcing
 * - State is derived from event history, not stored directly
 * - Provides complete audit trail and time-travel capabilities
 *
 * **2. State-Stored Computation** (unique to `IAggregateDecider`):
 * ```
 * Current State → Command → Events → Updated State
 * ```
 * - Use `computeNewState(state, command)` for state storage
 * - State is maintained directly, events represent changes
 * - Optimized for performance when full event history isn't needed
 *
 * **Relationship to Parent Interfaces:**
 * - Inherits from `IDcbDecider<C, S, E, E>` (adds state-stored computation)
 * - Inherits from `IDecider<C, S, S, E, E>` (adds both computation patterns)
 * - Most constrained but most feature-complete decider type
 *
 * **Progressive Refinement Context:**
 * - `IDecider<C, Si, So, Ei, Eo>` → All types independent
 * - `IDcbDecider<C, S, Ei, Eo>` → Constrains `Si = So = S`
 * - **`IAggregateDecider<C, S, E>`** → Constrains `Si = So = S` and `Ei = Eo = E` ← *You are here*
 *
 * **When to Use IAggregateDecider:**
 * - Domain aggregates (Order, Customer, Product, etc.)
 * - Entities where events directly represent state changes
 * - Systems requiring both event-sourced and state-stored flexibility
 * - Traditional DDD scenarios with consistent event/state modeling
 *
 * @example
 * Complete order aggregate with both computation patterns:
 * ```ts
 * type OrderCommand = {
 *   type: 'create' | 'addItem' | 'removeItem' | 'confirm' | 'ship' | 'cancel';
 *   orderId: string;
 *   customerId?: string;
 *   itemId?: string;
 *   quantity?: number;
 * };
 *
 * type OrderState = {
 *   orderId: string;
 *   customerId: string;
 *   status: 'draft' | 'confirmed' | 'shipped' | 'cancelled';
 *   items: Array<{ itemId: string; quantity: number; }>;
 *   total: number;
 * };
 *
 * type OrderEvent = {
 *   type: 'OrderCreated' | 'ItemAdded' | 'ItemRemoved' | 'OrderConfirmed' | 'OrderShipped' | 'OrderCancelled';
 *   orderId: string;
 *   timestamp: Date;
 *   itemId?: string;
 *   quantity?: number;
 *   customerId?: string;
 * };
 *
 * const orderAggregate: IAggregateDecider<OrderCommand, OrderState, OrderEvent> = {
 *   decide: (cmd, state) => {
 *     const timestamp = new Date();
 *     switch (cmd.type) {
 *       case 'create':
 *         return state.orderId ? [] : [{
 *           type: 'OrderCreated',
 *           orderId: cmd.orderId,
 *           customerId: cmd.customerId!,
 *           timestamp
 *         }];
 *       case 'addItem':
 *         return state.status === 'draft' ? [{
 *           type: 'ItemAdded',
 *           orderId: cmd.orderId,
 *           itemId: cmd.itemId!,
 *           quantity: cmd.quantity!,
 *           timestamp
 *         }] : [];
 *       case 'confirm':
 *         return state.status === 'draft' && state.items.length > 0 ? [{
 *           type: 'OrderConfirmed',
 *           orderId: cmd.orderId,
 *           timestamp
 *         }] : [];
 *       default:
 *         return [];
 *     }
 *   },
 *   evolve: (state, event) => {
 *     switch (event.type) {
 *       case 'OrderCreated':
 *         return {
 *           orderId: event.orderId,
 *           customerId: event.customerId!,
 *           status: 'draft',
 *           items: [],
 *           total: 0
 *         };
 *       case 'ItemAdded':
 *         return {
 *           ...state,
 *           items: [...state.items, { itemId: event.itemId!, quantity: event.quantity! }],
 *           total: state.total + (event.quantity! * 10) // Simplified pricing
 *         };
 *       case 'OrderConfirmed':
 *         return { ...state, status: 'confirmed' };
 *       case 'OrderShipped':
 *         return { ...state, status: 'shipped' };
 *       case 'OrderCancelled':
 *         return { ...state, status: 'cancelled' };
 *       default:
 *         return state;
 *     }
 *   },
 *   initialState: {
 *     orderId: '',
 *     customerId: '',
 *     status: 'draft',
 *     items: [],
 *     total: 0
 *   },
 *
 *   // Event-sourced computation (inherited from IDcbDecider)
 *   computeNewEvents: (events, command) => {
 *     const currentState = events.reduce(orderAggregate.evolve, orderAggregate.initialState);
 *     return orderAggregate.decide(command, currentState);
 *   },
 *
 *   // State-stored computation (unique to IAggregateDecider)
 *   computeNewState: (state, command) => {
 *     const events = orderAggregate.decide(command, state);
 *     return events.reduce(orderAggregate.evolve, state);
 *   }
 * };
 * ```
 *
 * @example
 * Event-sourced usage - deriving state from complete event history:
 * ```ts
 * const orderHistory: OrderEvent[] = [
 *   { type: 'OrderCreated', orderId: 'order-123', customerId: 'cust-456', timestamp: new Date('2024-01-01') },
 *   { type: 'ItemAdded', orderId: 'order-123', itemId: 'item-789', quantity: 2, timestamp: new Date('2024-01-02') },
 *   { type: 'ItemAdded', orderId: 'order-123', itemId: 'item-101', quantity: 1, timestamp: new Date('2024-01-03') }
 * ];
 *
 * // Command to confirm the order
 * const confirmCommand: OrderCommand = { type: 'confirm', orderId: 'order-123' };
 *
 * // Event-sourced computation: replay history, then decide
 * const newEvents = orderAggregate.computeNewEvents(orderHistory, confirmCommand);
 * // Result: [{ type: 'OrderConfirmed', orderId: 'order-123', timestamp: '2024-01-15T10:00:00Z' }]
 *
 * // Current state derived from events: { orderId: 'order-123', status: 'draft', items: [...], total: 30 }
 * ```
 *
 * @example
 * State-stored usage - working with current state directly:
 * ```ts
 * const currentOrderState: OrderState = {
 *   orderId: 'order-456',
 *   customerId: 'cust-789',
 *   status: 'confirmed',
 *   items: [{ itemId: 'item-111', quantity: 3 }],
 *   total: 30
 * };
 *
 * // Command to ship the order
 * const shipCommand: OrderCommand = { type: 'ship', orderId: 'order-456' };
 *
 * // State-stored computation: apply command to current state
 * const newOrderState = orderAggregate.computeNewState(currentOrderState, shipCommand);
 * // Result: { orderId: 'order-456', status: 'shipped', items: [...], total: 30 }
 *
 * // Events produced during computation: [{ type: 'OrderShipped', orderId: 'order-456', timestamp: '...' }]
 * ```
 *
 * @typeParam C - Command type representing the intent or instruction to be processed by the aggregate
 * @typeParam S - State type (both input and output), representing the aggregate's consistent internal state
 * @typeParam E - Event type (both input and output), representing state changes and domain events within the aggregate boundary
 */
export interface IAggregateDecider<C, S, E> extends IDcbDecider<C, S, E, E> {
  /**
   * Computes the next state directly from a command and current state using the state-stored computation pattern.
   *
   * @param state - The current state of the aggregate, typically loaded from persistent storage or maintained in memory.
   *                This represents the aggregate's current knowledge and data at the time the command is processed.
   * @param command - The command to evaluate against the current state, representing an intent or instruction
   *                  that may cause the aggregate to change state and produce events.
   * @returns The new state after applying all events produced by the command. This represents the aggregate's
   *          updated state after processing the command and can be directly persisted or used for further operations.
   *
   * @remarks
   * This method implements the **state-stored decision loop**, optimized for scenarios where maintaining current state
   * directly is more efficient than replaying event history:
   * ```
   * Current State → Command → Events → Updated State
   * ```
   *
   * **State-Stored Computation Benefits:**
   * - **Performance**: No need to replay event history for each command
   * - **Simplicity**: Direct state mutations through event application
   * - **Memory efficiency**: Only current state needs to be maintained
   * - **Query optimization**: Current state readily available for read operations
   *
   * **Implementation Pattern:**
   * 1. Use `decide` to evaluate the command against current state and produce events
   * 2. Apply each produced event to the current state using `evolve`
   * 3. Return the final state after all events have been applied
   * 4. Events can be persisted separately for audit trail or integration purposes
   *
   * **Comparison with Event-Sourced Computation:**
   * - **State-stored**: `computeNewState(currentState, command)` - Direct state updates
   * - **Event-sourced**: `computeNewEvents(eventHistory, command)` - State derived from events
   * - Both patterns can coexist in the same aggregate for different use cases
   */
  computeNewState(state: S, command: C): S;
}

/**
 * The `AggregateDecider` class represents the most refined and feature-complete form in the progressive refinement model, constraining both state and event types to be identical while providing dual computation capabilities.
 *
 * @remarks
 * `AggregateDecider` implements the `IAggregateDecider` interface and serves as the **domain aggregate specialist** in the progressive refinement hierarchy:
 * - `Decider<C, Si, So, Ei, Eo>` → Most generic, all types independent
 * - `DcbDecider<C, S, Ei, Eo>` → Constrains `Si = So = S` for event-sourced scenarios
 * - **`AggregateDecider<C, S, E>`** → Constrains `Si = So = S` and `Ei = Eo = E` for domain aggregates ← *You are here*
 *
 * **Dual Constraints: Si = So = S and Ei = Eo = E**
 * The fundamental constraints ensure complete type consistency:
 * - **State Constraint**: Input and output state types are identical (`Si = So = S`)
 * - **Event Constraint**: Input and output event types are identical (`Ei = Eo = E`)
 * - This makes `AggregateDecider` perfect for **domain aggregates** where events directly represent state changes
 *
 * **Dual Computation Capabilities:**
 *
 * **1. Event-Sourced Computation** (inherited from `DcbDecider`):
 * ```
 * Historical Events → Derive Current State → Apply Command → Produce New Events
 * [Event1, Event2, ...] → State → Command → [NewEvent1, NewEvent2, ...]
 * ```
 * - Use `computeNewEvents(events, command)` for event sourcing scenarios
 * - State is derived from complete event history
 * - Provides full audit trail and time-travel capabilities
 * - Ideal for systems requiring complete event history
 *
 * **2. State-Stored Computation** (unique to `AggregateDecider`):
 * ```
 * Current State → Apply Command → Produce Events → Apply Events → Updated State
 * State → Command → [Event1, Event2, ...] → Updated State
 * ```
 * - Use `computeNewState(state, command)` for state storage scenarios
 * - State is maintained directly, events represent changes
 * - Optimized for performance when full event history isn't needed
 * - Ideal for traditional CRUD-like operations with event notifications
 *
 * **When to Use AggregateDecider vs Other Types:**
 * - **Use AggregateDecider** for traditional domain aggregates (Order, Customer, Product, etc.)
 * - **Use AggregateDecider** when you need both event-sourced and state-stored computation flexibility
 * - **Use AggregateDecider** when event and state types should be consistent throughout the system
 * - **Use DcbDecider** when you only need event-sourced computation or different event types
 * - **Use Decider** when you need maximum type flexibility for cross-boundary scenarios
 *
 * **Domain Aggregate Pattern:**
 * `AggregateDecider` is specifically designed for **Domain-Driven Design aggregates** where:
 * - Events represent domain facts that directly correspond to state changes
 * - State consistency is maintained through event application
 * - Business rules are enforced through decision logic
 * - Both event sourcing and state storage patterns are supported
 *
 * @example
 * Complete order aggregate with both computation modes:
 * ```ts
 * type OrderCommand = {
 *   type: 'create' | 'addItem' | 'removeItem' | 'confirm' | 'ship' | 'cancel';
 *   orderId: string;
 *   customerId?: string;
 *   itemId?: string;
 *   quantity?: number;
 * };
 *
 * type OrderState = {
 *   orderId: string;
 *   customerId: string;
 *   status: 'draft' | 'confirmed' | 'shipped' | 'cancelled';
 *   items: Array<{ itemId: string; quantity: number; price: number; }>;
 *   totalAmount: number;
 *   createdAt: Date;
 * };
 *
 * type OrderEvent = {
 *   type: 'OrderCreated' | 'ItemAdded' | 'ItemRemoved' | 'OrderConfirmed' | 'OrderShipped' | 'OrderCancelled';
 *   orderId: string;
 *   timestamp: Date;
 *   customerId?: string;
 *   itemId?: string;
 *   quantity?: number;
 *   price?: number;
 * };
 *
 * const orderAggregate = new AggregateDecider<OrderCommand, OrderState, OrderEvent>(
 *   // Decision logic: commands + state → events
 *   (command, state) => {
 *     const timestamp = new Date();
 *     switch (command.type) {
 *       case 'create':
 *         return state.orderId ? [] : [{
 *           type: 'OrderCreated',
 *           orderId: command.orderId,
 *           customerId: command.customerId!,
 *           timestamp
 *         }];
 *       case 'addItem':
 *         return state.status === 'draft' ? [{
 *           type: 'ItemAdded',
 *           orderId: command.orderId,
 *           itemId: command.itemId!,
 *           quantity: command.quantity!,
 *           price: 29.99, // Business logic for pricing
 *           timestamp
 *         }] : [];
 *       case 'confirm':
 *         return state.status === 'draft' && state.items.length > 0 ? [{
 *           type: 'OrderConfirmed',
 *           orderId: command.orderId,
 *           timestamp
 *         }] : [];
 *       case 'ship':
 *         return state.status === 'confirmed' ? [{
 *           type: 'OrderShipped',
 *           orderId: command.orderId,
 *           timestamp
 *         }] : [];
 *       case 'cancel':
 *         return ['draft', 'confirmed'].includes(state.status) ? [{
 *           type: 'OrderCancelled',
 *           orderId: command.orderId,
 *           timestamp
 *         }] : [];
 *       default:
 *         return [];
 *     }
 *   },
 *   // Evolution logic: state + events → updated state
 *   (state, event) => {
 *     switch (event.type) {
 *       case 'OrderCreated':
 *         return {
 *           ...state,
 *           orderId: event.orderId,
 *           customerId: event.customerId!,
 *           status: 'draft',
 *           createdAt: event.timestamp
 *         };
 *       case 'ItemAdded':
 *         return {
 *           ...state,
 *           items: [...state.items, { itemId: event.itemId!, quantity: event.quantity!, price: event.price! }],
 *           totalAmount: state.totalAmount + (event.quantity! * event.price!)
 *         };
 *       case 'ItemRemoved':
 *         const filteredItems = state.items.filter(item => item.itemId !== event.itemId);
 *         const removedItem = state.items.find(item => item.itemId === event.itemId);
 *         return {
 *           ...state,
 *           items: filteredItems,
 *           totalAmount: state.totalAmount - (removedItem ? removedItem.quantity * removedItem.price : 0)
 *         };
 *       case 'OrderConfirmed':
 *         return { ...state, status: 'confirmed' };
 *       case 'OrderShipped':
 *         return { ...state, status: 'shipped' };
 *       case 'OrderCancelled':
 *         return { ...state, status: 'cancelled' };
 *       default:
 *         return state;
 *     }
 *   },
 *   // Initial state
 *   {
 *     orderId: '',
 *     customerId: '',
 *     status: 'draft',
 *     items: [],
 *     totalAmount: 0,
 *     createdAt: new Date()
 *   }
 * );
 *
 * // Event-sourced computation: derive state from complete event history
 * const orderHistory: OrderEvent[] = [
 *   { type: 'OrderCreated', orderId: 'order-123', customerId: 'cust-456', timestamp: new Date('2024-01-01') },
 *   { type: 'ItemAdded', orderId: 'order-123', itemId: 'item-789', quantity: 2, price: 29.99, timestamp: new Date('2024-01-02') },
 *   { type: 'OrderConfirmed', orderId: 'order-123', timestamp: new Date('2024-01-03') }
 * ];
 *
 * const shipCommand: OrderCommand = { type: 'ship', orderId: 'order-123' };
 * const shippingEvents = orderAggregate.computeNewEvents(orderHistory, shipCommand);
 * // Result: [{ type: 'OrderShipped', orderId: 'order-123', timestamp: Date }]
 *
 * // State-stored computation: work with current state directly
 * const currentOrderState: OrderState = {
 *   orderId: 'order-456',
 *   customerId: 'cust-789',
 *   status: 'draft',
 *   items: [{ itemId: 'item-123', quantity: 1, price: 49.99 }],
 *   totalAmount: 49.99,
 *   createdAt: new Date('2024-01-10')
 * };
 *
 * const addItemCommand: OrderCommand = { type: 'addItem', orderId: 'order-456', itemId: 'item-456', quantity: 3 };
 * const updatedOrderState = orderAggregate.computeNewState(currentOrderState, addItemCommand);
 * // Result: Updated state with new item added and total recalculated
 * ```
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
   * @remarks
   * This method implements the **state-stored computation pattern** that is unique to `AggregateDecider`:
   * ```
   * Current State → Apply Command → Produce Events → Apply Events → Updated State
   * State → Command → [Event1, Event2, ...] → Updated State
   * ```
   *
   * **State-Stored Process:**
   * 1. **Decision Making**: Apply command to current state using `decide` function to produce events
   * 2. **Event Application**: Apply all produced events to the current state using `evolve` function
   * 3. **State Return**: Return the final updated state after all events have been applied
   *
   * **Key Benefits:**
   * - **Performance**: No need to replay entire event history, works with current state directly
   * - **Simplicity**: Single method call produces final state without external event storage
   * - **Immediate Consistency**: State is immediately updated and available for subsequent operations
   * - **Event Notification**: Events are still produced and can be used for notifications, projections, etc.
   *
   * **State-Stored vs Event-Sourced:**
   * - **State-Stored** (`computeNewState`): Maintains state directly, events represent changes
   * - **Event-Sourced** (`computeNewEvents`): Derives state from events, events are the source of truth
   * - Choose based on your persistence strategy and performance requirements
   *
   * **When to Use State-Stored Computation:**
   * - Traditional CRUD applications with event notifications
   * - Systems where current state is more important than complete history
   * - Applications requiring immediate state consistency without event store dependencies
   *
   * @param state - The current state of the aggregate before applying the command.
   *                This represents the current knowledge or data that will be used for
   *                decision making and will be updated based on the produced events.
   * @param command - The command to be processed against the current state.
   *                  Commands represent intent or instructions that may produce events
   *                  and result in state changes.
   * @returns The new state after applying the command and all resulting events.
   *          If the command produces no events (business rules prevent the operation),
   *          the original state is returned unchanged.
   */
  computeNewState(state: S, command: C): S {
    const events = this.decide(command, state);
    return events.reduce(this.evolve, state);
  }

  /**
   * Computes new events from a command by first replaying all past events to derive the current state, then applying decision logic.
   * This method is inherited from the DcbDecider interface.
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
   * Since AggregateDecider has Ei = Eo = E, both input and output events are transformed to the same type.
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
   * Since AggregateDecider has Si = So = S, both input and output states are transformed to the same type.
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
   * This method now returns an AggregateDecider directly, eliminating the need for manual conversion.
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
