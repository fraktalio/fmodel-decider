/**
 * Event loader and query handler for the restaurant view.
 *
 * Provides on-demand restaurant state projection by loading
 * RestaurantCreatedEvent and RestaurantMenuChangedEvent via query tuples
 * and folding them through the restaurant view.
 */

import { DenoKvEventLoader } from "../../denoKvEventLoader.ts";
import { EventSourcedQueryHandler } from "../../application.ts";
import { type RestaurantEvent, restaurantView } from "./restaurantView.ts";

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
