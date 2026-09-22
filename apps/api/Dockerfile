FROM node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS base
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json

FROM base AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
RUN npm ci --no-fund
COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY apps/api apps/api
COPY data data
RUN npm run db:generate -w apps/api && npm run build -w packages/contracts && npm run build -w apps/api

FROM base AS dependencies
RUN npm ci --omit=dev --workspace=apps/api --workspace=packages/contracts --no-fund

FROM node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=dependencies --chown=node:node /app /app
COPY --from=build --chown=node:node /app/apps/api/dist apps/api/dist
COPY --from=build --chown=node:node /app/packages/contracts/dist packages/contracts/dist
USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
