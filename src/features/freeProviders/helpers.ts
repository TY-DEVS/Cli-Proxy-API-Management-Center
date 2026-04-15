import type { ApiCallResult } from '@/services/api/apiCall';
import type { ModelAlias, OAuthModelAliasEntry, OpenAIProviderConfig } from '@/types';
import { generateId } from '@/utils/helpers';
import { normalizeModelList } from '@/utils/models';
import type {
  FreeProviderHealth,
  FreeProviderKeyEntry,
  FreeProviderModelAlias,
  FreeProviderQuotaStats,
  FreeProviderResolvedItem,
  FreeProviderRoutingRecommendation,
  FreeProviderStateItem,
  FreeProviderStatus,
  FreeProviderTag,
  FreeProviderTestResult,
} from '@/types/freeProvider';
import type { FreeProviderCatalogEntry } from '@/generated/freeProviderCatalog';

const normalizeProviderKey = (value: string) => String(value ?? '').trim().toLowerCase();

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
  providers: FreeProviderResolvedItem[],
  modelAlias: FreeProviderModelAlias = {}
): OpenAIProviderConfig[] =>
  providers
    .filter((provider) => provider.importStrategy === 'openai-compatibility')
    .filter((provider) => provider.state.enabled)
    .filter((provider) => provider.state.keys.some((key) => key.enabled && key.apiKey.trim()))
    .map((provider) => {
      const resolvedModels = applyModelAliasEntries(
        provider.state.models,
        getProviderModelAliasEntries(modelAlias, provider.id)
      );

      return {
        name: provider.state.customName?.trim() || provider.name,
        baseUrl: provider.state.baseUrl?.trim() || provider.openaiBaseUrl || '',
        apiKeyEntries: provider.state.keys
          .filter((key) => key.enabled && key.apiKey.trim())
          .map((key) => ({ apiKey: key.apiKey.trim() })),
        headers: provider.defaultHeaders,
        models: resolvedModels,
        priority: provider.state.priority,
        testModel: resolvedModels[0]?.name,
      };
    })
    .filter((provider) => provider.baseUrl);

export const normalizeFreeProviderModelAliasEntries = (
  entries?: OAuthModelAliasEntry[]
): OAuthModelAliasEntry[] => {
  if (!Array.isArray(entries)) return [];

  const seen = new Set<string>();
  const normalized: OAuthModelAliasEntry[] = [];

  entries.forEach((entry) => {
    const name = String(entry?.name ?? '').trim();
    const alias = String(entry?.alias ?? '').trim();
    if (!name || !alias) return;

    const key = `${name.toLowerCase()}::${alias.toLowerCase()}::${entry?.fork ? '1' : '0'}`;
    if (seen.has(key)) return;
    seen.add(key);
    normalized.push(entry?.fork ? { name, alias, fork: true } : { name, alias });
  });

  return normalized;
};

export const getProviderModelAliasEntries = (
  modelAlias: FreeProviderModelAlias,
  providerId: string
): OAuthModelAliasEntry[] => {
  const targetKey = normalizeProviderKey(providerId);
  const matchKey = Object.keys(modelAlias).find((key) => normalizeProviderKey(key) === targetKey);
  return normalizeFreeProviderModelAliasEntries(matchKey ? modelAlias[matchKey] : []);
};

