FROM node:24-bookworm-slim AS builder

RUN npm install --global npm@11.19.1
WORKDIR /app
RUN apt-get update && \
    apt-get install --yes --no-install-recommends openssl && \
    rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci && npm ls --all

COPY apps/api apps/api
COPY packages/config packages/config
COPY packages/db packages/db
COPY packages/shared packages/shared
RUN npm run db:generate && \
    npm run build -w @real-estate/db && \
    npm run build -w @real-estate/api

FROM node:24-bookworm-slim AS production-dependencies

RUN npm install --global npm@11.19.1
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --omit=dev --ignore-scripts --workspace @real-estate/api --include-workspace-root=false && \
    npm cache clean --force

FROM node:24-bookworm-slim AS runner

ENV NODE_ENV=production
WORKDIR /app
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nestjs

COPY --from=production-dependencies --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=nestjs:nodejs /app/packages/db/package.json ./packages/db/package.json
COPY --from=builder --chown=nestjs:nodejs /app/packages/db/dist ./packages/db/dist

USER nestjs
EXPOSE 4000
WORKDIR /app/apps/api
CMD ["node", "dist/main.js"]
