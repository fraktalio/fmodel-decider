import { AggregateDecider, DcbDecider } from "./decider.ts";
import {
  DeciderEventSourcedSpec,
  DeciderStateStoredSpec,
} from "./test_specification.ts";

// Order Domain Types
type OrderId = string;
type CustomerId = string;
type ProductId = string;
type Quantity = number;
type Amount = number;

// Commands with discriminated union using 'kind' property for better exhaustive matching
type OrderCommand =
  | { kind: "CreateOrderCommand"; orderId: OrderId; customerId: CustomerId }
  | {
    kind: "AddItemCommand";
    productId: ProductId;
    quantity: Quantity;
    price: Amount;
  }
  | { kind: "RemoveItemCommand"; productId: ProductId }
  | { kind: "ConfirmOrderCommand" }
  | { kind: "ShipOrderCommand" }
  | { kind: "CancelOrderCommand"; reason: string };

// Events with discriminated union using 'kind' property for better exhaustive matching
type OrderEvent =
  | { kind: "OrderCreatedEvent"; orderId: OrderId; customerId: CustomerId }
  | {
    kind: "OrderNotCreatedEvent";
    orderId: OrderId;
    customerId: CustomerId;
    reason: string;
  }
  | {
    kind: "ItemAddedEvent";
    productId: ProductId;
    quantity: Quantity;
    price: Amount;
  }
  | {
    kind: "ItemNotAddedEvent";
    productId: ProductId;
    quantity: Quantity;
    price: Amount;
    reason: string;
  }
  | { kind: "ItemRemovedEvent"; productId: ProductId }
  | { kind: "ItemNotRemovedEvent"; productId: ProductId; reason: string }
  | { kind: "OrderConfirmedEvent"; totalAmount: Amount }
  | { kind: "OrderNotConfirmedEvent"; reason: string }
  | { kind: "OrderShippedEvent"; shippingDate: Date }
  | { kind: "OrderNotShippedEvent"; reason: string }
  | { kind: "OrderCancelledEvent"; reason: string }
  | { kind: "OrderNotCancelledEvent"; reason: string };

// State
type OrderStatus = "Draft" | "Confirmed" | "Shipped" | "Cancelled";

interface OrderItem {
  readonly productId: ProductId;
  readonly quantity: Quantity;
  readonly price: Amount;
}

interface OrderState {
  readonly orderId?: OrderId;
  readonly customerId?: CustomerId;
  readonly status: OrderStatus;
  readonly items: readonly OrderItem[];
  readonly totalAmount: Amount;
}

// Initial State
const initialOrderState: OrderState = {
  status: "Draft",
  items: [],
  totalAmount: 0,
};

/**
 * Order `pure` event-sourced command handler / a decision-making component
 * ___
 * A pure command handling algorithm, responsible for evolving the state of the order.
 * It does not produce any side effects, such as I/O, logging, etc.
 * It utilizes type narrowing to make sure that the command is handled exhaustively.
 * https://www.typescriptlang.org/docs/handbook/2/narrowing.html#exhaustiveness-checking
 * ___
 * @param command - command type that is being handled - `OrderCommand`
 * @param state - state type that is being evolved - `OrderState`
 * @returns event type that is being produced / a fact / an outcome of the decision - `OrderEvent[]`
 */
