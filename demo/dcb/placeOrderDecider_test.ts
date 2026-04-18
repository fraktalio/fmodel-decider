import { DeciderEventSourcedSpec } from "../../test_specification_deno.ts";
import { placeOrderDecider } from "./placeOrderDecider.ts";
import {
  type MenuItem,
  menuItemId,
  MenuItemsNotAvailableError,
  OrderAlreadyExistsError,
  orderId,
  type PlaceOrderCommand,
  restaurantId,
  type RestaurantMenu,
  restaurantMenuId,
  RestaurantNotFoundError,
} from "./api.ts";

// Test data
const testMenu: RestaurantMenu = {
  menuId: restaurantMenuId("menu-1"),
  cuisine: "ITALIAN",
  menuItems: [
    { menuItemId: menuItemId("item-1"), name: "Pizza", price: "10.00" },
    { menuItemId: menuItemId("item-2"), name: "Pasta", price: "12.00" },
  ],
};

const testMenuItems: MenuItem[] = [
  { menuItemId: menuItemId("item-1"), name: "Pizza", price: "10.00" },
];

Deno.test("Place Order - Success", () => {
  const command: PlaceOrderCommand = {
    kind: "PlaceOrderCommand",
    restaurantId: restaurantId("restaurant-1"),
    orderId: orderId("order-1"),
    menuItems: testMenuItems,
  };

  DeciderEventSourcedSpec.for(placeOrderDecider)
    .given([
      {
        kind: "RestaurantCreatedEvent",
        restaurantId: restaurantId("restaurant-1"),
        name: "Italian Bistro",
        menu: testMenu,
        final: false,
        tagFields: ["restaurantId"],
      },
    ])
    .when(command)
    .then([
      {
        kind: "RestaurantOrderPlacedEvent",
        restaurantId: restaurantId("restaurant-1"),
        orderId: orderId("order-1"),
        menuItems: testMenuItems,
        final: false,
        tagFields: ["restaurantId", "orderId"],
      },
    ]);
});

Deno.test("Place Order - Restaurant Does Not Exist (throws error)", () => {
  const command: PlaceOrderCommand = {
    kind: "PlaceOrderCommand",
    restaurantId: restaurantId("restaurant-1"),
    orderId: orderId("order-1"),
    menuItems: testMenuItems,
  };

  DeciderEventSourcedSpec.for(placeOrderDecider)
    .given([])
    .when(command)
    .thenThrows((error) => error instanceof RestaurantNotFoundError);
});

Deno.test("Place Order - Order Already Exists (throws error)", () => {
  const command: PlaceOrderCommand = {
    kind: "PlaceOrderCommand",
    restaurantId: restaurantId("restaurant-1"),
    orderId: orderId("order-1"),
    menuItems: testMenuItems,
  };

  DeciderEventSourcedSpec.for(placeOrderDecider)
    .given([
      {
        kind: "RestaurantCreatedEvent",
        restaurantId: restaurantId("restaurant-1"),
        name: "Italian Bistro",
        menu: testMenu,
        final: false,
        tagFields: ["restaurantId"],
      },
      {
        kind: "RestaurantOrderPlacedEvent",
        restaurantId: restaurantId("restaurant-1"),
        orderId: orderId("order-1"),
        menuItems: testMenuItems,
        final: false,
        tagFields: ["restaurantId", "orderId"],
      },
    ])
    .when(command)
    .thenThrows((error) => error instanceof OrderAlreadyExistsError);
});

Deno.test("Place Order - Menu Items Not Available (throws error)", () => {
  const invalidMenuItems: MenuItem[] = [
    {
      menuItemId: menuItemId("item-999"),
      name: "Invalid Item",
      price: "99.00",
    },
  ];

  const command: PlaceOrderCommand = {
    kind: "PlaceOrderCommand",
    restaurantId: restaurantId("restaurant-1"),
    orderId: orderId("order-1"),
    menuItems: invalidMenuItems,
  };

  DeciderEventSourcedSpec.for(placeOrderDecider)
    .given([
      {
        kind: "RestaurantCreatedEvent",
        restaurantId: restaurantId("restaurant-1"),
        name: "Italian Bistro",
        menu: testMenu,
        final: false,
        tagFields: ["restaurantId"],
      },
    ])
    .when(command)
    .thenThrows((error) => error instanceof MenuItemsNotAvailableError);
});

Deno.test("Place Order - After Menu Change", () => {
  const newMenu: RestaurantMenu = {
    menuId: restaurantMenuId("menu-2"),
    cuisine: "MEXICAN",
    menuItems: [
      { menuItemId: menuItemId("item-3"), name: "Tacos", price: "8.00" },
    ],
  };

  const command: PlaceOrderCommand = {
    kind: "PlaceOrderCommand",
    restaurantId: restaurantId("restaurant-1"),
    orderId: orderId("order-1"),
    menuItems: [{
      menuItemId: menuItemId("item-3"),
      name: "Tacos",
      price: "8.00",
    }],
  };

  DeciderEventSourcedSpec.for(placeOrderDecider)
    .given([
      {
        kind: "RestaurantCreatedEvent",
        restaurantId: restaurantId("restaurant-1"),
        name: "Italian Bistro",
        menu: testMenu,
        final: false,
        tagFields: ["restaurantId"],
      },
      {
        kind: "RestaurantMenuChangedEvent",
        restaurantId: restaurantId("restaurant-1"),
        menu: newMenu,
        final: false,
        tagFields: ["restaurantId"],
      },
    ])
    .when(command)
    .then([
      {
        kind: "RestaurantOrderPlacedEvent",
        restaurantId: restaurantId("restaurant-1"),
        orderId: orderId("order-1"),
        menuItems: [{
          menuItemId: menuItemId("item-3"),
          name: "Tacos",
          price: "8.00",
        }],
        final: false,
        tagFields: ["restaurantId", "orderId"],
      },
    ]);
});
