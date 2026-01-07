# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm install

# Copy source files
COPY src ./src
COPY tsconfig.json ./
COPY drizzle.config.ts ./

# Build TypeScript
RUN npm run build

# Stage 2: Production
FROM node:20-alpine

WORKDIR /app

# Copy package files and install production deps only
COPY package*.json ./
RUN npm install --production

# Copy built files
COPY --from=builder /app/dist ./dist

# Copy drizzle config for migrations (if needed at runtime)
COPY drizzle.config.ts ./

# Create data directory
RUN mkdir -p /app/data

# Environment
ENV NODE_ENV=production
ENV PORT=3002

EXPOSE 3002

CMD ["node", "dist/index.js"]
