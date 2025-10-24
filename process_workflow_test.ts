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
import {
  AggregateWorkflowProcess,
  type WorkflowEvent,
  type WorkflowState,
} from "./process_workflow.ts";

// Order Fulfillment Workflow Process with standardized task management
// This demonstrates the workflow approach where tasks are automatically managed:
// - Missing (not started) ☐
// - "started" (in progress) ☑️
// - "finished" (completed) ✅
// All domain-specific data is stored in WorkflowEvent metadata

/**
 * Domain-specific task names for Order Fulfillment workflow
 */
type OrderTaskName =
  | "processPayment"
  | "reserveInventory"
  | "scheduleShipment"
  | "sendConfirmationEmail"
  | "notifyCustomer";

/**
 * Type-safe workflow event for Order Fulfillment
 */
type OrderWorkflowEvent = WorkflowEvent<OrderTaskName>;

/**
 * Type-safe workflow state for Order Fulfillment
 */
type OrderWorkflowState = WorkflowState<OrderTaskName>;

/**
 * Action Results (Events from other systems that trigger workflow reactions)
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
 * Actions (Commands sent to other systems)
 */
type ProcessAction =
  | {
    type: "ProcessPayment";
    orderId: string;
    customerId: string;
    amount: number;
  }
  | { type: "ReserveInventory"; orderId: string; items: readonly string[] }
  | {
    type: "ScheduleShipment";
    orderId: string;
    customerId: string;
    items: readonly string[];
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
 * Order Fulfillment Workflow Process Implementation
 */
const orderFulfillmentWorkflow = new AggregateWorkflowProcess<
  OrderEvent,
  ProcessAction,
  OrderTaskName
>(
  // Decision logic: OrderEvent + WorkflowState<OrderTaskName> → WorkflowEvent<OrderTaskName>[]
  (orderEvent, state) => {
    switch (orderEvent.type) {
      case "OrderCreated":
        // Check if we already have an order (no processPayment task started)
        if (!state.tasks.processPayment) {
          return [
            {
              type: "TaskStarted",
              taskName: "processPayment",
              timestamp: Date.now(),
              metadata: {
                orderData: {
                  orderId: orderEvent.orderId,
                  customerId: orderEvent.customerId,
                  items: orderEvent.items,
                  totalAmount: orderEvent.totalAmount,
                },
              },
            },
          ];
        }
        return [];
      case "PaymentProcessed":
        if (state.tasks.processPayment === "started") {
          return [
            {
              type: "TaskCompleted",
              taskName: "processPayment",
              timestamp: Date.now(),
              metadata: { paymentId: orderEvent.paymentId },
            },
            {
              type: "TaskStarted",
              taskName: "reserveInventory",
              timestamp: Date.now(),
            },
            {
              type: "TaskStarted",
              taskName: "sendConfirmationEmail",
              timestamp: Date.now(),
            },
          ];
        }
        return [];
      case "InventoryReserved":
        if (state.tasks.reserveInventory === "started") {
          return [
            {
              type: "TaskCompleted",
              taskName: "reserveInventory",
              timestamp: Date.now(),
            },
            {
              type: "TaskStarted",
              taskName: "scheduleShipment",
              timestamp: Date.now(),
            },
          ];
        }
        return [];
      case "ShipmentScheduled":
        if (state.tasks.scheduleShipment === "started") {
          return [
            {
              type: "TaskCompleted",
              taskName: "scheduleShipment",
              timestamp: Date.now(),
              metadata: { trackingId: orderEvent.trackingId },
            },
            {
              type: "TaskStarted",
              taskName: "notifyCustomer",
              timestamp: Date.now(),
            },
          ];
        }
        return [];
      default:
        // Exhaustive check: this should never happen if all OrderEvent types are handled
        const _exhaustiveCheck: never = orderEvent;
        return [];
    }
  },
  // Reaction logic: (WorkflowState<OrderTaskName>, WorkflowEvent<OrderTaskName>) → ProcessAction[] (subset of pending)
  (state, event) => {
    // Only return actions that this specific event makes ready
    switch (event.type) {
      case "TaskStarted":
        switch (event.taskName) {
          case "processPayment":
            // Get order data from the event metadata
            if (event.metadata?.orderData) {
              const orderData = event.metadata.orderData as any;
              return [
                {
                  type: "ProcessPayment",
                  orderId: orderData.orderId,
                  customerId: orderData.customerId,
                  amount: orderData.totalAmount,
                },
              ];
            }
            return [];
          case "reserveInventory":
          case "scheduleShipment":
          case "sendConfirmationEmail":
          case "notifyCustomer":
            // For these tasks, we need to look up order data from event history
            // In a real implementation, this would be passed through or stored
            // For the test, we'll return a placeholder action
            return [{
              type: "UpdateAnalytics",
              orderId: "order-from-history",
              status: "task-started",
            }];
          default:
            // Handle any other task names
            return [];
        }
      case "TaskCompleted":
        // Some task completions might trigger additional actions
        if (event.taskName === "scheduleShipment") {
          return [{
            type: "UpdateAnalytics",
            orderId: "order-from-history",
            status: "shipped",
          }];
        }
        return [];
      default:
        // Exhaustive check: this should never happen if all WorkflowEvent types are handled
        const _exhaustiveCheck: never = event;
        return [];
    }
  },
  // Pending logic: WorkflowState<OrderTaskName> → ProcessAction[] (complete ToDo list)
  (state) => {
    const actions: ProcessAction[] = [];

    // For started tasks, we would need to reconstruct order data from event history
    // In a real implementation, this would be more sophisticated
    // For the test, we'll return placeholder actions for started tasks

    if (state.tasks.processPayment === "started") {
      actions.push({
        type: "ProcessPayment",
        orderId: "pending-order",
        customerId: "pending-customer",
        amount: 0,
      });
    }

    if (state.tasks.reserveInventory === "started") {
      actions.push({
        type: "ReserveInventory",
        orderId: "pending-order",
        items: [],
      });
    }

    if (state.tasks.scheduleShipment === "started") {
      actions.push({
        type: "ScheduleShipment",
        orderId: "pending-order",
        customerId: "pending-customer",
        items: [],
      });
    }

    if (state.tasks.sendConfirmationEmail === "started") {
      actions.push({
        type: "SendConfirmationEmail",
        orderId: "pending-order",
        customerId: "pending-customer",
      });
    }

    if (state.tasks.notifyCustomer === "started") {
      actions.push({
        type: "NotifyCustomer",
        orderId: "pending-order",
        customerId: "pending-customer",
        message: "Your order has been shipped!",
      });
    }

    // Always include analytics for any active workflow
    if (Object.keys(state.tasks).length > 0) {
      actions.push({
        type: "UpdateAnalytics",
        orderId: "active-workflow",
        status: "processing",
      });
    }

    return actions;
  },
);

// Tests
Deno.test("Order Fulfillment Workflow - Initial Order Creation", () => {
  const initialState = orderFulfillmentWorkflow.initialState;

  const orderCreated: OrderEvent = {
    type: "OrderCreated",
    orderId: "order-123",
    customerId: "customer-456",
    items: ["item-1", "item-2"],
    totalAmount: 100,
  };

  const newState = orderFulfillmentWorkflow.computeNewState(
    initialState,
    orderCreated,
  );

  // Verify task state after order creation (automatic workflow evolution)
  assertEquals(newState.tasks.processPayment, "started"); // ☑️ Payment task started
  assertEquals(newState.tasks.reserveInventory, undefined); // ☐ Not started yet
});

Deno.test("Order Fulfillment Workflow - Payment Processing", () => {
  // Start with order created state
  const stateWithOrder: WorkflowState = {
    tasks: { processPayment: "started" },
  };

  const paymentProcessed: OrderEvent = {
    type: "PaymentProcessed",
    orderId: "order-123",
    paymentId: "pay-789",
    amount: 100,
  };

  const newState = orderFulfillmentWorkflow.computeNewState(
    stateWithOrder,
    paymentProcessed,
  );

  // Verify task states after payment
  assertEquals(newState.tasks.processPayment, "finished"); // ✅ Payment completed
  assertEquals(newState.tasks.reserveInventory, "started"); // ☑️ Inventory started
  assertEquals(newState.tasks.sendConfirmationEmail, "started"); // ☑️ Email started
});

Deno.test("Order Fulfillment Workflow - Complete ToDo List (Pending)", () => {
  const stateWithMultipleTasks: WorkflowState = {
    tasks: {
      processPayment: "finished", // ✅ Done
      reserveInventory: "started", // ☑️ In progress
      sendConfirmationEmail: "started", // ☑️ In progress
    },
  };

  const allPendingActions = orderFulfillmentWorkflow.pending(
    stateWithMultipleTasks,
  );

  // Should return actions for all "started" tasks plus analytics
  assertEquals(allPendingActions.length, 3);
  assertEquals(allPendingActions[0].type, "ReserveInventory");
  assertEquals(allPendingActions[1].type, "SendConfirmationEmail");
  assertEquals(allPendingActions[2].type, "UpdateAnalytics");
});

Deno.test("Order Fulfillment Workflow - Event-Driven Actions (React)", () => {
  const stateWithOrder: WorkflowState = {
    tasks: { processPayment: "started" },
  };

  const taskStartedEvent: OrderWorkflowEvent = {
    type: "TaskStarted",
    taskName: "processPayment",
    timestamp: Date.now(),
    metadata: {
      orderData: {
        orderId: "order-123",
        customerId: "customer-456",
        items: ["item-1", "item-2"],
        totalAmount: 100,
      },
    },
  };

  const readyActions = orderFulfillmentWorkflow.react(
    stateWithOrder,
    taskStartedEvent,
  );

  // Should return only the action made ready by this specific event
  assertEquals(readyActions.length, 1);
  assertEquals(readyActions[0].type, "ProcessPayment");
  assertEquals((readyActions[0] as any).amount, 100);
});

Deno.test("Order Fulfillment Workflow - Subset Relationship", () => {
  const stateWithMultipleTasks: WorkflowState = {
    tasks: {
      reserveInventory: "started",
      sendConfirmationEmail: "started",
    },
  };

  // Get complete ToDo list
  const allPendingActions = orderFulfillmentWorkflow.pending(
    stateWithMultipleTasks,
  );

  // Get actions made ready by specific event
  const taskStartedEvent: OrderWorkflowEvent = {
    type: "TaskStarted",
    taskName: "reserveInventory",
    timestamp: Date.now(),
  };
  const readyActions = orderFulfillmentWorkflow.react(
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

Deno.test("Order Fulfillment Workflow - Event Sourced Computation", () => {
  const events: readonly OrderWorkflowEvent[] = [
    {
      type: "TaskStarted",
      taskName: "processPayment",
      timestamp: Date.now(),
      metadata: {
        orderData: {
          orderId: "order-123",
          customerId: "customer-456",
          items: ["item-1"],
          totalAmount: 50,
        },
      },
    },
    {
      type: "TaskCompleted",
      taskName: "processPayment",
      timestamp: Date.now(),
      metadata: { paymentId: "pay-789" },
    },
  ];

  const inventoryReserved: OrderEvent = {
    type: "InventoryReserved",
    orderId: "order-123",
    items: ["item-1"],
  };

  const newEvents = orderFulfillmentWorkflow.computeNewEvents(
    events,
    inventoryReserved,
  );

  // Should not produce events because inventory task wasn't started yet
  assertEquals(newEvents.length, 0);
});

Deno.test("Order Fulfillment Workflow - Parallel Task Execution", () => {
  const stateAfterPayment: WorkflowState = {
    tasks: {
      processPayment: "finished", // ✅ Done
      reserveInventory: "started", // ☑️ In progress
      sendConfirmationEmail: "started", // ☑️ In progress (parallel to inventory)
    },
  };

  const pendingActions = orderFulfillmentWorkflow.pending(stateAfterPayment);

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

Deno.test("Order Fulfillment Workflow - Task Completion Triggers New Tasks", () => {
  const stateWithInventoryStarted: WorkflowState = {
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

  const newState = orderFulfillmentWorkflow.computeNewState(
    stateWithInventoryStarted,
    inventoryReserved,
  );

  // Verify inventory task completed and shipping task started
  assertEquals(newState.tasks.reserveInventory, "finished"); // ✅ Inventory done
  assertEquals(newState.tasks.scheduleShipment, "started"); // ☑️ Shipping started
  assertEquals(newState.tasks.sendConfirmationEmail, "started"); // ☑️ Still in progress
});

Deno.test("Order Fulfillment Workflow - No Actions for Empty State", () => {
  const emptyState = orderFulfillmentWorkflow.initialState;
  const pendingActions = orderFulfillmentWorkflow.pending(emptyState);

  // Should return no actions for empty state
  assertEquals(pendingActions.length, 0);
});

Deno.test("Order Fulfillment Workflow - Automatic Task State Evolution", () => {
  const initialState = orderFulfillmentWorkflow.initialState;

  // Test automatic task state evolution using the standard evolve function
  const taskStartedEvent: OrderWorkflowEvent = {
    type: "TaskStarted",
    taskName: "processPayment",
    timestamp: Date.now(),
    metadata: {
      orderData: {
        orderId: "order-123",
        customerId: "customer-456",
        items: ["item-1"],
        totalAmount: 50,
      },
    },
  };

  const stateAfterStart = orderFulfillmentWorkflow.evolve(
    initialState,
    taskStartedEvent,
  );

  // Verify task state evolution (metadata is preserved in events, not state)
  assertEquals(stateAfterStart.tasks.processPayment, "started");

  const taskCompletedEvent: OrderWorkflowEvent = {
    type: "TaskCompleted",
    taskName: "processPayment",
    timestamp: Date.now(),
    metadata: { paymentId: "pay-789" },
  };

  const stateAfterCompletion = orderFulfillmentWorkflow.evolve(
    stateAfterStart,
    taskCompletedEvent,
  );

  // Verify task completion (metadata stays in events)
  assertEquals(stateAfterCompletion.tasks.processPayment, "finished");
});

Deno.test("Order Fulfillment Workflow - Helper Methods Work Correctly", () => {
  const stateWithTasks: WorkflowState = {
    tasks: {
      processPayment: "started",
      reserveInventory: "finished",
    },
  };

  // Test getTaskStatus
  assertEquals(
    orderFulfillmentWorkflow.getTaskStatus(stateWithTasks, "processPayment"),
    "started",
  );
  assertEquals(
    orderFulfillmentWorkflow.getTaskStatus(stateWithTasks, "reserveInventory"),
    "finished",
  );
  assertEquals(
    orderFulfillmentWorkflow.getTaskStatus(stateWithTasks, "scheduleShipment"),
    undefined,
  );

  // Test isTaskStarted
  assertEquals(
    orderFulfillmentWorkflow.isTaskStarted(stateWithTasks, "processPayment"),
    true,
  );
  assertEquals(
    orderFulfillmentWorkflow.isTaskStarted(stateWithTasks, "reserveInventory"),
    true,
  );
  assertEquals(
    orderFulfillmentWorkflow.isTaskStarted(stateWithTasks, "scheduleShipment"),
    false,
  );

  // Test isTaskCompleted
  assertEquals(
    orderFulfillmentWorkflow.isTaskCompleted(stateWithTasks, "processPayment"),
    false,
  );
  assertEquals(
    orderFulfillmentWorkflow.isTaskCompleted(
      stateWithTasks,
      "reserveInventory",
    ),
    true,
  );
  assertEquals(
    orderFulfillmentWorkflow.isTaskCompleted(
      stateWithTasks,
      "scheduleShipment",
    ),
    false,
  );
});

Deno.test("Order Fulfillment Workflow - Event Metadata Handling", () => {
  // Test that order data flows through event metadata correctly
  const orderCreated: OrderEvent = {
    type: "OrderCreated",
    orderId: "order-456",
    customerId: "customer-789",
    items: ["widget-1", "widget-2"],
    totalAmount: 250,
  };

  const events = orderFulfillmentWorkflow.computeNewEvents([], orderCreated);

  // Should create a TaskStarted event with order data in metadata
  assertEquals(events.length, 1);
  assertEquals(events[0].type, "TaskStarted");
  assertEquals(events[0].taskName, "processPayment");
  assertEquals((events[0].metadata?.orderData as any)?.orderId, "order-456");
  assertEquals((events[0].metadata?.orderData as any)?.totalAmount, 250);

  // Test that the react function can access this metadata
  const actions = orderFulfillmentWorkflow.react({ tasks: {} }, events[0]);
  assertEquals(actions.length, 1);
  assertEquals(actions[0].type, "ProcessPayment");
  assertEquals((actions[0] as any).orderId, "order-456");
  assertEquals((actions[0] as any).amount, 250);
});

Deno.test("Order Fulfillment Workflow - Type-Safe Task Names", () => {
  // Demonstrate type-safe task name usage
  const workflow = orderFulfillmentWorkflow;

  // These task names are type-safe when using the OrderTaskName type
  const validTaskNames: OrderTaskName[] = [
    "processPayment",
    "reserveInventory",
    "scheduleShipment",
    "sendConfirmationEmail",
    "notifyCustomer",
  ];

  // Create type-safe events
  const taskStartedEvent: OrderWorkflowEvent = {
    type: "TaskStarted",
    taskName: "processPayment", // This is type-checked against OrderTaskName
    timestamp: Date.now(),
  };

  const taskCompletedEvent: OrderWorkflowEvent = {
    type: "TaskCompleted",
    taskName: "processPayment", // This is type-checked against OrderTaskName
    timestamp: Date.now(),
  };

  // Test that the events have the correct structure
  assertEquals(taskStartedEvent.type, "TaskStarted");
  assertEquals(taskStartedEvent.taskName, "processPayment");
  assertEquals(taskCompletedEvent.type, "TaskCompleted");
  assertEquals(taskCompletedEvent.taskName, "processPayment");

  // Test type-safe state
  const typeSafeState: OrderWorkflowState = {
    tasks: {
      processPayment: "started",
      reserveInventory: "finished",
      // scheduleShipment, sendConfirmationEmail, notifyCustomer are optional
    },
  };

  assertEquals(typeSafeState.tasks.processPayment, "started");
  assertEquals(typeSafeState.tasks.reserveInventory, "finished");
  assertEquals(typeSafeState.tasks.scheduleShipment, undefined);
});
