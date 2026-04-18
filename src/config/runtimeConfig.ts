type RuntimeConfig = {
  defaultApiBase?: string;
};

declare global {
  interface Window {
    __APP_CONFIG__?: RuntimeConfig;
  }
}

export const getRuntimeConfig = (): RuntimeConfig => {
  if (typeof window === 'undefined') {
    return {};
  }

  return window.__APP_CONFIG__ ?? {};
};

export const getDefaultApiBase = (): string => {
  const config = getRuntimeConfig();
  return typeof config.defaultApiBase === 'string' ? config.defaultApiBase.trim() : '';
};