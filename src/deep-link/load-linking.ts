import { AuthError } from '../core/types';

/**
 * Expected shape of the lazy-loaded `expo-linking` module.
 */
export type ExpoLinkingModule = {
  /** Parses a deep link URL into an object containing path and query parameters. */
  parse: (url: string) => {
    path?: string | null;
    queryParams?: Record<string, string | string[] | undefined>;
  };
  /** Resolves the URL that cold-started the app, or `null` when it was opened normally. */
  getInitialURL?: () => Promise<string | null>;
  /** Subscribes to incoming URL events. */
  addEventListener: (
    event: 'url',
    callback: (event: { url: string }) => void
  ) => { remove: () => void };
};

let linkingOverride: ExpoLinkingModule | null = null;

/** @internal Test-only override for the lazy expo-linking loader. */
export function __setExpoLinkingForTests(module: ExpoLinkingModule | null): void {
  linkingOverride = module;
}

/**
 * Lazily loads the `expo-linking` peer dependency at runtime.
 * Throws a helpful `AuthError` with instructions to install if not present.
 */
export function loadExpoLinking(): ExpoLinkingModule {
  if (linkingOverride) {
    return linkingOverride;
  }

  try {
    // Lazy load keeps expo-linking an optional peer dependency.
    return require('expo-linking') as ExpoLinkingModule;
  } catch {
    throw new AuthError(
      "[auth-toolkit] 'expo-linking' is not installed. Run: npx expo install expo-linking",
      'MISSING_DEPENDENCY'
    );
  }
}
