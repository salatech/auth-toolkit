export type ExpoLinkingModule = {
  parse: (url: string) => {
    path?: string | null;
    queryParams?: Record<string, string | string[] | undefined>;
  };
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

export function loadExpoLinking(): ExpoLinkingModule {
  if (linkingOverride) {
    return linkingOverride;
  }

  try {
    // Lazy load keeps expo-linking an optional peer dependency.
    return require('expo-linking') as ExpoLinkingModule;
  } catch {
    throw new Error(
      "[auth-toolkit] 'expo-linking' is required for deep link auth features. " +
        "Please install it in your project: npx expo install expo-linking"
    );
  }
}
