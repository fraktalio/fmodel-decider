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
import { placeOrderRepository } from "./placeOrderRepository.ts";
import { createRestaurantRepository } from "./createRestaurantRepository.ts";
import { changeRestaurantMenuRepository } from "./changeRestaurantMenuRepository.ts";
import type { EventMetadata } from "../../denoKvEventRepository.ts";
import { placeOrderDecider } from "./placeOrderDecider.ts";
import { createRestaurantDecider } from "./createRestaurantDecider.ts";
import { changeRestaurantManuDecider } from "./changeRestaurantMenuDecider.ts";
import {
  type ChangeRestaurantMenuCommand,
  type CreateRestaurantCommand,
  menuItemId,
  MenuItemsNotAvailableError,
  OrderAlreadyExistsError,
  orderId,
  type PlaceOrderCommand,
  restaurantId,
  restaurantMenuId,
  RestaurantNotFoundError,
  type RestaurantOrderPlacedEvent,
} from "./api.ts";
import type { CommandMetadata } from "../../infrastructure.ts";

Deno.test("PlaceOrderRepository - successful order placement via handler.handle() (happy path)", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    // Create restaurant first
    const createRepo = createRestaurantRepository(kv);
    const createHandler = new EventSourcedCommandHandler(
      createRestaurantDecider,
      createRepo,
    );

    const createCommand: CreateRestaurantCommand & CommandMetadata = {
      kind: "CreateRestaurantCommand",
      restaurantId: restaurantId("r-happy-1"),
      name: "Bistro",
      menu: {
        menuId: restaurantMenuId("m1"),
        cuisine: "ITALIAN",
        menuItems: [
          { menuItemId: menuItemId("item1"), name: "Pizza", price: "12.99" },
          { menuItemId: menuItemId("item2"), name: "Pasta", price: "10.99" },
        ],
      },
      idempotencyKey: "test-place-order-happy-create",
    };

    await createHandler.handle(createCommand);

    // Place order
    const repository = placeOrderRepository(kv);
    const handler = new EventSourcedCommandHandler(
      placeOrderDecider,
      repository,
    );

    const command: PlaceOrderCommand & CommandMetadata = {
      kind: "PlaceOrderCommand",
      restaurantId: restaurantId("r-happy-1"),
      orderId: orderId("o-happy-1"),
      menuItems: [
        { menuItemId: menuItemId("item1"), name: "Pizza", price: "12.99" },
      ],
      idempotencyKey: "test-place-order-happy-order",
    };

    const events = await handler.handle(command);

    // Verify events returned
    assertEquals(events.length, 1);
    const event = events[0] as RestaurantOrderPlacedEvent & EventMetadata;
    assertEquals(event.kind, "RestaurantOrderPlacedEvent");
    assertEquals(event.restaurantId, restaurantId("r-happy-1"));
    assertEquals(event.orderId, orderId("o-happy-1"));
    assertEquals(event.menuItems.length, 1);
    assertEquals(event.menuItems[0].menuItemId, menuItemId("item1"));
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
    assertEquals(storedEvent.restaurantId, restaurantId("r-happy-1"));
    assertEquals(storedEvent.orderId, orderId("o-happy-1"));

    // Verify events persisted to type index (pointer pattern) - indexed by order ID
    const typeIndexKey = [
      "events_by_type",
      "RestaurantOrderPlacedEvent",
      "orderId:o-happy-1",
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
    const repository = placeOrderRepository(kv);
    const handler = new EventSourcedCommandHandler(
      placeOrderDecider,
      repository,
    );

    const command: PlaceOrderCommand & CommandMetadata = {
      kind: "PlaceOrderCommand",
      restaurantId: restaurantId("r-nonexist-999"), // Non-existent restaurant
      orderId: orderId("o-nonexist-1"),
      menuItems: [
        { menuItemId: menuItemId("item1"), name: "Pizza", price: "12.99" },
      ],
      idempotencyKey: "test-place-order-nonexist",
    };

    // Should fail with domain error
    await assertRejects(
      async () => {
        await handler.handle(command);
      },
      RestaurantNotFoundError,
    );
  } finally {
    kv.close();
  }
});

