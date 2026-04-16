/**
 * Event loader and query handler for the restaurant view (aggregate pattern).
 *
 * Provides on-demand restaurant state projection by loading
 * RestaurantCreatedEvent, RestaurantMenuChangedEvent, and RestaurantOrderPlacedEvent
 * via query tuples and folding them through the restaurant view.
 */

import { DenoKvEventLoader } from "../../denoKvEventRepository.ts";
import { EventSourcedQueryHandler } from "../../application.ts";
import { restaurantView } from "./restaurantView.ts";
import type { RestaurantEvent } from "./api.ts";

/**
 * Creates an `EventSourcedQueryHandler` for the restaurant view.
 *
 * @param kv - Deno KV instance for storage
 * @returns Query handler that projects restaurant state on demand
 */
export const restaurantViewQueryHandler = (kv: Deno.Kv) =>
  new EventSourcedQueryHandler(
    restaurantView,
    new DenoKvEventLoader<RestaurantEvent>(kv),
  );
