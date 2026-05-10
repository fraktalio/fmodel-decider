/**
 * Educational tests for AllDeciderRepository - demonstrates combined approach.
 *
 * @remarks
 * **IMPORTANT: These tests demonstrate the combined repository approach.**
 *
 * This test file shows how a combined repository works with DCB deciders that use
 * `combineViaTuples()` and handle null commands gracefully.
 *
 * **How it works:**
 * - All deciders accept `Command | null` and `Event | null`
 * - Unrecognized commands return empty array `[]` in default case
 * - No errors are thrown for unrelated commands
 * - All deciders process every command, but only relevant ones produce events
 *
 * **Two valid approaches:**
 *
 * **1. Combined approach (demonstrated here):**
 * - Single repository handles all commands
 * - Simpler application code
 * - All deciders process every command
 * - Good for: Small domains, simpler architecture
 *
 * **2. Sliced approach (individual repositories):**
 * - Separate repository per use case
 * - Only relevant decider processes each command
 * - More explicit use case boundaries
 * - Good for: Larger domains, performance-critical applications
 *
 * Choose based on your domain complexity and performance requirements.
 */

import { assertEquals, assertRejects } from "@std/assert";
import { AllDeciderRepository } from "./all_deciderRepository.ts";
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
import type { CommandMetadata } from "../../infrastructure.ts";

Deno.test("AllDeciderRepository - CreateRestaurantCommand succeeds (but processes through all deciders)", async () => {
  // Use in-memory Deno KV
  const kv = await Deno.openKv(":memory:");

  try {
    const repository = new AllDeciderRepository(kv);

    const command: CreateRestaurantCommand & CommandMetadata = {
      kind: "CreateRestaurantCommand",
      restaurantId: restaurantId("r1"),
      name: "Bistro",
      menu: {
        menuId: restaurantMenuId("m1"),
        cuisine: "ITALIAN",
        menuItems: [
          { menuItemId: menuItemId("item1"), name: "Pizza", price: "12.99" },
        ],
      },
      idempotencyKey: "test-all-decider-create-1",
    };

    // This SUCCEEDS because all deciders handle null commands gracefully:
    // 1. crateRestaurantDecider processes it ✅ (creates RestaurantCreatedEvent)
    // 2. changeRestaurantManuDecider processes it ✅ (returns [] in default case)
    // 3. placeOrderDecider processes it ✅ (returns [] in default case)
    // 4. markOrderAsPreparedDecider processes it ✅ (returns [] in default case)
    //
    // However, this is INEFFICIENT - all 4 deciders run for every command
    const events = await repository.execute(command);

    assertEquals(events.length, 1);
    assertEquals(events[0].kind, "RestaurantCreatedEvent");
  } finally {
    kv.close();
  }
});

Deno.test("AllDeciderRepository - ChangeRestaurantMenuCommand fails (restaurant doesn't exist)", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    const repository = new AllDeciderRepository(kv);

    const changeCommand: ChangeRestaurantMenuCommand & CommandMetadata = {
      kind: "ChangeRestaurantMenuCommand",
      restaurantId: restaurantId("r1"),
      menu: {
        menuId: restaurantMenuId("m2"),
        cuisine: "FRENCH",
        menuItems: [
          { menuItemId: menuItemId("item3"), name: "Croissant", price: "5.99" },
        ],
      },
      idempotencyKey: "test-all-decider-change-fail",
    };

    // This FAILS because restaurant doesn't exist (domain error)
    // - changeRestaurantManuDecider throws RestaurantNotFoundError
    await assertRejects(
      async () => await repository.execute(changeCommand),
      RestaurantNotFoundError,
    );
  } finally {
    kv.close();
  }
});

Deno.test("AllDeciderRepository - PlaceOrderCommand fails (restaurant doesn't exist)", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    const repository = new AllDeciderRepository(kv);

    const placeOrderCommand: PlaceOrderCommand & CommandMetadata = {
      kind: "PlaceOrderCommand",
      restaurantId: restaurantId("r1"),
      orderId: orderId("o1"),
      menuItems: [
        { menuItemId: menuItemId("item1"), name: "Pizza", price: "12.99" },
      ],
      idempotencyKey: "test-all-decider-place-fail",
    };

    // This FAILS because restaurant doesn't exist (domain error)
    // - placeOrderDecider throws RestaurantNotFoundError
    await assertRejects(
      async () => await repository.execute(placeOrderCommand),
      RestaurantNotFoundError,
    );
  } finally {
    kv.close();
  }
});

