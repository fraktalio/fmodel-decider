# fmodel-decider

> Progressive type refinement for capability modeling in event-sourced and
> state-stored systems

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
cases.

| Concept                           | `DcbDecider`                                                     | `AggregateDecider`                                                                   |
| --------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Event-sourced computation**     | ✅ Supported                                                     | ✅ Supported                                                                         |
| **Event type symmetry (Ei = Eo)** | ❌ Not required                                                  | ✅ Required                                                                          |
| **State-stored computation**      | ❌ Not possible                                                  | ✅ Supported                                                                         |
| **Use case**                      | Cross-concept, Dynamic Boundary | Aggregate,                                               |
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