const decide = (
  command: OrderCommand,
  state: OrderState,
): readonly OrderEvent[] => {
  switch (command.kind) {
    case "CreateOrderCommand":
      return state.orderId
        ? [{
          kind: "OrderNotCreatedEvent",
          orderId: command.orderId,
          customerId: command.customerId,
          reason: "Order already exists",
        }]
        : [{
          kind: "OrderCreatedEvent",
          orderId: command.orderId,
          customerId: command.customerId,
        }];

    case "AddItemCommand":
      if (!state.orderId) {
        return [{
          kind: "ItemNotAddedEvent",
          productId: command.productId,
          quantity: command.quantity,
          price: command.price,
          reason: "Order must be created first",
        }];
      }
      if (state.status !== "Draft") {
        return [{
          kind: "ItemNotAddedEvent",
          productId: command.productId,
          quantity: command.quantity,
          price: command.price,
          reason: "Cannot add items to non-draft order",
        }];
      }
      return [{
        kind: "ItemAddedEvent",
        productId: command.productId,
        quantity: command.quantity,
        price: command.price,
      }];

    case "RemoveItemCommand":
      if (state.status !== "Draft") {
        return [{
          kind: "ItemNotRemovedEvent",
          productId: command.productId,
          reason: "Cannot remove items from non-draft order",
        }];
      }
      const itemExists = state.items.some((item) =>
        item.productId === command.productId
      );
      if (!itemExists) {
        return [{
          kind: "ItemNotRemovedEvent",
          productId: command.productId,
          reason: "Item not found in order",
        }];
      }
      return [{ kind: "ItemRemovedEvent", productId: command.productId }];

    case "ConfirmOrderCommand":
      if (state.status !== "Draft") {
        return [{
          kind: "OrderNotConfirmedEvent",
          reason: "Order must be in draft status to confirm",
        }];
      }
      if (state.items.length === 0) {
        return [{
          kind: "OrderNotConfirmedEvent",
          reason: "Cannot confirm order with no items",
        }];
      }
      return [{ kind: "OrderConfirmedEvent", totalAmount: state.totalAmount }];

    case "ShipOrderCommand":
      if (state.status !== "Confirmed") {
        return [{
          kind: "OrderNotShippedEvent",
          reason: "Order must be confirmed to ship",
        }];
      }
      return [{ kind: "OrderShippedEvent", shippingDate: new Date() }];

    case "CancelOrderCommand":
      if (state.status === "Shipped") {
        return [{
          kind: "OrderNotCancelledEvent",
          reason: "Cannot cancel shipped order",
        }];
      }
      if (state.status === "Cancelled") {
        return [{
          kind: "OrderNotCancelledEvent",
          reason: "Order already cancelled",
        }];
      }
      return [{ kind: "OrderCancelledEvent", reason: command.reason }];

    default: {
      // Exhaustive matching of the command type
      const _: never = command;
      return [];
    }
  }
};

/**
 * Order state evolution function
 * ___
 * A pure event handling algorithm, responsible for evolving the state based on events.
 * It utilizes type narrowing to make sure that the event is handled exhaustively.
 * https://www.typescriptlang.org/docs/handbook/2/narrowing.html#exhaustiveness-checking
 * ___
 * @param state - current state - `OrderState`
 * @param event - event type that is being handled - `OrderEvent`
 * @returns new state - `OrderState`
 */
const evolve = (state: OrderState, event: OrderEvent): OrderState => {
  switch (event.kind) {
    case "OrderCreatedEvent":
      return {
        ...state,
        orderId: event.orderId,
        customerId: event.customerId,
      };

    case "OrderNotCreatedEvent":
      return state;

    case "ItemAddedEvent":
      const newItem: OrderItem = {
        productId: event.productId,
        quantity: event.quantity,
        price: event.price,
      };
      const updatedItems = [...state.items, newItem];
      const newTotal = updatedItems.reduce(
        (sum, item) => sum + (item.quantity * item.price),
        0,
      );

      return {
        ...state,
        items: updatedItems,
        totalAmount: newTotal,
      };

    case "ItemNotAddedEvent":
      return state;

    case "ItemRemovedEvent":
      const filteredItems = state.items.filter((item) =>
        item.productId !== event.productId
      );
      const updatedTotal = filteredItems.reduce(
        (sum, item) => sum + (item.quantity * item.price),
        0,
      );

      return {
        ...state,
        items: filteredItems,
        totalAmount: updatedTotal,
      };

    case "ItemNotRemovedEvent":
      return state;

    case "OrderConfirmedEvent":
      return {
        ...state,
        status: "Confirmed",
      };

    case "OrderNotConfirmedEvent":
      return state;

    case "OrderShippedEvent":
      return {
        ...state,
        status: "Shipped",
      };

    case "OrderNotShippedEvent":
      return state;

    case "OrderCancelledEvent":
      return {
        ...state,
        status: "Cancelled",
      };

    case "OrderNotCancelledEvent":
      return state;

    default: {
      // Exhaustive matching of the event type
      const _: never = event;
      return state;
    }
  }
};

// Create Deciders
const orderDcbDecider = new DcbDecider(decide, evolve, initialOrderState);
const orderAggregateDecider = new AggregateDecider(
  decide,
  evolve,
  initialOrderState,
);

// Event-Sourced Tests using DcbDecider
Deno.test("Order Creation - Event Sourced", () => {
  DeciderEventSourcedSpec.for(orderDcbDecider)
    .given([])
    .when({
      kind: "CreateOrderCommand",
      orderId: "order-123",
      customerId: "customer-456",
    })
    .then([{
      kind: "OrderCreatedEvent",
      orderId: "order-123",
      customerId: "customer-456",
    }]);
});

