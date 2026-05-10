/**
 * Postgres integration tests for ChangeRestaurantMenuRepository.
 *
 * Mirrors the domain behavior tests from changeRestaurantMenuRepository_test.ts
 * but targets the PostgreSQL backend via changeRestaurantMenuPostgresRepository.
 *
 * Tests verify:
 * - Event persistence to PostgreSQL via dcb.conditional_append
 * - Domain error propagation (RestaurantNotFoundError)
 * - Sequential menu updates
 *
 * Requires Docker daemon for testcontainers.
 */

import { assertEquals, assertRejects } from "@std/assert";
import { EventSourcedCommandHandler } from "../../application.ts";
import { changeRestaurantMenuPostgresRepository } from "./changeRestaurantMenuPostgresRepository.ts";
import { createRestaurantPostgresRepository } from "./createRestaurantPostgresRepository.ts";
import { changeRestaurantManuDecider } from "./changeRestaurantMenuDecider.ts";
import { createRestaurantDecider } from "./createRestaurantDecider.ts";
import {
  type ChangeRestaurantMenuCommand,
  type CreateRestaurantCommand,
  menuItemId,
  restaurantId,
  type RestaurantMenuChangedEvent,
  restaurantMenuId,
  RestaurantNotFoundError,
} from "./api.ts";
import type { CommandMetadata } from "../../infrastructure.ts";
import {
  createPostgresClient,
  startPostgresContainer,
} from "./testcontainers.ts";

const { container, connectionString } = await startPostgresContainer();
const client = await createPostgresClient(connectionString);

Deno.test({
  name:
    "Postgres: ChangeRestaurantMenuRepository - successful menu update (happy path)",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    // First create a restaurant
    const createRepository = createRestaurantPostgresRepository(client);
    const createHandler = new EventSourcedCommandHandler(
      createRestaurantDecider,
      createRepository,
    );

    const createCommand: CreateRestaurantCommand & CommandMetadata = {
      kind: "CreateRestaurantCommand",
      restaurantId: restaurantId("r-happy-1"),
      name: "Bistro",
      menu: {
        menuId: restaurantMenuId("m1"),
        cuisine: "ITALIAN",
        menuItems: [
          {
            menuItemId: menuItemId("item1"),
            name: "Pizza",
            price: "12.99",
          },
        ],
      },
      idempotencyKey: "test-pg-change-menu-happy-create",
    };

    await createHandler.handle(createCommand);

    // Now change the menu
    const changeRepository = changeRestaurantMenuPostgresRepository(client);
    const changeHandler = new EventSourcedCommandHandler(
      changeRestaurantManuDecider,
      changeRepository,
    );

    const changeCommand: ChangeRestaurantMenuCommand & CommandMetadata = {
      kind: "ChangeRestaurantMenuCommand",
      restaurantId: restaurantId("r-happy-1"),
      menu: {
        menuId: restaurantMenuId("m2"),
        cuisine: "MEXICAN",
        menuItems: [
          {
            menuItemId: menuItemId("item3"),
            name: "Tacos",
            price: "8.99",
          },
          {
            menuItemId: menuItemId("item4"),
            name: "Burrito",
            price: "11.99",
          },
        ],
      },
      idempotencyKey: "test-pg-change-menu-happy-change",
    };

    const events = await changeHandler.handle(changeCommand);

    // Verify events returned
    assertEquals(events.length, 1);
    const event = events[0] as RestaurantMenuChangedEvent;
    assertEquals(event.kind, "RestaurantMenuChangedEvent");
    assertEquals(event.restaurantId, restaurantId("r-happy-1"));
    assertEquals(event.menu.menuId, restaurantMenuId("m2"));
    assertEquals(event.menu.cuisine, "MEXICAN");
    assertEquals(event.menu.menuItems.length, 2);
    assertEquals(event.menu.menuItems[0].name, "Tacos");
    assertEquals(event.final, false);
  },
});

