import { AuthError } from '../core/types';

export interface BiometricOptions {
  promptMessage?: string;
  cancelLabel?: string;
  fallbackLabel?: string;
  disableDeviceFallback?: boolean;
}

export interface BiometricResult {
  success: boolean;
  error?: string;
}

export interface ExpoLocalAuthenticationModule {
  hasHardwareAsync: () => Promise<boolean>;
  isEnrolledAsync: () => Promise<boolean>;
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

export async function isBiometricAvailable(): Promise<boolean> {
  const LocalAuth = getExpoLocalAuthentication();
  const hasHardware = await LocalAuth.hasHardwareAsync();
  const isEnrolled = await LocalAuth.isEnrolledAsync();
  return hasHardware && isEnrolled;
}

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
