# fmodel-decider

TypeScript library for modeling deciders, process managers, and views in
domain-driven, event-sourced, or state-stored architectures with progressive
type refinement.

## Progressive Type Refinement Philosophy

This library demonstrates how to evolve from **general, flexible types** to
**specific, constrained types** that better represent real-world information
systems. Starting with the most generic interfaces that support all possible
type combinations, we progressively add constraints that:

- **Increase semantic meaning** - Each refinement step adds domain-specific
  behavior
- **Reduce complexity** - Constraints eliminate impossible states and invalid
  operations
- **Improve usability** - More specific types provide better APIs and clearer
  intent
- **Enable optimizations** - Constraints allow for more efficient
  implementations

This approach mirrors how we model information systems: beginning with broad
concepts and iteratively refining them into precise, domain-specific
abstractions that capture business rules and invariants.

## Educational Purpose

This library serves as both a **practical toolkit** and an **educational
resource** for understanding:

- **Functional domain modeling** patterns in TypeScript
- **Progressive type refinement** as a design methodology
- **Event-sourced** and **state-stored** computation patterns
- **Process orchestration** and **workflow** management
- **Read-side projections** and view materialization

```ts
// View Hierarchy
export interface IView<Si, So, E> {
  readonly evolve: (state: Si, event: E) => So;
  readonly initialState: So;
}

export interface IProjection<S, E> extends IView<S, S, E> {
}

// Decider Hierarchy
export interface IDecider<C, Si, So, Ei, Eo> extends IView<Si, So, Ei> {
  readonly decide: (command: C, state: Si) => readonly Eo[];
}

export interface IDcbDecider<C, S, Ei, Eo>
  extends IDecider<C, S, S, Ei, Eo>, IProjection<S, Ei> {
  computeNewEvents(events: readonly Ei[], command: C): readonly Eo[];
}

export interface IAggregateDecider<C, S, E> extends IDcbDecider<C, S, E, E> {
  computeNewState(state: S, command: C): S;
}

// Process Manager Hierarchy
export interface IProcess<AR, Si, So, Ei, Eo, A>
  extends IDecider<AR, Si, So, Ei, Eo> {
  readonly react: (state: Si, event: Ei) => readonly A[];
  readonly pending: (state: Si) => readonly A[];
}

export interface IDcbProcess<AR, S, Ei, Eo, A>
  extends IProcess<AR, S, S, Ei, Eo, A>, IDcbDecider<AR, S, Ei, Eo> {
}

export interface IAggregateProcess<AR, S, E, A>
  extends IDcbProcess<AR, S, E, E, A>, IAggregateDecider<AR, S, E> {
}

// Workflow Hierarchy
export interface IWorkflowProcess<AR, A, TaskName extends string = string>
  extends
    IProcess<
      AR,
      WorkflowState<TaskName>,
      WorkflowState<TaskName>,
      WorkflowEvent<TaskName>,
      WorkflowEvent<TaskName>,
      A
    > {
  readonly createTaskStarted: (
    taskName: TaskName,
    metadata?: Record<string, unknown>,
  ) => TaskStarted<TaskName>;

  readonly createTaskCompleted: (
    taskName: TaskName,
    result?: unknown,
    metadata?: Record<string, unknown>,
  ) => TaskCompleted<TaskName>;

  readonly getTaskStatus: (
    state: WorkflowState<TaskName>,
    taskName: TaskName,
  ) => TaskStatus | undefined;

  readonly isTaskStarted: (
    state: WorkflowState<TaskName>,
    taskName: TaskName,
  ) => boolean;

  readonly isTaskCompleted: (
    state: WorkflowState<TaskName>,
    taskName: TaskName,
  ) => boolean;
}

export interface IDcbWorkflowProcess<AR, A, TaskName extends string = string>
  extends
    IWorkflowProcess<AR, A, TaskName>,
    IDcbProcess<
      AR,
      WorkflowState<TaskName>,
      WorkflowEvent<TaskName>,
      WorkflowEvent<TaskName>,
      A
    > {
}

export interface IAggregateWorkflowProcess<
  AR,
  A,
  TaskName extends string = string,
> extends
  IWorkflowProcess<AR, A, TaskName>,
  IAggregateProcess<AR, WorkflowState<TaskName>, WorkflowEvent<TaskName>, A> {
}
```