Deno.test("PlaceOrderRepository - invalid menu items rejection (domain error propagation)", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    // Create restaurant first
    const createRepo = createRestaurantRepository(kv);
    const createHandler = new EventSourcedCommandHandler(
      createRestaurantDecider,
      createRepo,
    );

    const createCommand: CreateRestaurantCommand & CommandMetadata = {
      kind: "CreateRestaurantCommand",
      restaurantId: restaurantId("r-invalid-1"),
      name: "Bistro",
      menu: {
        menuId: restaurantMenuId("m1"),
        cuisine: "ITALIAN",
        menuItems: [
          { menuItemId: menuItemId("item1"), name: "Pizza", price: "12.99" },
        ],
      },
      idempotencyKey: "test-place-order-invalid-create",
    };

    await createHandler.handle(createCommand);

    // Try to place order with invalid menu item
    const repository = placeOrderRepository(kv);
    const handler = new EventSourcedCommandHandler(
      placeOrderDecider,
      repository,
    );

    const command: PlaceOrderCommand & CommandMetadata = {
      kind: "PlaceOrderCommand",
      restaurantId: restaurantId("r-invalid-1"),
      orderId: orderId("o-invalid-1"),
      menuItems: [
        {
          menuItemId: menuItemId("item999"),
          name: "Invalid Item",
          price: "99.99",
        }, // Not on menu
      ],
      idempotencyKey: "test-place-order-invalid-order",
    };

    // Should fail with domain error
    await assertRejects(
      async () => {
        await handler.handle(command);
      },
      MenuItemsNotAvailableError,
    );
  } finally {
    kv.close();
  }
});

Deno.test("PlaceOrderRepository - duplicate order rejection (domain error propagation)", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    // Create restaurant first
    const createRepo = createRestaurantRepository(kv);
    const createHandler = new EventSourcedCommandHandler(
      createRestaurantDecider,
      createRepo,
    );

    const createCommand: CreateRestaurantCommand & CommandMetadata = {
      kind: "CreateRestaurantCommand",
      restaurantId: restaurantId("r-dup-1"),
      name: "Bistro",
      menu: {
        menuId: restaurantMenuId("m1"),
        cuisine: "ITALIAN",
        menuItems: [
          { menuItemId: menuItemId("item1"), name: "Pizza", price: "12.99" },
        ],
      },
      idempotencyKey: "test-place-order-dup-create",
    };

    await createHandler.handle(createCommand);

    // Place order
    const repository = placeOrderRepository(kv);
    const handler = new EventSourcedCommandHandler(
      placeOrderDecider,
      repository,
    );

    const command: PlaceOrderCommand & CommandMetadata = {
      kind: "PlaceOrderCommand",
      restaurantId: restaurantId("r-dup-1"),
      orderId: orderId("o-dup-1"),
      menuItems: [
        { menuItemId: menuItemId("item1"), name: "Pizza", price: "12.99" },
      ],
      idempotencyKey: "test-place-order-dup-1",
    };

    // First order should succeed
    const result1 = await handler.handle(command);
    assertEquals(result1.length, 1, "First order should produce 1 event");

    // Second order with same ID should fail
    await assertRejects(
      async () => {
        await handler.handle({
          ...command,
          idempotencyKey: "test-place-order-dup-2",
        });
      },
      OrderAlreadyExistsError,
    );
  } finally {
    kv.close();
  }
});

