import type { ApiCallResult } from '@/services/api/apiCall';
import type { ModelAlias, OpenAIProviderConfig } from '@/types';
import { generateId } from '@/utils/helpers';
import { normalizeModelList } from '@/utils/models';
import type {
  FreeProviderHealth,
  FreeProviderKeyEntry,
  FreeProviderQuotaStats,
  FreeProviderResolvedItem,
  FreeProviderRoutingRecommendation,
  FreeProviderStateItem,
  FreeProviderStatus,
  FreeProviderTag,
  FreeProviderTestResult,
} from '@/types/freeProvider';
import type { FreeProviderCatalogEntry } from '@/generated/freeProviderCatalog';

export const createEmptyQuotaStats = (): FreeProviderQuotaStats => ({
  requests: 0,
  tokens: 0,
  errors: 0,
  rateLimitHits: 0,
  latencyMsAvg: 0,
});

export const inferTags = (entry: FreeProviderCatalogEntry): FreeProviderTag[] => {
  const tags = new Set<FreeProviderTag>();
  tags.add(entry.category === 'free' ? 'free' : 'trial');
  const limits = String(entry.limits ?? '').toLowerCase();
  if (limits.includes('limited') || limits.includes('credit') || limits.includes('requests/')) {
    tags.add('limited');
  }
  if (entry.compatibility === 'custom' || entry.compatibility === 'unknown') {
    tags.add('unstable');
  }
  return Array.from(tags);
};

export const createDefaultFreeProviderState = (
  entry: FreeProviderCatalogEntry,
  existing?: Partial<FreeProviderStateItem>
): FreeProviderStateItem => ({
  providerId: entry.id,
  customName: existing?.customName,
  enabled: existing?.enabled ?? false,
  priority: existing?.priority ?? (entry.category === 'free' ? 1 : 2),
  status: existing?.status ?? 'inactive',
  health: existing?.health ?? 'unknown',
  tags: existing?.tags ?? inferTags(entry),
  compatibility: existing?.compatibility ?? entry.compatibility,
  baseUrl: existing?.baseUrl ?? entry.openaiBaseUrl,
  models: existing?.models ?? entry.models.map((name) => ({ name })),
  keys: existing?.keys ?? [],
  lastSyncedAt: existing?.lastSyncedAt,
  lastError: existing?.lastError,
  quota: existing?.quota ?? createEmptyQuotaStats(),
});

export const createFreeProviderKey = (
  type: FreeProviderCatalogEntry['category'],
  overrides?: Partial<FreeProviderKeyEntry>
): FreeProviderKeyEntry => ({
  id: overrides?.id ?? generateId(),
  apiKey: overrides?.apiKey ?? '',
  label: overrides?.label,
  type,
  enabled: overrides?.enabled ?? true,
  rateLimit: overrides?.rateLimit,
  monthlyQuota: overrides?.monthlyQuota,
  status: overrides?.status ?? 'disabled',
  lastError: overrides?.lastError,
  lastTestedAt: overrides?.lastTestedAt,
  quota: overrides?.quota ?? createEmptyQuotaStats(),
});

export const mergeCatalogWithState = (
  catalog: FreeProviderCatalogEntry[],
  state: Record<string, FreeProviderStateItem>
): FreeProviderResolvedItem[] =>
  catalog.map((entry) => ({
    ...entry,
    state: createDefaultFreeProviderState(entry, state[entry.id]),
  }));

export const getResolvedProviderStatus = (provider: FreeProviderResolvedItem): FreeProviderStatus => {
  if (provider.state.lastError) return 'error';
  if (!provider.state.enabled) return 'inactive';
  return provider.state.keys.some((key) => key.enabled) ? 'active' : 'inactive';
};

export const getResolvedProviderHealth = (
  latencyMs: number,
  hasError: boolean
): FreeProviderHealth => {
  if (hasError) return 'down';
  if (!Number.isFinite(latencyMs) || latencyMs <= 0) return 'unknown';
  if (latencyMs < 1200) return 'ok';
  if (latencyMs < 3000) return 'slow';
  return 'down';
};

export const buildOpenAIProvidersFromFreeProviders = (
  providers: FreeProviderResolvedItem[]
): OpenAIProviderConfig[] =>
  providers
    .filter((provider) => provider.importStrategy === 'openai-compatibility')
    .filter((provider) => provider.state.enabled)
    .filter((provider) => provider.state.keys.some((key) => key.enabled && key.apiKey.trim()))
    .map((provider) => ({
      name: provider.state.customName?.trim() || provider.name,
      baseUrl: provider.state.baseUrl?.trim() || provider.openaiBaseUrl || '',
      apiKeyEntries: provider.state.keys
        .filter((key) => key.enabled && key.apiKey.trim())
        .map((key) => ({ apiKey: key.apiKey.trim() })),
      headers: provider.defaultHeaders,
      models: provider.state.models,
      priority: provider.state.priority,
      testModel: provider.state.models[0]?.name,
    }))
    .filter((provider) => provider.baseUrl);

export const computeRoutingRecommendations = (
  providers: FreeProviderResolvedItem[]
): FreeProviderRoutingRecommendation[] =>
  providers
    .filter((provider) => provider.state.enabled)
    .map((provider) => {
      const quota = provider.state.quota;
      const errorPenalty = quota.errors * 5 + quota.rateLimitHits * 8;
      const latencyPenalty = quota.latencyMsAvg > 0 ? Math.min(30, quota.latencyMsAvg / 100) : 10;
      const categoryBonus = provider.category === 'free' ? 25 : 10;
      const keyBonus = provider.state.keys.filter((key) => key.enabled).length * 4;
      const score = Math.max(0, 100 + categoryBonus + keyBonus - errorPenalty - latencyPenalty);
      return {
        providerId: provider.id,
        score,
        reason:
          provider.category === 'free'
            ? 'Prioritized free provider with available quota'
            : 'Trial provider used as fallback candidate',
      };
    })
    .sort((left, right) => right.score - left.score);

export const mergeDetectedModels = (
  currentModels: ModelAlias[],
  detectedModels: ModelAlias[]
): ModelAlias[] => {
  const seen = new Map<string, ModelAlias>();
  currentModels.forEach((model) => {
    const name = String(model.name ?? '').trim();
    if (!name) return;
    seen.set(name.toLowerCase(), { ...model, name });
  });
  detectedModels.forEach((model) => {
    const name = String(model.name ?? '').trim();
    if (!name || seen.has(name.toLowerCase())) return;
    seen.set(name.toLowerCase(), { ...model, name });
  });
  return Array.from(seen.values());
};

export const parseModelsFromApiCallResult = (result: ApiCallResult): ModelAlias[] => {
  if (result.statusCode < 200 || result.statusCode >= 300) {
    return [];
  }
  const normalized = normalizeModelList(result.body ?? result.bodyText, { dedupe: true });
  return normalized.map((model) => ({ name: model.name, alias: model.alias }));
};

export const buildTestResultFromApiCall = (
  result: ApiCallResult,
  latencyMs: number
): FreeProviderTestResult => {
  const ok = result.statusCode >= 200 && result.statusCode < 300;
  const responseText = result.bodyText || (typeof result.body === 'string' ? result.body : '');
  const message = ok ? 'Provider responded successfully' : responseText || `HTTP ${result.statusCode}`;
  return {
    ok,
    latencyMs,
    message,
    responseText,
    detectedModels: parseModelsFromApiCallResult(result),
  };
};