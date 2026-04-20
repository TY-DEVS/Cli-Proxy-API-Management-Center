# Amazon Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the existing Amazon support in `CLIProxyAPI-main` so the backend supports Amazon device login, Amazon PKCE login, normalized auth persistence, Bedrock model listing, and a basic Bedrock chat test path for management clients.

**Architecture:** This plan extends the existing partial Amazon support rather than replacing it. Both auth flows converge into the existing backend auth record model, management endpoints orchestrate auth and inspection flows, and runtime/provider integration uses Bedrock-backed execution following the project’s existing executor and registry patterns.

**Tech Stack:** Go, Gin, AWS SSO OIDC over HTTP, Bedrock-compatible model discovery/execution, existing CLIProxyAPI auth/token store abstractions, existing management API handlers, existing runtime executors.

---

## File structure map

### Existing files to modify
- Modify: `../CLIProxyAPI-main/cmd/server/main.go` — add Amazon CLI flags and command dispatch.
- Modify: `../CLIProxyAPI-main/internal/api/server.go` — register Amazon management routes if not already present or incomplete.
- Modify: `../CLIProxyAPI-main/internal/api/handlers/management/auth_files.go` — keep/reshape existing Amazon device flow entrypoint and shared helpers.
- Modify: `../CLIProxyAPI-main/internal/api/handlers/management/oauth_sessions.go` — extend session/provider handling if needed for PKCE and Amazon callback state.
- Modify: `../CLIProxyAPI-main/internal/api/handlers/management/oauth_callback.go` — ensure Amazon callback finalization is supported by the generic callback path or split into a dedicated handler.
- Modify: `../CLIProxyAPI-main/internal/api/handlers/management/handler.go` — wire any new service dependencies or helper accessors.
- Modify: `../CLIProxyAPI-main/internal/auth/amazon/auth.go` — extend existing Amazon auth service with missing flow support.
- Modify: `../CLIProxyAPI-main/internal/auth/amazon/token.go` — ensure normalized Amazon token persistence matches the token-store-backed auth record model.
- Modify: `../CLIProxyAPI-main/internal/auth/amazon/types.go` — add missing request/response/session structs.
- Modify: `../CLIProxyAPI-main/internal/registry/model_registry.go` — expose Amazon-backed models through the existing registry flow.
- Modify: `../CLIProxyAPI-main/internal/registry/model_definitions.go` — add Amazon mapping if static metadata glue is needed.
- Modify: `../CLIProxyAPI-main/config.example.yaml` — add documented Amazon config fields.

### New files to create
- Create: `../CLIProxyAPI-main/cmd/amazon.go` — CLI helpers for Amazon login flows.
- Create: `../CLIProxyAPI-main/internal/auth/amazon/pkce.go` — PKCE helper generation and verifier/challenge utilities.
- Create: `../CLIProxyAPI-main/internal/auth/amazon/oauth_server.go` — browser callback helper flow for local CLI login if needed.
- Create: `../CLIProxyAPI-main/internal/api/handlers/management/amazon_models.go` — management route for listing Amazon/Bedrock models.
- Create: `../CLIProxyAPI-main/internal/api/handlers/management/amazon_chat.go` — management route for basic Amazon chat test.
- Create: `../CLIProxyAPI-main/internal/runtime/executor/amazon_executor.go` — basic Bedrock-backed executor using persisted Amazon auth.
- Create: `../CLIProxyAPI-main/internal/runtime/executor/amazon_executor_test.go` — executor tests with mocked upstream responses.
- Create: `../CLIProxyAPI-main/internal/auth/amazon/auth_test.go` — auth flow unit tests.
- Create: `../CLIProxyAPI-main/internal/api/handlers/management/amazon_management_test.go` — management handler tests.

### Existing files to inspect while implementing
- Inspect: `../CLIProxyAPI-main/internal/auth/claude/oauth_server.go`
- Inspect: `../CLIProxyAPI-main/internal/auth/claude/pkce.go`
- Inspect: `../CLIProxyAPI-main/internal/auth/codex/oauth_server.go`
- Inspect: `../CLIProxyAPI-main/internal/runtime/executor/claude_executor.go`
- Inspect: `../CLIProxyAPI-main/internal/runtime/executor/gemini_executor.go`
- Inspect: `../CLIProxyAPI-main/internal/api/handlers/management/model_definitions.go`
- Inspect: `../CLIProxyAPI-main/internal/api/handlers/management/quota.go`

---

### Task 1: Lock down the current Amazon auth surface with failing tests

