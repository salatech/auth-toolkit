import { describe, expect, it } from 'vitest';
import {
  applyDigitsAt,
  backspaceAt,
  isComplete,
  onlyDigits,
} from '../ui/otp-input-logic';

describe('otp-input-logic', () => {
  it('should strip non-digits', () => {
    expect(onlyDigits('1a2b3')).toBe('123');
  });

  it('should insert a single digit and advance focus', () => {
    const result = applyDigitsAt('12', 2, '3', 6);
    expect(result.next).toBe('123');
    expect(result.focusIndex).toBe(3);
  });

  it('should paste multiple digits from an index', () => {
    const result = applyDigitsAt('', 0, '123456', 6);
    expect(result.next).toBe('123456');
    expect(result.focusIndex).toBe(5);
  });

  it('should clear a digit when input is empty', () => {
    const result = applyDigitsAt('123', 1, '', 6);
    expect(result.next).toBe('13');
  });

  it('should backspace to the previous digit when the current box is empty', () => {
    const result = backspaceAt('12', 2, 6);
    expect(result.next).toBe('1');
    expect(result.focusIndex).toBe(1);
  });

  it('should detect a complete code', () => {
    expect(isComplete('123456', 6)).toBe(true);
    expect(isComplete('12345', 6)).toBe(false);
  });
});
