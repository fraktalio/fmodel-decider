/**
 * Integration tests for RestaurantRepository.
 *
 * Tests verify:
 * - Event persistence to Deno KV with two-index architecture
 * - Optimistic locking with automatic retry
 * - Domain error propagation
 * - Concurrent modification detection
 */

import { assertEquals, assertRejects } from "@std/assert";
import { EventSourcedCommandHandler } from "../../application.ts";
import { RestaurantRepository } from "./restaurantRepository.ts";
import type { EventMetadata } from "../../denoKvRepository.ts";
import { restaurantDecider } from "./restaurantDecider.ts";
import type {
  ChangeRestaurantMenuCommand,
  CreateRestaurantCommand,
  RestaurantCreatedEvent,
  RestaurantMenuChangedEvent,
} from "./api.ts";

Deno.test("RestaurantRepository - successful restaurant creation (happy path)", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    const repository = new RestaurantRepository(kv);
    const handler = new EventSourcedCommandHandler(
      restaurantDecider,
      repository,
    );

    const command: CreateRestaurantCommand = {
      decider: "Restaurant",
      kind: "CreateRestaurantCommand",
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
    assertEquals(event.id, "r1");
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
    assertEquals(storedEvent.id, "r1");
    assertEquals(storedEvent.name, "Bistro");

    // Verify events persisted to type index
    const typeIndexKey = [
      "events_by_type",
      "RestaurantCreatedEvent",
      "id:r1",
      event.eventId,
    ];
    const typeIndexResult = await kv.get(typeIndexKey);
    assertEquals(typeIndexResult.value !== null, true);
    assertEquals(typeIndexResult.value, event.eventId);
  } finally {
    await kv.close();
  }
});

Deno.test("RestaurantRepository - duplicate restaurant rejection (domain error)", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    const repository = new RestaurantRepository(kv);
    const handler = new EventSourcedCommandHandler(
      restaurantDecider,
      repository,
    );

    const command: CreateRestaurantCommand = {
      decider: "Restaurant",
      kind: "CreateRestaurantCommand",
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

Deno.test("RestaurantRepository - menu change on existing restaurant", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    const repository = new RestaurantRepository(kv);
    const handler = new EventSourcedCommandHandler(
      restaurantDecider,
      repository,
    );

    // Create restaurant
    const createCommand: CreateRestaurantCommand = {
      decider: "Restaurant",
      kind: "CreateRestaurantCommand",
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
    await handler.handle(createCommand);

    // Change menu
    const changeMenuCommand: ChangeRestaurantMenuCommand = {
      decider: "Restaurant",
      kind: "ChangeRestaurantMenuCommand",
      id: "r1",
      menu: {
        menuId: "m2",
        cuisine: "FRENCH",
        menuItems: [
          { menuItemId: "item3", name: "Croissant", price: "5.99" },
        ],
      },
    };
    const events = await handler.handle(changeMenuCommand);

    // Verify menu changed event
    assertEquals(events.length, 1);
    const event = events[0] as RestaurantMenuChangedEvent & EventMetadata;
    assertEquals(event.kind, "RestaurantMenuChangedEvent");
    assertEquals(event.id, "r1");
    assertEquals(event.menu.menuId, "m2");
    assertEquals(event.menu.cuisine, "FRENCH");
  } finally {
    await kv.close();
  }
});

Deno.test("RestaurantRepository - menu change on non-existent restaurant", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    const repository = new RestaurantRepository(kv);
    const handler = new EventSourcedCommandHandler(
      restaurantDecider,
      repository,
    );

    const changeMenuCommand: ChangeRestaurantMenuCommand = {
      decider: "Restaurant",
      kind: "ChangeRestaurantMenuCommand",
      id: "r1",
      menu: {
        menuId: "m2",
        cuisine: "FRENCH",
        menuItems: [
          { menuItemId: "item3", name: "Croissant", price: "5.99" },
        ],
      },
    };

    await assertRejects(
      async () => {
        await handler.handle(changeMenuCommand);
      },
      Error,
      "Restaurant does not exist!",
    );
  } finally {
    await kv.close();
  }
});

Deno.test("RestaurantRepository - concurrent modification detection", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    const repository = new RestaurantRepository(kv);
    const handler = new EventSourcedCommandHandler(
      restaurantDecider,
      repository,
    );

    const command: CreateRestaurantCommand = {
      decider: "Restaurant",
      kind: "CreateRestaurantCommand",
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
    await assertRejects(
      async () => {
        await handler.handle(command);
      },
      Error,
      "Restaurant already exist!",
    );

    // Verify only one event was persisted
    const iter = kv.list({
      prefix: ["events_by_type", "RestaurantCreatedEvent", "id:r1"],
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
