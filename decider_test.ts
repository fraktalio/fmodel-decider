import { AggregateDecider, DcbDecider } from "./decider.ts";
import {
  DeciderEventSourcedSpec,
  DeciderStateStoredSpec,
} from "./test_specification.ts";
import { assertEquals } from "@std/assert";

// Simple Counter Example with Exhaustive Matching
type CounterCommand =
  | { kind: "IncrementCommand"; amount: number }
  | { kind: "DecrementCommand"; amount: number }
  | { kind: "ResetCommand" };

type CounterEvent =
  | { kind: "IncrementedEvent"; amount: number }
  | { kind: "DecrementedEvent"; amount: number }
  | { kind: "ResetEvent" };

type CounterState = {
  readonly value: number;
};

const initialCounterState: CounterState = { value: 0 };

/**
 * Counter decider with exhaustive matching
 */
const counterDecider = new AggregateDecider<
  CounterCommand,
  CounterState,
  CounterEvent
>(
  (command, _state) => {
    switch (command.kind) {
      case "IncrementCommand":
        return [{ kind: "IncrementedEvent", amount: command.amount }];
      case "DecrementCommand":
        return [{ kind: "DecrementedEvent", amount: command.amount }];
      case "ResetCommand":
        return [{ kind: "ResetEvent" }];
      default: {
        // Exhaustive matching of the command type
        const _exhaustiveCheck: never = command;
        return [];
      }
    }
  },
  (state, event) => {
    switch (event.kind) {
      case "IncrementedEvent":
        return { value: state.value + event.amount };
      case "DecrementedEvent":
        return { value: state.value - event.amount };
      case "ResetEvent":
        return { value: 0 };
      default: {
        // Exhaustive matching of the event type
        const _exhaustiveCheck: never = event;
        return state;
      }
    }
  },
  initialCounterState,
);

// Enhanced Counter Example - Demonstrating combineViaTuples with Separate Deciders

// Individual command types for each operation
type IncrementCommand = { kind: "IncrementCommand"; amount: number };
type DecrementCommand = { kind: "DecrementCommand"; amount: number };
type ResetCommand = { kind: "ResetCommand" };

// Individual event types for each operation
type IncrementedEvent = { kind: "IncrementedEvent"; amount: number };
type DecrementedEvent = { kind: "DecrementedEvent"; amount: number };
type ResetEvent = { kind: "ResetEvent" };

/**
 * Increment-only decider that handles only increment operations
 */
const incrementDecider = new AggregateDecider<
  IncrementCommand,
  CounterState,
  IncrementedEvent
>(
  (command, _state) => {
    if (command.kind === "IncrementCommand") {
      return [{ kind: "IncrementedEvent", amount: command.amount }];
    }
    return [];
  },
  (state, event) => {
    if (event.kind === "IncrementedEvent") {
      return { value: state.value + event.amount };
    }
    return state;
  },
  initialCounterState,
);

/**
 * Decrement-only decider that handles only decrement operations
 */
const decrementDecider = new AggregateDecider<
  DecrementCommand,
  CounterState,
  DecrementedEvent
>(
  (command, _state) => {
    if (command.kind === "DecrementCommand") {
      return [{ kind: "DecrementedEvent", amount: command.amount }];
    }
    return [];
  },
  (state, event) => {
    if (event.kind === "DecrementedEvent") {
      return { value: state.value - event.amount };
    }
    return state;
  },
  initialCounterState,
);

/**
 * Reset-only decider that handles only reset operations
 */
const resetDecider = new AggregateDecider<
  ResetCommand,
  CounterState,
  ResetEvent
>(
  (command, _state) => {
    if (command.kind === "ResetCommand") {
      return [{ kind: "ResetEvent" }];
    }
    return [];
  },
  (state, event) => {
    if (event.kind === "ResetEvent") {
      return { value: 0 };
    }
    return state;
  },
  initialCounterState,
);

/**
 * Combined counter decider using combineViaTuples method.
 * This demonstrates how to compose multiple deciders while keeping their states separate.
 * The original tuple state: [readonly [CounterState, CounterState], CounterState]
 * representing [[incrementState, decrementState], resetState]
 */
