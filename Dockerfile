FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runtime

ENV APP_PORT=80
ENV APP_DEFAULT_API_BASE=

COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY docker/entrypoint/40-generate-app-config.sh /docker-entrypoint.d/40-generate-app-config.sh

RUN chmod +x /docker-entrypoint.d/40-generate-app-config.sh

EXPOSE 80
