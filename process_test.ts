// deno-lint-ignore-file
/*
 * Copyright 2025 Fraktalio D.O.O. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the
 * License. You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "
 * AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific
 * language governing permissions and limitations under the License.
 */

import { assertEquals } from "@std/assert";
import { AggregateProcess } from "./process.ts";

// Order Fulfillment Process with ToDo List Checkboxes
// This demonstrates the new task-based approach where each task can be:
// - Missing (not started) ☐
// - "started" (in progress) ☑️
// - "finished" (completed) ✅

/**
 * Action Results (Events from other systems that trigger process reactions)
 */
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

/**
 * Process State with ToDo List (tasks with checkboxes)
 */
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

/**
 * Process Events (Internal events representing task state changes)
 */
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

/**
 * Actions (Commands sent to other systems)
 */
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

/**
 * Order Fulfillment Process Implementation
 */
const orderFulfillmentProcess = new AggregateProcess<
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
      case "TaskCompleted": {
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
      }
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
            return [
              {
                type: "ProcessPayment",
                orderId: event.orderId,
                customerId: state.customerId,
                amount: state.totalAmount,
              },
            ];
          case "reserveInventory":
            return [{
              type: "ReserveInventory",
              orderId: event.orderId,
              items: state.items,
            }];
          case "scheduleShipment":
            return [
              {
                type: "ScheduleShipment",
                orderId: event.orderId,
                customerId: state.customerId,
                items: state.items,
              },
            ];
          case "sendConfirmationEmail":
            return [
              {
                type: "SendConfirmationEmail",
                orderId: event.orderId,
                customerId: state.customerId,
              },
            ];
          case "notifyCustomer":
            return [
              {
                type: "NotifyCustomer",
                orderId: event.orderId,
                customerId: state.customerId,
                message: "Your order has been shipped!",
              },
            ];
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

// Tests
Deno.test("Order Fulfillment Process - Initial Order Creation", () => {
  const initialState = orderFulfillmentProcess.initialState;

  const orderCreated: OrderEvent = {
    type: "OrderCreated",
    orderId: "order-123",
    customerId: "customer-456",
    items: ["item-1", "item-2"],
    totalAmount: 100,
  };

  const newState = orderFulfillmentProcess.computeNewState(
    initialState,
    orderCreated,
  );

  // Verify state after order creation
  assertEquals(newState.orderId, "order-123");
  assertEquals(newState.customerId, "customer-456");
  assertEquals(newState.items, ["item-1", "item-2"]);
  assertEquals(newState.totalAmount, 100);
  assertEquals(newState.tasks.processPayment, "started"); // ☑️ Payment task started
  assertEquals(newState.tasks.reserveInventory, undefined); // ☐ Not started yet
});

Deno.test("Order Fulfillment Process - Payment Processing", () => {
  // Start with order created state
  const stateWithOrder: ProcessState = {
    orderId: "order-123",
    customerId: "customer-456",
    items: ["item-1", "item-2"],
    totalAmount: 100,
    tasks: { processPayment: "started" },
  };

  const paymentProcessed: OrderEvent = {
    type: "PaymentProcessed",
    orderId: "order-123",
    paymentId: "pay-789",
    amount: 100,
  };

  const newState = orderFulfillmentProcess.computeNewState(
    stateWithOrder,
    paymentProcessed,
  );

  // Verify task states after payment
  assertEquals(newState.tasks.processPayment, "finished"); // ✅ Payment completed
  assertEquals(newState.tasks.reserveInventory, "started"); // ☑️ Inventory started
  assertEquals(newState.tasks.sendConfirmationEmail, "started"); // ☑️ Email started
  assertEquals(newState.paymentId, "pay-789");
});

Deno.test("Order Fulfillment Process - Complete ToDo List (Pending)", () => {
  const stateWithMultipleTasks: ProcessState = {
    orderId: "order-123",
    customerId: "customer-456",
    items: ["item-1", "item-2"],
    totalAmount: 100,
    tasks: {
      processPayment: "finished", // ✅ Done
      reserveInventory: "started", // ☑️ In progress
      sendConfirmationEmail: "started", // ☑️ In progress
    },
  };

  const allPendingActions = orderFulfillmentProcess.pending(
    stateWithMultipleTasks,
  );

  // Should return actions for all "started" tasks plus analytics
  assertEquals(allPendingActions.length, 3);
  assertEquals(allPendingActions[0].type, "ReserveInventory");
  assertEquals(allPendingActions[1].type, "SendConfirmationEmail");
  assertEquals(allPendingActions[2].type, "UpdateAnalytics");
});

