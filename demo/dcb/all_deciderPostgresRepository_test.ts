/**
 * Postgres integration tests for AllDeciderPostgresRepository.
 *
 * Mirrors the domain behavior tests from all_deciderRepository_test.ts
 * but targets the PostgreSQL backend via AllDeciderPostgresRepository.
 *
 * Tests verify:
 * - Combined repository command execution against PostgreSQL
 * - Domain error propagation (RestaurantNotFoundError, OrderNotFoundError)
 * - Batch execution (empty, multi-command, error rollback, full workflow)
 *
 * Requires Docker daemon for testcontainers.
 */

import { assertEquals, assertRejects } from "@std/assert";
import { AllDeciderPostgresRepository } from "./all_deciderPostgresRepository.ts";
import {
  type ChangeRestaurantMenuCommand,
  type CreateRestaurantCommand,
  type MarkOrderAsPreparedCommand,
  menuItemId,
  orderId,
  OrderNotFoundError,
  type PlaceOrderCommand,
  restaurantId,
  restaurantMenuId,
  RestaurantNotFoundError,
} from "./api.ts";
import {
  createPostgresClient,
  startPostgresContainer,
} from "./testcontainers.ts";

const { container, connectionString } = await startPostgresContainer();
const client = await createPostgresClient(connectionString);

// ###########################################################################
// #################### Single Command Tests #################################
// ###########################################################################

Deno.test({
  name:
    "Postgres: AllDeciderPostgresRepository - CreateRestaurantCommand succeeds",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const repository = new AllDeciderPostgresRepository(client);

    const command: CreateRestaurantCommand = {
      kind: "CreateRestaurantCommand",
      restaurantId: restaurantId("r-create-1"),
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

    const events = await repository.execute(command);

    assertEquals(events.length, 1);
    assertEquals(events[0].kind, "RestaurantCreatedEvent");
  },
});

Deno.test({
  name:
    "Postgres: AllDeciderPostgresRepository - ChangeRestaurantMenuCommand fails (restaurant doesn't exist)",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const repository = new AllDeciderPostgresRepository(client);

    const changeCommand: ChangeRestaurantMenuCommand = {
      kind: "ChangeRestaurantMenuCommand",
      restaurantId: restaurantId("r-changemenu-noexist-1"),
      menu: {
        menuId: restaurantMenuId("m2"),
        cuisine: "FRENCH",
        menuItems: [
          {
            menuItemId: menuItemId("item3"),
            name: "Croissant",
            price: "5.99",
          },
        ],
      },
    };

    await assertRejects(
      async () => await repository.execute(changeCommand),
      RestaurantNotFoundError,
    );
  },
});

Deno.test({
  name:
    "Postgres: AllDeciderPostgresRepository - PlaceOrderCommand fails (restaurant doesn't exist)",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const repository = new AllDeciderPostgresRepository(client);

    const placeOrderCommand: PlaceOrderCommand = {
      kind: "PlaceOrderCommand",
      restaurantId: restaurantId("r-placeorder-noexist-1"),
      orderId: orderId("o-placeorder-noexist-1"),
      menuItems: [
        {
          menuItemId: menuItemId("item1"),
          name: "Pizza",
          price: "12.99",
        },
      ],
    };

    await assertRejects(
      async () => await repository.execute(placeOrderCommand),
      RestaurantNotFoundError,
    );
  },
});

Deno.test({
  name:
    "Postgres: AllDeciderPostgresRepository - MarkOrderAsPreparedCommand fails (order doesn't exist)",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const repository = new AllDeciderPostgresRepository(client);

    const markCommand: MarkOrderAsPreparedCommand = {
      kind: "MarkOrderAsPreparedCommand",
      orderId: orderId("o-mark-noexist-1"),
    };

    await assertRejects(
      async () => await repository.execute(markCommand),
      OrderNotFoundError,
    );
  },
});

