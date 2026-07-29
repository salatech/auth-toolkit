# `@salatech/auth-toolkit`

A unified, framework-agnostic authentication toolkit designed for React Native and Expo applications, with full compatibility for React web environments. It provides structured state management and headless utilities for One-Time Password (OTP) code delivery, deep-link and magic-link URL parsing, and device biometric authentication.

---

## Key Features

- Framework-Agnostic Core: Built on a lightweight, zero-dependency state machine (`AuthStateMachine`) that operates independently of React Native UI libraries.
- OTP Lifecycle Management: Manages code dispatching, validation against customizable numeric length criteria, and automatic resend cooldown timers.
- Deep-Link and Magic-Link Handling: Parses incoming authentication URLs and extracts security tokens using lazy-loaded `expo-linking`.
- Biometric Authentication Abstraction: Provides hardware availability checks and native Face ID / Fingerprint prompting via lazy-loaded `expo-local-authentication`.
- Unified React Integration: Exposes the `useAuthFlow` hook to connect OTP dispatching, deep links, biometrics, and timer tickers into a consolidated interface.
- Headless UI Components: Includes unstyled `OtpInput` (web) and `OtpInputNative` (React Native) for multi-digit PIN entry.
- Subpath Exports: Import only what you need (`@salatech/auth-toolkit/core`, `/hooks`, `/ui`, etc.) for smaller bundles.
- Full TypeScript Support: Shipped with strict TypeScript declarations (`.d.ts`) alongside dual CommonJS (CJS) and ES Module (ESM) builds.

---

## Installation

Install the core package using your preferred package manager:

```bash
npm install @salatech/auth-toolkit
```

### Optional Peer Dependencies

Depending on the authentication strategies required by your application, install the corresponding peer dependencies. Core state machine and OTP utilities do not require peer dependencies.

#### Deep-Link / Magic-Link Support
Required for link listener utilities and automatic URL token parsing:

```bash
npx expo install expo-linking
```

#### Biometric Authentication Support
Required for Face ID, Touch ID, and Android Biometric Prompt functionality:

```bash
npx expo install expo-local-authentication
```

---

## Subpath Imports

Tree-shake by importing only the module you need:

```typescript
import { AuthStateMachine } from '@salatech/auth-toolkit/core';
import { OtpManager } from '@salatech/auth-toolkit/otp';
import { useAuthFlow } from '@salatech/auth-toolkit/hooks';
import { OtpInputNative } from '@salatech/auth-toolkit/ui';
import { parseAuthDeepLink } from '@salatech/auth-toolkit/deep-link';
import { authenticateBiometric } from '@salatech/auth-toolkit/biometric';
```

---

## Core Architecture

The architecture of `@salatech/auth-toolkit` is divided into isolated, decoupled modules:

```
@salatech/auth-toolkit
├── src/
│   ├── core/         Framework-agnostic state machine, types, and reducer
│   ├── otp/          OTP validation and cooldown timer manager
│   ├── deep-link/    URL parsing and deep link listener wrappers
│   ├── biometric/    Biometric hardware verification and prompt handler
│   ├── hooks/        Unified useAuthFlow() React hook
│   └── ui/           Headless OtpInput component
```

### State Machine Lifecycle

Authentication status transitions follow a deterministic state machine managed by `authReducer`:

```
               +-----------------------------------+
               |                                   |
               v                                   |
            [ idle ]                               |
               |                                   |
           SEND_CODE                               |
               |                                   |
               v                                   |
          [ sending ]                              |
               |                                   |
           CODE_SENT                               |
               |                                   |
               v                                   |
          [ pending ] <---------------+            |
               |                      |            |
          VERIFY_CODE                 |            |
               |                 VERIFY_FAILURE    |
               v                      |            |
         [ verifying ] ---------------+            |
            |      |                               |
VERIFY_SUCCESS    SET_ERROR                        |
      |            |                               |
      v            v                               RESET
  [ success ]   [ error ] -------------------------+
```

---

## Usage Examples

### 1. Unified Authentication Hook (`useAuthFlow`)

The `useAuthFlow` hook orchestrates state management, timer updates, and async handlers into a single React hook.

