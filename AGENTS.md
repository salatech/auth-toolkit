# Contributor AI Agent Guide: `@salatech/auth-toolkit`

This document outlines key conventions, project structure, commands, and rules for AI coding assistants and contributors working on `@salatech/auth-toolkit`.

## Repository Architecture

```
auth-toolkit/
├── src/
│   ├── core/         # Framework-agnostic state machine, authReducer, types, AuthError
│   ├── otp/          # OtpManager (length validation, cooldown calculations)
│   ├── deep-link/    # URL parsing and deep link event listeners (lazy expo-linking)
│   ├── biometric/    # Biometric availability and prompt dialogs (lazy expo-local-authentication)
│   ├── hooks/        # useAuthFlow and useOtpLogin hooks
│   ├── ui/           # OtpInput (Web) and OtpInputNative (React Native) + shared logic
│   └── types/        # Ambient shims (e.g. react-native.d.ts)
├── examples/         # Runnable example screen (LoginScreen) type-checked in CI
├── llms.txt          # Plain-text library documentation for LLM consumption
└── package.json      # Dual CJS/ESM exports with subpaths and Metro condition
```

## Essential Commands

Always verify changes using:
- **Run tests**: `npm test` (Vitest with Node + JSDOM environments)
- **Type check**: `npm run typecheck` (`tsc --noEmit` on `src/` and `examples/`)
- **Build production bundles**: `npm run build` (`tsup` generating CJS, ESM, and `.d.ts` in `dist/`)

## Core Coding Rules

1. **Keep the Core Zero-Dependency**:
   The core state machine (`src/core/`), OTP logic (`src/otp/`), and pure UI logic (`src/ui/otp-input-logic.ts`) must never introduce runtime dependencies.
2. **Optional Peer Dependencies Stay Optional**:
   `expo-linking`, `expo-local-authentication`, and `react-native` are optional peers. Never import them statically at the top level of entry files. Always use lazy loaders (`loadExpoLinking`, `getExpoLocalAuthentication`, `loadReactNative`) with test override hooks (`__setExpoLinkingForTests`, etc.).
3. **No Breaking Public API Changes**:
   All changes must be strictly backwards-compatible and additive. Deprecate rather than remove.
4. **Canonical Import First**:
   All user-facing code and docs should lead with `import { ... } from '@salatech/auth-toolkit'`. Subpaths exist for advanced bundler optimization.
5. **No Loose Types / No `any`**:
   Use TypeScript strict mode, discriminated unions for state and actions, and explicit error codes.
6. **Every Public Export Must Have JSDoc**:
   Include a one-line description, `@param`, `@returns`, and a copy-pasteable `@example`.

## How to Add Tests

- Place tests in `src/__tests__/*.test.ts` (or `.test.tsx` for React hooks).
- Unit tests run in a Node environment without requiring native iOS/Android simulators.
- For hooks, use `@testing-library/react` (`renderHook`, `act`, `waitFor`).
- When testing optional peer dependencies, use the test override helpers:
  ```ts
  import { __setExpoLinkingForTests } from '../deep-link/parser';
  import { __setExpoLocalAuthenticationForTests } from '../biometric/authenticator';
  import { __setReactNativeForTests } from '../ui/OtpInputNative';
  ```
- Always verify that `npm test`, `npm run typecheck`, and `npm run build` pass before finishing.
