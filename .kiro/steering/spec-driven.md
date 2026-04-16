# Spec-Driven Development with fmodel-decider

## Overview

fmodel-decider provides a **formal specification encoded into the type system**
that serves as a foundation for spec-driven development. The library's type
hierarchy and interfaces act as executable specifications that guide
implementation while maintaining correctness guarantees.

## From Vibing to Viable

The library enables a progression from informal specifications to
production-ready implementations:

1. **Formal Foundation**: Type system encodes domain modeling patterns as
   executable specifications
2. **Informal Layer**: Add human-readable specs, documentation, and business
   rules on top
3. **AI-Assisted Development**: Formal types guide AI tools to generate correct
   implementations
4. **Progressive Refinement**: Start general, add constraints incrementally as
   requirements clarify

## Type System as Formal Specification

### Computation Patterns as Contracts

```typescript
// Formal specification: Event-sourced computation
interface EventComputation<C, Ei, Eo> {
  computeNewEvents(events: readonly Ei[], command: C): readonly Eo[];
}

// Formal specification: State-stored computation
interface StateComputation<C, S> {
  computeNewState(state: S, command: C): S;
}
```

These interfaces are **executable specifications** that:

- Define computation modes at the type level
- Enforce purity (no side effects in signatures)
- Enable compile-time verification of correctness
- Guide AI tools to generate valid implementations

### Progressive Type Refinement as Specification Evolution

```typescript
// Level 1: General specification - all types independent
interface IDecider<C, Si, So, Ei, Eo> {
  decide(command: C, state: Si): readonly Eo[];
  evolve(state: Si, event: Ei): So;
  initialState: So;
}

// Level 2: Constrained specification - state consistency
interface IDcbDecider<C, S, Ei, Eo> extends IDecider<C, S, S, Ei, Eo> {
  // Gains: EventComputation capability
  computeNewEvents(events: readonly Ei[], command: C): readonly Eo[];
}

// Level 3: Strict specification - full consistency
interface IAggregateDecider<C, S, E> extends IDcbDecider<C, S, E, E> {
  // Gains: StateComputation capability
  computeNewState(state: S, command: C): S;
}
```

Each refinement level is a **formal specification** that:

- Adds semantic constraints
- Eliminates invalid states
- Provides stronger guarantees
- Enables more optimizations

## Given-When-Then: Executable Specifications

### The DSL as Formal Specification Language

The Given-When-Then DSL is **not just testing** - it's a formal specification
language that:

- **Documents behavior** through executable examples
- **Verifies correctness** at compile-time (types) and runtime (assertions)
- **Guides implementation** by specifying expected behavior first
- **Serves as living documentation** that never goes stale

### Three Specification Formats

#### 1. Event-Sourced Decider Specification

For `IDcbDecider` and `IAggregateDecider` (event-sourced mode):

```typescript
DeciderEventSourcedSpec.for(placeOrderDecider)
  .given([ // Past events (event history)
    restaurantCreatedEvent,
    restaurantMenuChangedEvent,
  ])
  .when(placeOrderCommand) // Command to process
  .then([restaurantOrderPlacedEvent]); // Expected new events
```

**Specification semantics:**

- `given`: Event history that establishes current state
- `when`: Command representing user intent
- `then`: New events that should be produced

**Use for:**

- DCB deciders (dynamic consistency boundaries)
- Aggregate deciders in event-sourced mode
- Any decider implementing `EventComputation`

#### 2. State-Stored Decider Specification

For `IAggregateDecider` (state-stored mode):

```typescript
DeciderStateStoredSpec.for(orderDecider)
  .given({ status: "Pending", items: [...] })  // Current state
  .when({ type: "ShipOrder" })                 // Command to process
  .then({ status: "Shipped", items: [...] });  // Expected new state
```

**Specification semantics:**

- `given`: Current aggregate state
- `when`: Command representing user intent
- `then`: Expected state after command processing

