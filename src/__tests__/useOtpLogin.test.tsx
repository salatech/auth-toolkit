import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useOtpLogin } from '../hooks/useOtpLogin';

describe('useOtpLogin', () => {
  it('should run a complete OTP login flow', async () => {
    const onSendOtp = vi.fn().mockResolvedValue(undefined);
    const onVerifyOtp = vi.fn().mockResolvedValue('jwt-session-xyz');
    const onVerified = vi.fn();

    const { result } = renderHook(() =>
      useOtpLogin({
        onSendOtp,
        onVerifyOtp,
        onVerified,
        cooldownSeconds: 30,
        codeLength: 6,
      })
    );

    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
    expect(result.current.resendIn).toBe(0);

    // 1. Send OTP
    await act(async () => {
      await result.current.sendOtp('+1234567890');
    });

    expect(onSendOtp).toHaveBeenCalledWith('+1234567890');
    expect(result.current.status).toBe('pending');
    expect(result.current.resendIn).toBeGreaterThan(0);

    // 2. Verify OTP
    await act(async () => {
      await result.current.verifyOtp('123456');
    });

    await waitFor(() => {
      expect(result.current.status).toBe('success');
    });
    expect(onVerifyOtp).toHaveBeenCalledWith('123456');
    expect(onVerified).toHaveBeenCalledWith('jwt-session-xyz');
  });

  it('should handle verification errors as retryable and support clearError', async () => {
    const onSendOtp = vi.fn().mockResolvedValue(undefined);
    const onVerifyOtp = vi.fn().mockRejectedValue(new Error('Incorrect OTP code'));
    const onError = vi.fn();

    const { result } = renderHook(() =>
      useOtpLogin({
        onSendOtp,
        onVerifyOtp,
        onError,
      })
    );

    await act(async () => {
      await result.current.sendOtp('+1234567890');
    });

    // Invalid format check
    await act(async () => {
      await result.current.verifyOtp('12');
    });

    expect(result.current.status).toBe('pending');
    expect(result.current.error?.message).toContain('Expected 6 digits');

    // Clear error
    act(() => {
      result.current.clearError();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.status).toBe('pending');

    // Server verification failure
    await act(async () => {
      await result.current.verifyOtp('123456');
    });

    expect(result.current.status).toBe('pending');
    expect(result.current.error?.message).toBe('Incorrect OTP code');
    expect(onError).toHaveBeenCalled();
  });

  it('should reset back to idle state', async () => {
    const onSendOtp = vi.fn().mockResolvedValue(undefined);
    const onVerifyOtp = vi.fn().mockResolvedValue('token');

    const { result } = renderHook(() =>
      useOtpLogin({
        onSendOtp,
        onVerifyOtp,
      })
    );

    await act(async () => {
      await result.current.sendOtp('+1234567890');
    });

    expect(result.current.status).toBe('pending');

    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
    expect(result.current.resendIn).toBe(0);
  });
});