**Files:**
- Test: `../CLIProxyAPI-main/internal/auth/amazon/auth_test.go`
- Inspect: `../CLIProxyAPI-main/internal/auth/amazon/auth.go`
- Inspect: `../CLIProxyAPI-main/internal/auth/amazon/types.go`

- [ ] **Step 1: Write the failing auth tests**

```go
package amazon

import (
    "context"
    "net/http"
    "net/http/httptest"
    "testing"

    "github.com/router-for-me/CLIProxyAPI/v6/internal/config"
)

func TestRegisterClientUsesConfiguredStartURLAndRegion(t *testing.T) {
    var seenPath string
    var seenBody string
    srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        seenPath = r.URL.Path
        body := make([]byte, r.ContentLength)
        _, _ = r.Body.Read(body)
        seenBody = string(body)
        w.Header().Set("Content-Type", "application/json")
        _, _ = w.Write([]byte(`{"clientId":"cid","clientSecret":"sec","clientSecretExpiresAt":1893456000}`))
    }))
    defer srv.Close()

    cfg := &config.Config{}
    auth := NewAuth(cfg, "us-east-1", "https://view.awsapps.com/start")
    auth.httpClient = srv.Client()
    auth.region = "unit-test"

    original := auth.oidcBaseURL
    _ = original

    if _, err := auth.RegisterClient(context.Background(), "CLIProxyAPI-test"); err != nil {
        t.Fatalf("RegisterClient() error = %v", err)
    }

    if seenPath != "/client/register" {
        t.Fatalf("expected /client/register, got %q", seenPath)
    }
    if seenBody == "" {
        t.Fatal("expected request body to be sent")
    }
}

func TestExchangeDeviceCodeSetsExpiryAndConnectionType(t *testing.T) {
    srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Content-Type", "application/json")
        _, _ = w.Write([]byte(`{"access_token":"at","refresh_token":"rt","expires_in":3600}`))
    }))
    defer srv.Close()

    cfg := &config.Config{}
    auth := NewAuth(cfg, "us-east-1", "https://view.awsapps.com/start")
    auth.httpClient = srv.Client()

    bundle, err := auth.ExchangeDeviceCode(context.Background(), "cid", "sec", "dc")
    if err != nil {
        t.Fatalf("ExchangeDeviceCode() error = %v", err)
    }
    if bundle.TokenData.AccessToken != "at" {
        t.Fatalf("expected access token to be set")
    }
    if bundle.TokenData.ConnectionType == "" {
        t.Fatalf("expected connection type to be set")
    }
    if bundle.TokenData.Expired == "" {
        t.Fatalf("expected expired timestamp to be set")
    }
}
```

- [ ] **Step 2: Run auth tests to verify baseline behavior**

Run:
```bash
go test ./internal/auth/amazon -run 'TestRegisterClientUsesConfiguredStartURLAndRegion|TestExchangeDeviceCodeSetsExpiryAndConnectionType' -v
```

Expected:
- either PASS for current behavior, or
- FAIL with enough signal to guide the next refactor.

- [ ] **Step 3: Fix test compilation issues and stabilize test seams**

If `oidcBaseURL()` is not test-injectable, make the minimal change in `internal/auth/amazon/auth.go` to support overriding the base URL in tests:

```go
type Auth struct {
    httpClient *http.Client
    region     string
    startURL   string
    baseURL    string
}

func (a *Auth) oidcBaseURL() string {
    if strings.TrimSpace(a.baseURL) != "" {
        return a.baseURL
    }
    return fmt.Sprintf("https://oidc.%s.amazonaws.com", a.region)
}
```

- [ ] **Step 4: Re-run auth tests and ensure they pass**

Run:
```bash
go test ./internal/auth/amazon -run 'TestRegisterClientUsesConfiguredStartURLAndRegion|TestExchangeDeviceCodeSetsExpiryAndConnectionType' -v
```

Expected:
- PASS

- [ ] **Step 5: Commit**

```bash
git -C "/c/Users/amine/Desktop/Nouveau dossier/CLIProxyAPI-main" add internal/auth/amazon/auth.go internal/auth/amazon/auth_test.go internal/auth/amazon/types.go
git -C "/c/Users/amine/Desktop/Nouveau dossier/CLIProxyAPI-main" commit -m "test: lock down amazon auth behavior"
```

---

### Task 2: Add PKCE/browser login support to the Amazon auth package

**Files:**
- Create: `../CLIProxyAPI-main/internal/auth/amazon/pkce.go`
- Create: `../CLIProxyAPI-main/internal/auth/amazon/oauth_server.go`
- Modify: `../CLIProxyAPI-main/internal/auth/amazon/auth.go`
- Modify: `../CLIProxyAPI-main/internal/auth/amazon/types.go`
- Test: `../CLIProxyAPI-main/internal/auth/amazon/auth_test.go`

