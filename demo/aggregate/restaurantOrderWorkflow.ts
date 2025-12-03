import { AggregateWorkflowProcess } from "../../process_workflow.ts";
import type { Command, Event, MenuItem, OrderId, RestaurantId } from "./api.ts";

/**
 * Task names for the restaurant order workflow
 */
type OrderTaskName = "createOrder";

/**
 * Restaurant - Order workflow
 *
 * @remarks
 * This workflow demonstrates the standard pattern for event-driven workflows:
 * - react() issues commands immediately when events make them ready
 * - pending() returns placeholder actions for recovery/polling scenarios
 * - Task state tracks progress: missing (☐), "started" (☑️), "finished" (✅)
 *
 * The workflow reacts to RestaurantOrderPlacedEvent and orchestrates order creation
 * by issuing CreateOrderCommand to the Order decider.
 */
export const restaurantOrderWorkflow: AggregateWorkflowProcess<
  Event,
  Command,
  OrderTaskName
> = new AggregateWorkflowProcess<Event, Command, OrderTaskName>(
  // decide: Event + WorkflowState<OrderTaskName> → WorkflowEvent<OrderTaskName>[]
  (event, workflowState) => {
    switch (event.kind) {
      case "RestaurantCreatedEvent":
      case "RestaurantMenuChangedEvent":
        // These events don't trigger workflow actions
        return [];
      case "RestaurantOrderPlacedEvent":
        // Start the createOrder task if not already started (idempotency)
        if (!workflowState.tasks.createOrder) {
          return [
            {
              type: "TaskStarted",
              taskName: "createOrder",
              timestamp: Date.now(),
              metadata: {
                orderId: event.orderId,
                restaurantId: event.id,
                menuItems: event.menuItems,
              },
            },
          ];
        }
        return [];
      case "OrderCreatedEvent":
        // Complete the createOrder task when order is successfully created
        if (workflowState.tasks.createOrder === "started") {
          return [
            {
              type: "TaskCompleted",
              taskName: "createOrder",
              timestamp: Date.now(),
              metadata: {
                orderId: event.id,
              },
            },
          ];
        }
        return [];
      case "OrderPreparedEvent":
        // This event doesn't trigger workflow actions
        return [];
      default: {
        // Exhaustive check: ensures all Event types are handled
        const _exhaustiveCheck: never = event;
        return [];
      }
    }
  },
  // react: (WorkflowState<OrderTaskName>, WorkflowEvent<OrderTaskName>) → Command[] (subset of pending)
  (_workflowState, workflowEvent) => {
    // Only return actions that this specific event makes ready
    switch (workflowEvent.type) {
      case "TaskStarted":
        // Exhaustive switch on task name
        switch (workflowEvent.taskName) {
          case "createOrder":
            if (workflowEvent.metadata) {
              // Extract order data from event metadata
              const orderId = workflowEvent.metadata.orderId as OrderId;
              const restaurantId = workflowEvent.metadata
                .restaurantId as RestaurantId;
              const menuItems =
                (workflowEvent.metadata.menuItems as MenuItem[]) || [];

              return [
                {
                  decider: "Order",
                  kind: "CreateOrderCommand",
                  id: orderId,
                  restaurantId: restaurantId,
                  menuItems: menuItems,
                },
              ];
            }
            return [];
          default: {
            // Exhaustive check: ensures all OrderTaskName types are handled
            const _exhaustiveCheck: never = workflowEvent.taskName;
            return [];
          }
        }
      case "TaskCompleted":
        // No additional actions needed when task completes
        return [];
      default: {
        // Exhaustive check: ensures all WorkflowEvent types are handled
        const _exhaustiveCheck: never = workflowEvent;
        return [];
      }
    }
  },
  // pending: WorkflowState<OrderTaskName> → Command[] (complete ToDo list)
  (workflowState) => {
    const actions: Command[] = [];

    // Exhaustive iteration over all possible task names
    // For started tasks, return placeholder actions
    // In a real implementation, you would either:
    // 1. Store order details in event metadata and replay events to reconstruct
    // 2. Use react() exclusively for event-driven command issuance
    // 3. Use a separate persistence mechanism to track pending commands

    // Check each task in the state
    for (const taskName in workflowState.tasks) {
      const typedTaskName = taskName as OrderTaskName;
      const taskStatus = workflowState.tasks[typedTaskName];

      if (taskStatus === "started") {
        // Exhaustive switch on task name to determine which action to add
        switch (typedTaskName) {
          case "createOrder":
            // Placeholder action for recovery/polling scenarios
            actions.push({
              decider: "Order",
              kind: "CreateOrderCommand",
              id: "pending-order",
              restaurantId: "pending-restaurant",
              menuItems: [],
            });
            break;
          default: {
            // Exhaustive check: ensures all OrderTaskName types are handled
            const _exhaustiveCheck: never = typedTaskName;
            break;
          }
        }
      }
    }

    return actions;
  },
);
