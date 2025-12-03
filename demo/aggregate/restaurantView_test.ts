import { ViewSpecification } from "../../test_specification.ts";
import { restaurantView } from "./restaurantView.ts";
import type { RestaurantMenu } from "./api.ts";

const testMenu: RestaurantMenu = {
  menuId: "menu-1",
  cuisine: "ITALIAN",
  menuItems: [
    { menuItemId: "item-1", name: "Pizza", price: "10.00" },
    { menuItemId: "item-2", name: "Pasta", price: "12.00" },
  ],
};

Deno.test("Restaurant View - Restaurant Created Event", () => {
  ViewSpecification.for(restaurantView)
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
    .then({
      restaurantId: "restaurant-1",
      name: "Italian Bistro",
      menu: testMenu,
    });
});

Deno.test("Restaurant View - Restaurant Menu Changed Event", () => {
  const newMenu: RestaurantMenu = {
    menuId: "menu-2",
    cuisine: "MEXICAN",
    menuItems: [
      { menuItemId: "item-3", name: "Tacos", price: "8.00" },
    ],
  };

  ViewSpecification.for(restaurantView)
    .given([
      {
        decider: "Restaurant",
        kind: "RestaurantCreatedEvent",
        id: "restaurant-1",
        name: "Italian Bistro",
        menu: testMenu,
        final: false,
      },
      {
        decider: "Restaurant",
        kind: "RestaurantMenuChangedEvent",
        id: "restaurant-1",
        menu: newMenu,
        final: false,
      },
    ])
    .then({
      restaurantId: "restaurant-1",
      name: "Italian Bistro",
      menu: newMenu,
    });
});

Deno.test("Restaurant View - Restaurant Order Placed Event", () => {
  ViewSpecification.for(restaurantView)
    .given([
      {
        decider: "Restaurant",
        kind: "RestaurantCreatedEvent",
        id: "restaurant-1",
        name: "Italian Bistro",
        menu: testMenu,
        final: false,
      },
      {
        decider: "Restaurant",
        kind: "RestaurantOrderPlacedEvent",
        id: "restaurant-1",
        orderId: "order-1",
        menuItems: [{ menuItemId: "item-1", name: "Pizza", price: "10.00" }],
        final: false,
      },
    ])
    .then({
      restaurantId: "restaurant-1",
      name: "Italian Bistro",
      menu: testMenu,
    });
});

Deno.test("Restaurant View - Menu Changed Event with Null State", () => {
  const newMenu: RestaurantMenu = {
    menuId: "menu-2",
    cuisine: "MEXICAN",
    menuItems: [
      { menuItemId: "item-3", name: "Tacos", price: "8.00" },
    ],
  };

  ViewSpecification.for(restaurantView)
    .given([
      {
        decider: "Restaurant",
        kind: "RestaurantMenuChangedEvent",
        id: "restaurant-1",
        menu: newMenu,
        final: false,
      },
    ])
    .then(null);
});