- [ ] **Step 1: Write the failing PKCE tests**

```go
func TestGeneratePKCEPairProducesVerifierAndChallenge(t *testing.T) {
    verifier, challenge, err := GeneratePKCEPair()
    if err != nil {
        t.Fatalf("GeneratePKCEPair() error = %v", err)
    }
    if verifier == "" || challenge == "" {
        t.Fatalf("expected verifier and challenge to be non-empty")
    }
    if verifier == challenge {
        t.Fatalf("expected verifier and challenge to differ")
    }
}

func TestBuildAuthorizeURLIncludesPKCEParameters(t *testing.T) {
    auth := &Auth{region: "us-east-1", startURL: "https://view.awsapps.com/start", baseURL: "https://example.com"}
    u, state, verifier, err := auth.BuildAuthorizeURL("http://127.0.0.1:54545/callback")
    if err != nil {
        t.Fatalf("BuildAuthorizeURL() error = %v", err)
    }
    if u == "" || state == "" || verifier == "" {
        t.Fatalf("expected authorize URL, state, verifier")
    }
    if !strings.Contains(u, "code_challenge=") {
        t.Fatalf("expected code_challenge in authorize url: %s", u)
    }
    if !strings.Contains(u, "response_type=code") {
        t.Fatalf("expected response_type=code in authorize url: %s", u)
    }
}
```

- [ ] **Step 2: Run tests to confirm missing functionality**

Run:
```bash
go test ./internal/auth/amazon -run 'TestGeneratePKCEPairProducesVerifierAndChallenge|TestBuildAuthorizeURLIncludesPKCEParameters' -v
```

Expected:
- FAIL because PKCE helpers do not exist yet.

- [ ] **Step 3: Implement PKCE helper file**

Create `internal/auth/amazon/pkce.go` with:

```go
package amazon

import (
    "crypto/rand"
    "crypto/sha256"
    "encoding/base64"
)

func GeneratePKCEPair() (string, string, error) {
    raw := make([]byte, 32)
    if _, err := rand.Read(raw); err != nil {
        return "", "", err
    }
    verifier := base64.RawURLEncoding.EncodeToString(raw)
    sum := sha256.Sum256([]byte(verifier))
    challenge := base64.RawURLEncoding.EncodeToString(sum[:])
    return verifier, challenge, nil
}
```

- [ ] **Step 4: Implement minimal authorize URL builder in `internal/auth/amazon/auth.go`**

Add code similar to:

```go
func (a *Auth) BuildAuthorizeURL(redirectURI string) (authorizeURL string, state string, verifier string, err error) {
    verifier, challenge, err := GeneratePKCEPair()
    if err != nil {
        return "", "", "", err
    }
    state, err = randomState()
    if err != nil {
        return "", "", "", err
    }

    v := url.Values{}
    v.Set("response_type", "code")
    v.Set("client_id", "cli-proxy-api")
    v.Set("redirect_uri", redirectURI)
    v.Set("code_challenge", challenge)
    v.Set("code_challenge_method", "S256")
    v.Set("state", state)
    authorizeURL = a.oidcBaseURL() + "/authorize?" + v.Encode()
    return authorizeURL, state, verifier, nil
}
```

Also add a small `randomState()` helper in the same file or `oauth_server.go`.

- [ ] **Step 5: Re-run PKCE tests**

Run:
```bash
go test ./internal/auth/amazon -run 'TestGeneratePKCEPairProducesVerifierAndChallenge|TestBuildAuthorizeURLIncludesPKCEParameters' -v
```

Expected:
- PASS

- [ ] **Step 6: Commit**

```bash
git -C "/c/Users/amine/Desktop/Nouveau dossier/CLIProxyAPI-main" add internal/auth/amazon/pkce.go internal/auth/amazon/oauth_server.go internal/auth/amazon/auth.go internal/auth/amazon/auth_test.go internal/auth/amazon/types.go
git -C "/c/Users/amine/Desktop/Nouveau dossier/CLIProxyAPI-main" commit -m "feat: add amazon pkce auth helpers"
```

---

### Task 3: Add CLI entrypoints for Amazon login flows

**Files:**
- Modify: `../CLIProxyAPI-main/cmd/server/main.go`
- Create: `../CLIProxyAPI-main/cmd/amazon.go`
- Test: use focused package tests where applicable, then build server package

- [ ] **Step 1: Write a small compilation-oriented test for command wiring**

If the project does not already test command wiring, add a lightweight compile-time test file:

```go
package cmd

import "testing"

func TestAmazonCommandSymbolsExist(t *testing.T) {
    _ = DoAmazonLogin
    _ = DoAmazonDeviceLogin
}
```

