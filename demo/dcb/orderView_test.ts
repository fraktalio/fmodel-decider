import { ViewSpecification } from "../../test_specification.ts";
import { orderView } from "./orderView.ts";
import type { MenuItem } from "./api.ts";

const testMenuItems: MenuItem[] = [
  { menuItemId: "item-1", name: "Pizza", price: "10.00" },
];

Deno.test("Order View - Order Prepared Event", () => {
  ViewSpecification.for(orderView)
    .given([
      {
        kind: "OrderPreparedEvent",
        orderId: "order-1",
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
