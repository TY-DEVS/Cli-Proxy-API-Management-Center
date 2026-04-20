# Docker

This project provides a two-container stack:

- `cli-proxy-api`: the backend management/API server
- `webui`: this React/Vite management UI served by Nginx

## Files

- Environment: [.env](/c:/Users/amine/Desktop/Nouveau%20dossier/Cli-Proxy-API-Management-Center/.env)
- Compose stack: [docker-compose.yml](/c:/Users/amine/Desktop/Nouveau%20dossier/Cli-Proxy-API-Management-Center/docker-compose.yml)
- Backend config sample: [docker/backend/config.yaml](/c:/Users/amine/Desktop/Nouveau%20dossier/Cli-Proxy-API-Management-Center/docker/backend/config.yaml)

## Main variables

- `CLI_PROXY_BUILD_CONTEXT`: path to your local CLI Proxy API repository (for example `../CLIProxyAPI-main`)
- `CLI_PROXY_LOCAL_IMAGE`: local image tag produced by `docker compose build`
- `CLI_PROXY_VERSION`: backend build arg
- `CLI_PROXY_COMMIT`: backend build arg
- `CLI_PROXY_BUILD_DATE`: backend build arg
- `CLI_PROXY_HOST_PORT`: host port exposing the backend
- `CLI_PROXY_PORT`: backend port inside the container
- `CLI_PROXY_CONFIG_PATH`: local config file mounted into backend
- `CLI_PROXY_AUTH_DIR`: local auth directory mounted into backend
- `APP_HOST_PORT`: host port exposing the web UI
- `APP_PORT`: Nginx listen port inside the web UI container
- `APP_DEFAULT_API_BASE`: API base injected into the frontend at container startup, as seen by the browser

`CLI_PROXY_BUILD_CONTEXT` can also be a Git build context. This is the simplest production option if you want to deploy your own fork or a pinned upstream tag instead of building from a local checkout.

## Start

```bash
docker compose up --build
```

## Production with your own fork

If you do not want to build the backend from `../CLIProxyAPI-main`, you can build it directly from your own GitHub fork or from a pinned tag/commit.

Example fork on `main`:

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml up --build -d
```

Using the prepared production environment file:

```bash
docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.production.yml up --build -d
```

With this environment:

```env
CLI_PROXY_BUILD_CONTEXT=https://github.com/<your-github-user>/CLIProxyAPI.git#main
CLI_PROXY_LOCAL_IMAGE=cli-proxy-api:production
CLI_PROXY_VERSION=main
CLI_PROXY_COMMIT=main
CLI_PROXY_BUILD_DATE=2026-04-20
```

Pinned upstream release example:

```env
CLI_PROXY_BUILD_CONTEXT=https://github.com/router-for-me/CLIProxyAPI.git#v6.9.30
CLI_PROXY_LOCAL_IMAGE=cli-proxy-api:v6.9.30
CLI_PROXY_VERSION=v6.9.30
CLI_PROXY_COMMIT=v6.9.30
CLI_PROXY_BUILD_DATE=2026-04-20
```

This keeps the Web UI repository unchanged while letting you choose exactly which backend source is used in production.

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
2. If needed, update [.env](/c:/Users/amine/Desktop/Nouveau%20dossier/Cli-Proxy-API-Management-Center/.env) ports, build context, or build args.
3. For production, point `CLI_PROXY_BUILD_CONTEXT` to your fork or to a pinned Git tag/commit.
4. Start the stack with `docker compose up --build` or with `docker compose -f docker-compose.yml -f docker-compose.production.yml up --build -d`.
5. Open the UI and log in with the same management key.

## Notes

- The frontend does not hardcode the backend URL in the bundle. `APP_DEFAULT_API_BASE` is written to `app-config.js` when the container starts.
- In a browser, `cli-proxy-api` is not a valid hostname unless your DNS resolves it. The default value therefore points to `http://localhost:8317`.
- The backend service uses the backend `Dockerfile` referenced by `CLI_PROXY_BUILD_CONTEXT`, whether that is a local path or a Git repository URL.
- Both services include healthchecks, and `webui` waits until `cli-proxy-api` is healthy.
- The sample backend config keeps `disable-control-panel: true` because the UI is served by the separate `webui` container.
- Auth files persist in [docker/backend/auth](/c:/Users/amine/Desktop/Nouveau%20dossier/Cli-Proxy-API-Management-Center/docker/backend/auth).