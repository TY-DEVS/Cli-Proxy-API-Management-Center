import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  FreeProviderFilter,
  FreeProviderKeyEntry,
  FreeProviderModelAlias,
  FreeProviderResolvedItem,
  FreeProviderStateItem,
} from '@/types/freeProvider';
import { STORAGE_KEY_FREE_PROVIDERS } from '@/utils/constants';
import { obfuscatedStorage } from '@/services/storage/secureStorage';
import { FREE_PROVIDERS_CATALOG } from '@/features/freeProviders/catalog';
import {
  createDefaultFreeProviderState,
  createFreeProviderKey,
  mergeCatalogWithState,
  mergeDetectedModels,
  normalizeFreeProviderModelAliasEntries,
} from '@/features/freeProviders/helpers';
import type { ModelAlias } from '@/types';

interface FreeProvidersStoreState {
  filter: FreeProviderFilter;
  autoFreeMode: boolean;
  providerStates: Record<string, FreeProviderStateItem>;
  modelAlias: FreeProviderModelAlias;
  setFilter: (filter: FreeProviderFilter) => void;
  setAutoFreeMode: (enabled: boolean) => void;
  syncCatalog: () => void;
  setProviderEnabled: (providerId: string, enabled: boolean) => void;
  setProviderPriority: (providerId: string, priority: number) => void;
  setProviderStatus: (providerId: string, status: FreeProviderStateItem['status'], lastError?: string) => void;
  upsertProviderKey: (providerId: string, key: FreeProviderKeyEntry) => void;
  deleteProviderKey: (providerId: string, keyId: string) => void;
  setProviderKeyEnabled: (providerId: string, keyId: string, enabled: boolean) => void;
  updateProviderModels: (providerId: string, models: ModelAlias[]) => void;
  updateProviderQuota: (providerId: string, quota: Partial<FreeProviderStateItem['quota']>) => void;
  updateProviderKeyQuota: (
    providerId: string,
    keyId: string,
    quota: Partial<FreeProviderKeyEntry['quota']>
  ) => void;
  saveProviderModelAlias: (providerId: string, entries: FreeProviderModelAlias[string]) => void;
  deleteProviderModelAlias: (providerId: string) => void;
  getResolvedProviders: () => FreeProviderResolvedItem[];
  ensureProviderState: (providerId: string) => FreeProviderStateItem;
}

const buildInitialStates = () =>
  Object.fromEntries(
    FREE_PROVIDERS_CATALOG.map((entry) => [entry.id, createDefaultFreeProviderState(entry)])
  ) as Record<string, FreeProviderStateItem>;

