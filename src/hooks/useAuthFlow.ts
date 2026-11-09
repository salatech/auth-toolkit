import { useCallback, useEffect, useRef, useState } from 'react';
import { authenticateBiometric, BiometricOptions } from '../biometric';
import { AuthStateMachine } from '../core/state-machine';
import { AuthError, AuthState, AuthStatus } from '../core/types';
import { parseAuthDeepLink } from '../deep-link';
import { OtpManager } from '../otp';

/**
 * Allowed authentication methods.
 *
 * - `'otp'`: Restricts authentication to One-Time Password send and verify.
 * - `'deep-link'`: Restricts authentication to URL / magic-link parameter parsing.
 * - `'biometric'`: Restricts authentication to local biometric hardware checks.
 * - `'hybrid'`: Allows all authentication methods concurrently (default).
 */
export type AuthStrategy = 'otp' | 'deep-link' | 'biometric' | 'hybrid';

/**
 * Options configuring the `useAuthFlow` hook.
 *
 * @template TToken - Type of authenticated payload returned upon verification.
 */
export interface UseAuthFlowOptions<TToken = string> {
  /** Strategy restricting which auth methods are enabled. Defaults to `'hybrid'`. */
  strategy?: AuthStrategy;
  /** Cooldown in seconds before a resend is permitted. Defaults to 60. */
  cooldownSeconds?: number;
  /** Expected digit count for OTP code. Defaults to 6. */
  codeLength?: number;
  /** URL query parameter name for magic links. Defaults to `'token'`. */
  tokenParamName?: string;
  /** Async callback invoked to dispatch an OTP code. */
  onSendOtp?: (recipient: string) => Promise<void>;
  /** Async callback invoked to verify a submitted OTP code. */
  onVerifyOtp?: (code: string) => Promise<TToken>;
  /**
   * Called after hardware biometric authentication succeeds.
   * Return a session token when available to store in `state.data`.
   * If omitted, no token is minted, `state.data` is `null`, and `onVerified` is called without arguments.
   */
  onBiometricSuccess?: () => Promise<TToken> | TToken;
  /** Callback fired whenever authentication completes successfully. */
  onVerified?: (token?: TToken) => void;
  /** Callback fired whenever an operation errors. */
  onError?: (error: Error) => void;
}

/**
 * Return value of the `useAuthFlow` hook.
 *
 * @template TToken - Type of authenticated payload.
 */
export interface UseAuthFlowReturn<TToken = string> {
  /** Current state machine status ('idle' | 'sending' | 'pending' | 'verifying' | 'success' | 'error'). */
  status: AuthStatus;
  /** Full immutable state snapshot. */
  state: AuthState<TToken, Error>;
  /** Seconds remaining on resend cooldown. */
  resendIn: number;
  /** Dispatches an OTP to the given recipient. */
  sendOtp: (recipient: string) => Promise<void>;
  /** Verifies a submitted OTP code against onVerifyOtp. */
  verifyOtp: (code: string) => Promise<void>;
  /** Parses an incoming deep link URL and verifies the token. */
  handleDeepLink: (url: string) => void;
  /** Prompts native biometric authentication. */
  authenticateWithBiometrics: (options?: BiometricOptions) => Promise<boolean>;
  /** Clears a retryable error while status is `pending` (e.g. after failed OTP verify). */
  clearError: () => void;
  /** Resets state back to 'idle'. */
  reset: () => void;
}

function strategyAllows(strategy: AuthStrategy, feature: 'otp' | 'deep-link' | 'biometric'): boolean {
  if (strategy === 'hybrid') return true;
  return strategy === feature;
}

