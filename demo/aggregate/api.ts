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

// ###########################################################################
// ########################### Restaurant ####################################
// ###########################################################################

// ########################## STATE & VIEW ###################################

export type Restaurant = {
  readonly restaurantId: RestaurantId;
  readonly name: RestaurantName;
  readonly menu: RestaurantMenu;
};

export type RestaurantView = {
  readonly restaurantId: RestaurantId;
  readonly name: RestaurantName;
  readonly menu: RestaurantMenu;
};

// ########################## API (COMMANDS) #################################

export type RestaurantCommand =
  | CreateRestaurantCommand
  | ChangeRestaurantMenuCommand
  | PlaceOrderCommand;

export type CreateRestaurantCommand = {
  readonly decider: "Restaurant";
  readonly kind: "CreateRestaurantCommand";
  readonly id: RestaurantId;
  readonly name: RestaurantName;
  readonly menu: RestaurantMenu;
};

export type ChangeRestaurantMenuCommand = {
  readonly decider: "Restaurant";
  readonly kind: "ChangeRestaurantMenuCommand";
  readonly id: RestaurantId;
  readonly menu: RestaurantMenu;
};

export type PlaceOrderCommand = {
  readonly decider: "Restaurant";
  readonly kind: "PlaceOrderCommand";
  readonly id: RestaurantId;
  readonly orderId: OrderId;
  readonly menuItems: MenuItem[];
};

// ########################### API (EVENTS) ##################################

export type RestaurantEvent =
  | RestaurantCreatedEvent
  | RestaurantMenuChangedEvent
  | RestaurantOrderPlacedEvent;

export type RestaurantCreatedEvent = {
  readonly decider: "Restaurant";
  readonly kind: "RestaurantCreatedEvent";
  readonly id: RestaurantId;
  readonly name: RestaurantName;
  readonly menu: RestaurantMenu;
  readonly final: boolean;
};

export type RestaurantMenuChangedEvent = {
  readonly decider: "Restaurant";
  readonly kind: "RestaurantMenuChangedEvent";
  readonly id: RestaurantId;
  readonly menu: RestaurantMenu;
  readonly final: boolean;
};

export type RestaurantOrderPlacedEvent = {
  readonly decider: "Restaurant";
  readonly kind: "RestaurantOrderPlacedEvent";
  readonly id: RestaurantId;
  readonly orderId: OrderId;
  readonly menuItems: MenuItem[];
  readonly final: boolean;
};

// ###########################################################################
// ############################## Order ######################################
// ###########################################################################

// ########################## STATE & VIEW ###################################

export type Order = {
  readonly orderId: OrderId;
  readonly restaurantId: RestaurantId;
  readonly menuItems: MenuItem[];
  readonly status: OrderStatus;
};

export type OrderView = {
  readonly orderId: OrderId;
  readonly restaurantId: RestaurantId;
  readonly menuItems: MenuItem[];
  readonly status: OrderStatus;
};

// ########################## API (COMMANDS) #################################

export type OrderCommand = CreateOrderCommand | MarkOrderAsPreparedCommand;

export type CreateOrderCommand = {
  readonly decider: "Order";
  readonly kind: "CreateOrderCommand";
  readonly id: OrderId;
  readonly restaurantId: RestaurantId;
  readonly menuItems: MenuItem[];
};

export type MarkOrderAsPreparedCommand = {
  readonly decider: "Order";
  readonly kind: "MarkOrderAsPreparedCommand";
  readonly id: OrderId;
};

// ########################### API (EVENTS) ##################################

export type OrderEvent =
  | OrderCreatedEvent
  | OrderPreparedEvent;

export type OrderCreatedEvent = {
  readonly version: number;
  readonly decider: "Order";
  readonly kind: "OrderCreatedEvent";
  readonly id: OrderId;
  readonly restaurantId: RestaurantId;
  readonly menuItems: MenuItem[];
  readonly final: boolean;
};

export type OrderPreparedEvent = {
  readonly version: number;
  readonly decider: "Order";
  readonly kind: "OrderPreparedEvent";
  readonly id: OrderId;
  readonly final: boolean;
};

// All variants of commands
export type Command = RestaurantCommand | OrderCommand;
// All variants of events
export type Event = RestaurantEvent | OrderEvent;
