# Multi-stage Dockerfile for Frontbase
# Stage 1: Build React frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# Copy frontend package files
COPY package*.json ./

# Install frontend dependencies with detailed logging
RUN echo "📦 Installing frontend dependencies..." && \
    npm ci --verbose && \
    echo "✅ Frontend dependencies installed"

# Copy frontend source
COPY . .

# Build React SPA for builder with verification
RUN echo "🏗️  Building frontend..." && \
    npm run build && \
    echo "✅ Frontend build complete" && \
    echo "📂 Build output:" && \
    ls -la dist/ && \
    echo "📏 Build size:" && \
    du -sh dist/

# Stage 2: Backend runtime
FROM node:20-alpine AS runtime

# Install necessary packages for better-sqlite3 and debugging tools
RUN echo "📦 Installing system dependencies..." && \
    apk add --no-cache python3 make g++ sqlite curl bash && \
    echo "✅ System dependencies installed"

WORKDIR /app

# Copy backend package files and install dependencies
COPY server/package*.json ./

# Install backend dependencies with detailed logging
RUN echo "📦 Installing backend dependencies..." && \
    npm install --omit=dev --verbose && \
    echo "✅ Backend dependencies installed" && \
    echo "📂 node_modules structure:" && \
    ls -la node_modules/ | head -10

# Copy backend source with verification
COPY server ./
RUN echo "📂 Server files copied:" && \
    find . -name "*.js" | head -10 && \
    echo "✅ Backend source copied"

# Copy built frontend to serve as static files
COPY --from=frontend-builder /app/dist ./server/public
RUN echo "📂 Frontend files copied to server/public:" && \
    ls -la server/public/ && \
    echo "✅ Frontend files copied"

# Create data directories for persistence with proper permissions
RUN echo "📁 Creating data directories..." && \
    mkdir -p /app/data/uploads /app/data/exports && \
    chmod -R 755 /app/data && \
    echo "✅ Data directories created"

# Create non-root user for security
RUN echo "👤 Creating user..." && \
    addgroup -g 1001 -S nodejs && \
    adduser -S frontbase -u 1001 && \
    echo "✅ User created"

# Change ownership of app directory and data directories
RUN echo "🔐 Setting permissions..." && \
    chown -R frontbase:nodejs /app && \
    chmod -R 755 /app/data && \
    echo "✅ Permissions set"

# Copy startup script with verification
COPY server/scripts/start.sh /app/start.sh
RUN echo "📋 Setting up startup script..." && \
    chmod +x /app/start.sh && \
    chown frontbase:nodejs /app/start.sh && \
    echo "✅ Startup script ready" && \
    echo "📄 Startup script content preview:" && \
    head -10 /app/start.sh

# Verify critical files exist before switching user
RUN echo "🔍 Final verification of files:" && \
    test -f /app/index.js && echo "✅ index.js exists" || (echo "❌ index.js missing" && exit 1) && \
    test -f /app/database/init.js && echo "✅ database/init.js exists" || (echo "❌ database/init.js missing" && exit 1) && \
    test -f /app/database/schema.sql && echo "✅ database/schema.sql exists" || (echo "❌ database/schema.sql missing" && exit 1) && \
    test -f /app/utils/db.js && echo "✅ utils/db.js exists" || (echo "❌ utils/db.js missing" && exit 1) && \
    test -f /app/ssr/renderer.js && echo "✅ ssr/renderer.js exists" || (echo "❌ ssr/renderer.js missing" && exit 1) && \
    test -f /app/styleUtils.js && echo "✅ styleUtils.js exists" || (echo "❌ styleUtils.js missing" && exit 1) && \
    echo "✅ All critical files verified"

# Switch to non-root user
USER frontbase

# Expose port
EXPOSE 3000

# Enhanced health check with more specific endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start server
CMD ["/app/start.sh"]