Deno.test({
  name:
    "Postgres: ChangeRestaurantMenuRepository - non-existent restaurant rejection (domain error propagation)",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const repository = changeRestaurantMenuPostgresRepository(client);
    const handler = new EventSourcedCommandHandler(
      changeRestaurantManuDecider,
      repository,
    );

    const command: ChangeRestaurantMenuCommand & CommandMetadata = {
      kind: "ChangeRestaurantMenuCommand",
      restaurantId: restaurantId("r-noexist-999"),
      menu: {
        menuId: restaurantMenuId("m2"),
        cuisine: "MEXICAN",
        menuItems: [
          {
            menuItemId: menuItemId("item3"),
            name: "Tacos",
            price: "8.99",
          },
        ],
      },
      idempotencyKey: "test-pg-change-menu-nonexist",
    };

    // Should fail with domain error
    await assertRejects(
      async () => {
        await handler.handle(command);
      },
      RestaurantNotFoundError,
    );
  },
});

Deno.test({
  name: "Postgres: ChangeRestaurantMenuRepository - sequential menu updates",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    // First create a restaurant
    const createRepository = createRestaurantPostgresRepository(client);
    const createHandler = new EventSourcedCommandHandler(
      createRestaurantDecider,
      createRepository,
    );

    const createCommand: CreateRestaurantCommand & CommandMetadata = {
      kind: "CreateRestaurantCommand",
      restaurantId: restaurantId("r-seq-1"),
      name: "Bistro",
      menu: {
        menuId: restaurantMenuId("m1"),
        cuisine: "ITALIAN",
        menuItems: [
          {
            menuItemId: menuItemId("item1"),
            name: "Pizza",
            price: "12.99",
          },
        ],
      },
      idempotencyKey: "test-pg-change-menu-seq-create",
    };

    await createHandler.handle(createCommand);

    // Now perform two sequential menu changes
    const changeRepository = changeRestaurantMenuPostgresRepository(client);
    const changeHandler = new EventSourcedCommandHandler(
      changeRestaurantManuDecider,
      changeRepository,
    );

    const changeCommand1: ChangeRestaurantMenuCommand & CommandMetadata = {
      kind: "ChangeRestaurantMenuCommand",
      restaurantId: restaurantId("r-seq-1"),
      menu: {
        menuId: restaurantMenuId("m2"),
        cuisine: "MEXICAN",
        menuItems: [
          {
            menuItemId: menuItemId("item3"),
            name: "Tacos",
            price: "8.99",
          },
        ],
      },
      idempotencyKey: "test-pg-change-menu-seq-1",
    };

    const changeCommand2: ChangeRestaurantMenuCommand & CommandMetadata = {
      kind: "ChangeRestaurantMenuCommand",
      restaurantId: restaurantId("r-seq-1"),
      menu: {
        menuId: restaurantMenuId("m3"),
        cuisine: "CHINESE",
        menuItems: [
          {
            menuItemId: menuItemId("item5"),
            name: "Fried Rice",
            price: "9.99",
          },
        ],
      },
      idempotencyKey: "test-pg-change-menu-seq-2",
    };

    // First change should succeed
    const firstResult = await changeHandler.handle(changeCommand1);
    assertEquals(firstResult.length, 1);
    assertEquals(firstResult[0].kind, "RestaurantMenuChangedEvent");
    assertEquals(
      (firstResult[0] as RestaurantMenuChangedEvent).menu.cuisine,
      "MEXICAN",
    );

    // Second change should also succeed
    const secondResult = await changeHandler.handle(changeCommand2);
    assertEquals(secondResult.length, 1);
    assertEquals(secondResult[0].kind, "RestaurantMenuChangedEvent");
    assertEquals(
      (secondResult[0] as RestaurantMenuChangedEvent).menu.cuisine,
      "CHINESE",
    );
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
