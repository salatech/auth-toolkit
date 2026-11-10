import React, { useCallback, useEffect, useRef } from 'react';
import {
  applyDigitsAt,
  backspaceAt,
  isComplete,
  onlyDigits,
} from './otp-input-logic';

/**
 * Props for the Web `OtpInput` component.
 */
export interface OtpInputProps {
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
  /** Custom CSS styles for the flex container wrapping the inputs. */
  containerStyle?: React.CSSProperties;
  /** Custom CSS styles applied to each digit input box. */
  inputStyle?: React.CSSProperties;
}

/**
 * Headless multi-box numeric OTP input component for React Web applications.
 *
 * Supports single-digit auto-advancing, Backspace backward navigation, full-code paste,
 * arrow keys, and mobile SMS auto-fill suggestions.
 *
 * @example
 * ```tsx
 * <OtpInput
 *   length={6}
 *   value={code}
 *   onChange={setCode}
 *   onComplete={(fullCode) => verifyOtp(fullCode)}
 *   onEditStart={clearError}
 * />
 * ```
 */
export const OtpInput: React.FC<OtpInputProps> = ({
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
  const digits = Array.from({ length }, (_, i) => value[i] || '');
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

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

  const valueLengthRef = useRef(value.length);
  valueLengthRef.current = value.length;

  // Only on mount / re-enable: re-running on every keystroke would steal focus
  // from the box the user is editing.
  useEffect(() => {
    if (!autoFocus || disabled) return;
    const firstEmpty = Math.min(valueLengthRef.current, length - 1);
    inputRefs.current[firstEmpty]?.focus();
  }, [autoFocus, disabled, length]);

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

  const handleKeyDown = useCallback(
    (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
      if (disabled) return;

      if (event.key === 'Backspace') {
        if (!digits[index] && index > 0) {
          event.preventDefault();
          onEditStart?.();
          const { next, focusIndex } = backspaceAt(value, index, length);
          emitChange(next);
          focusAt(focusIndex);
        }
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        focusAt(index - 1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        focusAt(index + 1);
      }
    },
    [disabled, digits, onEditStart, value, length, emitChange, focusAt]
  );

  const handlePaste = useCallback(
    (index: number, event: React.ClipboardEvent<HTMLInputElement>) => {
      if (disabled) return;
      event.preventDefault();
      const pasted = onlyDigits(event.clipboardData.getData('text'));
      if (!pasted) return;
      onEditStart?.();
      const { next, focusIndex } = applyDigitsAt(value, index, pasted, length);
      emitChange(next);
      focusAt(focusIndex);
    },
    [disabled, onEditStart, value, length, emitChange, focusAt]
  );

  return (
    <div
      style={{
        display: 'flex',
        gap: '8px',
        alignItems: 'center',
        ...containerStyle,
      }}
    >
      {digits.map((digit, idx) => (
        <input
          key={idx}
          ref={(el) => {
            inputRefs.current[idx] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={idx === 0 ? 'one-time-code' : 'off'}
          maxLength={length}
          value={digit}
          disabled={disabled}
          aria-label={`Digit ${idx + 1} of ${length}`}
          onChange={(e) => handleChange(idx, e.target.value)}
          onKeyDown={(e) => handleKeyDown(idx, e)}
          onPaste={(e) => handlePaste(idx, e)}
          style={{
            width: '40px',
            height: '48px',
            textAlign: 'center',
            fontSize: '18px',
            borderRadius: '6px',
            border: '1px solid #ccc',
            ...inputStyle,
          }}
        />
      ))}
    </div>
  );
};
