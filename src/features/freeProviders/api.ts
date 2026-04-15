import { apiCallApi } from '@/services/api';
import { modelsApi } from '@/services/api/models';
import type { FreeProviderResolvedItem, FreeProviderTestResult } from '@/types/freeProvider';
import { buildTestResultFromApiCall, parseModelsFromApiCallResult } from './helpers';

const TEST_TIMEOUT_MS = 30_000;

const hasHeader = (headers: Record<string, string>, name: string) => {
  const target = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === target);
};

const buildHeaders = (provider: FreeProviderResolvedItem, apiKey: string) => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(provider.defaultHeaders ?? {}),
  };
  if (apiKey && !hasHeader(headers, 'authorization')) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
};

const buildChatEndpoint = (baseUrl: string) => {
  const trimmed = String(baseUrl || '').replace(/\/+$/g, '');
  if (!trimmed) return '';
  if (/\/chat\/completions$/i.test(trimmed)) return trimmed;
  return `${trimmed}/chat/completions`;
};

export const freeProvidersApi = {
  async testProvider(provider: FreeProviderResolvedItem, apiKey: string): Promise<FreeProviderTestResult> {
    const baseUrl = provider.state.baseUrl || provider.openaiBaseUrl || '';
    const model = provider.state.models[0]?.name || provider.models[0] || '';

    if (provider.importStrategy !== 'openai-compatibility') {
      return {
        ok: false,
        latencyMs: 0,
        message: 'This provider needs a backend adapter before quick chat tests can run.',
      };
    }

    if (!baseUrl || !apiKey || !model) {
      return {
        ok: false,
        latencyMs: 0,
        message: 'Base URL, API key, and at least one model are required.',
      };
    }

    const startedAt = performance.now();
    const result = await apiCallApi.request(
      {
        method: 'POST',
        url: buildChatEndpoint(baseUrl),
        header: buildHeaders(provider, apiKey),
        data: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Reply with OK.' }],
          stream: false,
          max_tokens: 16,
        }),
      },
      { timeout: TEST_TIMEOUT_MS }
    );
    return buildTestResultFromApiCall(result, Math.round(performance.now() - startedAt));
  },

  async fetchModels(provider: FreeProviderResolvedItem, apiKey?: string) {
    const baseUrl = provider.state.baseUrl || provider.openaiBaseUrl || '';
    if (!baseUrl) return [];

    if (provider.importStrategy === 'openai-compatibility') {
      const result = await apiCallApi.request(
        {
          method: 'GET',
          url: modelsApi.buildV1ModelsEndpoint(baseUrl),
          header: buildHeaders(provider, apiKey ?? ''),
        },
        { timeout: TEST_TIMEOUT_MS }
      );
      return parseModelsFromApiCallResult(result);
    }

    if (provider.compatibility === 'gemini') {
      return modelsApi.fetchGeminiModelsViaApiCall(baseUrl, apiKey);
    }

    return [];
  },
};