const baseCombinedCounterDecider = incrementDecider
  .combineViaTuples(decrementDecider)
  .combineViaTuples(resetDecider);

// Type aliases for the combined decider
type CombinedCommand = IncrementCommand | DecrementCommand | ResetCommand;
type CombinedEvent = IncrementedEvent | DecrementedEvent | ResetEvent;

// Original tuple state from combineViaTuples
type TupleState = readonly [
  readonly [CounterState, CounterState],
  CounterState,
];

// Flattened state structure for easier testing
type CombinedState = {
  readonly incrementState: CounterState;
  readonly decrementState: CounterState;
  readonly resetState: CounterState;
};

/**
 * Transform the combined decider to use a flatter state structure using dimapOnState.
 * This avoids wrappers by transforming the tuple state to a more convenient object structure.
 */
const combinedCounterDecider = baseCombinedCounterDecider.dimapOnState<
  CombinedState,
  CombinedState
>(
  // Convert flat state to tuple state (contravariant - for input)
  (flatState: CombinedState): TupleState => [
    [flatState.incrementState, flatState.decrementState],
    flatState.resetState,
  ],
  // Convert tuple state to flat state (covariant - for output)
  (tupleState: TupleState): CombinedState => ({
    incrementState: tupleState[0][0],
    decrementState: tupleState[0][1],
    resetState: tupleState[1],
  }),
);

/**
 * Convert the combined decider to an AggregateDecider using the new extension method.
 * This is much cleaner than manually creating a new AggregateDecider instance.
 */
const combinedCounterAggregateDecider = combinedCounterDecider
  .toAggregateDecider();

// Tests
Deno.test("Counter Increment - Event Sourced", () => {
  DeciderEventSourcedSpec.for(counterDecider)
    .given([])
    .when({ kind: "IncrementCommand", amount: 5 })
    .then([{ kind: "IncrementedEvent", amount: 5 }]);
});

Deno.test("Counter Increment - State Stored", () => {
  DeciderStateStoredSpec.for(counterDecider)
    .given({ value: 0 })
    .when({ kind: "IncrementCommand", amount: 5 })
    .then({ value: 5 });
});

Deno.test("Counter Decrement - Event Sourced", () => {
  DeciderEventSourcedSpec.for(counterDecider)
    .given([{ kind: "IncrementedEvent", amount: 10 }])
    .when({ kind: "DecrementCommand", amount: 3 })
    .then([{ kind: "DecrementedEvent", amount: 3 }]);
});

Deno.test("Counter Reset - State Stored", () => {
  DeciderStateStoredSpec.for(counterDecider)
    .given({ value: 42 })
    .when({ kind: "ResetCommand" })
    .then({ value: 0 });
});

// Enhanced Counter Tests - Demonstrating combineViaTuples with DeciderEventSourcedSpec and DeciderStateStoredSpec

Deno.test("Combined Counter - Increment operation (Event Sourced)", () => {
  DeciderEventSourcedSpec.for(combinedCounterAggregateDecider)
    .given([])
    .when({ kind: "IncrementCommand", amount: 5 })
    .then([{ kind: "IncrementedEvent", amount: 5 }]);
});

Deno.test("Combined Counter - Increment operation (State Stored)", () => {
  const initialFlatState: CombinedState = {
    incrementState: { value: 0 },
    decrementState: { value: 0 },
    resetState: { value: 0 },
  };

  DeciderStateStoredSpec.for(combinedCounterAggregateDecider)
    .given(initialFlatState)
    .when({ kind: "IncrementCommand", amount: 5 })
    .then({
      incrementState: { value: 5 }, // increment state updated
      decrementState: { value: 0 }, // decrement unchanged
      resetState: { value: 0 }, // reset state unchanged
    });
});

Deno.test("Combined Counter - Decrement operation (Event Sourced)", () => {
  DeciderEventSourcedSpec.for(combinedCounterAggregateDecider)
    .given([{ kind: "IncrementedEvent", amount: 10 }])
    .when({ kind: "DecrementCommand", amount: 3 })
    .then([{ kind: "DecrementedEvent", amount: 3 }]);
});

