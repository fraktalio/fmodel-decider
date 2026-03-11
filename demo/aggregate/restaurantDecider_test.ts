import { DeciderEventSourcedSpec } from "../../test_specification.ts";
import { restaurantDecider } from "./restaurantDecider.ts";
import {
  type ChangeRestaurantMenuCommand,
  type CreateRestaurantCommand,
  type MenuItem,
  menuItemId,
  orderId,
  type PlaceOrderCommand,
  RestaurantAlreadyExistsError,
  restaurantId,
  type RestaurantMenu,
  restaurantMenuId,
  RestaurantNotFoundError,
} from "./api.ts";

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

Deno.test("Restaurant Decider - Create Restaurant Success", () => {
  const command: CreateRestaurantCommand = {
    decider: "Restaurant",
    kind: "CreateRestaurantCommand",
    restaurantId: restaurantId("restaurant-1"),
    name: "Italian Bistro",
    menu: testMenu,
  };

  DeciderEventSourcedSpec.for(restaurantDecider)
    .given([])
    .when(command)
    .then([
      {
        decider: "Restaurant",
        kind: "RestaurantCreatedEvent",
        restaurantId: restaurantId("restaurant-1"),
        name: "Italian Bistro",
        menu: testMenu,
        final: false,
        tagFields: ["restaurantId"],
      },
    ]);
});

Deno.test("Restaurant Decider - Create Restaurant Already Exists", () => {
  const command: CreateRestaurantCommand = {
    decider: "Restaurant",
    kind: "CreateRestaurantCommand",
    restaurantId: restaurantId("restaurant-1"),
    name: "Italian Bistro",
    menu: testMenu,
  };

  DeciderEventSourcedSpec.for(restaurantDecider)
    .given([
      {
        decider: "Restaurant",
        kind: "RestaurantCreatedEvent",
        restaurantId: restaurantId("restaurant-1"),
        name: "Existing Restaurant",
        menu: testMenu,
        final: false,
        tagFields: ["restaurantId"],
      },
    ])
    .when(command)
    .thenThrows((error) => error instanceof RestaurantAlreadyExistsError);
});

Deno.test("Restaurant Decider - Change Menu Success", () => {
  const newMenu: RestaurantMenu = {
    menuId: restaurantMenuId("menu-2"),
    cuisine: "MEXICAN",
    menuItems: [
      { menuItemId: menuItemId("item-3"), name: "Tacos", price: "8.00" },
    ],
  };

  const command: ChangeRestaurantMenuCommand = {
    decider: "Restaurant",
    kind: "ChangeRestaurantMenuCommand",
    restaurantId: restaurantId("restaurant-1"),
    menu: newMenu,
  };

  DeciderEventSourcedSpec.for(restaurantDecider)
    .given([
      {
        decider: "Restaurant",
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
        decider: "Restaurant",
        kind: "RestaurantMenuChangedEvent",
        restaurantId: restaurantId("restaurant-1"),
        menu: newMenu,
        final: false,
        tagFields: ["restaurantId"],
      },
    ]);
});

Deno.test("Restaurant Decider - Change Menu Restaurant Does Not Exist", () => {
  const command: ChangeRestaurantMenuCommand = {
    decider: "Restaurant",
    kind: "ChangeRestaurantMenuCommand",
    restaurantId: restaurantId("restaurant-1"),
    menu: testMenu,
  };

  DeciderEventSourcedSpec.for(restaurantDecider)
    .given([])
    .when(command)
    .thenThrows((error) => error instanceof RestaurantNotFoundError);
});

Deno.test("Restaurant Decider - Place Order Success", () => {
  const command: PlaceOrderCommand = {
    decider: "Restaurant",
    kind: "PlaceOrderCommand",
    restaurantId: restaurantId("restaurant-1"),
    orderId: orderId("order-1"),
    menuItems: testMenuItems,
  };

  DeciderEventSourcedSpec.for(restaurantDecider)
    .given([
      {
        decider: "Restaurant",
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
        decider: "Restaurant",
        kind: "RestaurantOrderPlacedEvent",
        restaurantId: restaurantId("restaurant-1"),
        orderId: orderId("order-1"),
        menuItems: testMenuItems,
        final: false,
        tagFields: ["restaurantId"],
      },
    ]);
});

Deno.test("Restaurant Decider - Place Order Restaurant Does Not Exist", () => {
  const command: PlaceOrderCommand = {
    decider: "Restaurant",
    kind: "PlaceOrderCommand",
    restaurantId: restaurantId("restaurant-1"),
    orderId: orderId("order-1"),
    menuItems: testMenuItems,
  };

  DeciderEventSourcedSpec.for(restaurantDecider)
    .given([])
    .when(command)
    .thenThrows((error) => error instanceof RestaurantNotFoundError);
});
