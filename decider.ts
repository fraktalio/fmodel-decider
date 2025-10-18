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
 * The `IDecider` interface defines the foundational contract for decision-making algorithms in functional domain-driven design.
 *
 * @remarks
 * `IDecider` represents the most generic form in the progressive refinement model, where all type parameters are independent.
 * This flexibility allows modeling complex cross-boundary scenarios like policies, sagas, and projections where input and output
 * types may differ significantly.
 *
 * The interface models the core decision-making pattern:
 * - **decide**: Given a command and current state, produce events representing what should happen
 * - **evolve**: Given a state and an event, compute the next state
 * - **initialState**: The starting point for state evolution
 *
 * **Progressive Refinement Path:**
 * - `IDecider<C, Si, So, Ei, Eo>` → Most generic, all types independent
 * - `IDcbDecider<C, S, Ei, Eo>` → Constrains `Si = So = S` for event-sourced scenarios
 * - `IAggregateDecider<C, S, E>` → Further constrains `Ei = Eo = E` for domain aggregates
 *
 * @example
 * Basic order processing decider with different input/output types:
 * ```ts
 * type OrderCommand = { type: 'create' | 'cancel'; orderId: string; };
 * type OrderState = { id: string; status: 'pending' | 'confirmed' | 'cancelled'; };
 * type OrderEvent = { type: 'created' | 'cancelled'; orderId: string; timestamp: Date; };
 * type NotificationEvent = { type: 'email' | 'sms'; recipient: string; message: string; };
 *
 * const orderDecider: IDecider<OrderCommand, OrderState, OrderState, OrderEvent, NotificationEvent> = {
 *   decide: (cmd, state) => {
 *     if (cmd.type === 'create' && state.status === 'pending') {
 *       return [{ type: 'email', recipient: 'customer@example.com', message: 'Order created' }];
 *     }
 *     return [];
 *   },
 *   evolve: (state, event) => {
 *     if (event.type === 'created') {
 *       return { ...state, status: 'confirmed' };
 *     }
 *     return state;
 *   },
 *   initialState: { id: '', status: 'pending' }
 * };
 * ```
 *
 * @example
 * Cross-boundary policy decider transforming domain events to integration events:
 * ```ts
 * type DomainEvent = { aggregateId: string; version: number; data: unknown; };
 * type IntegrationEvent = { eventType: string; payload: string; correlationId: string; };
 * type PolicyState = { lastProcessedVersion: number; };
 * type PolicyCommand = { type: 'process'; events: DomainEvent[]; };
 *
 * const integrationPolicy: IDecider<PolicyCommand, PolicyState, PolicyState, DomainEvent, IntegrationEvent> = {
 *   decide: (cmd, state) => {
 *     return cmd.events
 *       .filter(e => e.version > state.lastProcessedVersion)
 *       .map(e => ({
 *         eventType: `integration.${e.aggregateId}`,
 *         payload: JSON.stringify(e.data),
 *         correlationId: `${e.aggregateId}-${e.version}`
 *       }));
 *   },
 *   evolve: (state, event) => ({
 *     lastProcessedVersion: Math.max(state.lastProcessedVersion, parseInt(event.correlationId.split('-')[1]))
 *   }),
 *   initialState: { lastProcessedVersion: 0 }
 * };
 * ```
 *
 * @typeParam C - Command type representing the intent or instruction to be processed
 * @typeParam Si - Input state type used by the decide function to make decisions
 * @typeParam So - Output state type produced by the evolve function, may differ from Si for transformations
 * @typeParam Ei - Input event type consumed by the evolve function to update state
 * @typeParam Eo - Output event type produced by the decide function, may differ from Ei for cross-boundary scenarios
 */
export interface IDecider<C, Si, So, Ei, Eo> {
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
   * - **Pure**: Same inputs always produce the same outputs
   * - **Side-effect free**: No mutations, I/O, or external dependencies
   * - **Deterministic**: Behavior should be predictable and testable
   *
   * The function models the pattern: `(Command, State) → Events`
   *
   * @example
   * Order processing example:
   * ```ts
   * const decide = (cmd: OrderCommand, state: OrderState): OrderEvent[] => {
   *   switch (cmd.type) {
   *     case 'create':
   *       return state.status === 'none' ? [{ type: 'created', orderId: cmd.orderId }] : [];
   *     case 'ship':
   *       return state.status === 'confirmed' ? [{ type: 'shipped', orderId: cmd.orderId }] : [];
   *     default:
   *       return [];
   *   }
   * };
   * ```
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
   * - **Pure**: No side effects or external dependencies
   * - **Deterministic**: Same state and event always produce the same result
   * - **Idempotent**: Applying the same event multiple times should be safe
   *
   * The function models the pattern: `(State, Event) → State`
   *
   * @example
   * Order state evolution example:
   * ```ts
   * const evolve = (state: OrderState, event: OrderEvent): OrderState => {
   *   switch (event.type) {
   *     case 'created':
   *       return { ...state, status: 'pending', orderId: event.orderId };
   *     case 'confirmed':
   *       return { ...state, status: 'confirmed' };
   *     case 'shipped':
   *       return { ...state, status: 'shipped', shippedAt: event.timestamp };
   *     default:
   *       return state;
   *   }
   * };
   * ```
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
   *
   * @example
   * Order initial state example:
   * ```ts
   * const initialState: OrderState = {
   *   orderId: '',
   *   status: 'none',
   *   items: [],
   *   total: 0,
   *   createdAt: null,
   *   shippedAt: null
   * };
   * ```
   */
  readonly initialState: So;
}

/**
 * The `Decider` class is the foundational implementation of decision-making algorithms in functional domain-driven design, representing the most generic form in the progressive refinement model.
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
 * @example
 * Basic counter decider with simple types:
 * ```ts
 * type CounterCommand = 'increment' | 'decrement' | 'reset';
 * type CounterState = { value: number; lastUpdated: Date; };
 * type CounterEvent = { type: 'incremented' | 'decremented' | 'reset'; delta?: number; timestamp: Date; };
 *
 * const counterDecider = new Decider<CounterCommand, CounterState, CounterState, CounterEvent, CounterEvent>(
 *   (cmd, state) => {
 *     const timestamp = new Date();
 *     switch (cmd) {
 *       case 'increment':
 *         return [{ type: 'incremented', delta: 1, timestamp }];
 *       case 'decrement':
 *         return [{ type: 'decremented', delta: -1, timestamp }];
 *       case 'reset':
 *         return [{ type: 'reset', timestamp }];
 *       default:
 *         return [];
 *     }
 *   },
 *   (state, event) => {
 *     switch (event.type) {
 *       case 'incremented':
 *       case 'decremented':
 *         return { value: state.value + (event.delta || 0), lastUpdated: event.timestamp };
 *       case 'reset':
 *         return { value: 0, lastUpdated: event.timestamp };
 *       default:
 *         return state;
 *     }
 *   },
 *   { value: 0, lastUpdated: new Date() }
 * );
 *
 * // Usage
 * const events = counterDecider.decide('increment', { value: 5, lastUpdated: new Date() });
 * // Result: [{ type: 'incremented', delta: 1, timestamp: Date }]
 *
 * const newState = counterDecider.evolve({ value: 5, lastUpdated: new Date() }, events[0]);
 * // Result: { value: 6, lastUpdated: Date }
 * ```
 *
 * @example
 * Cross-boundary policy decider with different input/output types:
 * ```ts
 * type PolicyCommand = { type: 'process'; domainEvents: DomainEvent[]; };
 * type PolicyState = { processedEventIds: Set<string>; lastProcessedAt: Date; };
 * type DomainEvent = { id: string; aggregateId: string; type: string; data: unknown; };
 * type IntegrationEvent = { eventType: string; payload: string; correlationId: string; };
 *
 * const integrationPolicy = new Decider<
 *   PolicyCommand,
 *   PolicyState,
 *   PolicyState,
 *   DomainEvent,
 *   IntegrationEvent
 * >(
 *   // Transform domain events to integration events
 *   (cmd, state) => {
 *     return cmd.domainEvents
 *       .filter(e => !state.processedEventIds.has(e.id))
 *       .map(e => ({
 *         eventType: `integration.${e.type}`,
 *         payload: JSON.stringify(e.data),
 *         correlationId: `${e.aggregateId}-${e.id}`
 *       }));
 *   },
 *   // Track processed events in state
 *   (state, event) => ({
 *     processedEventIds: new Set([...state.processedEventIds, event.correlationId.split('-')[1]]),
 *     lastProcessedAt: new Date()
 *   }),
 *   { processedEventIds: new Set(), lastProcessedAt: new Date() }
 * );
 * ```
 *
 * @example
 * Order projection decider transforming events to read model:
 * ```ts
 * type ProjectionCommand = { type: 'project'; events: OrderEvent[]; };
 * type OrderEvent = { type: 'OrderCreated' | 'ItemAdded'; orderId: string; data: unknown; };
 * type ProjectionState = { lastEventId: string; };
 * type OrderSummary = { orderId: string; itemCount: number; status: string; };
 *
 * const orderProjection = new Decider<
 *   ProjectionCommand,
 *   ProjectionState,
 *   ProjectionState,
 *   OrderEvent,
 *   OrderSummary
 * >(
 *   (cmd, state) => {
 *     // Transform order events into read model summaries
 *     return cmd.events.map(event => ({
 *       orderId: event.orderId,
 *       itemCount: event.type === 'ItemAdded' ? 1 : 0,
 *       status: event.type === 'OrderCreated' ? 'created' : 'updated'
 *     }));
 *   },
 *   (state, event) => ({
 *     lastEventId: event.orderId
 *   }),
 *   { lastEventId: '' }
 * );
 * ```
 *
 * @typeParam C - Command type representing the intent or instruction to be processed. Can be union types, objects, or primitives.
 * @typeParam Si - Input state type used by the decide function. Represents the current system knowledge needed for decision making.
 * @typeParam So - Output state type produced by the evolve function. May differ from Si for transformations and projections.
 * @typeParam Ei - Input event type consumed by the evolve function. Represents facts about what happened in the system.
 * @typeParam Eo - Output event type produced by the decide function. May differ from Ei for cross-boundary event translation.
 *
 * @author Иван Дугалић / Ivan Dugalic / @idugalic
 */
