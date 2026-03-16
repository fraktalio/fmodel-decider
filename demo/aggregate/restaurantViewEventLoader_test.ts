/**
 * Integration tests for restaurant view event loader (aggregate pattern).
 *
 * Tests verify that EventSourcedQueryHandler correctly projects
 * restaurant state by loading events from Deno KV and folding
 * them through the restaurant view.
 */

import { assertEquals } from "@std/assert";
import { EventSourcedCommandHandler } from "../../application.ts";
import { restaurantRepository } from "./restaurantRepository.ts";
import { restaurantDecider } from "./restaurantDecider.ts";
import { restaurantViewQueryHandler } from "./restaurantViewEventLoader.ts";
import {
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

Deno.test("RestaurantViewEventLoader (aggregate) - project restaurant state from events", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    const repo = restaurantRepository(kv);
    const handler = new EventSourcedCommandHandler(restaurantDecider, repo);

    await handler.handle({
      decider: "Restaurant",
      kind: "CreateRestaurantCommand",
      restaurantId: restaurantId("r1"),
      name: "Italian Bistro",
      menu: testMenu,
    });

    const queryHandler = restaurantViewQueryHandler(kv);
    const state = await queryHandler.handle([
      ["restaurantId:r1", "RestaurantCreatedEvent"],
    ]);

    assertEquals(state?.restaurantId, restaurantId("r1"));
    assertEquals(state?.name, "Italian Bistro");
    assertEquals(state?.menu, testMenu);
  } finally {
    await kv.close();
  }
});

Deno.test("RestaurantViewEventLoader (aggregate) - project state after menu change", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    const repo = restaurantRepository(kv);
    const handler = new EventSourcedCommandHandler(restaurantDecider, repo);

    await handler.handle({
      decider: "Restaurant",
      kind: "CreateRestaurantCommand",
      restaurantId: restaurantId("r1"),
      name: "Italian Bistro",
      menu: testMenu,
    });

    const newMenu: RestaurantMenu = {
      menuId: restaurantMenuId("m2"),
      cuisine: "MEXICAN",
      menuItems: [
        { menuItemId: menuItemId("item3"), name: "Tacos", price: "8.00" },
      ],
    };

    await handler.handle({
      decider: "Restaurant",
      kind: "ChangeRestaurantMenuCommand",
      restaurantId: restaurantId("r1"),
      menu: newMenu,
    });

    const queryHandler = restaurantViewQueryHandler(kv);
    const state = await queryHandler.handle([
      ["restaurantId:r1", "RestaurantCreatedEvent"],
      ["restaurantId:r1", "RestaurantMenuChangedEvent"],
    ]);

    assertEquals(state?.restaurantId, restaurantId("r1"));
    assertEquals(state?.name, "Italian Bistro");
    assertEquals(state?.menu, newMenu);
  } finally {
    await kv.close();
  }
});

Deno.test("RestaurantViewEventLoader (aggregate) - project state with order placed", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    const repo = restaurantRepository(kv);
    const handler = new EventSourcedCommandHandler(restaurantDecider, repo);

    await handler.handle({
      decider: "Restaurant",
      kind: "CreateRestaurantCommand",
      restaurantId: restaurantId("r1"),
      name: "Italian Bistro",
      menu: testMenu,
    });

    await handler.handle({
      decider: "Restaurant",
      kind: "PlaceOrderCommand",
      restaurantId: restaurantId("r1"),
      orderId: orderId("o1"),
      menuItems: [{
        menuItemId: menuItemId("item1"),
        name: "Pizza",
        price: "12.99",
      }],
    });

    const queryHandler = restaurantViewQueryHandler(kv);
    const state = await queryHandler.handle([
      ["restaurantId:r1", "RestaurantCreatedEvent"],
      ["restaurantId:r1", "RestaurantMenuChangedEvent"],
      ["restaurantId:r1", "RestaurantOrderPlacedEvent"],
    ]);

    // Order placed event doesn't change restaurant view state
    assertEquals(state?.restaurantId, restaurantId("r1"));
    assertEquals(state?.name, "Italian Bistro");
    assertEquals(state?.menu, testMenu);
  } finally {
    await kv.close();
  }
});

Deno.test("RestaurantViewEventLoader (aggregate) - empty query returns null initial state", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    const queryHandler = restaurantViewQueryHandler(kv);
    const state = await queryHandler.handle([
      ["restaurantId:nonexistent", "RestaurantCreatedEvent"],
    ]);

    assertEquals(state, null);
  } finally {
    await kv.close();
  }
});
