import { AggregateDecider } from "../../decider.ts";
import { Projection } from "../../view.ts";
import { AggregateWorkflowProcess } from "../../process_workflow.ts";
import type {
  Command,
  Event,
  MenuItem,
  OrderCommand,
  OrderEvent,
  OrderId,
  OrderStatus,
  RestaurantCommand,
  RestaurantEvent,
  RestaurantId,
  RestaurantMenu,
  RestaurantName,
} from "./api.ts";

/**
 * Restaurant state / a data type that represents the current state of the Restaurant
 */
export type Restaurant = {
  readonly restaurantId: RestaurantId;
  readonly name: RestaurantName;
  readonly menu: RestaurantMenu;
};

// ####################  Restaurant Decider / Command Handler ########################

/**
 * Restaurant `pure` event-sourced command handler / a decision-making component
 * ___
 * A pure command handling algorithm, responsible for evolving the state of the restaurant.
 * It does not produce any side effects, such as I/O, logging, etc.
 * It utilizes type narrowing to make sure that the command is handled exhaustively.
 * https://www.typescriptlang.org/docs/handbook/2/narrowing.html#exhaustiveness-checking
 * ___
 * @param c - command type that is being handled - `RestaurantCommand`
 * @param s - state type that is being evolved - `Restaurant | null`
 * @param e - event type that is being produced / a fact / an outcome of the decision - `RestaurantEvent`
 */
export const restaurantDecider: AggregateDecider<
  RestaurantCommand,
  Restaurant | null,
  RestaurantEvent
> = new AggregateDecider<RestaurantCommand, Restaurant | null, RestaurantEvent>(
  (command, currentState) => {
    switch (command.kind) {
      case "CreateRestaurantCommand":
        if (currentState !== null && currentState.restaurantId !== undefined) {
          throw new Error("Restaurant already exist!");
        }
        return [
          {
            decider: "Restaurant",
            kind: "RestaurantCreatedEvent",
            id: command.id,
            name: command.name,
            menu: command.menu,
            final: false,
          },
        ];
      case "ChangeRestaurantMenuCommand":
        if (currentState === null) {
          throw new Error("Restaurant does not exist!");
        }
        return [
          {
            decider: "Restaurant",
            kind: "RestaurantMenuChangedEvent",
            id: currentState.restaurantId,
            menu: command.menu,
            final: false,
          },
        ];
      case "PlaceOrderCommand":
        if (currentState === null) {
          throw new Error("Restaurant does not exist!");
        }
        return [
          {
            decider: "Restaurant",
            kind: "RestaurantOrderPlacedEvent",
            id: command.id,
            orderId: command.orderId,
            menuItems: command.menuItems,
            final: false,
          },
        ];
      default: {
        // Exhaustive matching of the command type
        const _exhaustiveCheck: never = command;
        return [];
      }
    }
  },
  (currentState, event) => {
    switch (event.kind) {
      case "RestaurantCreatedEvent":
        return { restaurantId: event.id, name: event.name, menu: event.menu };
      case "RestaurantMenuChangedEvent":
        return currentState !== null
          ? {
            restaurantId: currentState.restaurantId,
            name: currentState.name,
            menu: event.menu,
          }
          : currentState;
      case "RestaurantOrderPlacedEvent":
        return currentState;
      default: {
        // Exhaustive matching of the event type
        const _exhaustiveCheck: never = event;
        return currentState;
      }
    }
  },
  null,
);

/**
 * Restaurant View state / a data type that represents the current `view` state of the Restaurant.
 */
export type RestaurantView = {
  readonly restaurantId: RestaurantId;
  readonly name: RestaurantName;
  readonly menu: RestaurantMenu;
};

// ####################### Restaurant View / Event Handler ##############################

/**
 * A pure event handling algorithm, responsible for translating the events into denormalized view state, which is more adequate for querying.
 * ___
 * It does not produce any side effects, such as I/O, logging, etc.
 * It utilizes type narrowing to make sure that the event is handled exhaustively.
 * https://www.typescriptlang.org/docs/handbook/2/narrowing.html#exhaustiveness-checking
 * ___
 * @param s - a view state that is being evolved out of the events - `RestaurantView | null`
 * @param e - event type that is being handled - `RestaurantEvent`
 */
export const restaurantView: Projection<
  RestaurantView | null,
  RestaurantEvent
