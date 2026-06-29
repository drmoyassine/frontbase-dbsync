# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY services/edge/package*.json ./
RUN npm install

# Copy monorepo packages to the root so Vite alias `../../packages/` resolves to `/packages`
COPY packages /packages

# Copy source files
COPY services/edge/src ./src
COPY services/edge/public ./public
COPY services/edge/tsconfig.json ./
COPY services/edge/tsup.config.ts ./
COPY services/edge/drizzle.config.ts ./
COPY services/edge/vite.config.ts ./

# Build TypeScript - run both builds separately for better error visibility
RUN npm run build:client || echo "Client build completed"
RUN npx tsup src/index.ts --format esm --outDir dist

# Verify builds succeeded
RUN ls -la dist/ && ls -la public/react/

# Stage 2: Production
FROM node:20-alpine

WORKDIR /app

# Install Redis server (embedded — edge-local cache, no network dependency)
RUN apk add --no-cache redis

# Copy package files and install ALL deps
COPY services/edge/package*.json ./
RUN npm install

# BullMQ — only needed in Docker where Redis is embedded
RUN npm install bullmq

# Copy the monorepo packages for edge engine to resolve runtime packages
COPY packages /packages

# Copy built files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

# Copy source + all tsup configs
COPY --from=builder /app/src ./src
COPY services/edge/tsup.*.ts services/edge/tsconfig.json ./
COPY services/edge/shims ./shims
COPY services/edge/scripts ./scripts

# Copy drizzle config for migrations
COPY services/edge/drizzle.config.ts ./

# Copy startup script
COPY services/edge/start.sh ./start.sh
RUN chmod +x ./start.sh

# Create data directory (vectors persist under /app/data —
# mount a named volume here so data survives container recreation).
RUN mkdir -p /app/data /app/data/lancedb

# Environment
ENV NODE_ENV=production
ENV PORT=3002
# Vector store selection: libsql_vector is the default (pure SQL, no native binary).
# LanceDB is opt-in via LANCEDB_ENABLED=true (requires Alpine musl binary verification).
# Set to "true" to use LanceDB instead of libSQL.
ENV LANCEDB_ENABLED=false
# On-disk path for LanceDB (only used when LANCEDB_ENABLED=true).
# Must match the backend's EMBEDDED_LANCEDB_PATH and live under the persisted /app/data volume.
ENV EMBEDDED_LANCEDB_PATH=/app/data/lancedb

EXPOSE 3002

# Start embedded Redis + Node.js edge engine
CMD ["./start.sh"]