export const useFreeProvidersStore = create<FreeProvidersStoreState>()(
  persist(
    (set, get) => ({
      filter: 'all',
      autoFreeMode: false,
      providerStates: buildInitialStates(),
      modelAlias: {},

      setFilter: (filter) => set({ filter }),

      setAutoFreeMode: (enabled) => set({ autoFreeMode: enabled }),

      syncCatalog: () => {
        set((state) => {
          const nextStates = { ...state.providerStates };
          FREE_PROVIDERS_CATALOG.forEach((entry) => {
            nextStates[entry.id] = createDefaultFreeProviderState(entry, nextStates[entry.id]);
          });
          return { providerStates: nextStates };
        });
      },

      ensureProviderState: (providerId) => {
        const existing = get().providerStates[providerId];
        if (existing) return existing;
        const entry = FREE_PROVIDERS_CATALOG.find((item) => item.id === providerId);
        if (!entry) {
          throw new Error(`Unknown free provider: ${providerId}`);
        }
        const created = createDefaultFreeProviderState(entry);
        set((state) => ({
          providerStates: {
            ...state.providerStates,
            [providerId]: created,
          },
        }));
        return created;
      },

      setProviderEnabled: (providerId, enabled) => {
        const current = get().ensureProviderState(providerId);
        set((state) => ({
          providerStates: {
            ...state.providerStates,
            [providerId]: {
              ...current,
              enabled,
              status: enabled ? 'active' : 'inactive',
              lastError: enabled ? undefined : current.lastError,
            },
          },
        }));
      },

      setProviderPriority: (providerId, priority) => {
        const current = get().ensureProviderState(providerId);
        set((state) => ({
          providerStates: {
            ...state.providerStates,
            [providerId]: { ...current, priority },
          },
        }));
      },

      setProviderStatus: (providerId, status, lastError) => {
        const current = get().ensureProviderState(providerId);
        set((state) => ({
          providerStates: {
            ...state.providerStates,
            [providerId]: { ...current, status, lastError },
          },
        }));
      },

      upsertProviderKey: (providerId, key) => {
        const current = get().ensureProviderState(providerId);
        const normalizedKey = key.id ? key : createFreeProviderKey(current.keys[0]?.type ?? 'free', key);
        const nextKeys = current.keys.some((item) => item.id === normalizedKey.id)
          ? current.keys.map((item) => (item.id === normalizedKey.id ? normalizedKey : item))
          : [...current.keys, normalizedKey];

        set((state) => ({
          providerStates: {
            ...state.providerStates,
            [providerId]: {
              ...current,
              keys: nextKeys,
            },
          },
        }));
      },

      deleteProviderKey: (providerId, keyId) => {
        const current = get().ensureProviderState(providerId);
        set((state) => ({
          providerStates: {
            ...state.providerStates,
            [providerId]: {
              ...current,
              keys: current.keys.filter((key) => key.id !== keyId),
            },
          },
        }));
      },

      setProviderKeyEnabled: (providerId, keyId, enabled) => {
        const current = get().ensureProviderState(providerId);
        set((state) => ({
          providerStates: {
            ...state.providerStates,
            [providerId]: {
              ...current,
              keys: current.keys.map((key) =>
                key.id === keyId
                  ? { ...key, enabled, status: enabled ? 'enabled' : 'disabled' }
                  : key
              ),
            },
          },
        }));
      },

      updateProviderModels: (providerId, models) => {
        const current = get().ensureProviderState(providerId);
        set((state) => ({
          providerStates: {
            ...state.providerStates,
            [providerId]: {
              ...current,
              models: mergeDetectedModels(current.models, models),
            },
          },
        }));
      },

      updateProviderQuota: (providerId, quota) => {
        const current = get().ensureProviderState(providerId);
        set((state) => ({
          providerStates: {
            ...state.providerStates,
            [providerId]: {
              ...current,
              quota: { ...current.quota, ...quota },
            },
          },
        }));
      },

      updateProviderKeyQuota: (providerId, keyId, quota) => {
        const current = get().ensureProviderState(providerId);
        set((state) => ({
          providerStates: {
            ...state.providerStates,
            [providerId]: {
              ...current,
              keys: current.keys.map((key) =>
                key.id === keyId
                  ? { ...key, quota: { ...key.quota, ...quota } }
                  : key
              ),
            },
          },
        }));
      },

      saveProviderModelAlias: (providerId, entries) => {
        const normalizedProviderId = String(providerId ?? '').trim();
        if (!normalizedProviderId) return;
        const normalizedEntries = normalizeFreeProviderModelAliasEntries(entries);

        set((state) => ({
          modelAlias: {
            ...state.modelAlias,
            [normalizedProviderId]: normalizedEntries,
          },
        }));
      },

      deleteProviderModelAlias: (providerId) => {
        const normalizedProviderId = String(providerId ?? '').trim();
        if (!normalizedProviderId) return;

        set((state) => {
          const next = { ...state.modelAlias };
          delete next[normalizedProviderId];
          return { modelAlias: next };
        });
      },

      getResolvedProviders: () => mergeCatalogWithState(FREE_PROVIDERS_CATALOG, get().providerStates),
    }),
    {
      name: STORAGE_KEY_FREE_PROVIDERS,
      storage: createJSONStorage(() => ({
        getItem: (name) => {
          const data = obfuscatedStorage.getItem(name);
          return data ? JSON.stringify(data) : null;
        },
        setItem: (name, value) => {
          obfuscatedStorage.setItem(name, JSON.parse(value));
        },
        removeItem: (name) => {
          obfuscatedStorage.removeItem(name);
        },
      })),
      partialize: (state) => ({
        autoFreeMode: state.autoFreeMode,
        providerStates: state.providerStates,
        modelAlias: state.modelAlias,
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<FreeProvidersStoreState>;
        const mergedStates = { ...buildInitialStates(), ...(persisted.providerStates ?? {}) };
        return {
          ...currentState,
          ...persisted,
          providerStates: mergedStates,
          modelAlias: persisted.modelAlias ?? {},
        };
      },
    }
  )
);