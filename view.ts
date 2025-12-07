import { identity } from "@fraktalio/fmodel-decider";

/**
 * Represents a view that evolves state based on events, supporting independent input and output state types.
 * This is the most generic form of a view, allowing for transformations between different state types
 * and enabling complex cross-concept scenarios.
 *
 * @typeParam Si - Input state type
 * @typeParam So - Output state type
 * @typeParam E - Event type that triggers state evolution
 */
export interface IView<Si, So, E> {
  /**
   * Evolves the input state based on the given event to produce an output state.
   * This function defines the core state evolution logic.
   *
   * @param state - The current input state
   * @param event - The event to process
   * @returns The new output state after processing the event
   */
  readonly evolve: (state: Si, event: E) => So;

  /**
   * The initial output state.
   * This represents the starting point for state evolution.
   */
  readonly initialState: So;
}

/**
 * Represents a projection that constrains input and output state types to be identical,
 * following the progressive refinement pattern. This interface extends IView with the
 * constraint that Si = So = S, enabling consistent state evolution patterns.
 *
 * @typeParam S - State type (both input and output are identical)
 * @typeParam E - Event type that triggers state evolution
 */
export interface IProjection<S, E> extends IView<S, S, E> {
}

/**
 * Concrete implementation of IView that provides the most generic form of view functionality
 * with independent input and output state types. This class supports transformations between
 * different state types and enables complex cross-concept scenarios.
 *
 * @typeParam Si - Input state type that the view can process
 * @typeParam So - Output state type that the view produces after evolution
 * @typeParam E - Event type that triggers state evolution
 *
 * @author Fraktalio
 */
export class View<Si, So, E> implements IView<Si, So, E> {
  /**
   * Creates a new View instance with the specified evolve function and initial state.
   *
   * @param evolve - Function that evolves input state based on events to produce output state
   * @param initialState - The initial output state of the view
   */
  constructor(
    public readonly evolve: (state: Si, event: E) => So,
    public readonly initialState: So,
  ) {}

  /**
   * Transforms both input and output state types of this view using dimap.
   * This method enables transformation between different state types while preserving
   * the event type and core evolution behavior.
   *
   * @typeParam Sin - New input state type that the resulting view will consume
   * @typeParam Son - New output state type that the resulting view will produce
   * @param fl - Contravariant mapping function that transforms new input state to original input state
   * @param fr - Covariant mapping function that transforms original output state to new output state
   * @returns A new `View` instance with transformed state types while preserving event behavior
   */
  dimapOnState<Sin, Son>(
    fl: (sin: Sin) => Si,
    fr: (so: So) => Son,
  ): View<Sin, Son, E> {
    return new View(
      (sin: Sin, e: E) => fr(this.evolve(fl(sin), e)),
      fr(this.initialState),
    );
  }

  /**
   * Transforms the event type of this view by applying a contravariant mapping function.
   * This method enables the view to accept events of a different type while preserving
   * all other behavior.
   *
   * @typeParam En - The new event type that the resulting view will accept
   * @param f - Mapping function that transforms the new event type to the original event type
   * @returns A new `View` instance that accepts events of type `En` while preserving all other behavior
   */
  mapContraOnEvent<En>(f: (en: En) => E): View<Si, So, En> {
    return new View(
      (s: Si, en: En) => this.evolve(s, f(en)),
      this.initialState,
    );
  }

  /**
   * Right apply on So/Output State parameter - Applicative
   *
   * @typeParam Son - New output State
   */
  applyOnState<Son>(
    ff: View<Si, (so: So) => Son, E>,
  ): View<Si, Son, E> {
    return new View(
      (s: Si, e: E) => ff.evolve(s, e)(this.evolve(s, e)),
      ff.initialState(this.initialState),
    );
  }

  /**
   * Product on So/Output State parameter
   *
   * @typeParam Son - New output State
   */
  productOnState<Son>(
    fb: View<Si, Son, E>,
  ): View<Si, So & Son, E> {
    return this.applyOnState(
      fb.dimapOnState(identity, (son: Son) => (so: So) => {
        return Object.assign({}, so, son);
      }),
    );
  }

  /**
   * Product on So/Output State parameter via tuples
   *
   * @typeParam Son - New output State
   */
  productViaTuplesOnState<Son>(
    fb: View<Si, Son, E>,
  ): View<Si, readonly [So, Son], E> {
    return this.applyOnState(
      fb.dimapOnState(identity, (b: Son) => (a: So) => [a, b]),
    );
  }

  /**
   * Combines this view with another view using intersection-based state merging.
   * This method creates a new view that handles both sets of events and maintains
   * an intersected state structure.
   *
   * @typeParam Si2 - Input state type of the other view to combine with
   * @typeParam So2 - Output state type of the other view to combine with
   * @typeParam E2 - Event type of the other view to combine with
   * @param y - The other view to combine with this one
   * @returns A new `View` that handles both sets of events and maintains an intersected state
   */
  combine<Si2, So2, E2>(
    y: View<Si2, So2, E2>,
  ): View<Si & Si2, So & So2, E | E2> {
    const viewX = this.dimapOnState<Si & Si2, So>(
      (sin) => sin as Si,
      identity,
    ).mapContraOnEvent<E | E2>((ein) => ein as E);

    const viewY = y
      .dimapOnState<Si & Si2, So2>(
        (sin) => sin as Si2,
        identity,
      )
      .mapContraOnEvent<E | E2>((ein) => ein as E2);

    return viewX.productOnState(viewY);
  }