Deno.test("AllDeciderRepository - MarkOrderAsPreparedCommand fails (order doesn't exist)", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    const repository = new AllDeciderRepository(kv);

    const markCommand: MarkOrderAsPreparedCommand & CommandMetadata = {
      kind: "MarkOrderAsPreparedCommand",
      orderId: orderId("o1"),
      idempotencyKey: "test-all-decider-mark-fail",
    };

    // This FAILS because order doesn't exist (domain error)
    // - markOrderAsPreparedDecider throws OrderNotFoundError
    await assertRejects(
      async () => await repository.execute(markCommand),
      OrderNotFoundError,
    );
  } finally {
    kv.close();
  }
});

Deno.test("AllDeciderRepository - Full workflow succeeds with combined approach", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    const repository = new AllDeciderRepository(kv);

    // 1. Create restaurant
    const createCommand: CreateRestaurantCommand & CommandMetadata = {
      kind: "CreateRestaurantCommand",
      restaurantId: restaurantId("r1"),
      name: "Bistro",
      menu: {
        menuId: restaurantMenuId("m1"),
        cuisine: "ITALIAN",
        menuItems: [
          { menuItemId: menuItemId("item1"), name: "Pizza", price: "12.99" },
        ],
      },
      idempotencyKey: "test-all-decider-workflow-create",
    };

    const createEvents = await repository.execute(createCommand);
    assertEquals(createEvents.length, 1);
    assertEquals(createEvents[0].kind, "RestaurantCreatedEvent");

    // 2. Place order
    const placeOrderCommand: PlaceOrderCommand & CommandMetadata = {
      kind: "PlaceOrderCommand",
      restaurantId: restaurantId("r1"),
      orderId: orderId("o1"),
      menuItems: [
        { menuItemId: menuItemId("item1"), name: "Pizza", price: "12.99" },
      ],
      idempotencyKey: "test-all-decider-workflow-place",
    };

    const orderEvents = await repository.execute(placeOrderCommand);
    assertEquals(orderEvents.length, 1);
    assertEquals(orderEvents[0].kind, "RestaurantOrderPlacedEvent");

    // 3. Mark order as prepared
    const markCommand: MarkOrderAsPreparedCommand & CommandMetadata = {
      kind: "MarkOrderAsPreparedCommand",
      orderId: orderId("o1"),
      idempotencyKey: "test-all-decider-workflow-mark",
    };

    const preparedEvents = await repository.execute(markCommand);
    assertEquals(preparedEvents.length, 1);
    assertEquals(preparedEvents[0].kind, "OrderPreparedEvent");

    // This works with the combined approach:
    // - Every command is processed by ALL 4 deciders
    // - 3 deciders return [] for each command (no events produced)
    // - Query pattern handles all use cases
    //
    // **Alternative approach:** Use separate repositories
    // - CreateRestaurantRepository (only crateRestaurantDecider runs)
    // - PlaceOrderRepository (only placeOrderDecider runs)
    // - MarkOrderAsPreparedRepository (only markOrderAsPreparedDecider runs)
    //
    // Choose based on your needs:
    // - Combined: Simpler application code
    // - Sliced: Better performance, clearer boundaries
  } finally {
    kv.close();
  }
});

Deno.test("AllDeciderRepository - Educational summary: Two valid approaches", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    const repository = new AllDeciderRepository(kv);

    const command: CreateRestaurantCommand & CommandMetadata = {
      kind: "CreateRestaurantCommand",
      restaurantId: restaurantId("r1"),
      name: "Bistro",
      menu: {
        menuId: restaurantMenuId("m1"),
        cuisine: "ITALIAN",
        menuItems: [
          { menuItemId: menuItemId("item1"), name: "Pizza", price: "12.99" },
        ],
      },
      idempotencyKey: "test-all-decider-educational",
    };

    // This test demonstrates two valid approaches:
    //
    // **Combined approach (this repository):**
    // ✅ Works (due to null handling)
    // ✅ Simpler application code (one repository)
    // ⚠️ All deciders process every command
    // ⚠️ Complex query pattern (must handle all use cases)
    //
    // **Sliced approach (separate repositories):**
    // ✅ Only relevant decider runs
    // ✅ Simple query patterns (one per use case)
    // ✅ Explicit use case boundaries
    // ⚠️ More repository instances to manage
    //
    // **When to use combined approach:**
    // - Small domains with few deciders
    // - Simpler application architecture preferred
    // - Performance overhead is acceptable
    //
    // **When to use sliced approach:**
    // - Larger domains with many deciders
    // - Performance is critical
    // - Clear use case boundaries desired
    //
    // **How combined approach works:**
    // - All deciders handle null commands gracefully
    // - Return empty array [] for unrecognized commands
    // - No errors thrown for unrelated commands
    //
    // Both approaches are valid - choose based on your requirements.
    const events = await repository.execute(command);
    assertEquals(events.length, 1);
    assertEquals(events[0].kind, "RestaurantCreatedEvent");
  } finally {
    kv.close();
  }
});

