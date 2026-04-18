import { ViewSpecification } from "../../test_specification_deno.ts";
import { restaurantView } from "./restaurantView.ts";
import {
  menuItemId,
  orderId,
  restaurantId,
  type RestaurantMenu,
  restaurantMenuId,
} from "./api.ts";

const testMenu: RestaurantMenu = {
  menuId: restaurantMenuId("menu-1"),
  cuisine: "ITALIAN",
  menuItems: [
    { menuItemId: menuItemId("item-1"), name: "Pizza", price: "10.00" },
    { menuItemId: menuItemId("item-2"), name: "Pasta", price: "12.00" },
  ],
};

Deno.test("Restaurant View - Restaurant Created Event", () => {
  ViewSpecification.for(restaurantView)
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
    .then({
      restaurantId: restaurantId("restaurant-1"),
      name: "Italian Bistro",
      menu: testMenu,
    });
});

Deno.test("Restaurant View - Restaurant Menu Changed Event", () => {
  const newMenu: RestaurantMenu = {
    menuId: restaurantMenuId("menu-2"),
    cuisine: "MEXICAN",
    menuItems: [
      { menuItemId: menuItemId("item-3"), name: "Tacos", price: "8.00" },
    ],
  };

  ViewSpecification.for(restaurantView)
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
      {
        decider: "Restaurant",
        kind: "RestaurantMenuChangedEvent",
        restaurantId: restaurantId("restaurant-1"),
        menu: newMenu,
        final: false,
        tagFields: ["restaurantId"],
      },
    ])
    .then({
      restaurantId: restaurantId("restaurant-1"),
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
        restaurantId: restaurantId("restaurant-1"),
        name: "Italian Bistro",
        menu: testMenu,
        final: false,
        tagFields: ["restaurantId"],
      },
      {
        decider: "Restaurant",
        kind: "RestaurantOrderPlacedEvent",
        restaurantId: restaurantId("restaurant-1"),
        orderId: orderId("order-1"),
        menuItems: [{
          menuItemId: menuItemId("item-1"),
          name: "Pizza",
          price: "10.00",
        }],
        final: false,
        tagFields: ["restaurantId"],
      },
    ])
    .then({
      restaurantId: restaurantId("restaurant-1"),
      name: "Italian Bistro",
      menu: testMenu,
    });
});

Deno.test("Restaurant View - Menu Changed Event with Null State", () => {
  const newMenu: RestaurantMenu = {
    menuId: restaurantMenuId("menu-2"),
    cuisine: "MEXICAN",
    menuItems: [
      { menuItemId: menuItemId("item-3"), name: "Tacos", price: "8.00" },
    ],
  };

  ViewSpecification.for(restaurantView)
    .given([
      {
        decider: "Restaurant",
        kind: "RestaurantMenuChangedEvent",
        restaurantId: restaurantId("restaurant-1"),
        menu: newMenu,
        final: false,
        tagFields: ["restaurantId"],
      },
    ])
    .then(null);
});
