/**
 * Integration tests for restaurant view event loader.
 *
 * Tests verify that EventSourcedQueryHandler correctly projects
 * restaurant state by loading events from Deno KV and folding
 * them through the restaurant view.
 */

import { assertEquals } from "@std/assert";
import { EventSourcedCommandHandler } from "../../application.ts";
import { createRestaurantRepository } from "./createRestaurantRepository.ts";
import { changeRestaurantMenuRepository } from "./changeRestaurantMenuRepository.ts";
import { createRestaurantDecider } from "./createRestaurantDecider.ts";
import { changeRestaurantManuDecider } from "./changeRestaurantMenuDecider.ts";
import { restaurantViewQueryHandler } from "./restaurantViewEventLoader.ts";
import {
  menuItemId,
  restaurantId,
  type RestaurantMenu,
  restaurantMenuId,
} from "./api.ts";
import type { CommandMetadata } from "../../infrastructure.ts";

const testMenu: RestaurantMenu = {
  menuId: restaurantMenuId("m1"),
  cuisine: "ITALIAN",
  menuItems: [
    { menuItemId: menuItemId("item1"), name: "Pizza", price: "12.99" },
    { menuItemId: menuItemId("item2"), name: "Pasta", price: "10.99" },
  ],
};

Deno.test("RestaurantViewEventLoader - project restaurant state from events", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    // Persist a restaurant creation event via the repository
    const repo = createRestaurantRepository(kv);
    const handler = new EventSourcedCommandHandler(
      createRestaurantDecider,
      repo,
    );

    await handler.handle({
      kind: "CreateRestaurantCommand",
      restaurantId: restaurantId("r1"),
      name: "Italian Bistro",
      menu: testMenu,
      idempotencyKey: "test-restaurant-view-create-1",
    });

    // Query the restaurant view via event loader
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

Deno.test("RestaurantViewEventLoader - project state after menu change", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
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
      idempotencyKey: "test-restaurant-view-create-2",
    });

    const changeRepo = changeRestaurantMenuRepository(kv);
    const changeHandler = new EventSourcedCommandHandler(
      changeRestaurantManuDecider,
      changeRepo,
    );

    const newMenu: RestaurantMenu = {
      menuId: restaurantMenuId("m2"),
      cuisine: "MEXICAN",
      menuItems: [
        { menuItemId: menuItemId("item3"), name: "Tacos", price: "8.00" },
      ],
    };

    await changeHandler.handle({
      kind: "ChangeRestaurantMenuCommand",
      restaurantId: restaurantId("r1"),
      menu: newMenu,
      idempotencyKey: "test-restaurant-view-change-2",
    });

    // Query both event types to build full state
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

Deno.test("RestaurantViewEventLoader - empty query returns null initial state", async () => {
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
