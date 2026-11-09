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
- **React Native Metro condition**: Added `"react-native"` export conditions to `package.json` for enhanced Metro bundler resolution.

### Changed
- **Biometric default token removed**: `onBiometricSuccess` no longer falls back to a silent fake string (`'biometric-verified'`). When omitted, no token is minted (`state.data` is `null`) and `onVerified` is called without arguments.
- **Non-terminal strategy gating**: Invoking a feature disallowed by `strategy` (e.g. biometrics under `'otp'`) no longer dispatches `SET_ERROR`. It safely no-ops / returns `false` and logs a descriptive `console.warn` in development.
- **State machine reducer guards**: `authReducer` now safely ignores invalid transitions (e.g. `VERIFY_CODE` outside `pending`, `CODE_SENT` outside `sending`, `SEND_CODE` while active).
- **Double submit protection**: `sendOtp`, `verifyOtp`, and `authenticateWithBiometrics` ignore duplicate concurrent calls while requests are in flight.
- **React hook hygiene**: Added unmount safety checks, stable callback refs to eliminate stale closures, and stabilized the cooldown interval ticker.
- **Lazy `react-native` loading in `OtpInputNative`**: `react-native` is now loaded lazily at component render time, allowing root imports in React Web and Node environments without throwing `Cannot find package 'react-native'`.
- **Harden OtpManager**: Stricter regex validation (`^[0-9]+$`), whitespace handling, and boundary checks for expired/zero cooldowns.
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