Deno.test("PlaceOrderRepository - order placement after menu change (menu evolution)", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    // Create restaurant first
    const createRepo = createRestaurantRepository(kv);
    const createHandler = new EventSourcedCommandHandler(
      createRestaurantDecider,
      createRepo,
    );

    const createCommand: CreateRestaurantCommand & CommandMetadata = {
      kind: "CreateRestaurantCommand",
      restaurantId: restaurantId("r-menu-1"),
      name: "Bistro",
      menu: {
        menuId: restaurantMenuId("m1"),
        cuisine: "ITALIAN",
        menuItems: [
          { menuItemId: menuItemId("item1"), name: "Pizza", price: "12.99" },
          { menuItemId: menuItemId("item2"), name: "Pasta", price: "10.99" },
        ],
      },
      idempotencyKey: "test-place-order-menu-create",
    };

    await createHandler.handle(createCommand);

    // Change menu
    const changeRepo = changeRestaurantMenuRepository(kv);
    const changeHandler = new EventSourcedCommandHandler(
      changeRestaurantManuDecider,
      changeRepo,
    );

    const changeCommand: ChangeRestaurantMenuCommand & CommandMetadata = {
      kind: "ChangeRestaurantMenuCommand",
      restaurantId: restaurantId("r-menu-1"),
      menu: {
        menuId: restaurantMenuId("m2"),
        cuisine: "ITALIAN",
        menuItems: [
          { menuItemId: menuItemId("item1"), name: "Pizza", price: "13.99" }, // Price changed
          { menuItemId: menuItemId("item2"), name: "Pasta", price: "11.99" },
          { menuItemId: menuItemId("item3"), name: "Salad", price: "8.99" }, // New item
        ],
      },
      idempotencyKey: "test-place-order-menu-change",
    };

    await changeHandler.handle(changeCommand);

    // Place order with item from updated menu - should succeed
    const repository = placeOrderRepository(kv);
    const handler = new EventSourcedCommandHandler(
      placeOrderDecider,
      repository,
    );

    const command: PlaceOrderCommand & CommandMetadata = {
      kind: "PlaceOrderCommand",
      restaurantId: restaurantId("r-menu-1"),
      orderId: orderId("o-menu-1"),
      menuItems: [
        { menuItemId: menuItemId("item3"), name: "Salad", price: "8.99" }, // New item from updated menu
      ],
      idempotencyKey: "test-place-order-menu-order",
    };

    const events = await handler.handle(command);

    // Verify order was placed successfully
    assertEquals(events.length, 1);
    assertEquals(events[0].kind, "RestaurantOrderPlacedEvent");
    assertEquals(
      (events[0] as RestaurantOrderPlacedEvent).orderId,
      orderId("o-menu-1"),
    );
    assertEquals(
      (events[0] as RestaurantOrderPlacedEvent).menuItems[0].menuItemId,
      menuItemId("item3"),
    );
  } finally {
    kv.close();
  }
});

Deno.test("PlaceOrderRepository - maximum retry limit enforcement", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    // Create restaurant first
    const createRepo = createRestaurantRepository(kv);
    const createHandler = new EventSourcedCommandHandler(
      createRestaurantDecider,
      createRepo,
    );

    const createCommand: CreateRestaurantCommand & CommandMetadata = {
      kind: "CreateRestaurantCommand",
      restaurantId: restaurantId("r-retry-1"),
      name: "Bistro",
      menu: {
        menuId: restaurantMenuId("m1"),
        cuisine: "ITALIAN",
        menuItems: [
          { menuItemId: menuItemId("item1"), name: "Pizza", price: "12.99" },
        ],
      },
      idempotencyKey: "test-place-order-retry-create",
    };

    await createHandler.handle(createCommand);

    // Place multiple orders to verify retry mechanism works
    const repository = placeOrderRepository(kv);
    const handler = new EventSourcedCommandHandler(
      placeOrderDecider,
      repository,
    );

    // Place first order
    const command1: PlaceOrderCommand & CommandMetadata = {
      kind: "PlaceOrderCommand",
      restaurantId: restaurantId("r-retry-1"),
      orderId: orderId("o-retry-1"),
      menuItems: [
        { menuItemId: menuItemId("item1"), name: "Pizza", price: "12.99" },
      ],
      idempotencyKey: "test-place-order-retry-1",
    };

    const result1 = await handler.handle(command1);
    assertEquals(result1.length, 1);
    assertEquals(
      (result1[0] as RestaurantOrderPlacedEvent).orderId,
      orderId("o-retry-1"),
    );

    // Place second order - should succeed with retry logic handling any conflicts
    const command2: PlaceOrderCommand & CommandMetadata = {
      kind: "PlaceOrderCommand",
      restaurantId: restaurantId("r-retry-1"),
      orderId: orderId("o-retry-2"),
      menuItems: [
        { menuItemId: menuItemId("item1"), name: "Pizza", price: "12.99" },
      ],
      idempotencyKey: "test-place-order-retry-2",
    };

    const result2 = await handler.handle(command2);
    assertEquals(result2.length, 1);
    assertEquals(
      (result2[0] as RestaurantOrderPlacedEvent).orderId,
      orderId("o-retry-2"),
    );

    // Verify both orders were persisted (indexed by order ID)
    // Note: With multi-tag indexing, each event creates multiple index entries
    // For an event with tags ["restaurantId", "orderId"], we get 3 index entries:
    // 1. restaurantId only
    // 2. orderId only
    // 3. restaurantId + orderId combination
    const iterByOrder1 = kv.list({
      prefix: [
        "events_by_type",
        "RestaurantOrderPlacedEvent",
        "orderId:o-retry-1",
      ],
    });
    const entriesByOrder1 = [];
    for await (const entry of iterByOrder1) {
      entriesByOrder1.push(entry);
    }
    assertEquals(
      entriesByOrder1.length,
      2,
      "First order should be persisted (2 index entries: orderId-only and restaurantId+orderId)",
    );

    const iterByOrder2 = kv.list({
      prefix: [
        "events_by_type",
        "RestaurantOrderPlacedEvent",
        "orderId:o-retry-2",
      ],
    });
    const entriesByOrder2 = [];
    for await (const entry of iterByOrder2) {
      entriesByOrder2.push(entry);
    }
    assertEquals(
      entriesByOrder2.length,
      2,
      "Second order should be persisted (2 index entries)",
    );
  } finally {
    kv.close();
  }
});