  /**
   * Combines this view with another view using tuple-based state merging.
   * This method keeps states separate using tuple types, ideal for independent
   * domain concepts without property conflicts.
   *
   * @typeParam Si2 - Input state type of the other view to combine with
   * @typeParam So2 - Output state type of the other view to combine with
   * @typeParam E2 - Event type of the other view to combine with
   * @param y - The other view to combine with this one
   * @returns A new `View` that handles both sets of events and maintains a tuple-structured state
   */
  combineViaTuples<Si2, So2, E2>(
    y: View<Si2, So2, E2>,
  ): View<
    readonly [Si, Si2],
    readonly [So, So2],
    E | E2
  > {
    const viewX = this.dimapOnState<readonly [Si, Si2], So>(
      (sin) => sin[0],
      identity,
    )
      .mapContraOnEvent<E | E2>((ein) => ein as E);

    const viewY = y
      .dimapOnState<readonly [Si, Si2], So2>((sin) => sin[1], identity)
      .mapContraOnEvent<E | E2>((ein) => ein as E2);

    return viewX.productViaTuplesOnState(viewY);
  }
}

/**
 * Concrete implementation of IProjection that provides event-sourced computation capabilities
 * while maintaining the constraint that input and output state types are identical (Si = So = S).
 * This class follows the progressive refinement pattern, building upon the base IView interface
 * with additional constraints and capabilities.
 *
 * @typeParam S - State type (both input and output are identical)
 * @typeParam E - Event type that triggers state evolution
 */
export class Projection<S, E> implements IProjection<S, E> {
  private readonly _view: View<S, S, E>;

  /**
   * Creates a new Projection instance with the specified evolve function and initial state.
   *
   * @param evolve - Function that evolves state based on events
   * @param initialState - The initial state of the projection
   */
  constructor(
    public readonly evolve: (state: S, event: E) => S,
    public readonly initialState: S,
  ) {
    this._view = new View(evolve, initialState);
  }

  /**
   * Computes a new state by processing an event against the current state.
   * This method delegates to the evolve function to maintain consistency
   * with the IView interface while providing the IProjection contract.
   *
   * @param state - The current state
   * @param event - The event to process
   * @returns The new state after processing the event
   */
  computeNewState(state: S, event: E): S {
    return this.evolve(state, event);
  }

  /**
   * Transforms the state type of this projection while preserving the constraint
   * that input and output state types remain identical (Si = So = Sn).
   * This method follows the progressive refinement pattern by maintaining
   * the IProjection interface contract.
   *
   * @typeParam Sn - New state type that the resulting projection will use
   * @param fl - Contravariant mapping function that transforms new state to original state
   * @param fr - Covariant mapping function that transforms original state to new state
   * @returns A new `Projection` instance with transformed state type while preserving event behavior
   */
  dimapOnState<Sn>(
    fl: (sn: Sn) => S,
    fr: (s: S) => Sn,
  ): Projection<Sn, E> {
    const mappedView = this._view.dimapOnState(fl, fr);
    return new Projection(
      mappedView.evolve,
      mappedView.initialState,
    );
  }

  /**
   * Transforms the event type of this projection by applying a contravariant mapping function.
   * This method enables the projection to accept events of a different type while preserving
   * all other behavior. This is an alias for dimapOnEvent for consistency with other components.
   *
   * @typeParam En - The new event type that the resulting projection will accept
   * @param f - Mapping function that transforms the new event type to the original event type
   * @returns A new `Projection` instance that accepts events of type `En` while preserving all other behavior
   */
  mapContraOnEvent<En>(f: (en: En) => E): Projection<S, En> {
    const mappedView = this._view.mapContraOnEvent(f);
    return new Projection(
      mappedView.evolve,
      mappedView.initialState,
    );
  }

  /**
   * Combines this projection with another projection using intersection-based state merging.
   * This method creates a new projection that handles both sets of events and maintains
   * an intersected state structure while preserving the IProjection interface compliance.
   *
   * @typeParam S2 - State type of the other projection to combine with
   * @typeParam E2 - Event type of the other projection to combine with
   * @param y - The other projection to combine with this one
   * @returns A new `Projection` that handles both sets of events and maintains an intersected state
   */
  combine<S2, E2>(
    y: Projection<S2, E2>,
  ): Projection<S & S2, E | E2> {
    const combinedView = this._view.combine(y._view);
    return new Projection(
      combinedView.evolve,
      combinedView.initialState,
    );
  }

  /**
   * Combines this projection with another projection using tuple-based state merging.
   * This method keeps states separate using tuple types, ideal for independent
   * domain concepts without property conflicts while preserving the IProjection interface compliance.
   *
   * @typeParam S2 - State type of the other projection to combine with
   * @typeParam E2 - Event type of the other projection to combine with
   * @param y - The other projection to combine with this one
   * @returns A new `Projection` that handles both sets of events and maintains a tuple-structured state
   */
  combineViaTuples<S2, E2>(
    y: Projection<S2, E2>,
  ): Projection<readonly [S, S2], E | E2> {
    const combinedView = this._view.combineViaTuples(y._view);
    return new Projection(
      combinedView.evolve,
      combinedView.initialState,
    );
  }
}