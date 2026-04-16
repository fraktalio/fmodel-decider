// Branded type utility for compile-time type safety
type Brand<T, B> = T & { readonly __brand: B };

// Be precise and explicit about the types - using branded types for IDs
export type RestaurantId = Brand<string, "RestaurantId">;
export type OrderId = Brand<string, "OrderId">;
export type MenuItemId = Brand<string, "MenuItemId">;
export type RestaurantMenuId = Brand<string, "RestaurantMenuId">;

// Factory functions for creating branded IDs (use in tests and application code)
export const restaurantId = (id: string): RestaurantId => id as RestaurantId;
export const orderId = (id: string): OrderId => id as OrderId;
export const menuItemId = (id: string): MenuItemId => id as MenuItemId;
export const restaurantMenuId = (id: string): RestaurantMenuId =>
  id as RestaurantMenuId;

// ###########################################################################
// ########################### Domain Errors #################################
// ###########################################################################

/** Base class for all domain errors */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

/** Thrown when attempting to create a restaurant that already exists */
export class RestaurantAlreadyExistsError extends DomainError {
  constructor(public readonly restaurantId: RestaurantId) {
    super(`Restaurant ${restaurantId} already exists`);
  }
}

/** Thrown when a restaurant is required but not found */
export class RestaurantNotFoundError extends DomainError {
  constructor(public readonly restaurantId: RestaurantId) {
    super(`Restaurant ${restaurantId} does not exist`);
  }
}

/** Thrown when attempting to create an order that already exists */
export class OrderAlreadyExistsError extends DomainError {
  constructor(public readonly orderId: OrderId) {
    super(`Order ${orderId} already exists`);
  }
}

/** Thrown when an order is required but not found */
export class OrderNotFoundError extends DomainError {
  constructor(public readonly orderId: OrderId) {
    super(`Order ${orderId} does not exist`);
  }
}

/** Thrown when an order has already been prepared */
export class OrderAlreadyPreparedError extends DomainError {
  constructor(public readonly orderId: OrderId) {
    super(`Order ${orderId} is already prepared`);
  }
}

/** Thrown when menu items are not available */
export class MenuItemsNotAvailableError extends DomainError {
  constructor(public readonly menuItemIds: readonly MenuItemId[]) {
    super(`Menu items not available: ${menuItemIds.join(", ")}`);
  }
}

// Simple string aliases for non-ID types (no branding needed)
export type RestaurantName = string;
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
  readonly restaurantId: RestaurantId;
  readonly name: RestaurantName;
  readonly menu: RestaurantMenu;
};

export type ChangeRestaurantMenuCommand = {
  readonly decider: "Restaurant";
  readonly kind: "ChangeRestaurantMenuCommand";
  readonly restaurantId: RestaurantId;
  readonly menu: RestaurantMenu;
};

export type PlaceOrderCommand = {
  readonly decider: "Restaurant";
  readonly kind: "PlaceOrderCommand";
  readonly restaurantId: RestaurantId;
  readonly orderId: OrderId;
  readonly menuItems: MenuItem[];
};

// ########################### API (EVENTS) ##################################

import type { TypeSafeEventShape } from "../../denoKvEventRepository.ts";

export type RestaurantEvent =
  | RestaurantCreatedEvent
  | RestaurantMenuChangedEvent
  | RestaurantOrderPlacedEvent;

export type RestaurantCreatedEvent = TypeSafeEventShape<
  {
    readonly decider: "Restaurant";
    readonly kind: "RestaurantCreatedEvent";
    readonly restaurantId: RestaurantId;
    readonly name: RestaurantName;
    readonly menu: RestaurantMenu;
    readonly final: boolean;
  },
  ["restaurantId"]
>;

export type RestaurantMenuChangedEvent = TypeSafeEventShape<
  {
    readonly decider: "Restaurant";
    readonly kind: "RestaurantMenuChangedEvent";
    readonly restaurantId: RestaurantId;
    readonly menu: RestaurantMenu;
    readonly final: boolean;
  },
  ["restaurantId"]
>;

export type RestaurantOrderPlacedEvent = TypeSafeEventShape<
  {
    readonly decider: "Restaurant";
    readonly kind: "RestaurantOrderPlacedEvent";
    readonly restaurantId: RestaurantId;
    readonly orderId: OrderId;
    readonly menuItems: MenuItem[];
    readonly final: boolean;
  },
  ["restaurantId"]
>;

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
  readonly orderId: OrderId;
  readonly restaurantId: RestaurantId;
  readonly menuItems: MenuItem[];
};

export type MarkOrderAsPreparedCommand = {
  readonly decider: "Order";
  readonly kind: "MarkOrderAsPreparedCommand";
  readonly orderId: OrderId;
};

// ########################### API (EVENTS) ##################################

export type OrderEvent =
  | OrderCreatedEvent
  | OrderPreparedEvent;

export type OrderCreatedEvent = TypeSafeEventShape<
  {
    readonly version: number;
    readonly decider: "Order";
    readonly kind: "OrderCreatedEvent";
    readonly orderId: OrderId;
    readonly restaurantId: RestaurantId;
    readonly menuItems: MenuItem[];
    readonly final: boolean;
  },
  ["orderId"]
>;

export type OrderPreparedEvent = TypeSafeEventShape<
  {
    readonly version: number;
    readonly decider: "Order";
    readonly kind: "OrderPreparedEvent";
    readonly orderId: OrderId;
    readonly final: boolean;
  },
  ["orderId"]
>;

// All variants of commands
export type Command = RestaurantCommand | OrderCommand;
// All variants of events
export type Event = RestaurantEvent | OrderEvent;