```tsx
import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet } from 'react-native';
import { useAuthFlow, OtpInputNative } from '@salatech/auth-toolkit';

export function LoginScreen() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');

  const {
    status,
    state,
    resendIn,
    sendOtp,
    verifyOtp,
    clearError,
    authenticateWithBiometrics,
    reset,
  } = useAuthFlow({
    strategy: 'otp',
    cooldownSeconds: 60,
    codeLength: 6,
    onSendOtp: async (recipient) => {
      await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: recipient }),
      });
    },
    onVerifyOtp: async (code) => {
      const response = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneNumber, code }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Verification failed');
      }
      return data.accessToken;
    },
    onVerified: (token) => {
      console.log('Successfully authenticated. Token:', token);
    },
    onError: (error) => {
      console.error('Authentication error:', error.message);
    },
  });

  return (
    <View style={styles.container}>
      {status === 'idle' && (
        <View>
          <Text style={styles.label}>Phone Number</Text>
          <TextInput
            style={styles.input}
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            placeholder="+1234567890"
            keyboardType="phone-pad"
          />
          <Button
            title="Send Verification Code"
            onPress={() => sendOtp(phoneNumber)}
          />
        </View>
      )}

      {(status === 'pending' || status === 'verifying') && (
        <View>
          <Text style={styles.label}>Enter Code</Text>
          {state.error && (
            <Text style={styles.errorText}>{state.error.message}</Text>
          )}
          <OtpInputNative
            length={6}
            value={otpCode}
            onChange={setOtpCode}
            onEditStart={clearError}
            onComplete={(code) => verifyOtp(code)}
          />
          <Button
            title={resendIn > 0 ? `Resend Code (${resendIn}s)` : 'Resend Code'}
            disabled={resendIn > 0}
            onPress={() => sendOtp(phoneNumber)}
          />
        </View>
      )}

      {status === 'success' && (
        <View>
          <Text style={styles.successText}>Authentication Complete!</Text>
          <Button title="Start Over" onPress={reset} />
        </View>
      )}

      {status === 'error' && (
        <View>
          <Text style={styles.errorText}>An error occurred during authentication.</Text>
          <Button title="Try Again" onPress={reset} />
        </View>
      )}

      <View style={styles.biometricContainer}>
        <Button
          title="Sign in with Biometrics"
          onPress={() =>
            authenticateWithBiometrics({
              promptMessage: 'Confirm identity to log in',
            })
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24 },
  label: { fontSize: 16, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#ccc', padding: 12, marginBottom: 16 },
  successText: { fontSize: 18, color: 'green', marginBottom: 16 },
  errorText: { fontSize: 16, color: 'red', marginBottom: 16 },
  biometricContainer: { marginTop: 32 },
});
```

---

### 2. Standalone State Machine and OTP Manager

For non-React environments (such as Node.js services or pure Redux/Zustand integrations), use `AuthStateMachine` and `OtpManager` directly.

```typescript
import { AuthStateMachine, OtpManager } from '@salatech/auth-toolkit';

// Create a typed state machine instance
const authMachine = new AuthStateMachine<string, Error>();

// Subscribe to state updates
const unsubscribe = authMachine.subscribe((state) => {
  console.log('Current Auth Status:', state.status);
  console.log('Current Data:', state.data);
  console.log('Attempt Count:', state.attempts);
});

// Wrap the machine in OtpManager
const otpManager = new OtpManager(authMachine, {
  cooldownSeconds: 30,
  codeLength: 6,
});

// Dispatch actions
authMachine.dispatch({ type: 'SEND_CODE' });
authMachine.dispatch({ type: 'CODE_SENT' });

// Start the resend cooldown timer
otpManager.startCooldown();

// Validate input format
const isValid = otpManager.isValidCode('123456'); // returns true
console.log('Can resend:', otpManager.canResend()); // returns false during cooldown
console.log('Remaining seconds:', otpManager.getRemainingCooldown());

// Complete verification
authMachine.dispatch({ type: 'VERIFY_CODE' });
authMachine.dispatch({ type: 'VERIFY_SUCCESS', payload: 'auth-session-jwt' });

// Clean up listener
unsubscribe();
```

---

### 3. Deep-Link / Magic-Link Parsing

Parse incoming deep links to extract security parameters or authentication tokens:

```typescript
import { parseAuthDeepLink, addDeepLinkListener } from '@salatech/auth-toolkit';

// 1. Manual parsing of a single URL
const result = parseAuthDeepLink(
  'myapp://auth/callback?token=sec_abc123xyz&ref=email',
  'token'
);

console.log(result.url);         // 'myapp://auth/callback?token=sec_abc123xyz&ref=email'
console.log(result.path);        // 'auth/callback'
console.log(result.token);       // 'sec_abc123xyz'
console.log(result.queryParams); // { token: 'sec_abc123xyz', ref: 'email' }

// 2. Setting up an event listener for incoming app links
const removeListener = addDeepLinkListener((incomingUrl) => {
  const parsed = parseAuthDeepLink(incomingUrl, 'token');
  if (parsed.token) {
    console.log('Received auth token from deep link:', parsed.token);
  }
});

// Remove listener when no longer needed
removeListener();
```

