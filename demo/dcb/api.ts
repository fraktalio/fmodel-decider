// Be precise and explicit about the types
export type RestaurantId = string;
export type OrderId = string;
export type MenuItemId = string;
export type RestaurantName = string;
export type RestaurantMenuId = string;
export type MenuItemName = string;
export type MenuItemPrice = string;
export type OrderStatus = "NOT_CREATED" | "CREATED" | "PREPARED";
export type Reason =
  | "Restaurant already exist!"
  | "Restaurant does not exist!"
  | "Order already exist!"
  | "Order does not exist!";

export type RestaurantMenuCuisine =
  | "GENERAL"
  | "SERBIAN"
  | "ITALIAN"
  | "MEXICAN"
  | "CHINESE"
  | "INDIAN"
  | "FRENCH";

export type MenuItem = {
  readonly menuItemId: MenuItemId;
  readonly name: MenuItemName;
  readonly price: MenuItemPrice;
};

export type RestaurantMenu = {
  readonly menuItems: MenuItem[];
  readonly menuId: RestaurantMenuId;
  readonly cuisine: RestaurantMenuCuisine;
};

// ########################## API (COMMANDS) #################################

export type Command =
  | CreateRestaurantCommand
  | ChangeRestaurantMenuCommand
  | PlaceOrderCommand
  | CreateOrderCommand
  | MarkOrderAsPreparedCommand;

export type CreateRestaurantCommand = {
  readonly kind: "CreateRestaurantCommand";
  readonly id: RestaurantId;
  readonly name: RestaurantName;
  readonly menu: RestaurantMenu;
};

export type ChangeRestaurantMenuCommand = {
  readonly kind: "ChangeRestaurantMenuCommand";
  readonly id: RestaurantId;
  readonly menu: RestaurantMenu;
};

export type PlaceOrderCommand = {
  readonly kind: "PlaceOrderCommand";
  readonly id: RestaurantId;
  readonly orderId: OrderId;
  readonly menuItems: MenuItem[];
};

export type CreateOrderCommand = {
  readonly kind: "CreateOrderCommand";
  readonly id: OrderId;
  readonly restaurantId: RestaurantId;
  readonly menuItems: MenuItem[];
};

export type MarkOrderAsPreparedCommand = {
  readonly kind: "MarkOrderAsPreparedCommand";
  readonly id: OrderId;
};

// ########################### API (EVENTS) ##################################

export type Event =
  | RestaurantCreatedEvent
  | RestaurantMenuChangedEvent
  | RestaurantOrderPlacedEvent
  | OrderPreparedEvent;

export type RestaurantCreatedEvent = {
  readonly kind: "RestaurantCreatedEvent";
  readonly restaurantId: RestaurantId;
  readonly name: RestaurantName;
  readonly menu: RestaurantMenu;
  readonly final: boolean;
};

export type RestaurantMenuChangedEvent = {
  readonly kind: "RestaurantMenuChangedEvent";
  readonly restaurantId: RestaurantId;
  readonly menu: RestaurantMenu;
  readonly final: boolean;
};

export type RestaurantOrderPlacedEvent = {
  readonly kind: "RestaurantOrderPlacedEvent";
  readonly restaurantId: RestaurantId;
  readonly orderId: OrderId;
  readonly menuItems: MenuItem[];
  readonly final: boolean;
};

export type OrderPreparedEvent = {
  readonly kind: "OrderPreparedEvent";
  readonly orderId: OrderId;
  readonly final: boolean;
};
