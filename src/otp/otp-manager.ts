import { AuthStateMachine } from '../core/state-machine';
import { AuthState } from '../core/types';

export interface OtpManagerOptions {
  cooldownSeconds?: number;
  codeLength?: number;
}

export class OtpManager<TData = unknown, TError = Error> {
  private machine: AuthStateMachine<TData, TError>;
  private cooldownSeconds: number;
  private codeLength: number;
  private cooldownEndTime: number | null = null;

  constructor(
    machine: AuthStateMachine<TData, TError>,
    options: OtpManagerOptions = {}
  ) {
    this.machine = machine;
    this.cooldownSeconds = Math.max(0, options.cooldownSeconds ?? 60);
    this.codeLength = Math.max(1, options.codeLength ?? 6);
  }

  public getCodeLength(): number {
    return this.codeLength;
  }

  public getCooldownSeconds(): number {
    return this.cooldownSeconds;
  }

  public startCooldown(): void {
    if (this.cooldownSeconds <= 0) {
      this.cooldownEndTime = null;
      return;
    }
    this.cooldownEndTime = Date.now() + this.cooldownSeconds * 1000;
  }

  public getRemainingCooldown(): number {
    if (!this.cooldownEndTime) return 0;
    const remainingMs = this.cooldownEndTime - Date.now();
    if (remainingMs <= 0) {
      this.cooldownEndTime = null;
      return 0;
    }
    return Math.max(0, Math.ceil(remainingMs / 1000));
  }

  public canResend(): boolean {
    return this.getRemainingCooldown() === 0;
  }

  public isValidCode(code: string): boolean {
    if (typeof code !== 'string') return false;
    const trimmed = code.trim();
    if (!trimmed) return false;
    const numericRegex = new RegExp(`^[0-9]{${this.codeLength}}$`);
    return numericRegex.test(trimmed);
  }

  public getState(): AuthState<TData, TError> {
    return this.machine.getState();
  }
}
