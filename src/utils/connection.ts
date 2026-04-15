import { DEFAULT_API_PORT, MANAGEMENT_API_PREFIX } from './constants';

const DEV_FRONTEND_PORTS = new Set(['5173', '4173', '4174']);

const coerceDevFrontendBaseToApiBase = (normalizedBase: string): string => {
  if (!normalizedBase || !import.meta.env.DEV) {
    return normalizedBase;
  }

  try {
    const parsed = new URL(normalizedBase);
    if (isLocalhost(parsed.hostname) && DEV_FRONTEND_PORTS.has(parsed.port)) {
      return `${parsed.protocol}//${parsed.hostname}:${DEFAULT_API_PORT}`;
    }
  } catch {
    // Keep original value if URL parsing fails.
  }

  return normalizedBase;
};

export const normalizeApiBase = (input: string): string => {
  let base = (input || '').trim();
  if (!base) return '';
  base = base.replace(/\/?v0\/management\/?$/i, '');
  base = base.replace(/\/+$/i, '');
  if (!/^https?:\/\//i.test(base)) {
    base = `http://${base}`;
  }
  return coerceDevFrontendBaseToApiBase(base);
};

export const computeApiUrl = (base: string): string => {
  const normalized = normalizeApiBase(base);
  if (!normalized) return '';
  return `${normalized}${MANAGEMENT_API_PREFIX}`;
};

export const detectApiBaseFromLocation = (): string => {
  try {
    const { protocol, hostname, port } = window.location;
    const normalizedPort = port ? `:${port}` : '';
    return normalizeApiBase(`${protocol}//${hostname}${normalizedPort}`);
  } catch (error) {
    console.warn('Failed to detect api base from location, fallback to default', error);
    return normalizeApiBase(`http://localhost:${DEFAULT_API_PORT}`);
  }
};

export const isLocalhost = (hostname: string): boolean => {
  const value = (hostname || '').toLowerCase();
  return value === 'localhost' || value === '127.0.0.1' || value === '[::1]';
};
