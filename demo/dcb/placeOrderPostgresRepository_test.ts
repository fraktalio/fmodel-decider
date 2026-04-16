/**
 * Postgres integration tests for PlaceOrderRepository.
 *
 * Mirrors the domain behavior tests from placeOrderRepository_test.ts
 * but targets the PostgreSQL backend via placeOrderPostgresRepository.
 *
 * Tests verify:
 * - Event persistence to PostgreSQL via dcb.conditional_append
 * - Domain error propagation (RestaurantNotFoundError, MenuItemsNotAvailableError, OrderAlreadyExistsError)
 * - Order placement after menu change
 *
 * Requires Docker daemon for testcontainers.
 */

import { assertEquals, assertRejects } from "@std/assert";
import { EventSourcedCommandHandler } from "../../application.ts";
import { placeOrderPostgresRepository } from "./placeOrderPostgresRepository.ts";
import { createRestaurantPostgresRepository } from "./createRestaurantPostgresRepository.ts";
import { changeRestaurantMenuPostgresRepository } from "./changeRestaurantMenuPostgresRepository.ts";
import { placeOrderDecider } from "./placeOrderDecider.ts";
import { createRestaurantDecider } from "./createRestaurantDecider.ts";
import { changeRestaurantManuDecider } from "./changeRestaurantMenuDecider.ts";
import {
  type ChangeRestaurantMenuCommand,
  type CreateRestaurantCommand,
  menuItemId,
  MenuItemsNotAvailableError,
  OrderAlreadyExistsError,
  orderId,
  type PlaceOrderCommand,
  restaurantId,
  restaurantMenuId,
  RestaurantNotFoundError,
  type RestaurantOrderPlacedEvent,
} from "./api.ts";
import {
  createPostgresClient,
  startPostgresContainer,
} from "./testcontainers.ts";

const { container, connectionString } = await startPostgresContainer();
const client = await createPostgresClient(connectionString);

Deno.test({
  name:
    "Postgres: PlaceOrderRepository - successful order placement (happy path)",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    // Create restaurant first
    const createRepository = createRestaurantPostgresRepository(client);
    const createHandler = new EventSourcedCommandHandler(
      createRestaurantDecider,
      createRepository,
    );

    const createCommand: CreateRestaurantCommand = {
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
          {
            menuItemId: menuItemId("item2"),
            name: "Pasta",
            price: "10.99",
          },
        ],
      },
    };

    await createHandler.handle(createCommand);

    // Place order
    const repository = placeOrderPostgresRepository(client);
    const handler = new EventSourcedCommandHandler(
      placeOrderDecider,
      repository,
    );

    const command: PlaceOrderCommand = {
      kind: "PlaceOrderCommand",
      restaurantId: restaurantId("r-happy-1"),
      orderId: orderId("o-happy-1"),
      menuItems: [
        {
          menuItemId: menuItemId("item1"),
          name: "Pizza",
          price: "12.99",
        },
      ],
    };

    const events = await handler.handle(command);

    // Verify events returned
    assertEquals(events.length, 1);
    const event = events[0] as RestaurantOrderPlacedEvent;
    assertEquals(event.kind, "RestaurantOrderPlacedEvent");
    assertEquals(event.restaurantId, restaurantId("r-happy-1"));
    assertEquals(event.orderId, orderId("o-happy-1"));
    assertEquals(event.menuItems.length, 1);
    assertEquals(event.menuItems[0].menuItemId, menuItemId("item1"));
    assertEquals(event.final, false);
  },
});

Deno.test({
  name:
    "Postgres: PlaceOrderRepository - non-existent restaurant rejection (domain error propagation)",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const repository = placeOrderPostgresRepository(client);
    const handler = new EventSourcedCommandHandler(
      placeOrderDecider,
      repository,
    );

    const command: PlaceOrderCommand = {
      kind: "PlaceOrderCommand",
      restaurantId: restaurantId("r-nonexist-999"),
      orderId: orderId("o-nonexist-1"),
      menuItems: [
        {
          menuItemId: menuItemId("item1"),
          name: "Pizza",
          price: "12.99",
        },
      ],
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
  name:
    "Postgres: PlaceOrderRepository - invalid menu items rejection (domain error propagation)",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    // Create restaurant first
    const createRepository = createRestaurantPostgresRepository(client);
    const createHandler = new EventSourcedCommandHandler(
      createRestaurantDecider,
      createRepository,
    );

    const createCommand: CreateRestaurantCommand = {
      kind: "CreateRestaurantCommand",
      restaurantId: restaurantId("r-invalid-1"),
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
    };

    await createHandler.handle(createCommand);

    // Try to place order with invalid menu item
    const repository = placeOrderPostgresRepository(client);
    const handler = new EventSourcedCommandHandler(
      placeOrderDecider,
      repository,
    );

    const command: PlaceOrderCommand = {
      kind: "PlaceOrderCommand",
      restaurantId: restaurantId("r-invalid-1"),
      orderId: orderId("o-invalid-1"),
      menuItems: [
        {
          menuItemId: menuItemId("item999"),
          name: "Invalid Item",
          price: "99.99",
        },
      ],
    };

    // Should fail with domain error
    await assertRejects(
      async () => {
        await handler.handle(command);
      },
      MenuItemsNotAvailableError,
    );
  },
});

