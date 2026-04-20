type RuntimeConfig = {
  defaultApiBase?: string;
  enabledOAuthProviders?: string[];
};

const RUNTIME_CONFIG_SCRIPT_ID = 'app-runtime-config';

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

export const loadRuntimeConfig = async (): Promise<void> => {
  if (typeof window === 'undefined') {
    return;
  }

  if (window.__APP_CONFIG__ || import.meta.env.DEV) {
    return;
  }

  const existingScript = document.getElementById(RUNTIME_CONFIG_SCRIPT_ID) as HTMLScriptElement | null;
  if (existingScript) {
    if (existingScript.dataset.loaded === 'true' || existingScript.dataset.failed === 'true') {
      return;
    }

    await new Promise<void>((resolve) => {
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', () => resolve(), { once: true });
    });
    return;
  }

  await new Promise<void>((resolve) => {
    const script = document.createElement('script');
    script.id = RUNTIME_CONFIG_SCRIPT_ID;
    script.src = '/app-config.js';
    script.async = false;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => {
      script.dataset.failed = 'true';
      resolve();
    };
    document.head.appendChild(script);
  });
};