# Amazon backend integration design for CLIProxyAPI-main

## Goal

Add a pragmatic V1 `amazon` provider to `CLIProxyAPI-main` that supports:

- Amazon/AWS login via Authorization Code + PKCE
- Amazon/AWS login via Device Authorization flow
- persistent normalized Amazon session storage
- Bedrock-backed model discovery
- Bedrock-backed chat/inference test route
- management endpoints compatible with the existing Management Center Amazon UI surface

This V1 explicitly prioritizes end-to-end usability over exact Amazon Q runtime parity.

## Non-goals for V1

The following are out of scope for the first implementation:

- exact behavioral parity with the Amazon Q VS Code extension
- full MCP/tool-use compatibility
- full streaming support parity
- exact Amazon subscription and quota replication
- advanced governance or plan-tier feature gating
- reuse of AWS local SSO cache as the canonical backend persistence source

## Primary strategy

Use a hybrid backend strategy:

1. implement Amazon/AWS SSO/OIDC authentication flows in CLIProxyAPI-main
2. normalize both auth flows into one persisted Amazon session format
3. use that session to access Bedrock for model listing and inference
4. expose minimal management and CLI entrypoints that fit current backend patterns

This gives the best V1 balance for CLIProxyAPI-main:

- fast delivery
- reuse of existing provider/auth patterns
- lower operational risk than reproducing internal Amazon Q-only behaviors
- better compatibility with existing provider abstractions

## Existing backend anchor points in CLIProxyAPI-main

The design is anchored to these confirmed integration points:

- `cmd/server/main.go`
- `internal/api/server.go`
- `internal/api/handlers/management/*`
- `internal/auth/*`
- `internal/runtime/*`
- `internal/registry/*`
- `config.example.yaml`
- token-store registration through `sdk/auth.RegisterTokenStore(...)`

The backend already follows a provider-oriented design with existing auth/provider implementations for Gemini, Codex, Claude, Kimi, Vertex, and others. Amazon should follow those existing patterns instead of introducing a parallel architecture.

## Target backend flow

### Unified flow

1. CLI or management API starts Amazon auth
2. one of two flows is used:
   - PKCE/browser authorization code flow
   - device authorization flow
3. backend exchanges the flow result for tokens
4. backend persists a normalized Amazon session
5. runtime loads the session and creates a Bedrock-backed provider client
6. backend lists models and serves chat/inference requests

### Key architectural rule

Both auth flows must converge into a single backend session shape. The rest of the system must not care whether the session came from PKCE or device flow.

## File-by-file implementation specification

---

## 1. `cmd/server/main.go`

### Purpose
Add Amazon-specific CLI flags and route them into the command layer.

### Changes
Add new flags near the existing login flags:

- `-amazon-login`
- `-amazon-device-login`
- optionally `-amazon-region`
- optionally `-amazon-start-url` if not fully config-driven

### Dispatch behavior
In the main command dispatch block, add:

- `cmd.DoAmazonLogin(cfg, options)`
- `cmd.DoAmazonDeviceLogin(cfg, options)`

### Notes
This should mirror the style already used for:

- `DoLogin`
- `DoCodexLogin`
- `DoClaudeLogin`
- `DoKimiLogin`
- `DoVertexImport`

The CLI path and management API path should both rely on the same lower-level auth implementation.

---

## 2. New package: `internal/auth/amazon`

### Purpose
Own all Amazon/AWS auth logic and session normalization.

### New files

#### `internal/auth/amazon/session.go`
Defines the canonical session format used internally and for persistence.

Recommended core shape:

```go
type AmazonSession struct {
    Provider     string
    AccessToken  string
    RefreshToken string
    ExpiresAt    time.Time
    Region       string
    StartURL     string
    AccountID    string
    UserID       string
    Flow         string
}
```

### Responsibilities
- define session state
- define flow status values
- provide helper methods like `IsExpired()` and `NeedsRefresh()`

#### `internal/auth/amazon/oauth.go`
Implements browser-based Authorization Code + PKCE.

### Responsibilities
- generate verifier/challenge
- construct authorize URL
- exchange authorization code for tokens
- refresh tokens when needed
- normalize into `AmazonSession`

#### `internal/auth/amazon/device_flow.go`
Implements the device code flow.

### Responsibilities
- start device authorization
- return verification URL, user code, device code, expiry, polling interval
- poll token endpoint until approved/error/expired
- normalize into `AmazonSession`

#### `internal/auth/amazon/storage.go`
Handles persistence and loading of Amazon session data through the existing token store abstraction.

