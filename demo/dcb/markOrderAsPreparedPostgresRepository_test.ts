/**
 * Postgres integration tests for MarkOrderAsPreparedRepository.
 *
 * Mirrors the domain behavior tests from markOrderAsPreparedRepository_test.ts
 * but targets the PostgreSQL backend via markOrderAsPreparedPostgresRepository.
 *
 * Tests verify:
 * - Event persistence to PostgreSQL via dcb.conditional_append
 * - Domain error propagation (OrderNotFoundError, OrderAlreadyPreparedError)
 *
 * Requires Docker daemon for testcontainers.
 */

import { assertEquals, assertRejects } from "@std/assert";
import { EventSourcedCommandHandler } from "../../application.ts";
import { markOrderAsPreparedPostgresRepository } from "./markOrderAsPreparedPostgresRepository.ts";
import { createRestaurantPostgresRepository } from "./createRestaurantPostgresRepository.ts";
import { placeOrderPostgresRepository } from "./placeOrderPostgresRepository.ts";
import { markOrderAsPreparedDecider } from "./markOrderAsPreparedDecider.ts";
import { createRestaurantDecider } from "./createRestaurantDecider.ts";
import { placeOrderDecider } from "./placeOrderDecider.ts";
import {
  type CreateRestaurantCommand,
  type MarkOrderAsPreparedCommand,
  menuItemId,
  OrderAlreadyPreparedError,
  orderId,
  OrderNotFoundError,
  type OrderPreparedEvent,
  type PlaceOrderCommand,
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
    "Postgres: MarkOrderAsPreparedRepository - successful order preparation (happy path)",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    // Create restaurant first
    const createRepository = createRestaurantPostgresRepository(client);
    const createHandler = new EventSourcedCommandHandler(
      createRestaurantDecider,
      createRepository,
    );

    const createCommand: CreateRestaurantCommand & CommandMetadata = {
      kind: "CreateRestaurantCommand",
      restaurantId: restaurantId("r-prep-1"),
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
      idempotencyKey: "test-pg-mark-prepared-happy-create",
    };

    await createHandler.handle(createCommand);

    // Place order
    const placeRepository = placeOrderPostgresRepository(client);
    const placeHandler = new EventSourcedCommandHandler(
      placeOrderDecider,
      placeRepository,
    );

    const placeCommand: PlaceOrderCommand & CommandMetadata = {
      kind: "PlaceOrderCommand",
      restaurantId: restaurantId("r-prep-1"),
      orderId: orderId("o-prep-1"),
      menuItems: [
        {
          menuItemId: menuItemId("item1"),
          name: "Pizza",
          price: "12.99",
        },
      ],
      idempotencyKey: "test-pg-mark-prepared-happy-place",
    };

    await placeHandler.handle(placeCommand);

    // Mark order as prepared
    const repository = markOrderAsPreparedPostgresRepository(client);
    const handler = new EventSourcedCommandHandler(
      markOrderAsPreparedDecider,
      repository,
    );

    const command: MarkOrderAsPreparedCommand & CommandMetadata = {
      kind: "MarkOrderAsPreparedCommand",
      orderId: orderId("o-prep-1"),
      idempotencyKey: "test-pg-mark-prepared-happy-mark",
    };

    const events = await handler.handle(command);

    // Verify events returned
    assertEquals(events.length, 1);
    const event = events[0] as OrderPreparedEvent;
    assertEquals(event.kind, "OrderPreparedEvent");
    assertEquals(event.orderId, orderId("o-prep-1"));
    assertEquals(event.final, false);
  },
});

Deno.test({
  name:
    "Postgres: MarkOrderAsPreparedRepository - non-existent order rejection (domain error propagation)",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const repository = markOrderAsPreparedPostgresRepository(client);
    const handler = new EventSourcedCommandHandler(
      markOrderAsPreparedDecider,
      repository,
    );

    const command: MarkOrderAsPreparedCommand & CommandMetadata = {
      kind: "MarkOrderAsPreparedCommand",
      orderId: orderId("o-nonexist-999"),
      idempotencyKey: "test-pg-mark-prepared-nonexist",
    };

    // Should fail with domain error
    await assertRejects(
      async () => {
        await handler.handle(command);
      },
      OrderNotFoundError,
    );
  },
});

Deno.test({
  name:
    "Postgres: MarkOrderAsPreparedRepository - already prepared order rejection (domain error propagation)",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    // Create restaurant first
    const createRepository = createRestaurantPostgresRepository(client);
    const createHandler = new EventSourcedCommandHandler(
      createRestaurantDecider,
      createRepository,
    );

    const createCommand: CreateRestaurantCommand & CommandMetadata = {
      kind: "CreateRestaurantCommand",
      restaurantId: restaurantId("r-already-1"),
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
      idempotencyKey: "test-pg-mark-prepared-already-create",
    };

    await createHandler.handle(createCommand);

    // Place order
    const placeRepository = placeOrderPostgresRepository(client);
    const placeHandler = new EventSourcedCommandHandler(
      placeOrderDecider,
      placeRepository,
    );

    const placeCommand: PlaceOrderCommand & CommandMetadata = {
      kind: "PlaceOrderCommand",
      restaurantId: restaurantId("r-already-1"),
      orderId: orderId("o-already-1"),
      menuItems: [
        {
          menuItemId: menuItemId("item1"),
          name: "Pizza",
          price: "12.99",
        },
      ],
      idempotencyKey: "test-pg-mark-prepared-already-place",
    };

    await placeHandler.handle(placeCommand);

    // Mark order as prepared
    const repository = markOrderAsPreparedPostgresRepository(client);
    const handler = new EventSourcedCommandHandler(
      markOrderAsPreparedDecider,
      repository,
    );

    const command: MarkOrderAsPreparedCommand & CommandMetadata = {
      kind: "MarkOrderAsPreparedCommand",
      orderId: orderId("o-already-1"),
      idempotencyKey: "test-pg-mark-prepared-already-1",
    };

    // First preparation should succeed
    const result1 = await handler.handle(command);
    assertEquals(
      result1.length,
      1,
      "First preparation should produce 1 event",
    );

    // Second preparation should fail
    await assertRejects(
      async () => {
        await handler.handle({
          ...command,
          idempotencyKey: "test-pg-mark-prepared-already-2",
        });
      },
      OrderAlreadyPreparedError,
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
