import type {
  IEventComputation,
  IStateComputation,
} from "./decider.ts";
import type { IProjection } from "./view.ts";

/**
 * Repository interface for event-sourced command processing.
 *
 * @remarks
 * This repository handles commands by using a decider to compute new events from the event stream,
 * then persisting those events. It supports the event-sourced computation pattern where state is
 * derived by replaying all historical events.
 *
 * @typeParam C - Command type representing the intent to be processed
 * @typeParam Ei - Input event type consumed by the decider for state evolution
 * @typeParam Eo - Output event type produced by the decider and persisted
 * @typeParam CM - Command metadata type (e.g., correlation ID, user context)
 * @typeParam EM - Event metadata type (e.g., timestamp, version, causation ID)
 */
export interface IEventRepository<C, Ei, Eo, CM, EM> {
  /**
   * Executes a command by loading events, computing new events via the decider, and persisting them.
   *
   * @param command - The command with metadata to execute
   * @param decider - The decider that computes new events from the command and event history
   * @returns A promise resolving to the newly produced events with their metadata
   */
  readonly execute: (
    command: C & CM,
    decider: IEventComputation<C, Ei, Eo>,
  ) => Promise<readonly (Eo & EM)[]>;
}

/**
 * Repository interface for state-stored command processing.
 *
 * @remarks
 * This repository handles commands by using an aggregate decider to compute the new state directly
 * from the current state, then persisting that state. It supports the state-stored computation pattern
 * where state is loaded, modified, and saved without replaying events.
 *
 * @typeParam C - Command type representing the intent to be processed
 * @typeParam S - State type representing the aggregate's internal state
 * @typeParam CM - Command metadata type (e.g., correlation ID, user context)
 * @typeParam SM - State metadata type (e.g., version, timestamp)
 */
export interface IStateRepository<C, S, CM, SM> {
  /**
   * Executes a command by loading state, computing new state via the decider, and persisting it.
   *
   * @param command - The command with metadata to execute
   * @param decider - The aggregate decider that computes new state from the command and current state
   * @returns A promise resolving to the new state with its metadata
   */
  readonly execute: (
    command: C & CM,
    decider: IStateComputation<C, S>,
  ) => Promise<S & SM>;
}

/**
 * Command handler for event-sourced aggregates.
 *
 * @remarks
 * This handler coordinates between a decider and an event repository to process commands
 * in an event-sourced architecture. It encapsulates the decider and repository, providing
 * a simple `handle` method for command execution.
 *
 * The handler delegates to the repository which:
 * 1. Loads the event stream for the aggregate
 * 2. Uses the decider to compute new events from the command
 * 3. Persists the new events with metadata
 *
 * **Decider compatibility:**
 * - Can use `IDcbDecider<C, S, Ei, Eo>` (implements `IEventComputation<C, Ei, Eo>`) for dynamic consistency boundaries
 * - Can use `IAggregateDecider<C, S, E>` (implements `IEventComputation<C, E, E>`) for traditional aggregates
 *
 * @typeParam C - Command type representing the intent to be processed
 * @typeParam Ei - Input event type consumed by the decider
 * @typeParam Eo - Output event type produced by the decider
 * @typeParam CM - Command metadata type
 * @typeParam EM - Event metadata type
 */
export class EventSourcedCommandHandler<C, Ei, Eo, CM, EM> {
  constructor(
    private readonly decider: IEventComputation<C, Ei, Eo>,
    private readonly eventRepository: IEventRepository<C, Ei, Eo, CM, EM>,
  ) {}

  /**
   * Handles a command by executing it through the event repository.
   *
   * @param command - The command with metadata to handle
   * @returns A promise resolving to the newly produced events with their metadata
   */
  handle(command: C & CM): Promise<readonly (Eo & EM)[]> {
    return this.eventRepository.execute(command, this.decider);
  }
}

/**
 * Command handler for state-stored aggregates.
 *
 * @remarks
 * This handler coordinates between an aggregate decider and a state repository to process
 * commands in a state-stored architecture. It encapsulates the decider and repository,
 * providing a simple `handle` method for command execution.
 *
 * The handler delegates to the repository which:
 * 1. Loads the current state of the aggregate
 * 2. Uses the decider to compute the new state from the command
 * 3. Persists the new state with metadata
 *
 * **Decider compatibility:**
 * - Can ONLY use `IAggregateDecider<C, S, E>` (implements `IStateComputation<C, S>`)
 * - Cannot use `IDcbDecider` (lacks state-stored computation capability)
 *
 * @typeParam C - Command type representing the intent to be processed
 * @typeParam S - State type representing the aggregate's internal state
 * @typeParam CM - Command metadata type
 * @typeParam SM - State metadata type
 */
export class StateStoredCommandHandler<C, S, CM, SM> {
  constructor(
    private readonly decider: IStateComputation<C, S>,
    private readonly stateRepository: IStateRepository<C, S, CM, SM>,
  ) {}

  /**
   * Handles a command by executing it through the state repository.
   *
   * @param command - The command with metadata to handle
   * @returns A promise resolving to the new state with its metadata
   */
  handle(command: C & CM): Promise<S & SM> {
    return this.stateRepository.execute(command, this.decider);
  }
}

/**
 * Repository interface for view state management.
 *
 * @remarks
 * This repository handles events by using a view/projection to evolve state from events,
 * then persisting the updated state. It supports the read-side projection pattern where
 * views materialize state from event streams.
 *
 * The repository:
 * 1. Loads the current view state
 * 2. Uses the projection to evolve state from the event
 * 3. Persists the updated state with metadata
 *
 * @typeParam E - Event type representing domain events to be projected
 * @typeParam S - State type representing the view's materialized state
 * @typeParam EM - Event metadata type (e.g., timestamp, position, causation ID)
 * @typeParam SM - State metadata type (e.g., version, last updated timestamp)
 */
export interface IViewStateRepository<E, S, EM, SM> {
  /**
   * Executes event projection by loading state, evolving it via the view, and persisting it.
   *
   * @param event - The event with metadata to project
   * @param view - The projection that evolves state from events
   * @returns A promise resolving to the updated state with its metadata
   */
  readonly execute: (
    event: E & EM,
    view: IProjection<S, E>,
  ) => Promise<S & SM>;
}

/**
 * Event handler for view projections.
 *
 * @remarks
 * This handler coordinates between a view/projection and a view state repository to process
 * events and materialize read-side state. It encapsulates the view and repository, providing
 * a simple `handle` method for event processing.
 *
 * The handler delegates to the repository which:
 * 1. Loads the current view state
 * 2. Uses the projection to evolve state from the event
 * 3. Persists the updated state with metadata
 *
 * **View compatibility:**
 * - Works with `IProjection<S, E>` (constrains `Si = So = S`)
 * - Suitable for read models, query models, and materialized views
 *
 * @typeParam E - Event type representing domain events to be projected
 * @typeParam S - State type representing the view's materialized state
 * @typeParam EM - Event metadata type
 * @typeParam SM - State metadata type
 */
export class EventHandler<E, S, EM, SM> {
  constructor(
    private readonly view: IProjection<S, E>,
    private readonly viewStateRepository: IViewStateRepository<E, S, EM, SM>,
  ) {}

  /**
   * Handles an event by executing it through the view state repository.
   *
   * @param event - The event with metadata to handle
   * @returns A promise resolving to the updated state with its metadata
   */
  handle(event: E & EM): Promise<S & SM> {
    return this.viewStateRepository.execute(event, this.view);
  }
}
