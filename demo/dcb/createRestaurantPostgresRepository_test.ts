/**
 * Postgres integration tests for CreateRestaurantRepository.
 *
 * Mirrors the domain behavior tests from createRestaurantRepository_test.ts
 * but targets the PostgreSQL backend via createRestaurantPostgresRepository.
 *
 * Tests verify:
 * - Event persistence to PostgreSQL via dcb.conditional_append
 * - Domain error propagation (RestaurantAlreadyExistsError)
 *
 * Requires Docker daemon for testcontainers.
 */

import { assertEquals, assertRejects } from "@std/assert";
import { EventSourcedCommandHandler } from "../../application.ts";
import { createRestaurantPostgresRepository } from "./createRestaurantPostgresRepository.ts";
import { createRestaurantDecider } from "./createRestaurantDecider.ts";
import {
  type CreateRestaurantCommand,
  menuItemId,
  RestaurantAlreadyExistsError,
  type RestaurantCreatedEvent,
  restaurantId,
  restaurantMenuId,
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
    "Postgres: CreateRestaurantRepository - successful restaurant creation (happy path)",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const repository = createRestaurantPostgresRepository(client);
    const handler = new EventSourcedCommandHandler(
      createRestaurantDecider,
      repository,
    );

    const command: CreateRestaurantCommand & CommandMetadata = {
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
      idempotencyKey: "test-pg-create-restaurant-happy",
    };

    const events = await handler.handle(command);

    // Verify events returned
    assertEquals(events.length, 1);
    const event = events[0] as RestaurantCreatedEvent;
    assertEquals(event.kind, "RestaurantCreatedEvent");
    assertEquals(event.restaurantId, restaurantId("r-happy-1"));
    assertEquals(event.name, "Bistro");
    assertEquals(event.menu.menuId, restaurantMenuId("m1"));
    assertEquals(event.menu.cuisine, "ITALIAN");
    assertEquals(event.menu.menuItems.length, 2);
    assertEquals(event.final, false);
  },
});

Deno.test({
  name:
    "Postgres: CreateRestaurantRepository - duplicate restaurant rejection (domain error propagation)",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const repository = createRestaurantPostgresRepository(client);
    const handler = new EventSourcedCommandHandler(
      createRestaurantDecider,
      repository,
    );

    const command: CreateRestaurantCommand & CommandMetadata = {
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
      idempotencyKey: "test-pg-create-restaurant-dup-1",
    };

    // First creation should succeed
    await handler.handle(command);

    // Second creation should fail with domain error
    await assertRejects(
      async () => {
        await handler.handle({
          ...command,
          idempotencyKey: "test-pg-create-restaurant-dup-2",
        });
      },
      RestaurantAlreadyExistsError,
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
