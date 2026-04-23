import { afterEach, describe, expect, it, vi } from 'vitest';

import { getApiToken } from '@/lib/api';

const SESSION_KEY = 'fk-token';

describe('getApiToken', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    // Clean up window state
    if (typeof window !== 'undefined') {
      sessionStorage.clear();
      delete (window as Record<string, unknown>).__FEATHERKIT_TOKEN__;
    }
  });

  it('returns VITE_API_TOKEN when set (highest priority)', () => {
    vi.stubEnv('VITE_API_TOKEN', 'env-token');
    expect(getApiToken()).toBe('env-token');
  });

  it('trims whitespace from VITE_API_TOKEN', () => {
    vi.stubEnv('VITE_API_TOKEN', '  trimmed  ');
    expect(getApiToken()).toBe('trimmed');
  });

  it('falls back to window.__FEATHERKIT_TOKEN__ when env var is empty', () => {
    vi.stubEnv('VITE_API_TOKEN', '');
    (window as Record<string, unknown>).__FEATHERKIT_TOKEN__ = 'runtime-token';
    expect(getApiToken()).toBe('runtime-token');
  });

  it('falls back to sessionStorage when env var and runtime token are empty', () => {
    vi.stubEnv('VITE_API_TOKEN', '');
    sessionStorage.setItem(SESSION_KEY, 'stored-token');
    expect(getApiToken()).toBe('stored-token');
  });

  it('captures token from URL param, persists to sessionStorage, and strips from URL', () => {
    vi.stubEnv('VITE_API_TOKEN', '');

    // Simulate ?token=url-token in the URL
    const replaceStateSpy = vi.fn();
    vi.stubGlobal('history', { replaceState: replaceStateSpy });
    vi.stubGlobal('location', {
      pathname: '/',
      search: '?token=url-token',
      hash: '',
    });

    const token = getApiToken();
    expect(token).toBe('url-token');

    // Should have persisted to sessionStorage
    expect(sessionStorage.getItem(SESSION_KEY)).toBe('url-token');

    // Should have called replaceState to strip the token param
    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '/');
  });

  it('preserves other query params when stripping token from URL', () => {
    vi.stubEnv('VITE_API_TOKEN', '');

    const replaceStateSpy = vi.fn();
    vi.stubGlobal('history', { replaceState: replaceStateSpy });
    vi.stubGlobal('location', {
      pathname: '/dashboard',
      search: '?token=abc&tab=memory&view=graph',
      hash: '#section',
    });

    getApiToken();

    expect(replaceStateSpy).toHaveBeenCalledWith(
      null,
      '',
      '/dashboard?tab=memory&view=graph#section',
    );
  });

  it('reads from sessionStorage on second call (URL param already stripped)', () => {
    vi.stubEnv('VITE_API_TOKEN', '');

    // First call: URL param → sessionStorage
    vi.stubGlobal('history', { replaceState: vi.fn() });
    vi.stubGlobal('location', {
      pathname: '/',
      search: '?token=persisted',
      hash: '',
    });
    const first = getApiToken();
    expect(first).toBe('persisted');

    // Second call: no URL param anymore, but sessionStorage has it
    vi.stubGlobal('location', {
      pathname: '/',
      search: '',
      hash: '',
    });
    const second = getApiToken();
    expect(second).toBe('persisted');
  });

  it('throws with a helpful message when no token source is available', () => {
    vi.stubEnv('VITE_API_TOKEN', '');
    vi.stubGlobal('location', {
      pathname: '/',
      search: '',
      hash: '',
    });

    expect(() => getApiToken()).toThrow('Missing API token');
  });

  it('skips empty/whitespace-only values in all fallback sources', () => {
    vi.stubEnv('VITE_API_TOKEN', '   ');
    (window as Record<string, unknown>).__FEATHERKIT_TOKEN__ = '  ';
    sessionStorage.setItem(SESSION_KEY, '  ');
    vi.stubGlobal('location', {
      pathname: '/',
      search: '?token=  ',
      hash: '',
    });
    vi.stubGlobal('history', { replaceState: vi.fn() });

    // URL param with whitespace only should NOT be accepted
    expect(() => getApiToken()).toThrow('Missing API token');
  });

  it('prioritizes VITE_API_TOKEN over runtime and sessionStorage', () => {
    vi.stubEnv('VITE_API_TOKEN', 'env-wins');
    (window as Record<string, unknown>).__FEATHERKIT_TOKEN__ = 'runtime';
    sessionStorage.setItem(SESSION_KEY, 'stored');

    expect(getApiToken()).toBe('env-wins');
  });

  it('prioritizes runtime token over sessionStorage and URL param', () => {
    vi.stubEnv('VITE_API_TOKEN', '');
    (window as Record<string, unknown>).__FEATHERKIT_TOKEN__ = 'runtime-wins';
    sessionStorage.setItem(SESSION_KEY, 'stored');
    vi.stubGlobal('location', {
      pathname: '/',
      search: '?token=url',
      hash: '',
    });

    expect(getApiToken()).toBe('runtime-wins');
  });

  it('prioritizes sessionStorage over URL param', () => {
    vi.stubEnv('VITE_API_TOKEN', '');
    sessionStorage.setItem(SESSION_KEY, 'stored-wins');
    vi.stubGlobal('history', { replaceState: vi.fn() });
    vi.stubGlobal('location', {
      pathname: '/',
      search: '?token=url',
      hash: '',
    });

    expect(getApiToken()).toBe('stored-wins');
  });
});
