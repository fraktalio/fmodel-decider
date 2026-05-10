/**
 * Tests for AllDeciderRepository - demonstrates combined Aggregate approach.
 *
 * @remarks
 * These tests demonstrate how the combined repository works with Aggregate deciders
 * that use `combineViaTuples()` for tuple-based composition.
 *
 * **Key characteristics:**
 *
 * **Aggregate pattern (these tests):**
 * - Uses `combineViaTuples()` for composition
 * - ALL deciders process EVERY command
 * - Unrecognized commands return [] (no events)
 * - Strong consistency boundaries per entity
 * - State is tuple: `[Restaurant | null, Order | null]`
 *
 * **Similarity with DCB pattern:**
 * - Both use `combineViaTuples()` composition
 * - Both process commands through all deciders
 * - Both handle unrecognized commands gracefully
 *
 * **Difference from DCB pattern:**
 * - Aggregate: Fixed boundaries per entity (Restaurant, Order)
 * - DCB: Dynamic boundaries per use case (CreateRestaurant, PlaceOrder, etc.)
 *
 * **Two valid approaches demonstrated:**
 *
 * **1. Combined approach (these tests):**
 * - Single repository handles all commands
 * - Simpler application code
 * - All deciders process every command
 * - Good for: Smaller domains, simpler architecture
 *
 * **2. Separate repositories (RestaurantRepository, OrderRepository):**
 * - Each repository uses only its specific decider
 * - More explicit aggregate boundaries
 * - Only relevant decider processes each command (more efficient)
 * - Good for: Larger domains, clearer separation
 *
 * Both approaches are valid - choose based on your domain complexity.
 */

import { assertEquals, assertRejects } from "@std/assert";
import { AllDeciderRepository } from "./all_deciderRepository.ts";
import {
  type ChangeRestaurantMenuCommand,
  type CreateOrderCommand,
  type CreateRestaurantCommand,
  type MarkOrderAsPreparedCommand,
  menuItemId,
  OrderAlreadyExistsError,
  orderId,
  OrderNotFoundError,
  RestaurantAlreadyExistsError,
  restaurantId,
  restaurantMenuId,
  RestaurantNotFoundError,
} from "./api.ts";
import type { CommandMetadata } from "../../infrastructure.ts";

Deno.test("AllDeciderRepository - CreateRestaurantCommand succeeds (processed by all deciders)", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    const repository = new AllDeciderRepository(kv);

    const command: CreateRestaurantCommand & CommandMetadata = {
      decider: "Restaurant",
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
      idempotencyKey: crypto.randomUUID(),
    };

    // This succeeds with combineViaTuples():
    // 1. Command sent to ALL deciders
    // 2. restaurantDecider processes it ✅ (creates RestaurantCreatedEvent)
    // 3. orderDecider processes it ✅ (returns [] in default case)
    const events = await repository.execute(command);

    assertEquals(events.length, 1);
    assertEquals(events[0].kind, "RestaurantCreatedEvent");
    assertEquals(events[0].decider, "Restaurant");
  } finally {
    kv.close();
  }
});

Deno.test("AllDeciderRepository - CreateOrderCommand succeeds (processed by all deciders)", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    const repository = new AllDeciderRepository(kv);

    const command: CreateOrderCommand & CommandMetadata = {
      decider: "Order",
      kind: "CreateOrderCommand",
      orderId: orderId("o1"),
      restaurantId: restaurantId("r1"),
      menuItems: [
        { menuItemId: menuItemId("item1"), name: "Pizza", price: "12.99" },
      ],
      idempotencyKey: crypto.randomUUID(),
    };

    // This succeeds with combineViaTuples():
    // 1. Command sent to ALL deciders
    // 2. restaurantDecider processes it ✅ (returns [] in default case)
    // 3. orderDecider processes it ✅ (creates OrderCreatedEvent)
    const events = await repository.execute(command);

    assertEquals(events.length, 1);
    assertEquals(events[0].kind, "OrderCreatedEvent");
    assertEquals(events[0].decider, "Order");
  } finally {
    kv.close();
  }
});