export const applyModelAliasEntries = (
  models: ModelAlias[],
  aliasEntries: OAuthModelAliasEntry[]
): ModelAlias[] => {
  const sourceModels = Array.isArray(models) ? models : [];
  const normalizedAliases = normalizeFreeProviderModelAliasEntries(aliasEntries);
  const aliasBySource = new Map<string, OAuthModelAliasEntry[]>();
  const sourceByName = new Map<string, ModelAlias>();
  const seen = new Set<string>();
  const resolved: ModelAlias[] = [];

  sourceModels.forEach((model) => {
    const name = String(model?.name ?? '').trim();
    if (!name) return;
    sourceByName.set(name.toLowerCase(), { ...model, name });
  });

  normalizedAliases.forEach((entry) => {
    const key = entry.name.trim().toLowerCase();
    if (!aliasBySource.has(key)) {
      aliasBySource.set(key, []);
    }
    aliasBySource.get(key)!.push(entry);
  });

  const pushModel = (model: ModelAlias) => {
    const name = String(model.name ?? '').trim();
    const alias = String(model.alias ?? '').trim();
    const dedupeKey = `${name.toLowerCase()}::${alias.toLowerCase()}`;
    if (!name || seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    resolved.push(alias ? { ...model, name, alias } : { ...model, name, alias: undefined });
  };

  sourceModels.forEach((model) => {
    const name = String(model?.name ?? '').trim();
    if (!name) return;

    const matches = aliasBySource.get(name.toLowerCase()) ?? [];
    if (!matches.length) {
      pushModel({ ...model, name });
      return;
    }

    matches.forEach((match) => {
      pushModel({ ...model, name, alias: match.alias });
    });
  });

  normalizedAliases.forEach((entry) => {
    if (sourceByName.has(entry.name.toLowerCase())) return;
    pushModel({ name: entry.name, alias: entry.alias });
  });

  return resolved;
};

export const buildModelAliasLookup = (modelAlias: FreeProviderModelAlias): Map<string, string> => {
  const lookup = new Map<string, string>();
  Object.values(modelAlias).forEach((entries) => {
    normalizeFreeProviderModelAliasEntries(entries).forEach((entry) => {
      lookup.set(entry.name.trim().toLowerCase(), entry.alias.trim());
    });
  });
  return lookup;
};

export const resolveUsageModelAlias = (
  modelName: string,
  modelAlias: FreeProviderModelAlias
): string => {
  const trimmed = String(modelName ?? '').trim();
  if (!trimmed) return trimmed;
  return buildModelAliasLookup(modelAlias).get(trimmed.toLowerCase()) ?? trimmed;
};

const cloneRecordWithModelAliases = (
  value: unknown,
  modelAlias: FreeProviderModelAlias
): unknown => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }

  const source = value as Record<string, unknown>;
  const apisRaw = source.apis;
  if (!apisRaw || typeof apisRaw !== 'object' || Array.isArray(apisRaw)) {
    return value;
  }

  const lookup = buildModelAliasLookup(modelAlias);
  if (lookup.size === 0) {
    return value;
  }

  const nextApis: Record<string, unknown> = {};
  Object.entries(apisRaw as Record<string, unknown>).forEach(([apiName, apiData]) => {
    if (!apiData || typeof apiData !== 'object' || Array.isArray(apiData)) {
      nextApis[apiName] = apiData;
      return;
    }

    const apiRecord = apiData as Record<string, unknown>;
    const modelsRaw = apiRecord.models;
    if (!modelsRaw || typeof modelsRaw !== 'object' || Array.isArray(modelsRaw)) {
      nextApis[apiName] = apiData;
      return;
    }

    const nextModels: Record<string, unknown> = {};
    Object.entries(modelsRaw as Record<string, unknown>).forEach(([modelName, modelData]) => {
      const resolvedModelName = lookup.get(modelName.trim().toLowerCase()) ?? modelName;
      if (!modelData || typeof modelData !== 'object' || Array.isArray(modelData)) {
        nextModels[resolvedModelName] = modelData;
        return;
      }

      const modelRecord = modelData as Record<string, unknown>;
      const existing = nextModels[resolvedModelName];
      if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
        nextModels[resolvedModelName] = { ...modelRecord };
        return;
      }

      const existingRecord = existing as Record<string, unknown>;
      nextModels[resolvedModelName] = {
        ...existingRecord,
        total_requests: Number(existingRecord.total_requests ?? 0) + Number(modelRecord.total_requests ?? 0),
        total_tokens: Number(existingRecord.total_tokens ?? 0) + Number(modelRecord.total_tokens ?? 0),
        success_count: Number(existingRecord.success_count ?? 0) + Number(modelRecord.success_count ?? 0),
        failure_count: Number(existingRecord.failure_count ?? 0) + Number(modelRecord.failure_count ?? 0),
        details: [
          ...(Array.isArray(existingRecord.details) ? existingRecord.details : []),
          ...(Array.isArray(modelRecord.details) ? modelRecord.details : []),
        ],
      };
    });

    nextApis[apiName] = { ...apiRecord, models: nextModels };
  });

  return { ...source, apis: nextApis };
};

export const applyUsageModelAliases = <T>(usageData: T, modelAlias: FreeProviderModelAlias): T =>
  cloneRecordWithModelAliases(usageData, modelAlias) as T;

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