Save it as:
- `../CLIProxyAPI-main/internal/cmd/amazon_test.go` only if the command package actually lives there, otherwise place it in the correct `cmd` package path used by the repo.

- [ ] **Step 2: Add new flags in `cmd/server/main.go`**

Insert near the existing login flags:

```go
var amazonLogin bool
var amazonDeviceLogin bool
var amazonRegion string
var amazonStartURL string

flag.BoolVar(&amazonLogin, "amazon-login", false, "Login to Amazon using OAuth")
flag.BoolVar(&amazonDeviceLogin, "amazon-device-login", false, "Login to Amazon using device authorization")
flag.StringVar(&amazonRegion, "amazon-region", "", "Amazon OIDC/Bedrock region")
flag.StringVar(&amazonStartURL, "amazon-start-url", "", "Amazon Builder ID / AWS start URL")
```

- [ ] **Step 3: Add dispatch branches in `cmd/server/main.go`**

Add new branches before falling through to server startup:

```go
} else if amazonLogin {
    cmd.DoAmazonLogin(cfg, options, amazonRegion, amazonStartURL)
} else if amazonDeviceLogin {
    cmd.DoAmazonDeviceLogin(cfg, options, amazonRegion, amazonStartURL)
```

- [ ] **Step 4: Create `cmd/amazon.go` with minimal flow wrappers**

```go
package cmd

import (
    "fmt"

    "github.com/router-for-me/CLIProxyAPI/v6/internal/config"
)

type LoginOptions struct {
    NoBrowser    bool
    CallbackPort int
}

func DoAmazonLogin(cfg *config.Config, options *LoginOptions, region, startURL string) {
    fmt.Println("amazon pkce login is not fully implemented yet")
}

func DoAmazonDeviceLogin(cfg *config.Config, options *LoginOptions, region, startURL string) {
    fmt.Println("amazon device login is not fully implemented yet")
}
```

Then replace the placeholders in the next task with actual auth service calls.

- [ ] **Step 5: Build the server to ensure wiring compiles**

Run:
```bash
go test ./cmd/... ./internal/auth/amazon/... -v
```

Expected:
- PASS, or any failures clearly limited to the next incomplete command internals.

- [ ] **Step 6: Commit**

```bash
git -C "/c/Users/amine/Desktop/Nouveau dossier/CLIProxyAPI-main" add cmd/server/main.go cmd/amazon.go
git -C "/c/Users/amine/Desktop/Nouveau dossier/CLIProxyAPI-main" commit -m "feat: add amazon cli command wiring"
```

---

### Task 4: Normalize Amazon management auth flows around the existing handler surface

**Files:**
- Modify: `../CLIProxyAPI-main/internal/api/handlers/management/auth_files.go`
- Modify: `../CLIProxyAPI-main/internal/api/handlers/management/oauth_sessions.go`
- Modify: `../CLIProxyAPI-main/internal/api/handlers/management/oauth_callback.go`
- Create: `../CLIProxyAPI-main/internal/api/handlers/management/amazon_management_test.go`

- [ ] **Step 1: Write failing management tests for Amazon endpoints**

```go
package management

import (
    "net/http"
    "net/http/httptest"
    "testing"

    "github.com/gin-gonic/gin"
    "github.com/router-for-me/CLIProxyAPI/v6/internal/config"
)

func TestNormalizeOAuthProviderSupportsAmazonAliases(t *testing.T) {
    aliases := []string{"amazon", "amazonq", "amazon-q", "aws", "builder-id"}
    for _, in := range aliases {
        got, err := NormalizeOAuthProvider(in)
        if err != nil {
            t.Fatalf("NormalizeOAuthProvider(%q) error = %v", in, err)
        }
        if got != "amazon" {
            t.Fatalf("NormalizeOAuthProvider(%q) = %q, want amazon", in, got)
        }
    }
}

func TestPostOAuthCallbackRejectsUnknownAmazonState(t *testing.T) {
    gin.SetMode(gin.TestMode)
    h := NewHandlerWithoutConfigFilePath(&config.Config{}, nil)
    r := gin.New()
    r.POST("/oauth-callback", h.PostOAuthCallback)

    req := httptest.NewRequest(http.MethodPost, "/oauth-callback", strings.NewReader(`{"provider":"amazon","state":"missing","code":"abc"}`))
    req.Header.Set("Content-Type", "application/json")
    w := httptest.NewRecorder()
    r.ServeHTTP(w, req)

    if w.Code != http.StatusNotFound {
        t.Fatalf("expected 404, got %d", w.Code)
    }
}
```

