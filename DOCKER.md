# Docker

This project provides a two-container stack:

- `cli-proxy-api`: the backend management/API server
- `webui`: this React/Vite management UI served by Nginx

## Files

- Environment: [.env](/c:/Users/amine/Desktop/Nouveau%20dossier/Cli-Proxy-API-Management-Center/.env)
- Compose stack: [docker-compose.yml](/c:/Users/amine/Desktop/Nouveau%20dossier/Cli-Proxy-API-Management-Center/docker-compose.yml)
- Backend config sample: [docker/backend/config.yaml](/c:/Users/amine/Desktop/Nouveau%20dossier/Cli-Proxy-API-Management-Center/docker/backend/config.yaml)

## Main variables

- `CLI_PROXY_BUILD_CONTEXT`: path to your local CLI Proxy API repository
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

## Start

```bash
docker compose up --build
```

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
3. Start the stack with `docker compose up --build`.
4. Open the UI and log in with the same management key.

## Notes

- The frontend does not hardcode the backend URL in the bundle. `APP_DEFAULT_API_BASE` is written to `app-config.js` when the container starts.
- In a browser, `cli-proxy-api` is not a valid hostname unless your DNS resolves it. The default value therefore points to `http://localhost:8317`.
- The backend service uses your local backend `Dockerfile` through `CLI_PROXY_BUILD_CONTEXT`.
- Both services include healthchecks, and `webui` waits until `cli-proxy-api` is healthy.
- The sample backend config keeps `disable-control-panel: true` because the UI is served by the separate `webui` container.
- Auth files persist in [docker/backend/auth](/c:/Users/amine/Desktop/Nouveau%20dossier/Cli-Proxy-API-Management-Center/docker/backend/auth).