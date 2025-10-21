# fmodel-decider

TypeScript library for modeling deciders in domain-driven, event-sourced, or
state-stored architectures with progressive type refinement.

```ts
// Decider Hierarchy
interface IDecider<C, Si, So, Ei, Eo> {
  readonly decide: (command: C, state: Si) => readonly Eo[];
  readonly evolve: (state: Si, event: Ei) => So;
  readonly initialState: So;
}

export interface IDcbDecider<C, S, Ei, Eo> extends IDecider<C, S, S, Ei, Eo> {
  computeNewEvents(events: readonly Ei[], command: C): readonly Eo[];
}

export interface IAggregateDecider<C, S, E> extends IDcbDecider<C, S, E, E> {
  computeNewState(state: S, command: C): S;
}

// Process Manager Hierarchy
interface IProcess<AR, Si, So, Ei, Eo, A> extends IDecider<AR, Si, So, Ei, Eo> {
  readonly react: (state: Si, event: Ei) => readonly A[];
  readonly pending: (state: Si) => readonly A[];
}

export interface IDcbProcess<AR, S, Ei, Eo, A>
  extends IDcbDecider<AR, S, Ei, Eo> {
  readonly react: (state: S, event: Ei) => readonly A[];
  readonly pending: (state: S) => readonly A[];
}

export interface IAggregateProcess<AR, S, E, A>
  extends IDcbProcess<AR, S, E, E, A>, IAggregateDecider<AR, S, E> {
}
```

## What is a Decider?

A Decider is a pure functional component that:

- Decides which events to emit given a command and current state
- Evolves state when given an event
- Defines an initial state

This pattern separates decision logic from state mutation, improving testability
and reasoning about behavior.

## What is a Process Manager?

A Process Manager extends a Decider with orchestration capabilities, acting as a
smart ToDo list:

- **Decides** which events to emit given an action result and current state
- **Evolves** state when given an event
- **Reacts** to events by determining which actions become ready to execute
- **Maintains** a complete ToDo list of all possible pending actions

Process Managers coordinate long-running business processes and manage complex
workflows.

## Progressive Type Refinement

Each refinement step increases capability and constraint:

| Class                        | Type constraint              | Adds method(s)                        | Computation mode            |
| ---------------------------- | ---------------------------- | ------------------------------------- | --------------------------- |
| `Decider<C, Si, So, Ei, Eo>` | all independent              | none                                  | generic                     |
| `DcbDecider<C, S, Ei, Eo>`   | `Si = So = S`                | `computeNewEvents`                    | event-sourced               |
| `AggregateDecider<C, S, E>`  | `Si = So = S`, `Ei = Eo = E` | `computeNewEvents`, `computeNewState` | event-sourced, state-stored |

### Process Managers

Process managers follow the same progressive refinement pattern as Deciders:

| Class                            | Type constraint              | Adds method(s)                                            | Computation mode            |
| -------------------------------- | ---------------------------- | --------------------------------------------------------- | --------------------------- |
| `Process<AR, Si, So, Ei, Eo, A>` | all independent              | `react`, `pending`                                        | generic                     |
| `DcbProcess<AR, S, Ei, Eo, A>`   | `Si = So = S`                | `react`, `pending`, `computeNewEvents`                    | event-sourced               |
| `AggregateProcess<AR, S, E, A>`  | `Si = So = S`, `Ei = Eo = E` | `react`, `pending`, `computeNewEvents`, `computeNewState` | event-sourced, state-stored |

## Key Differences

### Deciders

| Concept                       | `DcbDecider`           | `AggregateDecider`             |
| ----------------------------- | ---------------------- | ------------------------------ |
| **Event-sourced computation** | ✅ Supported           | ✅ Supported                   |
| **Event type symmetry**       | ❌ Not required        | ✅ Required (Ei = Eo)          |
| **State-stored computation**  | ❌ Not possible        | ✅ Supported                   |
| **Use case**                  | Cross-concept boundary | Single-concept / DDD Aggregate |

### Process Managers

| Concept                       | `DcbProcess`           | `AggregateProcess`             |
| ----------------------------- | ---------------------- | ------------------------------ |
| **Event-sourced computation** | ✅ Supported           | ✅ Supported                   |
| **Event type symmetry**       | ❌ Not required        | ✅ Required (Ei = Eo)          |
| **State-stored computation**  | ❌ Not possible        | ✅ Supported                   |
| **Process orchestration**     | ✅ Supported           | ✅ Supported                   |
| **Use case**                  | Cross-concept boundary | Single-concept / DDD Aggregate |

## Testing

The library provides Given-When-Then test specifications:

### Decider Testing

| Spec name                 | Purpose                     | Works with                       |
| ------------------------- | --------------------------- | -------------------------------- |
| `DeciderEventSourcedSpec` | Test event-sourced deciders | `DcbDecider`, `AggregateDecider` |
| `DeciderStateStoredSpec`  | Test state-stored deciders  | `AggregateDecider`               |

### Process Manager Testing

| Spec name                 | Purpose                      | Works with                       |
| ------------------------- | ---------------------------- | -------------------------------- |
| `ProcessEventSourcedSpec` | Test event-sourced processes | `DcbProcess`, `AggregateProcess` |
| `ProcessStateStoredSpec`  | Test state-stored processes  | `AggregateProcess`               |

## Process Management

Process Managers act as smart ToDo lists for long-running business processes,
following the same progressive refinement pattern as Deciders:

### Core Capabilities

- **Complete ToDo List**: `pending(state)` returns all actions that could be
  executed
- **Ready Actions**: `react(state, event)` returns actions that an event makes
  ready (subset of pending)
- **State Management**: Maintains internal state to track process progress
- **Event Sourcing**: Supports both event-sourced and state-stored computation

### Progressive Refinement

Each Process Manager refinement adds constraints and capabilities:

- **`Process<AR, Si, So, Ei, Eo, A>`**: Maximum flexibility for cross-concept
  scenarios
- **`DcbProcess<AR, S, Ei, Eo, A>`**: Event-sourced computation with state
  constraint (`Si = So = S`)
- **`AggregateProcess<AR, S, E, A>`**: Full aggregate capabilities with dual
  constraints (`Si = So = S`, `Ei = Eo = E`)

### Usage Patterns

**Event-Driven Processing**:

```ts
const readyActions = process.react(currentState, incomingEvent);
await executeActions(readyActions);
```

**Batch Processing**:

```ts
const allPendingActions = process.pending(currentState);
await executeActions(allPendingActions);
```

**Event-Sourced Computation**:

```ts
const newEvents = process.computeNewEvents(eventHistory, actionResult);
await appendToEventStream(newEvents);
```

**State-Stored Computation** (AggregateProcess only):

```ts
const newState = process.computeNewState(currentState, actionResult);
await saveState(newState);
```

## Development

```bash
deno task dev
```

## Publish to JSR (dry run)

```bash
deno publish --dry-run
```

---

Created with :heart: by [Fraktalio](https://fraktalio.com/)

Excited to launch your next IT project with us? Let's get started! Reach out to
our team at `info@fraktalio.com` to begin the journey to success.