- [ ] **Step 2: Run only the management tests**

Run:
```bash
go test ./internal/api/handlers/management -run 'TestNormalizeOAuthProviderSupportsAmazonAliases|TestPostOAuthCallbackRejectsUnknownAmazonState' -v
```

Expected:
- PASS for alias support if already covered
- otherwise FAIL and reveal missing handler/session behavior.

- [ ] **Step 3: Refactor `RequestAmazonToken` to use a shared Amazon auth helper**

In `auth_files.go`, extract the polling-and-save behavior into a helper so the same persistence rules are reusable by both device flow and PKCE callback finalization. Introduce something like:

```go
func (h *Handler) saveAmazonAuthBundle(ctx context.Context, registration *amazon.TokenData, bundle *amazon.AuthBundle) error {
    storage := &amazon.TokenStorage{
        AccessToken:           bundle.TokenData.AccessToken,
        RefreshToken:          bundle.TokenData.RefreshToken,
        IDToken:               bundle.TokenData.IDToken,
        TokenType:             bundle.TokenData.TokenType,
        Expired:               bundle.TokenData.Expired,
        Region:                bundle.TokenData.Region,
        StartURL:              bundle.TokenData.StartURL,
        ClientID:              registration.ClientID,
        ClientSecret:          registration.ClientSecret,
        RegistrationExpiresAt: registration.RegistrationExpiresAt,
        ConnectionType:        bundle.TokenData.ConnectionType,
        LastRefresh:           bundle.TokenData.LastRefresh,
    }

    record := &coreauth.Auth{
        ID:       fmt.Sprintf("amazon-%d.json", time.Now().UnixMilli()),
        Provider: "amazon",
        FileName: fmt.Sprintf("amazon-%d.json", time.Now().UnixMilli()),
        Label:    "Amazon Q",
        Storage:  storage,
        Metadata: map[string]any{
            "region":                  bundle.TokenData.Region,
            "start_url":               bundle.TokenData.StartURL,
            "connection_type":         bundle.TokenData.ConnectionType,
            "expired":                 bundle.TokenData.Expired,
            "last_refresh":            bundle.TokenData.LastRefresh,
            "client_id":               registration.ClientID,
            "client_secret":           registration.ClientSecret,
            "registration_expires_at": registration.RegistrationExpiresAt,
        },
    }

    _, err := h.saveTokenRecord(ctx, record)
    return err
}
```

- [ ] **Step 4: Add a dedicated Amazon start endpoint if missing and keep device flow endpoint stable**

Either keep `RequestAmazonToken` and add a second PKCE starter, or rename internally while preserving API compatibility. The important result is:
- one handler for device flow start
- one handler for PKCE start
- both feed the same save helper

- [ ] **Step 5: Re-run management tests**

Run:
```bash
go test ./internal/api/handlers/management -run 'TestNormalizeOAuthProviderSupportsAmazonAliases|TestPostOAuthCallbackRejectsUnknownAmazonState' -v
```

Expected:
- PASS

- [ ] **Step 6: Commit**

```bash
git -C "/c/Users/amine/Desktop/Nouveau dossier/CLIProxyAPI-main" add internal/api/handlers/management/auth_files.go internal/api/handlers/management/oauth_sessions.go internal/api/handlers/management/oauth_callback.go internal/api/handlers/management/amazon_management_test.go
git -C "/c/Users/amine/Desktop/Nouveau dossier/CLIProxyAPI-main" commit -m "refactor: normalize amazon management auth flow"
```

---

### Task 5: Register explicit Amazon management routes in the API server

**Files:**
- Modify: `../CLIProxyAPI-main/internal/api/server.go`
- Test: `../CLIProxyAPI-main/internal/api/handlers/management/amazon_management_test.go`

- [ ] **Step 1: Write a route-level failing test**

Add a route smoke test similar to:

```go
func TestAmazonManagementRoutesAreRegistered(t *testing.T) {
    // Use the server/router construction path already used elsewhere in the repo.
    // Assert that GET/POST requests hit handlers instead of returning 404.
}
```

Use the exact test setup pattern from existing management route tests if available.

- [ ] **Step 2: Register routes in `internal/api/server.go`**

Add the following route attachments near the existing management auth routes:

```go
management.POST("/oauth/amazon/start", s.mgmt.StartAmazonOAuth)
management.POST("/oauth/amazon/device/start", s.mgmt.RequestAmazonToken)
management.POST("/oauth/amazon/callback", s.mgmt.PostOAuthCallback)
management.GET("/oauth/amazon/status", s.mgmt.GetOAuthStatus)
management.GET("/amazon/models", s.mgmt.ListAmazonModels)
management.POST("/amazon/chat/test", s.mgmt.TestAmazonChat)
```