---

### 4. Biometric Authentication

Perform local biometric checks using `isBiometricAvailable` and `authenticateBiometric`:

```typescript
import {
  isBiometricAvailable,
  authenticateBiometric,
} from '@salatech/auth-toolkit';

async function performBiometricLogin() {
  const canAuthenticate = await isBiometricAvailable();

  if (!canAuthenticate) {
    console.log('Biometric hardware unavailable or user has not registered credentials.');
    return;
  }

  const result = await authenticateBiometric({
    promptMessage: 'Unlock application access',
    cancelLabel: 'Cancel',
    fallbackLabel: 'Enter Passcode',
    disableDeviceFallback: false,
  });

  if (result.success) {
    console.log('Biometric authentication succeeded.');
  } else {
    console.error('Biometric authentication failed:', result.error);
  }
}
```

---

## API Reference

### Core Module (`@salatech/auth-toolkit`)

#### `AuthStatus`
A union type representing all possible authentication statuses:
- `'idle'`: Initial state before authentication has started.
- `'sending'`: An OTP or request is being dispatched.
- `'pending'`: An OTP code has been sent and is awaiting user input.
- `'verifying'`: Verification of the submitted code or token is in progress.
- `'success'`: Verification succeeded and payload data is available.
- `'error'`: An operation failed and error data is set.

#### `AuthState<TData = unknown, TError = Error>`
An object representing the state snapshot:
- `status`: `AuthStatus`
- `data`: `TData | null` - Data payload returned on successful authentication.
- `error`: `TError | null` - Error payload returned on failure.
- `attempts`: `number` - Cumulative count of verification attempts.
- `lastUpdated`: `number` - Timestamp (in milliseconds) of the most recent state change.

#### `AuthAction<TData = unknown, TError = Error>`
Action objects processed by `authReducer`:
- `{ type: 'SEND_CODE' }`
- `{ type: 'CODE_SENT' }`
- `{ type: 'VERIFY_CODE' }`
- `{ type: 'VERIFY_SUCCESS'; payload: TData }`
- `{ type: 'VERIFY_FAILURE'; payload: TError }` — retryable; returns status to `'pending'` while storing the error
- `{ type: 'SET_ERROR'; payload: TError }` — terminal failure; status becomes `'error'`
- `{ type: 'CLEAR_ERROR' }` — clears a retryable error while status is `'pending'`
- `{ type: 'RESET' }`

#### `AuthStateMachine<TData, TError>`
- `constructor(initialState?: Partial<AuthState<TData, TError>>)`
- `getState(): AuthState<TData, TError>`: Returns current state snapshot.
- `dispatch(action: AuthAction<TData, TError>): AuthState<TData, TError>`: Applies state transition and notifies listeners.
- `subscribe(listener: AuthStateMachineListener<TData, TError>): () => void`: Subscribes callback to state changes. Returns an unsubscribe function.

---

### OTP Module

#### `OtpManagerOptions`
- `cooldownSeconds?: number`: Cooldown duration in seconds (default: `60`).
- `codeLength?: number`: Expected numeric code length (default: `6`).

#### `OtpManager<TData, TError>`
- `constructor(machine: AuthStateMachine<TData, TError>, options?: OtpManagerOptions)`
- `getCodeLength(): number`: Returns configured code length.
- `getCooldownSeconds(): number`: Returns configured cooldown duration.
- `startCooldown(): void`: Sets cooldown expiration timestamp to `Date.now() + cooldownSeconds * 1000`.
- `getRemainingCooldown(): number`: Returns remaining cooldown seconds, rounded up.
- `canResend(): boolean`: Returns `true` if remaining cooldown is `0`.
- `isValidCode(code: string): boolean`: Validates if `code` contains strictly numeric digits matching `codeLength`.
- `getState(): AuthState<TData, TError>`: Returns underlying state machine state.

---

### Deep Link Module

#### `DeepLinkParseResult`
- `url`: `string` - The full original URL string.
- `path`: `string | null` - The path portion extracted from the URL.
- `queryParams`: `Record<string, string | string[] | undefined>` - Parsed query parameters.
- `token`: `string | null` - Extracted token matching the target parameter name.