> = new Projection<RestaurantView | null, RestaurantEvent>(
  (currentState, event) => {
    switch (event.kind) {
      case "RestaurantCreatedEvent":
        return { restaurantId: event.id, name: event.name, menu: event.menu };
      case "RestaurantMenuChangedEvent":
        return currentState !== null
          ? {
            restaurantId: currentState.restaurantId,
            name: currentState.name,
            menu: event.menu,
          }
          : currentState;
      case "RestaurantOrderPlacedEvent":
        return currentState;
      default: {
        // Exhaustive matching of the event type
        const _exhaustiveCheck: never = event;
        return currentState;
      }
    }
  },
  null,
);

/**
 * Order state / a data type that represents the current state of the Order
 */
export type Order = {
  readonly orderId: OrderId;
  readonly restaurantId: RestaurantId;
  readonly menuItems: MenuItem[];
  readonly status: OrderStatus;
};

// ################### Order Decider / Command Handler ########################

/**
 * Order `pure` event-sourced command handler / a decision-making component
 * ___
 * A pure command handling algorithm, responsible for evolving the state of the order.
 * It does not produce any side effects, such as I/O, logging, etc.
 * It utilizes type narrowing to make sure that the command is handled exhaustively.
 * https://www.typescriptlang.org/docs/handbook/2/narrowing.html#exhaustiveness-checking
 * ___
 * @param c - command type that is being handled - `OrderCommand`
 * @param s - state type that is being evolved - `Order | null`
 * @param e - event type that is being produced / a fact / an outcome of the decision - `Order`Event`
 */
export const orderDecider: AggregateDecider<
  OrderCommand,
  Order | null,
  OrderEvent
> = new AggregateDecider<OrderCommand, Order | null, OrderEvent>(
  (command, currentState) => {
    switch (command.kind) {
      case "CreateOrderCommand":
        if (currentState !== null && currentState.orderId !== undefined) {
          throw new Error("Order already exist!");
        }
        return [
          {
            version: 1,
            decider: "Order",
            kind: "OrderCreatedEvent",
            id: command.id,
            restaurantId: command.restaurantId,
            menuItems: command.menuItems,
            final: false,
          },
        ];
      case "MarkOrderAsPreparedCommand":
        if (currentState === null) {
          throw new Error("Order does not exist!");
        }
        return [
          {
            version: 1,
            decider: "Order",
            kind: "OrderPreparedEvent",
            id: currentState.orderId,
            final: false,
          },
        ];
      default: {
        // Exhaustive matching of the command type
        const _exhaustiveCheck: never = command;
        return [];
      }
    }
  },
  (currentState, event) => {
    switch (event.kind) {
      case "OrderCreatedEvent":
        return {
          orderId: event.id,
          restaurantId: event.restaurantId,
          menuItems: event.menuItems,
          status: "CREATED",
        };
      case "OrderPreparedEvent":
        return currentState !== null
          ? {
            orderId: currentState.orderId,
            restaurantId: currentState.restaurantId,
            menuItems: currentState.menuItems,
            status: "PREPARED",
          }
          : currentState;
      default: {
        // Exhaustive matching of the event type
        const _exhaustiveCheck: never = event;
        return currentState;
      }
    }
  },
  null,
);

/**
 * Order view state / a data type that represents the current state of the Order View
 */
export type OrderView = {
  readonly orderId: OrderId;
  readonly restaurantId: RestaurantId;
  readonly menuItems: MenuItem[];
  readonly status: OrderStatus;
};

// ####################### Order View / Event Handler ##############################

/**
 * A pure event handling algorithm, responsible for translating the events into denormalized view state, which is more adequate for querying.
 * ___
 * It does not produce any side effects, such as I/O, logging, etc.
 * It utilizes type narrowing to make sure that the event is handled exhaustively.
 * https://www.typescriptlang.org/docs/handbook/2/narrowing.html#exhaustiveness-checking
 * ___
 * @param s - a view state that is being evolved out of the events - `OrderView | null`
 * @param e - event type that is being handled - `OrderEvent`
 */
export const orderView: Projection<OrderView | null, OrderEvent> =
  new Projection<
    OrderView | null,
    OrderEvent
  >(
    (currentState, event) => {
      switch (event.kind) {
        case "OrderCreatedEvent":
          return {
            orderId: event.id,
            restaurantId: event.restaurantId,
            menuItems: event.menuItems,
            status: "CREATED",
          };
        case "OrderPreparedEvent":
          return currentState !== null
            ? {
              orderId: currentState.orderId,
              restaurantId: currentState.restaurantId,
              menuItems: currentState.menuItems,
              status: "PREPARED",
            }
            : currentState;
        default: {
          // Exhaustive matching of the event type
          const _exhaustiveCheck: never = event;
          return currentState;
        }
      }
    },
    null,
  );

// ####################### Restaurant - Order Workflow / Process Manager ##############################

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