Adjust function names to match the actual handler names you land on.

- [ ] **Step 3: Run route-related tests**

Run:
```bash
go test ./internal/api/... -run 'TestAmazonManagementRoutesAreRegistered' -v
```

Expected:
- PASS

- [ ] **Step 4: Commit**

```bash
git -C "/c/Users/amine/Desktop/Nouveau dossier/CLIProxyAPI-main" add internal/api/server.go internal/api/handlers/management/amazon_management_test.go
git -C "/c/Users/amine/Desktop/Nouveau dossier/CLIProxyAPI-main" commit -m "feat: register amazon management routes"
```

---

### Task 6: Add Amazon Bedrock model listing to the management API

**Files:**
- Create: `../CLIProxyAPI-main/internal/api/handlers/management/amazon_models.go`
- Modify: `../CLIProxyAPI-main/internal/auth/amazon/types.go`
- Modify: `../CLIProxyAPI-main/internal/auth/amazon/auth.go`
- Test: `../CLIProxyAPI-main/internal/api/handlers/management/amazon_management_test.go`

- [ ] **Step 1: Write the failing model listing test**

```go
func TestListAmazonModelsReturnsModels(t *testing.T) {
    // Mock the underlying Bedrock model-discovery HTTP response.
    // Assert 200 and a JSON body with a non-empty models array.
}
```

Use the repo’s preferred handler test style and return a minimal payload such as one model with `modelId`, `modelName`, `providerName`.

- [ ] **Step 2: Add Bedrock model discovery types**

In `internal/auth/amazon/types.go`, add minimal structs like:

```go
type FoundationModelSummary struct {
    ModelID                   string   `json:"modelId"`
    ModelName                 string   `json:"modelName"`
    ProviderName              string   `json:"providerName"`
    InputModalities           []string `json:"inputModalities,omitempty"`
    OutputModalities          []string `json:"outputModalities,omitempty"`
    ResponseStreamingSupported bool    `json:"responseStreamingSupported,omitempty"`
}

type ListFoundationModelsResponse struct {
    ModelSummaries []FoundationModelSummary `json:"modelSummaries"`
}
```

- [ ] **Step 3: Add a minimal model-listing method in `internal/auth/amazon/auth.go`**

```go
func (a *Auth) ListFoundationModels(ctx context.Context, accessToken string) (*ListFoundationModelsResponse, error) {
    req, err := http.NewRequestWithContext(ctx, http.MethodGet, fmt.Sprintf("https://bedrock.%s.amazonaws.com/foundation-models", a.region), nil)
    if err != nil {
        return nil, err
    }
    req.Header.Set("Authorization", "Bearer "+accessToken)
    req.Header.Set("Accept", "application/json")

    resp, err := a.httpClient.Do(req)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()

    var out ListFoundationModelsResponse
    if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
        return nil, err
    }
    return &out, nil
}
```

If Bedrock auth needs SigV4 rather than bearer auth in the real implementation, this initial version should still be coded through a helper seam so the auth strategy can be replaced without changing handler shape.

- [ ] **Step 4: Add `ListAmazonModels` handler**

Create `internal/api/handlers/management/amazon_models.go`:

```go
package management

import (
    "net/http"

    "github.com/gin-gonic/gin"
)

func (h *Handler) ListAmazonModels(c *gin.Context) {
    c.JSON(http.StatusOK, gin.H{"models": []any{}})
}
```

Then replace the stub with the real call using the persisted latest Amazon auth record.

- [ ] **Step 5: Run the model listing tests**

Run:
```bash
go test ./internal/api/handlers/management -run 'TestListAmazonModelsReturnsModels' -v
```

Expected:
- PASS

- [ ] **Step 6: Commit**

```bash
git -C "/c/Users/amine/Desktop/Nouveau dossier/CLIProxyAPI-main" add internal/api/handlers/management/amazon_models.go internal/auth/amazon/auth.go internal/auth/amazon/types.go internal/api/handlers/management/amazon_management_test.go
git -C "/c/Users/amine/Desktop/Nouveau dossier/CLIProxyAPI-main" commit -m "feat: add amazon bedrock model listing"
```

---

### Task 7: Add a basic Amazon Bedrock executor for chat test requests

**Files:**
- Create: `../CLIProxyAPI-main/internal/runtime/executor/amazon_executor.go`
- Create: `../CLIProxyAPI-main/internal/runtime/executor/amazon_executor_test.go`
- Create: `../CLIProxyAPI-main/internal/api/handlers/management/amazon_chat.go`
- Inspect: `../CLIProxyAPI-main/internal/runtime/executor/claude_executor.go`
- Inspect: `../CLIProxyAPI-main/internal/runtime/executor/gemini_executor.go`

