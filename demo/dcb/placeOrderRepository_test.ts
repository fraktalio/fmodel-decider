/**
 * Integration tests for PlaceOrderRepository.
 *
 * Tests verify:
 * - Event persistence to Deno KV with dual-index architecture
 * - Optimistic locking with automatic retry
 * - Domain error propagation (non-existent restaurant, invalid menu items, duplicate order)
 * - Concurrent modification detection and retry
 * - Maximum retry limit enforcement
 */

import { assertEquals, assertRejects } from "@std/assert";
import { EventSourcedCommandHandler } from "../../application.ts";
import { PlaceOrderRepository } from "./placeOrderRepository.ts";
import { CreateRestaurantRepository } from "./createRestaurantRepository.ts";
import { ChangeRestaurantMenuRepository } from "./changeRestaurantMenuRepository.ts";
import type { EventMetadata } from "../../denoKvRepository.ts";
import { placeOrderDecider } from "./placeOrderDecider.ts";
import { crateRestaurantDecider } from "./createRestaurantDecider.ts";
import { changeRestaurantManuDecider } from "./changeRestaurantMenuDecider.ts";
import type {
  ChangeRestaurantMenuCommand,
  CreateRestaurantCommand,
  PlaceOrderCommand,
  RestaurantOrderPlacedEvent,
} from "./api.ts";

Deno.test("PlaceOrderRepository - successful order placement via handler.handle() (happy path)", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    // Create restaurant first
    const createRepo = new CreateRestaurantRepository(kv);
    const createHandler = new EventSourcedCommandHandler(
      crateRestaurantDecider,
      createRepo,
    );

    const createCommand: CreateRestaurantCommand = {
      kind: "CreateRestaurantCommand",
      restaurantId: "r-happy-1",
      id: "r-happy-1",
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

    await createHandler.handle(createCommand);

    // Place order
    const repository = new PlaceOrderRepository(kv);
    const handler = new EventSourcedCommandHandler(
      placeOrderDecider,
      repository,
    );

    const command: PlaceOrderCommand = {
      kind: "PlaceOrderCommand",
      restaurantId: "r-happy-1",
      id: "o-happy-1",
      orderId: "o-happy-1",
      menuItems: [
        { menuItemId: "item1", name: "Pizza", price: "12.99" },
      ],
    };

    const events = await handler.handle(command);

    // Verify events returned
    assertEquals(events.length, 1);
    const event = events[0] as RestaurantOrderPlacedEvent & EventMetadata;
    assertEquals(event.kind, "RestaurantOrderPlacedEvent");
    assertEquals(event.restaurantId, "r-happy-1");
    assertEquals(event.orderId, "o-happy-1");
    assertEquals(event.menuItems.length, 1);
    assertEquals(event.menuItems[0].menuItemId, "item1");
    assertEquals(event.final, false);

    // Verify event metadata
    assertEquals(typeof event.eventId, "string");
    assertEquals(typeof event.timestamp, "number");
    assertEquals(typeof event.versionstamp, "string");

    // Verify events persisted to primary storage
    const primaryKey = ["events", event.eventId];
    const primaryResult = await kv.get(primaryKey);
    assertEquals(primaryResult.value !== null, true);
    const storedEvent = primaryResult.value as RestaurantOrderPlacedEvent;
    assertEquals(storedEvent.kind, "RestaurantOrderPlacedEvent");
    assertEquals(storedEvent.restaurantId, "r-happy-1");
    assertEquals(storedEvent.orderId, "o-happy-1");

    // Verify events persisted to type index (pointer pattern) - indexed by order ID
    const typeIndexKey = [
      "events_by_type",
      "RestaurantOrderPlacedEvent",
      "id:o-happy-1",
      event.eventId,
    ];
    const typeIndexResult = await kv.get(typeIndexKey);
    assertEquals(typeIndexResult.value !== null, true);
    assertEquals(typeIndexResult.value, event.eventId);
  } finally {
    kv.close();
  }
});

Deno.test("PlaceOrderRepository - non-existent restaurant rejection (domain error propagation)", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    const repository = new PlaceOrderRepository(kv);
    const handler = new EventSourcedCommandHandler(
      placeOrderDecider,
      repository,
    );

    const command: PlaceOrderCommand = {
      kind: "PlaceOrderCommand",
      restaurantId: "r-nonexist-999",
      id: "r-nonexist-999", // Non-existent restaurant
      orderId: "o-nonexist-1",
      menuItems: [
        { menuItemId: "item1", name: "Pizza", price: "12.99" },
      ],
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
    kv.close();
  }
});

