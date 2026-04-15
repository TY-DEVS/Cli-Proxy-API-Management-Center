import type { ModelAlias } from './provider';
import type {
  FreeProviderCatalogEntry,
  FreeProviderCategory,
  FreeProviderCompatibility,
} from '@/generated/freeProviderCatalog';

export type FreeProviderStatus = 'active' | 'inactive' | 'error';
export type FreeProviderHealth = 'ok' | 'slow' | 'down' | 'unknown';
export type FreeProviderTag = 'free' | 'trial' | 'paid' | 'limited' | 'unstable';
export type FreeProviderFilter = 'all' | 'free' | 'trial' | 'active' | 'error';
export type FreeProviderKeyStatus = 'enabled' | 'disabled' | 'error' | 'testing';

export interface FreeProviderQuotaStats {
  requests: number;
  tokens: number;
  errors: number;
  rateLimitHits: number;
  latencyMsAvg: number;
  lastCheckedAt?: string;
}

export interface FreeProviderKeyEntry {
  id: string;
  apiKey: string;
  label?: string;
  type: FreeProviderCategory;
  enabled: boolean;
  rateLimit?: number;
  monthlyQuota?: number;
  status: FreeProviderKeyStatus;
  lastError?: string;
  lastTestedAt?: string;
  quota: FreeProviderQuotaStats;
}

export interface FreeProviderStateItem {
  providerId: string;
  customName?: string;
  enabled: boolean;
  priority: number;
  status: FreeProviderStatus;
  health: FreeProviderHealth;
  tags: FreeProviderTag[];
  compatibility: FreeProviderCompatibility;
  baseUrl?: string;
  models: ModelAlias[];
  keys: FreeProviderKeyEntry[];
  lastSyncedAt?: string;
  lastError?: string;
  quota: FreeProviderQuotaStats;
}

export interface FreeProviderResolvedItem extends FreeProviderCatalogEntry {
  state: FreeProviderStateItem;
}

export interface FreeProviderTestResult {
  ok: boolean;
  latencyMs: number;
  message: string;
  responseText?: string;
  detectedModels?: ModelAlias[];
}

export interface FreeProviderRoutingRecommendation {
  providerId: string;
  reason: string;
  score: number;
}