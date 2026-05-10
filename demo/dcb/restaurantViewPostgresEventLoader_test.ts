/**
 * Postgres integration tests for restaurant view event loader.
 *
 * Mirrors the domain behavior tests from restaurantViewEventLoader_test.ts
 * but targets the PostgreSQL backend via PostgresEventLoader.
 *
 * Tests verify that EventSourcedQueryHandler correctly projects
 * restaurant state by loading events from PostgreSQL and folding
 * them through the restaurant view.
 *
 * Requires Docker daemon for testcontainers.
 */

import { assertEquals } from "@std/assert";
import {
  EventSourcedCommandHandler,
  EventSourcedQueryHandler,
} from "../../application.ts";
import { createRestaurantPostgresRepository } from "./createRestaurantPostgresRepository.ts";
import { changeRestaurantMenuPostgresRepository } from "./changeRestaurantMenuPostgresRepository.ts";
import { createRestaurantDecider } from "./createRestaurantDecider.ts";
import { changeRestaurantManuDecider } from "./changeRestaurantMenuDecider.ts";
import {
  menuItemId,
  restaurantId,
  type RestaurantMenu,
  restaurantMenuId,
} from "./api.ts";
import type { CommandMetadata } from "../../infrastructure.ts";
import { type RestaurantEvent, restaurantView } from "./restaurantView.ts";
import {
  createPostgresClient,
  startPostgresContainer,
} from "./testcontainers.ts";
import { PostgresEventLoader } from "../../postgresEventRepository.ts";

const { container, connectionString } = await startPostgresContainer();
const client = await createPostgresClient(connectionString);

const testMenu: RestaurantMenu = {
  menuId: restaurantMenuId("m1"),
  cuisine: "ITALIAN",
  menuItems: [
    { menuItemId: menuItemId("item1"), name: "Pizza", price: "12.99" },
    { menuItemId: menuItemId("item2"), name: "Pasta", price: "10.99" },
  ],
};

Deno.test({
  name:
    "Postgres: RestaurantViewEventLoader - project restaurant state from events",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    // Persist a restaurant creation event via the Postgres repository
    const repo = createRestaurantPostgresRepository(client);
    const handler = new EventSourcedCommandHandler(
      createRestaurantDecider,
      repo,
    );

    await handler.handle({
      kind: "CreateRestaurantCommand",
      restaurantId: restaurantId("r-view-1"),
      name: "Italian Bistro",
      menu: testMenu,
      idempotencyKey: "test-pg-restaurant-view-create-1",
    });

    // Query the restaurant view via PostgresEventLoader
    const loader = new PostgresEventLoader<RestaurantEvent>(client);
    const queryHandler = new EventSourcedQueryHandler(
      restaurantView,
      loader,
    );
    const state = await queryHandler.handle([
      ["restaurantId:r-view-1", "RestaurantCreatedEvent"],
    ]);

    assertEquals(state?.restaurantId, restaurantId("r-view-1"));
    assertEquals(state?.name, "Italian Bistro");
    assertEquals(state?.menu, testMenu);
  },
});

Deno.test({
  name: "Postgres: RestaurantViewEventLoader - project state after menu change",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    // Create restaurant
    const createRepo = createRestaurantPostgresRepository(client);
    const createHandler = new EventSourcedCommandHandler(
      createRestaurantDecider,
      createRepo,
    );

    await createHandler.handle({
      kind: "CreateRestaurantCommand",
      restaurantId: restaurantId("r-view-2"),
      name: "Italian Bistro",
      menu: testMenu,
      idempotencyKey: "test-pg-restaurant-view-create-2",
    });

    // Change menu
    const changeRepo = changeRestaurantMenuPostgresRepository(client);
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
      restaurantId: restaurantId("r-view-2"),
      menu: newMenu,
      idempotencyKey: "test-pg-restaurant-view-change-2",
    });

    // Query both event types to build full state
    const loader = new PostgresEventLoader<RestaurantEvent>(client);
    const queryHandler = new EventSourcedQueryHandler(
      restaurantView,
      loader,
    );
    const state = await queryHandler.handle([
      ["restaurantId:r-view-2", "RestaurantCreatedEvent"],
      ["restaurantId:r-view-2", "RestaurantMenuChangedEvent"],
    ]);

    assertEquals(state?.restaurantId, restaurantId("r-view-2"));
    assertEquals(state?.name, "Italian Bistro");
    assertEquals(state?.menu, newMenu);
  },
});

Deno.test({
  name:
    "Postgres: RestaurantViewEventLoader - empty query returns null initial state",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const loader = new PostgresEventLoader<RestaurantEvent>(client);
    const queryHandler = new EventSourcedQueryHandler(
      restaurantView,
      loader,
    );
    const state = await queryHandler.handle([
      ["restaurantId:nonexistent", "RestaurantCreatedEvent"],
    ]);

    assertEquals(state, null);
  },
});

Deno.test({
  name: "Postgres: cleanup",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await client.end();
    await container.stop();
  },
});
