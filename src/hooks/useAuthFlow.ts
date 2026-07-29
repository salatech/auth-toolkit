import { useCallback, useEffect, useRef, useState } from 'react';
import { authenticateBiometric, BiometricOptions } from '../biometric';
import { AuthStateMachine } from '../core/state-machine';
import { AuthState, AuthStatus } from '../core/types';
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
  /** Called after biometric hardware auth succeeds. Return a session token when available. */
  onBiometricSuccess?: () => Promise<TToken> | TToken;
  onVerified?: (token: TToken) => void;
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

  useEffect(() => {
    const unsubscribe = machineRef.current.subscribe((newState) => {
      setState(newState);
    });
    return unsubscribe;
  }, []);

  // Cooldown ticker loop
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    if (resendIn > 0) {
      interval = setInterval(() => {
        const remaining = otpManagerRef.current.getRemainingCooldown();
        setResendIn(remaining);
        if (remaining <= 0 && interval) {
          clearInterval(interval);
        }
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [resendIn]);

  const rejectUnsupported = useCallback(
    (feature: string) => {
      const error = new Error(
        `[auth-toolkit] '${feature}' is not enabled for strategy '${strategy}'.`
      );
      machineRef.current.dispatch({ type: 'SET_ERROR', payload: error });
      if (onError) onError(error);
    },
    [strategy, onError]
  );

  const sendOtp = useCallback(
    async (recipient: string) => {
      if (!strategyAllows(strategy, 'otp')) {
        rejectUnsupported('otp');
        return;
      }

      if (!otpManagerRef.current.canResend()) {
        return;
      }

      machineRef.current.dispatch({ type: 'SEND_CODE' });

      try {
        if (onSendOtp) {
          await onSendOtp(recipient);
        }
        machineRef.current.dispatch({ type: 'CODE_SENT' });
        otpManagerRef.current.startCooldown();
        setResendIn(otpManagerRef.current.getRemainingCooldown());
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        machineRef.current.dispatch({ type: 'SET_ERROR', payload: error });
        if (onError) onError(error);
      }
    },
    [strategy, rejectUnsupported, onSendOtp, onError]
  );

  const verifyOtp = useCallback(
    async (code: string) => {
      if (!strategyAllows(strategy, 'otp')) {
        rejectUnsupported('otp');
        return;
      }

      if (!otpManagerRef.current.isValidCode(code)) {
        const err = new Error(`Invalid code format. Expected ${codeLength} digits.`);
        // Retryable: stay on the OTP entry screen
        machineRef.current.dispatch({ type: 'VERIFY_FAILURE', payload: err });
        if (onError) onError(err);
        return;
      }

      machineRef.current.dispatch({ type: 'VERIFY_CODE' });

      try {
        if (!onVerifyOtp) {
          throw new Error('No onVerifyOtp handler provided to useAuthFlow');
        }
        const token = await onVerifyOtp(code);
        machineRef.current.dispatch({ type: 'VERIFY_SUCCESS', payload: token });
        if (onVerified) onVerified(token);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        machineRef.current.dispatch({ type: 'VERIFY_FAILURE', payload: error });
        if (onError) onError(error);
      }
    },
    [strategy, rejectUnsupported, codeLength, onVerifyOtp, onVerified, onError]
  );

  const handleDeepLink = useCallback(
    (url: string) => {
      if (!strategyAllows(strategy, 'deep-link')) {
        rejectUnsupported('deep-link');
        return;
      }

      try {
        const result = parseAuthDeepLink(url, tokenParamName);
        if (result.token) {
          machineRef.current.dispatch({
            type: 'VERIFY_SUCCESS',
            payload: result.token as unknown as TToken,
          });
          if (onVerified) onVerified(result.token as unknown as TToken);
        } else {
          const err = new Error('No token parameter found in deep link URL');
          machineRef.current.dispatch({ type: 'SET_ERROR', payload: err });
          if (onError) onError(err);
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        machineRef.current.dispatch({ type: 'SET_ERROR', payload: error });
        if (onError) onError(error);
      }
    },
    [strategy, rejectUnsupported, tokenParamName, onVerified, onError]
  );

  const authenticateWithBiometrics = useCallback(
    async (biometricOptions?: BiometricOptions): Promise<boolean> => {
      if (!strategyAllows(strategy, 'biometric')) {
        rejectUnsupported('biometric');
        return false;
      }

      try {
        const res = await authenticateBiometric(biometricOptions);
        if (res.success) {
          const token = onBiometricSuccess
            ? await onBiometricSuccess()
            : ('biometric-verified' as unknown as TToken);

          machineRef.current.dispatch({
            type: 'VERIFY_SUCCESS',
            payload: token,
          });
          if (onVerified) onVerified(token);
          return true;
        } else {
          const err = new Error(res.error ?? 'Biometric authentication failed');
          machineRef.current.dispatch({ type: 'SET_ERROR', payload: err });
          if (onError) onError(err);
          return false;
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        machineRef.current.dispatch({ type: 'SET_ERROR', payload: error });
        if (onError) onError(error);
        return false;
      }
    },
    [strategy, rejectUnsupported, onBiometricSuccess, onVerified, onError]
  );

  const reset = useCallback(() => {
    machineRef.current.dispatch({ type: 'RESET' });
    setResendIn(0);
  }, []);

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
