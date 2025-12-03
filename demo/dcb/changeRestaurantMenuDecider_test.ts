import { DeciderEventSourcedSpec } from "../../test_specification.ts";
import { changeRestaurantManuDecider } from "./changeRestaurantMenuDecider.ts";
import type { ChangeRestaurantMenuCommand, RestaurantMenu } from "./api.ts";

// Test data
const testMenu: RestaurantMenu = {
  menuId: "menu-1",
  cuisine: "ITALIAN",
  menuItems: [
    { menuItemId: "item-1", name: "Pizza", price: "10.00" },
    { menuItemId: "item-2", name: "Pasta", price: "12.00" },
  ],
};

Deno.test("Change Restaurant Menu - Success", () => {
  const newMenu: RestaurantMenu = {
    menuId: "menu-2",
    cuisine: "MEXICAN",
    menuItems: [
      { menuItemId: "item-3", name: "Tacos", price: "8.00" },
    ],
  };

  const command: ChangeRestaurantMenuCommand = {
    kind: "ChangeRestaurantMenuCommand",
    id: "restaurant-1",
    menu: newMenu,
  };

  DeciderEventSourcedSpec.for(changeRestaurantManuDecider)
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
        kind: "RestaurantMenuChangedEvent",
        restaurantId: "restaurant-1",
        menu: newMenu,
        final: false,
      },
    ]);
});

Deno.test("Change Restaurant Menu - Restaurant Does Not Exist (throws error)", () => {
  const command: ChangeRestaurantMenuCommand = {
    kind: "ChangeRestaurantMenuCommand",
    id: "restaurant-1",
    menu: testMenu,
  };

  DeciderEventSourcedSpec.for(changeRestaurantManuDecider)
    .given([])
    .when(command)
    .thenThrows((error) => error.message === "Restaurant does not exist!");
});
