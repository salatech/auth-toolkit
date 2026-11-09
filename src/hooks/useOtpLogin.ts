import { AuthStatus } from '../core/types';
import { useAuthFlow } from './useAuthFlow';

export interface UseOtpLoginOptions<TToken = string> {
  /** Async function invoked to dispatch an OTP code to the recipient (e.g. SMS or email API). */
  onSendOtp: (recipient: string) => Promise<void>;
  /** Async function invoked to verify the submitted OTP code with the backend. Returns auth token/payload. */
  onVerifyOtp: (code: string) => Promise<TToken>;
  /** Callback fired when verification succeeds. */
  onVerified?: (token?: TToken) => void;
  /** Callback fired when an error occurs during send or verify. */
  onError?: (error: Error) => void;
  /** Number of digits in the OTP code. Defaults to 6. */
  codeLength?: number;
  /** Cooldown duration between resend attempts in seconds. Defaults to 60. */
  cooldownSeconds?: number;
}

export interface UseOtpLoginReturn {
  /** Current authentication status in the state machine. */
  status: AuthStatus;
  /** Error object if the last operation failed, or null. */
  error: Error | null;
  /** Seconds remaining before resending is permitted. */
  resendIn: number;
  /** Dispatches an OTP to the given phone number or email address. */
  sendOtp: (recipient: string) => Promise<void>;
  /** Verifies an entered OTP code against onVerifyOtp. */
  verifyOtp: (code: string) => Promise<void>;
  /** Clears a retryable verification error while status is 'pending'. */
  clearError: () => void;
  /** Resets state back to 'idle'. */
  reset: () => void;
}

/**
 * Streamlined React hook for standard One-Time Password (OTP) login flows.
 *
 * Handles code dispatching, validation against numeric code length, resend cooldown timers,
 * and retryable verification errors out of the box.
 *
 * @example
 * ```tsx
 * const { status, error, resendIn, sendOtp, verifyOtp, reset } = useOtpLogin({
 *   onSendOtp: async (phone) => { await api.sendOtp(phone); },
 *   onVerifyOtp: async (code) => { return await api.verifyOtp(phone, code); },
 *   onVerified: (token) => { router.replace('/dashboard'); },
 * });
 * ```
 */
export function useOtpLogin<TToken = string>(
  options: UseOtpLoginOptions<TToken>
): UseOtpLoginReturn {
  const {
    status,
    state,
    resendIn,
    sendOtp,
    verifyOtp,
    clearError,
    reset,
  } = useAuthFlow<TToken>({
    strategy: 'otp',
    ...options,
  });

  return {
    status,
    error: state.error,
    resendIn,
    sendOtp,
    verifyOtp,
    clearError,
    reset,
  };
}
