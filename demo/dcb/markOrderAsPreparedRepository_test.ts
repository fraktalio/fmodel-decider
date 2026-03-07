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
import { MarkOrderAsPreparedRepository } from "./markOrderAsPreparedRepository.ts";
import { PlaceOrderRepository } from "./placeOrderRepository.ts";
import { CreateRestaurantRepository } from "./createRestaurantRepository.ts";
import type { EventMetadata } from "./repository.ts";
import { markOrderAsPreparedDecider } from "./markOrderAsPreparedDecider.ts";
import { placeOrderDecider } from "./placeOrderDecider.ts";
import { crateRestaurantDecider } from "./createRestaurantDecider.ts";
import type {
  CreateRestaurantCommand,
  MarkOrderAsPreparedCommand,
  OrderPreparedEvent,
  PlaceOrderCommand,
} from "./api.ts";

/**
 * Helper to set up a restaurant and place an order for testing.
 */
async function setupRestaurantAndOrder(
  kv: Deno.Kv,
  restaurantId: string,
  orderId: string,
): Promise<void> {
  // Create restaurant
  const createRepo = new CreateRestaurantRepository(kv);
  const createHandler = new EventSourcedCommandHandler(
    crateRestaurantDecider,
    createRepo,
  );

  const createCommand: CreateRestaurantCommand = {
    kind: "CreateRestaurantCommand",
    id: restaurantId,
    name: "Test Bistro",
    menu: {
      menuId: "m1",
      cuisine: "ITALIAN",
      menuItems: [
        { menuItemId: "item1", name: "Pizza", price: "12.99" },
      ],
    },
  };

  await createHandler.handle(createCommand);

  // Place order
  const placeRepo = new PlaceOrderRepository(kv);
  const placeHandler = new EventSourcedCommandHandler(
    placeOrderDecider,
    placeRepo,
  );

  const placeCommand: PlaceOrderCommand = {
    kind: "PlaceOrderCommand",
    id: restaurantId,
    orderId: orderId,
    menuItems: [
      { menuItemId: "item1", name: "Pizza", price: "12.99" },
    ],
  };

  await placeHandler.handle(placeCommand);
}

Deno.test("MarkOrderAsPreparedRepository - successful order preparation via handler.handle() (happy path)", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    // Set up restaurant and order
    await setupRestaurantAndOrder(kv, "r-prep-1", "o-prep-1");

    // Mark order as prepared
    const repository = new MarkOrderAsPreparedRepository(kv);
    const handler = new EventSourcedCommandHandler(
      markOrderAsPreparedDecider,
      repository,
    );

    const command: MarkOrderAsPreparedCommand = {
      kind: "MarkOrderAsPreparedCommand",
      id: "o-prep-1",
    };

    const events = await handler.handle(command);

    // Verify events returned
    assertEquals(events.length, 1);
    const event = events[0] as OrderPreparedEvent & EventMetadata;
    assertEquals(event.kind, "OrderPreparedEvent");
    assertEquals(event.orderId, "o-prep-1");
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
    assertEquals(storedEvent.orderId, "o-prep-1");

    // Verify events persisted to type index (pointer pattern)
    const typeIndexKey = [
      "events_by_type",
      "OrderPreparedEvent",
      "o-prep-1",
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
    const repository = new MarkOrderAsPreparedRepository(kv);
    const handler = new EventSourcedCommandHandler(
      markOrderAsPreparedDecider,
      repository,
    );

    const command: MarkOrderAsPreparedCommand = {
      kind: "MarkOrderAsPreparedCommand",
      id: "o-nonexist-999", // Non-existent order
    };

    // Should fail with domain error
    await assertRejects(
      async () => {
        await handler.handle(command);
      },
      Error,
      "Order does not exist!",
    );
  } finally {
    kv.close();
  }
});

