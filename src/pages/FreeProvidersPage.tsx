import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { Select } from '@/components/ui/Select';
import { ProviderStatusBadge, ProviderTagList, ProviderTypeBadge } from '@/components/freeProviders';
import { providersApi } from '@/services/api';
import { useConfigStore, useFreeProvidersStore, useNotificationStore } from '@/stores';
import type { FreeProviderFilter, FreeProviderResolvedItem } from '@/types/freeProvider';
import {
  buildOpenAIProvidersFromFreeProviders,
  computeRoutingRecommendations,
  getResolvedProviderStatus,
} from '@/features/freeProviders/helpers';
import styles from './FreeProvidersPage.module.scss';

const FILTER_OPTIONS: Array<{ value: FreeProviderFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'free', label: 'Free' },
  { value: 'trial', label: 'Trial' },
  { value: 'active', label: 'Active' },
  { value: 'error', label: 'Error' },
];

const matchesFilter = (provider: FreeProviderResolvedItem, filter: FreeProviderFilter) => {
  const status = getResolvedProviderStatus(provider);
  if (filter === 'all') return true;
  if (filter === 'free' || filter === 'trial') return provider.category === filter;
  return status === filter;
};

export function FreeProvidersPage() {
  const navigate = useNavigate();
  const { showNotification } = useNotificationStore();
  const filter = useFreeProvidersStore((state) => state.filter);
  const setFilter = useFreeProvidersStore((state) => state.setFilter);
  const autoFreeMode = useFreeProvidersStore((state) => state.autoFreeMode);
  const setAutoFreeMode = useFreeProvidersStore((state) => state.setAutoFreeMode);
  const syncCatalog = useFreeProvidersStore((state) => state.syncCatalog);
  const setProviderEnabled = useFreeProvidersStore((state) => state.setProviderEnabled);
  const getResolvedProviders = useFreeProvidersStore((state) => state.getResolvedProviders);
  const config = useConfigStore((state) => state.config);
  const updateConfigValue = useConfigStore((state) => state.updateConfigValue);
  const clearCache = useConfigStore((state) => state.clearCache);
  const [syncing, setSyncing] = useState(false);

  const providers = getResolvedProviders();
  const filteredProviders = useMemo(
    () => providers.filter((provider) => matchesFilter(provider, filter)),
    [filter, providers]
  );
  const recommendations = useMemo(() => computeRoutingRecommendations(providers), [providers]);
  const openaiImportableCount = providers.filter(
    (provider) => provider.importStrategy === 'openai-compatibility'
  ).length;
  const activeCount = providers.filter((provider) => getResolvedProviderStatus(provider) === 'active').length;
  const errorCount = providers.filter((provider) => getResolvedProviderStatus(provider) === 'error').length;

  const handleSyncCatalog = () => {
    syncCatalog();
    showNotification('Free providers catalog synced from bundled free-llm-api-resources data.', 'success');
  };

  const handleExportOpenAIProviders = async () => {
    const generated = buildOpenAIProvidersFromFreeProviders(providers);
    if (!generated.length) {
      showNotification('Enable at least one OpenAI-compatible provider and add an API key first.', 'warning');
      return;
    }

    setSyncing(true);
    try {
      const existing = config?.openaiCompatibility ?? [];
      const generatedNames = new Set(generated.map((provider) => provider.name.toLowerCase()));
      const preserved = existing.filter((provider) => !generatedNames.has(provider.name.toLowerCase()));
      const next = [...preserved, ...generated];
      await providersApi.saveOpenAIProviders(next);
      updateConfigValue('openai-compatibility', next);
      clearCache('openai-compatibility');
      showNotification(`Synced ${generated.length} providers into OpenAI-compatible routing.`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || 'Unknown error');
      showNotification(`Free provider sync failed: ${message}`, 'error');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerCopy}>
          <h1 className={styles.pageTitle}>Free Providers</h1>
          <p className={styles.pageSubtitle}>
            Centralize free and trial LLM providers, manage multiple API keys, track quotas, and prepare OpenAI-compatible routing.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Button variant="secondary" onClick={handleSyncCatalog}>Sync Free Providers</Button>
          <Button variant="secondary" onClick={handleExportOpenAIProviders} loading={syncing}>
            Sync to OpenAI Providers
          </Button>
          <Button onClick={() => navigate('/free-providers/openrouter')}>Add Provider</Button>
        </div>
      </div>

      <Card>
        <div className={styles.autoModeCard}>
          <div className={styles.autoModeCopy}>
            <strong>Auto Free Mode</strong>
            <span className={styles.emptyHint}>
              Prefer enabled free providers first, then use trial providers as fallback candidates. Backend runtime support is required for automatic routing execution.
            </span>
          </div>
          <ToggleSwitch checked={autoFreeMode} onChange={setAutoFreeMode} ariaLabel="Auto Free Mode" />
        </div>
      </Card>

      <div className={styles.filterBar}>
        {FILTER_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`${styles.filterPill} ${filter === option.value ? styles.filterPillActive : ''}`}
            onClick={() => setFilter(option.value)}
          >
            {option.label}
          </button>
        ))}
        <Select
          value={filter}
          options={FILTER_OPTIONS}
          onChange={(value) => setFilter(value as FreeProviderFilter)}
          fullWidth={false}
          ariaLabel="Filter free providers"
        />
      </div>

      <div className={styles.summaryList}>
        <div className={styles.summaryItem}>Total providers<span className={styles.summaryValue}>{providers.length}</span></div>
        <div className={styles.summaryItem}>Active<span className={styles.summaryValue}>{activeCount}</span></div>
        <div className={styles.summaryItem}>Errors<span className={styles.summaryValue}>{errorCount}</span></div>
        <div className={styles.summaryItem}>OpenAI-compatible<span className={styles.summaryValue}>{openaiImportableCount}</span></div>
      </div>

      {recommendations[0] && (
        <Card>
          <div className={styles.autoModeCard}>
            <div className={styles.autoModeCopy}>
              <strong>Recommended route</strong>
              <span className={styles.emptyHint}>{recommendations[0].providerId}: {recommendations[0].reason}</span>
            </div>
            <span className={`${styles.badge} ${styles.badgeActive}`}>Score {Math.round(recommendations[0].score)}</span>
          </div>
        </Card>
      )}

      <div className={styles.providerGrid}>
        {filteredProviders.map((provider) => {
          const status = getResolvedProviderStatus(provider);
          const activeKeys = provider.state.keys.filter((key) => key.enabled).length;
          return (
            <Card key={provider.id} className={styles.providerCard}>
              <div className={styles.providerHeader}>
                <div className={styles.providerTitleBlock}>
                  <h2 className={styles.providerTitle}>{provider.name}</h2>
                  <span className={styles.providerUrl}>{provider.state.baseUrl || provider.websiteUrl}</span>
                </div>
                <ToggleSwitch
                  checked={provider.state.enabled}
                  onChange={(enabled) => setProviderEnabled(provider.id, enabled)}
                  ariaLabel={`Enable ${provider.name}`}
                />
              </div>
              <div className={styles.badgeRow}>
                <ProviderTypeBadge type={provider.category} />
                <ProviderStatusBadge status={status} />
                <span className={`${styles.badge} ${styles.badgeMuted}`}>{provider.compatibility}</span>
              </div>
              <ProviderTagList tags={provider.state.tags} />
              <div className={styles.providerMeta}>
                <div className={styles.metaCard}>
                  <span className={styles.metaLabel}>Accounts</span>
                  <span className={styles.metaValue}>{provider.state.keys.length}</span>
                </div>
                <div className={styles.metaCard}>
                  <span className={styles.metaLabel}>Active keys</span>
                  <span className={styles.metaValue}>{activeKeys}</span>
                </div>
                <div className={styles.metaCard}>
                  <span className={styles.metaLabel}>Models</span>
                  <span className={styles.metaValue}>{provider.state.models.length}</span>
                </div>
                <div className={styles.metaCard}>
                  <span className={styles.metaLabel}>Priority</span>
                  <span className={styles.metaValue}>{provider.state.priority}</span>
                </div>
              </div>
              {provider.state.lastError && <div className="error-box">{provider.state.lastError}</div>}
              <div className={styles.actionsRow}>
                <Button variant="secondary" size="sm" onClick={() => navigate(`/free-providers/${provider.id}`)}>
                  Details
                </Button>
                <Button variant="ghost" size="sm" onClick={() => window.open(provider.websiteUrl, '_blank', 'noopener,noreferrer')}>
                  Website
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
