import React, { useCallback, useEffect, useRef } from 'react';
import type {
  TextInputInstance,
  TextInputProps,
  ViewProps,
} from 'react-native';
import {
  applyDigitsAt,
  backspaceAt,
  isComplete,
  onlyDigits,
} from './otp-input-logic';

export type ReactNativeComponents = {
  View: React.ComponentType<ViewProps>;
  TextInput: React.ComponentType<
    TextInputProps & { ref?: React.Ref<TextInputInstance> }
  >;
};

import { AuthError } from '../core/types';

let reactNativeOverride: ReactNativeComponents | null = null;

/** @internal Test-only override for the lazy react-native loader. */
export function __setReactNativeForTests(
  components: ReactNativeComponents | null
): void {
  reactNativeOverride = components;
}

function loadReactNative(): ReactNativeComponents {
  if (reactNativeOverride) {
    return reactNativeOverride;
  }
  try {
    return require('react-native') as ReactNativeComponents;
  } catch {
    throw new AuthError(
      "[auth-toolkit] 'react-native' is not installed. Run: npx expo install react-native (or use OtpInput for web apps).",
      'MISSING_DEPENDENCY'
    );
  }
}

/**
 * Props for the React Native / Expo `OtpInputNative` component.
 */
export interface OtpInputNativeProps {
  /** Number of individual digit boxes. Defaults to 6. */
  length?: number;
  /** Current string value of the OTP input. */
  value: string;
  /** Callback fired whenever digits are entered, edited, or cleared. */
  onChange: (value: string) => void;
  /** Callback fired automatically once all digits are filled. */
  onComplete?: (code: string) => void;
  /** Disables all digit input fields. Defaults to false. */
  disabled?: boolean;
  /** Automatically focuses the first empty digit box on mount. Defaults to true. */
  autoFocus?: boolean;
  /** Callback fired when the user starts typing/editing — connect to `clearError()` to dismiss retryable errors. */
  onEditStart?: () => void;
  /** Custom style object or array applied to the View container wrapping the inputs. */
  containerStyle?: object;
  /** Custom style object or array applied to each TextInput box. */
  inputStyle?: object;
}

/**
 * Headless multi-box numeric OTP input component for React Native and Expo applications.
 *
 * Utilizes native `TextInput` with auto-focus advancing, hardware/software backspace handling,
 * and SMS OTP auto-fill via `textContentType="oneTimeCode"` and `autoComplete="sms-otp"`.
 *
 * @example
 * ```tsx
 * <OtpInputNative
 *   length={6}
 *   value={code}
 *   onChange={setCode}
 *   onComplete={(fullCode) => verifyOtp(fullCode)}
 *   onEditStart={clearError}
 * />
 * ```
 */
export const OtpInputNative: React.FC<OtpInputNativeProps> = ({
  length = 6,
  value,
  onChange,
  onComplete,
  disabled = false,
  autoFocus = true,
  onEditStart,
  containerStyle,
  inputStyle,
}) => {
  const { View, TextInput } = loadReactNative();
  const digits = Array.from({ length }, (_, i) => value[i] || '');
  const inputRefs = useRef<Array<TextInputInstance | null>>([]);

  const emitChange = useCallback(
    (next: string) => {
      const clipped = onlyDigits(next).slice(0, length);
      onChange(clipped);
      if (isComplete(clipped, length) && onComplete) {
        onComplete(clipped);
      }
    },
    [length, onChange, onComplete]
  );

  const focusAt = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(index, length - 1));
      inputRefs.current[clamped]?.focus();
    },
    [length]
  );

  useEffect(() => {
    if (!autoFocus || disabled) return;
    const firstEmpty = Math.min(value.length, length - 1);
    inputRefs.current[firstEmpty]?.focus();
  }, [autoFocus, disabled, length, value.length]);

  const handleChange = useCallback(
    (index: number, raw: string) => {
      if (disabled) return;
      onEditStart?.();
      const { next, focusIndex } = applyDigitsAt(value, index, raw, length);
      emitChange(next);
      focusAt(focusIndex);
    },
    [disabled, onEditStart, value, length, emitChange, focusAt]
  );

  const handleKeyPress = useCallback(
    (index: number, key: string) => {
      if (disabled || key !== 'Backspace') return;

      if (!digits[index] && index > 0) {
        onEditStart?.();
        const { next, focusIndex } = backspaceAt(value, index, length);
        emitChange(next);
        focusAt(focusIndex);
      }
    },
    [disabled, digits, onEditStart, value, length, emitChange, focusAt]
  );

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          gap: 8,
          alignItems: 'center',
        },
        containerStyle,
      ]}
    >
      {digits.map((digit, idx) => (
        <TextInput
          key={idx}
          ref={(el: TextInputInstance | null) => {
            inputRefs.current[idx] = el;
          }}
          value={digit}
          editable={!disabled}
          keyboardType="number-pad"
          textContentType={idx === 0 ? 'oneTimeCode' : 'none'}
          autoComplete={idx === 0 ? 'sms-otp' : 'off'}
          maxLength={length}
          accessibilityLabel={`Digit ${idx + 1} of ${length}`}
          onChangeText={(text: string) => handleChange(idx, text)}
          onKeyPress={({ nativeEvent }: { nativeEvent: { key: string } }) =>
            handleKeyPress(idx, nativeEvent.key)
          }
          style={[
            {
              width: 40,
              height: 48,
              textAlign: 'center',
              fontSize: 18,
              borderRadius: 6,
              borderWidth: 1,
              borderColor: '#ccc',
            },
            inputStyle,
          ]}
        />
      ))}
    </View>
  );
};
