import { DeciderEventSourcedSpec } from "../../test_specification.ts";
import { markOrderAsPreparedDecider } from "./markOrderAsPrepared.ts";
import type { MarkOrderAsPreparedCommand, MenuItem } from "./api.ts";

// Test data
const testMenuItems: MenuItem[] = [
  { menuItemId: "item-1", name: "Pizza", price: "10.00" },
];

Deno.test("Mark Order As Prepared - Success", () => {
  const command: MarkOrderAsPreparedCommand = {
    kind: "MarkOrderAsPreparedCommand",
    id: "order-1",
  };

  DeciderEventSourcedSpec.for(markOrderAsPreparedDecider)
    .given([
      {
        kind: "RestaurantOrderPlacedEvent",
        restaurantId: "restaurant-1",
        orderId: "order-1",
        menuItems: testMenuItems,
        final: false,
      },
    ])
    .when(command)
    .then([
      {
        kind: "OrderPreparedEvent",
        orderId: "order-1",
        final: false,
      },
    ]);
});

Deno.test("Mark Order As Prepared - Order Does Not Exist (throws error)", () => {
  const command: MarkOrderAsPreparedCommand = {
    kind: "MarkOrderAsPreparedCommand",
    id: "order-1",
  };

  DeciderEventSourcedSpec.for(markOrderAsPreparedDecider)
    .given([])
    .when(command)
    .thenThrows((error) => error.message === "Order does not exist!");
});

Deno.test("Mark Order As Prepared - Already Prepared (throws error)", () => {
  const command: MarkOrderAsPreparedCommand = {
    kind: "MarkOrderAsPreparedCommand",
    id: "order-1",
  };

  DeciderEventSourcedSpec.for(markOrderAsPreparedDecider)
    .given([
      {
        kind: "RestaurantOrderPlacedEvent",
        restaurantId: "restaurant-1",
        orderId: "order-1",
        menuItems: testMenuItems,
        final: false,
      },
      {
        kind: "OrderPreparedEvent",
        orderId: "order-1",
        final: false,
      },
    ])
    .when(command)
    .thenThrows((error) => error.message === "Order already prepared!");
});