**Use for:**

- Aggregate deciders in state-stored mode
- Traditional DDD aggregates
- Any decider implementing `StateComputation`

#### 3. View/Projection Specification

For `IProjection` (event-sourced views):

```typescript
ViewSpecification.for(restaurantView)
  .given([ // Event stream
    restaurantCreatedEvent,
    menuChangedEvent,
    orderPlacedEvent,
  ])
  .then(expectedRestaurantState); // Expected projected state
```

**Specification semantics:**

- `given`: Event stream to process
- `then`: Expected view state after processing all events

**Use for:**

- Read models
- Query models
- Event-sourced projections

### Error Case Specifications

All three formats support error specifications using `thenThrows`:

```typescript
// Specify that command should fail
DeciderEventSourcedSpec.for(placeOrderDecider)
  .given([]) // No restaurant exists
  .when(placeOrderCommand)
  .thenThrows((error) => error instanceof RestaurantNotFoundError);

// Specify validation errors
DeciderEventSourcedSpec.for(placeOrderDecider)
  .given([restaurantCreatedEvent])
  .when(placeOrderCommandWithInvalidItems)
  .thenThrows((error) => error instanceof MenuItemsNotAvailableError);
```

### Specification-First Development Workflow

**1. Write specifications before implementation:**

```typescript
// Step 1: Define the specification (what should happen)
Deno.test("Place Order - Success", () => {
  DeciderEventSourcedSpec.for(placeOrderDecider)
    .given([restaurantCreatedEvent])
    .when(placeOrderCommand)
    .then([restaurantOrderPlacedEvent]);
});

// Step 2: Implement to satisfy the specification
// Step 3: Run tests to verify specification is met
```

**2. Specifications as requirements:**

Each test is a formal requirement:

- ✅ "Given a restaurant exists, when placing an order, then order placed event
  is produced"
- ✅ "Given no restaurant exists, when placing an order, then
  RestaurantNotFoundError is thrown"
- ✅ "Given invalid menu items, when placing an order, then
  MenuItemsNotAvailableError is thrown"

**3. Specifications guide AI implementation:**

```
AI Prompt: "Implement placeOrderDecider to satisfy these specifications:

1. Given [RestaurantCreatedEvent], when PlaceOrderCommand, then [RestaurantOrderPlacedEvent]
2. Given [], when PlaceOrderCommand, then throw RestaurantNotFoundError
3. Given [RestaurantCreatedEvent, RestaurantOrderPlacedEvent], when PlaceOrderCommand with same orderId, then throw OrderAlreadyExistsError
"
```

The AI generates implementation that satisfies the formal specifications.

### Complete Example: Specification-Driven Implementation

