# Application Layer & Repository Patterns

## Overview

The application layer bridges pure domain logic (deciders, views, processes)
with infrastructure concerns (databases, event stores). Its primary role is to
coordinate execution while introducing metadata at the boundary without
polluting the core domain model.

## Key Design Principle: Metadata Isolation

**Domain layer** remains pure and metadata-free:

```typescript
// Pure business logic - no metadata
const orderDecider: IDcbDecider<
  OrderCommand,
  OrderState,
  OrderEvent,
  OrderEvent
>;
```

**Application layer** introduces metadata at the boundary:

```typescript
// Metadata added here
const handler: EventSourcedCommandHandler<
  OrderCommand,
  OrderEvent,
  OrderEvent,
  CommandMetadata, // ← Metadata introduced
  EventMetadata // ← Metadata introduced
>;
```

## Repository Interfaces

### Event-Sourced Repository

```typescript
interface IEventRepository<C, Ei, Eo, CM, EM> {
  execute(
    command: C & CM, // Command + metadata
    decider: IEventComputation<C, Ei, Eo>, // Pure computation
  ): Promise<readonly (Eo & EM)[]>; // Events + metadata
}
```

### State-Stored Repository

```typescript
interface IStateRepository<C, S, CM, SM> {
  execute(
    command: C & CM, // Command + metadata
    decider: IStateComputation<C, S>, // Pure computation
  ): Promise<S & SM>; // State + metadata
}
```

### View State Repository

```typescript
interface IViewStateRepository<E, S, EM, SM> {
  execute(
    event: E & EM, // Event + metadata
    view: IProjection<S, E>, // Pure projection
  ): Promise<S & SM>; // State + metadata
}
```

## Command Handlers (Bridge Pattern)

### Event-Sourced Command Handler

```typescript
class EventSourcedCommandHandler<C, Ei, Eo, CM, EM> {
  constructor(
    private readonly decider: IEventComputation<C, Ei, Eo>,
    private readonly eventRepository: IEventRepository<C, Ei, Eo, CM, EM>,
  ) {}

  handle(command: C & CM): Promise<readonly (Eo & EM)[]> {
    // Delegates to repository which:
    // 1. Loads event stream
    // 2. Passes events + command to decider
    // 3. Persists new events with metadata
    return this.eventRepository.execute(command, this.decider);
  }
}
```

**Compatible with:**

- `IDcbDecider<C, S, Ei, Eo>` - Dynamic consistency boundaries
- `IAggregateDecider<C, S, E>` - Traditional aggregates

### State-Stored Command Handler

```typescript
class StateStoredCommandHandler<C, S, CM, SM> {
  constructor(
    private readonly decider: IStateComputation<C, S>,
    private readonly stateRepository: IStateRepository<C, S, CM, SM>,
  ) {}

  handle(command: C & CM): Promise<S & SM> {
    // Delegates to repository which:
    // 1. Loads current state
    // 2. Passes state + command to decider
    // 3. Persists new state with metadata
    return this.stateRepository.execute(command, this.decider);
  }
}
```

**Compatible with:**

- `IAggregateDecider<C, S, E>` only (the only built-in StateComputation
  implementation)

## Event Handlers (Read-Side Bridge)

```typescript
class EventHandler<E, S, EM, SM> {
  constructor(
    private readonly view: IProjection<S, E>,
    private readonly viewStateRepository: IViewStateRepository<E, S, EM, SM>,
  ) {}

  handle(event: E & EM): Promise<S & SM> {
    // Delegates to repository which:
    // 1. Loads current view state
    // 2. Passes state + event to view
    // 3. Persists updated state with metadata
    return this.viewStateRepository.execute(event, this.view);
  }
}
```

## Deno KV Event-Sourced Repository

### Architecture

**Primary Storage:**

```
["events", eventId] → full event data
```

**Secondary Tag Indexes:**

```
["events_by_type", eventType, ...tags, eventId] → eventId (pointer)
```

### Tuple-Based Query Pattern

Query format: `[...tags, eventType]`

