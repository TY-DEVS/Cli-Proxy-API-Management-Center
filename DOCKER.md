# Docker

This project provides a two-container stack:

- `cli-proxy-api`: the backend management/API server
- `webui`: this React/Vite management UI served by Nginx

## Files

- Environment: [.env](/c:/Users/amine/Desktop/Nouveau%20dossier/Cli-Proxy-API-Management-Center/.env)
- Compose stack: [docker-compose.yml](/c:/Users/amine/Desktop/Nouveau%20dossier/Cli-Proxy-API-Management-Center/docker-compose.yml)
- Production stack: [docker-compose.production.yml](/c:/Users/amine/Desktop/Nouveau%20dossier/Cli-Proxy-API-Management-Center/docker-compose.production.yml)
- Coolify private-repo stack: [docker-compose.coolify-private.yml](/c:/Users/amine/Desktop/Nouveau%20dossier/Cli-Proxy-API-Management-Center/docker-compose.coolify-private.yml)
- Backend config sample: [docker/backend/config.yaml](/c:/Users/amine/Desktop/Nouveau%20dossier/Cli-Proxy-API-Management-Center/docker/backend/config.yaml)

## Main variables

- `CLI_PROXY_IMAGE`: backend image used by the default deployment stack
- `CLI_PROXY_BUILD_CONTEXT`: backend Git or local build context used only by build overrides
- `CLI_PROXY_LOCAL_IMAGE`: local image tag produced by backend build overrides
- `CLI_PROXY_VERSION`: backend build arg for build overrides
- `CLI_PROXY_COMMIT`: backend build arg for build overrides
- `CLI_PROXY_BUILD_DATE`: backend build arg for build overrides
- `CLI_PROXY_HOST_PORT`: host port exposing the backend
- `CLI_PROXY_PORT`: backend port inside the container
- `CLI_PROXY_CONFIG_PATH`: local config file mounted into backend
- `CLI_PROXY_AUTH_DIR`: local auth directory mounted into backend
- `APP_HOST_PORT`: host port exposing the web UI
- `APP_PORT`: Nginx listen port inside the web UI container
- `APP_DEFAULT_API_BASE`: API base injected into the frontend at container startup, as seen by the browser

The base `docker-compose.yml` and standalone `docker-compose.production.yml` use `CLI_PROXY_IMAGE`, which is the safest option for Coolify and similar platforms because they do not need to clone a second repository during deployment.

## Start

```bash
docker compose up -d
```

For hosted production with the standalone production stack:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml up -d
```

## Coolify private repo

If you want Coolify to build the backend directly from your private repo `https://github.com/Aminetwiti/CLIProxyAPI-main`, use [docker-compose.coolify-private.yml](/c:/Users/amine/Desktop/Nouveau%20dossier/Cli-Proxy-API-Management-Center/docker-compose.coolify-private.yml).

Exact Coolify variables to create:

```env
GITHUB_TOKEN=<token with read access to Aminetwiti/CLIProxyAPI-main>
CLI_PROXY_BUILD_CONTEXT=https://x-access-token:<token with read access to Aminetwiti/CLIProxyAPI-main>@github.com/Aminetwiti/CLIProxyAPI-main.git#main
CLI_PROXY_LOCAL_IMAGE=cli-proxy-api:production
CLI_PROXY_VERSION=main
CLI_PROXY_COMMIT=main
CLI_PROXY_BUILD_DATE=2026-04-20
CLI_PROXY_HOST_PORT=8317
CLI_PROXY_PORT=8317
CLI_PROXY_CONFIG_PATH=./docker/backend/config.yaml
CLI_PROXY_AUTH_DIR=./docker/backend/auth
APP_HOST_PORT=8080
APP_PORT=80
APP_DEFAULT_API_BASE=http://localhost:8317
```

Recommended Coolify setup:

1. Compose file: `docker-compose.coolify-private.yml`
2. Secret: `GITHUB_TOKEN`
3. Secret: `CLI_PROXY_BUILD_CONTEXT`
4. Regular variables: the remaining `CLI_PROXY_*` and `APP_*`

An example file is available at [.env.coolify-private.example](/c:/Users/amine/Desktop/Nouveau%20dossier/Cli-Proxy-API-Management-Center/.env.coolify-private.example).

