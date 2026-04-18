import { DeciderEventSourcedSpec } from "../../test_specification_deno.ts";
import { createRestaurantDecider } from "./createRestaurantDecider.ts";
import {
  type CreateRestaurantCommand,
  menuItemId,
  RestaurantAlreadyExistsError,
  restaurantId,
  type RestaurantMenu,
  restaurantMenuId,
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

Deno.test("Create Restaurant - Success", () => {
  const command: CreateRestaurantCommand = {
    kind: "CreateRestaurantCommand",
    restaurantId: restaurantId("restaurant-1"),
    name: "Italian Bistro",
    menu: testMenu,
  };

  DeciderEventSourcedSpec.for(createRestaurantDecider)
    .given([])
    .when(command)
    .then([
      {
        kind: "RestaurantCreatedEvent",
        restaurantId: restaurantId("restaurant-1"),
        name: "Italian Bistro",
        menu: testMenu,
        final: false,
        tagFields: ["restaurantId"],
      },
    ]);
});

Deno.test("Create Restaurant - Already Exists (throws error)", () => {
  const command: CreateRestaurantCommand = {
    kind: "CreateRestaurantCommand",
    restaurantId: restaurantId("restaurant-1"),
    name: "Italian Bistro",
    menu: testMenu,
  };

  DeciderEventSourcedSpec.for(createRestaurantDecider)
    .given([
      {
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
