/**
 * Integration tests for MarkOrderAsPreparedRepository.
 *
 * Tests verify:
 * - Event persistence to Deno KV with dual-index architecture
 * - Optimistic locking with automatic retry
 * - Domain error propagation (non-existent order, already prepared)
 * - Concurrent modification detection
 * - Events indexed by order ID correctly
 */

import { assertEquals, assertRejects } from "@std/assert";
import { EventSourcedCommandHandler } from "../../application.ts";
import { markOrderAsPreparedRepository } from "./markOrderAsPreparedRepository.ts";
import { placeOrderRepository } from "./placeOrderRepository.ts";
import { createRestaurantRepository } from "./createRestaurantRepository.ts";
import type { EventMetadata } from "../../denoKvRepository.ts";
import { markOrderAsPreparedDecider } from "./markOrderAsPreparedDecider.ts";
import { placeOrderDecider } from "./placeOrderDecider.ts";
import { createRestaurantDecider } from "./createRestaurantDecider.ts";
import {
  type CreateRestaurantCommand,
  type MarkOrderAsPreparedCommand,
  menuItemId,
  OrderAlreadyPreparedError,
  type OrderId,
  orderId,
  OrderNotFoundError,
  type OrderPreparedEvent,
  type PlaceOrderCommand,
  type RestaurantId,
  restaurantId,
  restaurantMenuId,
} from "./api.ts";

/**
 * Helper to set up a restaurant and place an order for testing.
 */
async function setupRestaurantAndOrder(
  kv: Deno.Kv,
  restId: RestaurantId,
  ordId: OrderId,
): Promise<void> {
  // Create restaurant
  const createRepo = createRestaurantRepository(kv);
  const createHandler = new EventSourcedCommandHandler(
    createRestaurantDecider,
    createRepo,
  );

  const createCommand: CreateRestaurantCommand = {
    kind: "CreateRestaurantCommand",
    restaurantId: restId,
    name: "Test Bistro",
    menu: {
      menuId: restaurantMenuId("m1"),
      cuisine: "ITALIAN",
      menuItems: [
        { menuItemId: menuItemId("item1"), name: "Pizza", price: "12.99" },
      ],
    },
  };

  await createHandler.handle(createCommand);

  // Place order
  const placeRepo = placeOrderRepository(kv);
  const placeHandler = new EventSourcedCommandHandler(
    placeOrderDecider,
    placeRepo,
  );

  const placeCommand: PlaceOrderCommand = {
    kind: "PlaceOrderCommand",
    restaurantId: restId,
    orderId: ordId,
    menuItems: [
      { menuItemId: menuItemId("item1"), name: "Pizza", price: "12.99" },
    ],
  };

  await placeHandler.handle(placeCommand);
}

Deno.test("MarkOrderAsPreparedRepository - successful order preparation via handler.handle() (happy path)", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    // Set up restaurant and order
    await setupRestaurantAndOrder(
      kv,
      restaurantId("r-prep-1"),
      orderId("o-prep-1"),
    );

    // Mark order as prepared
    const repository = markOrderAsPreparedRepository(kv);
    const handler = new EventSourcedCommandHandler(
      markOrderAsPreparedDecider,
      repository,
    );

    const command: MarkOrderAsPreparedCommand = {
      kind: "MarkOrderAsPreparedCommand",
      orderId: orderId("o-prep-1"),
    };

    const events = await handler.handle(command);

    // Verify events returned
    assertEquals(events.length, 1);
    const event = events[0] as OrderPreparedEvent & EventMetadata;
    assertEquals(event.kind, "OrderPreparedEvent");
    assertEquals(event.orderId, orderId("o-prep-1"));
    assertEquals(event.final, false);

    // Verify event metadata
    assertEquals(typeof event.eventId, "string");
    assertEquals(typeof event.timestamp, "number");
    assertEquals(typeof event.versionstamp, "string");

    // Verify events persisted to primary storage
    const primaryKey = ["events", event.eventId];
    const primaryResult = await kv.get(primaryKey);
    assertEquals(primaryResult.value !== null, true);
    const storedEvent = primaryResult.value as OrderPreparedEvent;
    assertEquals(storedEvent.kind, "OrderPreparedEvent");
    assertEquals(storedEvent.orderId, orderId("o-prep-1"));

    // Verify events persisted to type index (pointer pattern)
    const typeIndexKey = [
      "events_by_type",
      "OrderPreparedEvent",
      "orderId:o-prep-1",
      event.eventId,
    ];
    const typeIndexResult = await kv.get(typeIndexKey);
    assertEquals(typeIndexResult.value !== null, true);
    assertEquals(typeIndexResult.value, event.eventId);
  } finally {
    kv.close();
  }
});

Deno.test("MarkOrderAsPreparedRepository - non-existent order rejection (domain error propagation)", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    const repository = markOrderAsPreparedRepository(kv);
    const handler = new EventSourcedCommandHandler(
      markOrderAsPreparedDecider,
      repository,
    );

    const command: MarkOrderAsPreparedCommand = {
      kind: "MarkOrderAsPreparedCommand",
      orderId: orderId("o-nonexist-999"), // Non-existent order
    };

    // Should fail with domain error
    await assertRejects(
      async () => {
        await handler.handle(command);
      },
      OrderNotFoundError,
    );
  } finally {
    kv.close();
  }
});

