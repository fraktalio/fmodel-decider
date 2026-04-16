# Given-When-Then Testing

## Overview

The Given-When-Then DSL is the **executable specification format** for
fmodel-decider. It's not just testing - it's specification by example that
serves as living documentation, formal requirements, and verification all in
one.

## Philosophy

**Tests are specifications.** Each test formally specifies:

- What the system should do (happy paths)
- What the system should reject (error cases)
- How state evolves over time (event sequences)
- Business rules and invariants (validation logic)

## Three Specification Formats

### 1. Event-Sourced Decider Specification

**Purpose:** Specify behavior of deciders that compute new events from event
history and commands.

**Compatible with:**

- `IDcbDecider<C, S, Ei, Eo>` - Dynamic consistency boundaries
- `IAggregateDecider<C, S, E>` - Traditional aggregates (event-sourced mode)

**Format:**

```typescript
DeciderEventSourcedSpec.for(decider)
  .given([events]) // Event history (past)
  .when(command) // Command (intent)
  .then([events]); // New events (outcome)
```

**Example:**

```typescript
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
```

**Semantics:**

- `given`: Establishes the event history that forms current state
- `when`: Represents user intent or external trigger
- `then`: Specifies which events should be produced

### 2. State-Stored Decider Specification

**Purpose:** Specify behavior of aggregates that compute new state directly from
current state and commands.

**Compatible with:**

- `IAggregateDecider<C, S, E>` only (state-stored mode)

**Format:**

```typescript
DeciderStateStoredSpec.for(decider)
  .given(state) // Current state
  .when(command) // Command (intent)
  .then(state); // New state (outcome)
```

**Example:**

```typescript
Deno.test("Ship Order - Success", () => {
  DeciderStateStoredSpec.for(orderDecider)
    .given({
      orderId: "order-1",
      status: "Pending",
      items: testItems,
    })
    .when({
      kind: "ShipOrderCommand",
      orderId: "order-1",
    })
    .then({
      orderId: "order-1",
      status: "Shipped",
      items: testItems,
    });
});
```

**Semantics:**

- `given`: Current aggregate state
- `when`: Command to process
- `then`: Expected state after processing

### 3. View/Projection Specification

**Purpose:** Specify how views build state from event streams.

**Compatible with:**

- `IProjection<S, E>` - Event-sourced projections

**Format:**

```typescript
ViewSpecification.for(view)
  .given([events]) // Event stream
  .then(state); // Projected state
```

**Example:**

```typescript
Deno.test("Restaurant View - Build State from Events", () => {
  ViewSpecification.for(restaurantView)
    .given([
      {
        kind: "RestaurantCreatedEvent",
        restaurantId: "restaurant-1",
        name: "Italian Bistro",
        menu: testMenu,
      },
      {
        kind: "RestaurantMenuChangedEvent",
        restaurantId: "restaurant-1",
        menu: newMenu,
      },
    ])
    .then({
      restaurantId: "restaurant-1",
      name: "Italian Bistro",
      menu: newMenu, // Latest menu
    });
});
```

**Semantics:**

- `given`: Event stream to process in order
- `then`: Expected view state after processing all events

## Error Case Specifications

All three formats support error specifications using `thenThrows`:

### Event-Sourced Error Specification

```typescript
Deno.test("Place Order - Restaurant Not Found", () => {
  DeciderEventSourcedSpec.for(placeOrderDecider)
    .given([]) // No events = restaurant doesn't exist
    .when({
      kind: "PlaceOrderCommand",
      restaurantId: "restaurant-1",
      orderId: "order-1",
      menuItems: testMenuItems,
    })
    .thenThrows((error) => error instanceof RestaurantNotFoundError);
});

Deno.test("Place Order - Order Already Exists", () => {
  DeciderEventSourcedSpec.for(placeOrderDecider)
    .given([
      restaurantCreatedEvent,
      restaurantOrderPlacedEvent, // Order already exists
    ])
    .when(placeOrderCommand) // Try to place same order
    .thenThrows((error) => error instanceof OrderAlreadyExistsError);
});

Deno.test("Place Order - Invalid Menu Items", () => {
  DeciderEventSourcedSpec.for(placeOrderDecider)
    .given([restaurantCreatedEvent])
    .when(placeOrderCommandWithInvalidItems)
    .thenThrows((error) => error instanceof MenuItemsNotAvailableError);
});
```

