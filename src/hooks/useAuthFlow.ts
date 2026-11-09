import { useCallback, useEffect, useRef, useState } from 'react';
import { authenticateBiometric, BiometricOptions } from '../biometric';
import { AuthStateMachine } from '../core/state-machine';
import { AuthError, AuthState, AuthStatus } from '../core/types';
import { parseAuthDeepLink } from '../deep-link';
import { OtpManager } from '../otp';

export type AuthStrategy = 'otp' | 'deep-link' | 'biometric' | 'hybrid';

export interface UseAuthFlowOptions<TToken = string> {
  strategy?: AuthStrategy;
  cooldownSeconds?: number;
  codeLength?: number;
  tokenParamName?: string;
  onSendOtp?: (recipient: string) => Promise<void>;
  onVerifyOtp?: (code: string) => Promise<TToken>;
  /**
   * Called after biometric hardware auth succeeds. Return a session token when available.
   * If omitted, no token is minted, state.data is null, and onVerified is called without a token.
   */
  onBiometricSuccess?: () => Promise<TToken> | TToken;
  onVerified?: (token?: TToken) => void;
  onError?: (error: Error) => void;
}

export interface UseAuthFlowReturn<TToken = string> {
  status: AuthStatus;
  state: AuthState<TToken, Error>;
  resendIn: number;
  sendOtp: (recipient: string) => Promise<void>;
  verifyOtp: (code: string) => Promise<void>;
  handleDeepLink: (url: string) => void;
  authenticateWithBiometrics: (options?: BiometricOptions) => Promise<boolean>;
  /** Clears a retryable error while status is `pending` (e.g. after failed OTP verify). */
  clearError: () => void;
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