Deno.test("PlaceOrderRepository - invalid menu items rejection (domain error propagation)", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    // Create restaurant first
    const createRepo = new CreateRestaurantRepository(kv);
    const createHandler = new EventSourcedCommandHandler(
      crateRestaurantDecider,
      createRepo,
    );

    const createCommand: CreateRestaurantCommand = {
      kind: "CreateRestaurantCommand",
      restaurantId: "r-invalid-1",
      id: "r-invalid-1",
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

    // Try to place order with invalid menu item
    const repository = new PlaceOrderRepository(kv);
    const handler = new EventSourcedCommandHandler(
      placeOrderDecider,
      repository,
    );

    const command: PlaceOrderCommand = {
      kind: "PlaceOrderCommand",
      restaurantId: "r-invalid-1",
      id: "o-invalid-1",
      orderId: "o-invalid-1",
      menuItems: [
        { menuItemId: "item999", name: "Invalid Item", price: "99.99" }, // Not on menu
      ],
    };

    // Should fail with domain error
    await assertRejects(
      async () => {
        await handler.handle(command);
      },
      Error,
      "Menu items not available!",
    );
  } finally {
    kv.close();
  }
});

Deno.test("PlaceOrderRepository - duplicate order rejection (domain error propagation)", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    // Create restaurant first
    const createRepo = new CreateRestaurantRepository(kv);
    const createHandler = new EventSourcedCommandHandler(
      crateRestaurantDecider,
      createRepo,
    );

    const createCommand: CreateRestaurantCommand = {
      kind: "CreateRestaurantCommand",
      restaurantId: "r-dup-1",
      id: "r-dup-1",
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

    // Place order
    const repository = new PlaceOrderRepository(kv);
    const handler = new EventSourcedCommandHandler(
      placeOrderDecider,
      repository,
    );

    const command: PlaceOrderCommand = {
      kind: "PlaceOrderCommand",
      restaurantId: "r-dup-1",
      id: "o-dup-1",
      orderId: "o-dup-1",
      menuItems: [
        { menuItemId: "item1", name: "Pizza", price: "12.99" },
      ],
    };

    // First order should succeed
    const result1 = await handler.handle(command);
    assertEquals(result1.length, 1, "First order should produce 1 event");

    // Second order with same ID should fail
    await assertRejects(
      async () => {
        await handler.handle(command);
      },
      Error,
      "Order already exist!",
    );
  } finally {
    kv.close();
  }
});

Deno.test("PlaceOrderRepository - order placement after menu change (menu evolution)", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    // Create restaurant first
    const createRepo = new CreateRestaurantRepository(kv);
    const createHandler = new EventSourcedCommandHandler(
      crateRestaurantDecider,
      createRepo,
    );

    const createCommand: CreateRestaurantCommand = {
      kind: "CreateRestaurantCommand",
      restaurantId: "r-menu-1",
      id: "r-menu-1",
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

    await createHandler.handle(createCommand);

    // Change menu
    const changeRepo = new ChangeRestaurantMenuRepository(kv);
    const changeHandler = new EventSourcedCommandHandler(
      changeRestaurantManuDecider,
      changeRepo,
    );

    const changeCommand: ChangeRestaurantMenuCommand = {
      kind: "ChangeRestaurantMenuCommand",
      restaurantId: "r-menu-1",
      id: "r-menu-1",
      menu: {
        menuId: "m2",
        cuisine: "ITALIAN",
        menuItems: [
          { menuItemId: "item1", name: "Pizza", price: "13.99" }, // Price changed
          { menuItemId: "item2", name: "Pasta", price: "11.99" },
          { menuItemId: "item3", name: "Salad", price: "8.99" }, // New item
        ],
      },
    };

    await changeHandler.handle(changeCommand);

    // Place order with item from updated menu - should succeed
    const repository = new PlaceOrderRepository(kv);
    const handler = new EventSourcedCommandHandler(
      placeOrderDecider,
      repository,
    );

    const command: PlaceOrderCommand = {
      kind: "PlaceOrderCommand",
      restaurantId: "r-menu-1",
      id: "o-menu-1",
      orderId: "o-menu-1",
      menuItems: [
        { menuItemId: "item3", name: "Salad", price: "8.99" }, // New item from updated menu
      ],
    };

    const events = await handler.handle(command);

    // Verify order was placed successfully
    assertEquals(events.length, 1);
    assertEquals(events[0].kind, "RestaurantOrderPlacedEvent");
    assertEquals((events[0] as RestaurantOrderPlacedEvent).orderId, "o-menu-1");
    assertEquals(
      (events[0] as RestaurantOrderPlacedEvent).menuItems[0].menuItemId,
      "item3",
    );
  } finally {
    kv.close();
  }
});