Deno.test({
  name:
    "Postgres: PlaceOrderRepository - duplicate order rejection (domain error propagation)",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    // Create restaurant first
    const createRepository = createRestaurantPostgresRepository(client);
    const createHandler = new EventSourcedCommandHandler(
      createRestaurantDecider,
      createRepository,
    );

    const createCommand: CreateRestaurantCommand = {
      kind: "CreateRestaurantCommand",
      restaurantId: restaurantId("r-dup-1"),
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
    };

    await createHandler.handle(createCommand);

    // Place order
    const repository = placeOrderPostgresRepository(client);
    const handler = new EventSourcedCommandHandler(
      placeOrderDecider,
      repository,
    );

    const command: PlaceOrderCommand = {
      kind: "PlaceOrderCommand",
      restaurantId: restaurantId("r-dup-1"),
      orderId: orderId("o-dup-1"),
      menuItems: [
        {
          menuItemId: menuItemId("item1"),
          name: "Pizza",
          price: "12.99",
        },
      ],
    };

    // First order should succeed
    const result1 = await handler.handle(command);
    assertEquals(result1.length, 1, "First order should produce 1 event");

    // Second order with same ID should fail
    await assertRejects(
      async () => {
        await handler.handle(command);
      },
      OrderAlreadyExistsError,
    );
  },
});

Deno.test({
  name:
    "Postgres: PlaceOrderRepository - order placement after menu change (menu evolution)",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    // Create restaurant first
    const createRepository = createRestaurantPostgresRepository(client);
    const createHandler = new EventSourcedCommandHandler(
      createRestaurantDecider,
      createRepository,
    );

    const createCommand: CreateRestaurantCommand = {
      kind: "CreateRestaurantCommand",
      restaurantId: restaurantId("r-menu-1"),
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
          {
            menuItemId: menuItemId("item2"),
            name: "Pasta",
            price: "10.99",
          },
        ],
      },
    };

    await createHandler.handle(createCommand);

    // Change menu
    const changeRepository = changeRestaurantMenuPostgresRepository(
      client,
    );
    const changeHandler = new EventSourcedCommandHandler(
      changeRestaurantManuDecider,
      changeRepository,
    );

    const changeCommand: ChangeRestaurantMenuCommand = {
      kind: "ChangeRestaurantMenuCommand",
      restaurantId: restaurantId("r-menu-1"),
      menu: {
        menuId: restaurantMenuId("m2"),
        cuisine: "ITALIAN",
        menuItems: [
          {
            menuItemId: menuItemId("item1"),
            name: "Pizza",
            price: "13.99",
          },
          {
            menuItemId: menuItemId("item2"),
            name: "Pasta",
            price: "11.99",
          },
          {
            menuItemId: menuItemId("item3"),
            name: "Salad",
            price: "8.99",
          },
        ],
      },
    };

    await changeHandler.handle(changeCommand);

    // Place order with item from updated menu - should succeed
    const repository = placeOrderPostgresRepository(client);
    const handler = new EventSourcedCommandHandler(
      placeOrderDecider,
      repository,
    );

    const command: PlaceOrderCommand = {
      kind: "PlaceOrderCommand",
      restaurantId: restaurantId("r-menu-1"),
      orderId: orderId("o-menu-1"),
      menuItems: [
        {
          menuItemId: menuItemId("item3"),
          name: "Salad",
          price: "8.99",
        },
      ],
    };

    const events = await handler.handle(command);

    // Verify order was placed successfully
    assertEquals(events.length, 1);
    assertEquals(events[0].kind, "RestaurantOrderPlacedEvent");
    assertEquals(
      (events[0] as RestaurantOrderPlacedEvent).orderId,
      orderId("o-menu-1"),
    );
    assertEquals(
      (events[0] as RestaurantOrderPlacedEvent).menuItems[0].menuItemId,
      menuItemId("item3"),
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
