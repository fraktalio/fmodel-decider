import { DeciderEventSourcedSpec } from "../../test_specification.ts";
import { placeOrderDecider } from "./placeOrder.ts";
import type { MenuItem, PlaceOrderCommand, RestaurantMenu } from "./api.ts";

// Test data
const testMenu: RestaurantMenu = {
  menuId: "menu-1",
  cuisine: "ITALIAN",
  menuItems: [
    { menuItemId: "item-1", name: "Pizza", price: "10.00" },
    { menuItemId: "item-2", name: "Pasta", price: "12.00" },
  ],
};

const testMenuItems: MenuItem[] = [
  { menuItemId: "item-1", name: "Pizza", price: "10.00" },
];

Deno.test("Place Order - Success", () => {
  const command: PlaceOrderCommand = {
    kind: "PlaceOrderCommand",
    id: "restaurant-1",
    orderId: "order-1",
    menuItems: testMenuItems,
  };

  DeciderEventSourcedSpec.for(placeOrderDecider)
    .given([
      {
        kind: "RestaurantCreatedEvent",
        restaurantId: "restaurant-1",
        name: "Italian Bistro",
        menu: testMenu,
        final: false,
      },
    ])
    .when(command)
    .then([
      {
        kind: "RestaurantOrderPlacedEvent",
        restaurantId: "restaurant-1",
        orderId: "order-1",
        menuItems: testMenuItems,
        final: false,
      },
    ]);
});

Deno.test("Place Order - Restaurant Does Not Exist (throws error)", () => {
  const command: PlaceOrderCommand = {
    kind: "PlaceOrderCommand",
    id: "restaurant-1",
    orderId: "order-1",
    menuItems: testMenuItems,
  };

  DeciderEventSourcedSpec.for(placeOrderDecider)
    .given([])
    .when(command)
    .thenThrows((error) => error.message === "Restaurant does not exist!");
});

Deno.test("Place Order - Order Already Exists (throws error)", () => {
  const command: PlaceOrderCommand = {
    kind: "PlaceOrderCommand",
    id: "restaurant-1",
    orderId: "order-1",
    menuItems: testMenuItems,
  };

  DeciderEventSourcedSpec.for(placeOrderDecider)
    .given([
      {
        kind: "RestaurantCreatedEvent",
        restaurantId: "restaurant-1",
        name: "Italian Bistro",
        menu: testMenu,
        final: false,
      },
      {
        kind: "RestaurantOrderPlacedEvent",
        restaurantId: "restaurant-1",
        orderId: "order-1",
        menuItems: testMenuItems,
        final: false,
      },
    ])
    .when(command)
    .thenThrows((error) => error.message === "Order already exist!");
});

Deno.test("Place Order - Menu Items Not Available (throws error)", () => {
  const invalidMenuItems: MenuItem[] = [
    { menuItemId: "item-999", name: "Invalid Item", price: "99.00" },
  ];

  const command: PlaceOrderCommand = {
    kind: "PlaceOrderCommand",
    id: "restaurant-1",
    orderId: "order-1",
    menuItems: invalidMenuItems,
  };

  DeciderEventSourcedSpec.for(placeOrderDecider)
    .given([
      {
        kind: "RestaurantCreatedEvent",
        restaurantId: "restaurant-1",
        name: "Italian Bistro",
        menu: testMenu,
        final: false,
      },
    ])
    .when(command)
    .thenThrows((error) => error.message === "Menu items not available!");
});

Deno.test("Place Order - After Menu Change", () => {
  const newMenu: RestaurantMenu = {
    menuId: "menu-2",
    cuisine: "MEXICAN",
    menuItems: [
      { menuItemId: "item-3", name: "Tacos", price: "8.00" },
    ],
  };

  const command: PlaceOrderCommand = {
    kind: "PlaceOrderCommand",
    id: "restaurant-1",
    orderId: "order-1",
    menuItems: [{ menuItemId: "item-3", name: "Tacos", price: "8.00" }],
  };

  DeciderEventSourcedSpec.for(placeOrderDecider)
    .given([
      {
        kind: "RestaurantCreatedEvent",
        restaurantId: "restaurant-1",
        name: "Italian Bistro",
        menu: testMenu,
        final: false,
      },
      {
        kind: "RestaurantMenuChangedEvent",
        restaurantId: "restaurant-1",
        menu: newMenu,
        final: false,
      },
    ])
    .when(command)
    .then([
      {
        kind: "RestaurantOrderPlacedEvent",
        restaurantId: "restaurant-1",
        orderId: "order-1",
        menuItems: [{ menuItemId: "item-3", name: "Tacos", price: "8.00" }],
        final: false,
      },
    ]);
});
