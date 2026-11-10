# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-11-09

### Added
- **`useOtpLogin` hook**: Streamlined React hook for standard One-Time Password flows with minimal required options (`onSendOtp`, `onVerifyOtp`, `onVerified`) and zero boilerplate.
- **`AuthError` and `AuthErrorCode`**: Stable, machine-readable error class with actionable remediation messages (e.g. `INVALID_CODE`, `COOLDOWN_ACTIVE`, `STRATEGY_DISABLED`, `MISSING_DEPENDENCY`, `NO_HANDLER`, `AUTH_FAILED`).
- **Comprehensive JSDoc**: Rich documentation, parameter descriptions, and copy-pasteable `@example` snippets on every public export.
- **`llms.txt`**: Compact, plain-text summary of package capabilities, canonical imports, state lifecycle, and common pitfalls for AI coding assistants.
- **`AGENTS.md`**: Guide for AI contributor tools detailing repository layout, test commands, and coding rules.
- **`examples/login-screen.tsx`**: Fully typed, runnable Expo / React Native OTP login screen matching the quick start.
- **Package smoke tests**: Added test suite validating both CJS and ESM entry points across root and all subpath exports.
- **React Native Metro condition**: Added `"react-native"` export conditions to `package.json` pointing at the CommonJS build, so Metro sees literal `require()` calls for optional peers.

- **`getInitialAuthDeepLink()`**: Resolves the URL that cold-started the app, so magic links tapped while the app was closed are no longer missed.
- **`OtpManager.configure()` and `OtpManager.resetCooldown()`**: Update code length / cooldown on a live manager, and clear an active cooldown.

### Fixed
- **`codeLength` / `cooldownSeconds` ignored after mount**: `useAuthFlow` now applies option changes on re-render.
- **Tokenless deep links derailed flows**: A link without a token now reports through `onError` but leaves the state untouched, so forwarding every incoming URL to `handleDeepLink` is safe.
- **`isBiometricAvailable()` threw without `expo-local-authentication`** (e.g. on web); it now resolves `false`. `authenticateBiometric()` still throws `MISSING_DEPENDENCY`.
- **Reserved error codes**: `COOLDOWN_ACTIVE` and `STRATEGY_DISABLED` are documented as reserved; the hooks no-op in those cases.
- **Optional peers unresolvable under Metro**: Build tree-shaking rewrote `require('expo-linking')` (and `expo-local-authentication`, `react-native`) into an opaque `__require(...)` shim, so deep links, biometrics, and `OtpInputNative` failed with `MISSING_DEPENDENCY` in real apps even when installed.
- **Duplicate / stale callbacks in `useAuthFlow`**: `onVerified` and `onError` only fire when the state machine accepts the transition (e.g. the same magic link delivered twice no longer double-navigates), and results that resolve after `reset()` are discarded instead of flipping the flow to `success`.
- **`sendOtp` after success**: No longer calls `onSendOtp` (sending a real SMS) once authenticated.
- **Concurrent biometric prompts**: `authenticateWithBiometrics` ignores calls while a prompt is already open.
- **Typing over a filled OTP box**: Replaces that digit instead of erasing every digit after it.
- **OTP input focus jumping**: Auto-focus runs only on mount / re-enable, not on every keystroke.

### Changed
- **Biometric default token removed**: `onBiometricSuccess` no longer falls back to a silent fake string (`'biometric-verified'`). When omitted, no token is minted (`state.data` is `null`) and `onVerified` is called without arguments.
- **Non-terminal strategy gating**: Invoking a feature disallowed by `strategy` (e.g. biometrics under `'otp'`) no longer dispatches `SET_ERROR`. It safely no-ops / returns `false` and logs a descriptive `console.warn` in development.
- **State machine reducer guards**: `authReducer` now safely ignores invalid transitions (e.g. `VERIFY_CODE` outside `pending`, `CODE_SENT` outside `sending`, `SEND_CODE` while active).
- **Double submit protection**: `sendOtp`, `verifyOtp`, and `authenticateWithBiometrics` ignore duplicate concurrent calls while requests are in flight.
- **React hook hygiene**: Added unmount safety checks, stable callback refs to eliminate stale closures, and stabilized the cooldown interval ticker.
- **Lazy `react-native` loading in `OtpInputNative`**: `react-native` is now loaded lazily at component render time, allowing root imports in React Web and Node environments without throwing `Cannot find package 'react-native'`.
- **Harden OtpManager**: Stricter regex validation (`^[0-9]+$`), whitespace handling, and boundary checks for expired/zero cooldowns.
- **`reset()` clears the resend cooldown**: Previously `resendIn` showed `0` after `reset()` while `sendOtp()` silently no-oped until the old cooldown expired. Added `OtpManager.resetCooldown()`.
- **Biometric cancellation is non-terminal**: Dismissing the biometric prompt (`user_cancel`, `system_cancel`, `app_cancel`) returns `false` without changing status or calling `onError`.
- **`verifyOtp` requires a sent code**: It is a no-op unless `status === 'pending'`, and the trimmed code is passed to `onVerifyOtp`.
- **Documentation rewrite**: Restructured README into Installation -> 10-line Quick Start -> Full Example -> Common Mistakes -> State Diagram -> API Reference.

## [0.1.0] - 2026-11-09

### Added
- Initial release of `@salatech/auth-toolkit`.
- Core `AuthStateMachine` and `authReducer`.
- `OtpManager` with cooldown tracking and length validation.
- `useAuthFlow` hook.
- Deep link parsing with lazy `expo-linking`.
- Biometric authentication with lazy `expo-local-authentication`.
- Headless `OtpInput` (web) and `OtpInputNative` (React Native) components.
- Subpath exports for `/core`, `/otp`, `/deep-link`, `/biometric`, `/hooks`, and `/ui`.
