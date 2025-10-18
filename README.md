# fmodel-decider

A small TypeScript library for modeling deciders in domain-driven, event-sourced, or state-stored architectures — with progressive type refinement to express precisely what capabilities each implementation supports.

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

🧠 What is a “Decider”?

In functional and event-sourced architectures, a Decider is the core domain component that:

- Decides which events should be emitted given a command and the current state,
- Evolves the state when given an event,
- Begins from an initial state.

In other words, the decision logic is explicit, pure, and separated from state mutation. This separation improves testability, auditability, and reasoning about behavior.

As Jeremie Chassaing describes in [“Functional Event Sourcing Decider”](https://thinkbeforecoding.com/post/2021/12/17/functional-event-sourcing-decider), this pattern disentangles decision from mutation to surface business logic clearly.

## 🎯 Motivation

The fmodel-decider library provides a progressive refinement model for defining
decision-making components (deciders) in functional domain-driven architectures.

Each refinement step increases capability and constraint - from a completely
generic decision model (`Decider`) to specialized event-sourced (`DcbDecider`)
and aggregate-based (`AggregateDecider`) variants.

## 🧱 Progressive type refinement

| Class                        | Type constraint              | Adds method(s)                        | Computation mode            |
| ---------------------------- | ---------------------------- | ------------------------------------- | --------------------------- |
| `Decider<C, Si, So, Ei, Eo>` | all independent              | none                                  | generic                     |
| `DcbDecider<C, S, Ei, Eo>`   | `Si = So = S`                | `computeNewEvents`                    | event-sourced               |
| `AggregateDecider<C, S, E>`  | `Si = So = S`, `Ei = Eo = E` | `computeNewEvents`, `computeNewState` | event-sourced, state-stored |

## 🔍 Conceptual overview

Both `DcbDecider` and `AggregateDecider` support event-sourced computation, but
they differ in event type symmetry, which defines their expressive power and use
cases:


- `DcbDecider` enables flexible, event-sourced computation in heterogeneous event contexts.
It can consume one event type and emit another, making it ideal for dynamic models that span multiple concepts — effectively operating across a **Dynamic Consistency Boundary (DCB)**.

- `AggregateDecider` operates within a homogeneous event domain, where it consumes and emits the same event type.
This symmetry allows it to also support state-stored computation, which is characteristic of **aggregate roots and other stateful domain entities**.


| Concept                           | `DcbDecider`                                                     | `AggregateDecider`                                                                   |
| --------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Event-sourced computation**     | ✅ Supported                                                     | ✅ Supported (but Limited)                                                                         |
| **Event type symmetry (Ei = Eo)** | ❌ Not required                                                  | ✅ Required                                                                          |
| **State-stored computation**      | ❌ Not possible                                                  | ✅ Supported                                                                         |
| **Use case**                      | Cross-Concept / Dynamic Aggregate | Single-Concept / DDD Aggregate                                               |
| **Interpretation**                | “Given _these_ events, decide _those_ new events.”               | “Given _these_ events, update my state — possibly producing new _same-type_ events.” |

## 🧪 Testing deciders

The library provides test specifications in the Given–When–Then format for both
event-sourced and state-stored deciders.

| Spec name                 | Purpose                                                        | Works with    |
| ------------------------- | -------------------------------------------------------------- | ------------- |
| `DeciderEventSourcedSpec` | Test event-sourced deciders (`DcbDecider`, `AggregateDecider`) | Event-sourced |
| `DeciderStateStoredSpec`  | Test state-stored deciders (`AggregateDecider`)                | State-stored  |

```
deno task dev
```

## Publish to JSR (dry run)

```
deno publish --dry-run
```


---

Created with :heart: by [Fraktalio](https://fraktalio.com/)

Excited to launch your next IT project with us? Let's get started! Reach out to
our team at `info@fraktalio.com` to begin the journey to success.
