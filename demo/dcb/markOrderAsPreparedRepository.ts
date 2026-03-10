/**
 * Repository for MarkOrderAsPrepared decider.
 *
 * Handles order preparation commands by persisting OrderPreparedEvent
 * to Deno KV storage with optimistic locking.
 *
 * This repository queries events by order ID to check if the order exists
 * and whether it has already been prepared.
 */

import {
  DenoKvEventSourcedRepository,
  type EventMetadata,
} from "../../denoKvRepository.ts";
import type {
  MarkOrderAsPreparedCommand,
  OrderPreparedEvent,
  RestaurantOrderPlacedEvent,
} from "./api.ts";

/**
 * Repository for MarkOrderAsPrepared decider.
 *
 * **Query Pattern:**
 * Loads events using tuples:
 * - `[(orderId, "RestaurantOrderPlacedEvent")]` - Check if order exists
 * - `[(orderId, "OrderPreparedEvent")]` - Check if order already prepared
 *
 * **Indexing Strategy:**
 * OrderPreparedEvent is indexed by order ID (primary).
 */
export class MarkOrderAsPreparedRepository {
  private readonly repository: DenoKvEventSourcedRepository<
    MarkOrderAsPreparedCommand,
    RestaurantOrderPlacedEvent | OrderPreparedEvent,
    OrderPreparedEvent
  >;

  /**
   * Creates a new MarkOrderAsPreparedRepository.
   *
   * @param kv - Deno KV instance for storage
   */
  constructor(kv: Deno.Kv) {
    this.repository = new DenoKvEventSourcedRepository(
      kv,
      (cmd) => [
        ["orderId:" + cmd.orderId, "RestaurantOrderPlacedEvent"], // Query by order ID to check if order exists
        ["orderId:" + cmd.orderId, "OrderPreparedEvent"], // Query by order ID to check if already prepared
      ],
    );
  }

  /**
   * Executes a command.
   *
   * @param command - The command to execute
   * @returns Newly created OrderPreparedEvent with metadata
   * @throws Error if order does not exist
   * @throws Error if order already prepared
   * @throws OptimisticLockingError if concurrent modification detected
   */
  async execute(
    command: MarkOrderAsPreparedCommand,
  ): Promise<readonly (OrderPreparedEvent & EventMetadata)[]> {
    const { markOrderAsPreparedDecider } = await import(
      "./markOrderAsPreparedDecider.ts"
    );
    return this.repository.execute(command, markOrderAsPreparedDecider);
  }
}
