import { assertEquals } from "@std/assert";
import { restaurantOrderWorkflow } from "./restaurantOrderWorkflow.ts";
import type { MenuItem } from "./api.ts";

const testMenuItems: MenuItem[] = [
  { menuItemId: "item-1", name: "Pizza", price: "10.00" },
];

Deno.test("Restaurant Order Workflow - Restaurant Order Placed Event", () => {
  const event = {
    decider: "Restaurant" as const,
    kind: "RestaurantOrderPlacedEvent" as const,
    id: "restaurant-1",
    orderId: "order-1",
    menuItems: testMenuItems,
    final: false,
  };

  const initialState = { tasks: {} };
  const workflowEvents = restaurantOrderWorkflow.decide(event, initialState);

  assertEquals(workflowEvents.length, 1);
  assertEquals(workflowEvents[0].type, "TaskStarted");
  assertEquals(workflowEvents[0].taskName, "createOrder");
  assertEquals(workflowEvents[0].metadata?.orderId, "order-1");
  assertEquals(workflowEvents[0].metadata?.restaurantId, "restaurant-1");
});

Deno.test("Restaurant Order Workflow - Order Created Event", () => {
  const event = {
    version: 1,
    decider: "Order" as const,
    kind: "OrderCreatedEvent" as const,
    id: "order-1",
    restaurantId: "restaurant-1",
    menuItems: testMenuItems,
    final: false,
  };

  const stateWithStartedTask = {
    tasks: { createOrder: "started" as const },
  };

  const workflowEvents = restaurantOrderWorkflow.decide(
    event,
    stateWithStartedTask,
  );

  assertEquals(workflowEvents.length, 1);
  assertEquals(workflowEvents[0].type, "TaskCompleted");
  assertEquals(workflowEvents[0].taskName, "createOrder");
  assertEquals(workflowEvents[0].metadata?.orderId, "order-1");
});

Deno.test("Restaurant Order Workflow - Task Started React", () => {
  const taskStartedEvent = {
    type: "TaskStarted" as const,
    taskName: "createOrder" as const,
    timestamp: Date.now(),
    metadata: {
      orderId: "order-1",
      restaurantId: "restaurant-1",
      menuItems: testMenuItems,
    },
  };

  const initialState = { tasks: {} };
  const commands = restaurantOrderWorkflow.react(
    initialState,
    taskStartedEvent,
  );

  assertEquals(commands.length, 1);
  assertEquals(commands[0].kind, "CreateOrderCommand");
  if (commands[0].kind === "CreateOrderCommand") {
    assertEquals(commands[0].id, "order-1");
    assertEquals(commands[0].restaurantId, "restaurant-1");
  }
});

Deno.test("Restaurant Order Workflow - Idempotency Check", () => {
  const event = {
    decider: "Restaurant" as const,
    kind: "RestaurantOrderPlacedEvent" as const,
    id: "restaurant-1",
    orderId: "order-1",
    menuItems: testMenuItems,
    final: false,
  };

  const stateWithExistingTask = {
    tasks: { createOrder: "started" as const },
  };

  const workflowEvents = restaurantOrderWorkflow.decide(
    event,
    stateWithExistingTask,
  );

  assertEquals(workflowEvents.length, 0);
});

Deno.test("Restaurant Order Workflow - Pending Actions", () => {
  const stateWithStartedTask = {
    tasks: { createOrder: "started" as const },
  };

  const pendingActions = restaurantOrderWorkflow.pending(stateWithStartedTask);

  assertEquals(pendingActions.length, 1);
  assertEquals(pendingActions[0].kind, "CreateOrderCommand");
  assertEquals(pendingActions[0].id, "pending-order");
});

Deno.test("Restaurant Order Workflow - No Pending Actions for Empty State", () => {
  const emptyState = { tasks: {} };
  const pendingActions = restaurantOrderWorkflow.pending(emptyState);

  assertEquals(pendingActions.length, 0);
});
