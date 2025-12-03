import { DeciderEventSourcedSpec } from "../../test_specification.ts";
import { orderDecider } from "./orderDecider.ts";
import type {
  CreateOrderCommand,
  MarkOrderAsPreparedCommand,
  MenuItem,
} from "./api.ts";

const testMenuItems: MenuItem[] = [
  { menuItemId: "item-1", name: "Pizza", price: "10.00" },
];

Deno.test("Order Decider - Create Order Success", () => {
  const command: CreateOrderCommand = {
    decider: "Order",
    kind: "CreateOrderCommand",
    id: "order-1",
    restaurantId: "restaurant-1",
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
        id: "order-1",
        restaurantId: "restaurant-1",
        menuItems: testMenuItems,
        final: false,
      },
    ]);
});

Deno.test("Order Decider - Create Order Already Exists", () => {
  const command: CreateOrderCommand = {
    decider: "Order",
    kind: "CreateOrderCommand",
    id: "order-1",
    restaurantId: "restaurant-1",
    menuItems: testMenuItems,
  };

  DeciderEventSourcedSpec.for(orderDecider)
    .given([
      {
        version: 1,
        decider: "Order",
        kind: "OrderCreatedEvent",
        id: "order-1",
        restaurantId: "restaurant-1",
        menuItems: testMenuItems,
        final: false,
      },
    ])
    .when(command)
    .thenThrows((error) => error.message === "Order already exist!");
});

Deno.test("Order Decider - Mark Order As Prepared Success", () => {
  const command: MarkOrderAsPreparedCommand = {
    decider: "Order",
    kind: "MarkOrderAsPreparedCommand",
    id: "order-1",
  };

  DeciderEventSourcedSpec.for(orderDecider)
    .given([
      {
        version: 1,
        decider: "Order",
        kind: "OrderCreatedEvent",
        id: "order-1",
        restaurantId: "restaurant-1",
        menuItems: testMenuItems,
        final: false,
      },
    ])
    .when(command)
    .then([
      {
        version: 1,
        decider: "Order",
        kind: "OrderPreparedEvent",
        id: "order-1",
        final: false,
      },
    ]);
});

Deno.test("Order Decider - Mark Order As Prepared Order Does Not Exist", () => {
  const command: MarkOrderAsPreparedCommand = {
    decider: "Order",
    kind: "MarkOrderAsPreparedCommand",
    id: "order-1",
  };

  DeciderEventSourcedSpec.for(orderDecider)
    .given([])
    .when(command)
    .thenThrows((error) => error.message === "Order does not exist!");
});