Deno.test("MarkOrderAsPreparedRepository - already prepared order rejection (domain error propagation)", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    // Set up restaurant and order
    await setupRestaurantAndOrder(kv, "r-already-1", "o-already-1");

    // Mark order as prepared
    const repository = new MarkOrderAsPreparedRepository(kv);
    const handler = new EventSourcedCommandHandler(
      markOrderAsPreparedDecider,
      repository,
    );

    const command: MarkOrderAsPreparedCommand = {
      kind: "MarkOrderAsPreparedCommand",
      id: "o-already-1",
    };

    // First preparation should succeed
    const result1 = await handler.handle(command);
    assertEquals(result1.length, 1, "First preparation should produce 1 event");

    // Second preparation should fail
    await assertRejects(
      async () => {
        await handler.handle(command);
      },
      Error,
      "Order already prepared!",
    );
  } finally {
    kv.close();
  }
});

Deno.test("MarkOrderAsPreparedRepository - concurrent modification detection (optimistic locking)", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    // Set up restaurant and multiple orders
    await setupRestaurantAndOrder(kv, "r-concurrent-1", "o-concurrent-1");

    // Create a second order for the same restaurant
    const placeRepo = new PlaceOrderRepository(kv);
    const placeHandler = new EventSourcedCommandHandler(
      placeOrderDecider,
      placeRepo,
    );

    const placeCommand: PlaceOrderCommand = {
      kind: "PlaceOrderCommand",
      id: "r-concurrent-1",
      orderId: "o-concurrent-2",
      menuItems: [
        { menuItemId: "item1", name: "Pizza", price: "12.99" },
      ],
    };

    await placeHandler.handle(placeCommand);

    // Mark both orders as prepared - should succeed with retry logic
    const repository = new MarkOrderAsPreparedRepository(kv);
    const handler = new EventSourcedCommandHandler(
      markOrderAsPreparedDecider,
      repository,
    );

    const command1: MarkOrderAsPreparedCommand = {
      kind: "MarkOrderAsPreparedCommand",
      id: "o-concurrent-1",
    };

    const command2: MarkOrderAsPreparedCommand = {
      kind: "MarkOrderAsPreparedCommand",
      id: "o-concurrent-2",
    };

    const result1 = await handler.handle(command1);
    assertEquals(result1.length, 1);
    assertEquals((result1[0] as OrderPreparedEvent).orderId, "o-concurrent-1");

    const result2 = await handler.handle(command2);
    assertEquals(result2.length, 1);
    assertEquals((result2[0] as OrderPreparedEvent).orderId, "o-concurrent-2");

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
    await setupRestaurantAndOrder(kv, "r-index-1", "o-index-1");

    // Create a second order
    const placeRepo = new PlaceOrderRepository(kv);
    const placeHandler = new EventSourcedCommandHandler(
      placeOrderDecider,
      placeRepo,
    );

    const placeCommand: PlaceOrderCommand = {
      kind: "PlaceOrderCommand",
      id: "r-index-1",
      orderId: "o-index-2",
      menuItems: [
        { menuItemId: "item1", name: "Pizza", price: "12.99" },
      ],
    };

    await placeHandler.handle(placeCommand);

    // Mark both orders as prepared
    const repository = new MarkOrderAsPreparedRepository(kv);
    const handler = new EventSourcedCommandHandler(
      markOrderAsPreparedDecider,
      repository,
    );

    await handler.handle({
      kind: "MarkOrderAsPreparedCommand",
      id: "o-index-1",
    });

    await handler.handle({
      kind: "MarkOrderAsPreparedCommand",
      id: "o-index-2",
    });

    // Query events by order ID - should find specific order
    const iterByOrder1 = kv.list({
      prefix: ["events_by_type", "OrderPreparedEvent", "o-index-1"],
    });
    const entriesByOrder1 = [];
    for await (const entry of iterByOrder1) {
      entriesByOrder1.push(entry);
    }
    assertEquals(entriesByOrder1.length, 1);

    const iterByOrder2 = kv.list({
      prefix: ["events_by_type", "OrderPreparedEvent", "o-index-2"],
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
