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
    throw new Error(
      "[auth-toolkit] 'react-native' is required to use OtpInputNative. " +
        "Please install 'react-native' in your project, or use OtpInput for web."
    );
  }
}

export interface OtpInputNativeProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (code: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Called when the user edits digits — wire to `clearError()` from `useAuthFlow`. */
  onEditStart?: () => void;
  containerStyle?: object;
  inputStyle?: object;
}

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
