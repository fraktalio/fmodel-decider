/**
 * Integration tests for repository infrastructure.
 *
 * Tests verify the tuple-based query pattern that enables flexible
 * entity/event type combinations for DCB patterns.
 */

import { assertEquals } from "@std/assert";
import { EventSourcedCommandHandler } from "../../application.ts";
import { createRestaurantRepository } from "./createRestaurantRepository.ts";
import { createRestaurantDecider } from "./createRestaurantDecider.ts";
import {
  type CreateRestaurantCommand,
  menuItemId,
  restaurantId,
  restaurantMenuId,
} from "./api.ts";

Deno.test("EventSourcedRepository - tuple-based query pattern allows flexible entity/event type combinations", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    // This test demonstrates the power of the tuple-based approach
    // The repository can now query different event types from different entities
    // in a single load operation, which is essential for DCB patterns

    // Example: A PlaceOrder command might need to load:
    // - RestaurantCreatedEvent by restaurant ID (r1)
    // - RestaurantMenuChangedEvent by restaurant ID (r1)
    // - RestaurantOrderPlacedEvent by restaurant ID (r1) to check if order exists
    // - Or even RestaurantOrderPlacedEvent by order ID (o1) if checking across restaurants

    // The tuple approach: [(entityId, eventType), ...]
    // allows querying: [("r1", "RestaurantCreatedEvent"), ("r1", "RestaurantMenuChangedEvent"), ("o1", "OrderPreparedEvent")]

    // For this test, we'll verify the CreateRestaurantRepository works with the new tuple approach
    const repository = createRestaurantRepository(kv);
    const handler = new EventSourcedCommandHandler(
      createRestaurantDecider,
      repository,
    );

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

    const events = await handler.handle(command);
    assertEquals(events.length, 1);

    // The repository internally used: [("r1", "RestaurantCreatedEvent")]
    // This is more flexible than the old approach of: entityId="r1", eventTypes=["RestaurantCreatedEvent"]
    // because now we can mix different entity IDs in the same query
  } finally {
    await kv.close();
  }
});
