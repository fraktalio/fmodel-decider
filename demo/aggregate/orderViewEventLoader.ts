/**
 * Event loader and query handler for the order view (aggregate pattern).
 *
 * Provides on-demand order state projection by loading
 * OrderCreatedEvent and OrderPreparedEvent via query tuples
 * and folding them through the order view.
 */

import { DenoKvEventLoader } from "../../denoKvEventRepository.ts";
import { EventSourcedQueryHandler } from "../../application.ts";
import { orderView } from "./orderView.ts";
import type { OrderEvent } from "./api.ts";

/**
 * Creates an `EventSourcedQueryHandler` for the order view.
 *
 * @param kv - Deno KV instance for storage
 * @returns Query handler that projects order state on demand
 */
export const orderViewQueryHandler = (kv: Deno.Kv) =>
  new EventSourcedQueryHandler(
    orderView,
    new DenoKvEventLoader<OrderEvent>(kv),
  );
