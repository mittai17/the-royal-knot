import { config } from './config';

export interface ApiMeta { page?: number; pageSize?: number; total?: number; totalPages?: number }
export interface ApiResult<T> { data: T; meta?: ApiMeta }

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public reason?: string, public details?: unknown) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

function qs(q?: Query): string {
  if (!q) return '';
  const p = new URLSearchParams();
  Object.entries(q).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  });
  const s = p.toString();
  return s ? `?${s}` : '';
}

let refreshing: Promise<boolean> | null = null;
async function tryRefresh(): Promise<boolean> {
  refreshing ??= fetch(`${config.apiBase}/auth/refresh`, { method: 'POST', credentials: 'include' })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => { setTimeout(() => (refreshing = null), 0); });
  return refreshing;
}

async function request<T>(method: string, path: string, opts: { body?: unknown; query?: Query; form?: FormData; retry?: boolean } = {}): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(opts.body); }

  const res = await fetch(`${config.apiBase}${path}${qs(opts.query)}`, { method, headers, body, credentials: 'include', cache: 'no-store' });

  if (res.status === 401 && opts.retry !== false && !['/auth/login', '/auth/keycloak/login', '/auth/refresh', '/auth/logout'].includes(path)) {
    if (await tryRefresh()) return request<T>(method, path, { ...opts, retry: false });
    if (typeof window !== 'undefined' && path !== '/auth/me' && !location.pathname.startsWith('/login')) {
      location.href = `/login?next=${encodeURIComponent(location.pathname)}`;
    }
  }
  if (!res.ok) {
    let code = 'ERROR', message = res.statusText, reason: string | undefined, details: unknown;
    try {
      const j = await res.json();
      reason = j?.error?.reason;
      details = j?.error?.details;
      code = j?.error?.code ?? code;
      const m = j?.error?.message ?? j?.message ?? message;
      message = Array.isArray(m) ? m.join(', ') : m;
    } catch { /* non-JSON error */ }
    throw new ApiError(res.status, code, message, reason, details);
  }
  if (res.status === 204) return { data: undefined as T };
  const json = await res.json();
  if (json && typeof json === 'object' && 'data' in json) return json as ApiResult<T>;
  return { data: json as T };
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>('GET', path, { query }),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, { body: body ?? {} }),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body: body ?? {} }),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body: body ?? {} }),
  del: <T>(path: string) => request<T>('DELETE', path),
  upload: <T>(path: string, form: FormData) => request<T>('POST', path, { form }),
};

export const apiUrl = (path: string) => `${config.apiBase}${path}`;