#### Functions
- `parseAuthDeepLink(url: string, tokenParamName?: string): DeepLinkParseResult`: Parses URL using `expo-linking`. Throws an error if `expo-linking` is not installed.
- `addDeepLinkListener(callback: (url: string) => void): () => void`: Subscribes callback to URL event changes. Returns an unsubscribe function.

---

### Biometric Module

#### `BiometricOptions`
- `promptMessage?: string`: Custom text prompt for native dialog (default: `'Authenticate to continue'`).
- `cancelLabel?: string`: Label for cancel button (default: `'Cancel'`).
- `fallbackLabel?: string`: Label for passcode fallback button (default: `'Use Passcode'`).
- `disableDeviceFallback?: boolean`: If `true`, disables fallback to system passcode (default: `false`).

#### `BiometricResult`
- `success`: `boolean` - Indicates if user successfully authenticated.
- `error?: string` - Description of failure cause, if unsuccessful.

#### Functions
- `isBiometricAvailable(): Promise<boolean>`: Resolves to `true` if biometric hardware is present and user credentials are enrolled.
- `authenticateBiometric(options?: BiometricOptions): Promise<BiometricResult>`: Prompts native biometric dialog and returns result.

---

### React Hooks Module

#### `useAuthFlow<TToken = string>(options?: UseAuthFlowOptions<TToken>): UseAuthFlowReturn<TToken>`

##### Options (`UseAuthFlowOptions<TToken>`)
- `strategy?: 'otp' | 'deep-link' | 'biometric' | 'hybrid'` (default: `'hybrid'`). Restricts which methods are active; unsupported methods dispatch `SET_ERROR`.
- `cooldownSeconds?: number` (default: `60`)
- `codeLength?: number` (default: `6`)
- `tokenParamName?: string` (default: `'token'`)
- `onSendOtp?: (recipient: string) => Promise<void>`
- `onVerifyOtp?: (code: string) => Promise<TToken>`
- `onBiometricSuccess?: () => Promise<TToken> | TToken`: Called after hardware biometric auth succeeds; return a session token when available. Defaults to `'biometric-verified'` when omitted.
- `onVerified?: (token: TToken) => void`
- `onError?: (error: Error) => void`

##### Return Value (`UseAuthFlowReturn<TToken>`)
- `status`: `AuthStatus`
- `state`: `AuthState<TToken, Error>`
- `resendIn`: `number` (Remaining cooldown timer in seconds)
- `sendOtp`: `(recipient: string) => Promise<void>`
- `verifyOtp`: `(code: string) => Promise<void>`
- `handleDeepLink`: `(url: string) => void`
- `authenticateWithBiometrics`: `(options?: BiometricOptions) => Promise<boolean>`
- `clearError`: `() => void` — clears retryable OTP errors while `status === 'pending'`
- `reset`: `() => void`

---

### UI Module

#### `OtpInput` (web)
DOM-based multi-digit input for React web apps.

#### `OtpInputNative` (React Native)
`TextInput`-based multi-digit input for Expo / React Native apps.

##### Shared props
- `length?: number`: Number of input boxes (default: `6`).
- `value: string`: Current string value.
- `onChange: (value: string) => void`: Callback triggered when character value changes.
- `onComplete?: (code: string) => void`: Callback triggered automatically when `value.length === length`.
- `disabled?: boolean`: Disables input fields when `true`.
- `autoFocus?: boolean`: Focuses the first empty digit on mount (default: `true`).
- `onEditStart?: () => void`: Fired when the user edits digits — wire to `clearError()` from `useAuthFlow`.

##### Web-only (`OtpInput`)
- `containerStyle?: React.CSSProperties`
- `inputStyle?: React.CSSProperties`

##### Native-only (`OtpInputNative`)
- `containerStyle?: object`
- `inputStyle?: object`

Both support digit auto-advance, Backspace navigation, paste/autofill of a full code, and OTP autofill hints on the first box.

---

## Development and Testing

### Run Unit Tests
Unit tests use Vitest and run in a pure Node.js environment without native simulators:

```bash
npm test
```

### Type Check
Run static type validation with TypeScript compiler:

```bash
npm run typecheck
```

### Build Production Artifacts
Generate CommonJS, ES Modules, and `.d.ts` declaration bundles in `./dist`:

```bash
npm run build
```

---

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for full details.

Copyright (c) 2026 Salatech

