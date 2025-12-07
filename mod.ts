export * from "./decider.ts";
export * from "./process.ts";
export * from "./process_workflow.ts";
export * from "./view.ts";


/**
 * The identity function: returns its input unchanged.
 *
 * @remarks
 * This is a fundamental functional programming utility used throughout the decider implementations.
 * It serves as the identity element for function composition and is used in mapping operations
 * where no transformation is needed.
 *
 * @typeParam T - The type of the value being passed through
 * @param t - The value to return unchanged
 * @returns The same value that was passed in
 */
export const identity = <T>(t: T) => t;
