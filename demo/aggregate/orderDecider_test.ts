import { DeciderEventSourcedSpec } from "../../test_specification_deno.ts";
import { orderDecider } from "./orderDecider.ts";
import {
  type CreateOrderCommand,
  type MarkOrderAsPreparedCommand,
  type MenuItem,
  menuItemId,
  OrderAlreadyExistsError,
  orderId,
  OrderNotFoundError,
  restaurantId,
} from "./api.ts";

const testMenuItems: MenuItem[] = [
  { menuItemId: menuItemId("item-1"), name: "Pizza", price: "10.00" },
];

Deno.test("Order Decider - Create Order Success", () => {
  const command: CreateOrderCommand = {
    decider: "Order",
    kind: "CreateOrderCommand",
    orderId: orderId("order-1"),
    restaurantId: restaurantId("restaurant-1"),
    menuItems: testMenuItems,
  };

  DeciderEventSourcedSpec.for(orderDecider)
    .given([])
    .when(command)
    .then([
      {
        version: 1,
        decider: "Order",
        kind: "OrderCreatedEvent",
        orderId: orderId("order-1"),
        restaurantId: restaurantId("restaurant-1"),
        menuItems: testMenuItems,
        final: false,
        tagFields: ["orderId"],
      },
    ]);
});

Deno.test("Order Decider - Create Order Already Exists", () => {
  const command: CreateOrderCommand = {
    decider: "Order",
    kind: "CreateOrderCommand",
    orderId: orderId("order-1"),
    restaurantId: restaurantId("restaurant-1"),
    menuItems: testMenuItems,
  };

  DeciderEventSourcedSpec.for(orderDecider)
    .given([
      {
        version: 1,
        decider: "Order",
        kind: "OrderCreatedEvent",
        orderId: orderId("order-1"),
        restaurantId: restaurantId("restaurant-1"),
        menuItems: testMenuItems,
        final: false,
        tagFields: ["orderId"],
      },
    ])
    .when(command)
    .thenThrows((error) => error instanceof OrderAlreadyExistsError);
});

Deno.test("Order Decider - Mark Order As Prepared Success", () => {
  const command: MarkOrderAsPreparedCommand = {
    decider: "Order",
    kind: "MarkOrderAsPreparedCommand",
    orderId: orderId("order-1"),
  };

  DeciderEventSourcedSpec.for(orderDecider)
    .given([
      {
        version: 1,
        decider: "Order",
        kind: "OrderCreatedEvent",
        orderId: orderId("order-1"),
        restaurantId: restaurantId("restaurant-1"),
        menuItems: testMenuItems,
        final: false,
        tagFields: ["orderId"],
      },
    ])
    .when(command)
    .then([
      {
        version: 1,
        decider: "Order",
        kind: "OrderPreparedEvent",
        orderId: orderId("order-1"),
        final: false,
        tagFields: ["orderId"],
      },
    ]);
});

Deno.test("Order Decider - Mark Order As Prepared Order Does Not Exist", () => {
  const command: MarkOrderAsPreparedCommand = {
    decider: "Order",
    kind: "MarkOrderAsPreparedCommand",
    orderId: orderId("order-1"),
  };

  DeciderEventSourcedSpec.for(orderDecider)
    .given([])
    .when(command)
    .thenThrows((error) => error instanceof OrderNotFoundError);
});