## What is a View?

A View is a pure functional component that builds up state by processing events:

- **Evolves** state when given an event (read-side projection)
- **Defines** an initial state
- **Supports** independent input and output state types for complex
  transformations

Views are the read-side complement to Deciders, enabling event-sourced
projections and read models.

## What is a Decider?

A Decider is a pure functional component that:

- **Decides** which events to emit given a command and current state
- **Evolves** state when given an event
- **Defines** an initial state

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

### Deciders

| Class                        | Type constraint              | Adds method(s)                        | Computation mode            |
| ---------------------------- | ---------------------------- | ------------------------------------- | --------------------------- |
| `Decider<C, Si, So, Ei, Eo>` | all independent              | none                                  | generic                     |
| `DcbDecider<C, S, Ei, Eo>`   | `Si = So = S`                | `computeNewEvents`                    | event-sourced               |
| `AggregateDecider<C, S, E>`  | `Si = So = S`, `Ei = Eo = E` | `computeNewEvents`, `computeNewState` | event-sourced, state-stored |

### Views

| Class              | Type constraint | Computation mode |
| ------------------ | --------------- | ---------------- |
| `View<Si, So, E>`  | all independent | generic          |
| `Projection<S, E>` | `Si = So = S`   | state-stored     |

### Process Managers

Process managers follow the same progressive refinement pattern as Deciders:

| Class                            | Type constraint              | Adds method(s)                                            | Computation mode            |
| -------------------------------- | ---------------------------- | --------------------------------------------------------- | --------------------------- |
| `Process<AR, Si, So, Ei, Eo, A>` | all independent              | `react`, `pending`                                        | generic                     |
| `DcbProcess<AR, S, Ei, Eo, A>`   | `Si = So = S`                | `react`, `pending`, `computeNewEvents`                    | event-sourced               |
| `AggregateProcess<AR, S, E, A>`  | `Si = So = S`, `Ei = Eo = E` | `react`, `pending`, `computeNewEvents`, `computeNewState` | event-sourced, state-stored |

## Key Differences

### Deciders

| Concept                       | `DcbDecider`           | `AggregateDecider`              |
| ----------------------------- | ---------------------- | ------------------------------- |
| **Event-sourced** | ✅ Supported           | ✔️ Supported (limited: Ei = Eo) |
| **State-stored**  | ❌ Not possible        | ✅ Supported                    |
| **Use case**                  | Cross-concept boundary | Single-concept / DDD Aggregate  |

### Views

| Concept                  | `Projection`                    |
| ------------------------ | ------------------------------- |
| **State transformation** | ✅ Constrained Si = So = S      |
| **Use case**             | Read models / Event projections |

### Process Managers

| Concept                       | `DcbProcess`     | `AggregateProcess`                        |
| ----------------------------- | ---------------- | ----------------------------------------- |
| **Event-sourced** | ✅ Supported     | ✔️ Supported (limited: Ei = Eo)           |
| **State-stored**  | ❌ Not possible  | ✅ Supported                              |
| **Process orchestration**     | ✅ Supported     | ✅ Supported                              |
| **Use case**                  | Unknown, for now | Process manager/Saga/Automation/ToDo List |

## Testing

```bash
deno test
```

## Development

```bash
deno task dev
```

## Publish to JSR (dry run)

```bash
deno publish --dry-run
```

## Credits

Special credits to `Jérémie Chassaing` for sharing his
[research](https://www.youtube.com/watch?v=kgYGMVDHQHs) and `Adam Dymitruk` for
hosting the meetup.

---

Created with :heart: by [Fraktalio](https://fraktalio.com/)

Excited to launch your next IT project with us? Let's get started! Reach out to
our team at `info@fraktalio.com` to begin the journey to success.
