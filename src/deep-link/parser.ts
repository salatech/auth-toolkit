import {
  __setExpoLinkingForTests,
  loadExpoLinking,
} from './load-linking';

export { __setExpoLinkingForTests };

/**
 * Result of parsing an authentication deep-link or magic-link URL.
 */
export interface DeepLinkParseResult {
  /** Full incoming URL string. */
  url: string;
  /** Extracted path portion of the URL (e.g. 'auth/callback'), or null. */
  path: string | null;
  /** Map of parsed query parameter key-value pairs. */
  queryParams: Record<string, string | string[] | undefined>;
  /** Extracted authentication or verification token, or null if parameter was absent. */
  token: string | null;
}

/**
 * Parses an incoming authentication deep-link or magic-link URL and extracts the security token.
 * Uses lazy-loaded `expo-linking`.
 *
 * @param url - Incoming URL string to parse (e.g. `myapp://auth/callback?token=xyz`).
 * @param tokenParamName - Name of the query parameter containing the token. Defaults to `'token'`.
 * @returns Parsed URL components and extracted token.
 *
 * @example
 * ```ts
 * const { token, path } = parseAuthDeepLink('myapp://auth/callback?token=sec_abc123');
 * if (token) {
 *   console.log('Token extracted:', token);
 * }
 * ```
 */
export function parseAuthDeepLink(
  url: string,
  tokenParamName = 'token'
): DeepLinkParseResult {
  const LinkingModule = loadExpoLinking();
  const parsed = LinkingModule.parse(url);
  const queryParams = (parsed.queryParams || {}) as Record<
    string,
    string | string[] | undefined
  >;

  let token: string | null = null;
  const rawToken = queryParams[tokenParamName];
  if (typeof rawToken === 'string') {
    token = rawToken;
  } else if (Array.isArray(rawToken) && rawToken.length > 0) {
    token = rawToken[0] ?? null;
  }

  return {
    url,
    path: parsed.path ?? null,
    queryParams,
    token,
  };
}

/**
 * Subscribes to incoming application URL events via lazy-loaded `expo-linking`.
 *
 * @param callback - Function invoked whenever an incoming deep link URL is received.
 * @returns Cleanup function that removes the event subscription.
 *
 * @example
 * ```ts
 * const unsubscribe = addDeepLinkListener((url) => {
 *   const { token } = parseAuthDeepLink(url);
 *   if (token) handleToken(token);
 * });
 * // Later:
 * unsubscribe();
 * ```
 */
export function addDeepLinkListener(
  callback: (url: string) => void
): () => void {
  const LinkingModule = loadExpoLinking();

  const subscription = LinkingModule.addEventListener('url', (event) => {
    callback(event.url);
  });

  return () => {
    if (subscription && typeof subscription.remove === 'function') {
      subscription.remove();
    }
  };
}
