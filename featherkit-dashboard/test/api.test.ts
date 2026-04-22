import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiGet } from '@/lib/api';

describe('apiGet', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('falls back to the HTTP status when an error response is not JSON', async () => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:7721');
    vi.stubEnv('VITE_API_TOKEN', 'test-token');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('gateway exploded', { status: 502, statusText: 'Bad Gateway' })),
    );

    await expect(apiGet('/api/state')).rejects.toThrow('GET /api/state failed with 502');
  });

  it('throws a helpful message when a successful response body is invalid JSON', async () => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:7721');
    vi.stubEnv('VITE_API_TOKEN', 'test-token');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 200 })));

    await expect(apiGet('/api/state')).rejects.toThrow('Invalid JSON response for GET /api/state');
  });
});
