# Technology Stack

## Runtime & Package Manager

- **Runtime**: Deno
- **Package Registry**: JSR (JavaScript Registry)
- **Package Name**: `@fraktalio/fmodel-decider`

## Language & Configuration

- **Language**: TypeScript with strict mode enabled
- **Target**: ES2022
- **Compiler Options**: Strict type checking, Deno standard library

## Dependencies

- `@std/assert` (JSR) - Testing assertions

## Common Commands

### Testing
```bash
# Run all tests (includes --unstable-kv for Deno KV support)
deno task test

# Run all tests (alternative, requires explicit --unstable-kv flag)
deno test --unstable-kv

# Run tests in watch mode (development)
deno task dev

# Run specific test file
deno task test path/to/file_test.ts

# Run aggregate demo tests
deno task test demo/aggregate/

# Run DCB demo tests
deno task test demo/dcb/
```

### Publishing
```bash
# Dry run publish to JSR
deno publish --dry-run
```

## File Naming Conventions

- Source files: `filename.ts`
- Test files: `filename_test.ts` (underscore, not dot)
- Module exports: `mod.ts` (main entry point)

## Testing Framework

Uses Deno's built-in test runner with custom Given-When-Then DSL for executable specifications:

### Given-When-Then DSL

The library provides three specification formats:

**Event-Sourced Decider Specification:**
```typescript
DeciderEventSourcedSpec.for(decider)
  .given([events])      // Event history
  .when(command)        // Command to process
  .then([events]);      // Expected new events
```

**State-Stored Decider Specification:**
```typescript
DeciderStateStoredSpec.for(decider)
  .given(state)         // Current state
  .when(command)        // Command to process
  .then(state);         // Expected new state
```

**View/Projection Specification:**
```typescript
ViewSpecification.for(view)
  .given([events])      // Event stream
  .then(state);         // Expected projected state
```

**Error Specifications:**
```typescript
DeciderEventSourcedSpec.for(decider)
  .given([events])
  .when(command)
  .thenThrows((error) => error instanceof DomainError);
```

### Test Organization

- `DeciderEventSourcedSpec` - For event-sourced decider testing (IDcbDecider, IAggregateDecider)
- `DeciderStateStoredSpec` - For state-stored aggregate testing (IAggregateDecider only)
- `ViewSpecification` - For projection/view testing (IProjection)

All test specifications follow the Given-When-Then pattern for clarity and consistency.

### Writing Tests

```typescript
Deno.test("Place Order - Success", () => {
  DeciderEventSourcedSpec.for(placeOrderDecider)
    .given([restaurantCreatedEvent])
    .when(placeOrderCommand)
    .then([restaurantOrderPlacedEvent]);
});

Deno.test("Place Order - Restaurant Not Found", () => {
  DeciderEventSourcedSpec.for(placeOrderDecider)
    .given([])
    .when(placeOrderCommand)
    .thenThrows((error) => error instanceof RestaurantNotFoundError);
});
```
