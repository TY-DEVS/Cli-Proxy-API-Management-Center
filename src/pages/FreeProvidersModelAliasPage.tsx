import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { AutocompleteInput } from '@/components/ui/AutocompleteInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { IconChevronUp, IconX } from '@/components/ui/icons';
import { ModelMappingDiagram, type ModelMappingDiagramRef } from '@/components/modelAlias';
import { SecondaryScreenShell } from '@/components/common/SecondaryScreenShell';
import { useEdgeSwipeBack } from '@/hooks/useEdgeSwipeBack';
import { useFreeProvidersStore, useNotificationStore } from '@/stores';
import type { OAuthModelAliasEntry } from '@/types';
import { generateId } from '@/utils/helpers';
import styles from './FreeProvidersModelAliasPage.module.scss';

type LocationState = { fromFreeProviders?: boolean } | null;
type FreeProviderModelMappingFormEntry = OAuthModelAliasEntry & { id: string };
type ViewMode = 'diagram' | 'list';

const buildEmptyMappingEntry = (): FreeProviderModelMappingFormEntry => ({
  id: generateId(),
  name: '',
  alias: '',
  fork: true,
});

const normalizeMappingEntries = (
  entries?: OAuthModelAliasEntry[]
): FreeProviderModelMappingFormEntry[] => {
  if (!Array.isArray(entries) || entries.length === 0) {
    return [buildEmptyMappingEntry()];
  }
  return entries.map((entry) => ({
    id: generateId(),
    name: entry.name ?? '',
    alias: entry.alias ?? '',
    fork: Boolean(entry.fork),
  }));
};

export function FreeProvidersModelAliasPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { showNotification } = useNotificationStore();
  const getResolvedProviders = useFreeProvidersStore((state) => state.getResolvedProviders);
  const modelAlias = useFreeProvidersStore((state) => state.modelAlias);
  const autoLinkDuplicateModels = useFreeProvidersStore((state) => state.autoLinkDuplicateModels);
  const saveProviderModelAlias = useFreeProvidersStore((state) => state.saveProviderModelAlias);
  const deleteProviderModelAlias = useFreeProvidersStore((state) => state.deleteProviderModelAlias);
  const diagramRef = useRef<ModelMappingDiagramRef | null>(null);

  const providerFromParams = searchParams.get('provider') ?? '';
  const providers = getResolvedProviders();
  const providerOptions = useMemo(
    () => providers.map((provider) => provider.id).sort((a, b) => a.localeCompare(b)),
    [providers]
  );
  const [provider, setProvider] = useState(providerFromParams);
  const [mappings, setMappings] = useState<FreeProviderModelMappingFormEntry[]>([buildEmptyMappingEntry()]);
  const [viewMode, setViewMode] = useState<ViewMode>('diagram');

  const selectedProvider = useMemo(
    () => providers.find((item) => item.id === provider.trim()),
    [provider, providers]
  );
  const modelsList = useMemo(() => selectedProvider?.state.models ?? [], [selectedProvider]);
  const allProviderModels = useMemo(
    () =>
      Object.fromEntries(
        providers.map((item) => [
          item.id,
          item.state.models.map((model) => ({
            id: model.name,
            display_name: model.alias,
            type: item.category,
          })),
        ])
      ),
    [providers]
  );

  useEffect(() => {
    setProvider(providerFromParams);
  }, [providerFromParams]);

  useEffect(() => {
    const existing = provider.trim() ? modelAlias[provider.trim()] ?? [] : [];
    setMappings(normalizeMappingEntries(existing));
  }, [modelAlias, provider]);

  const handleBack = useCallback(() => {
    const state = location.state as LocationState;
    if (state?.fromFreeProviders) {
      navigate(-1);
      return;
    }
    navigate('/free-providers', { replace: true });
  }, [location.state, navigate]);

  const swipeRef = useEdgeSwipeBack({ onBack: handleBack });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleBack();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleBack]);

  const updateProvider = useCallback(
    (value: string) => {
      setProvider(value);
      const next = new URLSearchParams(searchParams);
      const trimmed = value.trim();
      if (trimmed) {
        next.set('provider', trimmed);
      } else {
        next.delete('provider');
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const updateMappingEntry = useCallback(
    (index: number, field: keyof OAuthModelAliasEntry, value: string | boolean) => {
      setMappings((prev) =>
        prev.map((entry, idx) => (idx === index ? { ...entry, [field]: value } : entry))
      );
    },
    []
  );

  const addMappingEntry = useCallback(() => {
    setMappings((prev) => [...prev, buildEmptyMappingEntry()]);
  }, []);

  const removeMappingEntry = useCallback((index: number) => {
    setMappings((prev) => {
      const next = prev.filter((_, idx) => idx !== index);
      return next.length ? next : [buildEmptyMappingEntry()];
    });
  }, []);

  const handleSave = useCallback(() => {
    const providerId = provider.trim();
    if (!providerId) {
      showNotification('Provider is required.', 'error');
      return;
    }

    const seen = new Set<string>();
    const normalized = mappings
      .map((entry) => {
        const name = String(entry.name ?? '').trim();
        const alias = String(entry.alias ?? '').trim();
        if (!name || !alias) return null;
        const key = `${name.toLowerCase()}::${alias.toLowerCase()}::${entry.fork ? '1' : '0'}`;
        if (seen.has(key)) return null;
        seen.add(key);
        return entry.fork ? { name, alias, fork: true } : { name, alias };
      })
      .filter(Boolean) as OAuthModelAliasEntry[];

    if (normalized.length) {
      saveProviderModelAlias(providerId, normalized);
      showNotification('Free provider model aliases updated.', 'success');
    } else {
      deleteProviderModelAlias(providerId);
      showNotification('Free provider model aliases removed.', 'success');
    }

    handleBack();
  }, [deleteProviderModelAlias, handleBack, mappings, provider, saveProviderModelAlias, showNotification]);

  const handleAutoLinkDuplicates = useCallback(() => {
    const added = autoLinkDuplicateModels();
    showNotification(
      added > 0
        ? `Linked ${added} repeated provider model(s) to shared aliases.`
        : 'No repeated provider models found to link.',
      added > 0 ? 'success' : 'info'
    );
  }, [autoLinkDuplicateModels, showNotification]);

  const updateProviderMappings = useCallback(
    (providerId: string, updater: (entries: OAuthModelAliasEntry[]) => OAuthModelAliasEntry[]) => {
      const normalizedProviderId = providerId.trim();
      if (!normalizedProviderId) return;
      const current = modelAlias[normalizedProviderId] ?? [];
      const next = updater(current);
      if (next.length) {
        saveProviderModelAlias(normalizedProviderId, next);
      } else {
        deleteProviderModelAlias(normalizedProviderId);
      }
    },
    [deleteProviderModelAlias, modelAlias, saveProviderModelAlias]
  );

  const handleDiagramUpdate = useCallback(
    (providerId: string, sourceModel: string, newAlias: string) => {
      const name = sourceModel.trim();
      const alias = newAlias.trim();
      if (!providerId.trim() || !name || !alias) return;

      updateProviderMappings(providerId, (current) => {
        const exists = current.some(
          (entry) =>
            entry.name.trim().toLowerCase() === name.toLowerCase() &&
            entry.alias.trim().toLowerCase() === alias.toLowerCase()
        );
        return exists ? current : [...current, { name, alias, fork: true }];
      });
      showNotification('Free provider model aliases updated.', 'success');
    },
    [showNotification, updateProviderMappings]
  );

  const handleDiagramDeleteLink = useCallback(
    (providerId: string, sourceModel: string, alias: string) => {
      const nameKey = sourceModel.trim().toLowerCase();
      const aliasKey = alias.trim().toLowerCase();
      if (!providerId.trim() || !nameKey || !aliasKey) return;

      updateProviderMappings(providerId, (current) =>
        current.filter(
          (entry) =>
            entry.name.trim().toLowerCase() !== nameKey ||
            entry.alias.trim().toLowerCase() !== aliasKey
        )
      );
      showNotification('Free provider model aliases updated.', 'success');
    },
    [showNotification, updateProviderMappings]
  );

  const handleDiagramToggleFork = useCallback(
    (providerId: string, sourceModel: string, alias: string, fork: boolean) => {
      const nameKey = sourceModel.trim().toLowerCase();
      const aliasKey = alias.trim().toLowerCase();
      updateProviderMappings(providerId, (current) =>
        current.map((entry) => {
          if (
            entry.name.trim().toLowerCase() === nameKey &&
            entry.alias.trim().toLowerCase() === aliasKey
          ) {
            return fork ? { ...entry, fork: true } : { name: entry.name, alias: entry.alias };
          }
          return entry;
        })
      );
    },
    [updateProviderMappings]
  );

  const handleDiagramRenameAlias = useCallback(
    (oldAlias: string, newAlias: string) => {
      const oldKey = oldAlias.trim().toLowerCase();
      const nextAlias = newAlias.trim();
      if (!oldKey || !nextAlias) return;

      Object.entries(modelAlias).forEach(([providerId, entries]) => {
        if (!entries.some((entry) => entry.alias.trim().toLowerCase() === oldKey)) return;
        saveProviderModelAlias(
          providerId,
          entries.map((entry) =>
            entry.alias.trim().toLowerCase() === oldKey ? { ...entry, alias: nextAlias } : entry
          )
        );
      });
      showNotification('Free provider model aliases updated.', 'success');
    },
    [modelAlias, saveProviderModelAlias, showNotification]
  );

  const handleDiagramDeleteAlias = useCallback(
    (aliasName: string) => {
      const aliasKey = aliasName.trim().toLowerCase();
      if (!aliasKey) return;

      Object.entries(modelAlias).forEach(([providerId, entries]) => {
        if (!entries.some((entry) => entry.alias.trim().toLowerCase() === aliasKey)) return;
        const next = entries.filter((entry) => entry.alias.trim().toLowerCase() !== aliasKey);
        if (next.length) {
          saveProviderModelAlias(providerId, next);
        } else {
          deleteProviderModelAlias(providerId);
        }
      });
      showNotification('Free provider model aliases removed.', 'success');
    },
    [deleteProviderModelAlias, modelAlias, saveProviderModelAlias, showNotification]
  );

  return (
    <SecondaryScreenShell
      ref={swipeRef}
      title="Free Provider Model Aliases"
      onBack={handleBack}
      backLabel="Free Providers"
      rightAction={
        <div className={styles.headerActions}>
          <Button variant="secondary" size="sm" onClick={handleAutoLinkDuplicates}>
            Auto-link duplicates
          </Button>
          <Button size="sm" onClick={handleSave}>
            Save
          </Button>
        </div>
      }
      contentClassName={styles.pageContent}
    >
      <Card className={styles.settingsCard}>
        <div className={styles.settingsHeader}>
          <div className={styles.settingsHeaderTitle}>Provider</div>
          <div className={styles.settingsHeaderHint}>
            Map repeated provider models to shared aliases so the same LLM family is linked once instead of duplicated per provider.
          </div>
        </div>

        <div className={styles.settingsSection}>
          <div className={styles.settingsRow}>
            <div className={styles.settingsInfo}>
              <div className={styles.settingsLabel}>Free Provider</div>
              <div className={styles.settingsDesc}>Choose the provider whose raw models should be mapped.</div>
            </div>
            <div className={styles.settingsControl}>
              <AutocompleteInput
                id="free-provider-model-alias-provider"
                placeholder="Select provider"
                value={provider}
                onChange={updateProvider}
                options={providerOptions}
                wrapperStyle={{ marginBottom: 0 }}
              />
            </div>
          </div>

          {providerOptions.length > 0 && (
            <div className={styles.tagList}>
              {providerOptions.map((option) => {
                const isActive = provider.trim().toLowerCase() === option.toLowerCase();
                return (
                  <button
                    key={option}
                    type="button"
                    className={`${styles.tag} ${isActive ? styles.tagActive : ''}`}
                    onClick={() => updateProvider(option)}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      <Card
        className={styles.settingsCard}
        title="Mapping diagram"
        extra={
          <div className={styles.headerActions}>
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
            >
              List
            </Button>
            <Button
              variant={viewMode === 'diagram' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('diagram')}
            >
              Diagram
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => diagramRef.current?.collapseAll()}
              disabled={viewMode !== 'diagram'}
              title="Collapse providers"
              aria-label="Collapse providers"
            >
              <IconChevronUp size={16} />
            </Button>
          </div>
        }
      >
        {viewMode === 'diagram' ? (
          <div className={styles.diagramWrap}>
            <ModelMappingDiagram
              ref={diagramRef}
              modelAlias={modelAlias}
              allProviderModels={allProviderModels}
              onUpdate={handleDiagramUpdate}
              onDeleteLink={handleDiagramDeleteLink}
              onToggleFork={handleDiagramToggleFork}
              onRenameAlias={handleDiagramRenameAlias}
              onDeleteAlias={handleDiagramDeleteAlias}
              onEditProvider={(providerId) => updateProvider(providerId)}
              onDeleteProvider={deleteProviderModelAlias}
            />
          </div>
        ) : Object.keys(modelAlias).length === 0 ? (
          <EmptyState title="No model aliases yet." />
        ) : (
          <div className={styles.aliasList}>
            {Object.entries(modelAlias).map(([providerId, entries]) => (
              <div key={providerId} className={styles.aliasListItem}>
                <div>
                  <strong>{providerId}</strong>
                  <div className={styles.emptyHint}>{entries.length} mapping(s)</div>
                </div>
                <div className={styles.headerActions}>
                  <Button variant="secondary" size="sm" onClick={() => updateProvider(providerId)}>
                    Edit
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => deleteProviderModelAlias(providerId)}>
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {!selectedProvider ? (
        <Card>
          <EmptyState title="Select a provider to edit model aliases." />
        </Card>
      ) : (
        <>
          <Card className={styles.settingsCard}>
            <div className={styles.mappingsHeader}>
              <div className={styles.mappingsTitle}>Model aliases</div>
              <Button variant="secondary" size="sm" onClick={addMappingEntry}>
                Add Alias
              </Button>
            </div>

            <div className={styles.mappingsBody}>
              {mappings.map((entry, index) => (
                <div key={entry.id} className={styles.mappingRow}>
                  <AutocompleteInput
                    wrapperStyle={{ flex: 1, marginBottom: 0 }}
                    placeholder="Source model"
                    value={entry.name}
                    onChange={(value) => updateMappingEntry(index, 'name', value)}
                    options={modelsList.map((model) => ({
                      value: model.name,
                      label: model.alias && model.alias !== model.name ? model.alias : undefined,
                    }))}
                  />
                  <span className={styles.mappingSeparator}>→</span>
                  <input
                    className={`input ${styles.mappingAliasInput}`}
                    placeholder="Shared alias"
                    value={entry.alias}
                    onChange={(event) => updateMappingEntry(index, 'alias', event.target.value)}
                  />
                  <div className={styles.mappingFork}>
                    <ToggleSwitch
                      label="Fork"
                      labelPosition="left"
                      checked={Boolean(entry.fork)}
                      onChange={(value) => updateMappingEntry(index, 'fork', value)}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeMappingEntry(index)}
                    disabled={mappings.length <= 1}
                    title="Delete"
                    aria-label="Delete"
                  >
                    <IconX size={14} />
                  </Button>
                </div>
              ))}
            </div>
          </Card>

          <Card className={styles.previewCard} title="Detected provider models">
            <div className={styles.previewTagList}>
              {modelsList.length === 0 ? (
                <span className={styles.emptyHint}>No models detected yet for this provider.</span>
              ) : (
                modelsList.map((model) => (
                  <span key={model.name} className={styles.previewTag}>
                    {model.alias ? `${model.name} (${model.alias})` : model.name}
                  </span>
                ))
              )}
            </div>
          </Card>
        </>
      )}
    </SecondaryScreenShell>
  );
}