// ###########################################################################
// #################### Batch Execution Tests ################################
// ###########################################################################

Deno.test("AllDeciderRepository - executeBatch: empty batch returns empty array", async () => {
  const kv = await Deno.openKv(":memory:");
  try {
    const repository = new AllDeciderRepository(kv);
    const events = await repository.executeBatch([]);
    assertEquals(events.length, 0);
  } finally {
    kv.close();
  }
});

Deno.test("AllDeciderRepository - executeBatch: single-command batch matches single execute", async () => {
  const kv1 = await Deno.openKv(":memory:");
  const kv2 = await Deno.openKv(":memory:");
  try {
    const repo1 = new AllDeciderRepository(kv1);
    const repo2 = new AllDeciderRepository(kv2);

    const command: CreateRestaurantCommand & CommandMetadata = {
      kind: "CreateRestaurantCommand",
      restaurantId: restaurantId("r1"),
      name: "Bistro",
      menu: {
        menuId: restaurantMenuId("m1"),
        cuisine: "ITALIAN",
        menuItems: [
          { menuItemId: menuItemId("item1"), name: "Pizza", price: "12.99" },
        ],
      },
      idempotencyKey: "test-all-decider-batch-single",
    };

    const singleEvents = await repo1.execute(command);
    const batchEvents = await repo2.executeBatch([command]);

    // Same number of events, same kinds
    assertEquals(batchEvents.length, singleEvents.length);
    assertEquals(batchEvents[0].kind, singleEvents[0].kind);
    assertEquals(batchEvents[0].kind, "RestaurantCreatedEvent");
  } finally {
    kv1.close();
    kv2.close();
  }
});

Deno.test("AllDeciderRepository - executeBatch: CreateRestaurant + PlaceOrder in one atomic batch", async () => {
  const kv = await Deno.openKv(":memory:");
  try {
    const repository = new AllDeciderRepository(kv);

    // This is the primary batch use case: accumulated event propagation
    // enables PlaceOrder to see the RestaurantCreatedEvent from the same batch
    const events = await repository.executeBatch([
      {
        kind: "CreateRestaurantCommand",
        restaurantId: restaurantId("r1"),
        name: "Bistro",
        menu: {
          menuId: restaurantMenuId("m1"),
          cuisine: "ITALIAN",
          menuItems: [
            { menuItemId: menuItemId("item1"), name: "Pizza", price: "12.99" },
          ],
        },
        idempotencyKey: "test-all-decider-batch-create-place",
      } satisfies CreateRestaurantCommand & CommandMetadata,
      {
        kind: "PlaceOrderCommand",
        restaurantId: restaurantId("r1"),
        orderId: orderId("o1"),
        menuItems: [
          { menuItemId: menuItemId("item1"), name: "Pizza", price: "12.99" },
        ],
        idempotencyKey: "test-all-decider-batch-create-place",
      } satisfies PlaceOrderCommand & CommandMetadata,
    ]);

    // Both commands produce events in order
    assertEquals(events.length, 2);
    assertEquals(events[0].kind, "RestaurantCreatedEvent");
    assertEquals(events[1].kind, "RestaurantOrderPlacedEvent");
  } finally {
    kv.close();
  }
});

Deno.test("AllDeciderRepository - executeBatch: domain error mid-batch prevents all persistence", async () => {
  const kv = await Deno.openKv(":memory:");
  try {
    const repository = new AllDeciderRepository(kv);

    // PlaceOrder will fail because restaurant doesn't exist yet in storage,
    // and CreateRestaurant is the SECOND command so its event isn't available
    // when PlaceOrder runs first
    await assertRejects(
      async () =>
        await repository.executeBatch([
          {
            kind: "PlaceOrderCommand",
            restaurantId: restaurantId("r1"),
            orderId: orderId("o1"),
            menuItems: [
              {
                menuItemId: menuItemId("item1"),
                name: "Pizza",
                price: "12.99",
              },
            ],
            idempotencyKey: "test-all-decider-batch-error",
          } satisfies PlaceOrderCommand & CommandMetadata,
          {
            kind: "CreateRestaurantCommand",
            restaurantId: restaurantId("r1"),
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
            idempotencyKey: "test-all-decider-batch-error",
          } satisfies CreateRestaurantCommand & CommandMetadata,
        ]),
      RestaurantNotFoundError,
    );

    // Verify nothing was persisted — a subsequent single execute should also fail
    await assertRejects(
      async () =>
        await repository.execute({
          kind: "PlaceOrderCommand",
          restaurantId: restaurantId("r1"),
          orderId: orderId("o1"),
          menuItems: [
            { menuItemId: menuItemId("item1"), name: "Pizza", price: "12.99" },
          ],
          idempotencyKey: "test-all-decider-batch-error-verify",
        }),
      RestaurantNotFoundError,
    );
  } finally {
    kv.close();
  }
});

