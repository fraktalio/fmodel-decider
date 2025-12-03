import { DeciderEventSourcedSpec } from "../../test_specification.ts";
import { restaurantDecider } from "./restaurantDecider.ts";
import type {
  ChangeRestaurantMenuCommand,
  CreateRestaurantCommand,
  MenuItem,
  PlaceOrderCommand,
  RestaurantMenu,
} from "./api.ts";

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

Deno.test("Restaurant Decider - Create Restaurant Success", () => {
  const command: CreateRestaurantCommand = {
    decider: "Restaurant",
    kind: "CreateRestaurantCommand",
    id: "restaurant-1",
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
        id: "restaurant-1",
        name: "Italian Bistro",
        menu: testMenu,
        final: false,
      },
    ]);
});

Deno.test("Restaurant Decider - Create Restaurant Already Exists", () => {
  const command: CreateRestaurantCommand = {
    decider: "Restaurant",
    kind: "CreateRestaurantCommand",
    id: "restaurant-1",
    name: "Italian Bistro",
    menu: testMenu,
  };

  DeciderEventSourcedSpec.for(restaurantDecider)
    .given([
      {
        decider: "Restaurant",
        kind: "RestaurantCreatedEvent",
        id: "restaurant-1",
        name: "Existing Restaurant",
        menu: testMenu,
        final: false,
      },
    ])
    .when(command)
    .thenThrows((error) => error.message === "Restaurant already exist!");
});

Deno.test("Restaurant Decider - Change Menu Success", () => {
  const newMenu: RestaurantMenu = {
    menuId: "menu-2",
    cuisine: "MEXICAN",
    menuItems: [
      { menuItemId: "item-3", name: "Tacos", price: "8.00" },
    ],
  };

  const command: ChangeRestaurantMenuCommand = {
    decider: "Restaurant",
    kind: "ChangeRestaurantMenuCommand",
    id: "restaurant-1",
    menu: newMenu,
  };

  DeciderEventSourcedSpec.for(restaurantDecider)
    .given([
      {
        decider: "Restaurant",
        kind: "RestaurantCreatedEvent",
        id: "restaurant-1",
        name: "Italian Bistro",
        menu: testMenu,
        final: false,
      },
    ])
    .when(command)
    .then([
      {
        decider: "Restaurant",
        kind: "RestaurantMenuChangedEvent",
        id: "restaurant-1",
        menu: newMenu,
        final: false,
      },
    ]);
});

Deno.test("Restaurant Decider - Change Menu Restaurant Does Not Exist", () => {
  const command: ChangeRestaurantMenuCommand = {
    decider: "Restaurant",
    kind: "ChangeRestaurantMenuCommand",
    id: "restaurant-1",
    menu: testMenu,
  };

  DeciderEventSourcedSpec.for(restaurantDecider)
    .given([])
    .when(command)
    .thenThrows((error) => error.message === "Restaurant does not exist!");
});

Deno.test("Restaurant Decider - Place Order Success", () => {
  const command: PlaceOrderCommand = {
    decider: "Restaurant",
    kind: "PlaceOrderCommand",
    id: "restaurant-1",
    orderId: "order-1",
    menuItems: testMenuItems,
  };

  DeciderEventSourcedSpec.for(restaurantDecider)
    .given([
      {
        decider: "Restaurant",
        kind: "RestaurantCreatedEvent",
        id: "restaurant-1",
        name: "Italian Bistro",
        menu: testMenu,
        final: false,
      },
    ])
    .when(command)
    .then([
      {
        decider: "Restaurant",
        kind: "RestaurantOrderPlacedEvent",
        id: "restaurant-1",
        orderId: "order-1",
        menuItems: testMenuItems,
        final: false,
      },
    ]);
});

Deno.test("Restaurant Decider - Place Order Restaurant Does Not Exist", () => {
  const command: PlaceOrderCommand = {
    decider: "Restaurant",
    kind: "PlaceOrderCommand",
    id: "restaurant-1",
    orderId: "order-1",
    menuItems: testMenuItems,
  };

  DeciderEventSourcedSpec.for(restaurantDecider)
    .given([])
    .when(command)
    .thenThrows((error) => error.message === "Restaurant does not exist!");
});
