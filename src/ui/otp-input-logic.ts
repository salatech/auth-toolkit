export function onlyDigits(input: string): string {
  return input.replace(/\D/g, '');
}

export function clampIndex(index: number, length: number): number {
  return Math.max(0, Math.min(index, length - 1));
}

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

export function isComplete(value: string, length: number): boolean {
  return onlyDigits(value).length === length;
}
