# `@salatech/auth-toolkit`

A unified, framework-agnostic authentication toolkit designed for React Native and Expo applications, with full compatibility for React web. Built on a lightweight, zero-dependency state machine, it provides headless utilities and hooks for One-Time Password (OTP) code delivery, deep-link / magic-link token parsing, and native biometric authentication.

---

## Installation

Install the package using your preferred package manager:

```bash
npm install @salatech/auth-toolkit
```

### Optional Peer Dependencies

Core state machine, OTP utilities, and web components require **zero external dependencies**. Install peer dependencies only for the native features you use:

#### Deep-Link / Magic-Link Support
Required for link listener utilities and automatic URL token parsing:
```bash
npx expo install expo-linking
```

#### Biometric Authentication Support
Required for Face ID, Touch ID, and Android Biometric Prompt:
```bash
npx expo install expo-local-authentication
```

#### React Native UI Input
Required only if rendering `OtpInputNative` (web apps use `OtpInput` with zero native dependencies):
```bash
npx expo install react-native
```

---

## 10-Line Quick Start (`useOtpLogin`)

For 90% of use cases (sending an OTP code, entering it, and logging in), use `useOtpLogin`:

```tsx
import { useState } from 'react';
import { View, Button, TextInput } from 'react-native';
import { useOtpLogin, OtpInputNative } from '@salatech/auth-toolkit';

export function LoginScreen() {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const { status, error, resendIn, sendOtp, verifyOtp, clearError, reset } = useOtpLogin({
    onSendOtp: async (recipient) => { await api.sendOtp(recipient); },
    onVerifyOtp: async (submittedCode) => { return (await api.verify(phone, submittedCode)).token; },
    onVerified: (token) => { router.replace('/dashboard'); },
  });

  if (status === 'idle') return <Button title="Send Code" onPress={() => sendOtp(phone)} />;
  if (status === 'pending' || status === 'verifying') return (
    <View>
      <OtpInputNative value={code} onChange={setCode} onEditStart={clearError} onComplete={verifyOtp} />
      <Button title={resendIn > 0 ? `Resend (${resendIn}s)` : 'Resend'} disabled={resendIn > 0} onPress={() => sendOtp(phone)} />
    </View>
  );
  return <Button title="Reset" onPress={reset} />;
}
```

---

## Full Example (`useAuthFlow`)

For advanced authentication orchestration supporting hybrid OTP, magic links, and Face ID:

```tsx
import { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet } from 'react-native';
import { useAuthFlow, OtpInputNative } from '@salatech/auth-toolkit';

export function AdvancedAuthScreen() {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');

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
    strategy: 'hybrid', // 'otp' | 'deep-link' | 'biometric' | 'hybrid'
    cooldownSeconds: 60,
    codeLength: 6,
    onSendOtp: async (recipient) => {
      await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: recipient }),
      });
    },
    onVerifyOtp: async (submittedCode) => {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code: submittedCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Verification failed');
      return data.accessToken;
    },
    onBiometricSuccess: async () => {
      // Exchange biometric confirmation for a server session token:
      const res = await fetch('/api/auth/biometric-login', { method: 'POST' });
      const data = await res.json();
      return data.accessToken;
    },
    onVerified: (token) => {
      console.log('Successfully authenticated. Token:', token);
    },
    onError: (err) => {
      console.error('Auth error:', err.message);
    },
  });

  return (
    <View style={styles.container}>
      {status === 'idle' && (
        <View>
          <Text style={styles.label}>Phone Number</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="+1234567890"
            keyboardType="phone-pad"
          />
          <Button title="Send Code" onPress={() => sendOtp(phone)} />
          <Button
            title="Sign in with Face ID"
            onPress={() => authenticateWithBiometrics({ promptMessage: 'Unlock MyApp' })}
          />
        </View>
      )}

      {(status === 'pending' || status === 'verifying') && (
        <View>
          <Text style={styles.label}>Enter 6-Digit Code</Text>
          {state.error && <Text style={styles.errorText}>{state.error.message}</Text>}
          <OtpInputNative
            length={6}
            value={code}
            onChange={setCode}
            onEditStart={clearError}
            onComplete={(c) => verifyOtp(c)}
          />
          <Button
            title={resendIn > 0 ? `Resend Code (${resendIn}s)` : 'Resend Code'}
            disabled={resendIn > 0}
            onPress={() => sendOtp(phone)}
          />
          <Button title="Cancel" onPress={reset} />
        </View>
      )}

      {status === 'success' && (
        <View>
          <Text style={styles.successText}>Authenticated!</Text>
          <Button title="Log Out" onPress={reset} />
        </View>
      )}

      {status === 'error' && (
        <View>
          <Text style={styles.errorText}>A fatal error occurred.</Text>
          <Button title="Try Again" onPress={reset} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24 },
  label: { fontSize: 16, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#ccc', padding: 12, marginBottom: 16 },
  successText: { fontSize: 18, color: 'green', marginBottom: 16 },
  errorText: { fontSize: 16, color: 'red', marginBottom: 16 },
});
```