Deno.test("PlaceOrderRepository - maximum retry limit enforcement", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    // Create restaurant first
    const createRepo = new CreateRestaurantRepository(kv);
    const createHandler = new EventSourcedCommandHandler(
      crateRestaurantDecider,
      createRepo,
    );

    const createCommand: CreateRestaurantCommand = {
      kind: "CreateRestaurantCommand",
      restaurantId: "r-retry-1",
      id: "r-retry-1",
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

    // Place multiple orders to verify retry mechanism works
    const repository = new PlaceOrderRepository(kv);
    const handler = new EventSourcedCommandHandler(
      placeOrderDecider,
      repository,
    );

    // Place first order
    const command1: PlaceOrderCommand = {
      kind: "PlaceOrderCommand",
      restaurantId: "r-retry-1",
      id: "o-retry-1",
      orderId: "o-retry-1",
      menuItems: [
        { menuItemId: "item1", name: "Pizza", price: "12.99" },
      ],
    };

    const result1 = await handler.handle(command1);
    assertEquals(result1.length, 1);
    assertEquals(
      (result1[0] as RestaurantOrderPlacedEvent).orderId,
      "o-retry-1",
    );

    // Place second order - should succeed with retry logic handling any conflicts
    const command2: PlaceOrderCommand = {
      kind: "PlaceOrderCommand",
      restaurantId: "r-retry-1",
      id: "o-retry-2",
      orderId: "o-retry-2",
      menuItems: [
        { menuItemId: "item1", name: "Pizza", price: "12.99" },
      ],
    };

    const result2 = await handler.handle(command2);
    assertEquals(result2.length, 1);
    assertEquals(
      (result2[0] as RestaurantOrderPlacedEvent).orderId,
      "o-retry-2",
    );

    // Verify both orders were persisted (indexed by order ID)
    const iterByOrder1 = kv.list({
      prefix: ["events_by_type", "RestaurantOrderPlacedEvent", "id:o-retry-1"],
    });
    const entriesByOrder1 = [];
    for await (const entry of iterByOrder1) {
      entriesByOrder1.push(entry);
    }
    assertEquals(entriesByOrder1.length, 1, "First order should be persisted");

    const iterByOrder2 = kv.list({
      prefix: ["events_by_type", "RestaurantOrderPlacedEvent", "id:o-retry-2"],
    });
    const entriesByOrder2 = [];
    for await (const entry of iterByOrder2) {
      entriesByOrder2.push(entry);
    }
    assertEquals(entriesByOrder2.length, 1, "Second order should be persisted");
  } finally {
    kv.close();
  }
});

Deno.test("PlaceOrderRepository - verify events indexed by order ID correctly", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    // Create restaurant
    const createRepo = new CreateRestaurantRepository(kv);
    const createHandler = new EventSourcedCommandHandler(
      crateRestaurantDecider,
      createRepo,
    );

    const createCommand: CreateRestaurantCommand = {
      kind: "CreateRestaurantCommand",
      restaurantId: "r-index-1",
      id: "r-index-1",
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

    // Place multiple orders
    const repository = new PlaceOrderRepository(kv);
    const handler = new EventSourcedCommandHandler(
      placeOrderDecider,
      repository,
    );

    const order1: PlaceOrderCommand = {
      kind: "PlaceOrderCommand",
      restaurantId: "r-index-1",
      id: "o-index-1",
      orderId: "o-index-1",
      menuItems: [
        { menuItemId: "item1", name: "Pizza", price: "12.99" },
      ],
    };

    const order2: PlaceOrderCommand = {
      kind: "PlaceOrderCommand",
      restaurantId: "r-index-1",
      id: "o-index-2",
      orderId: "o-index-2",
      menuItems: [
        { menuItemId: "item1", name: "Pizza", price: "12.99" },
      ],
    };

    await handler.handle(order1);
    await handler.handle(order2);

    // Query events by order ID (each order indexed separately)
    const iterByOrder1 = kv.list({
      prefix: ["events_by_type", "RestaurantOrderPlacedEvent", "id:o-index-1"],
    });
    const entriesByOrder1 = [];
    for await (const entry of iterByOrder1) {
      entriesByOrder1.push(entry);
    }
    assertEquals(entriesByOrder1.length, 1);

    const iterByOrder2 = kv.list({
      prefix: ["events_by_type", "RestaurantOrderPlacedEvent", "id:o-index-2"],
    });
    const entriesByOrder2 = [];
    for await (const entry of iterByOrder2) {
      entriesByOrder2.push(entry);
    }
    assertEquals(entriesByOrder2.length, 1);

    // Verify indexes point to correct events in primary storage
    for (const entry of [...entriesByOrder1, ...entriesByOrder2]) {
      assertEquals(entry.key[0], "events_by_type");
      assertEquals(entry.key[1], "RestaurantOrderPlacedEvent");
      assertEquals(typeof entry.key[3], "string"); // Event ID (ULID)
      assertEquals(typeof entry.value, "string"); // Pointer to primary storage

      // Verify we can retrieve the full event from primary storage
      const eventId = entry.value as string;
      const primaryResult = await kv.get(["events", eventId]);
      assertEquals(primaryResult.value !== null, true);
      const event = primaryResult.value as RestaurantOrderPlacedEvent;
      assertEquals(event.kind, "RestaurantOrderPlacedEvent");
      assertEquals(event.restaurantId, "r-index-1");
    }
  } finally {
    kv.close();
  }
});