Deno.test("AllDeciderRepository - duplicate restaurant rejection (domain error)", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    const repository = new AllDeciderRepository(kv);

    const command: CreateRestaurantCommand & CommandMetadata = {
      decider: "Restaurant",
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
      idempotencyKey: crypto.randomUUID(),
    };

    // First creation succeeds
    await repository.execute(command);

    // Second creation fails with domain error
    await assertRejects(
      async () =>
        await repository.execute({
          ...command,
          idempotencyKey: crypto.randomUUID(),
        }),
      RestaurantAlreadyExistsError,
    );
  } finally {
    kv.close();
  }
});

Deno.test("AllDeciderRepository - duplicate order rejection (domain error)", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    const repository = new AllDeciderRepository(kv);

    const command: CreateOrderCommand & CommandMetadata = {
      decider: "Order",
      kind: "CreateOrderCommand",
      orderId: orderId("o1"),
      restaurantId: restaurantId("r1"),
      menuItems: [
        { menuItemId: menuItemId("item1"), name: "Pizza", price: "12.99" },
      ],
      idempotencyKey: crypto.randomUUID(),
    };

    // First creation succeeds
    await repository.execute(command);

    // Second creation fails with domain error
    await assertRejects(
      async () =>
        await repository.execute({
          ...command,
          idempotencyKey: crypto.randomUUID(),
        }),
      OrderAlreadyExistsError,
    );
  } finally {
    kv.close();
  }
});

Deno.test("AllDeciderRepository - change menu on non-existent restaurant", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    const repository = new AllDeciderRepository(kv);

    const changeCommand: ChangeRestaurantMenuCommand & CommandMetadata = {
      decider: "Restaurant",
      kind: "ChangeRestaurantMenuCommand",
      restaurantId: restaurantId("r1"),
      menu: {
        menuId: restaurantMenuId("m2"),
        cuisine: "FRENCH",
        menuItems: [
          { menuItemId: menuItemId("item3"), name: "Croissant", price: "5.99" },
        ],
      },
      idempotencyKey: crypto.randomUUID(),
    };

    // Fails because restaurant doesn't exist
    await assertRejects(
      async () => await repository.execute(changeCommand),
      RestaurantNotFoundError,
    );
  } finally {
    kv.close();
  }
});

Deno.test("AllDeciderRepository - mark non-existent order as prepared", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    const repository = new AllDeciderRepository(kv);

    const markCommand: MarkOrderAsPreparedCommand & CommandMetadata = {
      decider: "Order",
      kind: "MarkOrderAsPreparedCommand",
      orderId: orderId("o1"),
      idempotencyKey: crypto.randomUUID(),
    };

    // Fails because order doesn't exist
    await assertRejects(
      async () => await repository.execute(markCommand),
      OrderNotFoundError,
    );
  } finally {
    kv.close();
  }
});

