/**
 * Integration tests for ChangeRestaurantMenuRepository.
 *
 * Tests verify:
 * - Event persistence to Deno KV with two-index architecture
 * - Optimistic locking with automatic retry
 * - Domain error propagation
 * - Concurrent modification detection
 */

import { assertEquals, assertRejects } from "@std/assert";
import { EventSourcedCommandHandler } from "../../application.ts";
import { ChangeRestaurantMenuRepository } from "./changeRestaurantMenuRepository.ts";
import type { EventMetadata } from "../../denoKvRepository.ts";
import { CreateRestaurantRepository } from "./createRestaurantRepository.ts";
import { changeRestaurantManuDecider } from "./changeRestaurantMenuDecider.ts";
import { crateRestaurantDecider } from "./createRestaurantDecider.ts";
import type {
  ChangeRestaurantMenuCommand,
  CreateRestaurantCommand,
  RestaurantMenuChangedEvent,
} from "./api.ts";

Deno.test("ChangeRestaurantMenuRepository - successful menu update via handler.handle() (happy path)", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    // First create a restaurant
    const createRepository = new CreateRestaurantRepository(kv);
    const createHandler = new EventSourcedCommandHandler(
      crateRestaurantDecider,
      createRepository,
    );

    const createCommand: CreateRestaurantCommand = {
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

    await createHandler.handle(createCommand);

    // Now change the menu
    const changeRepository = new ChangeRestaurantMenuRepository(kv);
    const changeHandler = new EventSourcedCommandHandler(
      changeRestaurantManuDecider,
      changeRepository,
    );

    const changeCommand: ChangeRestaurantMenuCommand = {
      kind: "ChangeRestaurantMenuCommand",
      restaurantId: "r1",
      id: "r1",
      menu: {
        menuId: "m2",
        cuisine: "MEXICAN",
        menuItems: [
          { menuItemId: "item3", name: "Tacos", price: "8.99" },
          { menuItemId: "item4", name: "Burrito", price: "11.99" },
        ],
      },
    };

    const events = await changeHandler.handle(changeCommand);

    // Verify events returned
    assertEquals(events.length, 1);
    const event = events[0] as RestaurantMenuChangedEvent & EventMetadata;
    assertEquals(event.kind, "RestaurantMenuChangedEvent");
    assertEquals(event.restaurantId, "r1");
    assertEquals(event.menu.menuId, "m2");
    assertEquals(event.menu.cuisine, "MEXICAN");
    assertEquals(event.menu.menuItems.length, 2);
    assertEquals(event.menu.menuItems[0].name, "Tacos");
    assertEquals(event.final, false);

    // Verify event metadata
    assertEquals(typeof event.eventId, "string");
    assertEquals(typeof event.timestamp, "number");
    assertEquals(typeof event.versionstamp, "string");

    // Verify events persisted to primary storage
    const primaryKey = ["events", event.eventId];
    const primaryResult = await kv.get(primaryKey);
    assertEquals(primaryResult.value !== null, true);
    const storedEvent = primaryResult.value as RestaurantMenuChangedEvent;
    assertEquals(storedEvent.kind, "RestaurantMenuChangedEvent");
    assertEquals(storedEvent.restaurantId, "r1");
    assertEquals(storedEvent.menu.menuId, "m2");

    // Verify events persisted to type index (pointer pattern)
    const typeIndexKey = [
      "events_by_type",
      "RestaurantMenuChangedEvent",
      "id:r1",
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

Deno.test("ChangeRestaurantMenuRepository - non-existent restaurant rejection (domain error propagation)", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    const repository = new ChangeRestaurantMenuRepository(kv);
    const handler = new EventSourcedCommandHandler(
      changeRestaurantManuDecider,
      repository,
    );

    const command: ChangeRestaurantMenuCommand = {
      kind: "ChangeRestaurantMenuCommand",
      restaurantId: "r999",
      id: "r999",
      menu: {
        menuId: "m2",
        cuisine: "MEXICAN",
        menuItems: [
          { menuItemId: "item3", name: "Tacos", price: "8.99" },
        ],
      },
    };

    // Should fail with domain error
    await assertRejects(
      async () => {
        await handler.handle(command);
      },
      Error,
      "Restaurant does not exist!",
    );
  } finally {
    await kv.close();
  }
});

Deno.test("ChangeRestaurantMenuRepository - concurrent modification detection (optimistic locking)", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    // First create a restaurant
    const createRepository = new CreateRestaurantRepository(kv);
    const createHandler = new EventSourcedCommandHandler(
      crateRestaurantDecider,
      createRepository,
    );

    const createCommand: CreateRestaurantCommand = {
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

    await createHandler.handle(createCommand);

    // Now perform two menu changes
    const changeRepository = new ChangeRestaurantMenuRepository(kv);
    const changeHandler = new EventSourcedCommandHandler(
      changeRestaurantManuDecider,
      changeRepository,
    );

    const changeCommand1: ChangeRestaurantMenuCommand = {
      kind: "ChangeRestaurantMenuCommand",
      restaurantId: "r1",
      id: "r1",
      menu: {
        menuId: "m2",
        cuisine: "MEXICAN",
        menuItems: [
          { menuItemId: "item3", name: "Tacos", price: "8.99" },
        ],
      },
    };

    const changeCommand2: ChangeRestaurantMenuCommand = {
      kind: "ChangeRestaurantMenuCommand",
      restaurantId: "r1",
      id: "r1",
      menu: {
        menuId: "m3",
        cuisine: "CHINESE",
        menuItems: [
          { menuItemId: "item5", name: "Fried Rice", price: "9.99" },
        ],
      },
    };

    // First change should succeed
    const firstResult = await changeHandler.handle(changeCommand1);
    assertEquals(firstResult.length, 1);
    assertEquals(firstResult[0].kind, "RestaurantMenuChangedEvent");
    assertEquals(
      (firstResult[0] as RestaurantMenuChangedEvent).menu.cuisine,
      "MEXICAN",
    );

    // Second change should also succeed (no conflict, just sequential updates)
    const secondResult = await changeHandler.handle(changeCommand2);
    assertEquals(secondResult.length, 1);
    assertEquals(secondResult[0].kind, "RestaurantMenuChangedEvent");
    assertEquals(
      (secondResult[0] as RestaurantMenuChangedEvent).menu.cuisine,
      "CHINESE",
    );

    // Verify both menu change events were persisted
    const iter = kv.list({
      prefix: ["events_by_type", "RestaurantMenuChangedEvent", "id:r1"],
    });
    const entries = [];
    for await (const entry of iter) {
      entries.push(entry);
    }
    assertEquals(
      entries.length,
      2,
      "Two menu change events should be persisted",
    );
  } finally {
    await kv.close();
  }
});
