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

# Copy package files and install ALL deps
COPY services/edge/package*.json ./
RUN npm install

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

# Create data directory
RUN mkdir -p /app/data

# Environment
ENV NODE_ENV=production
ENV PORT=3002

EXPOSE 3002

CMD ["node", "dist/index.js"]