Deno.test("AllDeciderRepository - full workflow with combined approach", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    const repository = new AllDeciderRepository(kv);

    // 1. Create restaurant
    const createRestaurantCommand: CreateRestaurantCommand & CommandMetadata = {
      decider: "Restaurant",
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
      idempotencyKey: crypto.randomUUID(),
    };

    const restaurantEvents = await repository.execute(createRestaurantCommand);
    assertEquals(restaurantEvents.length, 1);
    assertEquals(restaurantEvents[0].kind, "RestaurantCreatedEvent");

    // 2. Change restaurant menu
    const changeMenuCommand: ChangeRestaurantMenuCommand & CommandMetadata = {
      decider: "Restaurant",
      kind: "ChangeRestaurantMenuCommand",
      restaurantId: restaurantId("r1"),
      menu: {
        menuId: restaurantMenuId("m2"),
        cuisine: "FRENCH",
        menuItems: [
          { menuItemId: menuItemId("item2"), name: "Croissant", price: "5.99" },
        ],
      },
      idempotencyKey: crypto.randomUUID(),
    };

    const menuEvents = await repository.execute(changeMenuCommand);
    assertEquals(menuEvents.length, 1);
    assertEquals(menuEvents[0].kind, "RestaurantMenuChangedEvent");

    // 3. Create order
    const createOrderCommand: CreateOrderCommand & CommandMetadata = {
      decider: "Order",
      kind: "CreateOrderCommand",
      orderId: orderId("o1"),
      restaurantId: restaurantId("r1"),
      menuItems: [
        { menuItemId: menuItemId("item2"), name: "Croissant", price: "5.99" },
      ],
      idempotencyKey: crypto.randomUUID(),
    };

    const orderEvents = await repository.execute(createOrderCommand);
    assertEquals(orderEvents.length, 1);
    assertEquals(orderEvents[0].kind, "OrderCreatedEvent");

    // 4. Mark order as prepared
    const markCommand: MarkOrderAsPreparedCommand & CommandMetadata = {
      decider: "Order",
      kind: "MarkOrderAsPreparedCommand",
      orderId: orderId("o1"),
      idempotencyKey: crypto.randomUUID(),
    };

    const preparedEvents = await repository.execute(markCommand);
    assertEquals(preparedEvents.length, 1);
    assertEquals(preparedEvents[0].kind, "OrderPreparedEvent");

    // This demonstrates the combined approach:
    // - Single repository handles all commands
    // - All deciders process every command
    // - Strong consistency boundaries per aggregate
    //
    // **Note:** Restaurant and Order are separate aggregates
    // - Restaurant commands only affect Restaurant state
    // - Order commands only affect Order state
    // - No cross-aggregate operations in this pattern
    //
    // For cross-aggregate coordination, use:
    // - Process managers (restaurantOrderWorkflow)
    // - Sagas
    // - Domain events
  } finally {
    kv.close();
  }
});

Deno.test("AllDeciderRepository - demonstrates tuple-based composition", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    const repository = new AllDeciderRepository(kv);

    const restaurantCommand: CreateRestaurantCommand & CommandMetadata = {
      decider: "Restaurant",
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
      idempotencyKey: crypto.randomUUID(),
    };

    const orderCommand: CreateOrderCommand & CommandMetadata = {
      decider: "Order",
      kind: "CreateOrderCommand",
      orderId: orderId("o1"),
      restaurantId: restaurantId("r1"),
      menuItems: [
        { menuItemId: menuItemId("item1"), name: "Pizza", price: "12.99" },
      ],
      idempotencyKey: crypto.randomUUID(),
    };

    // Key insight: combineViaTuples() sends commands to ALL deciders
    //
    // When processing restaurantCommand:
    // ✅ restaurantDecider.decide() is called (produces events)
    // ✅ orderDecider.decide() is called (returns [] in default case)
    //
    // When processing orderCommand:
    // ✅ restaurantDecider.decide() is called (returns [] in default case)
    // ✅ orderDecider.decide() is called (produces events)
    //
    // This is the SAME approach as DCB's combineViaTuples()
    // but with fixed aggregate boundaries instead of use-case boundaries.
    //
    // **Comparison:**
    // - Aggregate combineViaTuples(): Fixed entity boundaries, all deciders process
    // - DCB combineViaTuples(): Dynamic use-case boundaries, all deciders process
    //
    // **Trade-offs:**
    // - Combined: Simpler application code, all deciders process every command
    // - Separate repositories: More efficient, only relevant decider processes each command

    const restaurantEvents = await repository.execute(restaurantCommand);
    assertEquals(restaurantEvents.length, 1);
    assertEquals(restaurantEvents[0].decider, "Restaurant");

    const orderEvents = await repository.execute(orderCommand);
    assertEquals(orderEvents.length, 1);
    assertEquals(orderEvents[0].decider, "Order");
  } finally {
    kv.close();
  }
});
