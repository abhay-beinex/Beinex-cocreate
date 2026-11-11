# Co-Create release image: builds the app pointed at its own proxy, then runs server/proxy.mjs,
# which serves dist/ with security headers and holds the model key (see SECURITY.md).
# The key is never a build arg; it is passed at runtime as OPENROUTER_API_KEY.

FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Release build: model calls go to /api/v1 on the same origin; no key in the bundle.
ARG VITE_PROXY_TOKEN=""
ENV VITE_MODEL_API_BASE=/api/v1 \
    VITE_PROXY_TOKEN=$VITE_PROXY_TOKEN \
    VITE_OPENROUTER_API_KEY=""
RUN npm run build \
 && if grep -rq "sk-or-" dist; then echo "Model key found in bundle; refusing to ship" >&2; exit 1; fi

FROM node:20-alpine
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node server ./server
USER node
EXPOSE 8080
CMD ["node", "server/proxy.mjs"]
