import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __setExpoLinkingForTests } from '../deep-link/parser';
import { useAuthFlow } from '../hooks/useAuthFlow';

describe('useAuthFlow', () => {
  beforeEach(() => {
    __setExpoLinkingForTests({
      parse: vi.fn(),
      addEventListener: vi.fn(),
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

  it('should reject unsupported methods for a single strategy', async () => {
    const onError = vi.fn();

    const { result } = renderHook(() =>
      useAuthFlow({
        strategy: 'otp',
        onError,
      })
    );

    await act(async () => {
      await result.current.authenticateWithBiometrics();
    });

    expect(result.current.status).toBe('error');
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("'biometric' is not enabled"),
      })
    );
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
