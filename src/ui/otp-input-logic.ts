/**
 * Strips all non-digit characters from an input string.
 *
 * @param input - Raw input string.
 * @returns Cleaned string containing only ASCII digits (0-9).
 *
 * @example
 * ```ts
 * onlyDigits('12-34 ab') // returns '1234'
 * ```
 */
export function onlyDigits(input: string): string {
  return input.replace(/\D/g, '');
}

/**
 * Clamps a zero-based box index to the valid range [0, length - 1].
 *
 * @param index - Target index.
 * @param length - Total number of digit boxes.
 * @returns Clamped index.
 */
export function clampIndex(index: number, length: number): number {
  return Math.max(0, Math.min(index, length - 1));
}

/**
 * Inserts or pastes digits into an OTP value at a specific box index and computes the next focus target.
 *
 * @param value - Current OTP value string.
 * @param index - Index of the box where input was entered or pasted.
 * @param incoming - Newly entered character(s) or clipboard text.
 * @param length - Maximum expected OTP length.
 * @returns Next OTP value string and the next box index to focus.
 */
export function applyDigitsAt(
  value: string,
  index: number,
  incoming: string,
  length: number
): { next: string; focusIndex: number } {
  const cleaned = onlyDigits(incoming);

  if (!cleaned) {
    return {
      next: onlyDigits(value.slice(0, index) + value.slice(index + 1)).slice(0, length),
      focusIndex: clampIndex(index, length),
    };
  }

  const before = onlyDigits(value.slice(0, index));
  const after = onlyDigits(value.slice(index + 1));
  const next = (before + cleaned + (cleaned.length === 1 ? after : '')).slice(0, length);

  return {
    next,
    focusIndex: clampIndex(before.length + cleaned.length, length),
  };
}

/**
 * Handles backspace deletion at a specific box index and computes the previous focus target.
 *
 * @param value - Current OTP value string.
 * @param index - Index of the box where backspace occurred.
 * @param length - Maximum expected OTP length.
 * @returns Next OTP value string and the next box index to focus.
 */
export function backspaceAt(value: string, index: number, length: number): {
  next: string;
  focusIndex: number;
} {
  if (index <= 0) {
    return { next: value, focusIndex: 0 };
  }

  return {
    next: onlyDigits(value.slice(0, index - 1) + value.slice(index)).slice(0, length),
    focusIndex: clampIndex(index - 1, length),
  };
}

/**
 * Checks whether the current value string contains exactly `length` digits.
 *
 * @param value - Value to check.
 * @param length - Target code length.
 * @returns True if value contains strictly `length` digits.
 */
export function isComplete(value: string, length: number): boolean {
  return onlyDigits(value).length === length;
}
