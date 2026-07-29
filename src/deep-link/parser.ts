import {
  __setExpoLinkingForTests,
  loadExpoLinking,
} from './load-linking';

export { __setExpoLinkingForTests };

export interface DeepLinkParseResult {
  url: string;
  path: string | null;
  queryParams: Record<string, string | string[] | undefined>;
  token: string | null;
}

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
