import { FREE_PROVIDER_CATALOG, type FreeProviderCatalogEntry } from '@/generated/freeProviderCatalog';

export const REQUIRED_FREE_PROVIDER_NAMES = [
  'OpenRouter',
  'Google AI Studio',
  'NVIDIA NIM',
  'Mistral (La Plateforme)',
  'Mistral (Codestral)',
  'HuggingFace Inference Providers',
  'Vercel AI Gateway',
  'OpenCode Zen',
  'Cerebras',
  'Groq',
  'Cohere',
  'GitHub Models',
  'Cloudflare Workers AI',
  'Fireworks',
  'Baseten',
  'Nebius',
  'Novita',
  'AI21',
  'Upstage',
  'NLP Cloud',
  'Alibaba Cloud (International) Model Studio',
  'Modal',
  'Inference.net',
  'Hyperbolic',
  'SambaNova Cloud',
  'Scaleway Generative APIs',
] as const;

const requiredNameSet = new Set(REQUIRED_FREE_PROVIDER_NAMES);

export const FREE_PROVIDERS_CATALOG: FreeProviderCatalogEntry[] = FREE_PROVIDER_CATALOG.filter(
  (entry) => requiredNameSet.has(entry.name as (typeof REQUIRED_FREE_PROVIDER_NAMES)[number])
);

export const getFreeProviderCatalogEntry = (providerId: string) =>
  FREE_PROVIDERS_CATALOG.find((entry) => entry.id === providerId);