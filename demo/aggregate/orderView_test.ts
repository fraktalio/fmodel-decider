import { ViewSpecification } from "../../test_specification.ts";
import { orderView } from "./orderView.ts";
import type { MenuItem } from "./api.ts";

const testMenuItems: MenuItem[] = [
  { menuItemId: "item-1", name: "Pizza", price: "10.00" },
];

Deno.test("Order View - Order Created Event", () => {
  ViewSpecification.for(orderView)
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
    .then({
      orderId: "order-1",
      restaurantId: "restaurant-1",
      menuItems: testMenuItems,
      status: "CREATED",
    });
});

Deno.test("Order View - Order Prepared Event", () => {
  ViewSpecification.for(orderView)
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
      {
        version: 1,
        decider: "Order",
        kind: "OrderPreparedEvent",
        id: "order-1",
        final: false,
      },
    ])
    .then({
      orderId: "order-1",
      restaurantId: "restaurant-1",
      menuItems: testMenuItems,
      status: "PREPARED",
    });
});

Deno.test("Order View - Order Prepared Event with Null State", () => {
  ViewSpecification.for(orderView)
    .given([
      {
        version: 1,
        decider: "Order",
        kind: "OrderPreparedEvent",
        id: "order-1",
        final: false,
      },
    ])
    .then(null);
});