```typescript
// 1. Define domain types (formal specification)
type PlaceOrderCommand = {
  kind: "PlaceOrderCommand";
  restaurantId: string;
  orderId: string;
  menuItems: MenuItem[];
};

type RestaurantOrderPlacedEvent = {
  kind: "RestaurantOrderPlacedEvent";
  restaurantId: string;
  orderId: string;
  menuItems: MenuItem[];
  tagFields: ["restaurantId", "orderId"];
};

// 2. Write specifications (executable requirements)
Deno.test("Place Order - Success", () => {
  DeciderEventSourcedSpec.for(placeOrderDecider)
    .given([
      {
        kind: "RestaurantCreatedEvent",
        restaurantId: "restaurant-1",
        name: "Italian Bistro",
        menu: testMenu,
        tagFields: ["restaurantId"],
      },
    ])
    .when({
      kind: "PlaceOrderCommand",
      restaurantId: "restaurant-1",
      orderId: "order-1",
      menuItems: testMenuItems,
    })
    .then([
      {
        kind: "RestaurantOrderPlacedEvent",
        restaurantId: "restaurant-1",
        orderId: "order-1",
        menuItems: testMenuItems,
        tagFields: ["restaurantId", "orderId"],
      },
    ]);
});

Deno.test("Place Order - Restaurant Not Found", () => {
  DeciderEventSourcedSpec.for(placeOrderDecider)
    .given([]) // No events = restaurant doesn't exist
    .when(placeOrderCommand)
    .thenThrows((error) => error instanceof RestaurantNotFoundError);
});

Deno.test("Place Order - Order Already Exists", () => {
  DeciderEventSourcedSpec.for(placeOrderDecider)
    .given([
      restaurantCreatedEvent,
      restaurantOrderPlacedEvent, // Order already placed
    ])
    .when(placeOrderCommand) // Try to place same order again
    .thenThrows((error) => error instanceof OrderAlreadyExistsError);
});

// 3. Implement decider to satisfy specifications
const placeOrderDecider: IDcbDecider<
  PlaceOrderCommand,
  PlaceOrderState,
  RestaurantEvent | OrderEvent,
  RestaurantOrderPlacedEvent
> = {
  decide: (command, state) => {
    // Implementation guided by specifications
    if (!state.restaurant) {
      throw new RestaurantNotFoundError(command.restaurantId);
    }
    if (state.orderExists) {
      throw new OrderAlreadyExistsError(command.orderId);
    }
    // ... validate menu items, etc.
    return [{
      kind: "RestaurantOrderPlacedEvent",
      restaurantId: command.restaurantId,
      orderId: command.orderId,
      menuItems: command.menuItems,
      tagFields: ["restaurantId", "orderId"],
    }];
  },
  evolve: (state, event) => {
    // Implementation guided by specifications
    // ...
  },
  initialState: { restaurant: null, orderExists: false },
};

// 4. Run tests to verify specifications are met
// deno test placeOrderDecider_test.ts
```

### Benefits of Given-When-Then Specifications

**1. Executable Documentation**

- Specifications never go stale
- Always reflect actual behavior
- Self-documenting through examples

**2. Specification by Example**

- Concrete examples clarify abstract requirements
- Edge cases explicitly documented
- Error conditions formally specified

**3. AI-Friendly Format**

- Clear input/output examples
- Explicit error conditions
- Type-safe specifications

**4. Refactoring Safety**

- Specifications remain stable during refactoring
- Breaking changes immediately visible
- Regression prevention

**5. Living Requirements**

- Business rules encoded as tests
- Stakeholders can read specifications
- Requirements and implementation stay in sync

### 1. Start with Type-Level Specification

Define your domain using the library's type hierarchy:

```typescript
// Formal spec: Commands
type OrderCommand =
  | PlaceOrderCommand
  | MarkOrderAsPreparedCommand;

// Formal spec: Events
type OrderEvent =
  | RestaurantOrderPlacedEvent
  | OrderMarkedAsPreparedEvent;

// Formal spec: State
type OrderState = Order | null;

// Formal spec: Decider contract
const orderDecider: IDcbDecider<
  OrderCommand,
  OrderState,
  OrderEvent,
  OrderEvent
>;
```

### 2. Add Informal Specification Layer

Layer human-readable specs on top:

```typescript
/**
 * # Place Order Use Case
 * 
 * ## Business Rules
 * - Restaurant must exist and be active
 * - All menu items must be available
 * - Order ID must be unique
 * 
 * ## Consistency Boundary
 * - Reads: Restaurant state (created, menu)
 * - Writes: Order state (placed)
 * 
 * ## Events Produced
 * - RestaurantOrderPlacedEvent
 */
const placeOrderDecider: IDcbDecider<
  PlaceOrderCommand,
  PlaceOrderState,
  RestaurantEvent | OrderEvent,
  RestaurantOrderPlacedEvent
> = // implementation
```

### 3. AI-Assisted Implementation

The formal type specification guides AI tools to:

- Generate type-correct implementations
- Respect consistency boundaries
- Follow computation patterns
- Maintain purity guarantees

Example AI prompt:

```
Implement a placeOrderDecider that satisfies IDcbDecider<
  PlaceOrderCommand,
  PlaceOrderState,
  RestaurantEvent | OrderEvent,
  RestaurantOrderPlacedEvent
>

Business rules:
- Validate restaurant exists
- Check menu items availability
- Ensure order ID uniqueness
```

The type system constrains the AI to generate valid implementations.

### 4. Verification Through Types

The type system provides compile-time verification:

```typescript
// ✅ Type-safe: Compiler verifies this is valid
const handler = new EventSourcedCommandHandler(
  placeOrderDecider, // IDcbDecider (implements EventComputation)
  repository, // IEventRepository
);

// ❌ Type error: StateStoredCommandHandler requires StateComputation
const invalidHandler = new StateStoredCommandHandler(
  placeOrderDecider, // IDcbDecider doesn't implement StateComputation
  stateRepository,
);
```

## Benefits for AI-Assisted Development

### 1. Constrained Generation Space

Formal types reduce the space of possible implementations:

- AI can't generate invalid state transitions
- Type system catches errors before runtime
- Fewer hallucinations due to clear contracts

### 2. Compositional Specifications

Types compose to form larger specifications:

```typescript
// Compose specifications
const allDecider = createRestaurantDecider
  .combineViaTuples(changeMenuDecider)
  .combineViaTuples(placeOrderDecider)
  .combineViaTuples(markOrderAsPreparedDecider);

// Result: Combined formal specification
// Type: IDcbDecider<Command, State, Event, Event>
```

### 3. Refactoring Safety

Type system enables safe refactoring:

- Change consistency boundaries → compiler shows impact
- Modify event types → all consumers must update
- Refine types → invalid code won't compile

### 4. Documentation as Code

Types serve as always-up-to-date documentation:

```typescript
// Self-documenting: Types tell the story
export const placeOrderRepository = (kv: Deno.Kv) =>
  new DenoKvEventRepository<
    PlaceOrderCommand, // What commands?
    RestaurantEvent | OrderEvent, // What events to load?
    RestaurantOrderPlacedEvent // What events to produce?
  >(
    kv,
    (cmd) => [ // How to query?
      ["restaurantId:" + cmd.restaurantId, "RestaurantCreatedEvent"],
      ["restaurantId:" + cmd.restaurantId, "RestaurantMenuChangedEvent"],
      ["orderId:" + cmd.orderId, "RestaurantOrderPlacedEvent"],
    ],
  );
```

## Layering Informal Specs

### Kiro Spec Files

Use Kiro's spec feature to layer informal specifications:

```markdown
# Place Order Feature

## Formal Specification

- Decider:
  `IDcbDecider<PlaceOrderCommand, PlaceOrderState, RestaurantEvent | OrderEvent, RestaurantOrderPlacedEvent>`
- Repository: Event-sourced with tuple-based queries
- Handler: `EventSourcedCommandHandler`

## Business Requirements

1. Customer can place order at active restaurant
2. All menu items must be currently available
3. Order total calculated from menu prices
4. Order ID must be globally unique

## Consistency Boundary

- **Reads**: Restaurant (created, menu changed)
- **Writes**: Order (placed)

## Implementation Tasks

- [ ] Define PlaceOrderCommand type
- [ ] Define PlaceOrderState type
- [ ] Implement decide() logic
- [ ] Implement evolve() logic
- [ ] Create repository with query tuples
- [ ] Write Given-When-Then tests
```

### File References in Specs

Reference formal specifications directly:

```markdown
See formal type specification: #[[file:demo/dcb/api.ts]] See repository
implementation: #[[file:demo/dcb/placeOrderRepository.ts]]
```

## Best Practices

### 1. Start with Types

Define types before implementation:

```typescript
// Step 1: Define formal specification
type Command = /* ... */;
type Event = /* ... */;
type State = /* ... */;
const decider: IDcbDecider<Command, State, Event, Event>;

// Step 2: Add informal spec (comments, docs)
// Step 3: Implement with AI assistance
// Step 4: Verify with tests
```