## Local backend build

If you want to build the backend from your local checkout during development:

```bash
docker compose --env-file .env -f docker-compose.yml -f docker-compose.local-backend.yml up --build
```

## Production with your repo

If you want to build the backend from your repo `https://github.com/Aminetwiti/CLIProxyAPI-main` or from a pinned tag/commit, use the fork-build override.

Example fork on `main`:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml -f docker-compose.fork-build.yml up --build -d
```

This mode requires the deployment environment to be able to clone that Git repository. It will fail on platforms that do not have access to your private fork.

Example build context for your repo:

```env
CLI_PROXY_BUILD_CONTEXT=https://github.com/Aminetwiti/CLIProxyAPI-main.git#main
```

If your repo is private on Coolify, use an authenticated Git URL stored in an environment variable:

```env
CLI_PROXY_BUILD_CONTEXT=https://x-access-token:${GITHUB_TOKEN}@github.com/Aminetwiti/CLIProxyAPI-main.git#main
```

In that case, add `GITHUB_TOKEN` as a secret in Coolify with permission to read that repository.

## Your own image

If you prefer to publish your backend image under your own name and keep Coolify simple, use [docker-compose.production.yml](/c:/Users/amine/Desktop/Nouveau%20dossier/Cli-Proxy-API-Management-Center/docker-compose.production.yml) with:

```env
CLI_PROXY_IMAGE=ghcr.io/aminetwiti/cli-proxy-api:latest
```

Example environment file: [.env.own-image.example](/c:/Users/amine/Desktop/Nouveau%20dossier/Cli-Proxy-API-Management-Center/.env.own-image.example)

If the image is private, add registry credentials in Coolify for the registry that hosts it.

Using the prepared production environment file for the default image-based deployment:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml up -d
```

With this environment:

```env
CLI_PROXY_IMAGE=eceasy/cli-proxy-api:latest
```

Pinned upstream release example:

```env
CLI_PROXY_BUILD_CONTEXT=https://github.com/router-for-me/CLIProxyAPI.git#v6.9.30
CLI_PROXY_LOCAL_IMAGE=cli-proxy-api:v6.9.30
CLI_PROXY_VERSION=v6.9.30
CLI_PROXY_COMMIT=v6.9.30
CLI_PROXY_BUILD_DATE=2026-04-20
```

This keeps the default deployment compatible with Coolify while still allowing explicit backend build overrides when you control the environment.

UI:

```text
http://localhost:8080
```

Backend management API:

```text
http://localhost:8317/v0/management
```

## First use

1. Edit [docker/backend/config.yaml](/c:/Users/amine/Desktop/Nouveau%20dossier/Cli-Proxy-API-Management-Center/docker/backend/config.yaml) and replace `change-me` with your real management key.
2. If needed, update [.env](/c:/Users/amine/Desktop/Nouveau%20dossier/Cli-Proxy-API-Management-Center/.env) or [.env.production](/c:/Users/amine/Desktop/Nouveau%20dossier/Cli-Proxy-API-Management-Center/.env.production) ports and backend source.
3. For Coolify or any hosted deployment, prefer `CLI_PROXY_IMAGE` in the base stack.
4. Use `docker-compose.local-backend.yml` only when building from a local checkout.
5. Use `docker-compose.fork-build.yml` only when the deployment environment can clone your repo.
6. Open the UI and log in with the same management key.

## Notes

- The frontend does not hardcode the backend URL in the bundle. `APP_DEFAULT_API_BASE` is written to `app-config.js` when the container starts.
- In a browser, `cli-proxy-api` is not a valid hostname unless your DNS resolves it. The default value therefore points to `http://localhost:8317`.
- The default stack pulls `CLI_PROXY_IMAGE` and does not build the backend.
- Backend builds are opt-in through `docker-compose.local-backend.yml` or `docker-compose.fork-build.yml`.
- Both services include healthchecks, and `webui` waits until `cli-proxy-api` is healthy.
- The sample backend config keeps `disable-control-panel: true` because the UI is served by the separate `webui` container.
- Auth files persist in [docker/backend/auth](/c:/Users/amine/Desktop/Nouveau%20dossier/Cli-Proxy-API-Management-Center/docker/backend/auth).