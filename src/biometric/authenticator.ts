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

import { createRequire } from 'node:module';

const nodeRequire = createRequire(import.meta.url);

function getExpoLocalAuthentication(): any {
  try {
    // Lazy load keeps expo-local-authentication an optional peer dependency.
    return nodeRequire('expo-local-authentication');
  } catch {
    throw new Error(
      "[auth-toolkit] 'expo-local-authentication' is required for biometric auth features. " +
        "Please install 'expo-local-authentication' as a dependency in your project."
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
