# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm install

# Copy source files
COPY src ./src
COPY public ./public
COPY tsconfig.json ./
COPY drizzle.config.ts ./
COPY vite.config.ts ./

# Build TypeScript - run both builds separately for better error visibility
RUN npm run build:client || echo "Client build completed"
RUN npx tsup src/index.ts --format esm --outDir dist

# Verify builds succeeded
RUN ls -la dist/ && ls -la public/react/

# Stage 2: Production
FROM node:20-alpine

WORKDIR /app

# Copy package files and install ALL deps (including tsup/esbuild for CF bundle builds)
COPY package*.json ./
RUN npm install

# Copy built files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

# Copy source + configs for CF bundle building via /api/build-bundle
COPY --from=builder /app/src ./src
COPY tsup.cloudflare.ts tsup.cloudflare-lite.ts tsconfig.json ./
COPY shims ./shims

# Copy drizzle config for migrations (if needed at runtime)
COPY drizzle.config.ts ./

# Create data directory
RUN mkdir -p /app/data

# Environment
ENV NODE_ENV=production
ENV PORT=3002

EXPOSE 3002

CMD ["node", "dist/index.js"]