const isDev =
  Boolean((globalThis as unknown as { __DEV__?: boolean }).__DEV__) ||
  (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production');

function warnUnsupported(feature: string, strategy: AuthStrategy): void {
  if (isDev) {
    console.warn(
      `[auth-toolkit] Feature '${feature}' was invoked, but is not enabled for strategy '${strategy}'. ` +
        `To enable, configure the strategy option to 'hybrid' or '${feature}'.`
    );
  }
}

/**
 * Full-featured authentication orchestration hook for React Native, Expo, and React Web.
 * Unifies OTP verification, deep/magic links, and biometrics into a deterministic state machine.
 *
 * @template TToken - Type of session token or user payload.
 * @param options - Configuration and handler callbacks.
 * @returns State and action dispatchers.
 *
 * @example
 * ```tsx
 * const { status, state, resendIn, sendOtp, verifyOtp, authenticateWithBiometrics } = useAuthFlow({
 *   onSendOtp: async (phone) => api.sendOtp(phone),
 *   onVerifyOtp: async (code) => api.verifyOtp(code),
 *   onVerified: (token) => console.log('Authenticated:', token),
 * });
 * ```
 */
export function useAuthFlow<TToken = string>(
  options: UseAuthFlowOptions<TToken> = {}
): UseAuthFlowReturn<TToken> {
  const {
    strategy = 'hybrid',
    cooldownSeconds = 60,
    codeLength = 6,
    tokenParamName = 'token',
    onSendOtp,
    onVerifyOtp,
    onBiometricSuccess,
    onVerified,
    onError,
  } = options;

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const callbacksRef = useRef({
    onSendOtp,
    onVerifyOtp,
    onBiometricSuccess,
    onVerified,
    onError,
  });
  callbacksRef.current = {
    onSendOtp,
    onVerifyOtp,
    onBiometricSuccess,
    onVerified,
    onError,
  };

  const machineRef = useRef<AuthStateMachine<TToken, Error>>(
    new AuthStateMachine<TToken, Error>()
  );
  const otpManagerRef = useRef<OtpManager<TToken, Error>>(
    new OtpManager<TToken, Error>(machineRef.current, {
      cooldownSeconds,
      codeLength,
    })
  );

  const [state, setState] = useState<AuthState<TToken, Error>>(
    machineRef.current.getState()
  );
  const [resendIn, setResendIn] = useState<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const syncTimer = useCallback(() => {
    clearTimer();
    const remaining = otpManagerRef.current.getRemainingCooldown();
    if (isMountedRef.current) {
      setResendIn(remaining);
    }
    if (remaining <= 0) return;

    timerRef.current = setInterval(() => {
      const currentRemaining = otpManagerRef.current.getRemainingCooldown();
      if (!isMountedRef.current) {
        clearTimer();
        return;
      }
      setResendIn(currentRemaining);
      if (currentRemaining <= 0) {
        clearTimer();
      }
    }, 1000);
  }, [clearTimer]);

  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  useEffect(() => {
    const unsubscribe = machineRef.current.subscribe((newState) => {
      if (isMountedRef.current) {
        setState(newState);
      }
    });
    return unsubscribe;
  }, []);

  const sendOtp = useCallback(
    async (recipient: string) => {
      if (!strategyAllows(strategy, 'otp')) {
        warnUnsupported('otp', strategy);
        return;
      }

      const currentStatus = machineRef.current.getState().status;
      if (currentStatus === 'sending' || currentStatus === 'verifying') {
        return;
      }

      if (!otpManagerRef.current.canResend()) {
        return;
      }

      machineRef.current.dispatch({ type: 'SEND_CODE' });

      try {
        if (callbacksRef.current.onSendOtp) {
          await callbacksRef.current.onSendOtp(recipient);
        }
        if (!isMountedRef.current) return;
        machineRef.current.dispatch({ type: 'CODE_SENT' });
        otpManagerRef.current.startCooldown();
        syncTimer();
      } catch (err) {
        if (!isMountedRef.current) return;
        const error = err instanceof Error ? err : new Error(String(err));
        machineRef.current.dispatch({ type: 'SET_ERROR', payload: error });
        callbacksRef.current.onError?.(error);
      }
    },
    [strategy, syncTimer]
  );

  const verifyOtp = useCallback(
    async (code: string) => {
      if (!strategyAllows(strategy, 'otp')) {
        warnUnsupported('otp', strategy);
        return;
      }

      const currentStatus = machineRef.current.getState().status;
      if (currentStatus === 'verifying' || currentStatus === 'sending') {
        return;
      }

      if (!otpManagerRef.current.isValidCode(code)) {
        const err = new AuthError(
          `Invalid code format. Expected ${codeLength} digits.`,
          'INVALID_CODE'
        );
        machineRef.current.dispatch({ type: 'VERIFY_FAILURE', payload: err });
        callbacksRef.current.onError?.(err);
        return;
      }

      machineRef.current.dispatch({ type: 'VERIFY_CODE' });

      try {
        if (!callbacksRef.current.onVerifyOtp) {
          throw new AuthError(
            'No onVerifyOtp handler provided to useAuthFlow. Pass onVerifyOtp to verify submitted codes.',
            'NO_HANDLER'
          );
        }
        const token = await callbacksRef.current.onVerifyOtp(code);
        if (!isMountedRef.current) return;
        machineRef.current.dispatch({ type: 'VERIFY_SUCCESS', payload: token });
        callbacksRef.current.onVerified?.(token);
      } catch (err) {
        if (!isMountedRef.current) return;
        const error = err instanceof Error ? err : new Error(String(err));
        machineRef.current.dispatch({ type: 'VERIFY_FAILURE', payload: error });
        callbacksRef.current.onError?.(error);
      }
    },
    [strategy, codeLength]
  );

  const handleDeepLink = useCallback(
    (url: string) => {
      if (!strategyAllows(strategy, 'deep-link')) {
        warnUnsupported('deep-link', strategy);
        return;
      }

      try {
        const result = parseAuthDeepLink(url, tokenParamName);
        if (result.token) {
          machineRef.current.dispatch({
            type: 'VERIFY_SUCCESS',
            payload: result.token as unknown as TToken,
          });
          callbacksRef.current.onVerified?.(result.token as unknown as TToken);
        } else {
          const err = new AuthError(
            `No token parameter found in deep link URL: '${url}'. Verify that the link contains '?${tokenParamName}=...'.`,
            'AUTH_FAILED'
          );
          machineRef.current.dispatch({ type: 'SET_ERROR', payload: err });
          callbacksRef.current.onError?.(err);
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        machineRef.current.dispatch({ type: 'SET_ERROR', payload: error });
        callbacksRef.current.onError?.(error);
      }
    },
    [strategy, tokenParamName]
  );

  const authenticateWithBiometrics = useCallback(
    async (biometricOptions?: BiometricOptions): Promise<boolean> => {
      if (!strategyAllows(strategy, 'biometric')) {
        warnUnsupported('biometric', strategy);
        return false;
      }

      const currentStatus = machineRef.current.getState().status;
      if (currentStatus === 'verifying' || currentStatus === 'sending') {
        return false;
      }

      try {
        const res = await authenticateBiometric(biometricOptions);
        if (!isMountedRef.current) return false;

        if (res.success) {
          const token = callbacksRef.current.onBiometricSuccess
            ? await callbacksRef.current.onBiometricSuccess()
            : undefined;

          if (!isMountedRef.current) return false;

          machineRef.current.dispatch({
            type: 'VERIFY_SUCCESS',
            payload: (token ?? null) as unknown as TToken,
          });
          callbacksRef.current.onVerified?.(token);
          return true;
        } else {
          const err = new AuthError(
            res.error ?? 'Biometric authentication failed',
            'AUTH_FAILED'
          );
          machineRef.current.dispatch({ type: 'SET_ERROR', payload: err });
          callbacksRef.current.onError?.(err);
          return false;
        }
      } catch (err) {
        if (!isMountedRef.current) return false;
        const error = err instanceof Error ? err : new Error(String(err));
        machineRef.current.dispatch({ type: 'SET_ERROR', payload: error });
        callbacksRef.current.onError?.(error);
        return false;
      }
    },
    [strategy]
  );

  const reset = useCallback(() => {
    clearTimer();
    machineRef.current.dispatch({ type: 'RESET' });
    if (isMountedRef.current) {
      setResendIn(0);
    }
  }, [clearTimer]);

  const clearError = useCallback(() => {
    machineRef.current.dispatch({ type: 'CLEAR_ERROR' });
  }, []);

  return {
    status: state.status,
    state,
    resendIn,
    sendOtp,
    verifyOtp,
    handleDeepLink,
    authenticateWithBiometrics,
    clearError,
    reset,
  };
}
