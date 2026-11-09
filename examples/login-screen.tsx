import { useState } from 'react';
import { Button, StyleSheet, Text, TextInput, View } from 'react-native';
import { OtpInputNative, useOtpLogin } from '../src';

/**
 * Example Expo / React Native OTP login screen using `@salatech/auth-toolkit`.
 */
export function LoginScreen() {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');

  const {
    status,
    error,
    resendIn,
    sendOtp,
    verifyOtp,
    clearError,
    reset,
  } = useOtpLogin({
    onSendOtp: async (recipient) => {
      // Call your backend to dispatch SMS OTP:
      await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: recipient }),
      });
    },
    onVerifyOtp: async (submittedCode) => {
      // Verify submitted code with backend and return session token:
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code: submittedCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Invalid code');
      return data.token;
    },
    onVerified: (token) => {
      console.log('Login successful! Session token:', token);
    },
  });

  return (
    <View style={styles.container}>
      {status === 'idle' && (
        <View>
          <Text style={styles.title}>Welcome</Text>
          <TextInput
            placeholder="Phone number (+1...)"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            style={styles.input}
          />
          <Button title="Send Verification Code" onPress={() => sendOtp(phone)} />
        </View>
      )}

      {(status === 'pending' || status === 'verifying') && (
        <View>
          <Text style={styles.title}>Enter Verification Code</Text>
          {error && <Text style={styles.errorText}>{error.message}</Text>}
          <OtpInputNative
            length={6}
            value={code}
            onChange={setCode}
            onEditStart={clearError}
            onComplete={(fullCode) => verifyOtp(fullCode)}
          />
          <Button
            title={resendIn > 0 ? `Resend Code (${resendIn}s)` : 'Resend Code'}
            disabled={resendIn > 0}
            onPress={() => sendOtp(phone)}
          />
          <Button title="Back" onPress={reset} />
        </View>
      )}

      {status === 'success' && (
        <View>
          <Text style={styles.successText}>You are logged in!</Text>
          <Button title="Log Out" onPress={reset} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    color: 'red',
    marginBottom: 12,
  },
  successText: {
    color: 'green',
    fontSize: 18,
    marginBottom: 16,
  },
});