---

## Common Mistakes & How to Avoid Them

### 1. Forgetting Peer Dependencies
`expo-linking`, `expo-local-authentication`, and `react-native` are **optional** peer dependencies.
- If using magic/deep links: `npx expo install expo-linking`.
- If using Face ID / biometrics: `npx expo install expo-local-authentication`.
- If building a **React Web app**: import `OtpInput` instead of `OtpInputNative` — no `react-native` peer dependency is needed.

### 2. Treating Biometrics as a Server Session Token
Native biometric checks (`authenticateBiometric`) only verify local device hardware unlock. They do **not** mint a server session.
- Always provide `onBiometricSuccess: async () => fetchServerSession()` to exchange the device check for a real JWT or auth token.
- If `onBiometricSuccess` is omitted, `state.data` is `null` and `onVerified` is called without a token.

### 3. Misunderstanding the Retryable `pending` State
When an entered OTP code is incorrect, the state machine dispatches `VERIFY_FAILURE`.
- The status stays `'pending'` (it does **not** jump to `'error'`).
- The error is placed in `state.error` so you can display an inline error message.
- Wire `onEditStart={clearError}` on your `OtpInput`/`OtpInputNative` so the error message automatically clears as soon as the user starts editing their code.

### 4. Calling `sendOtp()` During Cooldown
Calling `sendOtp()` while cooldown is active (`resendIn > 0`) is a no-op.
- Always disable your resend button in the UI: `disabled={resendIn > 0}`.

### 5. Double Submissions
`sendOtp`, `verifyOtp`, and `authenticateWithBiometrics` automatically guard against concurrent double-submits while requests are in flight.

---

## State Machine Lifecycle

Authentication status transitions follow a deterministic state machine managed by `authReducer`:

```
               +-----------------------------------+
               |                                   |
               v                                   |
            [ idle ] -----------------+            |
               |                      |            |
           SEND_CODE                  |            |
               |                 VERIFY_SUCCESS    |
               v                 (biometric/link)  |
          [ sending ]                 |            |
               |                      |            |
           CODE_SENT                  |            |
               |                      |            |
               v                      |            |
          [ pending ] <---------------+            |
             |     |                  |            |
   VERIFY_CODE     +-----------+      |            |
             |                 |      |            |
             v           VERIFY_FAILURE            |
       [ verifying ] ----------+      |            |
          |       |                   |            |
VERIFY_SUCCESS   SET_ERROR            |            |
          |       |                   |            |
          v       v                   v            RESET
      [ success ]  [ error ] ----------------------+
```

- **`idle`**: Ready for input.
- **`sending`**: Code dispatch in progress.
- **`pending`**: Code sent. Awaiting user input.
- **`verifying`**: Code verification in progress.
- **`success`**: Verification successful; authenticated payload is available in `state.data`.
- **`error`**: Terminal failure; details in `state.error`.

---

## Canonical Imports & Subpaths

Always prefer canonical imports from the package root:

```typescript
import {
  useOtpLogin,
  useAuthFlow,
  OtpInput,
  OtpInputNative,
  AuthStateMachine,
  OtpManager,
  AuthError,
  parseAuthDeepLink,
  addDeepLinkListener,
  isBiometricAvailable,
  authenticateBiometric,
} from '@salatech/auth-toolkit';
```

### Advanced Subpath Imports

For specialized bundle optimization or non-React environments, subpaths are supported:

```typescript
import { AuthStateMachine, authReducer, AuthError } from '@salatech/auth-toolkit/core';
import { OtpManager } from '@salatech/auth-toolkit/otp';
import { useAuthFlow, useOtpLogin } from '@salatech/auth-toolkit/hooks';
import { OtpInput, OtpInputNative } from '@salatech/auth-toolkit/ui';
import { parseAuthDeepLink, addDeepLinkListener } from '@salatech/auth-toolkit/deep-link';
import { isBiometricAvailable, authenticateBiometric } from '@salatech/auth-toolkit/biometric';
```

