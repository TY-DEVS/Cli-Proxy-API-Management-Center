FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.29-alpine AS runtime

ENV APP_PORT=80
ENV APP_DEFAULT_API_BASE=

COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY docker/entrypoint/40-generate-app-config.sh /docker-entrypoint.d/40-generate-app-config.sh

USER root
RUN chmod +x /docker-entrypoint.d/40-generate-app-config.sh \
	&& chown -R nginx:nginx /usr/share/nginx/html /etc/nginx /docker-entrypoint.d

USER nginx

EXPOSE 80
