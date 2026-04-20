#!/bin/sh
set -eu

CONFIG_PATH="/usr/share/nginx/html/app-config.js"
ESCAPED_API_BASE=$(printf '%s' "${APP_DEFAULT_API_BASE}" | sed 's/\\/\\\\/g; s/"/\\"/g')

cat <<EOF > "$CONFIG_PATH"
window.__APP_CONFIG__ = {
  defaultApiBase: "${ESCAPED_API_BASE}",
  enabledOAuthProviders: ["codex", "anthropic", "antigravity", "gemini-cli", "kimi", "qwen", "amazon"]
};
EOF