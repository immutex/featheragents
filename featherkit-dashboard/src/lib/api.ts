const DEFAULT_API_URL = 'http://localhost:7721';

function normalizePath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

export function getApiBaseUrl(): string {
  return import.meta.env.VITE_API_URL?.trim() || DEFAULT_API_URL;
}

export function getApiToken(): string {
  const token = import.meta.env.VITE_API_TOKEN?.trim();
  if (!token) {
    throw new Error('Missing VITE_API_TOKEN. Copy .project-state/dashboard.token into featherkit-dashboard/.env.local.');
  }

  return token;
}

export function getWebSocketUrl(): string {
  const baseUrl = new URL(getApiBaseUrl());
  baseUrl.protocol = baseUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  baseUrl.pathname = '/events';
  baseUrl.search = '';
  baseUrl.hash = '';
  return baseUrl.toString();
}

async function apiRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${normalizePath(path)}`, {
    method,
    headers: {
      Authorization: `Bearer ${getApiToken()}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  const text = await response.text();
  let payload: unknown = null;
  if (text.length > 0) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      if (response.ok) {
        throw new Error(`Invalid JSON response for ${method} ${path}`);
      }
    }
  }

  if (!response.ok) {
    const errorMessage =
      typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : `${method} ${path} failed with ${response.status}`;
    throw new Error(errorMessage);
  }

  return payload as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>('GET', path);
}

export function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return apiRequest<T>('PATCH', path, body);
}

export function apiPut<T>(path: string, body: unknown): Promise<T> {
  return apiRequest<T>('PUT', path, body);
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>('POST', path, body);
}