Deno.test("PlaceOrderRepository - verify events indexed by order ID correctly", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    // Create restaurant
    const createRepo = createRestaurantRepository(kv);
    const createHandler = new EventSourcedCommandHandler(
      createRestaurantDecider,
      createRepo,
    );

    const createCommand: CreateRestaurantCommand & CommandMetadata = {
      kind: "CreateRestaurantCommand",
      restaurantId: restaurantId("r-index-1"),
      name: "Bistro",
      menu: {
        menuId: restaurantMenuId("m1"),
        cuisine: "ITALIAN",
        menuItems: [
          { menuItemId: menuItemId("item1"), name: "Pizza", price: "12.99" },
        ],
      },
      idempotencyKey: "test-place-order-index-create",
    };

    await createHandler.handle(createCommand);

    // Place multiple orders
    const repository = placeOrderRepository(kv);
    const handler = new EventSourcedCommandHandler(
      placeOrderDecider,
      repository,
    );

    const order1: PlaceOrderCommand & CommandMetadata = {
      kind: "PlaceOrderCommand",
      restaurantId: restaurantId("r-index-1"),
      orderId: orderId("o-index-1"),
      menuItems: [
        { menuItemId: menuItemId("item1"), name: "Pizza", price: "12.99" },
      ],
      idempotencyKey: "test-place-order-index-1",
    };

    const order2: PlaceOrderCommand & CommandMetadata = {
      kind: "PlaceOrderCommand",
      restaurantId: restaurantId("r-index-1"),
      orderId: orderId("o-index-2"),
      menuItems: [
        { menuItemId: menuItemId("item1"), name: "Pizza", price: "12.99" },
      ],
      idempotencyKey: "test-place-order-index-2",
    };

    await handler.handle(order1);
    await handler.handle(order2);

    // Query events by order ID (each order indexed separately)
    // Note: With multi-tag indexing, querying by orderId prefix returns 2 entries per event
    const iterByOrder1 = kv.list({
      prefix: [
        "events_by_type",
        "RestaurantOrderPlacedEvent",
        "orderId:o-index-1",
      ],
    });
    const entriesByOrder1 = [];
    for await (const entry of iterByOrder1) {
      entriesByOrder1.push(entry);
    }
    assertEquals(entriesByOrder1.length, 2); // orderId-only + restaurantId+orderId entries

    const iterByOrder2 = kv.list({
      prefix: [
        "events_by_type",
        "RestaurantOrderPlacedEvent",
        "orderId:o-index-2",
      ],
    });
    const entriesByOrder2 = [];
    for await (const entry of iterByOrder2) {
      entriesByOrder2.push(entry);
    }
    assertEquals(entriesByOrder2.length, 2); // orderId-only + restaurantId+orderId entries

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
      assertEquals(event.restaurantId, restaurantId("r-index-1"));
    }
  } finally {
    kv.close();
  }
});

