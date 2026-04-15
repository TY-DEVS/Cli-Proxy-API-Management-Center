import { useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { SecondaryScreenShell } from '@/components/common/SecondaryScreenShell';
import {
  ProviderHealthBadge,
  ProviderStatusBadge,
  ProviderTagList,
  ProviderTypeBadge,
} from '@/components/freeProviders';
import { freeProvidersApi } from '@/features/freeProviders/api';
import { getFreeProviderCatalogEntry } from '@/features/freeProviders/catalog';
import {
  applyModelAliasEntries,
  createFreeProviderKey,
  getProviderModelAliasEntries,
  getResolvedProviderHealth,
  getResolvedProviderStatus,
} from '@/features/freeProviders/helpers';
import { useFreeProvidersStore, useNotificationStore } from '@/stores';
import type { ModelAlias } from '@/types';
import { generateId } from '@/utils/helpers';
import styles from './FreeProvidersPage.module.scss';

export function FreeProviderDetailPage() {
  const { providerId = '' } = useParams<{ providerId: string }>();
  const navigate = useNavigate();
  const { showNotification } = useNotificationStore();
  const getResolvedProviders = useFreeProvidersStore((state) => state.getResolvedProviders);
  const setProviderEnabled = useFreeProvidersStore((state) => state.setProviderEnabled);
  const setProviderPriority = useFreeProvidersStore((state) => state.setProviderPriority);
  const upsertProviderKey = useFreeProvidersStore((state) => state.upsertProviderKey);
  const deleteProviderKey = useFreeProvidersStore((state) => state.deleteProviderKey);
  const setProviderKeyEnabled = useFreeProvidersStore((state) => state.setProviderKeyEnabled);
  const updateProviderQuota = useFreeProvidersStore((state) => state.updateProviderQuota);
  const updateProviderKeyQuota = useFreeProvidersStore((state) => state.updateProviderKeyQuota);
  const updateProviderModels = useFreeProvidersStore((state) => state.updateProviderModels);
  const setProviderStatus = useFreeProvidersStore((state) => state.setProviderStatus);
  const modelAlias = useFreeProvidersStore((state) => state.modelAlias);

  const provider = useMemo(
    () => getResolvedProviders().find((item) => item.id === providerId),
    [getResolvedProviders, providerId]
  );
  const catalogEntry = getFreeProviderCatalogEntry(providerId);

  const [modalOpen, setModalOpen] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [label, setLabel] = useState('');
  const [keyType, setKeyType] = useState(provider?.category ?? 'free');
  const [rateLimit, setRateLimit] = useState('');
  const [monthlyQuota, setMonthlyQuota] = useState('');
  const [testingKeyId, setTestingKeyId] = useState<string | null>(null);
  const [providerTesting, setProviderTesting] = useState(false);
  const [testResponse, setTestResponse] = useState('');

  if (!provider || !catalogEntry) {
    return <Navigate to="/free-providers" replace />;
  }

  const status = getResolvedProviderStatus(provider);
  const resolvedModels = applyModelAliasEntries(
    provider.state.models,
    getProviderModelAliasEntries(modelAlias, provider.id)
  );

  const handleAddKey = () => {
    const trimmedApiKey = apiKey.trim();
    if (!trimmedApiKey) {
      showNotification('API key is required.', 'error');
      return;
    }

    upsertProviderKey(provider.id, {
      ...createFreeProviderKey(keyType),
      id: generateId(),
      apiKey: trimmedApiKey,
      label: label.trim() || undefined,
      rateLimit: rateLimit.trim() ? Number(rateLimit) : undefined,
      monthlyQuota: monthlyQuota.trim() ? Number(monthlyQuota) : undefined,
      enabled: true,
      status: 'enabled',
    });

    setApiKey('');
    setLabel('');
    setRateLimit('');
    setMonthlyQuota('');
    setModalOpen(false);
    showNotification('API key added to provider.', 'success');
  };

  const handleTestKey = async (keyId: string) => {
    const key = provider.state.keys.find((entry) => entry.id === keyId);
    if (!key) return;

    setTestingKeyId(keyId);
    updateProviderKeyQuota(provider.id, keyId, { lastCheckedAt: new Date().toISOString() });
    try {
      const result = await freeProvidersApi.testProvider(provider, key.apiKey);
      setTestResponse(result.responseText || result.message);
      updateProviderKeyQuota(provider.id, keyId, {
        errors: result.ok ? key.quota.errors : key.quota.errors + 1,
        latencyMsAvg: result.latencyMs,
        lastCheckedAt: new Date().toISOString(),
      });
      setProviderStatus(provider.id, result.ok ? 'active' : 'error', result.ok ? undefined : result.message);
      showNotification(result.ok ? 'Provider key test succeeded.' : result.message, result.ok ? 'success' : 'error');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || 'Unknown error');
      showNotification(message, 'error');
      setProviderStatus(provider.id, 'error', message);
    } finally {
      setTestingKeyId(null);
    }
  };

  const handleTestProvider = async () => {
    const firstEnabledKey = provider.state.keys.find((entry) => entry.enabled && entry.apiKey.trim());
    if (!firstEnabledKey) {
      showNotification('Add and enable an API key first.', 'warning');
      return;
    }

    setProviderTesting(true);
    try {
      const result = await freeProvidersApi.testProvider(provider, firstEnabledKey.apiKey);
      setTestResponse(result.responseText || result.message);
      const health = getResolvedProviderHealth(result.latencyMs, !result.ok);
      updateProviderQuota(provider.id, {
        latencyMsAvg: result.latencyMs,
        errors: result.ok ? provider.state.quota.errors : provider.state.quota.errors + 1,
        lastCheckedAt: new Date().toISOString(),
      });
      setProviderStatus(provider.id, result.ok ? 'active' : 'error', result.ok ? undefined : result.message);
      if (result.detectedModels?.length) {
        updateProviderModels(provider.id, result.detectedModels);
      }
      showNotification(
        result.ok ? `Provider healthy (${health}, ${result.latencyMs} ms).` : result.message,
        result.ok ? 'success' : 'error'
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || 'Unknown error');
      setProviderStatus(provider.id, 'error', message);
      showNotification(message, 'error');
    } finally {
      setProviderTesting(false);
    }
  };

  const handleFetchModels = async () => {
    const firstEnabledKey = provider.state.keys.find((entry) => entry.enabled && entry.apiKey.trim());
    try {
      const models = await freeProvidersApi.fetchModels(provider, firstEnabledKey?.apiKey);
      if (!models.length) {
        showNotification('No models detected for this provider.', 'warning');
        return;
      }
      updateProviderModels(provider.id, models);
      showNotification(`Detected ${models.length} models.`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || 'Unknown error');
      showNotification(message, 'error');
    }
  };

  return (
    <SecondaryScreenShell
      title={provider.name}
      onBack={() => navigate('/free-providers')}
      backLabel="Free Providers"
      rightAction={<Button size="sm" onClick={() => setModalOpen(true)}>Add API Key</Button>}
      floatingAction={
        <div className={styles.actionsRow}>
          <Button variant="secondary" onClick={() => navigate(`/free-providers/model-alias?provider=${encodeURIComponent(provider.id)}`)}>
            Model aliases
          </Button>
          <Button variant="secondary" onClick={handleFetchModels}>Auto-detect models</Button>
          <Button variant="secondary" onClick={handleTestProvider} loading={providerTesting}>Test provider</Button>
        </div>
      }
    >
      <div className={styles.detailGrid}>
        <div className={styles.sectionStack}>
          <Card title="Overview">
            <div className={styles.badgeRow}>
              <ProviderTypeBadge type={provider.category} />
              <ProviderStatusBadge status={status} />
              <ProviderHealthBadge health={provider.state.health} />
            </div>
            <ProviderTagList tags={provider.state.tags} />
            <div className={styles.summaryList} style={{ marginTop: 16 }}>
              <div className={styles.summaryItem}>API base URL<span className={styles.summaryValue}>{provider.state.baseUrl || provider.openaiBaseUrl || provider.websiteUrl}</span></div>
              <div className={styles.summaryItem}>Compatibility<span className={styles.summaryValue}>{provider.compatibility}</span></div>
              <div className={styles.summaryItem}>Priority<span className={styles.summaryValue}>{provider.state.priority}</span></div>
              <div className={styles.summaryItem}>Accounts<span className={styles.summaryValue}>{provider.state.keys.length}</span></div>
            </div>
            <div className={styles.actionsRow} style={{ marginTop: 16 }}>
              <ToggleSwitch checked={provider.state.enabled} onChange={(value) => setProviderEnabled(provider.id, value)} ariaLabel="Enable provider" label="Enabled" />
              <Input
                label="Priority"
                type="number"
                value={String(provider.state.priority)}
                onChange={(event) => setProviderPriority(provider.id, Number(event.target.value || provider.state.priority))}
              />
            </div>
            <div className={styles.modelList} style={{ marginTop: 12 }}>
              {resolvedModels.map((model: ModelAlias) => (
                <span key={model.name} className={styles.modelTag}>{model.alias ? `${model.name} (${model.alias})` : model.name}</span>
              ))}
            </div>
          </Card>

          <Card title="API Keys">
            <div className={styles.tableWrap}>
              <table className={styles.keyTable}>
                <thead>
                  <tr>
                    <th>Key</th>
                    <th>Status</th>
                    <th>Quota</th>
                    <th>Usage</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {provider.state.keys.map((key) => (
                    <tr key={key.id}>
                      <td>
                        <div className={styles.mono}>{key.label || 'Key'}</div>
                        <div className={styles.mono}>{key.apiKey.replace(/.(?=.{6})/g, '•')}</div>
                      </td>
                      <td>
                        <div className={styles.badgeRow}>
                          <span className={`${styles.badge} ${key.enabled ? styles.badgeActive : styles.badgeInactive}`}>{key.status}</span>
                        </div>
                      </td>
                      <td>
                        <div>Rate: {key.rateLimit ?? '-'}</div>
                        <div>Monthly: {key.monthlyQuota ?? '-'}</div>
                      </td>
                      <td>
                        <div>Req: {key.quota.requests}</div>
                        <div>Tok: {key.quota.tokens}</div>
                        <div>Err: {key.quota.errors}</div>
                        <div>RL hit: {key.quota.rateLimitHits}</div>
                      </td>
                      <td>
                        <div className={styles.keyActions}>
                          <Button size="sm" variant="secondary" onClick={() => setProviderKeyEnabled(provider.id, key.id, !key.enabled)}>
                            {key.enabled ? 'Disable' : 'Enable'}
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => void handleTestKey(key.id)} loading={testingKeyId === key.id}>
                            Test key
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => deleteProviderKey(provider.id, key.id)}>
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!provider.state.keys.length && <div className={styles.emptyHint}>No API keys configured yet.</div>}
          </Card>
        </div>

        <div className={styles.sectionStack}>
          <Card title="Quota tracking">
            <div className={styles.summaryList}>
              <div className={styles.summaryItem}>Requests<span className={styles.summaryValue}>{provider.state.quota.requests}</span></div>
              <div className={styles.summaryItem}>Tokens<span className={styles.summaryValue}>{provider.state.quota.tokens}</span></div>
              <div className={styles.summaryItem}>Errors<span className={styles.summaryValue}>{provider.state.quota.errors}</span></div>
              <div className={styles.summaryItem}>Latency<span className={styles.summaryValue}>{provider.state.quota.latencyMsAvg || 0} ms</span></div>
            </div>
          </Card>

          <Card title="Quick test response">
            <div className={styles.responseBox}>{testResponse || 'No test executed yet.'}</div>
          </Card>

          <Card title="Catalog info">
            <div className={styles.sectionStack}>
              <div><strong>Import strategy:</strong> {provider.importStrategy}</div>
              <div><strong>Website:</strong> {provider.websiteUrl}</div>
              <div><strong>Limits:</strong> {provider.limits || 'Not documented'}</div>
            </div>
          </Card>
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add API Key">
        <Input label="API Key" value={apiKey} onChange={(event) => setApiKey(event.target.value)} />
        <Input label="Label (optional)" value={label} onChange={(event) => setLabel(event.target.value)} />
        <Input label="Type (free/trial)" value={keyType} onChange={(event) => setKeyType(event.target.value === 'trial' ? 'trial' : 'free')} />
        <Input label="Rate limit (optional)" type="number" value={rateLimit} onChange={(event) => setRateLimit(event.target.value)} />
        <Input label="Monthly quota (optional)" type="number" value={monthlyQuota} onChange={(event) => setMonthlyQuota(event.target.value)} />
        <div className={styles.actionsRow} style={{ marginTop: 16 }}>
          <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button onClick={handleAddKey}>Save</Button>
        </div>
      </Modal>
    </SecondaryScreenShell>
  );
}