```typescript
// No tags - load all events of a type
(cmd) => [["RestaurantCreatedEvent"]]

// Single tag - filter by one dimension
(cmd) => [["restaurantId:" + cmd.restaurantId, "RestaurantCreatedEvent"]]

// Multiple tags - filter by multiple dimensions
(cmd) => [[
  "restaurantId:" + cmd.restaurantId,
  "customerId:" + cmd.customerId,
  "OrderPlacedEvent"
]]

// Multiple query tuples for different event types
(cmd) => [
  ["restaurantId:" + cmd.restaurantId, "RestaurantCreatedEvent"],
  ["restaurantId:" + cmd.restaurantId, "RestaurantMenuChangedEvent"],
  ["orderId:" + cmd.orderId, "RestaurantOrderPlacedEvent"]
]
```

### Type-Safe Tag Configuration

Events declare which fields to index via `tagFields`:

```typescript
export type RestaurantCreatedEvent = TypeSafeEventShape<
  {
    readonly kind: "RestaurantCreatedEvent";
    readonly restaurantId: string;
    readonly name: string;
  },
  ["restaurantId"] // ← Only string fields can be tags
>;
```

### Tag Subset Generation

Repository automatically generates all tag subset combinations (2^n - 1 indexes
per event):

| Tag Fields | Index Entries | Formula               |
| ---------- | ------------- | --------------------- |
| 1          | 1             | 2^1 - 1               |
| 2          | 3             | 2^2 - 1               |
| 3          | 7             | 2^3 - 1               |
| 4          | 15            | 2^4 - 1               |
| 5          | 31            | 2^5 - 1 (default max) |

**Trade-off:** Write amplification for O(1) query performance

### Optimistic Locking

- Uses Deno KV versionstamps for conflict detection
- Automatic retry on conflicts (configurable max retries)
- Atomic operations ensure consistency

### Repository Factory Pattern

```typescript
export const placeOrderRepository = (kv: Deno.Kv) =>
  new DenoKvEventRepository<
    PlaceOrderCommand,
    | RestaurantCreatedEvent
    | RestaurantMenuChangedEvent
    | RestaurantOrderPlacedEvent,
    RestaurantOrderPlacedEvent
  >(
    kv,
    (cmd) => [
      ["restaurantId:" + cmd.restaurantId, "RestaurantCreatedEvent"],
      ["restaurantId:" + cmd.restaurantId, "RestaurantMenuChangedEvent"],
      ["orderId:" + cmd.orderId, "RestaurantOrderPlacedEvent"],
    ],
  );
```

## Repository Organization Strategies

### Sliced Approach (Recommended)

Each use case has its own repository:

```typescript
const createRepo = new CreateRestaurantRepository(kv);
const placeOrderRepo = new PlaceOrderRepository(kv);

await createRepo.execute(createRestaurantCommand);
await placeOrderRepo.execute(placeOrderCommand);
```

**Benefits:**

- ✅ Only relevant decider processes each command
- ✅ Simple, focused query patterns per use case
- ✅ Explicit use case boundaries
- ✅ Aligns with vertical slice architecture
- ✅ Easier to understand and maintain
- ✅ Better team organization - teams can own specific slices

**Trade-offs:**

- ⚠️ More repository instances to manage

### Combined Approach

Single repository handles all commands:

```typescript
const repository = new AllDeciderRepository(kv);

await repository.execute(createRestaurantCommand);
await repository.execute(placeOrderCommand);
```

**Benefits:**

- ✅ Simpler application code (one repository instance)
- ✅ Works due to graceful null handling in deciders

**Trade-offs:**

- ⚠️ All deciders process every command (more computation)
- ⚠️ Complex query pattern must handle all use cases in a single place

**When to use:**

- Small domains or prototyping
- All use cases are tightly coupled
- Small teams

## Why This Design Matters

1. **Separation of concerns:** Domain logic stays pure, infrastructure stays
   isolated
2. **Testability:** Test domain logic without infrastructure dependencies
3. **Flexibility:** Swap infrastructure implementations without changing domain
   code
4. **Metadata management:** Correlation IDs, timestamps, versions added at the
   boundary
5. **Type safety:** Compile-time guarantees for command/event/state types
6. **Framework-like capabilities:** Complete infrastructure with minimal
   boilerplate
