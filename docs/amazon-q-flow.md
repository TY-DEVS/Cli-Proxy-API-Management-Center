# Amazon Q Flow

This project integrates Amazon Q Developer through CLIProxyAPI using three backend responsibilities and one frontend contract layer.

## Backend responsibilities

1. OAuth

- Starts Amazon Builder ID / Amazon Q OAuth through the management route.
- Uses authorization code + PKCE.
- Persists `access_token`, `refresh_token`, `client_id`, `client_secret`, expiry metadata, and region/start URL.

2. Token refresh

- Before quota or model discovery calls, the backend refreshes the Amazon bearer token when it is expired or near expiry.
- If refresh succeeds, metadata is updated in-memory and persisted through the auth manager lifecycle.

3. Model discovery

- First tries dynamic discovery against Amazon Q / CodeWhisperer runtime `ListAvailableModels`.
- If AWS rejects the token or returns nothing, the backend falls back to static Amazon model definitions.

4. Quota

- The quota request contract is centralized on the frontend and sent through `api-call`.
- The backend supplies the bearer token and transport/proxy behavior.

## Frontend responsibilities

Amazon Q request variants used for quota detection are centralized in:

- `src/utils/quota/amazonContracts.ts`

This keeps the quota probing contract coherent and separate from parsing/building logic.

## Current fallback behavior

- Dynamic `ListAvailableModels` may return `403 AccessDeniedException` depending on the token/session.
- In that case, auth-file model listing still returns static Amazon models so the UI remains usable.
- Quota uses the Amazon Q / CodeWhisperer runtime contract that has been validated through `api-call`.

## Known limitations

- Dynamic Amazon model discovery is best-effort and depends on the upstream token being accepted for that specific operation.
- Static models are intentionally kept as a safety net until dynamic discovery is consistently accepted by AWS.