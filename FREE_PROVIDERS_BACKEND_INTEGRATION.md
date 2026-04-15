# Free Providers Alias Runtime Integration

This workspace contains the management UI only. The CLIProxyAPI runtime/backend is not present here, so alias execution cannot be implemented directly in this repository.

## Goal

Apply Free Provider model aliases at runtime, not only in the panel/export layer.

## Required backend module

Suggested module path in CLIProxyAPI:

- `/internal/free_providers/registry`
- `/internal/free_providers/alias_resolver`
- `/internal/free_providers/router`
- `/internal/free_providers/quota_tracker`
- `/internal/free_providers/key_manager`

## Runtime responsibilities

1. Load persisted `free_providers` config and `model_alias` mappings.
2. When a client calls an alias model like `oss-default`, resolve it into provider-specific source models.
3. Select an eligible provider/key using current routing policy.
4. Rewrite outgoing upstream request model name from alias to provider-native model.
5. Preserve original client-facing model alias in normalized response metadata where appropriate.
6. Aggregate metrics by alias and by source model.

## Suggested config shape

```yaml
free-providers:
  auto-free-mode: true
  providers:
    - id: openrouter
      enabled: true
      priority: 1
      base-url: https://openrouter.ai/api/v1
      keys:
        - label: primary
          api-key: ${OPENROUTER_API_KEY}
          enabled: true
  model-alias:
    openrouter:
      - name: gpt-oss-20b
        alias: oss-default
        fork: true
    groq:
      - name: openai/gpt-oss-20b
        alias: oss-default
        fork: true
```

## Resolution algorithm

Input:

- requested model alias: `oss-default`

Steps:

1. Find all provider mappings whose alias equals `oss-default`.
2. Expand to candidate upstream tuples:
   - `(provider=openrouter, model=gpt-oss-20b)`
   - `(provider=groq, model=openai/gpt-oss-20b)`
3. Filter by provider enabled, key enabled, health, quota, recent failures.
4. Choose best candidate via routing strategy:
   - free first
   - lower error rate
   - lower latency
   - available quota
5. Rewrite request model to native upstream model.
6. Normalize response back to OpenAI format.
7. Record metrics under both alias and source model.

## Required API additions

To support the panel cleanly, the backend should expose:

- `GET /v0/management/free-providers`
- `PUT /v0/management/free-providers`
- `PATCH /v0/management/free-providers`
- `GET /v0/management/free-providers/model-alias`
- `PUT /v0/management/free-providers/model-alias`
- `DELETE /v0/management/free-providers/model-alias?provider=<id>`

## Metrics requirements

Track at least:

- alias requested by client
- source provider selected
- source model used
- key id/label used
- latency
- token usage
- request success/failure
- rate-limit hits
- fallback count

## Compatibility notes

- OpenAI-compatible providers can resolve alias just before upstream dispatch.
- Non-OpenAI providers need provider-specific adapters after alias resolution.
- Usage pages should be able to query both alias-grouped and raw source metrics.

## Implementation order

1. Add config persistence for free providers and alias mappings.
2. Add alias resolver in request pipeline.
3. Add runtime routing over alias-expanded candidates.
4. Add metrics tagged by alias and source model.
5. Expose management endpoints for UI sync.
