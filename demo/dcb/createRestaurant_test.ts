import { DeciderEventSourcedSpec } from "../../test_specification.ts";
import { crateRestaurantDecider } from "./createRestaurant.ts";
import type { CreateRestaurantCommand, RestaurantMenu } from "./api.ts";

// Test data
const testMenu: RestaurantMenu = {
  menuId: "menu-1",
  cuisine: "ITALIAN",
  menuItems: [
    { menuItemId: "item-1", name: "Pizza", price: "10.00" },
    { menuItemId: "item-2", name: "Pasta", price: "12.00" },
  ],
};

Deno.test("Create Restaurant - Success", () => {
  const command: CreateRestaurantCommand = {
    kind: "CreateRestaurantCommand",
    id: "restaurant-1",
    name: "Italian Bistro",
    menu: testMenu,
  };

  DeciderEventSourcedSpec.for(crateRestaurantDecider)
    .given([])
    .when(command)
    .then([
      {
        kind: "RestaurantCreatedEvent",
        restaurantId: "restaurant-1",
        name: "Italian Bistro",
        menu: testMenu,
        final: false,
      },
    ]);
});

Deno.test("Create Restaurant - Already Exists (throws error)", () => {
  const command: CreateRestaurantCommand = {
    kind: "CreateRestaurantCommand",
    id: "restaurant-1",
    name: "Italian Bistro",
    menu: testMenu,
  };

  DeciderEventSourcedSpec.for(crateRestaurantDecider)
    .given([
      {
        kind: "RestaurantCreatedEvent",
        restaurantId: "restaurant-1",
        name: "Existing Restaurant",
        menu: testMenu,
        final: false,
      },
    ])
    .when(command)
    .thenThrows((error) => error.message === "Restaurant already exist!");
});
