# fmodel-decider

A small TypeScript library for modeling deciders in domain-driven,
event-sourced, or state-stored architectures — with progressive type refinement
to express precisely what capabilities each implementation supports.

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

In functional and event-sourced architectures, a Decider is the core domain
component that:

- Decides which events should be emitted given a command and the current state,
- Evolves the state when given an event,
- Begins from an initial state.

In other words, the decision logic is explicit, pure, and separated from state
mutation. This separation improves testability, auditability, and reasoning
about behavior.

As Jeremie Chassaing describes in
[“Functional Event Sourcing Decider”](https://thinkbeforecoding.com/post/2021/12/17/functional-event-sourcing-decider),
this pattern disentangles decision from mutation to surface business logic
clearly.

## 🎯 Motivation

The fmodel-decider library provides a progressive refinement model for defining
decision-making components (deciders) in functional domain-driven architectures.

Each refinement step increases capability and constraint - from a completely
generic decision model (`Decider`) to specialized event-sourced (`DcbDecider`)
and aggregate-based (`AggregateDecider`) variants.

## 🧱 Progressive type refinement

### Core Deciders

| Class                        | Type constraint              | Adds method(s)                        | Computation mode            |
| ---------------------------- | ---------------------------- | ------------------------------------- | --------------------------- |
| `Decider<C, Si, So, Ei, Eo>` | all independent              | none                                  | generic                     |
| `DcbDecider<C, S, Ei, Eo>`   | `Si = So = S`                | `computeNewEvents`                    | event-sourced               |
| `AggregateDecider<C, S, E>`  | `Si = So = S`, `Ei = Eo = E` | `computeNewEvents`, `computeNewState` | event-sourced, state-stored |

### Process Managers

| Class                  | Type constraint            | Adds method(s)     | Use case               |
| ---------------------- | -------------------------- | ------------------ | ---------------------- |
| `Process<AR, S, E, A>` | extends `AggregateDecider` | `react`, `pending` | stateful orchestration |

## 🔍 Conceptual overview

Both `DcbDecider` and `AggregateDecider` support event-sourced computation, but
they differ in event type symmetry, which defines their expressive power and use
cases:

- `DcbDecider` enables flexible, event-sourced computation in heterogeneous
  event contexts. It can consume one event type and emit another, making it
  ideal for dynamic models that span multiple concepts — effectively operating
  across a **Dynamic Consistency Boundary (DCB)**.

- `AggregateDecider` operates within a homogeneous event domain, where it
  consumes and emits the same event type. This symmetry allows it to also
  support state-stored computation, which is characteristic of **aggregate roots
  and other stateful domain entities**.

| Concept                           | `DcbDecider`                                       | `AggregateDecider`                                                                   |
| --------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Event-sourced computation**     | ✅ Supported                                       | ✅ Supported (but Limited)                                                           |
| **Event type symmetry (Ei = Eo)** | ❌ Not required                                    | ✅ Required                                                                          |
| **State-stored computation**      | ❌ Not possible                                    | ✅ Supported                                                                         |
| **Use case**                      | Cross-Concept / Dynamic Aggregate                  | Single-Concept / DDD Aggregate                                                       |
| **Interpretation**                | “Given _these_ events, decide _those_ new events.” | “Given _these_ events, update my state — possibly producing new _same-type_ events.” |

## 🧪 Testing deciders

The library provides test specifications in the Given–When–Then format for both
event-sourced and state-stored deciders.

| Spec name                 | Purpose                                                        | Works with    |
| ------------------------- | -------------------------------------------------------------- | ------------- |
| `DeciderEventSourcedSpec` | Test event-sourced deciders (`DcbDecider`, `AggregateDecider`) | Event-sourced |
| `DeciderStateStoredSpec`  | Test state-stored deciders (`AggregateDecider`)                | State-stored  |

## 🔄 Process Management

The library also provides process management capabilities for orchestrating
long-running business processes across multiple bounded contexts:

- **`Process<AR, S, E, A>`** - Stateful process manager that combines aggregate
  decision-making with reactive behavior

### Process Manager as ToDo List

The `Process` class acts as a smart ToDo list that manages actions for
long-running business processes:

- **Complete ToDo List**: `pending(state)` returns all actions that could be
  executed
- **Ready Actions**: `react(state, event)` returns actions that an event makes
  ready (subset of pending)
- **State Management**: Maintains internal state to track process progress
- **Event Sourcing**: Supports both event-sourced and state-stored computation

**Key Insight**: `react(state, event)` always returns a subset of
`pending(state)` - only the actions that the specific event makes ready to
execute.

**ToDo List with Checkboxes Model**:

- **Missing from `tasks`**: ☐ Not started (task doesn't exist in state)
- **`"started"`**: ☑️ In progress (task is active and should produce actions)
- **`"finished"`**: ✅ Completed (task is done, no more actions needed)

### Example: Order Fulfillment Process

```ts
import { Process } from "@fraktalio/fmodel-decider";

// Define types for the order fulfillment process
type OrderEvent =
  | {
    type: "OrderCreated";
    orderId: string;
    customerId: string;
    items: string[];
    totalAmount: number;
  }
  | {
    type: "PaymentProcessed";
    orderId: string;
    paymentId: string;
    amount: number;
  }
  | { type: "InventoryReserved"; orderId: string; items: string[] }
  | { type: "ShipmentScheduled"; orderId: string; trackingId: string };

type ProcessState = {
  orderId: string;
  customerId: string;
  items: string[];
  totalAmount: number;
  paymentId?: string;
  trackingId?: string;
  // ToDo list with checkboxes: missing = not started, "started" = in progress, "finished" = completed
  tasks: {
    processPayment?: "started" | "finished";
    reserveInventory?: "started" | "finished";
    scheduleShipment?: "started" | "finished";
    sendConfirmationEmail?: "started" | "finished";
    updateAnalytics?: "started" | "finished";
    notifyCustomer?: "started" | "finished";
  };
};

type ProcessEvent =
  | {
    type: "OrderFulfillmentStarted";
    orderId: string;
    customerId: string;
    items: string[];
    totalAmount: number;
  }
  | { type: "TaskStarted"; orderId: string; taskName: string }
  | { type: "TaskCompleted"; orderId: string; taskName: string; result?: any };

type ProcessAction =
  | {
    type: "ProcessPayment";
    orderId: string;
    customerId: string;
    amount: number;
  }
  | { type: "ReserveInventory"; orderId: string; items: string[] }
  | {
    type: "ScheduleShipment";
    orderId: string;
    customerId: string;
    items: string[];
  }
  | { type: "SendConfirmationEmail"; orderId: string; customerId: string }
  | { type: "UpdateAnalytics"; orderId: string; status: string }
  | {
    type: "NotifyCustomer";
    orderId: string;
    customerId: string;
    message: string;
  };

// Create the order fulfillment process
const orderFulfillmentProcess = new Process<
  OrderEvent,
  ProcessState,
  ProcessEvent,
  ProcessAction
>(
  // Decision logic: OrderEvent + State → ProcessEvent[]
  (orderEvent, state) => {
    switch (orderEvent.type) {
      case "OrderCreated":
        if (state.orderId === "") {
          return [
            {
              type: "OrderFulfillmentStarted",
              orderId: orderEvent.orderId,
              customerId: orderEvent.customerId,
              items: orderEvent.items,
              totalAmount: orderEvent.totalAmount,
            },
            {
              type: "TaskStarted",
              orderId: orderEvent.orderId,
              taskName: "processPayment",
            },
          ];
        }
        break;
      case "PaymentProcessed":
        if (
          state.orderId === orderEvent.orderId &&
          state.tasks.processPayment === "started"
        ) {
          return [
            {
              type: "TaskCompleted",
              orderId: orderEvent.orderId,
              taskName: "processPayment",
              result: { paymentId: orderEvent.paymentId },
            },
            {
              type: "TaskStarted",
              orderId: orderEvent.orderId,
              taskName: "reserveInventory",
            },
            {
              type: "TaskStarted",
              orderId: orderEvent.orderId,
              taskName: "sendConfirmationEmail",
            },
          ];
        }
        break;
      case "InventoryReserved":
        if (
          state.orderId === orderEvent.orderId &&
          state.tasks.reserveInventory === "started"
        ) {
          return [
            {
              type: "TaskCompleted",
              orderId: orderEvent.orderId,
              taskName: "reserveInventory",
            },
            {
              type: "TaskStarted",
              orderId: orderEvent.orderId,
              taskName: "scheduleShipment",
            },
          ];
        }
        break;
      case "ShipmentScheduled":
        if (
          state.orderId === orderEvent.orderId &&
          state.tasks.scheduleShipment === "started"
        ) {
          return [
            {
              type: "TaskCompleted",
              orderId: orderEvent.orderId,
              taskName: "scheduleShipment",
              result: { trackingId: orderEvent.trackingId },
            },
            {
              type: "TaskStarted",
              orderId: orderEvent.orderId,
              taskName: "notifyCustomer",
            },
          ];
        }
        break;
    }
    return [];
  },
  // Evolution logic: State + ProcessEvent → State
  (state, event) => {
    switch (event.type) {
      case "OrderFulfillmentStarted":
        return {
          ...state,
          orderId: event.orderId,
          customerId: event.customerId,
          items: event.items,
          totalAmount: event.totalAmount,
          tasks: { ...state.tasks },
        };
      case "TaskStarted":
        return {
          ...state,
          tasks: { ...state.tasks, [event.taskName]: "started" },
        };
      case "TaskCompleted":
        const updatedState = {
          ...state,
          tasks: { ...state.tasks, [event.taskName]: "finished" },
        };
        // Update specific fields based on task completion
        if (event.taskName === "processPayment" && event.result?.paymentId) {
          updatedState.paymentId = event.result.paymentId;
        }
        if (event.taskName === "scheduleShipment" && event.result?.trackingId) {
          updatedState.trackingId = event.result.trackingId;
        }
        return updatedState;
      default:
        return state;
    }
  },
  // Initial state
  { orderId: "", customerId: "", items: [], totalAmount: 0, tasks: {} },
  // Reaction logic: (State, ProcessEvent) → ProcessAction[] (subset of pending)
  (state, event) => {
    // Only return actions that this specific event makes ready
    switch (event.type) {
      case "TaskStarted":
        switch (event.taskName) {
          case "processPayment":
            return [{
              type: "ProcessPayment",
              orderId: event.orderId,
              customerId: state.customerId,
              amount: state.totalAmount,
            }];
          case "reserveInventory":
            return [{
              type: "ReserveInventory",
              orderId: event.orderId,
              items: state.items,
            }];
          case "scheduleShipment":
            return [{
              type: "ScheduleShipment",
              orderId: event.orderId,
              customerId: state.customerId,
              items: state.items,
            }];
          case "sendConfirmationEmail":
            return [{
              type: "SendConfirmationEmail",
              orderId: event.orderId,
              customerId: state.customerId,
            }];
          case "notifyCustomer":
            return [{
              type: "NotifyCustomer",
              orderId: event.orderId,
              customerId: state.customerId,
              message: "Your order has been shipped!",
            }];
        }
        break;
      case "TaskCompleted":
        // Some task completions might trigger additional actions
        if (event.taskName === "scheduleShipment") {
          return [{
            type: "UpdateAnalytics",
            orderId: event.orderId,
            status: "shipped",
          }];
        }
        break;
    }
    return [];
  },
  // Pending logic: State → ProcessAction[] (complete ToDo list)
  (state) => {
    const actions: ProcessAction[] = [];

    if (!state.orderId) return actions; // No order yet

    // Check each task and add corresponding actions for "started" tasks
    if (state.tasks.processPayment === "started") {
      actions.push({
        type: "ProcessPayment",
        orderId: state.orderId,
        customerId: state.customerId,
        amount: state.totalAmount,
      });
    }

    if (state.tasks.reserveInventory === "started") {
      actions.push({
        type: "ReserveInventory",
        orderId: state.orderId,
        items: state.items,
      });
    }

    if (state.tasks.scheduleShipment === "started") {
      actions.push({
        type: "ScheduleShipment",
        orderId: state.orderId,
        customerId: state.customerId,
        items: state.items,
      });
    }

    if (state.tasks.sendConfirmationEmail === "started") {
      actions.push({
        type: "SendConfirmationEmail",
        orderId: state.orderId,
        customerId: state.customerId,
      });
    }

    if (state.tasks.notifyCustomer === "started") {
      actions.push({
        type: "NotifyCustomer",
        orderId: state.orderId,
        customerId: state.customerId,
        message: "Your order has been shipped!",
      });
    }

    // Always include analytics for any active order
    actions.push({
      type: "UpdateAnalytics",
      orderId: state.orderId,
      status: "processing",
    });

    return actions;
  },
);

// Usage: Demonstrating the ToDo list with checkboxes concept
const orderCreated: OrderEvent = {
  type: "OrderCreated",
  orderId: "order-123",
  customerId: "customer-456",
  items: ["item-1", "item-2"],
  totalAmount: 100,
};

const newState = orderFulfillmentProcess.computeNewState(
  orderFulfillmentProcess.initialState,
  orderCreated,
);
console.log("New process state:", newState);
// Output: {
//   orderId: "order-123",
//   customerId: "customer-456",
//   items: ["item-1", "item-2"],
//   totalAmount: 100,
//   tasks: { processPayment: "started" }  // ☑️ Payment task started
// }

// Get the complete ToDo list (all started tasks)
const allPendingActions = orderFulfillmentProcess.pending(newState);
console.log("Complete ToDo list:", allPendingActions);
// Output: [
//   { type: "ProcessPayment", orderId: "order-123", customerId: "customer-456", amount: 100 },
//   { type: "UpdateAnalytics", orderId: "order-123", status: "processing" }
// ]

// Get only actions made ready by a specific event
const taskStartedEvent: ProcessEvent = {
  type: "TaskStarted",
  orderId: "order-123",
  taskName: "processPayment",
};
const readyActions = orderFulfillmentProcess.react(newState, taskStartedEvent);
console.log("Actions made ready by TaskStarted event:", readyActions);
// Output: [{ type: "ProcessPayment", orderId: "order-123", customerId: "customer-456", amount: 100 }]

// Simulate payment completion
const paymentProcessed: OrderEvent = {
  type: "PaymentProcessed",
  orderId: "order-123",
  paymentId: "pay-789",
  amount: 100,
};
const stateAfterPayment = orderFulfillmentProcess.computeNewState(
  newState,
  paymentProcessed,
);
console.log("State after payment:", stateAfterPayment.tasks);
// Output: {
//   processPayment: "finished",           // ✅ Payment completed
//   reserveInventory: "started",          // ☑️ Inventory reservation started
//   sendConfirmationEmail: "started"      // ☑️ Email task started
// }

// Notice: readyActions is always a subset of allPendingActions
```

### Usage Patterns

**Event-Driven Processing** (recommended for real-time systems):

```ts
// When an event occurs, execute only actions that the event makes ready
const readyActions = process.react(currentState, incomingEvent);
await executeActions(readyActions);
```

**Batch Processing** (useful for cleanup, timeouts, or periodic tasks):

```ts
// Periodically check and execute all pending actions
const allPendingActions = process.pending(currentState);
await executeActions(allPendingActions);
```

**Hybrid Approach**:

```ts
// Event-driven for immediate actions
const readyActions = process.react(currentState, incomingEvent);
await executeActions(readyActions);

// Batch processing for remaining actions (e.g., analytics, notifications)
const remainingActions = process.pending(newState).filter((action) =>
  !readyActions.some((ready) => ready.type === action.type)
);
await scheduleForLater(remainingActions);
```

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
