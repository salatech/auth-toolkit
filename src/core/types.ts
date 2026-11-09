export type AuthStatus =
  | 'idle'
  | 'sending'
  | 'pending'
  | 'verifying'
  | 'success'
  | 'error';

export interface AuthState<TData = unknown, TError = Error> {
  status: AuthStatus;
  data: TData | null;
  error: TError | null;
  attempts: number;
  lastUpdated: number;
}

export type AuthAction<TData = unknown, TError = Error> =
  | { type: 'SEND_CODE' }
  | { type: 'CODE_SENT' }
  | { type: 'VERIFY_CODE' }
  | { type: 'VERIFY_SUCCESS'; payload: TData }
  | { type: 'VERIFY_FAILURE'; payload: TError }
  | { type: 'SET_ERROR'; payload: TError }
  | { type: 'CLEAR_ERROR' }
  | { type: 'RESET' };

export type AuthStateMachineListener<TData = unknown, TError = Error> = (
  state: AuthState<TData, TError>
) => void;
export type AuthErrorCode =
  | 'INVALID_CODE'
  | 'COOLDOWN_ACTIVE'
  | 'STRATEGY_DISABLED'
  | 'MISSING_DEPENDENCY'
  | 'NO_HANDLER'
  | 'AUTH_FAILED';

export class AuthError extends Error {
  public readonly code: AuthErrorCode;

  constructor(message: string, code: AuthErrorCode) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    Object.setPrototypeOf(this, AuthError.prototype);
  }
}
