import { useCallback, useEffect, useRef, useState } from 'react';
import { authenticateBiometric, BiometricOptions } from '../biometric';
import { AuthStateMachine } from '../core/state-machine';
import { AuthAction, AuthError, AuthState, AuthStatus } from '../core/types';
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
  /** Resets state back to 'idle', clears the resend cooldown, and discards results of in-flight requests. */
  reset: () => void;
}

function strategyAllows(strategy: AuthStrategy, feature: 'otp' | 'deep-link' | 'biometric'): boolean {
  if (strategy === 'hybrid') return true;
  return strategy === feature;
}

const isDev =
  Boolean((globalThis as unknown as { __DEV__?: boolean }).__DEV__) ||
  (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production');

const BIOMETRIC_CANCEL_ERRORS = new Set(['user_cancel', 'system_cancel', 'app_cancel']);

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

  // The manager is created once; keep it in sync if the caller changes these options.
  otpManagerRef.current.configure({ cooldownSeconds, codeLength });

  const [state, setState] = useState<AuthState<TToken, Error>>(
    machineRef.current.getState()
  );
  const [resendIn, setResendIn] = useState<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Bumped on reset() so async results from an abandoned flow are discarded.
  const flowIdRef = useRef(0);
  const biometricInFlightRef = useRef(false);

  const transition = useCallback((action: AuthAction<TToken, Error>): boolean => {
    const before = machineRef.current.getState();
    return machineRef.current.dispatch(action) !== before;
  }, []);

  const isStale = useCallback(
    (flowId: number) => !isMountedRef.current || flowId !== flowIdRef.current,
    []
  );

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

      if (!otpManagerRef.current.canResend()) {
        return;
      }

      // The reducer rejects SEND_CODE while sending, verifying, or already authenticated.
      if (!transition({ type: 'SEND_CODE' })) {
        return;
      }

      const flowId = flowIdRef.current;
      try {
        if (callbacksRef.current.onSendOtp) {
          await callbacksRef.current.onSendOtp(recipient);
        }
        if (isStale(flowId)) return;
        machineRef.current.dispatch({ type: 'CODE_SENT' });
        otpManagerRef.current.startCooldown();
        syncTimer();
      } catch (err) {
        if (isStale(flowId)) return;
        const error = err instanceof Error ? err : new Error(String(err));
        machineRef.current.dispatch({ type: 'SET_ERROR', payload: error });
        callbacksRef.current.onError?.(error);
      }
    },
    [strategy, syncTimer, transition, isStale]
  );

  const verifyOtp = useCallback(
    async (code: string) => {
      if (!strategyAllows(strategy, 'otp')) {
        warnUnsupported('otp', strategy);
        return;
      }

      // A code can only be verified after one was sent; this also blocks
      // double submits and re-verifying after success.
      if (machineRef.current.getState().status !== 'pending') {
        return;
      }

      if (!otpManagerRef.current.isValidCode(code)) {
        const err = new AuthError(
          `Invalid code format. Expected ${otpManagerRef.current.getCodeLength()} digits.`,
          'INVALID_CODE'
        );
        machineRef.current.dispatch({ type: 'VERIFY_FAILURE', payload: err });
        callbacksRef.current.onError?.(err);
        return;
      }

      machineRef.current.dispatch({ type: 'VERIFY_CODE' });

      const flowId = flowIdRef.current;
      try {
        if (!callbacksRef.current.onVerifyOtp) {
          throw new AuthError(
            'No onVerifyOtp handler provided to useAuthFlow. Pass onVerifyOtp to verify submitted codes.',
            'NO_HANDLER'
          );
        }
        const token = await callbacksRef.current.onVerifyOtp(code.trim());
        if (isStale(flowId)) return;
        if (transition({ type: 'VERIFY_SUCCESS', payload: token })) {
          callbacksRef.current.onVerified?.(token);
        }
      } catch (err) {
        if (isStale(flowId)) return;
        const error = err instanceof Error ? err : new Error(String(err));
        if (transition({ type: 'VERIFY_FAILURE', payload: error })) {
          callbacksRef.current.onError?.(error);
        }
      }
    },
    [strategy, transition, isStale]
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
          const token = result.token as unknown as TToken;
          // Duplicate deliveries of the same link (initial URL + 'url' event) must not re-fire onVerified.
          if (transition({ type: 'VERIFY_SUCCESS', payload: token })) {
            callbacksRef.current.onVerified?.(token);
          }
        } else {
          // Apps often forward every incoming link here, so an unrelated link must not
          // derail an in-progress flow: report it, but leave the state untouched.
          const err = new AuthError(
            `No token parameter found in deep link URL: '${url}'. Verify that the link contains '?${tokenParamName}=...'.`,
            'AUTH_FAILED'
          );
          callbacksRef.current.onError?.(err);
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        if (transition({ type: 'SET_ERROR', payload: error })) {
          callbacksRef.current.onError?.(error);
        }
      }
    },
    [strategy, tokenParamName, transition]
  );

  const authenticateWithBiometrics = useCallback(
    async (biometricOptions?: BiometricOptions): Promise<boolean> => {
      if (!strategyAllows(strategy, 'biometric')) {
        warnUnsupported('biometric', strategy);
        return false;
      }

      const currentStatus = machineRef.current.getState().status;
      if (
        biometricInFlightRef.current ||
        currentStatus === 'verifying' ||
        currentStatus === 'sending' ||
        currentStatus === 'success'
      ) {
        return false;
      }

      biometricInFlightRef.current = true;
      const flowId = flowIdRef.current;
      try {
        const res = await authenticateBiometric(biometricOptions);
        if (isStale(flowId)) return false;

        if (res.success) {
          const token = callbacksRef.current.onBiometricSuccess
            ? await callbacksRef.current.onBiometricSuccess()
            : undefined;

          if (isStale(flowId)) return false;

          if (
            !transition({
              type: 'VERIFY_SUCCESS',
              payload: (token ?? null) as unknown as TToken,
            })
          ) {
            return false;
          }
          callbacksRef.current.onVerified?.(token);
          return true;
        }

        // Dismissing the prompt is a user choice, not a failure: keep the current
        // flow (e.g. a pending OTP) intact so the user can continue another way.
        if (res.error && BIOMETRIC_CANCEL_ERRORS.has(res.error)) {
          return false;
        }

        const err = new AuthError(
          res.error ?? 'Biometric authentication failed',
          'AUTH_FAILED'
        );
        if (transition({ type: 'SET_ERROR', payload: err })) {
          callbacksRef.current.onError?.(err);
        }
        return false;
      } catch (err) {
        if (isStale(flowId)) return false;
        const error = err instanceof Error ? err : new Error(String(err));
        if (transition({ type: 'SET_ERROR', payload: error })) {
          callbacksRef.current.onError?.(error);
        }
        return false;
      } finally {
        biometricInFlightRef.current = false;
      }
    },
    [strategy, transition, isStale]
  );

  const reset = useCallback(() => {
    flowIdRef.current += 1;
    clearTimer();
    otpManagerRef.current.resetCooldown();
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
