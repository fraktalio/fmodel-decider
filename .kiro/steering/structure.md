# Project Structure

## Root Level Files

- `mod.ts` - Main module entry point, exports all public APIs
- `decider.ts` - Core decider implementations (Decider, DcbDecider, AggregateDecider)
- `view.ts` - View and projection implementations
- `process.ts` - Process manager implementations
- `process_workflow.ts` - Workflow-specific process managers with task-based state
- `application.ts` - Application layer (command handlers, event handlers, repository interfaces)
- `denoKvRepository.ts` - Production-ready Deno KV event-sourced repository implementation
- `test_specification.ts` - Given-When-Then testing DSL
- `deno.json` - Deno configuration and dependencies

## Test Files

All test files follow the `*_test.ts` naming convention and are co-located with their source files:

- `decider_test.ts`
- `view_test.ts`
- `process_test.ts`
- `process_workflow_test.ts`

## Demo Implementations

### `demo/aggregate/`
Traditional DDD aggregate pattern with strong consistency boundaries:

- `api.ts` - Domain types (commands, events, state)
- `application.ts` - Application orchestration with command handlers
- `restaurantDecider.ts` - Restaurant aggregate logic
- `orderDecider.ts` - Order aggregate logic
- `restaurantOrderWorkflow.ts` - Cross-aggregate workflow coordination
- `restaurantView.ts` / `orderView.ts` - Read model projections
- `*Repository.ts` - Repository implementations for each decider
- Corresponding `*_test.ts` files for each component

**Key characteristics:**
- Entity-centric consistency boundaries (Restaurant, Order)
- Supports both event-sourced and state-stored computation
- Workflow process coordinates between aggregates

### `demo/dcb/`
Dynamic Consistency Boundary pattern with use-case-driven boundaries:

- `api.ts` - Domain types
- `application.ts` - Application orchestration
- `createRestaurantDecider.ts` - Restaurant creation use case
- `changeRestaurantMenuDecider.ts` - Menu update use case
- `placeOrderDecider.ts` - Order placement (spans Restaurant + Order)
- `markOrderAsPreparedDecider.ts` - Order preparation use case
- `all_decider.ts` - Combined decider using `combineViaTuples()`
- `restaurantView.ts` / `orderView.ts` - Read model projections
- `*Repository.ts` - Repository implementations (both sliced and combined approaches)
- `all_deciderRepository.ts` - Combined repository handling all commands
- Corresponding `*_test.ts` files for each component

**Key characteristics:**
- Use-case-centric consistency boundaries (CreateRestaurant, PlaceOrder)
- Event-sourced only
- Flexible boundaries that can span multiple concepts
- Demonstrates both sliced (separate repositories) and combined (single repository) approaches

## Code Organization Principles

- **Pure functions**: All deciders, views, and processes are pure functional components
- **Type safety**: Exhaustive pattern matching using TypeScript's discriminated unions
- **Co-location**: Tests live alongside source files
- **Separation of concerns**: Commands, events, and state types defined in `api.ts`
- **Composition**: Deciders combine via `combine()` or `combineViaTuples()` methods
- **Metadata isolation**: Domain logic remains pure; metadata (IDs, timestamps, versions) added at application boundary
- **Bridge pattern**: Command handlers and event handlers bridge domain logic with infrastructure

## Repository Pattern

### Event-Sourced Repositories

Event-sourced repositories implement `IEventRepository<C, Ei, Eo, CM, EM>`:

- Load events based on query tuples: `[...tags, eventType]`
- Pass events to decider's `computeNewEvents()` method
- Persist new events with metadata (eventId, timestamp, versionstamp)
- Support optimistic locking with automatic retry

### Deno KV Repository Features

- **Primary storage**: `["events", eventId]` → full event data
- **Secondary tag indexes**: `["events_by_type", eventType, ...tags, eventId]` → eventId pointer
- **Tag subset generation**: Automatically creates 2^n - 1 indexes per event for flexible querying
- **Type-safe tag configuration**: Events declare indexable fields via `tagFields` property
- **Tuple-based queries**: Load events using zero or more tags followed by event type

### Repository Organization Strategies

**Sliced Approach (Recommended):**
- Each use case has its own repository
- Aligns with vertical slice architecture
- Clearer boundaries and explicit dependencies
- Easier to understand and maintain

**Combined Approach:**
- Single repository handles all commands
- Simpler for small domains or prototyping
- All deciders process every command (more computation)
- Complex query pattern must handle all use cases
