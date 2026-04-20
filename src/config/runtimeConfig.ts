type RuntimeConfig = {
  defaultApiBase?: string;
  enabledOAuthProviders?: string[];
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

export const getEnabledOAuthProviders = (): string[] => {
  const config = getRuntimeConfig();
  if (!Array.isArray(config.enabledOAuthProviders)) {
    return [];
  }

  return config.enabledOAuthProviders.filter(
    (provider): provider is string => typeof provider === 'string' && provider.trim().length > 0
  );
};