import fs from 'node:fs';
import path from 'node:path';

const workspaceRoot = process.cwd();
const sourceRoot = path.join(
  workspaceRoot,
  'free-llm-api-resources-main',
  'free-llm-api-resources-main'
);
const readmePath = path.join(sourceRoot, 'README.md');
const pullScriptPath = path.join(sourceRoot, 'src', 'pull_available_models.py');
const outputPath = path.join(workspaceRoot, 'src', 'generated', 'freeProviderCatalog.ts');

const OPENAI_BASE_URLS = {
  openrouter: 'https://openrouter.ai/api/v1',
  groq: 'https://api.groq.com/openai/v1',
  kluster: 'https://api.kluster.ai/v1',
  hyperbolic: 'https://api.hyperbolic.xyz/v1',
  lambda: 'https://api.lambdalabs.com/v1',
  scaleway: 'https://api.scaleway.ai/v1',
  cohere: 'https://api.cohere.com/v1'
};

const OPENAI_HEADER_TEMPLATES = {
  openrouter: {
    'HTTP-Referer': 'https://example.com',
    'X-Title': 'CLI Proxy API Management Center'
  }
};

const TITLE_ID_OVERRIDES = {
  'Mistral (La Plateforme)': 'mistral-la-plateforme',
  'Mistral (Codestral)': 'mistral-codestral',
  'Scaleway Generative APIs': 'scaleway-generative-apis',
  'Google AI Studio': 'google-ai-studio',
  'Cloudflare Workers AI': 'cloudflare-workers-ai',
  'GitHub Models': 'github-models',
  'HuggingFace Inference Providers': 'huggingface-inference-providers',
  'Vercel AI Gateway': 'vercel-ai-gateway',
  'OpenCode Zen': 'opencode-zen',
  'SambaNova Cloud': 'sambanova-cloud'
};

const providerSectionPattern = /^### \[(.+?)\]\((.+?)\)$/gm;

const readme = fs.readFileSync(readmePath, 'utf8');
const pullScript = fs.readFileSync(pullScriptPath, 'utf8');

const matches = [...readme.matchAll(providerSectionPattern)];
const sections = matches.map((match, index) => {
  const title = match[1].trim();
  const url = match[2].trim();
  const start = match.index + match[0].length;
  const end = index + 1 < matches.length ? matches[index + 1].index : readme.length;
  const body = readme.slice(start, end).trim();
  return { title, url, body };
});

const titleToKey = (title) =>
  TITLE_ID_OVERRIDES[title] ||
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const classifyCompatibility = (title, body, openaiBaseUrl) => {
  const text = `${title}\n${body}`.toLowerCase();
  if (openaiBaseUrl) {
    return 'openai';
  }
  if (
    text.includes('/openai/v1') ||
    text.includes('/api/v1/models') ||
    text.includes('/v1/models') ||
    text.includes('openai compatible') ||
    text.includes('compatible openai')
  ) {
    return 'openai';
  }
  if (text.includes('google ai studio') || text.includes('gemini')) {
    return 'gemini';
  }
  if (text.includes('cloudflare workers ai')) {
    return 'custom';
  }
  if (text.includes('github models')) {
    return 'custom';
  }
  if (text.includes('huggingface inference providers')) {
    return 'custom';
  }
  if (text.includes('vercel ai gateway')) {
    return 'openai';
  }
  return 'unknown';
};

const extractLimits = (body) => {
  const limitsMatch = body.match(/\*\*Limits:?\*\*\s*([\s\S]*?)(?:\n\n|$)/i);
  if (!limitsMatch) return undefined;
  return limitsMatch[1]
    .replace(/<br>/g, ', ')
    .replace(/\[(.*?)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
};

const extractModels = (body) => {
  const bulletMatches = [...body.matchAll(/^- (.+)$/gm)].map((match) =>
    match[1].replace(/\[(.*?)\]\([^)]*\)/g, '$1').trim()
  );
  if (bulletMatches.length) {
    return bulletMatches;
  }

  const tableRowMatches = [...body.matchAll(/<tr><td>(.*?)<\/td>/g)].map((match) =>
    match[1].replace(/<[^>]+>/g, '').trim()
  );
  return tableRowMatches;
};

const findScriptHint = (providerKey) => {
  const pattern = new RegExp(`def\\s+fetch_${providerKey.replace(/-/g, '_')}?_?models`, 'i');
  return pattern.test(pullScript);
};

const providers = sections
  .map(({ title, url, body }) => {
    const key = titleToKey(title);
    const openaiBaseUrl = OPENAI_BASE_URLS[key];
    const compatibility = classifyCompatibility(title, body, openaiBaseUrl);
    const limits = extractLimits(body);
    const models = extractModels(body);
    const category = readme.indexOf('## Free Providers') < readme.indexOf(`### [${title}]`) && readme.indexOf(`### [${title}]`) < readme.indexOf('## Providers with trial credits')
      ? 'free'
      : 'trial';
    const detectionHints = [];
    if (openaiBaseUrl) detectionHints.push(openaiBaseUrl);
    if (findScriptHint(key)) detectionHints.push(`script:${key}`);

    return {
      id: key,
      name: title,
      websiteUrl: url,
      category,
      compatibility,
      openaiBaseUrl,
      defaultHeaders: OPENAI_HEADER_TEMPLATES[key] ?? undefined,
      limits,
      models,
      detectionHints,
      importStrategy:
        openaiBaseUrl || compatibility === 'openai'
          ? 'openai-compatibility'
          : compatibility === 'gemini'
            ? 'native-gemini'
            : 'manual-adapter'
    };
  })
  .filter((provider) => provider.name !== 'Google Cloud Vertex AI');

const output = `/* eslint-disable */\n// Generated by scripts/generate-free-provider-catalog.mjs\n\nexport type FreeProviderCompatibility = 'openai' | 'gemini' | 'custom' | 'unknown';\nexport type FreeProviderCategory = 'free' | 'trial';\nexport type FreeProviderImportStrategy = 'openai-compatibility' | 'native-gemini' | 'manual-adapter';\n\nexport interface FreeProviderCatalogEntry {\n  id: string;\n  name: string;\n  websiteUrl: string;\n  category: FreeProviderCategory;\n  compatibility: FreeProviderCompatibility;\n  openaiBaseUrl?: string;\n  defaultHeaders?: Record<string, string>;\n  limits?: string;\n  models: string[];\n  detectionHints: string[];\n  importStrategy: FreeProviderImportStrategy;\n}\n\nexport const FREE_PROVIDER_CATALOG: FreeProviderCatalogEntry[] = ${JSON.stringify(providers, null, 2)};\n`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, output);
console.log(`Generated ${path.relative(workspaceRoot, outputPath)} with ${providers.length} providers.`);