Deno.test("Combined Counter - Decrement operation (State Stored)", () => {
  const initialFlatState: CombinedState = {
    incrementState: { value: 10 },
    decrementState: { value: 10 },
    resetState: { value: 10 },
  };

  DeciderStateStoredSpec.for(combinedCounterAggregateDecider)
    .given(initialFlatState)
    .when({ kind: "DecrementCommand", amount: 3 })
    .then({
      incrementState: { value: 10 }, // increment unchanged
      decrementState: { value: 7 }, // decrement state updated
      resetState: { value: 10 }, // reset state unchanged
    });
});

Deno.test("Combined Counter - Reset operation (Event Sourced)", () => {
  DeciderEventSourcedSpec.for(combinedCounterAggregateDecider)
    .given([
      { kind: "IncrementedEvent", amount: 15 },
      { kind: "DecrementedEvent", amount: 5 },
    ])
    .when({ kind: "ResetCommand" })
    .then([{ kind: "ResetEvent" }]);
});

Deno.test("Combined Counter - Reset operation (State Stored)", () => {
  const initialFlatState: CombinedState = {
    incrementState: { value: 15 },
    decrementState: { value: 20 },
    resetState: { value: 25 },
  };

  DeciderStateStoredSpec.for(combinedCounterAggregateDecider)
    .given(initialFlatState)
    .when({ kind: "ResetCommand" })
    .then({
      incrementState: { value: 15 }, // increment state unchanged
      decrementState: { value: 20 }, // decrement state unchanged
      resetState: { value: 0 }, // reset state updated
    });
});

Deno.test("Combined Counter - Complex event sourced sequence", () => {
  DeciderEventSourcedSpec.for(combinedCounterAggregateDecider)
    .given([
      { kind: "IncrementedEvent", amount: 10 },
      { kind: "IncrementedEvent", amount: 5 },
      { kind: "DecrementedEvent", amount: 3 },
    ])
    .when({ kind: "ResetCommand" })
    .then([{ kind: "ResetEvent" }]);
});

Deno.test("Extension Method - toAggregateDecider() demonstration", () => {
  // Demonstrate that we can create an AggregateDecider directly from any compatible Decider
  const directAggregateDecider = combinedCounterDecider.toAggregateDecider();

  // Verify it works with both test specifications
  DeciderEventSourcedSpec.for(directAggregateDecider)
    .given([])
    .when({ kind: "IncrementCommand", amount: 3 })
    .then([{ kind: "IncrementedEvent", amount: 3 }]);

  DeciderStateStoredSpec.for(directAggregateDecider)
    .given({
      incrementState: { value: 0 },
      decrementState: { value: 0 },
      resetState: { value: 0 },
    })
    .when({ kind: "IncrementCommand", amount: 3 })
    .then({
      incrementState: { value: 3 },
      decrementState: { value: 0 },
      resetState: { value: 0 },
    });
});

// Restaurant Ordering Example with Different Input/Output Event Types (Ei ≠ Eo)

/**
 * Represents a menu item available in a restaurant.
 */
type MenuItem = {
  readonly itemId: string;
  readonly name: string;
  readonly price: number;
  readonly category: string;
  readonly available: boolean;
};

/**
 * Event published when a restaurant makes its menu available.
 * This is an input event (Ei) that helps establish available menu in state.
 */
type RestaurantMenuPublished = {
  readonly kind: "RestaurantMenuPublished";
  readonly restaurantId: string;
  readonly menuId: string;
  readonly menuName: string;
  readonly items: readonly MenuItem[];
  readonly publishedAt: Date;
  readonly availableUntil: Date;
};

/**
 * Represents an item in an order with quantity and pricing information.
 */
type OrderItem = {
  readonly menuItemId: string;
  readonly quantity: number;
  readonly unitPrice: number;
};

/**
 * Event created when an order is successfully placed.
 * This serves as both input event (Ei) for tracking existing orders
 * and output event (Eo) when new orders are created.
 * This demonstrates the Ei ≠ Eo pattern where input events are a union type
 * but output events are a single type.
 */
type OrderCreated = {
  readonly kind: "OrderCreated";
  readonly orderId: string;
  readonly restaurantId: string;
  readonly customerId: string;
  readonly items: readonly OrderItem[];
  readonly totalAmount: number;
  readonly createdAt: Date;
  readonly source: "automatic" | "manual";
};

