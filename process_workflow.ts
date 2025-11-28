/*
 * Copyright 2025 Fraktalio D.O.O. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the
 * License. You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "
 * AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific
 * language governing permissions and limitations under the License.
 */

import type { IAggregateProcess, IDcbProcess, IProcess } from "./process.ts";
import { AggregateProcess, DcbProcess, Process } from "./process.ts";

/**
 * Represents the initiation of a workflow task.
 *
 * @remarks
 * Fixed event type for standardized workflow task management.
 * Used to signal when a task begins execution in a workflow process.
 *
 * @typeParam TaskName - Union type of valid task names for type safety
 */
export interface TaskStarted<TaskName extends string = string> {
  readonly type: "TaskStarted";
  readonly taskName: TaskName;
  readonly timestamp?: number;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Represents the completion of a workflow task.
 *
 * @remarks
 * Fixed event type for standardized workflow task management.
 * Used to signal when a task completes execution, optionally with result data.
 *
 * @typeParam TaskName - Union type of valid task names for type safety
 */
export interface TaskCompleted<TaskName extends string = string> {
  readonly type: "TaskCompleted";
  readonly taskName: TaskName;
  readonly result?: unknown;
  readonly timestamp?: number;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Union type combining all workflow event types.
 *
 * @remarks
 * Provides a fixed set of standardized events for workflow processes.
 * Simplifies event handling by constraining to task-based operations.
 *
 * @typeParam TaskName - Union type of valid task names for type safety
 */
export type WorkflowEvent<TaskName extends string = string> =
  | TaskStarted<TaskName>
  | TaskCompleted<TaskName>;

/**
 * Standardized task status values for workflow state tracking.
 *
 * @remarks
 * Provides consistent task state representation across workflow processes.
 * - "started": Task has been initiated but not yet completed
 * - "finished": Task has been completed successfully
 *
 * @author Иван Дугалић / Ivan Dugalic / @idugalic
 */
export type TaskStatus = "started" | "finished";

/**
 * Standardized task state structure for tracking task progress.
 *
 * @remarks
 * Maps task names to their current status for consistent state management.
 * Provides O(1) lookup for task status queries in workflow processes.
 *
 * @typeParam TaskName - Union type of valid task names for type safety
 */
export type TaskState<TaskName extends string = string> = {
  readonly [K in TaskName]?: TaskStatus;
};

/**
 * Base interface for workflow states that include standardized task tracking.
 *
 * @remarks
 * Extends domain-specific state structures with consistent task management.
 * Provides a foundation for workflow processes to track task progress alongside business state.
 *
 * @typeParam TaskName - Union type of valid task names for type safety
 */
export interface WorkflowState<TaskName extends string = string> {
  readonly tasks: TaskState<TaskName>;
}

/**
 * Standard state evolution function for workflow processes.
 *
 * @remarks
 * Provides automatic handling of workflow events to update task states.
 * - TaskStarted events set task status to "started"
 * - TaskCompleted events set task status to "finished"
 * This eliminates the need for users to implement boilerplate state evolution logic.
 *
 * @typeParam TaskName - Union type of valid task names for type safety
 * @param state - Current workflow state
 * @param event - Workflow event to process
 * @returns New workflow state with updated task status
 */
export const evolveWorkflowState = <TaskName extends string = string>(
  state: WorkflowState<TaskName>,
  event: WorkflowEvent<TaskName>,
): WorkflowState<TaskName> => {
  switch (event.type) {
    case "TaskStarted":
      return {
        ...state,
        tasks: {
          ...state.tasks,
          [event.taskName]: "started",
        } as TaskState<TaskName>,
      };
    case "TaskCompleted":
      return {
        ...state,
        tasks: {
          ...state.tasks,
          [event.taskName]: "finished",
        } as TaskState<TaskName>,
      };
    default:
      // This should never happen due to TypeScript's exhaustive checking
      return state;
  }
};

/**
 * The foundational workflow process interface with type-safe task names.
 *
 * @remarks
 * Extends the base process interface with workflow-specific helper methods and constraints.
 * Provides standardized task event creation and state query methods for simplified workflow development.
 * Constrains event types to WorkflowEvent and state types to WorkflowState for maximum type safety.
 * State types are fixed to WorkflowState to eliminate type casting and ensure compile-time safety.
 *
 * @typeParam AR - Action Result type representing results from executed actions
 * @typeParam A - Action type representing actions that can be executed as part of the business process
 * @typeParam TaskName - Union type of valid task names for type safety
 */
export interface IWorkflowProcess<AR, A, TaskName extends string = string>
  extends
    IProcess<
      AR,
      WorkflowState<TaskName>,
      WorkflowState<TaskName>,
      WorkflowEvent<TaskName>,
      WorkflowEvent<TaskName>,
      A
    > {
  /**
   * Creates a TaskStarted event with the specified task name.
   *
   * @param taskName - The name of the task being started
   * @param metadata - Optional metadata to include with the event
   * @returns A TaskStarted event ready for processing
   */
  readonly createTaskStarted: (
    taskName: TaskName,
    metadata?: Record<string, unknown>,
  ) => TaskStarted<TaskName>;

  /**
   * Creates a TaskCompleted event with the specified task name and optional result.
   *
   * @param taskName - The name of the task being completed
   * @param result - Optional result data from the completed task
   * @param metadata - Optional metadata to include with the event
   * @returns A TaskCompleted event ready for processing
   */
  readonly createTaskCompleted: (
    taskName: TaskName,
    result?: unknown,
    metadata?: Record<string, unknown>,
  ) => TaskCompleted<TaskName>;

  /**
   * Retrieves the current status of a specific task from the workflow state.
   *
   * @param state - The current workflow state containing task information
   * @param taskName - The name of the task to query
   * @returns The current status of the task, or undefined if the task is not found
   */
  readonly getTaskStatus: (
    state: WorkflowState<TaskName>,
    taskName: TaskName,
  ) => TaskStatus | undefined;

  /**
   * Checks if a specific task has been started in the workflow state.
   *
   * @param state - The current workflow state containing task information
   * @param taskName - The name of the task to check
   * @returns True if the task has been started, false otherwise
   */
  readonly isTaskStarted: (
    state: WorkflowState<TaskName>,
    taskName: TaskName,
  ) => boolean;

  /**
   * Checks if a specific task has been completed in the workflow state.
   *
   * @param state - The current workflow state containing task information
   * @param taskName - The name of the task to check
   * @returns True if the task has been completed, false otherwise
   */
  readonly isTaskCompleted: (
    state: WorkflowState<TaskName>,
    taskName: TaskName,
  ) => boolean;
}

/**
 * Event-sourced workflow process interface with type-safe task names.
 *
 * @remarks
 * Extends IDcbProcess with workflow-specific functionality and constraints.
 * State type is fixed to WorkflowState for consistent event-sourced evolution and type safety.
 * Maintains WorkflowEvent constraints for both input and output event types.
 * Inherits all workflow helper methods from IWorkflowProcess for standardized task management.
 *
 * @typeParam AR - Action Result type representing results from executed actions
 * @typeParam A - Action type representing actions that can be executed as part of the business process
 * @typeParam TaskName - Union type of valid task names for type safety
 */
export interface IDcbWorkflowProcess<AR, A, TaskName extends string = string>
  extends
    IWorkflowProcess<AR, A, TaskName>,
    IDcbProcess<
      AR,
      WorkflowState<TaskName>,
      WorkflowEvent<TaskName>,
      WorkflowEvent<TaskName>,
      A
    > {
}

/**
 * Aggregate workflow process interface with dual computation capabilities and type-safe task names.
 *
 * @remarks
 * Extends IAggregateProcess with workflow-specific functionality and constraints.
 * State type is fixed to WorkflowState and event type is fixed to WorkflowEvent for maximum type safety.
 * Supports both event-sourced and state-stored workflow computation patterns.
 * Inherits all workflow helper methods from IWorkflowProcess for standardized task management.
 * Provides dual computation capabilities within aggregate boundaries with workflow-specific events.
 *
 * @typeParam AR - Action Result type representing results from executed actions within the aggregate boundary
 * @typeParam A - Action type representing actions that can be executed as part of the business process
 * @typeParam TaskName - Union type of valid task names for type safety
 */
export interface IAggregateWorkflowProcess<
  AR,
  A,
  TaskName extends string = string,
> extends
  IWorkflowProcess<AR, A, TaskName>,
  IAggregateProcess<AR, WorkflowState<TaskName>, WorkflowEvent<TaskName>, A> {
}
/**
 * The foundational workflow process implementation with fixed WorkflowState type.
 *
 * @remarks
 * Extends the base Process class with workflow-specific functionality and constraints.
 * Provides standardized task event creation and state query methods for simplified workflow development.
 * Constrains event types to WorkflowEvent and state types to WorkflowState for maximum type safety.
 * State types are fixed to WorkflowState to eliminate type casting and ensure compile-time safety.
 *
 * @typeParam AR - Action Result type representing results from executed actions
 * @typeParam A - Action type representing actions that can be executed as part of the business process
 * @typeParam TaskName - Union type of valid task names for type safety
 */
export class WorkflowProcess<AR, A, TaskName extends string = string>
  implements IWorkflowProcess<AR, A, TaskName> {
  private readonly _process: Process<
    AR,
    WorkflowState<TaskName>,
    WorkflowState<TaskName>,
    WorkflowEvent<TaskName>,
    WorkflowEvent<TaskName>,
    A
  >;

  /**
   * Creates a new WorkflowProcess instance with standard workflow state evolution.
   *
   * @param decide - Decision function: `(ActionResult, WorkflowState) → WorkflowEvent[]`
   * @param react - Determines ready actions: `(WorkflowState, WorkflowEvent) → Action[]` (subset of pending)
   * @param pending - Returns complete ToDo list: `WorkflowState → Action[]`
   * @param initialState - Optional starting workflow state (defaults to empty task state)
   */
  constructor(
    readonly decide: (
      actionResult: AR,
      state: WorkflowState<TaskName>,
    ) => readonly WorkflowEvent<TaskName>[],
    readonly react: (
      state: WorkflowState<TaskName>,
      event: WorkflowEvent<TaskName>,
    ) => readonly A[],
    readonly pending: (state: WorkflowState<TaskName>) => readonly A[],
    readonly initialState: WorkflowState<TaskName> = {
      tasks: {},
    } as WorkflowState<TaskName>,
  ) {
    this._process = new Process(
      decide,
      evolveWorkflowState,
      initialState,
      react,
      pending,
    );
  }

  /**
   * Standard state evolution function for workflow processes.
   * Automatically handles TaskStarted and TaskCompleted events.
   */
  readonly evolve = evolveWorkflowState;

  /**
   * Creates a TaskStarted event with the specified task name.
   *
   * @param taskName - The name of the task being started
   * @param metadata - Optional metadata to include with the event
   * @returns A TaskStarted event ready for processing
   */
  readonly createTaskStarted = (
    taskName: TaskName,
    metadata?: Record<string, unknown>,
  ): TaskStarted<TaskName> => {
    return {
      type: "TaskStarted",
      taskName,
      timestamp: Date.now(),
      metadata,
    };
  };

  /**
   * Creates a TaskCompleted event with the specified task name and optional result.
   *
   * @param taskName - The name of the task being completed
   * @param result - Optional result data from the completed task
   * @param metadata - Optional metadata to include with the event
   * @returns A TaskCompleted event ready for processing
   */
  readonly createTaskCompleted = (
    taskName: TaskName,
    result?: unknown,
    metadata?: Record<string, unknown>,
  ): TaskCompleted<TaskName> => {
    return {
      type: "TaskCompleted",
      taskName,
      result,
      timestamp: Date.now(),
      metadata,
    };
  };

  /**
   * Retrieves the current status of a specific task from the workflow state.
   *
   * @param state - The current workflow state containing task information
   * @param taskName - The name of the task to query
   * @returns The current status of the task, or undefined if the task is not found
   */
  readonly getTaskStatus = (
    state: WorkflowState<TaskName>,
    taskName: TaskName,
  ): TaskStatus | undefined => {
    return state.tasks[taskName];
  };

  /**
   * Checks if a specific task has been started in the workflow state.
   *
   * @param state - The current workflow state containing task information
   * @param taskName - The name of the task to check
   * @returns True if the task has been started, false otherwise
   */
  readonly isTaskStarted = (
    state: WorkflowState<TaskName>,
    taskName: TaskName,
  ): boolean => {
    const status = this.getTaskStatus(state, taskName);
    return status === "started" || status === "finished";
  };

  /**
   * Checks if a specific task has been completed in the workflow state.
   *
   * @param state - The current workflow state containing task information
   * @param taskName - The name of the task to check
   * @returns True if the task has been completed, false otherwise
   */
  readonly isTaskCompleted = (
    state: WorkflowState<TaskName>,
    taskName: TaskName,
  ): boolean => {
    const status = this.getTaskStatus(state, taskName);
    return status === "finished";
  };

  /**
   * Transforms the action result type using contravariant mapping.
   *
   * @typeParam ARn - New action result type
   * @param f - Mapping function from new to original action result type
   * @returns New WorkflowProcess instance that accepts the new action result type
   */
  mapContraOnActionResult<ARn>(
    f: (arn: ARn) => AR,
  ): WorkflowProcess<ARn, A, TaskName> {
    const mappedProcess = this._process.mapContraOnActionResult(f);
    return new WorkflowProcess(
      mappedProcess.decide,
      mappedProcess.react,
      mappedProcess.pending,
      mappedProcess.initialState,
    );
  }

  /**
   * Transforms the action type using covariant mapping.
   *
   * @typeParam An - New action type
   * @param f - Mapping function from original to new action type
   * @returns New WorkflowProcess instance that produces the new action type
   */
  mapOnAction<An>(f: (a: A) => An): WorkflowProcess<AR, An, TaskName> {
    const mappedProcess = this._process.mapOnAction(f);
    return new WorkflowProcess(
      mappedProcess.decide,
      mappedProcess.react,
      mappedProcess.pending,
      mappedProcess.initialState,
    );
  }

  /**
   * Combines this WorkflowProcess with another WorkflowProcess, merging their behavior using intersection types.
   *
   * @typeParam AR2 - Action Result type of the other process to combine with
   * @typeParam A2 - Action type of the other process to combine with
   * @param y - The other WorkflowProcess to combine with this one
   * @returns A new WorkflowProcess that handles both sets of action results and maintains an intersected WorkflowState
   */
  combine<AR2, A2>(
    y: WorkflowProcess<AR2, A2, TaskName>,
  ): WorkflowProcess<AR | AR2, A | A2, TaskName> {
    const combinedProcess = this._process.combine(y._process);
    return new WorkflowProcess(
      combinedProcess.decide,
      combinedProcess.react,
      combinedProcess.pending,
      combinedProcess.initialState,
    );
  }

  /**
   * Combines this WorkflowProcess with another WorkflowProcess using tuple-based state merging.
   *
   * @remarks
   * This method is not applicable for WorkflowProcess since state types are fixed to WorkflowState.
   * Use the combine method instead for merging WorkflowProcess instances.
   *
   * @deprecated Use combine method instead for WorkflowProcess instances
   */
  combineViaTuples<AR2, A2>(
    y: WorkflowProcess<AR2, A2, TaskName>,
  ): WorkflowProcess<AR | AR2, A | A2, TaskName> {
    // For WorkflowProcess with fixed WorkflowState, delegate to combine method
    return this.combine(y);
  }
}

/**
 * Event-sourced workflow process implementation with fixed WorkflowState type.
 *
 * @remarks
 * Extends DcbProcess with workflow-specific functionality and constraints.
 * State type is fixed to WorkflowState for consistent event-sourced evolution and type safety.
 * Maintains WorkflowEvent constraints for both input and output event types.
 * Provides workflow-specific helper methods for standardized task management.
 * Implements computeNewEvents method for event-sourced workflows.
 *
 * @typeParam AR - Action Result type representing results from executed actions
 * @typeParam A - Action type representing actions that can be executed as part of the business process
 * @typeParam TaskName - Union type of valid task names for type safety
 */
export class DcbWorkflowProcess<AR, A, TaskName extends string = string>
  implements IDcbWorkflowProcess<AR, A, TaskName> {
  private readonly _dcbProcess: DcbProcess<
    AR,
    WorkflowState<TaskName>,
    WorkflowEvent<TaskName>,
    WorkflowEvent<TaskName>,
    A
  >;

  /**
   * Creates a new DcbWorkflowProcess instance with standard workflow state evolution.
   *
   * @param decide - Decision function: `(ActionResult, WorkflowState) → WorkflowEvent[]`
   * @param react - Determines ready actions: `(WorkflowState, WorkflowEvent) → Action[]` (subset of pending)
   * @param pending - Returns complete ToDo list: `WorkflowState → Action[]`
   * @param initialState - Optional starting workflow state (defaults to empty task state)
   */
  constructor(
    readonly decide: (
      actionResult: AR,
      state: WorkflowState<TaskName>,
    ) => readonly WorkflowEvent<TaskName>[],
    readonly react: (
      state: WorkflowState<TaskName>,
      event: WorkflowEvent<TaskName>,
    ) => readonly A[],
    readonly pending: (state: WorkflowState<TaskName>) => readonly A[],
    readonly initialState: WorkflowState<TaskName> = {
      tasks: {},
    } as WorkflowState<TaskName>,
  ) {
    this._dcbProcess = new DcbProcess(
      decide,
      evolveWorkflowState,
      initialState,
      react,
      pending,
    );
  }

  /**
   * Standard state evolution function for workflow processes.
   * Automatically handles TaskStarted and TaskCompleted events.
   */
  readonly evolve = evolveWorkflowState;

  /**
   * Computes new events from existing events and an action result using event-sourced computation.
   *
   * @param events - Existing workflow events representing the process history
   * @param actionResult - Action result to process
   * @returns New workflow events to append to the event stream
   */
  computeNewEvents(
    events: readonly WorkflowEvent<TaskName>[],
    actionResult: AR,
  ): readonly WorkflowEvent<TaskName>[] {
    return this._dcbProcess.computeNewEvents(events, actionResult);
  }

  /**
   * Creates a TaskStarted event with the specified task name.
   *
   * @param taskName - The name of the task being started
   * @param metadata - Optional metadata to include with the event
   * @returns A TaskStarted event ready for processing
   */
  readonly createTaskStarted = (
    taskName: TaskName,
    metadata?: Record<string, unknown>,
  ): TaskStarted<TaskName> => {
    return {
      type: "TaskStarted",
      taskName,
      timestamp: Date.now(),
      metadata,
    };
  };

  /**
   * Creates a TaskCompleted event with the specified task name and optional result.
   *
   * @param taskName - The name of the task being completed
   * @param result - Optional result data from the completed task
   * @param metadata - Optional metadata to include with the event
   * @returns A TaskCompleted event ready for processing
   */
  readonly createTaskCompleted = (
    taskName: TaskName,
    result?: unknown,
    metadata?: Record<string, unknown>,
  ): TaskCompleted<TaskName> => {
    return {
      type: "TaskCompleted",
      taskName,
      result,
      timestamp: Date.now(),
      metadata,
    };
  };

  /**
   * Retrieves the current status of a specific task from the workflow state.
   *
   * @param state - The current workflow state containing task information
   * @param taskName - The name of the task to query
   * @returns The current status of the task, or undefined if the task is not found
   */
  readonly getTaskStatus = (
    state: WorkflowState<TaskName>,
    taskName: TaskName,
  ): TaskStatus | undefined => {
    return state.tasks[taskName];
  };

  /**
   * Checks if a specific task has been started in the workflow state.
   *
   * @param state - The current workflow state containing task information
   * @param taskName - The name of the task to check
   * @returns True if the task has been started, false otherwise
   */
  readonly isTaskStarted = (
    state: WorkflowState<TaskName>,
    taskName: TaskName,
  ): boolean => {
    const status = this.getTaskStatus(state, taskName);
    return status === "started" || status === "finished";
  };

  /**
   * Checks if a specific task has been completed in the workflow state.
   *
   * @param state - The current workflow state containing task information
   * @param taskName - The name of the task to check
   * @returns True if the task has been completed, false otherwise
   */
  readonly isTaskCompleted = (
    state: WorkflowState<TaskName>,
    taskName: TaskName,
  ): boolean => {
    const status = this.getTaskStatus(state, taskName);
    return status === "finished";
  };

  /**
   * Transforms the action result type using contravariant mapping.
   *
   * @typeParam ARn - New action result type
   * @param f - Mapping function from new to original action result type
   * @returns New DcbWorkflowProcess instance that accepts the new action result type
   */
  mapContraOnActionResult<ARn>(
    f: (arn: ARn) => AR,
  ): DcbWorkflowProcess<ARn, A, TaskName> {
    const mappedProcess = this._dcbProcess.mapContraOnActionResult(f);
    return new DcbWorkflowProcess(
      mappedProcess.decide,
      mappedProcess.react,
      mappedProcess.pending,
      mappedProcess.initialState,
    );
  }

  /**
   * Transforms the action type using covariant mapping.
   *
   * @typeParam An - New action type
   * @param f - Mapping function from original to new action type
   * @returns New DcbWorkflowProcess instance that produces the new action type
   */
  mapOnAction<An>(f: (a: A) => An): DcbWorkflowProcess<AR, An, TaskName> {
    const mappedProcess = this._dcbProcess.mapOnAction(f);
    return new DcbWorkflowProcess(
      mappedProcess.decide,
      mappedProcess.react,
      mappedProcess.pending,
      mappedProcess.initialState,
    );
  }

  /**
   * Combines this DcbWorkflowProcess with another DcbWorkflowProcess, merging their behavior using intersection types.
   *
   * @typeParam AR2 - Action Result type of the other process to combine with
   * @typeParam A2 - Action type of the other process to combine with
   * @param y - The other DcbWorkflowProcess to combine with this one
   * @returns A new DcbWorkflowProcess that handles both sets of action results and maintains an intersected WorkflowState
   */
  combine<AR2, A2>(
    y: DcbWorkflowProcess<AR2, A2, TaskName>,
  ): DcbWorkflowProcess<AR | AR2, A | A2, TaskName> {
    const combinedProcess = this._dcbProcess.combine(y._dcbProcess);
    return new DcbWorkflowProcess(
      combinedProcess.decide,
      combinedProcess.react,
      combinedProcess.pending,
      combinedProcess.initialState,
    );
  }

  /**
   * Combines this DcbWorkflowProcess with another DcbWorkflowProcess using tuple-based state merging.
   *
   * @remarks
   * This method is not applicable for DcbWorkflowProcess since state types are fixed to WorkflowState.
   * Use the combine method instead for merging DcbWorkflowProcess instances.
   *
   * @deprecated Use combine method instead for DcbWorkflowProcess instances
   */
  combineViaTuples<AR2, A2>(
    y: DcbWorkflowProcess<AR2, A2, TaskName>,
  ): DcbWorkflowProcess<AR | AR2, A | A2, TaskName> {
    // For DcbWorkflowProcess with fixed WorkflowState, delegate to combine method
    return this.combine(y);
  }
}

/**
 * Aggregate workflow process implementation with dual computation capabilities and fixed WorkflowState type.
 *
 * @remarks
 * Extends AggregateProcess with workflow-specific functionality and constraints.
 * State type is fixed to WorkflowState and event type is fixed to WorkflowEvent for maximum type safety.
 * Supports both event-sourced and state-stored workflow computation patterns.
 * Provides workflow-specific helper methods for standardized task management.
 * Implements both computeNewState and computeNewEvents methods for dual computation capabilities.
 *
 * @typeParam AR - Action Result type representing results from executed actions within the aggregate boundary
 * @typeParam A - Action type representing actions that can be executed as part of the business process
 * @typeParam TaskName - Union type of valid task names for type safety
 */
export class AggregateWorkflowProcess<AR, A, TaskName extends string = string>
  implements IAggregateWorkflowProcess<AR, A, TaskName> {
  private readonly _aggregateProcess: AggregateProcess<
    AR,
    WorkflowState<TaskName>,
    WorkflowEvent<TaskName>,
    A
  >;

  /**
   * Creates a new AggregateWorkflowProcess instance with standard workflow state evolution.
   *
   * @param decide - Decision function: `(ActionResult, WorkflowState) → WorkflowEvent[]`
   * @param react - Determines ready actions: `(WorkflowState, WorkflowEvent) → Action[]` (subset of pending)
   * @param pending - Returns complete ToDo list: `WorkflowState → Action[]`
   * @param initialState - Optional starting workflow state (defaults to empty task state)
   */
  constructor(
    readonly decide: (
      actionResult: AR,
      state: WorkflowState<TaskName>,
    ) => readonly WorkflowEvent<TaskName>[],
    readonly react: (
      state: WorkflowState<TaskName>,
      event: WorkflowEvent<TaskName>,
    ) => readonly A[],
    readonly pending: (state: WorkflowState<TaskName>) => readonly A[],
    readonly initialState: WorkflowState<TaskName> = {
      tasks: {},
    } as WorkflowState<TaskName>,
  ) {
    this._aggregateProcess = new AggregateProcess(
      decide,
      evolveWorkflowState,
      initialState,
      react,
      pending,
    );
  }

  /**
   * Standard state evolution function for workflow processes.
   * Automatically handles TaskStarted and TaskCompleted events.
   */
  readonly evolve = evolveWorkflowState;

  /**
   * Computes the next state from an action result using state-stored computation.
   *
   * @param state - Current workflow state of the workflow process
   * @param actionResult - Action result to process
   * @returns New workflow state after processing the action result
   */
  computeNewState(
    state: WorkflowState<TaskName>,
    actionResult: AR,
  ): WorkflowState<TaskName> {
    return this._aggregateProcess.computeNewState(state, actionResult);
  }

  /**
   * Computes new events from existing events and an action result using event-sourced computation.
   *
   * @param events - Existing workflow events representing the process history
   * @param actionResult - Action result to process
   * @returns New workflow events to append to the event stream
   */
  computeNewEvents(
    events: readonly WorkflowEvent<TaskName>[],
    actionResult: AR,
  ): readonly WorkflowEvent<TaskName>[] {
    return this._aggregateProcess.computeNewEvents(events, actionResult);
  }

  /**
   * Creates a TaskStarted event with the specified task name.
   *
   * @param taskName - The name of the task being started
   * @param metadata - Optional metadata to include with the event
   * @returns A TaskStarted event ready for processing
   */
  readonly createTaskStarted = (
    taskName: TaskName,
    metadata?: Record<string, unknown>,
  ): TaskStarted<TaskName> => {
    return {
      type: "TaskStarted",
      taskName,
      timestamp: Date.now(),
      metadata,
    };
  };

  /**
   * Creates a TaskCompleted event with the specified task name and optional result.
   *
   * @param taskName - The name of the task being completed
   * @param result - Optional result data from the completed task
   * @param metadata - Optional metadata to include with the event
   * @returns A TaskCompleted event ready for processing
   */
  readonly createTaskCompleted = (
    taskName: TaskName,
    result?: unknown,
    metadata?: Record<string, unknown>,
  ): TaskCompleted<TaskName> => {
    return {
      type: "TaskCompleted",
      taskName,
      result,
      timestamp: Date.now(),
      metadata,
    };
  };

  /**
   * Retrieves the current status of a specific task from the workflow state.
   *
   * @param state - The current workflow state containing task information
   * @param taskName - The name of the task to query
   * @returns The current status of the task, or undefined if the task is not found
   */
  readonly getTaskStatus = (
    state: WorkflowState<TaskName>,
    taskName: TaskName,
  ): TaskStatus | undefined => {
    return state.tasks[taskName];
  };

  /**
   * Checks if a specific task has been started in the workflow state.
   *
   * @param state - The current workflow state containing task information
   * @param taskName - The name of the task to check
   * @returns True if the task has been started, false otherwise
   */
  readonly isTaskStarted = (
    state: WorkflowState<TaskName>,
    taskName: TaskName,
  ): boolean => {
    const status = this.getTaskStatus(state, taskName);
    return status === "started" || status === "finished";
  };

  /**
   * Checks if a specific task has been completed in the workflow state.
   *
   * @param state - The current workflow state containing task information
   * @param taskName - The name of the task to check
   * @returns True if the task has been completed, false otherwise
   */
  readonly isTaskCompleted = (
    state: WorkflowState<TaskName>,
    taskName: TaskName,
  ): boolean => {
    const status = this.getTaskStatus(state, taskName);
    return status === "finished";
  };

  /**
   * Transforms the action result type using contravariant mapping.
   *
   * @typeParam ARn - New action result type
   * @param f - Mapping function from new to original action result type
   * @returns New AggregateWorkflowProcess instance that accepts the new action result type
   */
  mapContraOnActionResult<ARn>(
    f: (arn: ARn) => AR,
  ): AggregateWorkflowProcess<ARn, A, TaskName> {
    const mappedProcess = this._aggregateProcess.mapContraOnActionResult(f);
    return new AggregateWorkflowProcess(
      mappedProcess.decide,
      mappedProcess.react,
      mappedProcess.pending,
      mappedProcess.initialState,
    );
  }

  /**
   * Transforms the action type using covariant mapping.
   *
   * @typeParam An - New action type
   * @param f - Mapping function from original to new action type
   * @returns New AggregateWorkflowProcess instance that produces the new action type
   */
  mapOnAction<An>(f: (a: A) => An): AggregateWorkflowProcess<AR, An, TaskName> {
    const mappedProcess = this._aggregateProcess.mapOnAction(f);
    return new AggregateWorkflowProcess(
      mappedProcess.decide,
      mappedProcess.react,
      mappedProcess.pending,
      mappedProcess.initialState,
    );
  }

  /**
   * Combines this AggregateWorkflowProcess with another AggregateWorkflowProcess, merging their behavior using intersection types.
   *
   * @typeParam AR2 - Action Result type of the other process to combine with
   * @typeParam A2 - Action type of the other process to combine with
   * @param y - The other AggregateWorkflowProcess to combine with this one
   * @returns A new AggregateWorkflowProcess that handles both sets of action results and maintains an intersected WorkflowState
   */
  combine<AR2, A2>(
    y: AggregateWorkflowProcess<AR2, A2, TaskName>,
  ): AggregateWorkflowProcess<AR | AR2, A | A2, TaskName> {
    const combinedProcess = this._aggregateProcess.combine(y._aggregateProcess);
    return new AggregateWorkflowProcess(
      combinedProcess.decide,
      combinedProcess.react,
      combinedProcess.pending,
      combinedProcess.initialState,
    );
  }

  /**
   * Combines this AggregateWorkflowProcess with another AggregateWorkflowProcess using tuple-based state merging.
   *
   * @remarks
   * This method is not applicable for AggregateWorkflowProcess since state types are fixed to WorkflowState.
   * Use the combine method instead for merging AggregateWorkflowProcess instances.
   *
   * @deprecated Use combine method instead for AggregateWorkflowProcess instances
   */
  combineViaTuples<AR2, A2>(
    y: AggregateWorkflowProcess<AR2, A2, TaskName>,
  ): AggregateWorkflowProcess<AR | AR2, A | A2, TaskName> {
    // For AggregateWorkflowProcess with fixed WorkflowState, delegate to combine method
    return this.combine(y);
  }
}
