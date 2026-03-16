/**
 * Integration tests for order view event loader (aggregate pattern).
 *
 * Tests verify that EventSourcedQueryHandler correctly projects
 * order state by loading events from Deno KV and folding
 * them through the order view.
 */

import { assertEquals } from "@std/assert";
import { EventSourcedCommandHandler } from "../../application.ts";
import { orderRepository } from "./orderRepository.ts";
import { orderDecider } from "./orderDecider.ts";
import { orderViewQueryHandler } from "./orderViewEventLoader.ts";
import { type MenuItem, menuItemId, orderId, restaurantId } from "./api.ts";

const testMenuItems: MenuItem[] = [
  { menuItemId: menuItemId("item1"), name: "Pizza", price: "12.99" },
];

Deno.test("OrderViewEventLoader (aggregate) - project order state from created event", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    const repo = orderRepository(kv);
    const handler = new EventSourcedCommandHandler(orderDecider, repo);

    await handler.handle({
      decider: "Order",
      kind: "CreateOrderCommand",
      orderId: orderId("o1"),
      restaurantId: restaurantId("r1"),
      menuItems: testMenuItems,
    });

    const queryHandler = orderViewQueryHandler(kv);
    const state = await queryHandler.handle([
      ["orderId:o1", "OrderCreatedEvent"],
    ]);

    assertEquals(state?.orderId, orderId("o1"));
    assertEquals(state?.restaurantId, restaurantId("r1"));
    assertEquals(state?.menuItems, testMenuItems);
    assertEquals(state?.status, "CREATED");
  } finally {
    await kv.close();
  }
});

Deno.test("OrderViewEventLoader (aggregate) - project state after order prepared", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    const repo = orderRepository(kv);
    const handler = new EventSourcedCommandHandler(orderDecider, repo);

    await handler.handle({
      decider: "Order",
      kind: "CreateOrderCommand",
      orderId: orderId("o1"),
      restaurantId: restaurantId("r1"),
      menuItems: testMenuItems,
    });

    await handler.handle({
      decider: "Order",
      kind: "MarkOrderAsPreparedCommand",
      orderId: orderId("o1"),
    });

    const queryHandler = orderViewQueryHandler(kv);
    const state = await queryHandler.handle([
      ["orderId:o1", "OrderCreatedEvent"],
      ["orderId:o1", "OrderPreparedEvent"],
    ]);

    assertEquals(state?.orderId, orderId("o1"));
    assertEquals(state?.restaurantId, restaurantId("r1"));
    assertEquals(state?.menuItems, testMenuItems);
    assertEquals(state?.status, "PREPARED");
  } finally {
    await kv.close();
  }
});

Deno.test("OrderViewEventLoader (aggregate) - empty query returns null initial state", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    const queryHandler = orderViewQueryHandler(kv);
    const state = await queryHandler.handle([
      ["orderId:nonexistent", "OrderCreatedEvent"],
    ]);

    assertEquals(state, null);
  } finally {
    await kv.close();
  }
});
