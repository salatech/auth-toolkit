import { describe, expect, it } from 'vitest';

describe('Built Package Entry Points Smoke Test', () => {
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
    expect(core.AuthStateMachine).toBeDefined();
    expect(otp.OtpManager).toBeDefined();
    expect(deepLink.parseAuthDeepLink).toBeDefined();
    expect(biometric.isBiometricAvailable).toBeDefined();
    expect(hooks.useAuthFlow).toBeDefined();
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
    expect(core.AuthStateMachine).toBeDefined();
    expect(otp.OtpManager).toBeDefined();
    expect(deepLink.parseAuthDeepLink).toBeDefined();
    expect(biometric.isBiometricAvailable).toBeDefined();
    expect(hooks.useAuthFlow).toBeDefined();
    expect(ui.OtpInput).toBeDefined();
    expect(ui.OtpInputNative).toBeDefined();
  });
});