/**
 * Union type representing all input events (Ei) that the decider can process.
 * This includes both menu publications and existing orders.
 */
type RestaurantInputEvent = RestaurantMenuPublished | OrderCreated;

/**
 * Output event type (Eo) - only OrderCreated events are produced.
 * This demonstrates the key DcbDecider capability where Ei ≠ Eo.
 */
type RestaurantOutputEvent = OrderCreated;

/**
 * Command to place an order for a specific menu item.
 */
type PlaceOrder = {
  readonly kind: "PlaceOrder";
  readonly orderId: string;
  readonly customerId: string;
  readonly menuItemId: string;
  readonly quantity: number;
};

/**
 * Information about available menu items.
 */
type MenuInfo = {
  readonly restaurantId: string;
  readonly menuId: string;
  readonly menuName: string;
  readonly items: readonly MenuItem[];
  readonly availableUntil: Date;
};

/**
 * Information about an existing order.
 */
type OrderInfo = {
  readonly orderId: string;
  readonly restaurantId: string;
  readonly customerId: string;
  readonly totalAmount: number;
  readonly createdAt: Date;
};

/**
 * State that tracks both available menu and existing orders.
 * Used to validate that orders reference valid menu items and prevent duplicates.
 */
type RestaurantAndOrderState = {
  readonly availableMenu: MenuInfo | null;
  readonly orderWithTheSameId: OrderInfo | null;
};

/**
 * Initial state for the restaurant decider with no menu and no existing orders.
 */
const initialRestaurantState: RestaurantAndOrderState = {
  availableMenu: null,
  orderWithTheSameId: null,
};

/**
 * Evolve function that processes input events to update state.
 * Handles RestaurantMenuPublished events to update available menu
 * and OrderCreated events to track existing orders.
 */
const evolveRestaurantState = (
  state: RestaurantAndOrderState,
  event: RestaurantInputEvent,
): RestaurantAndOrderState => {
  switch (event.kind) {
    case "RestaurantMenuPublished":
      return {
        ...state,
        availableMenu: {
          restaurantId: event.restaurantId,
          menuId: event.menuId,
          menuName: event.menuName,
          items: event.items,
          availableUntil: event.availableUntil,
        },
      };
    case "OrderCreated":
      return {
        ...state,
        orderWithTheSameId: {
          orderId: event.orderId,
          restaurantId: event.restaurantId,
          customerId: event.customerId,
          totalAmount: event.totalAmount,
          createdAt: event.createdAt,
        },
      };
    default: {
      // Exhaustive matching of the event type
      const _exhaustiveCheck: never = event;
      return state;
    }
  }
};

/**
 * Decide function that handles PlaceOrder commands.
 * Returns OrderCreated events when menu is available and order is unique,
 * otherwise returns empty array.
 */
const decideRestaurantOrder = (
  command: PlaceOrder,
  state: RestaurantAndOrderState,
): readonly RestaurantOutputEvent[] => {
  // Check if menu is available
  if (!state.availableMenu) {
    return [];
  }

  // Check if order with same ID already exists
  if (
    state.orderWithTheSameId &&
    state.orderWithTheSameId.orderId === command.orderId
  ) {
    return [];
  }

  // Find the menu item
  const menuItem = state.availableMenu.items.find(
    (item) => item.itemId === command.menuItemId && item.available,
  );

  if (!menuItem) {
    return [];
  }

  // Create the order
  const totalAmount = menuItem.price * command.quantity;
  const orderCreated: OrderCreated = {
    kind: "OrderCreated",
    orderId: command.orderId,
    restaurantId: state.availableMenu.restaurantId,
    customerId: command.customerId,
    items: [
      {
        menuItemId: command.menuItemId,
        quantity: command.quantity,
        unitPrice: menuItem.price,
      },
    ],
    totalAmount,
    createdAt: new Date(),
    source: "automatic",
  };

  return [orderCreated];
};

/**
 * Restaurant ordering decider demonstrating DcbDecider with Ei ≠ Eo.
 * Input events (Ei): RestaurantMenuPublished | OrderCreated
 * Output events (Eo): OrderCreated
 * This showcases the key capability where input and output event types differ.
 */
