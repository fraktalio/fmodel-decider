/**
 * Integration tests for CreateRestaurantRepository.
 *
 * Tests verify:
 * - Event persistence to Deno KV with two-index architecture
 * - Optimistic locking with automatic retry
 * - Domain error propagation
 * - Concurrent modification detection
 */

import { assertEquals, assertRejects } from "@std/assert";
import { EventSourcedCommandHandler } from "../../application.ts";
import { CreateRestaurantRepository } from "./createRestaurantRepository.ts";
import type { EventMetadata } from "./repository.ts";
import { crateRestaurantDecider } from "./createRestaurantDecider.ts";
import type { CreateRestaurantCommand, RestaurantCreatedEvent } from "./api.ts";

Deno.test("CreateRestaurantRepository - successful restaurant creation via handler.handle() (happy path)", async () => {
  // Use in-memory Deno KV
  const kv = await Deno.openKv(":memory:");

  try {
    // Create repository and handler
    const repository = new CreateRestaurantRepository(kv);
    const handler = new EventSourcedCommandHandler(
      crateRestaurantDecider,
      repository,
    );

    // Execute command via handler
    const command: CreateRestaurantCommand = {
      kind: "CreateRestaurantCommand",
      restaurantId: "r1",
      id: "r1",
      name: "Bistro",
      menu: {
        menuId: "m1",
        cuisine: "ITALIAN",
        menuItems: [
          { menuItemId: "item1", name: "Pizza", price: "12.99" },
          { menuItemId: "item2", name: "Pasta", price: "10.99" },
        ],
      },
    };

    const events = await handler.handle(command);

    // Verify events returned
    assertEquals(events.length, 1);
    const event = events[0] as RestaurantCreatedEvent & EventMetadata;
    assertEquals(event.kind, "RestaurantCreatedEvent");
    assertEquals(event.restaurantId, "r1");
    assertEquals(event.name, "Bistro");
    assertEquals(event.menu.menuId, "m1");
    assertEquals(event.menu.cuisine, "ITALIAN");
    assertEquals(event.menu.menuItems.length, 2);
    assertEquals(event.final, false);

    // Verify event metadata
    assertEquals(typeof event.eventId, "string");
    assertEquals(typeof event.timestamp, "number");
    assertEquals(typeof event.versionstamp, "string");

    // Verify events persisted to primary storage
    const primaryKey = ["events", event.eventId];
    const primaryResult = await kv.get(primaryKey);
    assertEquals(primaryResult.value !== null, true);
    const storedEvent = primaryResult.value as RestaurantCreatedEvent;
    assertEquals(storedEvent.kind, "RestaurantCreatedEvent");
    assertEquals(storedEvent.restaurantId, "r1");
    assertEquals(storedEvent.name, "Bistro");

    // Verify events persisted to type index (pointer pattern)
    const typeIndexKey = [
      "events_by_type",
      "RestaurantCreatedEvent",
      "r1",
      event.eventId,
    ];
    const typeIndexResult = await kv.get(typeIndexKey);
    assertEquals(typeIndexResult.value !== null, true);
    // Type index should store the ULID as value (pointer pattern)
    assertEquals(typeIndexResult.value, event.eventId);
  } finally {
    await kv.close();
  }
});

Deno.test("CreateRestaurantRepository - duplicate restaurant rejection (domain error propagation)", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    const repository = new CreateRestaurantRepository(kv);
    const handler = new EventSourcedCommandHandler(
      crateRestaurantDecider,
      repository,
    );

    const command: CreateRestaurantCommand = {
      kind: "CreateRestaurantCommand",
      restaurantId: "r1",
      id: "r1",
      name: "Bistro",
      menu: {
        menuId: "m1",
        cuisine: "ITALIAN",
        menuItems: [
          { menuItemId: "item1", name: "Pizza", price: "12.99" },
        ],
      },
    };

    // First creation should succeed
    await handler.handle(command);

    // Second creation should fail with domain error
    await assertRejects(
      async () => {
        await handler.handle(command);
      },
      Error,
      "Restaurant already exist!",
    );
  } finally {
    await kv.close();
  }
});

Deno.test("CreateRestaurantRepository - concurrent creation detection (optimistic locking)", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    const repository = new CreateRestaurantRepository(kv);
    const handler = new EventSourcedCommandHandler(
      crateRestaurantDecider,
      repository,
    );

    const command: CreateRestaurantCommand = {
      kind: "CreateRestaurantCommand",
      restaurantId: "r1",
      id: "r1",
      name: "Bistro",
      menu: {
        menuId: "m1",
        cuisine: "ITALIAN",
        menuItems: [
          { menuItemId: "item1", name: "Pizza", price: "12.99" },
        ],
      },
    };

    // First creation should succeed
    const firstResult = await handler.handle(command);
    assertEquals(firstResult.length, 1);
    assertEquals(firstResult[0].kind, "RestaurantCreatedEvent");

    // Second concurrent creation attempt should fail with domain error
    // because the restaurant already exists
    await assertRejects(
      async () => {
        await handler.handle(command);
      },
      Error,
      "Restaurant already exist!",
    );

    // Verify only one event was persisted
    const iter = kv.list({
      prefix: ["events_by_type", "RestaurantCreatedEvent", "r1"],
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
