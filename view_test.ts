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

import { Projection } from "./view.ts";
import { ViewSpecification } from "./test_specification.ts";

// Order Fulfillment View/Projection Domain Model

/**
 * Order Events that the projection will consume to build up state
 */
type OrderEvent =
  | {
    type: "OrderCreated";
    orderId: string;
    customerId: string;
    items: OrderItem[];
    totalAmount: number;
    timestamp: string;
  }
  | {
    type: "PaymentProcessed";
    orderId: string;
    paymentId: string;
    amount: number;
    timestamp: string;
  }
  | {
    type: "InventoryReserved";
    orderId: string;
    items: OrderItem[];
    timestamp: string;
  }
  | {
    type: "OrderShipped";
    orderId: string;
    trackingId: string;
    shippingAddress: string;
    timestamp: string;
  }
  | {
    type: "OrderDelivered";
    orderId: string;
    deliveryTimestamp: string;
  }
  | {
    type: "OrderCancelled";
    orderId: string;
    reason: string;
    timestamp: string;
  };

/**
 * Order Item structure
 */
type OrderItem = {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
};

/**
 * Order Summary State - what the projection builds up
 */
type OrderSummaryState = {
  orderId: string;
  customerId: string;
  status:
    | "created"
    | "paid"
    | "reserved"
    | "shipped"
    | "delivered"
    | "cancelled";
  items: OrderItem[];
  totalAmount: number;
  paymentId?: string;
  trackingId?: string;
  shippingAddress?: string;
  createdAt?: string;
  paidAt?: string;
  shippedAt?: string;
  deliveredAt?: string;
  cancelledAt?: string;
  cancellationReason?: string;
  itemCount: number;
  totalQuantity: number;
};

/**
 * Initial state for the Order Summary projection
 */
const initialOrderSummaryState: OrderSummaryState = {
  orderId: "",
  customerId: "",
  status: "created",
  items: [],
  totalAmount: 0,
  itemCount: 0,
  totalQuantity: 0,
};

/**
 * Order Summary Projection - builds up order state from events
 */
const orderSummaryProjection = new Projection<OrderSummaryState, OrderEvent>(
  (state, event) => {
    switch (event.type) {
      case "OrderCreated":
        return {
          ...state,
          orderId: event.orderId,
          customerId: event.customerId,
          status: "created" as const,
          items: event.items,
          totalAmount: event.totalAmount,
          createdAt: event.timestamp,
          itemCount: event.items.length,
          totalQuantity: event.items.reduce(
            (sum, item) => sum + item.quantity,
            0,
          ),
        };

      case "PaymentProcessed":
        if (state.orderId === event.orderId) {
          return {
            ...state,
            status: "paid" as const,
            paymentId: event.paymentId,
            paidAt: event.timestamp,
          };
        }
        return state;

      case "InventoryReserved":
        if (state.orderId === event.orderId) {
          return {
            ...state,
            status: "reserved" as const,
          };
        }
        return state;

      case "OrderShipped":
        if (state.orderId === event.orderId) {
          return {
            ...state,
            status: "shipped" as const,
            trackingId: event.trackingId,
            shippingAddress: event.shippingAddress,
            shippedAt: event.timestamp,
          };
        }
        return state;

      case "OrderDelivered":
        if (state.orderId === event.orderId) {
          return {
            ...state,
            status: "delivered" as const,
            deliveredAt: event.deliveryTimestamp,
          };
        }
        return state;

      case "OrderCancelled":
        if (state.orderId === event.orderId) {
          return {
            ...state,
            status: "cancelled" as const,
            cancelledAt: event.timestamp,
            cancellationReason: event.reason,
          };
        }
        return state;

      default: {
        // Exhaustive matching
        const _exhaustiveCheck: never = event;
        return state;
      }
    }
  },
  initialOrderSummaryState,
);

// Test Data
const sampleOrderItems: OrderItem[] = [
  {
    productId: "prod-1",
    productName: "Wireless Headphones",
    quantity: 1,
    unitPrice: 99.99,
  },
  {
    productId: "prod-2",
    productName: "USB Cable",
    quantity: 2,
    unitPrice: 12.50,
  },
];

