import { describe, expect, it } from 'vitest';
import { FREE_PROVIDERS_CATALOG } from './catalog';
import {
  applyModelAliasEntries,
  buildOpenAIProvidersFromFreeProviders,
  computeRoutingRecommendations,
  createDefaultFreeProviderState,
  getProviderModelAliasEntries,
  mergeCatalogWithState,
  mergeDetectedModels,
} from './helpers';
import type { FreeProviderResolvedItem } from '@/types/freeProvider';

describe('freeProviders helpers', () => {
  it('merges catalog with default state', () => {
    const resolved = mergeCatalogWithState(FREE_PROVIDERS_CATALOG.slice(0, 2), {});
    expect(resolved).toHaveLength(2);
    expect(resolved[0]?.state.providerId).toBe(resolved[0]?.id);
  });

  it('builds OpenAI-compatible providers from enabled free providers', () => {
    const openrouter = FREE_PROVIDERS_CATALOG.find((entry) => entry.id === 'openrouter');
    expect(openrouter).toBeTruthy();
    if (!openrouter) return;

    const resolved: FreeProviderResolvedItem[] = [{
      ...openrouter,
      state: {
        ...createDefaultFreeProviderState(openrouter),
        enabled: true,
        models: [{ name: 'gpt-oss-20b' }],
        keys: [
          {
            id: 'k1',
            apiKey: 'test-key',
            type: 'free',
            enabled: true,
            status: 'enabled',
            quota: { requests: 0, tokens: 0, errors: 0, rateLimitHits: 0, latencyMsAvg: 0 },
          },
        ],
      },
    }];

    const generated = buildOpenAIProvidersFromFreeProviders(resolved, {
      openrouter: [{ name: 'gpt-oss-20b', alias: 'oss-default' }],
    });
    expect(generated).toHaveLength(1);
    expect(generated[0]?.baseUrl).toBe(openrouter.openaiBaseUrl);
    expect(generated[0]?.apiKeyEntries[0]?.apiKey).toBe('test-key');
    expect(generated[0]?.models?.[0]?.alias).toBe('oss-default');
  });

  it('computes routing recommendations favoring enabled free providers', () => {
    const providers = FREE_PROVIDERS_CATALOG.slice(0, 2).map((entry, index) => ({
      ...entry,
      state: {
        ...createDefaultFreeProviderState(entry),
        enabled: true,
        quota: {
          requests: 10,
          tokens: 100,
          errors: index,
          rateLimitHits: 0,
          latencyMsAvg: 200 + index * 1000,
        },
      },
    }));

    const recommendations = computeRoutingRecommendations(providers);
    expect(recommendations.length).toBe(2);
    expect(recommendations[0]!.score).toBeGreaterThanOrEqual(recommendations[1]!.score);
  });

  it('merges detected models without duplicates', () => {
    const merged = mergeDetectedModels(
      [{ name: 'gpt-oss-20b' }],
      [{ name: 'gpt-oss-20b' }, { name: 'llama-3.3-70b' }]
    );
    expect(merged).toHaveLength(2);
  });

  it('applies provider model aliases without duplicating raw source names', () => {
    const aliases = getProviderModelAliasEntries(
      {
        openrouter: [
          { name: 'gpt-oss-20b', alias: 'oss-default' },
          { name: 'llama-3.3-70b', alias: 'fast-general' },
        ],
      },
      'openrouter'
    );
    const resolved = applyModelAliasEntries(
      [{ name: 'gpt-oss-20b' }, { name: 'llama-3.3-70b' }],
      aliases
    );
    expect(resolved).toEqual([
      { name: 'gpt-oss-20b', alias: 'oss-default' },
      { name: 'llama-3.3-70b', alias: 'fast-general' },
    ]);
  });
});