### Responsibilities
- encode/decode persisted session content
- generate provider-specific auth filenames/paths
- keep storage compatible with file/git/object/postgres token backends

#### `internal/auth/amazon/models.go`
Owns Bedrock model discovery logic.

### Responsibilities
- query available Bedrock models
- filter models that should be exposed through CLIProxyAPI
- map Bedrock model metadata into the backend’s registry/runtime model format

### Architectural rules
- no HTTP handler code here
- no gin dependency here
- no direct UI-specific response shape here
- keep pure service/auth logic only

---

## 3. Existing provider pattern references

### Files/packages to imitate structurally
Use these as implementation references while building Amazon:

- `internal/auth/vertex/*`
- `internal/auth/gemini/*`
- `internal/auth/codex/*`
- `internal/auth/claude/*`
- `internal/auth/kimi/*`

### Why
Amazon should fit the backend’s current auth/provider conventions:

- provider-specific package under `internal/auth`
- provider persistence through the registered token store
- CLI entrypoints in `cmd`
- management handlers under `internal/api/handlers/management`
- runtime/provider registration under runtime/registry packages

---

## 4. `internal/api/server.go`

### Purpose
Register new management routes for Amazon.

### Changes
Attach these routes under the management API namespace:

- `POST /v0/management/oauth/amazon/start`
- `POST /v0/management/oauth/amazon/device/start`
- `POST /v0/management/oauth/amazon/callback`
- `GET /v0/management/oauth/amazon/status`
- `GET /v0/management/amazon/models`
- `POST /v0/management/amazon/chat/test`

### Rules
- only route registration belongs here
- no Amazon auth or Bedrock business logic should live here
- reuse the existing callback success HTML pattern where appropriate

---

## 5. New handler file: `internal/api/handlers/management/amazon.go`

### Purpose
Expose the Amazon management surface to the web UI.

### New handler methods
Recommended methods:

- `StartAmazonOAuth`
- `StartAmazonDeviceOAuth`
- `AmazonOAuthCallback`
- `GetAmazonOAuthStatus`
- `ListAmazonModels`
- `TestAmazonChat`

### Responsibilities
- parse management requests
- call `internal/auth/amazon`
- normalize JSON responses to the existing management API conventions
- return appropriate success/error payloads to the frontend

### Rules
- no token exchange internals in handler methods
- no Bedrock SDK logic in handler methods
- all provider-specific business logic should be delegated to auth/runtime packages

---

## 6. New command file(s): `cmd/amazon.go`

### Purpose
Provide CLI login entrypoints for Amazon.

### Functions
- `DoAmazonLogin(cfg, options)`
- `DoAmazonDeviceLogin(cfg, options)`

### Responsibilities
- invoke auth flow services
- print URLs/codes/status to terminal
- open browser when allowed
- persist the resulting session via shared backend logic

### Rules
- no duplicated auth exchange logic
- command functions should call the same lower-level auth services as management handlers

---

## 7. Runtime integration: `internal/runtime/*`

### Purpose
Allow Amazon to act as an executable provider in the backend runtime.

### New file recommendation
Depending on the existing runtime structure, add one of:

- `internal/runtime/executor/amazon.go`
- `internal/runtime/amazon_executor.go`

### V1 responsibilities
- load the persisted Amazon session
- create a Bedrock-backed client from normalized session state
- list models
- execute a simple chat/inference request

### V1 scope
Start with non-streaming support first.

### Rules
- keep Amazon runtime logic isolated from handlers
- return normalized provider/runtime results in the style already used by existing providers

---

## 8. Registry integration: `internal/registry/*`

### Purpose
Expose Amazon-backed models through the backend’s model registry.

### Changes
- register Amazon as a provider source
- load Bedrock models using the active Amazon session
- translate them into the registry’s model representation

### Naming recommendation
Prefer a stable provider-visible naming strategy, for example:

- `amazon/<model-id>`

unless the current registry already has a better existing provider-aware naming pattern.

### Rules
- do not break existing model update flows
- isolate provider-specific logic behind Amazon-specific registry loading code

---

## 9. Config layer updates

### Files likely affected
- config structs under `internal/config/*`
- access/config mapping under `internal/access/config_access/*`
- `config.example.yaml`

### New config fields
Recommended fields:

- `AmazonEnabled`
- `AmazonRegion`
- `AmazonStartURL`
- `AmazonOIDCBaseURL` if needed
- `AmazonUseBedrock`