### State-Stored Error Specification

```typescript
Deno.test("Ship Order - Already Shipped", () => {
  DeciderStateStoredSpec.for(orderDecider)
    .given({ status: "Shipped" })
    .when({ kind: "ShipOrderCommand" })
    .thenThrows((error) => error instanceof OrderAlreadyShippedError);
});
```

### View Error Specification

```typescript
Deno.test("Restaurant View - Invalid Event", () => {
  ViewSpecification.for(restaurantView)
    .given([invalidEvent])
    .thenThrows((error) => error.message.includes("Invalid event"));
});
```

## Specification-First Development Workflow

### Step 1: Write Specifications Before Implementation

```typescript
// Define what should happen (specification)
Deno.test("Place Order - Success", () => {
  DeciderEventSourcedSpec.for(placeOrderDecider)
    .given([restaurantCreatedEvent])
    .when(placeOrderCommand)
    .then([restaurantOrderPlacedEvent]);
});

// Define error cases (specification)
Deno.test("Place Order - Restaurant Not Found", () => {
  DeciderEventSourcedSpec.for(placeOrderDecider)
    .given([])
    .when(placeOrderCommand)
    .thenThrows((error) => error instanceof RestaurantNotFoundError);
});
```

### Step 2: Implement to Satisfy Specifications

```typescript
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
    // ... rest of implementation
  },
  evolve: (state, event) => {
    // ... implementation
  },
  initialState: { restaurant: null, orderExists: false },
};
```

### Step 3: Run Tests to Verify

```bash
deno test placeOrderDecider_test.ts
```

## Test Organization Patterns

### Pattern 1: One Test File Per Decider

```
placeOrderDecider.ts
placeOrderDecider_test.ts
```

### Pattern 2: Group Related Tests

```typescript
// Happy path tests
Deno.test("Place Order - Success", () => {/* ... */});
Deno.test("Place Order - After Menu Change", () => {/* ... */});

// Error case tests
Deno.test("Place Order - Restaurant Not Found", () => {/* ... */});
Deno.test("Place Order - Order Already Exists", () => {/* ... */});
Deno.test("Place Order - Invalid Menu Items", () => {/* ... */});
```

### Pattern 3: Test Data Setup

```typescript
// Reusable test data
const testMenu: RestaurantMenu = {
  menuId: "menu-1",
  cuisine: "ITALIAN",
  menuItems: [
    { menuItemId: "item-1", name: "Pizza", price: "10.00" },
    { menuItemId: "item-2", name: "Pasta", price: "12.00" },
  ],
};

const testMenuItems: MenuItem[] = [
  { menuItemId: "item-1", name: "Pizza", price: "10.00" },
];

// Use in tests
Deno.test("Place Order - Success", () => {
  DeciderEventSourcedSpec.for(placeOrderDecider)
    .given([createRestaurantEvent(testMenu)])
    .when(createPlaceOrderCommand(testMenuItems))
    .then([createOrderPlacedEvent(testMenuItems)]);
});
```

## Benefits of Given-When-Then Specifications

### 1. Executable Documentation

Specifications are always up-to-date:

- Tests run on every change
- Failing tests indicate outdated documentation
- Examples show actual usage

### 2. Specification by Example

Concrete examples clarify abstract requirements:

- "Given a restaurant exists" is clearer than "restaurant must be valid"
- "Then RestaurantNotFoundError" is clearer than "validation required"
- Edge cases explicitly documented

### 3. Living Requirements

Business rules encoded as tests:

- Stakeholders can read specifications
- Requirements and implementation stay in sync
- Changes to requirements immediately visible in tests

### 4. AI-Friendly Format

Clear input/output examples guide AI:

- AI can generate implementations from specifications
- Type system constrains AI to valid implementations
- Specifications reduce hallucinations

### 5. Refactoring Safety

Specifications remain stable:

- Refactor implementation without changing tests
- Breaking changes immediately visible
- Regression prevention

### 6. Progressive Refinement

Add specifications incrementally:

- Start with happy path
- Add error cases
- Add edge cases
- Refine as requirements clarify

