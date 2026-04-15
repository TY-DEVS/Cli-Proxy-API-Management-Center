/**
 * OAuth 与设备码登录相关 API
 */

import { apiClient } from './client';

export type OAuthProvider =
  | 'codex'
  | 'anthropic'
  | 'antigravity'
  | 'gemini-cli'
  | 'kimi'
  | 'qwen'
  | 'amazon';

export interface OAuthStartResponse {
  url: string;
  state?: string;
}

const AUTH_URL_REGEX = /(https?:\/\/[^\s"'<>]+)/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function pickString(source: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function decodeCommonEntities(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function isHtmlDocument(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  return (
    trimmed.startsWith('<!doctype html') ||
    trimmed.startsWith('<html') ||
    trimmed.includes('<head') ||
    trimmed.includes('<body')
  );
}

function toAuthorizationUrl(value: string): string | undefined {
  const decoded = decodeCommonEntities(value).trim();
  if (!decoded) {
    return undefined;
  }

  // Avoid treating full HTML pages as OAuth URLs.
  if (isHtmlDocument(decoded)) {
    const htmlMatch = decoded.match(AUTH_URL_REGEX);
    if (!htmlMatch?.[1]) {
      return undefined;
    }
    const htmlUrl = htmlMatch[1].trim();
    try {
      const parsed = new URL(htmlUrl);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : undefined;
    } catch {
      return undefined;
    }
  }

  const directMatch = decoded.match(AUTH_URL_REGEX);
  if (directMatch?.[1]) {
    const extracted = directMatch[1].trim();
    try {
      const parsed = new URL(extracted);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : undefined;
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function appendUserCode(url: string, userCode?: string): string {
  if (!userCode) {
    return url;
  }
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.get('user_code')) {
      parsed.searchParams.set('user_code', userCode);
    }
    return parsed.toString();
  } catch {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}user_code=${encodeURIComponent(userCode)}`;
  }
}

function normalizeStartResponse(payload: unknown): OAuthStartResponse {
  if (typeof payload === 'string' && payload.trim()) {
    const decodedPayload = decodeCommonEntities(payload).trim();
    const parsedUrl = toAuthorizationUrl(payload);
    if (parsedUrl) {
      return { url: parsedUrl };
    }
    if (isHtmlDocument(decodedPayload)) {
      throw new Error(
        'Invalid OAuth response: received HTML page. Check API address points to CLI Proxy API backend (for local dev use :8317, not :5173).'
      );
    }
    throw new Error('Invalid OAuth response: expected authorization URL, got non-URL content');
  }

  const candidates: Record<string, unknown>[] = [];
  if (isRecord(payload)) {
    candidates.push(payload);
    const nestedKeys = ['data', 'result', 'body', 'response'];
    for (const key of nestedKeys) {
      const nested = payload[key];
      if (isRecord(nested)) {
        candidates.push(nested);
      }
    }
  }

  const urlKeys = [
    'url',
    'auth_url',
    'authUrl',
    'authorization_url',
    'authorizationUrl',
    'verification_uri',
    'verificationUri',
    'verification_url',
    'verificationUrl',
    'login_url',
    'loginUrl'
  ];
  const stateKeys = ['state', 'oauth_state', 'client_state'];
  const userCodeKeys = ['user_code', 'userCode'];

  for (const candidate of candidates) {
    const rawUrl = pickString(candidate, urlKeys);
    if (!rawUrl) {
      continue;
    }
    const userCode = pickString(candidate, userCodeKeys);
    const normalizedBaseUrl = toAuthorizationUrl(rawUrl);
    if (!normalizedBaseUrl) {
      continue;
    }
    const url = appendUserCode(normalizedBaseUrl, userCode);
    const state = pickString(candidate, stateKeys);
    return state ? { url, state } : { url };
  }

  throw new Error('Authorization URL missing in OAuth response');
}

export interface OAuthCallbackResponse {
  status: 'ok';
}

export interface IFlowCookieAuthResponse {
  status: 'ok' | 'error';
  error?: string;
  saved_path?: string;
  email?: string;
  expired?: string;
  type?: string;
}

const WEBUI_SUPPORTED: OAuthProvider[] = ['codex', 'anthropic', 'antigravity', 'gemini-cli', 'amazon'];
const CALLBACK_PROVIDER_MAP: Partial<Record<OAuthProvider, string>> = {
  'gemini-cli': 'gemini'
};

export const oauthApi = {
  startAuth: async (provider: OAuthProvider, options?: { projectId?: string }) => {
    const params: Record<string, string | boolean> = {};
    if (WEBUI_SUPPORTED.includes(provider)) {
      params.is_webui = true;
    }
    if (provider === 'gemini-cli' && options?.projectId) {
      params.project_id = options.projectId;
    }
    const payload = await apiClient.get<unknown>(`/${provider}-auth-url`, {
      params: Object.keys(params).length ? params : undefined
    });
    return normalizeStartResponse(payload);
  },

  getAuthStatus: (state: string) =>
    apiClient.get<{ status: 'ok' | 'wait' | 'error'; error?: string }>(`/get-auth-status`, {
      params: { state }
    }),

  submitCallback: (provider: OAuthProvider, redirectUrl: string) => {
    const callbackProvider = CALLBACK_PROVIDER_MAP[provider] ?? provider;
    return apiClient.post<OAuthCallbackResponse>('/oauth-callback', {
      provider: callbackProvider,
      redirect_url: redirectUrl
    });
  },

  /** iFlow cookie 认证 */
  iflowCookieAuth: (cookie: string) =>
    apiClient.post<IFlowCookieAuthResponse>('/iflow-auth-url', { cookie })
};