Deno.test("AllDeciderRepository - executeBatch: filter exclusion - accumulated events not matching query tuples are excluded", async () => {
  const kv = await Deno.openKv(":memory:");
  try {
    const repository = new AllDeciderRepository(kv);

    // Create two restaurants, then place an order on the first.
    // The PlaceOrderCommand for r1 should NOT see the RestaurantCreatedEvent for r2
    // because the query tuple filters by restaurantId.
    const events = await repository.executeBatch([
      {
        kind: "CreateRestaurantCommand",
        restaurantId: restaurantId("r1"),
        name: "Bistro",
        menu: {
          menuId: restaurantMenuId("m1"),
          cuisine: "ITALIAN",
          menuItems: [
            { menuItemId: menuItemId("item1"), name: "Pizza", price: "12.99" },
          ],
        },
        idempotencyKey: "test-all-decider-batch-filter",
      } satisfies CreateRestaurantCommand & CommandMetadata,
      {
        kind: "CreateRestaurantCommand",
        restaurantId: restaurantId("r2"),
        name: "Sushi Bar",
        menu: {
          menuId: restaurantMenuId("m2"),
          cuisine: "GENERAL",
          menuItems: [
            { menuItemId: menuItemId("item2"), name: "Sushi", price: "15.99" },
          ],
        },
        idempotencyKey: "test-all-decider-batch-filter",
      } satisfies CreateRestaurantCommand & CommandMetadata,
      {
        kind: "PlaceOrderCommand",
        restaurantId: restaurantId("r1"),
        orderId: orderId("o1"),
        menuItems: [
          { menuItemId: menuItemId("item1"), name: "Pizza", price: "12.99" },
        ],
        idempotencyKey: "test-all-decider-batch-filter",
      } satisfies PlaceOrderCommand & CommandMetadata,
    ]);

    assertEquals(events.length, 3);
    assertEquals(events[0].kind, "RestaurantCreatedEvent");
    assertEquals(events[1].kind, "RestaurantCreatedEvent");
    assertEquals(events[2].kind, "RestaurantOrderPlacedEvent");
  } finally {
    kv.close();
  }
});

Deno.test("AllDeciderRepository - executeBatch: three-step workflow in single batch", async () => {
  const kv = await Deno.openKv(":memory:");
  try {
    const repository = new AllDeciderRepository(kv);

    // Full workflow: Create → PlaceOrder → MarkAsPrepared, all in one atomic batch
    const events = await repository.executeBatch([
      {
        kind: "CreateRestaurantCommand",
        restaurantId: restaurantId("r1"),
        name: "Bistro",
        menu: {
          menuId: restaurantMenuId("m1"),
          cuisine: "ITALIAN",
          menuItems: [
            { menuItemId: menuItemId("item1"), name: "Pizza", price: "12.99" },
          ],
        },
        idempotencyKey: "test-all-decider-batch-workflow",
      } satisfies CreateRestaurantCommand & CommandMetadata,
      {
        kind: "PlaceOrderCommand",
        restaurantId: restaurantId("r1"),
        orderId: orderId("o1"),
        menuItems: [
          { menuItemId: menuItemId("item1"), name: "Pizza", price: "12.99" },
        ],
        idempotencyKey: "test-all-decider-batch-workflow",
      } satisfies PlaceOrderCommand & CommandMetadata,
      {
        kind: "MarkOrderAsPreparedCommand",
        orderId: orderId("o1"),
        idempotencyKey: "test-all-decider-batch-workflow",
      } satisfies MarkOrderAsPreparedCommand & CommandMetadata,
    ]);

    assertEquals(events.length, 3);
    assertEquals(events[0].kind, "RestaurantCreatedEvent");
    assertEquals(events[1].kind, "RestaurantOrderPlacedEvent");
    assertEquals(events[2].kind, "OrderPreparedEvent");
  } finally {
    kv.close();
  }
});
