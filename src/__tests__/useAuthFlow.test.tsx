import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __setExpoLocalAuthenticationForTests } from '../biometric/authenticator';
import { __setExpoLinkingForTests } from '../deep-link/parser';
import { useAuthFlow } from '../hooks/useAuthFlow';

describe('useAuthFlow', () => {
  beforeEach(() => {
    __setExpoLinkingForTests({
      parse: vi.fn(),
      addEventListener: vi.fn(),
    });
    __setExpoLocalAuthenticationForTests({
      hasHardwareAsync: vi.fn().mockResolvedValue(true),
      isEnrolledAsync: vi.fn().mockResolvedValue(true),
      authenticateAsync: vi.fn().mockResolvedValue({ success: true }),
    });
  });

  it('should run the OTP send and verify flow', async () => {
    const onSendOtp = vi.fn().mockResolvedValue(undefined);
    const onVerifyOtp = vi.fn().mockResolvedValue('session-token');
    const onVerified = vi.fn();

    const { result } = renderHook(() =>
      useAuthFlow({
        strategy: 'otp',
        cooldownSeconds: 10,
        codeLength: 6,
        onSendOtp,
        onVerifyOtp,
        onVerified,
      })
    );

    expect(result.current.status).toBe('idle');

    await act(async () => {
      await result.current.sendOtp('+15555550100');
    });

    expect(onSendOtp).toHaveBeenCalledWith('+15555550100');
    expect(result.current.status).toBe('pending');
    expect(result.current.resendIn).toBeGreaterThan(0);

    await act(async () => {
      await result.current.verifyOtp('123456');
    });

    await waitFor(() => {
      expect(result.current.status).toBe('success');
    });
    expect(onVerifyOtp).toHaveBeenCalledWith('123456');
    expect(onVerified).toHaveBeenCalledWith('session-token');
  });

  it('should keep pending status and expose error on verify failure', async () => {
    const onSendOtp = vi.fn().mockResolvedValue(undefined);
    const onVerifyOtp = vi.fn().mockRejectedValue(new Error('Wrong code'));
    const onError = vi.fn();

    const { result } = renderHook(() =>
      useAuthFlow({
        strategy: 'otp',
        onSendOtp,
        onVerifyOtp,
        onError,
      })
    );

    await act(async () => {
      await result.current.sendOtp('+15555550100');
      await result.current.verifyOtp('123456');
    });

    expect(result.current.status).toBe('pending');
    expect(result.current.state.error?.message).toBe('Wrong code');
    expect(onError).toHaveBeenCalled();
  });

  it('should clear retryable errors via clearError', async () => {
    const onSendOtp = vi.fn().mockResolvedValue(undefined);
    const onVerifyOtp = vi.fn().mockRejectedValue(new Error('Wrong code'));

    const { result } = renderHook(() =>
      useAuthFlow({
        strategy: 'otp',
        onSendOtp,
        onVerifyOtp,
      })
    );

    await act(async () => {
      await result.current.sendOtp('+15555550100');
      await result.current.verifyOtp('123456');
    });

    act(() => {
      result.current.clearError();
    });

    expect(result.current.status).toBe('pending');
    expect(result.current.state.error).toBeNull();
  });

  it('should safely gate unsupported methods without setting error status', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onError = vi.fn();

    const { result } = renderHook(() =>
      useAuthFlow({
        strategy: 'otp',
        onError,
      })
    );

    let authResult: boolean | undefined;
    await act(async () => {
      authResult = await result.current.authenticateWithBiometrics();
    });

    // Does NOT trap in 'error' status; returns false; warns in dev
    expect(authResult).toBe(false);
    expect(result.current.status).toBe('idle');
    expect(onError).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Feature 'biometric' was invoked, but is not enabled for strategy 'otp'")
    );

    warnSpy.mockRestore();
  });

  it('should not fabricate fake biometric tokens when onBiometricSuccess is omitted', async () => {
    const onVerified = vi.fn();

    const { result } = renderHook(() =>
      useAuthFlow({
        strategy: 'biometric',
        onVerified,
      })
    );

    await act(async () => {
      const success = await result.current.authenticateWithBiometrics();
      expect(success).toBe(true);
    });

    expect(result.current.status).toBe('success');
    expect(result.current.state.data).toBeNull();
    // onVerified called with undefined instead of fake 'biometric-verified'
    expect(onVerified).toHaveBeenCalledWith(undefined);
  });

  it('should deliver session token when onBiometricSuccess is provided', async () => {
    const onVerified = vi.fn();
    const onBiometricSuccess = vi.fn().mockResolvedValue('server-jwt-xyz');

    const { result } = renderHook(() =>
      useAuthFlow({
        strategy: 'biometric',
        onBiometricSuccess,
        onVerified,
      })
    );

    await act(async () => {
      const success = await result.current.authenticateWithBiometrics();
      expect(success).toBe(true);
    });

    expect(result.current.status).toBe('success');
    expect(result.current.state.data).toBe('server-jwt-xyz');
    expect(onVerified).toHaveBeenCalledWith('server-jwt-xyz');
  });

  it('should ignore duplicate concurrent verifyOtp calls (double submit)', async () => {
    let resolveVerify: (token: string) => void;
    const onVerifyOtp = vi.fn().mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveVerify = resolve;
        })
    );

    const onSendOtp = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAuthFlow({
        strategy: 'otp',
        onSendOtp,
        onVerifyOtp,
      })
    );

    await act(async () => {
      await result.current.sendOtp('+15555550100');
    });

    // Start verification
    let p1: Promise<void>;
    act(() => {
      p1 = result.current.verifyOtp('123456');
    });

    expect(result.current.status).toBe('verifying');

    // Concurrent second submission (e.g. fast double-tap)
    await act(async () => {
      await result.current.verifyOtp('123456');
    });

    // Should only have called onVerifyOtp once
    expect(onVerifyOtp).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveVerify!('session-token');
      await p1!;
    });

    expect(result.current.status).toBe('success');
  });

  it('should ignore duplicate concurrent sendOtp calls while already sending', async () => {
    let resolveSend: () => void;
    const onSendOtp = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSend = resolve;
        })
    );

    const { result } = renderHook(() =>
      useAuthFlow({
        strategy: 'otp',
        onSendOtp,
      })
    );

    let p1: Promise<void>;
    act(() => {
      p1 = result.current.sendOtp('+15555550100');
    });

    expect(result.current.status).toBe('sending');

    // Concurrent second send
    await act(async () => {
      await result.current.sendOtp('+15555550100');
    });

    expect(onSendOtp).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSend!();
      await p1!;
    });

    expect(result.current.status).toBe('pending');
  });

  it('should safely unmount without state updates or memory leaks', async () => {
    let resolveVerify: (token: string) => void;
    const onVerifyOtp = vi.fn().mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveVerify = resolve;
        })
    );

    const onSendOtp = vi.fn().mockResolvedValue(undefined);

    const { result, unmount } = renderHook(() =>
      useAuthFlow({
        strategy: 'otp',
        onSendOtp,
        onVerifyOtp,
      })
    );

    await act(async () => {
      await result.current.sendOtp('+15555550100');
    });

    act(() => {
      result.current.verifyOtp('123456');
    });

    // Unmount while verification is in-flight
    unmount();

    // Resolving after unmount should not throw
    await act(async () => {
      resolveVerify!('late-token');
    });
  });

  it('should discard a verify result that resolves after reset()', async () => {
    let resolveVerify: (token: string) => void;
    const onVerifyOtp = vi.fn().mockImplementation(
      () => new Promise<string>((resolve) => { resolveVerify = resolve; })
    );
    const onVerified = vi.fn();

    const { result } = renderHook(() =>
      useAuthFlow({ strategy: 'otp', onSendOtp: vi.fn().mockResolvedValue(undefined), onVerifyOtp, onVerified })
    );

    await act(async () => {
      await result.current.sendOtp('+15555550100');
    });
    let p: Promise<void>;
    act(() => {
      p = result.current.verifyOtp('123456');
    });
    act(() => {
      result.current.reset();
    });
    await act(async () => {
      resolveVerify!('stale-token');
      await p!;
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.state.data).toBeNull();
    expect(onVerified).not.toHaveBeenCalled();
  });

  it('should not verify before a code was sent or after success', async () => {
    const onVerifyOtp = vi.fn().mockResolvedValue('token');
    const onVerified = vi.fn();
    const { result } = renderHook(() =>
      useAuthFlow({ strategy: 'otp', onSendOtp: vi.fn().mockResolvedValue(undefined), onVerifyOtp, onVerified })
    );

    await act(async () => {
      await result.current.verifyOtp('123456');
    });
    expect(onVerifyOtp).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');

    await act(async () => {
      await result.current.sendOtp('+15555550100');
      await result.current.verifyOtp('123456');
      await result.current.verifyOtp('123456');
    });
    expect(onVerifyOtp).toHaveBeenCalledTimes(1);
    expect(onVerified).toHaveBeenCalledTimes(1);
  });

  it('should not send another OTP once authenticated', async () => {
    const onSendOtp = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useAuthFlow({ strategy: 'otp', cooldownSeconds: 0, onSendOtp, onVerifyOtp: vi.fn().mockResolvedValue('t') })
    );

    await act(async () => {
      await result.current.sendOtp('+15555550100');
      await result.current.verifyOtp('123456');
      await result.current.sendOtp('+15555550100');
    });

    expect(result.current.status).toBe('success');
    expect(onSendOtp).toHaveBeenCalledTimes(1);
  });

  it('should allow sending immediately after reset() even if cooldown was active', async () => {
    const onSendOtp = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useAuthFlow({ strategy: 'otp', cooldownSeconds: 60, onSendOtp })
    );

    await act(async () => {
      await result.current.sendOtp('+15555550100');
    });
    act(() => {
      result.current.reset();
    });
    await act(async () => {
      await result.current.sendOtp('+15555550199');
    });

    expect(onSendOtp).toHaveBeenCalledTimes(2);
    expect(onSendOtp).toHaveBeenLastCalledWith('+15555550199');
    expect(result.current.status).toBe('pending');
  });

  it('should fire onVerified once when the same magic link is delivered twice', () => {
    __setExpoLinkingForTests({
      parse: vi.fn().mockReturnValue({ path: 'auth', queryParams: { token: 'magic' } }),
      addEventListener: vi.fn(),
    });
    const onVerified = vi.fn();
    const { result } = renderHook(() => useAuthFlow({ strategy: 'deep-link', onVerified }));

    act(() => {
      result.current.handleDeepLink('myapp://auth?token=magic');
      result.current.handleDeepLink('myapp://auth?token=magic');
    });

    expect(result.current.status).toBe('success');
    expect(onVerified).toHaveBeenCalledTimes(1);
  });

  it('should treat a cancelled biometric prompt as a no-op, keeping a pending OTP flow', async () => {
    __setExpoLocalAuthenticationForTests({
      hasHardwareAsync: vi.fn().mockResolvedValue(true),
      isEnrolledAsync: vi.fn().mockResolvedValue(true),
      authenticateAsync: vi.fn().mockResolvedValue({ success: false, error: 'user_cancel' }),
    });
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useAuthFlow({ onSendOtp: vi.fn().mockResolvedValue(undefined), onError })
    );

    await act(async () => {
      await result.current.sendOtp('+15555550100');
    });
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.authenticateWithBiometrics();
    });

    expect(ok).toBe(false);
    expect(result.current.status).toBe('pending');
    expect(onError).not.toHaveBeenCalled();
  });

  it('should only show one biometric prompt for concurrent calls', async () => {
    let resolvePrompt: (r: { success: boolean }) => void;
    const authenticateAsync = vi.fn().mockImplementation(
      () => new Promise((resolve) => { resolvePrompt = resolve; })
    );
    __setExpoLocalAuthenticationForTests({
      hasHardwareAsync: vi.fn().mockResolvedValue(true),
      isEnrolledAsync: vi.fn().mockResolvedValue(true),
      authenticateAsync,
    });
    const { result } = renderHook(() => useAuthFlow({ strategy: 'biometric' }));

    let first: Promise<boolean>;
    let second: boolean | undefined;
    await act(async () => {
      first = result.current.authenticateWithBiometrics();
      second = await result.current.authenticateWithBiometrics();
    });
    await act(async () => {
      resolvePrompt!({ success: true });
      await first!;
    });

    expect(second).toBe(false);
    expect(authenticateAsync).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('success');
  });

  it('should reset to idle', async () => {
    const onSendOtp = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAuthFlow({
        strategy: 'otp',
        onSendOtp,
      })
    );

    await act(async () => {
      await result.current.sendOtp('+15555550100');
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.resendIn).toBe(0);
  });
});
