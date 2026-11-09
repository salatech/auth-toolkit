import {
  AuthAction,
  AuthState,
  AuthStateMachineListener,
} from './types';

/**
 * Initial authentication state on machine instantiation or after a reset.
 */
export const INITIAL_AUTH_STATE: AuthState = {
  status: 'idle',
  data: null,
  error: null,
  attempts: 0,
  lastUpdated: Date.now(),
};

/**
 * Pure state transition reducer for the authentication state machine.
 * Enforces valid transition guards across all status × action combinations.
 *
 * @param state - Current authentication state snapshot.
 * @param action - Dispatched action.
 * @returns Next immutable state snapshot.
 *
 * @example
 * ```ts
 * const next = authReducer(currentState, { type: 'SEND_CODE' });
 * ```
 */
export function authReducer<TData = unknown, TError = Error>(
  state: AuthState<TData, TError>,
  action: AuthAction<TData, TError>
): AuthState<TData, TError> {
  const now = Date.now();

  switch (action.type) {
    case 'SEND_CODE':
      if (
        state.status === 'sending' ||
        state.status === 'verifying' ||
        state.status === 'success'
      ) {
        return state;
      }
      return {
        ...state,
        status: 'sending',
        error: null,
        lastUpdated: now,
      };

    case 'CODE_SENT':
      if (state.status !== 'sending') {
        return state;
      }
      return {
        ...state,
        status: 'pending',
        error: null,
        lastUpdated: now,
      };

    case 'VERIFY_CODE':
      if (state.status !== 'pending') {
        return state;
      }
      return {
        ...state,
        status: 'verifying',
        attempts: state.attempts + 1,
        error: null,
        lastUpdated: now,
      };

    case 'VERIFY_SUCCESS':
      if (state.status === 'sending' || state.status === 'success') {
        return state;
      }
      return {
        ...state,
        status: 'success',
        data: action.payload,
        error: null,
        lastUpdated: now,
      };

    case 'VERIFY_FAILURE':
      if (state.status !== 'verifying' && state.status !== 'pending') {
        return state;
      }
      // Retryable: return to pending so the user can re-enter a code
      // without calling reset(). Fatal failures use SET_ERROR instead.
      return {
        ...state,
        status: 'pending',
        error: action.payload,
        lastUpdated: now,
      };

    case 'SET_ERROR':
      if (state.status === 'success') {
        return state;
      }
      return {
        ...state,
        status: 'error',
        error: action.payload,
        lastUpdated: now,
      };

    case 'CLEAR_ERROR':
      if (state.status !== 'pending' || state.error === null) {
        return state;
      }
      return {
        ...state,
        error: null,
        lastUpdated: now,
      };

    case 'RESET':
      return {
        status: 'idle',
        data: null,
        error: null,
        attempts: 0,
        lastUpdated: now,
      };

    default:
      return state;
  }
}

/**
 * Framework-agnostic state container managing authentication flow transitions.
 *
 * @template TData - Type of authenticated payload (e.g. JWT token or user profile).
 * @template TError - Type of error (defaults to `Error`).
 *
 * @example
 * ```ts
 * const machine = new AuthStateMachine<string>();
 * const unsubscribe = machine.subscribe((state) => console.log(state.status));
 * machine.dispatch({ type: 'SEND_CODE' });
 * ```
 */
export class AuthStateMachine<TData = unknown, TError = Error> {
  private state: AuthState<TData, TError>;
  private listeners: Set<AuthStateMachineListener<TData, TError>> = new Set();

  /**
   * Initializes a new state machine instance.
   * @param initialState - Optional partial state overrides for testing or hydration.
   */
  constructor(initialState?: Partial<AuthState<TData, TError>>) {
    this.state = {
      ...(INITIAL_AUTH_STATE as AuthState<TData, TError>),
      ...initialState,
    };
  }

  /**
   * Returns the current state snapshot.
   */
  public getState(): AuthState<TData, TError> {
    return this.state;
  }

  /**
   * Dispatches an action through `authReducer`, updating state and notifying subscribers.
   * @param action - Action to dispatch.
   * @returns Updated state snapshot.
   */
  public dispatch(action: AuthAction<TData, TError>): AuthState<TData, TError> {
    const nextState = authReducer(this.state, action);
    this.state = nextState;
    this.notify();
    return this.state;
  }

  /**
   * Subscribes a listener to state changes.
   * @param listener - Callback receiving the updated state snapshot.
   * @returns Cleanup function to unsubscribe the listener.
   */
  public subscribe(listener: AuthStateMachineListener<TData, TError>): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}
