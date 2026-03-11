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

Deno.test("AllDeciderRepository - CreateRestaurantCommand succeeds (but processes through all deciders)", async () => {
  // Use in-memory Deno KV
  const kv = await Deno.openKv(":memory:");

  try {
    const repository = new AllDeciderRepository(kv);

    const command: CreateRestaurantCommand = {
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

    const changeCommand: ChangeRestaurantMenuCommand = {
      kind: "ChangeRestaurantMenuCommand",
      restaurantId: restaurantId("r1"),
      menu: {
        menuId: restaurantMenuId("m2"),
        cuisine: "FRENCH",
        menuItems: [
          { menuItemId: menuItemId("item3"), name: "Croissant", price: "5.99" },
        ],
      },
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

    const placeOrderCommand: PlaceOrderCommand = {
      kind: "PlaceOrderCommand",
      restaurantId: restaurantId("r1"),
      orderId: orderId("o1"),
      menuItems: [
        { menuItemId: menuItemId("item1"), name: "Pizza", price: "12.99" },
      ],
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

    const markCommand: MarkOrderAsPreparedCommand = {
      kind: "MarkOrderAsPreparedCommand",
      orderId: orderId("o1"),
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
    const createCommand: CreateRestaurantCommand = {
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
    };

    const createEvents = await repository.execute(createCommand);
    assertEquals(createEvents.length, 1);
    assertEquals(createEvents[0].kind, "RestaurantCreatedEvent");

    // 2. Place order
    const placeOrderCommand: PlaceOrderCommand = {
      kind: "PlaceOrderCommand",
      restaurantId: restaurantId("r1"),
      orderId: orderId("o1"),
      menuItems: [
        { menuItemId: menuItemId("item1"), name: "Pizza", price: "12.99" },
      ],
    };

    const orderEvents = await repository.execute(placeOrderCommand);
    assertEquals(orderEvents.length, 1);
    assertEquals(orderEvents[0].kind, "RestaurantOrderPlacedEvent");

    // 3. Mark order as prepared
    const markCommand: MarkOrderAsPreparedCommand = {
      kind: "MarkOrderAsPreparedCommand",
      orderId: orderId("o1"),
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

    const command: CreateRestaurantCommand = {
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
