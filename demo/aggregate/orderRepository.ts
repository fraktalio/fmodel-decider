/**
 * Repository for Order aggregate.
 *
 * Handles order commands by persisting OrderEvent
 * to Deno KV storage with optimistic locking.
 */

import {
  DenoKvEventSourcedRepository,
  type EventMetadata,
} from "../../denoKvRepository.ts";
import type { OrderCommand, OrderEvent } from "./api.ts";

/**
 * Repository for Order aggregate.
 *
 * **Query Pattern:**
 * Loads events using tuples:
 * - `[(orderId, "OrderCreatedEvent")]`
 * - `[(orderId, "OrderPreparedEvent")]`
 */
export class OrderRepository {
  private readonly repository: DenoKvEventSourcedRepository<
    OrderCommand,
    OrderEvent,
    OrderEvent
  >;

  /**
   * Creates a new OrderRepository.
   *
   * @param kv - Deno KV instance for storage
   */
  constructor(kv: Deno.Kv) {
    this.repository = new DenoKvEventSourcedRepository(
      kv,
      (cmd) => [
        ["orderId:" + cmd.orderId, "OrderCreatedEvent"],
        ["orderId:" + cmd.orderId, "OrderPreparedEvent"],
      ],
    );
  }

  /**
   * Executes a command.
   *
   * @param command - The command to execute
   * @returns Newly created OrderEvent with metadata
   * @throws Error if order validation fails
   * @throws OptimisticLockingError if concurrent modification detected
   */
  async execute(
    command: OrderCommand,
  ): Promise<readonly (OrderEvent & EventMetadata)[]> {
    const { orderDecider } = await import("./orderDecider.ts");
    return this.repository.execute(command, orderDecider);
  }
}
