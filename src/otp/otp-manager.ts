import { AuthStateMachine } from '../core/state-machine';
import { AuthState } from '../core/types';

/**
 * Configuration options for the OTP manager.
 */
export interface OtpManagerOptions {
  /** Resend cooldown duration in seconds. Defaults to 60. */
  cooldownSeconds?: number;
  /** Expected digit count for the OTP code. Defaults to 6. */
  codeLength?: number;
}

/**
 * Headless OTP lifecycle manager handling code length validation and resend cooldowns.
 *
 * @template TData - Type of authenticated payload.
 * @template TError - Type of error object.
 *
 * @example
 * ```ts
 * const manager = new OtpManager(machine, { cooldownSeconds: 30, codeLength: 6 });
 * if (manager.isValidCode(userInput)) {
 *   machine.dispatch({ type: 'VERIFY_CODE' });
 * }
 * ```
 */
export class OtpManager<TData = unknown, TError = Error> {
  private machine: AuthStateMachine<TData, TError>;
  private cooldownSeconds: number;
  private codeLength: number;
  private cooldownEndTime: number | null = null;

  /**
   * Creates an OtpManager instance bound to an AuthStateMachine.
   * @param machine - The underlying state machine.
   * @param options - Optional cooldown and code length configuration.
   */
  constructor(
    machine: AuthStateMachine<TData, TError>,
    options: OtpManagerOptions = {}
  ) {
    this.machine = machine;
    this.cooldownSeconds = Math.max(0, options.cooldownSeconds ?? 60);
    this.codeLength = Math.max(1, options.codeLength ?? 6);
  }

  /**
   * Returns configured code length (digit count).
   */
  public getCodeLength(): number {
    return this.codeLength;
  }

  /**
   * Returns configured resend cooldown in seconds.
   */
  public getCooldownSeconds(): number {
    return this.cooldownSeconds;
  }

  /**
   * Starts or restarts the resend cooldown timer.
   */
  public startCooldown(): void {
    if (this.cooldownSeconds <= 0) {
      this.cooldownEndTime = null;
      return;
    }
    this.cooldownEndTime = Date.now() + this.cooldownSeconds * 1000;
  }

  /**
   * Updates code length and/or cooldown duration on a live manager. An active cooldown keeps
   * its original end time; the new duration applies from the next `startCooldown()`.
   *
   * @param options - Values to change; omitted fields keep their current value.
   * @returns Nothing.
   *
   * @example
   * ```ts
   * manager.configure({ codeLength: 4 });
   * manager.isValidCode('1234'); // true
   * ```
   */
  public configure(options: OtpManagerOptions): void {
    if (options.cooldownSeconds !== undefined) {
      this.cooldownSeconds = Math.max(0, options.cooldownSeconds);
    }
    if (options.codeLength !== undefined) {
      this.codeLength = Math.max(1, options.codeLength);
    }
  }

  /**
   * Clears any active resend cooldown so a new code can be sent immediately.
   *
   * @returns Nothing.
   *
   * @example
   * ```ts
   * manager.resetCooldown();
   * manager.canResend(); // true
   * ```
   */
  public resetCooldown(): void {
    this.cooldownEndTime = null;
  }

  /**
   * Returns the number of seconds remaining before resending is permitted (rounded up).
   */
  public getRemainingCooldown(): number {
    if (!this.cooldownEndTime) return 0;
    const remainingMs = this.cooldownEndTime - Date.now();
    if (remainingMs <= 0) {
      this.cooldownEndTime = null;
      return 0;
    }
    return Math.max(0, Math.ceil(remainingMs / 1000));
  }

  /**
   * Returns true if the cooldown has elapsed and a new code can be sent.
   */
  public canResend(): boolean {
    return this.getRemainingCooldown() === 0;
  }

  /**
   * Validates whether a candidate code consists exclusively of ASCII digits matching codeLength.
   * Handles trimming and rejects non-string or whitespace-only inputs.
   *
   * @param code - Code string to validate.
   * @returns True if valid format, false otherwise.
   */
  public isValidCode(code: string): boolean {
    if (typeof code !== 'string') return false;
    const trimmed = code.trim();
    if (!trimmed) return false;
    const numericRegex = new RegExp(`^[0-9]{${this.codeLength}}$`);
    return numericRegex.test(trimmed);
  }

  /**
   * Returns the current state snapshot from the underlying AuthStateMachine.
   */
  public getState(): AuthState<TData, TError> {
    return this.machine.getState();
  }
}