### 2. Use Type Hierarchy Intentionally

Choose the right abstraction level:

- `Decider` → Maximum flexibility, minimal constraints
- `DcbDecider` → Event-sourced, dynamic boundaries
- `AggregateDecider` → Traditional DDD, both computation modes

### 3. Leverage Repository Patterns

Repository types encode infrastructure specifications:

```typescript
// Formal spec: This decider is event-sourced
const repo: IEventRepository<C, Ei, Eo, CM, EM>;

// Formal spec: This decider is state-stored
const repo: IStateRepository<C, S, CM, SM>;
```

### 4. Test Specifications with Given-When-Then DSL

**CRITICAL**: The Given-When-Then DSL is the executable specification format
that verifies your domain logic. It's not just testing - it's specification by
example.

Use the DSL to specify and verify behavior:

```typescript
// Event-sourced specification
DeciderEventSourcedSpec.for(placeOrderDecider)
  .given([
    restaurantCreatedEvent,
    restaurantMenuChangedEvent,
  ])
  .when(placeOrderCommand)
  .then([restaurantOrderPlacedEvent]);

// State-stored specification
DeciderStateStoredSpec.for(orderDecider)
  .given({ status: "Pending" })
  .when({ type: "ShipOrder" })
  .then({ status: "Shipped" });

// View/Projection specification
ViewSpecification.for(restaurantView)
  .given([restaurantCreated, menuChanged])
  .then(expectedRestaurantState);

// Error case specification
DeciderEventSourcedSpec.for(placeOrderDecider)
  .given([])
  .when(placeOrderCommand)
  .thenThrows((error) => error instanceof RestaurantNotFoundError);
```

## Integration with AI Development Tools

### Kiro AI Assistant

The formal specifications guide Kiro's AI:

1. **Context Understanding**: Types provide precise context
2. **Code Generation**: AI generates type-correct implementations
3. **Refactoring**: AI respects type constraints during refactoring
4. **Testing**: AI generates tests that verify specifications

### Example AI Workflow

```
User: "Implement a decider for changing restaurant menu"

Kiro: 
1. Analyzes type hierarchy (sees IDcbDecider pattern)
2. Examines existing deciders (learns patterns)
3. Generates type-correct implementation
4. Creates repository with query tuples
5. Writes Given-When-Then tests
6. Verifies compilation and test passage
```

## Conclusion

fmodel-decider transforms domain modeling from informal art to formal science:

- **Type system** = Formal specification language
- **Progressive refinement** = Specification evolution
- **Computation patterns** = Executable contracts
- **Repository interfaces** = Infrastructure specifications
- **AI assistance** = Specification-guided generation

This approach bridges the gap between "vibing" (informal requirements) and
"viable" (production-ready implementations) by providing a formal foundation
that both humans and AI can reason about.

## Event Model Skills

Two Kiro skills bridge the gap between visual event models and working code:

- **map-event-model-to-code** — Takes a visual Event Model diagram (image, Miro
  board, or screenshot) and produces a Markdown table with cell references and
  formulas, then generates TypeScript `DcbDecider` and `Projection` source files
  from that table. Use when starting from a domain modeling session and you want
  working code.

- **map-code-to-event-model** — Reads existing `DcbDecider` and `Projection`
  source files and extracts commands, events, and projections into a
  spreadsheet-style Markdown table with a Mermaid diagram and Given/When/Then
  specifications. Use when you want to visualize or document the event model
  from existing code.

These skills close the loop between design and implementation: model visually →
generate code → evolve code → regenerate the model.

## Further Reading

- Progressive Type Refinement Philosophy (product.md)
- Application Layer & Repository Patterns (application.md)
- Project Structure (structure.md)
- Kiro Spec Documentation (Kiro features)