- [ ] **Step 1: Write the failing executor test**

```go
package executor

import (
    "context"
    "testing"
)

func TestAmazonExecutorIdentifier(t *testing.T) {
    e := NewAmazonExecutor(nil)
    if e.Identifier() != "amazon" {
        t.Fatalf("expected identifier amazon, got %q", e.Identifier())
    }
}
```

- [ ] **Step 2: Run the executor test**

Run:
```bash
go test ./internal/runtime/executor -run 'TestAmazonExecutorIdentifier' -v
```

Expected:
- FAIL because the executor does not exist yet.

- [ ] **Step 3: Create minimal executor skeleton**

Create `internal/runtime/executor/amazon_executor.go`:

```go
package executor

import "github.com/router-for-me/CLIProxyAPI/v6/internal/config"

type AmazonExecutor struct {
    cfg *config.Config
}

func NewAmazonExecutor(cfg *config.Config) *AmazonExecutor { return &AmazonExecutor{cfg: cfg} }
func (e *AmazonExecutor) Identifier() string { return "amazon" }
```

- [ ] **Step 4: Add a minimal execution path and management handler**

Create `internal/api/handlers/management/amazon_chat.go` with:

```go
package management

import (
    "net/http"

    "github.com/gin-gonic/gin"
)

func (h *Handler) TestAmazonChat(c *gin.Context) {
    c.JSON(http.StatusOK, gin.H{"status": "ok", "provider": "amazon"})
}
```

Then evolve it to call `AmazonExecutor` with a simple prompt body and a mocked or thin Bedrock request path.

- [ ] **Step 5: Run the executor and handler tests**

Run:
```bash
go test ./internal/runtime/executor ./internal/api/handlers/management -run 'TestAmazonExecutorIdentifier|TestAmazonChat' -v
```

Expected:
- PASS for identifier and basic chat path after implementation.

- [ ] **Step 6: Commit**

```bash
git -C "/c/Users/amine/Desktop/Nouveau dossier/CLIProxyAPI-main" add internal/runtime/executor/amazon_executor.go internal/runtime/executor/amazon_executor_test.go internal/api/handlers/management/amazon_chat.go
 git -C "/c/Users/amine/Desktop/Nouveau dossier/CLIProxyAPI-main" commit -m "feat: add amazon executor and chat test path"
```

---

### Task 8: Wire Amazon into model registry/runtime discovery

**Files:**
- Modify: `../CLIProxyAPI-main/internal/registry/model_registry.go`
- Modify: `../CLIProxyAPI-main/internal/registry/model_definitions.go`
- Test: `../CLIProxyAPI-main/internal/registry/model_registry_hook_test.go`

- [ ] **Step 1: Write the failing registry test**

```go
func TestAmazonModelsCanBeRegistered(t *testing.T) {
    // Register a minimal amazon model payload and assert it is retrievable from the registry.
}
```

- [ ] **Step 2: Run the registry test**

Run:
```bash
go test ./internal/registry -run 'TestAmazonModelsCanBeRegistered' -v
```

Expected:
- FAIL because Amazon registry support is not yet wired.

- [ ] **Step 3: Add minimal provider-aware model registration logic**

Follow the project’s current registry pattern and add Amazon-backed model ingestion in the smallest possible way. If the registry already supports arbitrary providers, only add the Amazon source hookup rather than a bespoke registry branch.

Representative target code shape:

```go
if provider == "amazon" {
    // translate discovered amazon/bedrock models into existing registry model type
}
```

- [ ] **Step 4: Re-run registry tests**

Run:
```bash
go test ./internal/registry -run 'TestAmazonModelsCanBeRegistered' -v
```

Expected:
- PASS

- [ ] **Step 5: Commit**

```bash
git -C "/c/Users/amine/Desktop/Nouveau dossier/CLIProxyAPI-main" add internal/registry/model_registry.go internal/registry/model_definitions.go
git -C "/c/Users/amine/Desktop/Nouveau dossier/CLIProxyAPI-main" commit -m "feat: wire amazon models into registry"
```

---

### Task 9: Add config and example settings for Amazon

**Files:**
- Modify: `../CLIProxyAPI-main/config.example.yaml`
- Modify: config structs in `../CLIProxyAPI-main/internal/config/*`
- Modify: `../CLIProxyAPI-main/internal/access/config_access/*` if required by the project’s config registration flow
- Test: existing config tests or add focused config parsing test

- [ ] **Step 1: Write a failing config parse test**