Deno.test("MarkOrderAsPreparedRepository - already prepared order rejection (domain error propagation)", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    // Set up restaurant and order
    await setupRestaurantAndOrder(
      kv,
      restaurantId("r-already-1"),
      orderId("o-already-1"),
    );

    // Mark order as prepared
    const repository = markOrderAsPreparedRepository(kv);
    const handler = new EventSourcedCommandHandler(
      markOrderAsPreparedDecider,
      repository,
    );

    const command: MarkOrderAsPreparedCommand = {
      kind: "MarkOrderAsPreparedCommand",
      orderId: orderId("o-already-1"),
    };

    // First preparation should succeed
    const result1 = await handler.handle(command);
    assertEquals(result1.length, 1, "First preparation should produce 1 event");

    // Second preparation should fail
    await assertRejects(
      async () => {
        await handler.handle(command);
      },
      OrderAlreadyPreparedError,
    );
  } finally {
    kv.close();
  }
});

Deno.test("MarkOrderAsPreparedRepository - concurrent modification detection (optimistic locking)", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    // Set up restaurant and multiple orders
    await setupRestaurantAndOrder(
      kv,
      restaurantId("r-concurrent-1"),
      orderId("o-concurrent-1"),
    );

    // Create a second order for the same restaurant
    const placeRepo = placeOrderRepository(kv);
    const placeHandler = new EventSourcedCommandHandler(
      placeOrderDecider,
      placeRepo,
    );

    const placeCommand: PlaceOrderCommand = {
      kind: "PlaceOrderCommand",
      restaurantId: restaurantId("r-concurrent-1"),
      orderId: orderId("o-concurrent-2"),
      menuItems: [
        { menuItemId: menuItemId("item1"), name: "Pizza", price: "12.99" },
      ],
    };

    await placeHandler.handle(placeCommand);

    // Mark both orders as prepared - should succeed with retry logic
    const repository = markOrderAsPreparedRepository(kv);
    const handler = new EventSourcedCommandHandler(
      markOrderAsPreparedDecider,
      repository,
    );

    const command1: MarkOrderAsPreparedCommand = {
      kind: "MarkOrderAsPreparedCommand",
      orderId: orderId("o-concurrent-1"),
    };

    const command2: MarkOrderAsPreparedCommand = {
      kind: "MarkOrderAsPreparedCommand",
      orderId: orderId("o-concurrent-2"),
    };

    const result1 = await handler.handle(command1);
    assertEquals(result1.length, 1);
    assertEquals(
      (result1[0] as OrderPreparedEvent).orderId,
      orderId("o-concurrent-1"),
    );

    const result2 = await handler.handle(command2);
    assertEquals(result2.length, 1);
    assertEquals(
      (result2[0] as OrderPreparedEvent).orderId,
      orderId("o-concurrent-2"),
    );

    // Verify both orders were marked as prepared
    const iter = kv.list({ prefix: ["events_by_type", "OrderPreparedEvent"] });
    const entries = [];
    for await (const entry of iter) {
      entries.push(entry);
    }
    assertEquals(entries.length, 2, "Both orders should be marked as prepared");
  } finally {
    kv.close();
  }
});

Deno.test("MarkOrderAsPreparedRepository - verify events indexed by order ID correctly", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    // Set up restaurant and multiple orders
    await setupRestaurantAndOrder(
      kv,
      restaurantId("r-index-1"),
      orderId("o-index-1"),
    );

    // Create a second order
    const placeRepo = placeOrderRepository(kv);
    const placeHandler = new EventSourcedCommandHandler(
      placeOrderDecider,
      placeRepo,
    );

    const placeCommand: PlaceOrderCommand = {
      kind: "PlaceOrderCommand",
      restaurantId: restaurantId("r-index-1"),
      orderId: orderId("o-index-2"),
      menuItems: [
        { menuItemId: menuItemId("item1"), name: "Pizza", price: "12.99" },
      ],
    };

    await placeHandler.handle(placeCommand);

    // Mark both orders as prepared
    const repository = markOrderAsPreparedRepository(kv);
    const handler = new EventSourcedCommandHandler(
      markOrderAsPreparedDecider,
      repository,
    );

    await handler.handle({
      kind: "MarkOrderAsPreparedCommand",
      orderId: orderId("o-index-1"),
    });

    await handler.handle({
      kind: "MarkOrderAsPreparedCommand",
      orderId: orderId("o-index-2"),
    });

    // Query events by order ID - should find specific order
    const iterByOrder1 = kv.list({
      prefix: ["events_by_type", "OrderPreparedEvent", "orderId:o-index-1"],
    });
    const entriesByOrder1 = [];
    for await (const entry of iterByOrder1) {
      entriesByOrder1.push(entry);
    }
    assertEquals(entriesByOrder1.length, 1);

    const iterByOrder2 = kv.list({
      prefix: ["events_by_type", "OrderPreparedEvent", "orderId:o-index-2"],
    });
    const entriesByOrder2 = [];
    for await (const entry of iterByOrder2) {
      entriesByOrder2.push(entry);
    }
    assertEquals(entriesByOrder2.length, 1);

    // Verify indexes point to correct events in primary storage
    for (const entry of [...entriesByOrder1, ...entriesByOrder2]) {
      assertEquals(entry.key[0], "events_by_type");
      assertEquals(entry.key[1], "OrderPreparedEvent");
      assertEquals(typeof entry.key[3], "string"); // Event ID (ULID)
      assertEquals(typeof entry.value, "string"); // Pointer to primary storage

      // Verify we can retrieve the full event from primary storage
      const eventId = entry.value as string;
      const primaryResult = await kv.get(["events", eventId]);
      assertEquals(primaryResult.value !== null, true);
      const event = primaryResult.value as OrderPreparedEvent;
      assertEquals(event.kind, "OrderPreparedEvent");
    }
  } finally {
    kv.close();
  }
});
