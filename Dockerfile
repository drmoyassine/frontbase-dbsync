# Multi-stage build for Frontbase
FROM node:20-alpine AS builder

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the frontend
RUN npm run build

# Production stage
FROM node:20-alpine AS runtime

# Install runtime dependencies for native modules
RUN apk add --no-cache python3 make g++

# Create app directory
WORKDIR /app

# Create data directory for persistence
RUN mkdir -p /app/data/uploads

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci && npm cache clean --force

# Copy built frontend from builder stage
COPY --from=builder /app/dist ./dist

# Copy server code
COPY server ./server

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S frontbase -u 1001

# Set environment variables with defaults
ENV NODE_ENV=production
ENV JWT_SECRET=your-super-secret-jwt-key-change-in-production
ENV PORT=3000

# Change ownership of app directory to nodejs user
RUN chown -R frontbase:nodejs /app

# Switch to non-root user
USER frontbase

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Start the application
CMD ["node", "server/index.js"]