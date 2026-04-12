# Product Overview

fmodel-decider is a TypeScript library for functional domain modeling in event-sourced and state-stored architectures. It provides composable building blocks for implementing domain-driven design patterns with progressive type refinement.

## Core Concepts

The library implements four main abstractions:

- **Deciders**: Pure functional command handlers that decide which events to emit and evolve state
- **Views/Projections**: Event-sourced read models that build state from event streams
- **Process Managers**: Orchestration components that coordinate long-running workflows and manage action sequences
- **Workflow Processes**: Specialized process managers with task-based workflow state management

## Progressive Type Refinement Philosophy

The library demonstrates how to evolve from general, flexible types to specific, constrained types that better represent real-world information systems. Starting with the most generic interfaces that support all possible type combinations, we progressively add constraints that:

- **Increase semantic meaning** - Each refinement step adds domain-specific behavior
- **Reduce complexity** - Constraints eliminate impossible states and invalid operations
- **Improve usability** - More specific types provide better APIs and clearer intent
- **Enable optimizations** - Constraints allow for more efficient implementations

Type hierarchies:
- `Decider` → `DcbDecider` → `AggregateDecider` (increasing constraints, adding capabilities)
- `View` → `Projection` (constraining state transformation)
- `Process` → `DcbProcess` → `AggregateProcess` (adding orchestration)
- `WorkflowProcess` → `DcbWorkflowProcess` → `AggregateWorkflowProcess` (task-based workflows)

## Computation Patterns

Two fundamental computation patterns underpin the library:

- **EventComputation**: Event-sourced computation via `computeNewEvents()` - replays events to compute new events
- **StateComputation**: State-stored computation via `computeNewState()` - directly computes new state

## Application Layer

The application layer bridges pure domain logic with infrastructure concerns:

- **Metadata Isolation**: Domain logic remains pure and metadata-free; metadata (correlation IDs, timestamps, versions) is added at the application boundary
- **Command Handlers**: Bridge pattern connecting deciders with repositories
- **Event Handlers**: Bridge pattern connecting views with view state repositories
- **Repository Interfaces**: Based on computation patterns (EventComputation, StateComputation)

## Deno KV Event-Sourced Repository

Production-ready event-sourced repository implementation with:

- **Primary storage with secondary tag indexes**: Events stored once, indexed by type and configurable tags
- **Tuple-based query pattern**: Load events using `[...tags, eventType]` tuples for flexible querying
- **Type-safe tag-based indexing**: Events declare which fields to index via `tagFields` property
- **Tag subset generation**: Automatically generates all tag subset combinations (2^n - 1 indexes per event)
- **Optimistic locking with automatic retry**: Versionstamp-based concurrency control
- **Framework-like capabilities**: Complete infrastructure with type safety, metadata handling, and error handling

## Architectural Patterns

Two demo implementations showcase different consistency boundary approaches:

- **Aggregate Pattern** (`demo/aggregate/`): Traditional DDD aggregates with strong consistency boundaries per entity, supports both event-sourced and state-stored computation
- **DCB Pattern** (`demo/dcb/`): Dynamic consistency boundaries defined per use case, composable via tuples, event-sourced only

### DCB Repository Approaches

The DCB pattern supports two valid repository organization strategies:

- **Sliced Approach (Recommended)**: Each use case has its own repository - aligns with vertical slice architecture, clearer boundaries, easier to maintain
- **Combined Approach**: Single repository handles all commands - simpler for small domains, acceptable when use cases are tightly coupled

## Educational Purpose

The library serves as both a practical toolkit and educational resource for understanding functional domain modeling, event sourcing, progressive type refinement, and production-ready event-sourced infrastructure in TypeScript.