### `config.example.yaml`
Add a documented Amazon section, for example:

```yaml
amazon:
  enabled: true
  region: us-east-1
  start_url: ""
  use_bedrock: true
```

### Rules
- sensible defaults
- no required secrets hardcoded into config example
- backend must still work with Amazon disabled

---

## 10. Auth file persistence under `auths/`

### Purpose
Persist Amazon sessions using the backend’s canonical store, not external AWS cache as the source of truth.

### Recommendation
Store Amazon session data in provider-specific auth files under a stable path such as:

- `auths/amazon/session.json`

or another path that matches the project’s current auth storage conventions.

### Persisted fields
Store at minimum:

- access token
- refresh token
- expiration
- provider metadata
- region
- start URL
- flow source (`pkce` or `device`)

### Important rule
The backend may read from AWS-compatible concepts, but its canonical runtime source must be the backend-managed session file/store.

---

## 11. Token store compatibility

### Purpose
Keep Amazon compatible with all existing persistence backends.

### Backends already registered centrally
The new provider must work with:

- file token store
- git token store
- object token store
- postgres token store

### Requirement
Do not introduce a separate Amazon-specific persistence path that bypasses `sdk/auth.RegisterTokenStore(...)`.

---

## 12. Callback handling strategy

### Existing anchor
`internal/api/server.go` already contains an OAuth callback success HTML pattern.

### V1 recommendation
Reuse that callback flow pattern for Amazon:

1. browser returns to backend callback route
2. backend exchanges code for tokens
3. backend persists session
4. backend returns success HTML/JSON

### Rule
Do not build a second unrelated callback UX if the existing server pattern is sufficient.

---

## 13. Usage and quota handling

### V1 scope
Do not attempt full Amazon plan/quota reproduction.

### Required V1 behavior
Normalize and propagate at least:

- throttling errors
- quota exceeded errors
- token limit exceeded errors
- auth/session expired errors

### Likely file area
- `internal/usage/*` only if required by existing error/reporting flow
- otherwise keep normalization local to Amazon runtime/provider error handling

### Goal
Even if V1 does not calculate quotas, it must fail cleanly and predictably.

---

## 14. Tests

### New test files recommended
- `test/amazon_oauth_test.go`
- `test/amazon_device_flow_test.go`
- `test/amazon_models_test.go`
- `test/amazon_chat_test.go`

### Minimum scenarios
- PKCE flow start produces valid state/challenge/URL
- callback exchanges code and persists a session
- device flow start returns correct code/URL metadata
- device polling transitions correctly through pending/success/error
- refresh token path works
- Bedrock model list maps into backend model structures correctly
- chat test executes correctly with mocked Bedrock responses
- throttling/quota/auth errors normalize correctly

---

## 15. Build sequence

### Recommended implementation order
1. add config fields
2. add Amazon session model and persistence
3. implement PKCE auth flow
4. implement device flow
5. add CLI command entrypoints
6. add management handlers and routes
7. add Bedrock model listing
8. add Bedrock chat test route
9. wire Amazon into runtime/registry
10. add tests and normalize errors

This order minimizes risk and allows incremental validation.

## V1 endpoint contract summary

### OAuth/auth endpoints
- `POST /v0/management/oauth/amazon/start`
- `POST /v0/management/oauth/amazon/device/start`
- `POST /v0/management/oauth/amazon/callback`
- `GET /v0/management/oauth/amazon/status`

### Provider endpoints
- `GET /v0/management/amazon/models`
- `POST /v0/management/amazon/chat/test`

## V1 deliverable definition

V1 is successful when all of the following are true:

- Amazon login works through both PKCE and device flow
- backend persists and reloads a normalized Amazon session
- management UI can start auth and observe status
- backend can list Bedrock models using the Amazon session
- backend can perform at least one non-streaming chat/inference test request
- errors are normalized clearly enough for frontend and CLI users

## Deferred V2 work

- exact Amazon Q runtime parity
- tool use and MCP orchestration
- streaming support parity
- richer model capability metadata
- subscription-aware gating
- deeper usage/quota reporting
- tighter compatibility with Amazon Q-specific UX behaviors

## Recommendation summary

Implement Amazon as a first-class provider following existing CLIProxyAPI-main backend patterns:

- provider-specific auth package
- shared token-store persistence
- management handler file
- runtime/provider integration
- Bedrock-backed execution

Do not model V1 as a direct clone of the Amazon Q extension runtime. Model it as a pragmatic Amazon provider for CLIProxyAPI-main.
