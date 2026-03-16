/**
 * Integration tests for order view event loader.
 *
 * Tests verify that EventSourcedQueryHandler correctly projects
 * order state by loading events from Deno KV and folding
 * them through the order view.
 */

import { assertEquals } from "@std/assert";
import { EventSourcedCommandHandler } from "../../application.ts";
import { createRestaurantRepository } from "./createRestaurantRepository.ts";
import { placeOrderRepository } from "./placeOrderRepository.ts";
import { markOrderAsPreparedRepository } from "./markOrderAsPreparedRepository.ts";
import { createRestaurantDecider } from "./createRestaurantDecider.ts";
import { placeOrderDecider } from "./placeOrderDecider.ts";
import { markOrderAsPreparedDecider } from "./markOrderAsPreparedDecider.ts";
import { orderViewQueryHandler } from "./orderViewEventLoader.ts";
import {
  type MenuItem,
  menuItemId,
  orderId,
  restaurantId,
  type RestaurantMenu,
  restaurantMenuId,
} from "./api.ts";

const testMenu: RestaurantMenu = {
  menuId: restaurantMenuId("m1"),
  cuisine: "ITALIAN",
  menuItems: [
    { menuItemId: menuItemId("item1"), name: "Pizza", price: "12.99" },
    { menuItemId: menuItemId("item2"), name: "Pasta", price: "10.99" },
  ],
};

const testMenuItems: MenuItem[] = [
  { menuItemId: menuItemId("item1"), name: "Pizza", price: "12.99" },
];

/** Helper to set up a restaurant and place an order */
async function setupRestaurantAndOrder(kv: Deno.Kv) {
  const createRepo = createRestaurantRepository(kv);
  const createHandler = new EventSourcedCommandHandler(
    createRestaurantDecider,
    createRepo,
  );

  await createHandler.handle({
    kind: "CreateRestaurantCommand",
    restaurantId: restaurantId("r1"),
    name: "Italian Bistro",
    menu: testMenu,
  });

  const placeRepo = placeOrderRepository(kv);
  const placeHandler = new EventSourcedCommandHandler(
    placeOrderDecider,
    placeRepo,
  );

  await placeHandler.handle({
    kind: "PlaceOrderCommand",
    restaurantId: restaurantId("r1"),
    orderId: orderId("o1"),
    menuItems: testMenuItems,
  });
}

Deno.test("OrderViewEventLoader - project order state from placed order", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    await setupRestaurantAndOrder(kv);

    const queryHandler = orderViewQueryHandler(kv);
    const state = await queryHandler.handle([
      ["orderId:o1", "RestaurantOrderPlacedEvent"],
    ]);

    assertEquals(state?.orderId, orderId("o1"));
    assertEquals(state?.restaurantId, restaurantId("r1"));
    assertEquals(state?.menuItems, testMenuItems);
    assertEquals(state?.status, "CREATED");
  } finally {
    await kv.close();
  }
});

Deno.test("OrderViewEventLoader - project state after order prepared", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    await setupRestaurantAndOrder(kv);

    const prepareRepo = markOrderAsPreparedRepository(kv);
    const prepareHandler = new EventSourcedCommandHandler(
      markOrderAsPreparedDecider,
      prepareRepo,
    );

    await prepareHandler.handle({
      kind: "MarkOrderAsPreparedCommand",
      orderId: orderId("o1"),
    });

    const queryHandler = orderViewQueryHandler(kv);
    const state = await queryHandler.handle([
      ["orderId:o1", "RestaurantOrderPlacedEvent"],
      ["orderId:o1", "OrderPreparedEvent"],
    ]);

    assertEquals(state?.orderId, orderId("o1"));
    assertEquals(state?.restaurantId, restaurantId("r1"));
    assertEquals(state?.menuItems, testMenuItems);
    assertEquals(state?.status, "PREPARED");
  } finally {
    await kv.close();
  }
});

Deno.test("OrderViewEventLoader - empty query returns null initial state", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    const queryHandler = orderViewQueryHandler(kv);
    const state = await queryHandler.handle([
      ["orderId:nonexistent", "RestaurantOrderPlacedEvent"],
    ]);

    assertEquals(state, null);
  } finally {
    await kv.close();
  }
});
