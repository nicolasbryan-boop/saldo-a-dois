'use client';

import type { ApiErrorBody } from '@/server/api';

/**
 * Thin fetch wrapper for the browser.
 *
 * Turns an API error body into a thrown `ApiClientError` carrying the message
 * the server already wrote in Portuguese, so components never invent their own
 * wording for a backend failure.
 */

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, string[]>;

  constructor(status: number, body: ApiErrorBody['error']) {
    super(body.message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = body.code;
    this.details = body.details;
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, ...rest } = init;

  let response: Response;
  try {
    response = await fetch(path, {
      ...rest,
      headers: {
        ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(rest.headers ?? {}),
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiClientError(0, {
      code: 'offline',
      message: 'Sem conexão. Verifique a internet e tente de novo.',
    });
  }

  if (response.status === 204) return undefined as T;

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const body = (payload as ApiErrorBody | null)?.error;
    throw new ApiClientError(
      response.status,
      body ?? { code: 'internal', message: 'Algo deu errado. Tente novamente.' },
    );
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, json?: unknown) => request<T>(path, { method: 'POST', json }),
  patch: <T>(path: string, json?: unknown) => request<T>(path, { method: 'PATCH', json }),
  delete: <T>(path: string, json?: unknown) => request<T>(path, { method: 'DELETE', json }),
};

export interface CategoryOption {
  id: string;
  slug: string;
  name: string;
  icon: string;
  color: string;
  kind: 'expense' | 'income' | 'both';
}
