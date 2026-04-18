/**
 * Deno-specific Given-When-Then spec builders, wired to `@std/assert`.
 *
 * This module is the Deno adapter for the runtime-agnostic
 * {@link createSpecs} factory from `test_specification.ts`.
 * It pre-wires Deno's `@std/assert` so that test files can import
 * `DeciderEventSourcedSpec`, `DeciderStateStoredSpec`, and
 * `ViewSpecification` directly without any setup.
 *
 * For other runtimes, create an equivalent adapter file that wires
 * your assertion library into {@link createSpecs}:
 *
 * @example `test_specification_vitest.ts`
 * ```typescript
 * import { expect } from "vitest";
 * import { createSpecs } from "./test_specification.ts";
 *
 * const specs = createSpecs({
 *   assertEquals: (actual, expected) => expect(actual).toEqual(expected),
 *   assert: (condition) => expect(condition).toBeTruthy(),
 * });
 *
 * export const DeciderEventSourcedSpec = specs.DeciderEventSourcedSpec;
 * export const DeciderStateStoredSpec = specs.DeciderStateStoredSpec;
 * export const ViewSpecification = specs.ViewSpecification;
 * ```
 *
 * @example `test_specification_node.ts`
 * ```typescript
 * import nodeAssert from "node:assert";
 * import { createSpecs } from "./test_specification.ts";
 *
 * const specs = createSpecs({
 *   assertEquals: (actual, expected) => nodeAssert.deepStrictEqual(actual, expected),
 *   assert: (condition) => nodeAssert.ok(condition),
 * });
 *
 * export const DeciderEventSourcedSpec = specs.DeciderEventSourcedSpec;
 * export const DeciderStateStoredSpec = specs.DeciderStateStoredSpec;
 * export const ViewSpecification = specs.ViewSpecification;
 * ```
 *
 * @see {@link createSpecs} for the full factory API and {@link Assertions} for the interface contract.
 */

import { assert, assertEquals } from "@std/assert";
import { createSpecs } from "./test_specification.ts";

const specs = createSpecs({ assertEquals, assert });

export const DeciderEventSourcedSpec = specs.DeciderEventSourcedSpec;
export const DeciderStateStoredSpec = specs.DeciderStateStoredSpec;
export const ViewSpecification = specs.ViewSpecification;
