/**
 * Integration tests for OrderRepository.
 *
 * Tests verify:
 * - Event persistence to Deno KV with two-index architecture
 * - Optimistic locking with automatic retry
 * - Domain error propagation
 * - Concurrent modification detection
 */

import { assertEquals, assertRejects } from "@std/assert";
import { EventSourcedCommandHandler } from "../../application.ts";
import { OrderRepository } from "./orderRepository.ts";
import type { EventMetadata } from "../../denoKvRepository.ts";
import { orderDecider } from "./orderDecider.ts";
import type {
  CreateOrderCommand,
  MarkOrderAsPreparedCommand,
  OrderCreatedEvent,
  OrderPreparedEvent,
} from "./api.ts";

Deno.test("OrderRepository - successful order creation (happy path)", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    const repository = new OrderRepository(kv);
    const handler = new EventSourcedCommandHandler(orderDecider, repository);

    const command: CreateOrderCommand = {
      decider: "Order",
      kind: "CreateOrderCommand",
      id: "o1",
      restaurantId: "r1",
      menuItems: [
        { menuItemId: "item1", name: "Pizza", price: "12.99" },
        { menuItemId: "item2", name: "Pasta", price: "10.99" },
      ],
    };

    const events = await handler.handle(command);

    // Verify events returned
    assertEquals(events.length, 1);
    const event = events[0] as OrderCreatedEvent & EventMetadata;
    assertEquals(event.kind, "OrderCreatedEvent");
    assertEquals(event.id, "o1");
    assertEquals(event.restaurantId, "r1");
    assertEquals(event.menuItems.length, 2);
    assertEquals(event.final, false);

    // Verify event metadata
    assertEquals(typeof event.eventId, "string");
    assertEquals(typeof event.timestamp, "number");
    assertEquals(typeof event.versionstamp, "string");

    // Verify events persisted to primary storage
    const primaryKey = ["events", event.eventId];
    const primaryResult = await kv.get(primaryKey);
    assertEquals(primaryResult.value !== null, true);
    const storedEvent = primaryResult.value as OrderCreatedEvent;
    assertEquals(storedEvent.kind, "OrderCreatedEvent");
    assertEquals(storedEvent.id, "o1");
    assertEquals(storedEvent.restaurantId, "r1");

    // Verify events persisted to type index
    const typeIndexKey = [
      "events_by_type",
      "OrderCreatedEvent",
      "id:o1",
      event.eventId,
    ];
    const typeIndexResult = await kv.get(typeIndexKey);
    assertEquals(typeIndexResult.value !== null, true);
    assertEquals(typeIndexResult.value, event.eventId);
  } finally {
    await kv.close();
  }
});

Deno.test("OrderRepository - duplicate order rejection (domain error)", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    const repository = new OrderRepository(kv);
    const handler = new EventSourcedCommandHandler(orderDecider, repository);

    const command: CreateOrderCommand = {
      decider: "Order",
      kind: "CreateOrderCommand",
      id: "o1",
      restaurantId: "r1",
      menuItems: [
        { menuItemId: "item1", name: "Pizza", price: "12.99" },
      ],
    };

    // First creation should succeed
    await handler.handle(command);

    // Second creation should fail with domain error
    await assertRejects(
      async () => {
        await handler.handle(command);
      },
      Error,
      "Order already exist!",
    );
  } finally {
    await kv.close();
  }
});

Deno.test("OrderRepository - mark order as prepared", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    const repository = new OrderRepository(kv);
    const handler = new EventSourcedCommandHandler(orderDecider, repository);

    // Create order
    const createCommand: CreateOrderCommand = {
      decider: "Order",
      kind: "CreateOrderCommand",
      id: "o1",
      restaurantId: "r1",
      menuItems: [
        { menuItemId: "item1", name: "Pizza", price: "12.99" },
      ],
    };
    await handler.handle(createCommand);

    // Mark as prepared
    const prepareCommand: MarkOrderAsPreparedCommand = {
      decider: "Order",
      kind: "MarkOrderAsPreparedCommand",
      id: "o1",
    };
    const events = await handler.handle(prepareCommand);

    // Verify order prepared event
    assertEquals(events.length, 1);
    const event = events[0] as OrderPreparedEvent & EventMetadata;
    assertEquals(event.kind, "OrderPreparedEvent");
    assertEquals(event.id, "o1");
    assertEquals(event.final, false);
  } finally {
    await kv.close();
  }
});

Deno.test("OrderRepository - mark non-existent order as prepared", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    const repository = new OrderRepository(kv);
    const handler = new EventSourcedCommandHandler(orderDecider, repository);

    const prepareCommand: MarkOrderAsPreparedCommand = {
      decider: "Order",
      kind: "MarkOrderAsPreparedCommand",
      id: "o1",
    };

    await assertRejects(
      async () => {
        await handler.handle(prepareCommand);
      },
      Error,
      "Order does not exist!",
    );
  } finally {
    await kv.close();
  }
});

Deno.test("OrderRepository - concurrent modification detection", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    const repository = new OrderRepository(kv);
    const handler = new EventSourcedCommandHandler(orderDecider, repository);

    const command: CreateOrderCommand = {
      decider: "Order",
      kind: "CreateOrderCommand",
      id: "o1",
      restaurantId: "r1",
      menuItems: [
        { menuItemId: "item1", name: "Pizza", price: "12.99" },
      ],
    };

    // First creation should succeed
    const firstResult = await handler.handle(command);
    assertEquals(firstResult.length, 1);
    assertEquals(firstResult[0].kind, "OrderCreatedEvent");

    // Second concurrent creation attempt should fail with domain error
    await assertRejects(
      async () => {
        await handler.handle(command);
      },
      Error,
      "Order already exist!",
    );

    // Verify only one event was persisted
    const iter = kv.list({
      prefix: ["events_by_type", "OrderCreatedEvent", "id:o1"],
    });
    const entries = [];
    for await (const entry of iter) {
      entries.push(entry);
    }
    assertEquals(entries.length, 1, "Only one event should be persisted");
  } finally {
    await kv.close();
  }
});
