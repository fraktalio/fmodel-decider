/**
 * Postgres integration tests for order view event loader.
 *
 * Mirrors the domain behavior tests from orderViewEventLoader_test.ts
 * but targets the PostgreSQL backend via PostgresEventLoader.
 *
 * Tests verify that EventSourcedQueryHandler correctly projects
 * order state by loading events from PostgreSQL and folding
 * them through the order view.
 *
 * Requires Docker daemon for testcontainers.
 */

import { assertEquals } from "@std/assert";
import {
  EventSourcedCommandHandler,
  EventSourcedQueryHandler,
} from "../../application.ts";
import { createRestaurantPostgresRepository } from "./createRestaurantPostgresRepository.ts";
import { placeOrderPostgresRepository } from "./placeOrderPostgresRepository.ts";
import { markOrderAsPreparedPostgresRepository } from "./markOrderAsPreparedPostgresRepository.ts";
import { createRestaurantDecider } from "./createRestaurantDecider.ts";
import { placeOrderDecider } from "./placeOrderDecider.ts";
import { markOrderAsPreparedDecider } from "./markOrderAsPreparedDecider.ts";
import {
  type MenuItem,
  menuItemId,
  orderId,
  type OrderPreparedEvent,
  restaurantId,
  type RestaurantMenu,
  restaurantMenuId,
  type RestaurantOrderPlacedEvent,
} from "./api.ts";
import type { CommandMetadata } from "../../infrastructure.ts";
import { orderView } from "./orderView.ts";
import {
  createPostgresClient,
  startPostgresContainer,
} from "./testcontainers.ts";
import { PostgresEventLoader } from "../../postgresEventRepository.ts";

type OrderEvent = RestaurantOrderPlacedEvent | OrderPreparedEvent;

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

const testMenuItems: MenuItem[] = [
  { menuItemId: menuItemId("item1"), name: "Pizza", price: "12.99" },
];

/** Helper to set up a restaurant and place an order via Postgres */
// deno-lint-ignore no-explicit-any
async function setupRestaurantAndOrder(client: any, rId: string, oId: string) {
  const createRepo = createRestaurantPostgresRepository(client);
  const createHandler = new EventSourcedCommandHandler(
    createRestaurantDecider,
    createRepo,
  );

  await createHandler.handle({
    kind: "CreateRestaurantCommand",
    restaurantId: restaurantId(rId),
    name: "Italian Bistro",
    menu: testMenu,
    idempotencyKey: `test-pg-order-view-setup-create-${rId}`,
  });

  const placeRepo = placeOrderPostgresRepository(client);
  const placeHandler = new EventSourcedCommandHandler(
    placeOrderDecider,
    placeRepo,
  );

  await placeHandler.handle({
    kind: "PlaceOrderCommand",
    restaurantId: restaurantId(rId),
    orderId: orderId(oId),
    menuItems: testMenuItems,
    idempotencyKey: `test-pg-order-view-setup-place-${oId}`,
  });
}

Deno.test({
  name:
    "Postgres: OrderViewEventLoader - project order state from placed order",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await setupRestaurantAndOrder(client, "r-oview-1", "o-oview-1");

    const loader = new PostgresEventLoader<OrderEvent>(client);
    const queryHandler = new EventSourcedQueryHandler(orderView, loader);
    const state = await queryHandler.handle([
      ["orderId:o-oview-1", "RestaurantOrderPlacedEvent"],
    ]);

    assertEquals(state?.orderId, orderId("o-oview-1"));
    assertEquals(state?.restaurantId, restaurantId("r-oview-1"));
    assertEquals(state?.menuItems, testMenuItems);
    assertEquals(state?.status, "CREATED");
  },
});

Deno.test({
  name: "Postgres: OrderViewEventLoader - project state after order prepared",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await setupRestaurantAndOrder(client, "r-oview-2", "o-oview-2");

    // Mark order as prepared
    const prepareRepo = markOrderAsPreparedPostgresRepository(client);
    const prepareHandler = new EventSourcedCommandHandler(
      markOrderAsPreparedDecider,
      prepareRepo,
    );

    await prepareHandler.handle({
      kind: "MarkOrderAsPreparedCommand",
      orderId: orderId("o-oview-2"),
      idempotencyKey: "test-pg-order-view-prepare-2",
    });

    const loader = new PostgresEventLoader<OrderEvent>(client);
    const queryHandler = new EventSourcedQueryHandler(orderView, loader);
    const state = await queryHandler.handle([
      ["orderId:o-oview-2", "RestaurantOrderPlacedEvent"],
      ["orderId:o-oview-2", "OrderPreparedEvent"],
    ]);

    assertEquals(state?.orderId, orderId("o-oview-2"));
    assertEquals(state?.restaurantId, restaurantId("r-oview-2"));
    assertEquals(state?.menuItems, testMenuItems);
    assertEquals(state?.status, "PREPARED");
  },
});

Deno.test({
  name:
    "Postgres: OrderViewEventLoader - empty query returns null initial state",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const loader = new PostgresEventLoader<OrderEvent>(client);
    const queryHandler = new EventSourcedQueryHandler(orderView, loader);
    const state = await queryHandler.handle([
      ["orderId:nonexistent", "RestaurantOrderPlacedEvent"],
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