---

## API Reference

### Hooks

#### `useOtpLogin<TToken = string>(options: UseOtpLoginOptions<TToken>): UseOtpLoginReturn`
Minimal hook for standard OTP login flows.

##### Options
- `onSendOtp: (recipient: string) => Promise<void>` (Required)
- `onVerifyOtp: (code: string) => Promise<TToken>` (Required)
- `onVerified?: (token?: TToken) => void`
- `onError?: (error: Error) => void`
- `codeLength?: number` (Default: `6`)
- `cooldownSeconds?: number` (Default: `60`)

##### Return Value
- `status`: `'idle' | 'sending' | 'pending' | 'verifying' | 'success' | 'error'`
- `error`: `Error | null`
- `resendIn`: `number` (remaining cooldown in seconds)
- `sendOtp`: `(recipient: string) => Promise<void>`
- `verifyOtp`: `(code: string) => Promise<void>`
- `clearError`: `() => void`
- `reset`: `() => void`

#### `useAuthFlow<TToken = string>(options?: UseAuthFlowOptions<TToken>): UseAuthFlowReturn<TToken>`
Comprehensive auth hook supporting OTP, deep links, and biometrics.

##### Options
- `strategy?: 'otp' | 'deep-link' | 'biometric' | 'hybrid'` (Default: `'hybrid'`)
- `cooldownSeconds?: number` (Default: `60`)
- `codeLength?: number` (Default: `6`)
- `tokenParamName?: string` (Default: `'token'`)
- `onSendOtp?: (recipient: string) => Promise<void>`
- `onVerifyOtp?: (code: string) => Promise<TToken>`
- `onBiometricSuccess?: () => Promise<TToken> | TToken`
- `onVerified?: (token?: TToken) => void`
- `onError?: (error: Error) => void`

##### Return Value
- `status`: `AuthStatus`
- `state`: `AuthState<TToken, Error>`
- `resendIn`: `number`
- `sendOtp`: `(recipient: string) => Promise<void>`
- `verifyOtp`: `(code: string) => Promise<void>`
- `handleDeepLink`: `(url: string) => void`
- `authenticateWithBiometrics`: `(options?: BiometricOptions) => Promise<boolean>`
- `clearError`: `() => void`
- `reset`: `() => void`

---

### UI Components

#### `OtpInput` (React Web) & `OtpInputNative` (React Native / Expo)

##### Shared Props
- `length?: number`: Number of digit boxes (Default: `6`).
- `value: string`: Current OTP code string.
- `onChange: (value: string) => void`: Change handler.
- `onComplete?: (code: string) => void`: Fired when all boxes are filled.
- `disabled?: boolean`: Disables input fields (Default: `false`).
- `autoFocus?: boolean`: Focuses first box on mount (Default: `true`).
- `onEditStart?: () => void`: Fired on user typing; connect to `clearError()`.

##### Web Props (`OtpInput`)
- `containerStyle?: React.CSSProperties`
- `inputStyle?: React.CSSProperties`

##### Native Props (`OtpInputNative`)
- `containerStyle?: object`
- `inputStyle?: object`

---

### Core State Machine & Error System

#### `AuthStateMachine<TData, TError>`
Zero-dependency state machine container.
- `getState(): AuthState<TData, TError>`
- `dispatch(action: AuthAction<TData, TError>): AuthState<TData, TError>`
- `subscribe(listener: AuthStateMachineListener<TData, TError>): () => void`

#### `AuthError`
Standard error class with machine-readable error codes:
```ts
export type AuthErrorCode =
  | 'INVALID_CODE'
  | 'COOLDOWN_ACTIVE'
  | 'STRATEGY_DISABLED'
  | 'MISSING_DEPENDENCY'
  | 'NO_HANDLER'
  | 'AUTH_FAILED';
```

---

### Deep Link & Biometric Utilities

- `parseAuthDeepLink(url: string, tokenParamName?: string): DeepLinkParseResult`
- `addDeepLinkListener(callback: (url: string) => void): () => void`
- `isBiometricAvailable(): Promise<boolean>`
- `authenticateBiometric(options?: BiometricOptions): Promise<BiometricResult>`

---

## Development and Testing

```bash
# Run unit and integration tests
npm test

# Run static type checks
npm run typecheck

# Build ESM, CJS, and .d.ts artifacts
npm run build
```

---

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for details.

Copyright (c) 2026 Salatech