Deno.test("Order Creation Failure - Event Sourced", () => {
  DeciderEventSourcedSpec.for(orderDcbDecider)
    .given([
      {
        kind: "OrderCreatedEvent",
        orderId: "order-123",
        customerId: "customer-456",
      },
    ])
    .when({
      kind: "CreateOrderCommand",
      orderId: "order-456",
      customerId: "customer-789",
    })
    .then([{
      kind: "OrderNotCreatedEvent",
      orderId: "order-456",
      customerId: "customer-789",
      reason: "Order already exists",
    }]);
});

Deno.test("Add Item to Order - Event Sourced", () => {
  DeciderEventSourcedSpec.for(orderDcbDecider)
    .given([
      {
        kind: "OrderCreatedEvent",
        orderId: "order-123",
        customerId: "customer-456",
      },
    ])
    .when({
      kind: "AddItemCommand",
      productId: "product-789",
      quantity: 2,
      price: 25.99,
    })
    .then([{
      kind: "ItemAddedEvent",
      productId: "product-789",
      quantity: 2,
      price: 25.99,
    }]);
});

Deno.test("Add Item Failure - No Order - Event Sourced", () => {
  DeciderEventSourcedSpec.for(orderDcbDecider)
    .given([])
    .when({
      kind: "AddItemCommand",
      productId: "product-789",
      quantity: 2,
      price: 25.99,
    })
    .then([{
      kind: "ItemNotAddedEvent",
      productId: "product-789",
      quantity: 2,
      price: 25.99,
      reason: "Order must be created first",
    }]);
});

Deno.test("Confirm Order - Event Sourced", () => {
  DeciderEventSourcedSpec.for(orderDcbDecider)
    .given([
      {
        kind: "OrderCreatedEvent",
        orderId: "order-123",
        customerId: "customer-456",
      },
      {
        kind: "ItemAddedEvent",
        productId: "product-789",
        quantity: 2,
        price: 25.99,
      },
    ])
    .when({ kind: "ConfirmOrderCommand" })
    .then([{ kind: "OrderConfirmedEvent", totalAmount: 51.98 }]);
});

Deno.test("Confirm Order Failure - Empty Order - Event Sourced", () => {
  DeciderEventSourcedSpec.for(orderDcbDecider)
    .given([
      {
        kind: "OrderCreatedEvent",
        orderId: "order-123",
        customerId: "customer-456",
      },
    ])
    .when({ kind: "ConfirmOrderCommand" })
    .then([{
      kind: "OrderNotConfirmedEvent",
      reason: "Cannot confirm order with no items",
    }]);
});

Deno.test("Ship Order - Event Sourced", () => {
  const shippingDate = new Date();
  DeciderEventSourcedSpec.for(orderDcbDecider)
    .given([
      {
        kind: "OrderCreatedEvent",
        orderId: "order-123",
        customerId: "customer-456",
      },
      {
        kind: "ItemAddedEvent",
        productId: "product-789",
        quantity: 2,
        price: 25.99,
      },
      { kind: "OrderConfirmedEvent", totalAmount: 51.98 },
    ])
    .when({ kind: "ShipOrderCommand" })
    .then([{ kind: "OrderShippedEvent", shippingDate }]);
});

Deno.test("Ship Order Failure - Not Confirmed - Event Sourced", () => {
  DeciderEventSourcedSpec.for(orderDcbDecider)
    .given([
      {
        kind: "OrderCreatedEvent",
        orderId: "order-123",
        customerId: "customer-456",
      },
      {
        kind: "ItemAddedEvent",
        productId: "product-789",
        quantity: 2,
        price: 25.99,
      },
    ])
    .when({ kind: "ShipOrderCommand" })
    .then([{
      kind: "OrderNotShippedEvent",
      reason: "Order must be confirmed to ship",
    }]);
});

Deno.test("Cancel Order - Event Sourced", () => {
  DeciderEventSourcedSpec.for(orderDcbDecider)
    .given([
      {
        kind: "OrderCreatedEvent",
        orderId: "order-123",
        customerId: "customer-456",
      },
      {
        kind: "ItemAddedEvent",
        productId: "product-789",
        quantity: 2,
        price: 25.99,
      },
    ])
    .when({
      kind: "CancelOrderCommand",
      reason: "Customer requested cancellation",
    })
    .then([{
      kind: "OrderCancelledEvent",
      reason: "Customer requested cancellation",
    }]);
});

