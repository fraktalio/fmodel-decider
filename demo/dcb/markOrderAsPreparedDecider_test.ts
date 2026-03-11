import { DeciderEventSourcedSpec } from "../../test_specification.ts";
import { markOrderAsPreparedDecider } from "./markOrderAsPreparedDecider.ts";
import {
  type MarkOrderAsPreparedCommand,
  type MenuItem,
  menuItemId,
  OrderAlreadyPreparedError,
  orderId,
  OrderNotFoundError,
  restaurantId,
} from "./api.ts";

// Test data
const testMenuItems: MenuItem[] = [
  { menuItemId: menuItemId("item-1"), name: "Pizza", price: "10.00" },
];

Deno.test("Mark Order As Prepared - Success", () => {
  const command: MarkOrderAsPreparedCommand = {
    kind: "MarkOrderAsPreparedCommand",
    orderId: orderId("order-1"),
  };

  DeciderEventSourcedSpec.for(markOrderAsPreparedDecider)
    .given([
      {
        kind: "RestaurantOrderPlacedEvent",
        restaurantId: restaurantId("restaurant-1"),
        orderId: orderId("order-1"),
        menuItems: testMenuItems,
        final: false,
        tagFields: ["restaurantId", "orderId"],
      },
    ])
    .when(command)
    .then([
      {
        kind: "OrderPreparedEvent",
        orderId: orderId("order-1"),
        final: false,
        tagFields: ["orderId"],
      },
    ]);
});

Deno.test("Mark Order As Prepared - Order Does Not Exist (throws error)", () => {
  const command: MarkOrderAsPreparedCommand = {
    kind: "MarkOrderAsPreparedCommand",
    orderId: orderId("order-1"),
  };

  DeciderEventSourcedSpec.for(markOrderAsPreparedDecider)
    .given([])
    .when(command)
    .thenThrows((error) => error instanceof OrderNotFoundError);
});

Deno.test("Mark Order As Prepared - Already Prepared (throws error)", () => {
  const command: MarkOrderAsPreparedCommand = {
    kind: "MarkOrderAsPreparedCommand",
    orderId: orderId("order-1"),
  };

  DeciderEventSourcedSpec.for(markOrderAsPreparedDecider)
    .given([
      {
        kind: "RestaurantOrderPlacedEvent",
        restaurantId: restaurantId("restaurant-1"),
        orderId: orderId("order-1"),
        menuItems: testMenuItems,
        final: false,
        tagFields: ["restaurantId", "orderId"],
      },
      {
        kind: "OrderPreparedEvent",
        orderId: orderId("order-1"),
        final: false,
        tagFields: ["orderId"],
      },
    ])
    .when(command)
    .thenThrows((error) => error instanceof OrderAlreadyPreparedError);
});
