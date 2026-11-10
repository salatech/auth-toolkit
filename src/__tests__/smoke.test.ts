import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Built Package Entry Points Smoke Test', () => {
  it('should keep literal require() calls for optional peers so Metro can resolve them', () => {
    const cjs = readFileSync(resolve(__dirname, '../../dist/index.js'), 'utf8');
    for (const peer of ['expo-linking', 'expo-local-authentication', 'react-native']) {
      expect(cjs).toMatch(new RegExp(`(?<!_)require\\("${peer}"\\)`));
    }

    const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf8'));
    expect(pkg['react-native']).toBe('./dist/index.js');
    for (const entry of Object.values(pkg.exports) as Array<Record<string, string>>) {
      expect(entry['react-native']).toMatch(/\.js$/);
    }
  });

  it('should import all subpaths in CommonJS without throwing', () => {
    /* eslint-disable @typescript-eslint/no-var-requires */
    const root = require('../../dist/index.js');
    const core = require('../../dist/core/index.js');
    const otp = require('../../dist/otp/index.js');
    const deepLink = require('../../dist/deep-link/index.js');
    const biometric = require('../../dist/biometric/index.js');
    const hooks = require('../../dist/hooks/index.js');
    const ui = require('../../dist/ui/index.js');

    expect(root.AuthStateMachine).toBeDefined();
    expect(root.useOtpLogin).toBeDefined();
    expect(root.AuthError).toBeDefined();
    expect(core.AuthStateMachine).toBeDefined();
    expect(core.AuthError).toBeDefined();
    expect(otp.OtpManager).toBeDefined();
    expect(deepLink.parseAuthDeepLink).toBeDefined();
    expect(biometric.isBiometricAvailable).toBeDefined();
    expect(hooks.useAuthFlow).toBeDefined();
    expect(hooks.useOtpLogin).toBeDefined();
    expect(ui.OtpInput).toBeDefined();
    expect(ui.OtpInputNative).toBeDefined();
  });

  it('should import all subpaths in ESM without throwing', async () => {
    const root = await import('../../dist/index.mjs');
    const core = await import('../../dist/core/index.mjs');
    const otp = await import('../../dist/otp/index.mjs');
    const deepLink = await import('../../dist/deep-link/index.mjs');
    const biometric = await import('../../dist/biometric/index.mjs');
    const hooks = await import('../../dist/hooks/index.mjs');
    const ui = await import('../../dist/ui/index.mjs');

    expect(root.AuthStateMachine).toBeDefined();
    expect(root.useOtpLogin).toBeDefined();
    expect(root.AuthError).toBeDefined();
    expect(core.AuthStateMachine).toBeDefined();
    expect(core.AuthError).toBeDefined();
    expect(otp.OtpManager).toBeDefined();
    expect(deepLink.parseAuthDeepLink).toBeDefined();
    expect(biometric.isBiometricAvailable).toBeDefined();
    expect(hooks.useAuthFlow).toBeDefined();
    expect(hooks.useOtpLogin).toBeDefined();
    expect(ui.OtpInput).toBeDefined();
    expect(ui.OtpInputNative).toBeDefined();
  });
});