Deno.test("Cancel Order Failure - Already Shipped - Event Sourced", () => {
  DeciderEventSourcedSpec.for(orderDcbDecider)
    .given([
      {
        kind: "OrderCreatedEvent",
        orderId: "order-123",
        customerId: "customer-456",
      },
      {
        kind: "ItemAddedEvent",
        productId: "product-789",
        quantity: 2,
        price: 25.99,
      },
      { kind: "OrderConfirmedEvent", totalAmount: 51.98 },
      { kind: "OrderShippedEvent", shippingDate: new Date() },
    ])
    .when({ kind: "CancelOrderCommand", reason: "Customer changed mind" })
    .then([{
      kind: "OrderNotCancelledEvent",
      reason: "Cannot cancel shipped order",
    }]);
});

Deno.test("Remove Item from Order - Event Sourced", () => {
  DeciderEventSourcedSpec.for(orderDcbDecider)
    .given([
      {
        kind: "OrderCreatedEvent",
        orderId: "order-123",
        customerId: "customer-456",
      },
      {
        kind: "ItemAddedEvent",
        productId: "product-789",
        quantity: 2,
        price: 25.99,
      },
      {
        kind: "ItemAddedEvent",
        productId: "product-456",
        quantity: 1,
        price: 15.50,
      },
    ])
    .when({ kind: "RemoveItemCommand", productId: "product-456" })
    .then([{ kind: "ItemRemovedEvent", productId: "product-456" }]);
});

Deno.test("Remove Item Failure - Item Not Found - Event Sourced", () => {
  DeciderEventSourcedSpec.for(orderDcbDecider)
    .given([
      {
        kind: "OrderCreatedEvent",
        orderId: "order-123",
        customerId: "customer-456",
      },
      {
        kind: "ItemAddedEvent",
        productId: "product-789",
        quantity: 2,
        price: 25.99,
      },
    ])
    .when({ kind: "RemoveItemCommand", productId: "product-456" })
    .then([{
      kind: "ItemNotRemovedEvent",
      productId: "product-456",
      reason: "Item not found in order",
    }]);
});

// State-Stored Tests using AggregateDecider
Deno.test("Order Creation - State Stored", () => {
  DeciderStateStoredSpec.for(orderAggregateDecider)
    .given(initialOrderState)
    .when({
      kind: "CreateOrderCommand",
      orderId: "order-123",
      customerId: "customer-456",
    })
    .then({
      orderId: "order-123",
      customerId: "customer-456",
      status: "Draft",
      items: [],
      totalAmount: 0,
    });
});

Deno.test("Order Creation Failure - State Stored", () => {
  const stateWithExistingOrder: OrderState = {
    orderId: "order-123",
    customerId: "customer-456",
    status: "Draft",
    items: [],
    totalAmount: 0,
  };

  DeciderStateStoredSpec.for(orderAggregateDecider)
    .given(stateWithExistingOrder)
    .when({
      kind: "CreateOrderCommand",
      orderId: "order-456",
      customerId: "customer-789",
    })
    .then(stateWithExistingOrder); // State should remain unchanged
});

Deno.test("Add Item to Order - State Stored", () => {
  const stateWithOrder: OrderState = {
    orderId: "order-123",
    customerId: "customer-456",
    status: "Draft",
    items: [],
    totalAmount: 0,
  };

  DeciderStateStoredSpec.for(orderAggregateDecider)
    .given(stateWithOrder)
    .when({
      kind: "AddItemCommand",
      productId: "product-789",
      quantity: 2,
      price: 25.99,
    })
    .then({
      orderId: "order-123",
      customerId: "customer-456",
      status: "Draft",
      items: [{ productId: "product-789", quantity: 2, price: 25.99 }],
      totalAmount: 51.98,
    });
});

Deno.test("Add Item Failure - No Order - State Stored", () => {
  DeciderStateStoredSpec.for(orderAggregateDecider)
    .given(initialOrderState)
    .when({
      kind: "AddItemCommand",
      productId: "product-789",
      quantity: 2,
      price: 25.99,
    })
    .then(initialOrderState); // State should remain unchanged
});

Deno.test("Confirm Order - State Stored", () => {
  const stateWithItems: OrderState = {
    orderId: "order-123",
    customerId: "customer-456",
    status: "Draft",
    items: [{ productId: "product-789", quantity: 2, price: 25.99 }],
    totalAmount: 51.98,
  };

  DeciderStateStoredSpec.for(orderAggregateDecider)
    .given(stateWithItems)
    .when({ kind: "ConfirmOrderCommand" })
    .then({
      orderId: "order-123",
      customerId: "customer-456",
      status: "Confirmed",
      items: [{ productId: "product-789", quantity: 2, price: 25.99 }],
      totalAmount: 51.98,
    });
});