```go
func TestAmazonConfigParses(t *testing.T) {
    raw := []byte("amazon:\n  enabled: true\n  region: us-east-1\n  start_url: https://view.awsapps.com/start\n  use_bedrock: true\n")
    // parse through the project’s config loader and assert fields are populated.
}
```

- [ ] **Step 2: Run the config parse test**

Run:
```bash
go test ./internal/config/... -run 'TestAmazonConfigParses' -v
```

Expected:
- FAIL because the fields do not exist yet.

- [ ] **Step 3: Add the config fields and example YAML**

Add fields equivalent to:

```go
type AmazonConfig struct {
    Enabled    bool   `yaml:"enabled"`
    Region     string `yaml:"region"`
    StartURL   string `yaml:"start_url"`
    UseBedrock bool   `yaml:"use_bedrock"`
}
```

And add to `config.example.yaml`:

```yaml
amazon:
  enabled: false
  region: us-east-1
  start_url: "https://view.awsapps.com/start"
  use_bedrock: true
```

- [ ] **Step 4: Re-run config tests**

Run:
```bash
go test ./internal/config/... -run 'TestAmazonConfigParses' -v
```

Expected:
- PASS

- [ ] **Step 5: Commit**

```bash
git -C "/c/Users/amine/Desktop/Nouveau dossier/CLIProxyAPI-main" add config.example.yaml internal/config
 git -C "/c/Users/amine/Desktop/Nouveau dossier/CLIProxyAPI-main" commit -m "feat: add amazon config support"
```

---

### Task 10: Run focused end-to-end verification for the Amazon V1 surface

**Files:**
- Test: `../CLIProxyAPI-main/internal/auth/amazon/auth_test.go`
- Test: `../CLIProxyAPI-main/internal/api/handlers/management/amazon_management_test.go`
- Test: `../CLIProxyAPI-main/internal/runtime/executor/amazon_executor_test.go`
- Test: `../CLIProxyAPI-main/internal/registry/*`

- [ ] **Step 1: Run the focused package test suite**

Run:
```bash
go test ./internal/auth/amazon ./internal/api/handlers/management ./internal/runtime/executor ./internal/registry -v
```

Expected:
- PASS

- [ ] **Step 2: Build the server binary**

Run:
```bash
go test ./cmd/server -v
```

Expected:
- PASS

- [ ] **Step 3: Smoke-test the route registration path**

Run the service locally and verify endpoints exist:

```bash
go run ./cmd/server -config config.example.yaml
```

Then manually verify:
- `POST /v0/management/oauth/amazon/start`
- `POST /v0/management/oauth/amazon/device/start`
- `GET /v0/management/oauth/amazon/status`
- `GET /v0/management/amazon/models`
- `POST /v0/management/amazon/chat/test`

Expected:
- endpoints respond with management-auth-protected JSON instead of 404.

- [ ] **Step 4: Commit final verification state**

```bash
git -C "/c/Users/amine/Desktop/Nouveau dossier/CLIProxyAPI-main" add cmd/server/main.go internal/api/server.go internal/api/handlers/management internal/auth/amazon internal/runtime/executor/amazon_executor.go internal/registry config.example.yaml
git -C "/c/Users/amine/Desktop/Nouveau dossier/CLIProxyAPI-main" commit -m "feat: complete amazon provider v1 backend support"
```

---

## Self-review against the spec

### Spec coverage
- PKCE/browser flow: covered in Task 2 and Task 3.
- Device flow: covered by Task 1 baseline locking and Task 4 management normalization.
- Management endpoints: covered in Task 4 and Task 5.
- Bedrock model listing: covered in Task 6.
- Chat/inference test route: covered in Task 7.
- Registry/runtime integration: covered in Task 8.
- Config + example YAML: covered in Task 9.
- Tests and verification: covered in Tasks 1, 4, 6, 7, 8, 9, and 10.

### Placeholder scan
- The plan avoids TBD/TODO placeholders.
- Where exact project test harness details may vary, the instruction is to mirror existing nearby test patterns rather than invent a new harness.
- All major code steps include concrete code or a concrete code shape.

### Type consistency
- `Auth`, `TokenData`, `AuthBundle`, `TokenStorage`, `AmazonExecutor`, and handler names are used consistently.
- The plan assumes `amazon` is the canonical provider name everywhere.
- Device flow and PKCE both converge into saved `coreauth.Auth` records.

## Notes for implementation

The existing codebase already includes a partial Amazon implementation in:
- `internal/auth/amazon/*`
- `internal/api/handlers/management/auth_files.go`
- `internal/api/handlers/management/oauth_sessions.go`

So implementation should extend and normalize those paths rather than reintroducing a second Amazon architecture.
