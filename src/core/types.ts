/**
 * Status of the authentication state machine.
 *
 * - `'idle'`: Initial state; no request in progress.
 * - `'sending'`: An OTP code or dispatch request is currently being sent.
 * - `'pending'`: Code dispatched; waiting for the user to submit an OTP code.
 * - `'verifying'`: Code verification is currently in flight.
 * - `'success'`: Verification succeeded; session payload is stored in `data`.
 * - `'error'`: A terminal failure occurred; details stored in `error`.
 */
export type AuthStatus =
  | 'idle'
  | 'sending'
  | 'pending'
  | 'verifying'
  | 'success'
  | 'error';

/**
 * Immutable state snapshot emitted by the authentication state machine.
 *
 * @template TData - Type of authenticated payload returned upon success (e.g. JWT token or user session).
 * @template TError - Type of error object on failure (defaults to `Error`).
 */
export interface AuthState<TData = unknown, TError = Error> {
  /** Current authentication lifecycle status. */
  status: AuthStatus;
  /** Authentication payload if status is 'success', otherwise null. */
  data: TData | null;
  /** Error object if status is 'error' or a retryable verification failed while 'pending'. */
  error: TError | null;
  /** Number of verification attempts made in the current session. */
  attempts: number;
  /** Timestamp (epoch ms) of the most recent state transition. */
  lastUpdated: number;
}

/**
 * Actions dispatched to the authentication state machine reducer.
 */
export type AuthAction<TData = unknown, TError = Error> =
  | { type: 'SEND_CODE' }
  | { type: 'CODE_SENT' }
  | { type: 'VERIFY_CODE' }
  | { type: 'VERIFY_SUCCESS'; payload: TData }
  | { type: 'VERIFY_FAILURE'; payload: TError }
  | { type: 'SET_ERROR'; payload: TError }
  | { type: 'CLEAR_ERROR' }
  | { type: 'RESET' };

/**
 * Callback listener invoked on state machine transitions.
 */
export type AuthStateMachineListener<TData = unknown, TError = Error> = (
  state: AuthState<TData, TError>
) => void;

/**
 * Stable machine-readable error codes thrown by `@salatech/auth-toolkit`.
 *
 * `COOLDOWN_ACTIVE` and `STRATEGY_DISABLED` are reserved for future use: the hooks currently
 * treat those situations as silent no-ops (see `resendIn` and the dev-mode warning) rather than errors.
 */
export type AuthErrorCode =
  | 'INVALID_CODE'
  | 'COOLDOWN_ACTIVE'
  | 'STRATEGY_DISABLED'
  | 'MISSING_DEPENDENCY'
  | 'NO_HANDLER'
  | 'AUTH_FAILED';

/**
 * Standard error class thrown by `@salatech/auth-toolkit` with a stable error code.
 *
 * @example
 * ```ts
 * try {
 *   await verifyOtp('12');
 * } catch (err) {
 *   if (err instanceof AuthError && err.code === 'INVALID_CODE') {
 *     console.log('User entered invalid code length');
 *   }
 * }
 * ```
 */
export class AuthError extends Error {
  /** Stable error code identifying the cause of the failure. */
  public readonly code: AuthErrorCode;

  constructor(message: string, code: AuthErrorCode) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    Object.setPrototypeOf(this, AuthError.prototype);
  }
}
