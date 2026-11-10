import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthStateMachine } from '../core/state-machine';
import { OtpManager } from '../otp/otp-manager';

describe('OtpManager.resetCooldown', () => {
  it('should allow resending immediately after resetCooldown()', () => {
    const manager = new OtpManager(new AuthStateMachine(), { cooldownSeconds: 30 });
    manager.startCooldown();
    expect(manager.canResend()).toBe(false);
    manager.resetCooldown();
    expect(manager.canResend()).toBe(true);
    expect(manager.getRemainingCooldown()).toBe(0);
  });
});

describe('OtpManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should use default cooldown and code length', () => {
    const manager = new OtpManager(new AuthStateMachine());
    expect(manager.getCooldownSeconds()).toBe(60);
    expect(manager.getCodeLength()).toBe(6);
  });

  it('should honor custom options', () => {
    const manager = new OtpManager(new AuthStateMachine(), {
      cooldownSeconds: 30,
      codeLength: 4,
    });
    expect(manager.getCooldownSeconds()).toBe(30);
    expect(manager.getCodeLength()).toBe(4);
  });

  it('should validate numeric codes of the configured length', () => {
    const manager = new OtpManager(new AuthStateMachine(), { codeLength: 6 });
    expect(manager.isValidCode('123456')).toBe(true);
    expect(manager.isValidCode('12345')).toBe(false);
    expect(manager.isValidCode('1234567')).toBe(false);
    expect(manager.isValidCode('12ab56')).toBe(false);
    expect(manager.isValidCode(' 123456 ')).toBe(true);
  });

  it('should track cooldown remaining time', () => {
    const manager = new OtpManager(new AuthStateMachine(), {
      cooldownSeconds: 10,
    });

    expect(manager.canResend()).toBe(true);
    expect(manager.getRemainingCooldown()).toBe(0);

    manager.startCooldown();
    expect(manager.canResend()).toBe(false);
    expect(manager.getRemainingCooldown()).toBe(10);

    vi.advanceTimersByTime(3500);
    expect(manager.getRemainingCooldown()).toBe(7);

    vi.advanceTimersByTime(7000);
    expect(manager.getRemainingCooldown()).toBe(0);
    expect(manager.canResend()).toBe(true);
  });

  it('should expose underlying machine state', () => {
    const machine = new AuthStateMachine<string, Error>();
    const manager = new OtpManager(machine);

    machine.dispatch({ type: 'SEND_CODE' });
    expect(manager.getState().status).toBe('sending');
  });

  it('should handle isValidCode edge cases (non-numeric, internal whitespace, non-string, length)', () => {
    const manager = new OtpManager(new AuthStateMachine(), { codeLength: 6 });

    // Invalid formats
    expect(manager.isValidCode('')).toBe(false);
    expect(manager.isValidCode('   ')).toBe(false);
    expect(manager.isValidCode('12 34 56')).toBe(false);
    expect(manager.isValidCode('123 456')).toBe(false);
    expect(manager.isValidCode('12345e')).toBe(false);
    expect(manager.isValidCode('-12345')).toBe(false);
    expect(manager.isValidCode('+12345')).toBe(false);
    expect(manager.isValidCode('12.345')).toBe(false);
    expect(manager.isValidCode('١٢٣٤٥٦')).toBe(false); // Arabic digits
    expect(manager.isValidCode('１２３４５６')).toBe(false); // Full-width digits
    expect(manager.isValidCode('123456\n')).toBe(true); // Trimming works
    expect(manager.isValidCode('\t123456\t')).toBe(true);

    // Type safety edge cases
    expect(manager.isValidCode(null as unknown as string)).toBe(false);
    expect(manager.isValidCode(undefined as unknown as string)).toBe(false);
    expect(manager.isValidCode(123456 as unknown as string)).toBe(false);
    expect(manager.isValidCode({} as unknown as string)).toBe(false);
  });

  it('should handle cooldown edge cases (zero cooldown, repeated starts, expiry boundary)', () => {
    const zeroManager = new OtpManager(new AuthStateMachine(), { cooldownSeconds: 0 });
    expect(zeroManager.canResend()).toBe(true);
    expect(zeroManager.getRemainingCooldown()).toBe(0);
    zeroManager.startCooldown();
    expect(zeroManager.canResend()).toBe(true);
    expect(zeroManager.getRemainingCooldown()).toBe(0);

    const manager = new OtpManager(new AuthStateMachine(), { cooldownSeconds: 15 });
    manager.startCooldown();
    expect(manager.getRemainingCooldown()).toBe(15);

    // Repeated startCooldown resets the timer
    vi.advanceTimersByTime(5000);
    expect(manager.getRemainingCooldown()).toBe(10);
    manager.startCooldown();
    expect(manager.getRemainingCooldown()).toBe(15);

    // Exact expiry
    vi.advanceTimersByTime(15000);
    expect(manager.getRemainingCooldown()).toBe(0);
    expect(manager.canResend()).toBe(true);

    // Past expiry
    vi.advanceTimersByTime(5000);
    expect(manager.getRemainingCooldown()).toBe(0);
    expect(manager.canResend()).toBe(true);
  });
});
