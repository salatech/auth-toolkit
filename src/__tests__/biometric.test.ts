import { afterEach, describe, expect, it } from 'vitest';
import {
  __setExpoLocalAuthenticationForTests,
  authenticateBiometric,
  isBiometricAvailable,
} from '../biometric/authenticator';

describe('biometric without expo-local-authentication installed', () => {
  afterEach(() => __setExpoLocalAuthenticationForTests(null));

  it('isBiometricAvailable resolves false instead of throwing', async () => {
    __setExpoLocalAuthenticationForTests(null);
    await expect(isBiometricAvailable()).resolves.toBe(false);
  });

  it('authenticateBiometric still rejects with MISSING_DEPENDENCY', async () => {
    __setExpoLocalAuthenticationForTests(null);
    await expect(authenticateBiometric()).rejects.toMatchObject({ code: 'MISSING_DEPENDENCY' });
  });
});
