import { AggregateDecider } from "./decider.ts";
import {
  DeciderEventSourcedSpec,
  DeciderStateStoredSpec,
} from "./test_specification.ts";

// Simple Counter Example with Exhaustive Matching
type CounterCommand =
  | { kind: "IncrementCommand"; amount: number }
  | { kind: "DecrementCommand"; amount: number }
  | { kind: "ResetCommand" };

type CounterEvent =
  | { kind: "IncrementedEvent"; amount: number }
  | { kind: "DecrementedEvent"; amount: number }
  | { kind: "ResetEvent" };

type CounterState = {
  readonly value: number;
};

const initialCounterState: CounterState = { value: 0 };

/**
 * Counter decider with exhaustive matching
 */
const counterDecider = new AggregateDecider<
  CounterCommand,
  CounterState,
  CounterEvent
>(
  (command, state) => {
    switch (command.kind) {
      case "IncrementCommand":
        return [{ kind: "IncrementedEvent", amount: command.amount }];
      case "DecrementCommand":
        return [{ kind: "DecrementedEvent", amount: command.amount }];
      case "ResetCommand":
        return [{ kind: "ResetEvent" }];
      default: {
        // Exhaustive matching of the command type
        const _: never = command;
        return [];
      }
    }
  },
  (state, event) => {
    switch (event.kind) {
      case "IncrementedEvent":
        return { value: state.value + event.amount };
      case "DecrementedEvent":
        return { value: state.value - event.amount };
      case "ResetEvent":
        return { value: 0 };
      default: {
        // Exhaustive matching of the event type
        const _: never = event;
        return state;
      }
    }
  },
  initialCounterState,
);

// Tests
Deno.test("Counter Increment - Event Sourced", () => {
  DeciderEventSourcedSpec.for(counterDecider)
    .given([])
    .when({ kind: "IncrementCommand", amount: 5 })
    .then([{ kind: "IncrementedEvent", amount: 5 }]);
});

Deno.test("Counter Increment - State Stored", () => {
  DeciderStateStoredSpec.for(counterDecider)
    .given({ value: 0 })
    .when({ kind: "IncrementCommand", amount: 5 })
    .then({ value: 5 });
});

Deno.test("Counter Decrement - Event Sourced", () => {
  DeciderEventSourcedSpec.for(counterDecider)
    .given([{ kind: "IncrementedEvent", amount: 10 }])
    .when({ kind: "DecrementCommand", amount: 3 })
    .then([{ kind: "DecrementedEvent", amount: 3 }]);
});

Deno.test("Counter Reset - State Stored", () => {
  DeciderStateStoredSpec.for(counterDecider)
    .given({ value: 42 })
    .when({ kind: "ResetCommand" })
    .then({ value: 0 });
});
