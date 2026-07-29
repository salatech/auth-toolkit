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