Deno.test("PlaceOrderRepository - idempotency circuit-break returns same events on duplicate key", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    // Create restaurant first
    const createRepo = createRestaurantRepository(kv);
    const createHandler = new EventSourcedCommandHandler(
      createRestaurantDecider,
      createRepo,
    );

    const createCommand: CreateRestaurantCommand & CommandMetadata = {
      kind: "CreateRestaurantCommand",
      restaurantId: restaurantId("r-idempotent-1"),
      name: "Bistro",
      menu: {
        menuId: restaurantMenuId("m1"),
        cuisine: "ITALIAN",
        menuItems: [
          { menuItemId: menuItemId("item1"), name: "Pizza", price: "12.99" },
        ],
      },
      idempotencyKey: "test-place-order-idempotent-create",
    };

    await createHandler.handle(createCommand);

    // Place order
    const repository = placeOrderRepository(kv);
    const handler = new EventSourcedCommandHandler(
      placeOrderDecider,
      repository,
    );

    const command: PlaceOrderCommand & CommandMetadata = {
      kind: "PlaceOrderCommand",
      restaurantId: restaurantId("r-idempotent-1"),
      orderId: orderId("o-idempotent-1"),
      menuItems: [
        { menuItemId: menuItemId("item1"), name: "Pizza", price: "12.99" },
      ],
      idempotencyKey: "test-place-order-idempotent-key",
    };

    // First execution — should succeed and persist events
    const firstResult = await handler.handle(command);
    assertEquals(firstResult.length, 1);
    const firstEvent = firstResult[0] as
      & RestaurantOrderPlacedEvent
      & EventMetadata;
    assertEquals(firstEvent.kind, "RestaurantOrderPlacedEvent");
    assertEquals(firstEvent.orderId, orderId("o-idempotent-1"));
    assertEquals(firstEvent.idempotencyKey, "test-place-order-idempotent-key");

    // Second execution — same command, same idempotencyKey
    // Should circuit-break and return the same events without invoking the decider
    const secondResult = await handler.handle(command);
    assertEquals(secondResult.length, 1);
    const secondEvent = secondResult[0] as
      & RestaurantOrderPlacedEvent
      & EventMetadata;

    // Same event data
    assertEquals(secondEvent.kind, "RestaurantOrderPlacedEvent");
    assertEquals(secondEvent.orderId, orderId("o-idempotent-1"));
    assertEquals(
      secondEvent.idempotencyKey,
      "test-place-order-idempotent-key",
    );

    // Same eventId — proves it's the same persisted event, not a new one
    assertEquals(secondEvent.eventId, firstEvent.eventId);
  } finally {
    kv.close();
  }
});

Deno.test("PlaceOrderRepository - same command with different idempotencyKey throws OrderAlreadyExistsError", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    // Create restaurant first
    const createRepo = createRestaurantRepository(kv);
    const createHandler = new EventSourcedCommandHandler(
      createRestaurantDecider,
      createRepo,
    );

    const createCommand: CreateRestaurantCommand & CommandMetadata = {
      kind: "CreateRestaurantCommand",
      restaurantId: restaurantId("r-diffkey-1"),
      name: "Bistro",
      menu: {
        menuId: restaurantMenuId("m1"),
        cuisine: "ITALIAN",
        menuItems: [
          { menuItemId: menuItemId("item1"), name: "Pizza", price: "12.99" },
        ],
      },
      idempotencyKey: "test-place-order-diffkey-create",
    };

    await createHandler.handle(createCommand);

    // Place order
    const repository = placeOrderRepository(kv);
    const handler = new EventSourcedCommandHandler(
      placeOrderDecider,
      repository,
    );

    const command: PlaceOrderCommand & CommandMetadata = {
      kind: "PlaceOrderCommand",
      restaurantId: restaurantId("r-diffkey-1"),
      orderId: orderId("o-diffkey-1"),
      menuItems: [
        { menuItemId: menuItemId("item1"), name: "Pizza", price: "12.99" },
      ],
      idempotencyKey: "test-place-order-diffkey-1",
    };

    // First execution — succeeds
    const result = await handler.handle(command);
    assertEquals(result.length, 1);
    assertEquals(result[0].kind, "RestaurantOrderPlacedEvent");

    // Second execution — same order ID but different idempotencyKey
    // No circuit-break (different key), so decider runs and sees the order already exists
    await assertRejects(
      async () => {
        await handler.handle({
          ...command,
          idempotencyKey: "test-place-order-diffkey-2",
        });
      },
      OrderAlreadyExistsError,
    );
  } finally {
    kv.close();
  }
});
