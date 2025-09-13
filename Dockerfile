# Multi-stage Dockerfile for Frontbase
# Stage 1: Build React frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# Copy frontend package files
COPY package*.json ./
RUN npm ci

# Copy frontend source
COPY . .

# Build React SPA for builder
RUN npm run build

# Stage 2: Backend runtime
FROM node:20-alpine AS runtime

# Install necessary packages for better-sqlite3
RUN apk add --no-cache python3 make g++ sqlite

WORKDIR /app

# Copy backend package files and install dependencies
COPY server/package*.json ./
RUN npm install --omit=dev

# Copy backend source
COPY server ./

# Copy built frontend to serve as static files
COPY --from=frontend-builder /app/dist ./public

# Create data directories for persistence
RUN mkdir -p /app/data/uploads /app/data/exports

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S frontbase -u 1001

# Change ownership of app directory and data directories
RUN chown -R frontbase:nodejs /app
RUN chmod -R 755 /app/data

# Copy startup script
COPY server/scripts/start.sh /app/start.sh
RUN chmod +x /app/start.sh && chown frontbase:nodejs /app/start.sh

# Switch to non-root user
USER frontbase

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/project', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start server
CMD ["/app/start.sh"]