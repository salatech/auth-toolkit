import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __setExpoLinkingForTests,
  addDeepLinkListener,
  parseAuthDeepLink,
} from '../deep-link/parser';

describe('Deep link module', () => {
  const parse = vi.fn();
  const addEventListener = vi.fn();

  beforeEach(() => {
    parse.mockReset();
    addEventListener.mockReset();
    __setExpoLinkingForTests({ parse, addEventListener });
  });

  it('should parse token and path from a URL', () => {
    parse.mockReturnValue({
      path: 'auth/callback',
      queryParams: { token: 'sec_abc123', ref: 'email' },
    });

    const result = parseAuthDeepLink(
      'myapp://auth/callback?token=sec_abc123&ref=email',
      'token'
    );

    expect(result.path).toBe('auth/callback');
    expect(result.token).toBe('sec_abc123');
    expect(result.queryParams).toEqual({ token: 'sec_abc123', ref: 'email' });
  });

  it('should support custom token param names and array values', () => {
    parse.mockReturnValue({
      path: 'login',
      queryParams: { access_token: ['first', 'second'] },
    });

    const result = parseAuthDeepLink('myapp://login?access_token=first', 'access_token');

    expect(result.token).toBe('first');
  });

  it('should return null token when param is missing', () => {
    parse.mockReturnValue({
      path: 'auth',
      queryParams: {},
    });

    const result = parseAuthDeepLink('myapp://auth');

    expect(result.token).toBeNull();
  });

  it('should subscribe and unsubscribe deep link listeners', () => {
    const remove = vi.fn();
    addEventListener.mockReturnValue({ remove });

    const callback = vi.fn();
    const unsubscribe = addDeepLinkListener(callback);

    expect(addEventListener).toHaveBeenCalledWith('url', expect.any(Function));

    const handler = addEventListener.mock.calls[0][1] as (event: {
      url: string;
    }) => void;
    handler({ url: 'myapp://auth?token=1' });
    expect(callback).toHaveBeenCalledWith('myapp://auth?token=1');

    unsubscribe();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('should throw a clear error when expo-linking is unavailable', () => {
    __setExpoLinkingForTests(null);
    // Force require failure path by leaving override null and ensuring require fails
    // (expo-linking is not installed in this package).
    expect(() => parseAuthDeepLink('myapp://auth')).toThrow(/expo-linking/);
  });
});
