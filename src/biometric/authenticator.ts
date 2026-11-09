import { AuthError } from '../core/types';

/**
 * Options configuring the native biometric authentication prompt.
 */
export interface BiometricOptions {
  /** Title or message displayed on the native biometric dialog. Defaults to `'Authenticate to continue'`. */
  promptMessage?: string;
  /** Label for the cancel button. Defaults to `'Cancel'`. */
  cancelLabel?: string;
  /** Label for the passcode fallback button. Defaults to `'Use Passcode'`. */
  fallbackLabel?: string;
  /** When true, prevents the user from falling back to entering device PIN/passcode. Defaults to false. */
  disableDeviceFallback?: boolean;
}

/**
 * Result returned from a biometric verification attempt.
 */
export interface BiometricResult {
  /** Whether the user successfully authenticated. */
  success: boolean;
  /** Error message if authentication failed or was cancelled. */
  error?: string;
}

/**
 * Expected shape of the lazy-loaded `expo-local-authentication` module.
 */
export interface ExpoLocalAuthenticationModule {
  /** Checks if biometric hardware exists on the device. */
  hasHardwareAsync: () => Promise<boolean>;
  /** Checks if the user has enrolled biometrics (Face ID, Touch ID, Fingerprint). */
  isEnrolledAsync: () => Promise<boolean>;
  /** Prompts the native biometric authentication dialog. */
  authenticateAsync: (options?: {
    promptMessage?: string;
    cancelLabel?: string;
    fallbackLabel?: string;
    disableDeviceFallback?: boolean;
  }) => Promise<{ success: boolean; error?: string }>;
}

let localAuthOverride: ExpoLocalAuthenticationModule | null = null;

/** @internal Test-only override for the lazy expo-local-authentication loader. */
export function __setExpoLocalAuthenticationForTests(
  module: ExpoLocalAuthenticationModule | null
): void {
  localAuthOverride = module;
}

function getExpoLocalAuthentication(): ExpoLocalAuthenticationModule {
  if (localAuthOverride) {
    return localAuthOverride;
  }

  try {
    // Lazy load keeps expo-local-authentication an optional peer dependency.
    return require('expo-local-authentication') as ExpoLocalAuthenticationModule;
  } catch {
    throw new AuthError(
      "[auth-toolkit] 'expo-local-authentication' is not installed. Run: npx expo install expo-local-authentication",
      'MISSING_DEPENDENCY'
    );
  }
}

/**
 * Determines whether biometric hardware is present and user credentials are enrolled on the device.
 *
 * @returns Resolves to `true` if Face ID, Touch ID, or Android Biometric Prompt is ready.
 *
 * @example
 * ```ts
 * const available = await isBiometricAvailable();
 * if (available) {
 *   // Show "Sign in with Face ID" button
 * }
 * ```
 */
export async function isBiometricAvailable(): Promise<boolean> {
  const LocalAuth = getExpoLocalAuthentication();
  const hasHardware = await LocalAuth.hasHardwareAsync();
  const isEnrolled = await LocalAuth.isEnrolledAsync();
  return hasHardware && isEnrolled;
}

/**
 * Prompts the native biometric authentication dialog (Face ID, Touch ID, Android Biometrics).
 *
 * @param options - Custom prompt titles and button labels.
 * @returns Object with `success: true` on authentication, or `success: false` with error message.
 *
 * @example
 * ```ts
 * const result = await authenticateBiometric({ promptMessage: 'Log into MyApp' });
 * if (result.success) {
 *   console.log('Biometric unlocked');
 * }
 * ```
 */
export async function authenticateBiometric(
  options: BiometricOptions = {}
): Promise<BiometricResult> {
  const LocalAuth = getExpoLocalAuthentication();

  const available = await isBiometricAvailable();
  if (!available) {
    return {
      success: false,
      error: 'Biometric authentication is not supported or not enrolled on this device.',
    };
  }

  const result = await LocalAuth.authenticateAsync({
    promptMessage: options.promptMessage ?? 'Authenticate to continue',
    cancelLabel: options.cancelLabel ?? 'Cancel',
    fallbackLabel: options.fallbackLabel ?? 'Use Passcode',
    disableDeviceFallback: options.disableDeviceFallback ?? false,
  });

  return {
    success: result.success,
    error: result.error,
  };
}