const orderCreatedEvent: OrderEvent = {
  type: "OrderCreated",
  orderId: "order-123",
  customerId: "customer-456",
  items: sampleOrderItems,
  totalAmount: 124.99,
  timestamp: "2025-01-01T10:00:00Z",
};

const paymentProcessedEvent: OrderEvent = {
  type: "PaymentProcessed",
  orderId: "order-123",
  paymentId: "payment-789",
  amount: 124.99,
  timestamp: "2025-01-01T10:05:00Z",
};

const inventoryReservedEvent: OrderEvent = {
  type: "InventoryReserved",
  orderId: "order-123",
  items: sampleOrderItems,
  timestamp: "2025-01-01T10:10:00Z",
};

const orderShippedEvent: OrderEvent = {
  type: "OrderShipped",
  orderId: "order-123",
  trackingId: "track-abc123",
  shippingAddress: "123 Main St, City, State 12345",
  timestamp: "2025-01-01T14:00:00Z",
};

const orderDeliveredEvent: OrderEvent = {
  type: "OrderDelivered",
  orderId: "order-123",
  deliveryTimestamp: "2025-01-03T16:30:00Z",
};

const orderCancelledEvent: OrderEvent = {
  type: "OrderCancelled",
  orderId: "order-123",
  reason: "Customer requested cancellation",
  timestamp: "2025-01-01T11:00:00Z",
};

// Tests using ViewSpecification

Deno.test("Order Summary Projection - Order Creation", () => {
  ViewSpecification.for(orderSummaryProjection)
    .given([orderCreatedEvent])
    .then({
      orderId: "order-123",
      customerId: "customer-456",
      status: "created",
      items: sampleOrderItems,
      totalAmount: 124.99,
      createdAt: "2025-01-01T10:00:00Z",
      itemCount: 2,
      totalQuantity: 3,
    });
});

Deno.test("Order Summary Projection - Payment Processing", () => {
  ViewSpecification.for(orderSummaryProjection)
    .given([orderCreatedEvent, paymentProcessedEvent])
    .then({
      orderId: "order-123",
      customerId: "customer-456",
      status: "paid",
      items: sampleOrderItems,
      totalAmount: 124.99,
      createdAt: "2025-01-01T10:00:00Z",
      paidAt: "2025-01-01T10:05:00Z",
      paymentId: "payment-789",
      itemCount: 2,
      totalQuantity: 3,
    });
});

Deno.test("Order Summary Projection - Complete Order Fulfillment", () => {
  ViewSpecification.for(orderSummaryProjection)
    .given([
      orderCreatedEvent,
      paymentProcessedEvent,
      inventoryReservedEvent,
      orderShippedEvent,
      orderDeliveredEvent,
    ])
    .then({
      orderId: "order-123",
      customerId: "customer-456",
      status: "delivered",
      items: sampleOrderItems,
      totalAmount: 124.99,
      createdAt: "2025-01-01T10:00:00Z",
      paidAt: "2025-01-01T10:05:00Z",
      paymentId: "payment-789",
      trackingId: "track-abc123",
      shippingAddress: "123 Main St, City, State 12345",
      shippedAt: "2025-01-01T14:00:00Z",
      deliveredAt: "2025-01-03T16:30:00Z",
      itemCount: 2,
      totalQuantity: 3,
    });
});

Deno.test("Order Summary Projection - Order Cancellation", () => {
  ViewSpecification.for(orderSummaryProjection)
    .given([orderCreatedEvent, paymentProcessedEvent, orderCancelledEvent])
    .then({
      orderId: "order-123",
      customerId: "customer-456",
      status: "cancelled",
      items: sampleOrderItems,
      totalAmount: 124.99,
      createdAt: "2025-01-01T10:00:00Z",
      paidAt: "2025-01-01T10:05:00Z",
      paymentId: "payment-789",
      cancelledAt: "2025-01-01T11:00:00Z",
      cancellationReason: "Customer requested cancellation",
      itemCount: 2,
      totalQuantity: 3,
    });
});

Deno.test("Order Summary Projection - Empty Event Stream", () => {
  ViewSpecification.for(orderSummaryProjection)
    .given([])
    .then(initialOrderSummaryState);
});

