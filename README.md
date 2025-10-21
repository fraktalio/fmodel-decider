# fmodel-decider

TypeScript library for modeling deciders in domain-driven, event-sourced, or
state-stored architectures with progressive type refinement.

```ts
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
```

## What is a Decider?

A Decider is a pure functional component that:

- Decides which events to emit given a command and current state
- Evolves state when given an event
- Defines an initial state

This pattern separates decision logic from state mutation, improving testability
and reasoning about behavior.

## Progressive Type Refinement

Each refinement step increases capability and constraint:

| Class                        | Type constraint              | Adds method(s)                        | Computation mode            |
| ---------------------------- | ---------------------------- | ------------------------------------- | --------------------------- |
| `Decider<C, Si, So, Ei, Eo>` | all independent              | none                                  | generic                     |
| `DcbDecider<C, S, Ei, Eo>`   | `Si = So = S`                | `computeNewEvents`                    | event-sourced               |
| `AggregateDecider<C, S, E>`  | `Si = So = S`, `Ei = Eo = E` | `computeNewEvents`, `computeNewState` | event-sourced, state-stored |

### Process Managers

| Class                  | Type constraint            | Adds method(s)     | Use case               |
| ---------------------- | -------------------------- | ------------------ | ---------------------- |
| `Process<AR, S, E, A>` | extends `AggregateDecider` | `react`, `pending` | stateful orchestration |

## Key Differences

| Concept                       | `DcbDecider`           | `AggregateDecider`             |
| ----------------------------- | ---------------------- | ------------------------------ |
| **Event-sourced computation** | ✅ Supported           | ✅ Supported                   |
| **Event type symmetry**       | ❌ Not required        | ✅ Required (Ei = Eo)          |
| **State-stored computation**  | ❌ Not possible        | ✅ Supported                   |
| **Use case**                  | Cross-concept boundary | Single-concept / DDD Aggregate |

## Testing

The library provides Given-When-Then test specifications:

| Spec name                 | Purpose                     | Works with                       |
| ------------------------- | --------------------------- | -------------------------------- |
| `DeciderEventSourcedSpec` | Test event-sourced deciders | `DcbDecider`, `AggregateDecider` |
| `DeciderStateStoredSpec`  | Test state-stored deciders  | `AggregateDecider`               |

## Process Management

The `Process` class acts as a smart ToDo list for long-running business
processes:

- **Complete ToDo List**: `pending(state)` returns all actions that could be
  executed
- **Ready Actions**: `react(state, event)` returns actions that an event makes
  ready (subset of pending)
- **State Management**: Maintains internal state to track process progress
- **Event Sourcing**: Supports both event-sourced and state-stored computation

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