Deno.test("Order Fulfillment Process - Event-Driven Actions (React)", () => {
  const stateWithOrder: ProcessState = {
    orderId: "order-123",
    customerId: "customer-456",
    items: ["item-1", "item-2"],
    totalAmount: 100,
    tasks: { processPayment: "started" },
  };

  const taskStartedEvent: ProcessEvent = {
    type: "TaskStarted",
    orderId: "order-123",
    taskName: "processPayment",
  };

  const readyActions = orderFulfillmentProcess.react(
    stateWithOrder,
    taskStartedEvent,
  );

  // Should return only the action made ready by this specific event
  assertEquals(readyActions.length, 1);
  assertEquals(readyActions[0].type, "ProcessPayment");
  assertEquals((readyActions[0] as any).amount, 100);
});

Deno.test("Order Fulfillment Process - Subset Relationship", () => {
  const stateWithMultipleTasks: ProcessState = {
    orderId: "order-123",
    customerId: "customer-456",
    items: ["item-1", "item-2"],
    totalAmount: 100,
    tasks: {
      reserveInventory: "started",
      sendConfirmationEmail: "started",
    },
  };

  // Get complete ToDo list
  const allPendingActions = orderFulfillmentProcess.pending(
    stateWithMultipleTasks,
  );

  // Get actions made ready by specific event
  const taskStartedEvent: ProcessEvent = {
    type: "TaskStarted",
    orderId: "order-123",
    taskName: "reserveInventory",
  };
  const readyActions = orderFulfillmentProcess.react(
    stateWithMultipleTasks,
    taskStartedEvent,
  );

  // Verify subset relationship: readyActions should be subset of allPendingActions
  assertEquals(readyActions.length, 1);
  assertEquals(allPendingActions.length, 3); // 2 tasks + analytics

  // The ready action should exist in the pending list
  const readyActionType = readyActions[0].type;
  const existsInPending = allPendingActions.some((action) =>
    action.type === readyActionType
  );
  assertEquals(existsInPending, true);
});

Deno.test("Order Fulfillment Process - Event Sourced Computation", () => {
  const events: readonly ProcessEvent[] = [
    {
      type: "OrderFulfillmentStarted",
      orderId: "order-123",
      customerId: "customer-456",
      items: ["item-1"],
      totalAmount: 50,
    },
    { type: "TaskStarted", orderId: "order-123", taskName: "processPayment" },
    {
      type: "TaskCompleted",
      orderId: "order-123",
      taskName: "processPayment",
      result: { paymentId: "pay-789" },
    },
  ];

  const inventoryReserved: OrderEvent = {
    type: "InventoryReserved",
    orderId: "order-123",
    items: ["item-1"],
  };

  const newEvents = orderFulfillmentProcess.computeNewEvents(
    events,
    inventoryReserved,
  );

  // Should not produce events because inventory task wasn't started yet
  assertEquals(newEvents.length, 0);
});

Deno.test("Order Fulfillment Process - Parallel Task Execution", () => {
  const stateAfterPayment: ProcessState = {
    orderId: "order-123",
    customerId: "customer-456",
    items: ["item-1", "item-2"],
    totalAmount: 100,
    paymentId: "pay-789",
    tasks: {
      processPayment: "finished", // ✅ Done
      reserveInventory: "started", // ☑️ In progress
      sendConfirmationEmail: "started", // ☑️ In progress (parallel to inventory)
    },
  };

  const pendingActions = orderFulfillmentProcess.pending(stateAfterPayment);

  // Should have actions for both parallel tasks
  const hasInventoryAction = pendingActions.some((action) =>
    action.type === "ReserveInventory"
  );
  const hasEmailAction = pendingActions.some((action) =>
    action.type === "SendConfirmationEmail"
  );

  assertEquals(hasInventoryAction, true);
  assertEquals(hasEmailAction, true);
});

Deno.test("Order Fulfillment Process - Task Completion Triggers New Tasks", () => {
  const stateWithInventoryStarted: ProcessState = {
    orderId: "order-123",
    customerId: "customer-456",
    items: ["item-1", "item-2"],
    totalAmount: 100,
    paymentId: "pay-789",
    tasks: {
      processPayment: "finished",
      reserveInventory: "started",
      sendConfirmationEmail: "started",
    },
  };

  const inventoryReserved: OrderEvent = {
    type: "InventoryReserved",
    orderId: "order-123",
    items: ["item-1", "item-2"],
  };

  const newState = orderFulfillmentProcess.computeNewState(
    stateWithInventoryStarted,
    inventoryReserved,
  );

  // Verify inventory task completed and shipping task started
  assertEquals(newState.tasks.reserveInventory, "finished"); // ✅ Inventory done
  assertEquals(newState.tasks.scheduleShipment, "started"); // ☑️ Shipping started
  assertEquals(newState.tasks.sendConfirmationEmail, "started"); // ☑️ Still in progress
});

Deno.test("Order Fulfillment Process - No Actions for Empty State", () => {
  const emptyState = orderFulfillmentProcess.initialState;
  const pendingActions = orderFulfillmentProcess.pending(emptyState);

  // Should return no actions for empty state
  assertEquals(pendingActions.length, 0);
});