Deno.test("Order Summary Projection - Unrelated Order Events Ignored", () => {
  const unrelatedEvent: OrderEvent = {
    type: "PaymentProcessed",
    orderId: "different-order-456",
    paymentId: "payment-999",
    amount: 50.0,
    timestamp: "2025-01-01T10:05:00Z",
  };

  ViewSpecification.for(orderSummaryProjection)
    .given([orderCreatedEvent, unrelatedEvent])
    .then({
      orderId: "order-123",
      customerId: "customer-456",
      status: "created",
      items: sampleOrderItems,
      totalAmount: 124.99,
      createdAt: "2025-01-01T10:00:00Z",
      itemCount: 2,
      totalQuantity: 3,
    });
});

// Customer Order History Projection - demonstrates a different view of the same events

/**
 * Customer Order History State - aggregates orders by customer
 */
type CustomerOrderHistoryState = {
  customerId: string;
  totalOrders: number;
  totalSpent: number;
  orderStatuses: Record<string, string>; // orderId -> status
  lastOrderDate?: string;
  averageOrderValue: number;
};

const initialCustomerHistoryState: CustomerOrderHistoryState = {
  customerId: "",
  totalOrders: 0,
  totalSpent: 0,
  orderStatuses: {},
  averageOrderValue: 0,
};

/**
 * Customer Order History Projection - tracks customer order statistics
 */
const customerOrderHistoryProjection = new Projection<
  CustomerOrderHistoryState,
  OrderEvent
>(
  (state, event) => {
    switch (event.type) {
      case "OrderCreated": {
        const newTotalOrders = state.totalOrders + 1;
        const newTotalSpent = state.totalSpent + event.totalAmount;
        return {
          ...state,
          customerId: event.customerId,
          totalOrders: newTotalOrders,
          totalSpent: newTotalSpent,
          orderStatuses: {
            ...state.orderStatuses,
            [event.orderId]: "created",
          },
          lastOrderDate: event.timestamp,
          averageOrderValue: newTotalSpent / newTotalOrders,
        };
      }

      case "PaymentProcessed":
        return {
          ...state,
          orderStatuses: {
            ...state.orderStatuses,
            [event.orderId]: "paid",
          },
        };

      case "OrderDelivered":
        return {
          ...state,
          orderStatuses: {
            ...state.orderStatuses,
            [event.orderId]: "delivered",
          },
        };

      case "OrderCancelled": {
        // Remove cancelled order from totals
        const orderWasCreated =
          state.orderStatuses[event.orderId] === "created" ||
          state.orderStatuses[event.orderId] === "paid";

        if (orderWasCreated) {
          const newTotalOrders = Math.max(0, state.totalOrders - 1);
          // Note: In a real system, you'd need to track the order amount to subtract it
          return {
            ...state,
            totalOrders: newTotalOrders,
            orderStatuses: {
              ...state.orderStatuses,
              [event.orderId]: "cancelled",
            },
            averageOrderValue: newTotalOrders > 0
              ? state.totalSpent / newTotalOrders
              : 0,
          };
        }
        return {
          ...state,
          orderStatuses: {
            ...state.orderStatuses,
            [event.orderId]: "cancelled",
          },
        };
      }

      default:
        return state;
    }
  },
  initialCustomerHistoryState,
);

Deno.test("Customer Order History Projection - Single Order Lifecycle", () => {
  ViewSpecification.for(customerOrderHistoryProjection)
    .given([
      orderCreatedEvent,
      paymentProcessedEvent,
      orderDeliveredEvent,
    ])
    .then({
      customerId: "customer-456",
      totalOrders: 1,
      totalSpent: 124.99,
      orderStatuses: {
        "order-123": "delivered",
      },
      lastOrderDate: "2025-01-01T10:00:00Z",
      averageOrderValue: 124.99,
    });
});

Deno.test("Customer Order History Projection - Order Cancellation", () => {
  ViewSpecification.for(customerOrderHistoryProjection)
    .given([
      orderCreatedEvent,
      orderCancelledEvent,
    ])
    .then({
      customerId: "customer-456",
      totalOrders: 0, // Cancelled order removed from count
      totalSpent: 124.99, // Note: In real system, would subtract amount
      orderStatuses: {
        "order-123": "cancelled",
      },
      lastOrderDate: "2025-01-01T10:00:00Z",
      averageOrderValue: 0,
    });
});