export class Decider<C, Si, So, Ei, Eo> implements IDecider<C, Si, So, Ei, Eo> {
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
   *
   * @example
   * Creating a simple order decider:
   * ```ts
   * const orderDecider = new Decider(
   *   // Decision logic: determine what events should happen
   *   (command: OrderCommand, state: OrderState) => {
   *     if (command.type === 'create' && !state.orderId) {
   *       return [{ type: 'OrderCreated', orderId: command.orderId, customerId: command.customerId }];
   *     }
   *     return [];
   *   },
   *   // Evolution logic: apply events to update state
   *   (state: OrderState, event: OrderEvent) => {
   *     if (event.type === 'OrderCreated') {
   *       return { ...state, orderId: event.orderId, status: 'created' };
   *     }
   *     return state;
   *   },
   *   // Initial state: starting point for all operations
   *   { orderId: '', status: 'none', customerId: '' }
   * );
   * ```
   */
  constructor(
    readonly decide: (c: C, s: Si) => readonly Eo[],
    readonly evolve: (s: Si, e: Ei) => So,
    readonly initialState: So,
  ) { }

  /**
   * Transforms the command type of this decider by applying a contravariant mapping function.
   *
   * @remarks
   * This method enables **command adaptation** by transforming a new command type into the existing command type
   * that this decider understands. This is particularly useful for:
   * - **API versioning**: Adapting new command formats to legacy decider logic
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
   * Adapting a REST API command to a domain command:
   * ```ts
   * type DomainCommand = { action: 'create' | 'update'; entityId: string; data: unknown; };
   * type RestCommand = { method: 'POST' | 'PUT'; path: string; body: unknown; };
   *
   * const domainDecider = new Decider<DomainCommand, State, State, Event, Event>(
   *   (cmd, state) => {
   *     if (cmd.action === 'create') {
   *       return [{ type: 'EntityCreated', id: cmd.entityId, data: cmd.data }];
   *     }
   *     return [];
   *   },
   *   (state, event) => ({ ...state, lastAction: event.type }),
   *   { lastAction: 'none' }
   * );
   *
   * // Adapt REST commands to domain commands
   * const restDecider = domainDecider.mapContraOnCommand<RestCommand>(restCmd => ({
   *   action: restCmd.method === 'POST' ? 'create' : 'update',
   *   entityId: restCmd.path.split('/').pop() || '',
   *   data: restCmd.body
   * }));
   *
   * // Now can process REST commands
   * const events = restDecider.decide(
   *   { method: 'POST', path: '/orders/123', body: { customerId: 'cust-456' } },
   *   { lastAction: 'none' }
   * );
   * // Result: [{ type: 'EntityCreated', id: '123', data: { customerId: 'cust-456' } }]
   * ```
   *
   * @example
   * Command versioning for backward compatibility:
   * ```ts
   * type OrderCommandV1 = { type: 'create'; orderId: string; };
   * type OrderCommandV2 = { type: 'create'; orderId: string; customerId: string; priority: 'high' | 'normal'; };
   *
   * const v1Decider = new Decider<OrderCommandV1, OrderState, OrderState, OrderEvent, OrderEvent>(
   *   (cmd, state) => [{ type: 'OrderCreated', orderId: cmd.orderId }],
   *   (state, event) => ({ ...state, orderId: event.orderId }),
   *   { orderId: '', status: 'none' }
   * );
   *
   * // Adapt V2 commands to work with V1 decider logic
   * const v2Decider = v1Decider.mapContraOnCommand<OrderCommandV2>(v2Cmd => ({
   *   type: v2Cmd.type,
   *   orderId: v2Cmd.orderId
   *   // V2 fields (customerId, priority) are ignored by V1 logic
   * }));
   *
   * // V2 commands now work with V1 decision logic
   * const events = v2Decider.decide(
   *   { type: 'create', orderId: 'order-123', customerId: 'cust-456', priority: 'high' },
   *   { orderId: '', status: 'none' }
   * );
   * ```
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
   * - **Cross-boundary event translation**: Converting between domain and integration events
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
   *
   * @example
   * Cross-boundary event translation between domain and integration events:
   * ```ts
   * type DomainEvent = { type: 'OrderCreated' | 'OrderShipped'; orderId: string; details: OrderDetails; };
   * type IntegrationEvent = { eventName: string; entityId: string; metadata: Record<string, unknown>; };
   *
   * const domainDecider = new Decider<Command, State, State, DomainEvent, DomainEvent>(
   *   (cmd, state) => [{ type: 'OrderCreated', orderId: cmd.orderId, details: cmd.details }],
   *   (state, event) => ({ ...state, orderId: event.orderId }),
   *   { orderId: '' }
   * );
   *
   * // Transform to work with integration events
   * const integrationDecider = domainDecider.dimapOnEvent<IntegrationEvent, IntegrationEvent>(
   *   // Convert integration events to domain events (contravariant)
   *   (intEvent) => ({
   *     type: intEvent.eventName.includes('Created') ? 'OrderCreated' : 'OrderShipped',
   *     orderId: intEvent.entityId,
   *     details: intEvent.metadata as OrderDetails
   *   }),
   *   // Convert domain events to integration events (covariant)
   *   (domainEvent) => ({
   *     eventName: `order.${domainEvent.type.toLowerCase()}`,
   *     entityId: domainEvent.orderId,
   *     metadata: { details: domainEvent.details, timestamp: new Date() }
   *   })
   * );
   * ```
   *
   * @example
   * Event enrichment with metadata and filtering:
   * ```ts
   * type SimpleEvent = { action: string; target: string; };
   * type EnrichedEvent = { action: string; target: string; userId: string; timestamp: Date; correlationId: string; };
   *
   * const simpleDecider = new Decider<Command, State, State, SimpleEvent, SimpleEvent>(
   *   (cmd, state) => [{ action: 'created', target: cmd.entityId }],
   *   (state, event) => ({ ...state, lastAction: event.action }),
   *   { lastAction: '' }
   * );
   *
   * // Add enrichment and filtering
   * const enrichedDecider = simpleDecider.dimapOnEvent<EnrichedEvent, EnrichedEvent>(
   *   // Strip enrichment from input events (contravariant)
   *   (enriched) => ({
   *     action: enriched.action,
   *     target: enriched.target
   *   }),
   *   // Add enrichment to output events (covariant)
   *   (simple) => ({
   *     action: simple.action,
   *     target: simple.target,
   *     userId: 'current-user-id',
   *     timestamp: new Date(),
   *     correlationId: `${simple.target}-${Date.now()}`
   *   })
   * );
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
   * - **View projections**: Creating specialized read models from domain state
   * - **State normalization/denormalization**: Converting between different state representations
   * - **Legacy system integration**: Bridging different state formats across system boundaries
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
   *
   * @example
   * Creating a read model projection from domain state:
   * ```ts
   * type DomainState = {
   *   aggregateId: string;
   *   version: number;
   *   data: {
   *     customerInfo: CustomerInfo;
   *     orderDetails: OrderDetails;
   *     paymentInfo: PaymentInfo;
   *   };
   *   metadata: { createdBy: string; lastModified: Date; };
   * };
   *
   * type ReadModelState = {
   *   orderId: string;
   *   customerName: string;
   *   orderTotal: number;
   *   paymentStatus: string;
   *   lastUpdated: string;
   * };
   *
   * const domainDecider = new Decider<Command, DomainState, DomainState, Event, Event>(
   *   // Domain decision logic
   *   (cmd, state) => [{ type: 'OrderUpdated', aggregateId: state.aggregateId }],
   *   (state, event) => ({ ...state, version: state.version + 1 }),
   *   { aggregateId: '', version: 0, data: defaultData, metadata: defaultMetadata }
   * );
   *
   * // Create read model projection
   * const readModelDecider = domainDecider.dimapOnState<ReadModelState, ReadModelState>(
   *   // Convert read model back to domain state (contravariant)
   *   (readModel) => ({
   *     aggregateId: readModel.orderId,
   *     version: 1,
   *     data: reconstructDomainData(readModel), // Complex reconstruction logic
   *     metadata: { createdBy: 'system', lastModified: new Date(readModel.lastUpdated) }
   *   }),
   *   // Convert domain state to read model (covariant)
   *   (domain) => ({
   *     orderId: domain.aggregateId,
   *     customerName: domain.data.customerInfo.name,
   *     orderTotal: domain.data.orderDetails.total,
   *     paymentStatus: domain.data.paymentInfo.status,
   *     lastUpdated: domain.metadata.lastModified.toISOString()
   *   })
   * );
   * ```
   *
   * @example
   * State normalization for different storage formats:
   * ```ts
   * type NormalizedState = { entities: Record<string, Entity>; ids: string[]; };
   * type DenormalizedState = { items: Entity[]; };
   *
   * const normalizedDecider = new Decider<Command, NormalizedState, NormalizedState, Event, Event>(
   *   (cmd, state) => [{ type: 'EntityAdded', entity: cmd.entity }],
   *   (state, event) => ({
   *     entities: { ...state.entities, [event.entity.id]: event.entity },
   *     ids: [...state.ids, event.entity.id]
   *   }),
   *   { entities: {}, ids: [] }
   * );
   *
   * // Transform to work with denormalized state
   * const denormalizedDecider = normalizedDecider.dimapOnState<DenormalizedState, DenormalizedState>(
   *   // Normalize denormalized state (contravariant)
   *   (denorm) => ({
   *     entities: denorm.items.reduce((acc, item) => ({ ...acc, [item.id]: item }), {}),
   *     ids: denorm.items.map(item => item.id)
   *   }),
   *   // Denormalize normalized state (covariant)
   *   (norm) => ({
   *     items: norm.ids.map(id => norm.entities[id]).filter(Boolean)
   *   })
   * );
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
   * Combines this decider with another decider, merging their behavior using **intersection-based state merging**.
   *
   * @remarks
   * This method creates a new decider that handles commands and events from both deciders while merging
   * their states using **TypeScript intersection types** (`So & So2`). The resulting state contains all
   * properties from both deciders' states, making it ideal for scenarios where you need to compose
   * multiple domain concerns into a single aggregate or entity.
   *
   * **State Merging Strategy: Intersection (`So & So2`)**
   * - Properties from both states are merged into a single object
   * - Overlapping property names must have compatible types
   * - Results in a "flat" state structure with all properties accessible at the top level
   * - Best for combining related domain concepts that share common properties
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
   * - Combining related domain concepts (e.g., Order + Inventory)
   * - Merging cross-cutting concerns (e.g., Auditing + Business Logic)
   * - Creating composite aggregates from smaller components
   * - When state properties are complementary and don't conflict
   *
   * **Comparison with Tuple Combination:**
   * - **Intersection**: `{ orderId: string, customerId: string } & { items: Item[] }` → `{ orderId: string, customerId: string, items: Item[] }`
   * - **Tuple**: `[{ orderId: string, customerId: string }, { items: Item[] }]` → Nested structure
   *
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
   *
   * @example
   * Combining business logic with auditing cross-cutting concern:
   * ```ts
   * type BusinessCommand = { type: 'processPayment'; amount: number; accountId: string; };
   * type BusinessState = { balance: number; accountId: string; };
   * type BusinessEvent = { type: 'PaymentProcessed'; amount: number; };
   *
   * type AuditCommand = { type: 'logAction'; action: string; userId: string; };
   * type AuditState = { auditLog: Array<{ action: string; timestamp: Date; userId: string; }>; };
   * type AuditEvent = { type: 'ActionLogged'; action: string; userId: string; };
   *
   * const businessDecider = new Decider<BusinessCommand, BusinessState, BusinessState, BusinessEvent, BusinessEvent>(
   *   (cmd, state) => {
   *     if (cmd.type === 'processPayment' && state.balance >= cmd.amount) {
   *       return [{ type: 'PaymentProcessed', amount: cmd.amount }];
   *     }
   *     return [];
   *   },
   *   (state, event) => {
   *     if (event.type === 'PaymentProcessed') {
   *       return { ...state, balance: state.balance - event.amount };
   *     }
   *     return state;
   *   },
   *   { balance: 1000, accountId: '' }
   * );
   *
   * const auditDecider = new Decider<AuditCommand, AuditState, AuditState, AuditEvent, AuditEvent>(
   *   (cmd, state) => [{ type: 'ActionLogged', action: cmd.action, userId: cmd.userId }],
   *   (state, event) => ({
   *     ...state,
   *     auditLog: [...state.auditLog, { action: event.action, timestamp: new Date(), userId: event.userId }]
   *   }),
   *   { auditLog: [] }
   * );
   *
   * // Combine business logic with auditing
   * const auditedBusinessDecider = businessDecider.combine(auditDecider);
   *
   * // Combined state: { balance: number; accountId: string; auditLog: AuditEntry[]; }
   * // All properties are accessible at the top level
   * ```
   *
   * @example
   * Combining user profile with preferences management:
   * ```ts
   * type ProfileCommand = { type: 'updateProfile'; name: string; email: string; };
   * type ProfileState = { userId: string; name: string; email: string; };
   * type ProfileEvent = { type: 'ProfileUpdated'; name: string; email: string; };
   *
   * type PreferencesCommand = { type: 'setPreference'; key: string; value: unknown; };
   * type PreferencesState = { preferences: Record<string, unknown>; };
   * type PreferencesEvent = { type: 'PreferenceSet'; key: string; value: unknown; };
   *
   * const profileDecider = new Decider<ProfileCommand, ProfileState, ProfileState, ProfileEvent, ProfileEvent>(
   *   (cmd, state) => [{ type: 'ProfileUpdated', name: cmd.name, email: cmd.email }],
   *   (state, event) => ({ ...state, name: event.name, email: event.email }),
   *   { userId: '', name: '', email: '' }
   * );
   *
   * const preferencesDecider = new Decider<PreferencesCommand, PreferencesState, PreferencesState, PreferencesEvent, PreferencesEvent>(
   *   (cmd, state) => [{ type: 'PreferenceSet', key: cmd.key, value: cmd.value }],
   *   (state, event) => ({
   *     ...state,
   *     preferences: { ...state.preferences, [event.key]: event.value }
   *   }),
   *   { preferences: {} }
   * );
   *
   * // Combine into unified user management
   * const userDecider = profileDecider.combine(preferencesDecider);
   *
   * // Combined state: {
   * //   userId: string;
   * //   name: string;
   * //   email: string;
   * //   preferences: Record<string, unknown>;
   * // }
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
   * **State Merging Strategy: Tuples (`[So, So2]`)**
   * - States remain separate and nested within a tuple structure
   * - No property name conflicts possible - each decider's state is isolated
   * - Results in a structured, hierarchical state organization
   * - Best for combining independent domain concepts or bounded contexts
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
   *
   * @example
   * Combining user authentication with content management (avoiding property conflicts):
   * ```ts
   * type AuthCommand = { type: 'login' | 'logout'; userId: string; };
   * type AuthState = { userId: string; isAuthenticated: boolean; sessionId: string; };
   * type AuthEvent = { type: 'UserLoggedIn' | 'UserLoggedOut'; userId: string; };
   *
   * type ContentCommand = { type: 'createPost' | 'deletePost'; postId: string; };
   * type ContentState = { postId: string; title: string; content: string; }; // Note: could have conflicting 'userId' property
   * type ContentEvent = { type: 'PostCreated' | 'PostDeleted'; postId: string; };
   *
   * const authDecider = new Decider<AuthCommand, AuthState, AuthState, AuthEvent, AuthEvent>(
   *   (cmd, state) => {
   *     if (cmd.type === 'login') {
   *       return [{ type: 'UserLoggedIn', userId: cmd.userId }];
   *     }
   *     return [];
   *   },
   *   (state, event) => {
   *     if (event.type === 'UserLoggedIn') {
   *       return { ...state, userId: event.userId, isAuthenticated: true };
   *     }
   *     return state;
   *   },
   *   { userId: '', isAuthenticated: false, sessionId: '' }
   * );
   *
   * const contentDecider = new Decider<ContentCommand, ContentState, ContentState, ContentEvent, ContentEvent>(
   *   (cmd, state) => {
   *     if (cmd.type === 'createPost') {
   *       return [{ type: 'PostCreated', postId: cmd.postId }];
   *     }
   *     return [];
   *   },
   *   (state, event) => {
   *     if (event.type === 'PostCreated') {
   *       return { ...state, postId: event.postId };
   *     }
   *     return state;
   *   },
   *   { postId: '', title: '', content: '' }
   * );
   *
   * // Combine using tuples - no property conflicts possible
   * const appDecider = authDecider.combineViaTuples(contentDecider);
   *
   * // State type: [AuthState, ContentState] - clearly separated concerns
   * const appState: [AuthState, ContentState] = [
   *   { userId: 'user-123', isAuthenticated: true, sessionId: 'session-456' },
   *   { postId: 'post-789', title: 'My Post', content: 'Post content...' }
   * ];
   *
   * // Each domain operates independently
   * const [authState, contentState] = appState;
   * ```
   *
   * @example
   * Combining financial and inventory bounded contexts:
   * ```ts
   * type FinancialCommand = { type: 'recordTransaction'; amount: number; account: string; };
   * type FinancialState = { balance: number; transactions: Transaction[]; };
   * type FinancialEvent = { type: 'TransactionRecorded'; amount: number; };
   *
   * type InventoryCommand = { type: 'updateStock'; itemId: string; quantity: number; };
   * type InventoryState = { items: Record<string, number>; lastUpdated: Date; };
   * type InventoryEvent = { type: 'StockUpdated'; itemId: string; quantity: number; };
   *
   * const financialDecider = new Decider<FinancialCommand, FinancialState, FinancialState, FinancialEvent, FinancialEvent>(
   *   (cmd, state) => [{ type: 'TransactionRecorded', amount: cmd.amount }],
   *   (state, event) => ({
   *     ...state,
   *     balance: state.balance + event.amount,
   *     transactions: [...state.transactions, { amount: event.amount, timestamp: new Date() }]
   *   }),
   *   { balance: 0, transactions: [] }
   * );
   *
   * const inventoryDecider = new Decider<InventoryCommand, InventoryState, InventoryState, InventoryEvent, InventoryEvent>(
   *   (cmd, state) => [{ type: 'StockUpdated', itemId: cmd.itemId, quantity: cmd.quantity }],
   *   (state, event) => ({
   *     ...state,
   *     items: { ...state.items, [event.itemId]: event.quantity },
   *     lastUpdated: new Date()
   *   }),
   *   { items: {}, lastUpdated: new Date() }
   * );
   *
   * // Combine independent bounded contexts
   * const businessDecider = financialDecider.combineViaTuples(inventoryDecider);
   *
   * // State type: [FinancialState, InventoryState]
   * // Each bounded context maintains its own state structure and concerns
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
 * **Relationship to Base IDecider:**
 * - Inherits all core decision-making capabilities (`decide`, `evolve`, `initialState`)
 * - Adds event-sourced computation via `computeNewEvents`
 * - Constrains state types while keeping event types flexible (`Ei` and `Eo` remain independent)
 * - Serves as foundation for further refinement to `IAggregateDecider`
 *
 * **Progressive Refinement Context:**
 * - `IDecider<C, Si, So, Ei, Eo>` → All types independent
 * - **`IDcbDecider<C, S, Ei, Eo>`** → Constrains `Si = So = S` ← *You are here*
 * - `IAggregateDecider<C, S, E>` → Further constrains `Ei = Eo = E`
 *
 * @example
 * Event-sourced order processing with different input/output event types:
 * ```ts
 * type OrderCommand = { type: 'create' | 'confirm' | 'cancel'; orderId: string; customerId: string; };
 * type OrderState = { orderId: string; status: 'pending' | 'confirmed' | 'cancelled'; customerId: string; };
 * type DomainEvent = { type: 'OrderCreated' | 'OrderConfirmed' | 'OrderCancelled'; orderId: string; timestamp: Date; };
 * type IntegrationEvent = { eventType: string; aggregateId: string; payload: string; };
 *
 * const orderDecider: IDcbDecider<OrderCommand, OrderState, DomainEvent, IntegrationEvent> = {
 *   decide: (cmd, state) => {
 *     switch (cmd.type) {
 *       case 'create':
 *         return state.status === 'pending' ? [] : [{
 *           eventType: 'order.created',
 *           aggregateId: cmd.orderId,
 *           payload: JSON.stringify({ customerId: cmd.customerId })
 *         }];
 *       case 'confirm':
 *         return state.status === 'pending' ? [{
 *           eventType: 'order.confirmed',
 *           aggregateId: cmd.orderId,
 *           payload: JSON.stringify({ confirmedAt: new Date() })
 *         }] : [];
 *       default:
 *         return [];
 *     }
 *   },
 *   evolve: (state, event) => {
 *     switch (event.type) {
 *       case 'OrderCreated':
 *         return { ...state, orderId: event.orderId, status: 'pending' };
 *       case 'OrderConfirmed':
 *         return { ...state, status: 'confirmed' };
 *       case 'OrderCancelled':
 *         return { ...state, status: 'cancelled' };
 *       default:
 *         return state;
 *     }
 *   },
 *   initialState: { orderId: '', status: 'pending', customerId: '' },
 *   
 *   computeNewEvents: (events, command) => {
 *     // Event-sourced computation: replay events to get current state, then decide
 *     const currentState = events.reduce(
 *       (state, event) => orderDecider.evolve(state, event),
 *       orderDecider.initialState
 *     );
 *     return orderDecider.decide(command, currentState);
 *   }
 * };
 * ```
 *
 * @example
 * Using computeNewEvents for event-sourced command processing:
 * ```ts
 * const orderHistory: DomainEvent[] = [
 *   { type: 'OrderCreated', orderId: 'order-123', timestamp: new Date('2024-01-01') },
 * ];
 *
 * // New command to process
 * const confirmCommand: OrderCommand = { type: 'confirm', orderId: 'order-123', customerId: 'cust-456' };
 *
 * // Event-sourced computation: derive current state and produce new events
 * const newEvents = orderDecider.computeNewEvents(orderHistory, confirmCommand);
 * // Result: [{ eventType: 'order.confirmed', aggregateId: 'order-123', payload: '{"confirmedAt":"..."}' }]
 *
 * // The current state was derived from events, not stored directly
 * const currentState = orderHistory.reduce(orderDecider.evolve, orderDecider.initialState);
 * // Result: { orderId: 'order-123', status: 'pending', customerId: '' }
 * ```
 *
 * @example
 * Cross-boundary policy decider transforming domain events to notifications:
 * ```ts
 * type PolicyCommand = { type: 'process'; domainEvents: DomainEvent[]; };
 * type PolicyState = { processedEventIds: Set<string>; };
 * type NotificationEvent = { type: 'email' | 'sms'; recipient: string; message: string; };
 *
 * const notificationPolicy: IDcbDecider<PolicyCommand, PolicyState, DomainEvent, NotificationEvent> = {
 *   decide: (cmd, state) => {
 *     return cmd.domainEvents
 *       .filter(e => !state.processedEventIds.has(e.orderId))
 *       .map(e => ({
 *         type: 'email' as const,
 *         recipient: 'customer@example.com',
 *         message: `Order ${e.orderId} status changed to ${e.type}`
 *       }));
 *   },
 *   evolve: (state, event) => ({
 *     processedEventIds: new Set([...state.processedEventIds, event.orderId])
 *   }),
 *   initialState: { processedEventIds: new Set() },
 *   computeNewEvents: (events, command) => {
 *     const currentState = events.reduce(notificationPolicy.evolve, notificationPolicy.initialState);
 *     return notificationPolicy.decide(command, currentState);
 *   }
 * };
 * ```
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
   *
   * @example
   * Event-sourced order processing showing state derivation and decision making:
   * ```ts
   * const orderEvents: OrderEvent[] = [
   *   { type: 'OrderCreated', orderId: 'order-123', customerId: 'cust-456', timestamp: new Date('2024-01-01') },
   *   { type: 'ItemAdded', orderId: 'order-123', itemId: 'item-789', quantity: 2, timestamp: new Date('2024-01-02') }
   * ];
   *
   * // Command to ship the order
   * const shipCommand: OrderCommand = { type: 'ship', orderId: 'order-123' };
   *
   * // Event-sourced computation
   * const newEvents = orderDecider.computeNewEvents(orderEvents, shipCommand);
   * // Result: [{ type: 'OrderShipped', orderId: 'order-123', shippedAt: '2024-01-15T10:00:00Z' }]
   *
   * // The current state was derived from events (not stored):
   * // { orderId: 'order-123', status: 'pending', items: [{ itemId: 'item-789', quantity: 2 }], customerId: 'cust-456' }
   * ```
   *
   * @example
   * Policy decider processing multiple domain events to generate integration events:
   * ```ts
   * const domainEvents: DomainEvent[] = [
   *   { type: 'OrderCreated', orderId: 'order-123', timestamp: new Date() },
   *   { type: 'PaymentProcessed', orderId: 'order-123', timestamp: new Date() }
   * ];
   *
   * const processCommand: PolicyCommand = { type: 'process', domainEvents };
   *
   * // Event-sourced policy computation
   * const integrationEvents = policyDecider.computeNewEvents([], processCommand);
   * // Result: [
   * //   { eventType: 'order.integration.created', aggregateId: 'order-123', payload: '...' },
   * //   { eventType: 'payment.integration.processed', aggregateId: 'order-123', payload: '...' }
   * // ]
   * ```
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
 * **When to Use DcbDecider vs Other Types:**
 * - **Use DcbDecider** when you need event-sourced computation with consistent state types
 * - **Use DcbDecider** when input and output event types may differ (cross-boundary scenarios)
 * - **Use Decider** when state types need to differ between input and output
 * - **Use AggregateDecider** when both state and event types should be consistent
 *
 * **Event-Sourced vs State-Stored:**
 * `DcbDecider` is specifically designed for **event-sourced** scenarios where:
 * - State is computed from events, not stored directly
 * - Complete audit trail is maintained through event history
 * - Time-travel and replay capabilities are available
 * - State consistency is guaranteed through deterministic event application
 *
 * @example
 * Order processing with event-sourced computation:
 * ```ts
 * type OrderCommand = {
 *   type: 'create' | 'addItem' | 'ship' | 'cancel';
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
 *   totalAmount: number;
 * };
 *
 * type OrderEvent = {
 *   type: 'OrderCreated' | 'ItemAdded' | 'OrderShipped' | 'OrderCancelled';
 *   orderId: string;
 *   timestamp: Date;
 *   data?: unknown;
 * };
 *
 * type NotificationEvent = {
 *   type: 'EmailSent' | 'SMSSent';
 *   recipient: string;
 *   message: string;
 *   timestamp: Date;
 * };
 *
 * const orderDecider = new DcbDecider<OrderCommand, OrderState, OrderEvent, NotificationEvent>(
 *   // Decision logic: commands + state → notification events
 *   (command, state) => {
 *     const timestamp = new Date();
 *     switch (command.type) {
 *       case 'create':
 *         return [{
 *           type: 'EmailSent',
 *           recipient: 'customer@example.com',
 *           message: `Order ${command.orderId} created successfully`,
 *           timestamp
 *         }];
 *       case 'ship':
 *         return state.status === 'confirmed' ? [{
 *           type: 'SMSSent',
 *           recipient: '+1234567890',
 *           message: `Order ${state.orderId} has been shipped`,
 *           timestamp
 *         }] : [];
 *       default:
 *         return [];
 *     }
 *   },
 *   // Evolution logic: state + order events → updated state
 *   (state, event) => {
 *     switch (event.type) {
 *       case 'OrderCreated':
 *         return {
 *           ...state,
 *           orderId: event.orderId,
 *           status: 'draft',
 *           customerId: (event.data as any)?.customerId || ''
 *         };
 *       case 'OrderShipped':
 *         return { ...state, status: 'shipped' };
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
 *     totalAmount: 0
 *   }
 * );
 *
 * // Event-sourced computation: derive state from events, then make decisions
 * const orderHistory: OrderEvent[] = [
 *   { type: 'OrderCreated', orderId: 'order-123', timestamp: new Date('2024-01-01'), data: { customerId: 'cust-456' } },
 *   { type: 'ItemAdded', orderId: 'order-123', timestamp: new Date('2024-01-02'), data: { itemId: 'item-789', quantity: 2 } }
 * ];
 *
 * const shipCommand: OrderCommand = { type: 'ship', orderId: 'order-123' };
 *
 * // Compute new notification events based on order history
 * const notifications = orderDecider.computeNewEvents(orderHistory, shipCommand);
 * // Result: [{ type: 'SMSSent', recipient: '+1234567890', message: 'Order order-123 has been shipped', timestamp: Date }]
 * ```
 *
 * @example
 * Inventory management with different input/output event types:
 * ```ts
 * type InventoryCommand = { type: 'restock' | 'reserve' | 'release'; itemId: string; quantity: number; };
 * type InventoryState = { itemId: string; available: number; reserved: number; };
 * type InventoryEvent = { type: 'Restocked' | 'Reserved' | 'Released'; itemId: string; quantity: number; };
 * type AuditEvent = { action: string; itemId: string; quantity: number; userId: string; timestamp: Date; };
 *
 * const inventoryDecider = new DcbDecider<InventoryCommand, InventoryState, InventoryEvent, AuditEvent>(
 *   // Generate audit events from inventory commands
 *   (command, state) => [{
 *     action: `inventory.${command.type}`,
 *     itemId: command.itemId,
 *     quantity: command.quantity,
 *     userId: 'system',
 *     timestamp: new Date()
 *   }],
 *   // Apply inventory events to state
 *   (state, event) => {
 *     switch (event.type) {
 *       case 'Restocked':
 *         return { ...state, available: state.available + event.quantity };
 *       case 'Reserved':
 *         return { ...state, available: state.available - event.quantity, reserved: state.reserved + event.quantity };
 *       case 'Released':
 *         return { ...state, available: state.available + event.quantity, reserved: state.reserved - event.quantity };
 *       default:
 *         return state;
 *     }
 *   },
 *   { itemId: '', available: 0, reserved: 0 }
 * );
 *
 * // Event-sourced inventory computation
 * const inventoryHistory: InventoryEvent[] = [
 *   { type: 'Restocked', itemId: 'item-123', quantity: 100 },
 *   { type: 'Reserved', itemId: 'item-123', quantity: 25 }
 * ];
 *
 * const reserveCommand: InventoryCommand = { type: 'reserve', itemId: 'item-123', quantity: 10 };
 * const auditEvents = inventoryDecider.computeNewEvents(inventoryHistory, reserveCommand);
 * // Result: [{ action: 'inventory.reserve', itemId: 'item-123', quantity: 10, userId: 'system', timestamp: Date }]
 * ```
 *
 * @example
 * Policy decider for cross-boundary event transformation:
 * ```ts
 * type PolicyCommand = { type: 'process'; domainEvents: DomainEvent[]; };
 * type PolicyState = { lastProcessedEventId: string; processedCount: number; };
 * type DomainEvent = { id: string; type: string; aggregateId: string; data: unknown; };
 * type IntegrationEvent = { eventType: string; entityId: string; payload: string; correlationId: string; };
 *
 * const integrationPolicy = new DcbDecider<PolicyCommand, PolicyState, DomainEvent, IntegrationEvent>(
 *   // Transform domain events to integration events
 *   (command, state) => {
 *     return command.domainEvents.map(event => ({
 *       eventType: `integration.${event.type.toLowerCase()}`,
 *       entityId: event.aggregateId,
 *       payload: JSON.stringify(event.data),
 *       correlationId: `${event.aggregateId}-${event.id}`
 *     }));
 *   },
 *   // Track processed domain events in policy state
 *   (state, event) => ({
 *     lastProcessedEventId: event.id,
 *     processedCount: state.processedCount + 1
 *   }),
 *   { lastProcessedEventId: '', processedCount: 0 }
 * );
 *
 * // Process domain events through policy
 * const domainEventHistory: DomainEvent[] = [
 *   { id: 'evt-1', type: 'OrderCreated', aggregateId: 'order-123', data: { customerId: 'cust-456' } }
 * ];
 *
 * const processCommand: PolicyCommand = {
 *   type: 'process',
 *   domainEvents: [
 *     { id: 'evt-2', type: 'OrderShipped', aggregateId: 'order-123', data: { shippedAt: new Date() } }
 *   ]
 * };
 *
 * const integrationEvents = integrationPolicy.computeNewEvents(domainEventHistory, processCommand);
 * // Result: [{ eventType: 'integration.ordershipped', entityId: 'order-123', payload: '{"shippedAt":"..."}', correlationId: 'order-123-evt-2' }]
 * ```
 *
 * @typeParam C - Command type representing the intent or instruction to be processed
 * @typeParam S - State type (both input and output) representing the consistent state structure throughout the decider lifecycle
 * @typeParam Ei - Input event type consumed by the evolve function to update state
 * @typeParam Eo - Output event type produced by the decide function, may differ from Ei for cross-boundary scenarios
 *
 * @author Иван Дугалић / Ivan Dugalic / @idugalic
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
   * **State Consistency:**
   * The constraint `Si = So = S` ensures that the state type used for decision-making is identical
   * to the state type produced by event evolution, maintaining consistency throughout the process.
   *
   * **Performance Considerations:**
   * - State is computed fresh from all events on each call
   * - For large event histories, consider snapshotting strategies
   * - Events are processed sequentially using `reduce` for deterministic results
   *
   * @param events - Historical events representing the complete event stream for this entity.
   *                 Events are applied in order to derive the current state. An empty array
   *                 results in using `initialState` as the current state.
   * @param command - The command to be processed against the derived current state.
   *                  Commands represent intent or instructions that may produce new events.
   * @returns A readonly array of new output events representing what should happen as a result
   *          of processing the command against the current state. Returns empty array if the
   *          command should not produce any events in the current state.
   *
   * @example
   * Order processing with event sourcing:
   * ```ts
   * type OrderCommand = { type: 'addItem' | 'ship'; orderId: string; itemId?: string; quantity?: number; };
   * type OrderState = { orderId: string; status: 'draft' | 'confirmed' | 'shipped'; items: string[]; };
   * type OrderEvent = { type: 'OrderCreated' | 'ItemAdded' | 'OrderShipped'; orderId: string; data?: unknown; };
   *
   * const orderDecider = new DcbDecider<OrderCommand, OrderState, OrderEvent, OrderEvent>(
   *   (cmd, state) => {
   *     switch (cmd.type) {
   *       case 'addItem':
   *         return [{ type: 'ItemAdded', orderId: cmd.orderId, data: { itemId: cmd.itemId, quantity: cmd.quantity } }];
   *       case 'ship':
   *         return state.status === 'confirmed' ? [{ type: 'OrderShipped', orderId: cmd.orderId }] : [];
   *       default:
   *         return [];
   *     }
   *   },
   *   (state, event) => {
   *     switch (event.type) {
   *       case 'OrderCreated':
   *         return { ...state, orderId: event.orderId, status: 'draft' };
   *       case 'ItemAdded':
   *         return { ...state, items: [...state.items, (event.data as any).itemId] };
   *       case 'OrderShipped':
   *         return { ...state, status: 'shipped' };
   *       default:
   *         return state;
   *     }
   *   },
   *   { orderId: '', status: 'draft', items: [] }
   * );
   *
   * // Historical events representing order lifecycle
   * const orderHistory: OrderEvent[] = [
   *   { type: 'OrderCreated', orderId: 'order-123' },
   *   { type: 'ItemAdded', orderId: 'order-123', data: { itemId: 'item-456', quantity: 2 } },
   *   { type: 'ItemAdded', orderId: 'order-123', data: { itemId: 'item-789', quantity: 1 } }
   * ];
   *
   * // Command to ship the order
   * const shipCommand: OrderCommand = { type: 'ship', orderId: 'order-123' };
   *
   * // Event-sourced computation
   * const newEvents = orderDecider.computeNewEvents(orderHistory, shipCommand);
   * // Process:
   * // 1. Derive state from events: { orderId: 'order-123', status: 'draft', items: ['item-456', 'item-789'] }
   * // 2. Apply ship command: status is 'draft', not 'confirmed', so no shipping allowed
   * // Result: [] (empty array - no events produced)
   *
   * // If we had confirmed the order first:
   * const confirmedHistory = [...orderHistory, { type: 'OrderConfirmed', orderId: 'order-123' }];
   * const shippingEvents = orderDecider.computeNewEvents(confirmedHistory, shipCommand);
   * // Result: [{ type: 'OrderShipped', orderId: 'order-123' }]
   * ```
   *
   * @example
   * Account balance management with event sourcing:
   * ```ts
   * type AccountCommand = { type: 'deposit' | 'withdraw'; accountId: string; amount: number; };
   * type AccountState = { accountId: string; balance: number; isActive: boolean; };
   * type AccountEvent = { type: 'Deposited' | 'Withdrawn' | 'AccountClosed'; accountId: string; amount?: number; };
   *
   * const accountDecider = new DcbDecider<AccountCommand, AccountState, AccountEvent, AccountEvent>(
   *   (cmd, state) => {
   *     if (!state.isActive) return [];
   *     
   *     switch (cmd.type) {
   *       case 'deposit':
   *         return [{ type: 'Deposited', accountId: cmd.accountId, amount: cmd.amount }];
   *       case 'withdraw':
   *         return state.balance >= cmd.amount 
   *           ? [{ type: 'Withdrawn', accountId: cmd.accountId, amount: cmd.amount }]
   *           : []; // Insufficient funds
   *       default:
   *         return [];
   *     }
   *   },
   *   (state, event) => {
   *     switch (event.type) {
   *       case 'Deposited':
   *         return { ...state, balance: state.balance + (event.amount || 0) };
   *       case 'Withdrawn':
   *         return { ...state, balance: state.balance - (event.amount || 0) };
   *       case 'AccountClosed':
   *         return { ...state, isActive: false };
   *       default:
   *         return state;
   *     }
   *   },
   *   { accountId: '', balance: 0, isActive: true }
   * );
   *
   * // Account transaction history
   * const transactionHistory: AccountEvent[] = [
   *   { type: 'Deposited', accountId: 'acc-123', amount: 1000 },
   *   { type: 'Withdrawn', accountId: 'acc-123', amount: 200 },
   *   { type: 'Deposited', accountId: 'acc-123', amount: 500 }
   * ];
   *
   * // Attempt to withdraw money
   * const withdrawCommand: AccountCommand = { type: 'withdraw', accountId: 'acc-123', amount: 300 };
   *
   * const withdrawalEvents = accountDecider.computeNewEvents(transactionHistory, withdrawCommand);
   * // Process:
   * // 1. Derive balance from history: 1000 - 200 + 500 = 1300
   * // 2. Check withdrawal: 300 <= 1300, withdrawal allowed
   * // Result: [{ type: 'Withdrawn', accountId: 'acc-123', amount: 300 }]
   *
   * // Attempt to withdraw more than available
   * const largeWithdrawCommand: AccountCommand = { type: 'withdraw', accountId: 'acc-123', amount: 2000 };
   * const rejectedEvents = accountDecider.computeNewEvents(transactionHistory, largeWithdrawCommand);
   * // Result: [] (insufficient funds, no events produced)
   * ```
   *
   * @example
   * Cross-boundary policy with different input/output event types:
   * ```ts
   * type PolicyCommand = { type: 'process'; domainEvents: DomainEvent[]; };
   * type PolicyState = { lastProcessedEventId: string; processedCount: number; };
   * type DomainEvent = { id: string; type: 'OrderCreated' | 'OrderShipped'; orderId: string; };
   * type NotificationEvent = { type: 'EmailQueued' | 'SMSQueued'; recipient: string; message: string; };
   *
   * const notificationPolicy = new DcbDecider<PolicyCommand, PolicyState, DomainEvent, NotificationEvent>(
   *   (cmd, state) => {
   *     return cmd.domainEvents.map(event => {
   *       switch (event.type) {
   *         case 'OrderCreated':
   *           return { type: 'EmailQueued', recipient: 'customer@example.com', message: `Order ${event.orderId} created` };
   *         case 'OrderShipped':
   *           return { type: 'SMSQueued', recipient: '+1234567890', message: `Order ${event.orderId} shipped` };
   *         default:
   *           return null;
   *       }
   *     }).filter(Boolean) as NotificationEvent[];
   *   },
   *   (state, event) => ({
   *     lastProcessedEventId: event.id,
   *     processedCount: state.processedCount + 1
   *   }),
   *   { lastProcessedEventId: '', processedCount: 0 }
   * );
   *
   * // Policy processing history
   * const policyHistory: DomainEvent[] = [
   *   { id: 'evt-1', type: 'OrderCreated', orderId: 'order-123' },
   *   { id: 'evt-2', type: 'OrderCreated', orderId: 'order-456' }
   * ];
   *
   * // New domain events to process
   * const processCommand: PolicyCommand = {
   *   type: 'process',
   *   domainEvents: [
   *     { id: 'evt-3', type: 'OrderShipped', orderId: 'order-123' }
   *   ]
   * };
   *
   * const notifications = notificationPolicy.computeNewEvents(policyHistory, processCommand);
   * // Process:
   * // 1. Derive policy state: { lastProcessedEventId: 'evt-2', processedCount: 2 }
   * // 2. Process new shipping event
   * // Result: [{ type: 'SMSQueued', recipient: '+1234567890', message: 'Order order-123 shipped' }]
   * ```
   */
  computeNewEvents(events: readonly Ei[], command: C): readonly Eo[] {
    const currentState = events.reduce(
      this.evolve,
      this.initialState,
    );
    return this.decide(command, currentState);
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
 * @example
 * Customer aggregate demonstrating business rule enforcement:
 * ```ts
 * type CustomerCommand = { type: 'register' | 'updateEmail' | 'deactivate'; customerId: string; email?: string; };
 * type CustomerState = { customerId: string; email: string; status: 'active' | 'inactive'; registeredAt: Date; };
 * type CustomerEvent = { type: 'CustomerRegistered' | 'EmailUpdated' | 'CustomerDeactivated'; customerId: string; timestamp: Date; email?: string; };
 *
 * const customerAggregate: IAggregateDecider<CustomerCommand, CustomerState, CustomerEvent> = {
 *   decide: (cmd, state) => {
 *     switch (cmd.type) {
 *       case 'register':
 *         return !state.customerId ? [{
 *           type: 'CustomerRegistered',
 *           customerId: cmd.customerId,
 *           email: cmd.email!,
 *           timestamp: new Date()
 *         }] : [];
 *       case 'updateEmail':
 *         return state.status === 'active' && cmd.email !== state.email ? [{
 *           type: 'EmailUpdated',
 *           customerId: cmd.customerId,
 *           email: cmd.email!,
 *           timestamp: new Date()
 *         }] : [];
 *       case 'deactivate':
 *         return state.status === 'active' ? [{
 *           type: 'CustomerDeactivated',
 *           customerId: cmd.customerId,
 *           timestamp: new Date()
 *         }] : [];
 *       default:
 *         return [];
 *     }
 *   },
 *   evolve: (state, event) => {
 *     switch (event.type) {
 *       case 'CustomerRegistered':
 *         return {
 *           customerId: event.customerId,
 *           email: event.email!,
 *           status: 'active',
 *           registeredAt: event.timestamp
 *         };
 *       case 'EmailUpdated':
 *         return { ...state, email: event.email! };
 *       case 'CustomerDeactivated':
 *         return { ...state, status: 'inactive' };
 *       default:
 *         return state;
 *     }
 *   },
 *   initialState: { customerId: '', email: '', status: 'inactive', registeredAt: new Date() },
 *   computeNewEvents: (events, command) => {
 *     const currentState = events.reduce(customerAggregate.evolve, customerAggregate.initialState);
 *     return customerAggregate.decide(command, currentState);
 *   },
 *   computeNewState: (state, command) => {
 *     const events = customerAggregate.decide(command, state);
 *     return events.reduce(customerAggregate.evolve, state);
 *   }
 * };
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
   *
   * @example
   * Order aggregate state-stored processing with business rule validation:
   * ```ts
   * const currentOrder: OrderState = {
   *   orderId: 'order-789',
   *   customerId: 'cust-123',
   *   status: 'draft',
   *   items: [
   *     { itemId: 'item-456', quantity: 2 },
   *     { itemId: 'item-789', quantity: 1 }
   *   ],
   *   total: 150
   * };
   *
   * // Command to confirm the order
   * const confirmCommand: OrderCommand = { type: 'confirm', orderId: 'order-789' };
   *
   * // State-stored computation
   * const updatedOrder = orderAggregate.computeNewState(currentOrder, confirmCommand);
   * // Result: { orderId: 'order-789', status: 'confirmed', items: [...], total: 150 }
   *
   * // Events produced during computation (can be persisted for audit/integration):
   * // [{ type: 'OrderConfirmed', orderId: 'order-789', timestamp: '2024-01-15T10:00:00Z' }]
   * ```
   *
   * @example
   * Customer aggregate with validation and state transitions:
   * ```ts
   * const activeCustomer: CustomerState = {
   *   customerId: 'cust-456',
   *   email: 'old@example.com',
   *   status: 'active',
   *   registeredAt: new Date('2024-01-01')
   * };
   *
   * const updateEmailCommand: CustomerCommand = {
   *   type: 'updateEmail',
   *   customerId: 'cust-456',
   *   email: 'new@example.com'
   * };
   *
   * // State-stored email update
   * const updatedCustomer = customerAggregate.computeNewState(activeCustomer, updateEmailCommand);
   * // Result: { customerId: 'cust-456', email: 'new@example.com', status: 'active', registeredAt: '...' }
   * ```
   *
   * @example
   * Inventory aggregate with quantity management and business rules:
   * ```ts
   * type InventoryCommand = { type: 'restock' | 'reserve' | 'release'; itemId: string; quantity: number; };
   * type InventoryState = { itemId: string; availableQuantity: number; reservedQuantity: number; };
   * type InventoryEvent = { type: 'ItemRestocked' | 'ItemReserved' | 'ItemReleased'; itemId: string; quantity: number; timestamp: Date; };
   *
   * const inventoryAggregate: IAggregateDecider<InventoryCommand, InventoryState, InventoryEvent> = {
   *   // ... decide, evolve, initialState implementations
   *   computeNewState: (state, command) => {
   *     const events = inventoryAggregate.decide(command, state);
   *     return events.reduce(inventoryAggregate.evolve, state);
   *   }
   * };
   *
   * const currentInventory: InventoryState = { itemId: 'item-123', availableQuantity: 100, reservedQuantity: 20 };
   * const reserveCommand: InventoryCommand = { type: 'reserve', itemId: 'item-123', quantity: 15 };
   *
   * const updatedInventory = inventoryAggregate.computeNewState(currentInventory, reserveCommand);
   * // Result: { itemId: 'item-123', availableQuantity: 85, reservedQuantity: 35 }
   * ```
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
 * **Performance Considerations:**
 * - **Event-Sourced**: Recomputes state from all events (use for audit/compliance requirements)
 * - **State-Stored**: Maintains state directly (use for performance-critical scenarios)
 * - Choose the computation method based on your specific requirements
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
 * @example
 * Customer aggregate with profile management:
 * ```ts
 * type CustomerCommand = {
 *   type: 'register' | 'updateEmail' | 'updateAddress' | 'deactivate' | 'reactivate';
 *   customerId: string;
 *   email?: string;
 *   address?: string;
 *   name?: string;
 * };
 *
 * type CustomerState = {
 *   customerId: string;
 *   name: string;
 *   email: string;
 *   address: string;
 *   status: 'active' | 'inactive';
 *   registeredAt: Date;
 *   lastUpdatedAt: Date;
 * };
 *
 * type CustomerEvent = {
 *   type: 'CustomerRegistered' | 'EmailUpdated' | 'AddressUpdated' | 'CustomerDeactivated' | 'CustomerReactivated';
 *   customerId: string;
 *   timestamp: Date;
 *   email?: string;
 *   address?: string;
 *   name?: string;
 * };
 *
 * const customerAggregate = new AggregateDecider<CustomerCommand, CustomerState, CustomerEvent>(
 *   (command, state) => {
 *     const timestamp = new Date();
 *     switch (command.type) {
 *       case 'register':
 *         return !state.customerId ? [{
 *           type: 'CustomerRegistered',
 *           customerId: command.customerId,
 *           name: command.name!,
 *           email: command.email!,
 *           address: command.address!,
 *           timestamp
 *         }] : [];
 *       case 'updateEmail':
 *         return state.status === 'active' && command.email !== state.email ? [{
 *           type: 'EmailUpdated',
 *           customerId: command.customerId,
 *           email: command.email!,
 *           timestamp
 *         }] : [];
 *       case 'updateAddress':
 *         return state.status === 'active' ? [{
 *           type: 'AddressUpdated',
 *           customerId: command.customerId,
 *           address: command.address!,
 *           timestamp
 *         }] : [];
 *       case 'deactivate':
 *         return state.status === 'active' ? [{
 *           type: 'CustomerDeactivated',
 *           customerId: command.customerId,
 *           timestamp
 *         }] : [];
 *       case 'reactivate':
 *         return state.status === 'inactive' ? [{
 *           type: 'CustomerReactivated',
 *           customerId: command.customerId,
 *           timestamp
 *         }] : [];
 *       default:
 *         return [];
 *     }
 *   },
 *   (state, event) => {
 *     switch (event.type) {
 *       case 'CustomerRegistered':
 *         return {
 *           customerId: event.customerId,
 *           name: event.name!,
 *           email: event.email!,
 *           address: event.address!,
 *           status: 'active',
 *           registeredAt: event.timestamp,
 *           lastUpdatedAt: event.timestamp
 *         };
 *       case 'EmailUpdated':
 *         return { ...state, email: event.email!, lastUpdatedAt: event.timestamp };
 *       case 'AddressUpdated':
 *         return { ...state, address: event.address!, lastUpdatedAt: event.timestamp };
 *       case 'CustomerDeactivated':
 *         return { ...state, status: 'inactive', lastUpdatedAt: event.timestamp };
 *       case 'CustomerReactivated':
 *         return { ...state, status: 'active', lastUpdatedAt: event.timestamp };
 *       default:
 *         return state;
 *     }
 *   },
 *   {
 *     customerId: '',
 *     name: '',
 *     email: '',
 *     address: '',
 *     status: 'inactive',
 *     registeredAt: new Date(),
 *     lastUpdatedAt: new Date()
 *   }
 * );
 *
 * // State-stored approach for real-time customer updates
 * const activeCustomer: CustomerState = {
 *   customerId: 'cust-123',
 *   name: 'John Doe',
 *   email: 'john@example.com',
 *   address: '123 Main St',
 *   status: 'active',
 *   registeredAt: new Date('2024-01-01'),
 *   lastUpdatedAt: new Date('2024-01-01')
 * };
 *
 * const updateEmailCommand: CustomerCommand = {
 *   type: 'updateEmail',
 *   customerId: 'cust-123',
 *   email: 'john.doe@example.com'
 * };
 *
 * const updatedCustomer = customerAggregate.computeNewState(activeCustomer, updateEmailCommand);
 * // Result: Customer state with updated email and lastUpdatedAt timestamp
 * ```
 *
 * @example
 * Inventory aggregate with stock management and business rules:
 * ```ts
 * type InventoryCommand = {
 *   type: 'initialize' | 'restock' | 'reserve' | 'release' | 'adjust';
 *   itemId: string;
 *   quantity: number;
 *   reason?: string;
 * };
 *
 * type InventoryState = {
 *   itemId: string;
 *   availableQuantity: number;
 *   reservedQuantity: number;
 *   totalQuantity: number;
 *   lastRestockedAt?: Date;
 *   isActive: boolean;
 * };
 *
 * type InventoryEvent = {
 *   type: 'InventoryInitialized' | 'ItemRestocked' | 'ItemReserved' | 'ItemReleased' | 'QuantityAdjusted';
 *   itemId: string;
 *   quantity: number;
 *   timestamp: Date;
 *   reason?: string;
 * };
 *
 * const inventoryAggregate = new AggregateDecider<InventoryCommand, InventoryState, InventoryEvent>(
 *   (command, state) => {
 *     const timestamp = new Date();
 *     switch (command.type) {
 *       case 'initialize':
 *         return !state.itemId ? [{
 *           type: 'InventoryInitialized',
 *           itemId: command.itemId,
 *           quantity: command.quantity,
 *           timestamp
 *         }] : [];
 *       case 'restock':
 *         return state.isActive ? [{
 *           type: 'ItemRestocked',
 *           itemId: command.itemId,
 *           quantity: command.quantity,
 *           timestamp
 *         }] : [];
 *       case 'reserve':
 *         return state.isActive && state.availableQuantity >= command.quantity ? [{
 *           type: 'ItemReserved',
 *           itemId: command.itemId,
 *           quantity: command.quantity,
 *           timestamp
 *         }] : []; // Insufficient stock
 *       case 'release':
 *         return state.isActive && state.reservedQuantity >= command.quantity ? [{
 *           type: 'ItemReleased',
 *           itemId: command.itemId,
 *           quantity: command.quantity,
 *           timestamp
 *         }] : [];
 *       case 'adjust':
 *         return state.isActive ? [{
 *           type: 'QuantityAdjusted',
 *           itemId: command.itemId,
 *           quantity: command.quantity,
 *           reason: command.reason,
 *           timestamp
 *         }] : [];
 *       default:
 *         return [];
 *     }
 *   },
 *   (state, event) => {
 *     switch (event.type) {
 *       case 'InventoryInitialized':
 *         return {
 *           itemId: event.itemId,
 *           availableQuantity: event.quantity,
 *           reservedQuantity: 0,
 *           totalQuantity: event.quantity,
 *           lastRestockedAt: event.timestamp,
 *           isActive: true
 *         };
 *       case 'ItemRestocked':
 *         return {
 *           ...state,
 *           availableQuantity: state.availableQuantity + event.quantity,
 *           totalQuantity: state.totalQuantity + event.quantity,
 *           lastRestockedAt: event.timestamp
 *         };
 *       case 'ItemReserved':
 *         return {
 *           ...state,
 *           availableQuantity: state.availableQuantity - event.quantity,
 *           reservedQuantity: state.reservedQuantity + event.quantity
 *         };
 *       case 'ItemReleased':
 *         return {
 *           ...state,
 *           availableQuantity: state.availableQuantity + event.quantity,
 *           reservedQuantity: state.reservedQuantity - event.quantity
 *         };
 *       case 'QuantityAdjusted':
 *         const newTotal = state.totalQuantity + event.quantity;
 *         return {
 *           ...state,
 *           availableQuantity: state.availableQuantity + event.quantity,
 *           totalQuantity: newTotal
 *         };
 *       default:
 *         return state;
 *     }
 *   },
 *   {
 *     itemId: '',
 *     availableQuantity: 0,
 *     reservedQuantity: 0,
 *     totalQuantity: 0,
 *     isActive: false
 *   }
 * );
 *
 * // Event-sourced computation for complete audit trail
 * const inventoryHistory: InventoryEvent[] = [
 *   { type: 'InventoryInitialized', itemId: 'item-123', quantity: 100, timestamp: new Date('2024-01-01') },
 *   { type: 'ItemReserved', itemId: 'item-123', quantity: 25, timestamp: new Date('2024-01-02') },
 *   { type: 'ItemRestocked', itemId: 'item-123', quantity: 50, timestamp: new Date('2024-01-03') }
 * ];
 *
 * const reserveCommand: InventoryCommand = { type: 'reserve', itemId: 'item-123', quantity: 30 };
 * const reservationEvents = inventoryAggregate.computeNewEvents(inventoryHistory, reserveCommand);
 * // Process: Derive state (available: 125, reserved: 25), check if 30 <= 125, allow reservation
 * // Result: [{ type: 'ItemReserved', itemId: 'item-123', quantity: 30, timestamp: Date }]
 *
 * // State-stored computation for performance-critical operations
 * const currentInventory: InventoryState = {
 *   itemId: 'item-456',
 *   availableQuantity: 75,
 *   reservedQuantity: 15,
 *   totalQuantity: 90,
 *   lastRestockedAt: new Date('2024-01-05'),
 *   isActive: true
 * };
 *
 * const restockCommand: InventoryCommand = { type: 'restock', itemId: 'item-456', quantity: 25 };
 * const updatedInventory = inventoryAggregate.computeNewState(currentInventory, restockCommand);
 * // Result: { availableQuantity: 100, totalQuantity: 115, lastRestockedAt: new Date(), ... }
 * ```
 *
 * @typeParam C - Command type representing the intent or instruction to be processed by the aggregate
 * @typeParam S - State type (both input and output) representing the consistent aggregate state structure
 * @typeParam E - Event type (both input and output) representing domain events that directly correspond to state changes
 *
 * @author Иван Дугалић / Ivan Dugalic / @idugalic
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
   * - Performance-critical scenarios where event replay is too expensive
   * - Systems where current state is more important than complete history
   * - Applications requiring immediate state consistency without event store dependencies
   *
   * **Dual Constraint Benefits:**
   * The constraints `Si = So = S` and `Ei = Eo = E` ensure that:
   * - Events produced by `decide` can be directly applied by `evolve`
   * - State consistency is maintained throughout the process
   * - No type mismatches between decision and evolution phases
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
   *
   * @example
   * Order aggregate with state-stored computation:
   * ```ts
   * type OrderCommand = { type: 'addItem' | 'removeItem' | 'confirm'; orderId: string; itemId?: string; quantity?: number; };
   * type OrderState = { orderId: string; status: 'draft' | 'confirmed'; items: string[]; totalItems: number; };
   * type OrderEvent = { type: 'ItemAdded' | 'ItemRemoved' | 'OrderConfirmed'; orderId: string; itemId?: string; };
   *
   * const orderAggregate = new AggregateDecider<OrderCommand, OrderState, OrderEvent>(
   *   (cmd, state) => {
   *     switch (cmd.type) {
   *       case 'addItem':
   *         return state.status === 'draft' ? [{ type: 'ItemAdded', orderId: cmd.orderId, itemId: cmd.itemId }] : [];
   *       case 'removeItem':
   *         return state.status === 'draft' && state.items.includes(cmd.itemId!) 
   *           ? [{ type: 'ItemRemoved', orderId: cmd.orderId, itemId: cmd.itemId }] : [];
   *       case 'confirm':
   *         return state.status === 'draft' && state.items.length > 0 
   *           ? [{ type: 'OrderConfirmed', orderId: cmd.orderId }] : [];
   *       default:
   *         return [];
   *     }
   *   },
   *   (state, event) => {
   *     switch (event.type) {
   *       case 'ItemAdded':
   *         return { 
   *           ...state, 
   *           items: [...state.items, event.itemId!], 
   *           totalItems: state.totalItems + 1 
   *         };
   *       case 'ItemRemoved':
   *         return { 
   *           ...state, 
   *           items: state.items.filter(id => id !== event.itemId), 
   *           totalItems: state.totalItems - 1 
   *         };
   *       case 'OrderConfirmed':
   *         return { ...state, status: 'confirmed' };
   *       default:
   *         return state;
   *     }
   *   },
   *   { orderId: '', status: 'draft', items: [], totalItems: 0 }
   * );
   *
   * // Current order state
   * const currentOrder: OrderState = {
   *   orderId: 'order-123',
   *   status: 'draft',
   *   items: ['item-456', 'item-789'],
   *   totalItems: 2
   * };
   *
   * // Add another item using state-stored computation
   * const addItemCommand: OrderCommand = { type: 'addItem', orderId: 'order-123', itemId: 'item-999' };
   * const updatedOrder = orderAggregate.computeNewState(currentOrder, addItemCommand);
   * // Process:
   * // 1. decide(addItemCommand, currentOrder) → [{ type: 'ItemAdded', orderId: 'order-123', itemId: 'item-999' }]
   * // 2. evolve(currentOrder, ItemAddedEvent) → updated state with new item
   * // Result: { orderId: 'order-123', status: 'draft', items: ['item-456', 'item-789', 'item-999'], totalItems: 3 }
   *
   * // Confirm the order
   * const confirmCommand: OrderCommand = { type: 'confirm', orderId: 'order-123' };
   * const confirmedOrder = orderAggregate.computeNewState(updatedOrder, confirmCommand);
   * // Result: { orderId: 'order-123', status: 'confirmed', items: ['item-456', 'item-789', 'item-999'], totalItems: 3 }
   * ```
   *
   * @example
   * Account balance management with state-stored computation:
   * ```ts
   * type AccountCommand = { type: 'deposit' | 'withdraw' | 'freeze' | 'unfreeze'; accountId: string; amount?: number; };
   * type AccountState = { accountId: string; balance: number; status: 'active' | 'frozen'; transactionCount: number; };
   * type AccountEvent = { type: 'Deposited' | 'Withdrawn' | 'AccountFrozen' | 'AccountUnfrozen'; accountId: string; amount?: number; };
   *
   * const accountAggregate = new AggregateDecider<AccountCommand, AccountState, AccountEvent>(
   *   (cmd, state) => {
   *     switch (cmd.type) {
   *       case 'deposit':
   *         return state.status === 'active' ? [{ type: 'Deposited', accountId: cmd.accountId, amount: cmd.amount }] : [];
   *       case 'withdraw':
   *         return state.status === 'active' && state.balance >= cmd.amount! 
   *           ? [{ type: 'Withdrawn', accountId: cmd.accountId, amount: cmd.amount }] : [];
   *       case 'freeze':
   *         return state.status === 'active' ? [{ type: 'AccountFrozen', accountId: cmd.accountId }] : [];
   *       case 'unfreeze':
   *         return state.status === 'frozen' ? [{ type: 'AccountUnfrozen', accountId: cmd.accountId }] : [];
   *       default:
   *         return [];
   *     }
   *   },
   *   (state, event) => {
   *     switch (event.type) {
   *       case 'Deposited':
   *         return { 
   *           ...state, 
   *           balance: state.balance + event.amount!, 
   *           transactionCount: state.transactionCount + 1 
   *         };
   *       case 'Withdrawn':
   *         return { 
   *           ...state, 
   *           balance: state.balance - event.amount!, 
   *           transactionCount: state.transactionCount + 1 
   *         };
   *       case 'AccountFrozen':
   *         return { ...state, status: 'frozen' };
   *       case 'AccountUnfrozen':
   *         return { ...state, status: 'active' };
   *       default:
   *         return state;
   *     }
   *   },
   *   { accountId: '', balance: 0, status: 'active', transactionCount: 0 }
   * );
   *
   * // Current account state
   * const activeAccount: AccountState = {
   *   accountId: 'acc-123',
   *   balance: 1500.00,
   *   status: 'active',
   *   transactionCount: 25
   * };
   *
   * // Perform withdrawal using state-stored computation
   * const withdrawCommand: AccountCommand = { type: 'withdraw', accountId: 'acc-123', amount: 200.00 };
   * const updatedAccount = accountAggregate.computeNewState(activeAccount, withdrawCommand);
   * // Process:
   * // 1. Check business rules: status === 'active' && balance >= 200.00 ✓
   * // 2. Produce event: [{ type: 'Withdrawn', accountId: 'acc-123', amount: 200.00 }]
   * // 3. Apply event: balance = 1500.00 - 200.00, transactionCount = 25 + 1
   * // Result: { accountId: 'acc-123', balance: 1300.00, status: 'active', transactionCount: 26 }
   *
   * // Attempt withdrawal with insufficient funds
   * const largeWithdrawCommand: AccountCommand = { type: 'withdraw', accountId: 'acc-123', amount: 2000.00 };
   * const rejectedAccount = accountAggregate.computeNewState(updatedAccount, largeWithdrawCommand);
   * // Process:
   * // 1. Check business rules: balance < 2000.00 ✗
   * // 2. Produce events: [] (empty - business rule violation)
   * // 3. Apply events: no events to apply
   * // Result: updatedAccount (unchanged state)
   * ```
   *
   * @example
   * Inventory management with stock tracking:
   * ```ts
   * type InventoryCommand = { type: 'restock' | 'reserve' | 'release' | 'adjust'; itemId: string; quantity: number; reason?: string; };
   * type InventoryState = { itemId: string; available: number; reserved: number; total: number; };
   * type InventoryEvent = { type: 'Restocked' | 'Reserved' | 'Released' | 'Adjusted'; itemId: string; quantity: number; };
   *
   * const inventoryAggregate = new AggregateDecider<InventoryCommand, InventoryState, InventoryEvent>(
   *   (cmd, state) => {
   *     switch (cmd.type) {
   *       case 'restock':
   *         return [{ type: 'Restocked', itemId: cmd.itemId, quantity: cmd.quantity }];
   *       case 'reserve':
   *         return state.available >= cmd.quantity 
   *           ? [{ type: 'Reserved', itemId: cmd.itemId, quantity: cmd.quantity }] : [];
   *       case 'release':
   *         return state.reserved >= cmd.quantity 
   *           ? [{ type: 'Released', itemId: cmd.itemId, quantity: cmd.quantity }] : [];
   *       case 'adjust':
   *         return [{ type: 'Adjusted', itemId: cmd.itemId, quantity: cmd.quantity }];
   *       default:
   *         return [];
   *     }
   *   },
   *   (state, event) => {
   *     switch (event.type) {
   *       case 'Restocked':
   *         return { 
   *           ...state, 
   *           available: state.available + event.quantity, 
   *           total: state.total + event.quantity 
   *         };
   *       case 'Reserved':
   *         return { 
   *           ...state, 
   *           available: state.available - event.quantity, 
   *           reserved: state.reserved + event.quantity 
   *         };
   *       case 'Released':
   *         return { 
   *           ...state, 
   *           available: state.available + event.quantity, 
   *           reserved: state.reserved - event.quantity 
   *         };
   *       case 'Adjusted':
   *         return { 
   *           ...state, 
   *           available: state.available + event.quantity, 
   *           total: state.total + event.quantity 
   *         };
   *       default:
   *         return state;
   *     }
   *   },
   *   { itemId: '', available: 0, reserved: 0, total: 0 }
   * );
   *
   * // Current inventory state
   * const currentInventory: InventoryState = {
   *   itemId: 'item-123',
   *   available: 75,
   *   reserved: 25,
   *   total: 100
   * };
   *
   * // Reserve items for an order
   * const reserveCommand: InventoryCommand = { type: 'reserve', itemId: 'item-123', quantity: 15 };
   * const updatedInventory = inventoryAggregate.computeNewState(currentInventory, reserveCommand);
   * // Process:
   * // 1. Check availability: 75 >= 15 ✓
   * // 2. Produce event: [{ type: 'Reserved', itemId: 'item-123', quantity: 15 }]
   * // 3. Apply event: available = 75 - 15, reserved = 25 + 15
   * // Result: { itemId: 'item-123', available: 60, reserved: 40, total: 100 }
   *
   * // Restock inventory
   * const restockCommand: InventoryCommand = { type: 'restock', itemId: 'item-123', quantity: 50 };
   * const restockedInventory = inventoryAggregate.computeNewState(updatedInventory, restockCommand);
   * // Result: { itemId: 'item-123', available: 110, reserved: 40, total: 150 }
   * ```
   */
  computeNewState(state: S, command: C): S {
    const events = this.decide(command, state);
    return events.reduce(this.evolve, state);
  }
}

/**
 * The identity function: returns its input unchanged.
 */
const identity = <T>(t: T) => t;
