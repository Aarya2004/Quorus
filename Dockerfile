# syntax=docker/dockerfile:1

# --- build stage: install deps with Bun, bundle with esbuild ---
FROM oven/bun:1.3.10 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY tsconfig.json ./
COPY src ./src
RUN bun run build

# --- runtime stage: Node 24 running the bundle ---
FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8787
ENV QUORUS_DB_PATH=/data/quorus.db
# Production deps only — bundle keeps imports external, so runtime needs them.
COPY package.json bun.lock ./
COPY --from=build /usr/local/bin/bun /usr/local/bin/bun
RUN bun install --frozen-lockfile --production
COPY --from=build /app/dist ./dist
EXPOSE 8787
CMD ["node", "dist/index.js"]