const restaurantDecider = new DcbDecider<
  PlaceOrder,
  RestaurantAndOrderState,
  RestaurantInputEvent,
  RestaurantOutputEvent
>(
  decideRestaurantOrder,
  evolveRestaurantState,
  initialRestaurantState,
);

// Restaurant Ordering Tests - Demonstrating DcbDecider with Ei ≠ Eo

Deno.test("Restaurant Order Creation - Successful order from menu publication", () => {
  const menuPublished: RestaurantMenuPublished = {
    kind: "RestaurantMenuPublished",
    restaurantId: "rest-123",
    menuId: "menu-456",
    menuName: "Lunch Menu",
    items: [
      {
        itemId: "item-789",
        name: "Margherita Pizza",
        price: 12.99,
        category: "Pizza",
        available: true,
      },
      {
        itemId: "item-790",
        name: "Caesar Salad",
        price: 8.99,
        category: "Salad",
        available: true,
      },
    ],
    publishedAt: new Date("2024-01-15T10:00:00Z"),
    availableUntil: new Date("2024-01-15T22:00:00Z"),
  };

  const placeOrderCommand: PlaceOrder = {
    kind: "PlaceOrder",
    orderId: "order-001",
    customerId: "cust-456",
    menuItemId: "item-789",
    quantity: 2,
  };

  // First get the actual events to extract the dynamic createdAt
  const actualEvents = restaurantDecider.computeNewEvents(
    [menuPublished],
    placeOrderCommand,
  );
  assertEquals(actualEvents.length, 1);

  const expectedOrderCreated: OrderCreated = {
    kind: "OrderCreated",
    orderId: "order-001",
    restaurantId: "rest-123",
    customerId: "cust-456",
    items: [
      {
        menuItemId: "item-789",
        quantity: 2,
        unitPrice: 12.99,
      },
    ],
    totalAmount: 25.98,
    createdAt: actualEvents[0].createdAt, // Use the actual createdAt from the result
    source: "automatic",
  };

  // Now use DeciderEventSourcedSpec with the expected event including actual createdAt
  DeciderEventSourcedSpec.for(restaurantDecider)
    .given([menuPublished])
    .when(placeOrderCommand)
    .then([expectedOrderCreated]);
});

Deno.test("Restaurant Order Creation - Duplicate order prevention", () => {
  const menuPublished: RestaurantMenuPublished = {
    kind: "RestaurantMenuPublished",
    restaurantId: "rest-123",
    menuId: "menu-456",
    menuName: "Lunch Menu",
    items: [
      {
        itemId: "item-789",
        name: "Margherita Pizza",
        price: 12.99,
        category: "Pizza",
        available: true,
      },
    ],
    publishedAt: new Date("2024-01-15T10:00:00Z"),
    availableUntil: new Date("2024-01-15T22:00:00Z"),
  };

  const existingOrder: OrderCreated = {
    kind: "OrderCreated",
    orderId: "order-001",
    restaurantId: "rest-123",
    customerId: "cust-456",
    items: [
      {
        menuItemId: "item-789",
        quantity: 1,
        unitPrice: 12.99,
      },
    ],
    totalAmount: 12.99,
    createdAt: new Date("2024-01-15T11:00:00Z"),
    source: "manual",
  };

  const duplicateOrderCommand: PlaceOrder = {
    kind: "PlaceOrder",
    orderId: "order-001", // Same order ID as existing order
    customerId: "cust-456",
    menuItemId: "item-789",
    quantity: 2,
  };

  DeciderEventSourcedSpec.for(restaurantDecider)
    .given([menuPublished, existingOrder])
    .when(duplicateOrderCommand)
    .then([]); // No events should be produced for duplicate order
});

Deno.test("Restaurant Order Creation - Order creation without available menu", () => {
  const placeOrderCommand: PlaceOrder = {
    kind: "PlaceOrder",
    orderId: "order-002",
    customerId: "cust-789",
    menuItemId: "item-999",
    quantity: 1,
  };

  DeciderEventSourcedSpec.for(restaurantDecider)
    .given([]) // Empty event history - no menu published
    .when(placeOrderCommand)
    .then([]); // No events should be produced without available menu
});