Deno.test("Confirm Order Failure - Empty Order - State Stored", () => {
  const stateWithEmptyOrder: OrderState = {
    orderId: "order-123",
    customerId: "customer-456",
    status: "Draft",
    items: [],
    totalAmount: 0,
  };

  DeciderStateStoredSpec.for(orderAggregateDecider)
    .given(stateWithEmptyOrder)
    .when({ kind: "ConfirmOrderCommand" })
    .then(stateWithEmptyOrder); // State should remain unchanged
});

Deno.test("Ship Order - State Stored", () => {
  const confirmedOrderState: OrderState = {
    orderId: "order-123",
    customerId: "customer-456",
    status: "Confirmed",
    items: [{ productId: "product-789", quantity: 2, price: 25.99 }],
    totalAmount: 51.98,
  };

  DeciderStateStoredSpec.for(orderAggregateDecider)
    .given(confirmedOrderState)
    .when({ kind: "ShipOrderCommand" })
    .then({
      orderId: "order-123",
      customerId: "customer-456",
      status: "Shipped",
      items: [{ productId: "product-789", quantity: 2, price: 25.99 }],
      totalAmount: 51.98,
    });
});

Deno.test("Ship Order Failure - Not Confirmed - State Stored", () => {
  const draftOrderState: OrderState = {
    orderId: "order-123",
    customerId: "customer-456",
    status: "Draft",
    items: [{ productId: "product-789", quantity: 2, price: 25.99 }],
    totalAmount: 51.98,
  };

  DeciderStateStoredSpec.for(orderAggregateDecider)
    .given(draftOrderState)
    .when({ kind: "ShipOrderCommand" })
    .then(draftOrderState); // State should remain unchanged
});

Deno.test("Remove Item from Order - State Stored", () => {
  const stateWithMultipleItems: OrderState = {
    orderId: "order-123",
    customerId: "customer-456",
    status: "Draft",
    items: [
      { productId: "product-789", quantity: 2, price: 25.99 },
      { productId: "product-456", quantity: 1, price: 15.50 },
    ],
    totalAmount: 67.48,
  };

  DeciderStateStoredSpec.for(orderAggregateDecider)
    .given(stateWithMultipleItems)
    .when({ kind: "RemoveItemCommand", productId: "product-456" })
    .then({
      orderId: "order-123",
      customerId: "customer-456",
      status: "Draft",
      items: [{ productId: "product-789", quantity: 2, price: 25.99 }],
      totalAmount: 51.98,
    });
});

Deno.test("Remove Item Failure - Item Not Found - State Stored", () => {
  const stateWithOneItem: OrderState = {
    orderId: "order-123",
    customerId: "customer-456",
    status: "Draft",
    items: [{ productId: "product-789", quantity: 2, price: 25.99 }],
    totalAmount: 51.98,
  };

  DeciderStateStoredSpec.for(orderAggregateDecider)
    .given(stateWithOneItem)
    .when({ kind: "RemoveItemCommand", productId: "product-456" })
    .then(stateWithOneItem); // State should remain unchanged
});

Deno.test("Cancel Order - State Stored", () => {
  const draftOrderState: OrderState = {
    orderId: "order-123",
    customerId: "customer-456",
    status: "Draft",
    items: [{ productId: "product-789", quantity: 2, price: 25.99 }],
    totalAmount: 51.98,
  };

  DeciderStateStoredSpec.for(orderAggregateDecider)
    .given(draftOrderState)
    .when({
      kind: "CancelOrderCommand",
      reason: "Customer requested cancellation",
    })
    .then({
      orderId: "order-123",
      customerId: "customer-456",
      status: "Cancelled",
      items: [{ productId: "product-789", quantity: 2, price: 25.99 }],
      totalAmount: 51.98,
    });
});

Deno.test("Cancel Order Failure - Already Shipped - State Stored", () => {
  const shippedOrderState: OrderState = {
    orderId: "order-123",
    customerId: "customer-456",
    status: "Shipped",
    items: [{ productId: "product-789", quantity: 2, price: 25.99 }],
    totalAmount: 51.98,
  };

  DeciderStateStoredSpec.for(orderAggregateDecider)
    .given(shippedOrderState)
    .when({ kind: "CancelOrderCommand", reason: "Customer changed mind" })
    .then(shippedOrderState); // State should remain unchanged
});