Deno.test({
  name: "Postgres: AllDeciderPostgresRepository - Full workflow succeeds",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const repository = new AllDeciderPostgresRepository(client);

    // 1. Create restaurant
    const createCommand: CreateRestaurantCommand = {
      kind: "CreateRestaurantCommand",
      restaurantId: restaurantId("r-workflow-1"),
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

    const createEvents = await repository.execute(createCommand);
    assertEquals(createEvents.length, 1);
    assertEquals(createEvents[0].kind, "RestaurantCreatedEvent");

    // 2. Place order
    const placeOrderCommand: PlaceOrderCommand = {
      kind: "PlaceOrderCommand",
      restaurantId: restaurantId("r-workflow-1"),
      orderId: orderId("o-workflow-1"),
      menuItems: [
        {
          menuItemId: menuItemId("item1"),
          name: "Pizza",
          price: "12.99",
        },
      ],
    };

    const orderEvents = await repository.execute(placeOrderCommand);
    assertEquals(orderEvents.length, 1);
    assertEquals(orderEvents[0].kind, "RestaurantOrderPlacedEvent");

    // 3. Mark order as prepared
    const markCommand: MarkOrderAsPreparedCommand = {
      kind: "MarkOrderAsPreparedCommand",
      orderId: orderId("o-workflow-1"),
    };

    const preparedEvents = await repository.execute(markCommand);
    assertEquals(preparedEvents.length, 1);
    assertEquals(preparedEvents[0].kind, "OrderPreparedEvent");
  },
});

// ###########################################################################
// #################### Batch Execution Tests ################################
// ###########################################################################

Deno.test({
  name:
    "Postgres: AllDeciderPostgresRepository - executeBatch: empty batch returns empty array",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const repository = new AllDeciderPostgresRepository(client);
    const events = await repository.executeBatch([]);
    assertEquals(events.length, 0);
  },
});

Deno.test({
  name:
    "Postgres: AllDeciderPostgresRepository - executeBatch: CreateRestaurant + PlaceOrder in one atomic batch",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const repository = new AllDeciderPostgresRepository(client);

    const events = await repository.executeBatch([
      {
        kind: "CreateRestaurantCommand",
        restaurantId: restaurantId("r-batch-1"),
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
      } satisfies CreateRestaurantCommand,
      {
        kind: "PlaceOrderCommand",
        restaurantId: restaurantId("r-batch-1"),
        orderId: orderId("o-batch-1"),
        menuItems: [
          {
            menuItemId: menuItemId("item1"),
            name: "Pizza",
            price: "12.99",
          },
        ],
      } satisfies PlaceOrderCommand,
    ]);

    assertEquals(events.length, 2);
    assertEquals(events[0].kind, "RestaurantCreatedEvent");
    assertEquals(events[1].kind, "RestaurantOrderPlacedEvent");
  },
});

Deno.test({
  name:
    "Postgres: AllDeciderPostgresRepository - executeBatch: domain error mid-batch prevents all persistence",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const repository = new AllDeciderPostgresRepository(client);

    // PlaceOrder first will fail because restaurant doesn't exist yet
    await assertRejects(
      async () =>
        await repository.executeBatch([
          {
            kind: "PlaceOrderCommand",
            restaurantId: restaurantId("r-batcherr-1"),
            orderId: orderId("o-batcherr-1"),
            menuItems: [
              {
                menuItemId: menuItemId("item1"),
                name: "Pizza",
                price: "12.99",
              },
            ],
          } satisfies PlaceOrderCommand,
          {
            kind: "CreateRestaurantCommand",
            restaurantId: restaurantId("r-batcherr-1"),
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
          } satisfies CreateRestaurantCommand,
        ]),
      RestaurantNotFoundError,
    );
  },
});

Deno.test({
  name:
    "Postgres: AllDeciderPostgresRepository - executeBatch: three-step workflow in single batch",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const repository = new AllDeciderPostgresRepository(client);

    const events = await repository.executeBatch([
      {
        kind: "CreateRestaurantCommand",
        restaurantId: restaurantId("r-batch3-1"),
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
      } satisfies CreateRestaurantCommand,
      {
        kind: "PlaceOrderCommand",
        restaurantId: restaurantId("r-batch3-1"),
        orderId: orderId("o-batch3-1"),
        menuItems: [
          {
            menuItemId: menuItemId("item1"),
            name: "Pizza",
            price: "12.99",
          },
        ],
      } satisfies PlaceOrderCommand,
      {
        kind: "MarkOrderAsPreparedCommand",
        orderId: orderId("o-batch3-1"),
      } satisfies MarkOrderAsPreparedCommand,
    ]);

    assertEquals(events.length, 3);
    assertEquals(events[0].kind, "RestaurantCreatedEvent");
    assertEquals(events[1].kind, "RestaurantOrderPlacedEvent");
    assertEquals(events[2].kind, "OrderPreparedEvent");
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