## Best Practices

### 1. Write Specifications First

Define behavior before implementation:

```typescript
// ✅ Good: Specification first
Deno.test("Place Order - Success", () => {
  DeciderEventSourcedSpec.for(placeOrderDecider)
    .given([restaurantCreatedEvent])
    .when(placeOrderCommand)
    .then([restaurantOrderPlacedEvent]);
});

// Then implement to satisfy specification
```

### 2. One Assertion Per Test

Keep tests focused:

```typescript
// ✅ Good: Single concern
Deno.test("Place Order - Success", () => {/* ... */});
Deno.test("Place Order - Restaurant Not Found", () => {/* ... */});

// ❌ Bad: Multiple concerns
Deno.test("Place Order - All Cases", () => {
  // Test success case
  // Test error case
  // Test edge case
});
```

### 3. Descriptive Test Names

Test names should read like specifications:

```typescript
// ✅ Good: Clear intent
Deno.test("Place Order - Success", () => {/* ... */});
Deno.test("Place Order - Restaurant Not Found", () => {/* ... */});
Deno.test("Place Order - Order Already Exists", () => {/* ... */});

// ❌ Bad: Unclear intent
Deno.test("test1", () => {/* ... */});
Deno.test("placeOrder", () => {/* ... */});
```

### 4. Arrange-Act-Assert Pattern

Structure tests clearly:

```typescript
Deno.test("Place Order - Success", () => {
  // Arrange: Set up test data
  const command = createPlaceOrderCommand();
  const events = [createRestaurantEvent()];

  // Act & Assert: Use DSL
  DeciderEventSourcedSpec.for(placeOrderDecider)
    .given(events)
    .when(command)
    .then([createOrderPlacedEvent()]);
});
```

### 5. Test Error Cases Explicitly

Don't just test happy paths:

```typescript
// ✅ Good: Explicit error testing
Deno.test("Place Order - Restaurant Not Found", () => {
  DeciderEventSourcedSpec.for(placeOrderDecider)
    .given([])
    .when(placeOrderCommand)
    .thenThrows((error) => error instanceof RestaurantNotFoundError);
});
```

### 6. Use Type-Safe Test Data

Leverage TypeScript for test data:

```typescript
// ✅ Good: Type-safe test data
const testMenu: RestaurantMenu = {
  menuId: restaurantMenuId("menu-1"),
  cuisine: "ITALIAN",
  menuItems: [
    { menuItemId: menuItemId("item-1"), name: "Pizza", price: "10.00" },
  ],
};

// ❌ Bad: Untyped test data
const testMenu = {
  menuId: "menu-1", // No type safety
  cuisine: "ITALIAN",
  menuItems: [/* ... */],
};
```

## Integration with AI Development

### AI Prompt Pattern

```
Implement a decider that satisfies these specifications:

1. Given [RestaurantCreatedEvent], when PlaceOrderCommand, then [RestaurantOrderPlacedEvent]
2. Given [], when PlaceOrderCommand, then throw RestaurantNotFoundError
3. Given [RestaurantCreatedEvent, RestaurantOrderPlacedEvent], when PlaceOrderCommand with same orderId, then throw OrderAlreadyExistsError
4. Given [RestaurantCreatedEvent], when PlaceOrderCommand with invalid menu items, then throw MenuItemsNotAvailableError

Type signature:
IDcbDecider<PlaceOrderCommand, PlaceOrderState, RestaurantEvent | OrderEvent, RestaurantOrderPlacedEvent>
```

The AI generates implementation that satisfies the formal specifications.

## Running Tests

```bash
# Run all tests
deno test

# Run specific test file
deno test placeOrderDecider_test.ts

# Run tests in watch mode
deno task dev

# Run tests with coverage
deno test --coverage
```

## Conclusion

The Given-When-Then DSL transforms testing from verification to specification:

- **Tests are specifications** - Formal requirements encoded as executable
  examples
- **Specifications guide implementation** - Write tests first, implement to
  satisfy
- **Living documentation** - Always up-to-date, never stale
- **AI-friendly** - Clear examples guide AI code generation
- **Type-safe** - Compile-time verification of specifications

This approach makes domain logic explicit, verifiable, and maintainable.
