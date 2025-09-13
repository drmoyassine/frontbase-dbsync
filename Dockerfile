# Multi-stage Dockerfile for Frontbase
# Stage 1: Build React frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# Install system dependencies needed for build
RUN echo "📦 Installing system dependencies..." && \
    apk add --no-cache git && \
    echo "✅ System dependencies installed"

# Copy package files first for better caching
COPY package*.json ./
COPY vite.config.ts tsconfig*.json tailwind.config.ts postcss.config.js components.json ./

# Debug: Verify all config files are present
RUN echo "🔍 Verifying config files..." && \
    ls -la && \
    test -f package.json && echo "✅ package.json exists" || (echo "❌ package.json missing" && exit 1) && \
    test -f vite.config.ts && echo "✅ vite.config.ts exists" || (echo "❌ vite.config.ts missing" && exit 1) && \
    test -f tsconfig.json && echo "✅ tsconfig.json exists" || (echo "❌ tsconfig.json missing" && exit 1) && \
    echo "✅ All config files verified"

# Install ALL dependencies (including devDependencies needed for build)
RUN echo "📦 Installing frontend dependencies..." && \
    NODE_ENV=development npm ci --verbose && \
    echo "✅ Frontend dependencies installed" && \
    echo "📂 node_modules check:" && \
    ls -la node_modules/ | head -5 && \
    npm list typescript vite @vitejs/plugin-react-swc --depth=0 && \
    echo "✅ Build tools verified"

# Copy all source files
COPY src ./src
COPY public ./public
COPY index.html ./

# Debug: Verify source files are present
RUN echo "🔍 Verifying source files..." && \
    ls -la && \
    test -d src && echo "✅ src directory exists" || (echo "❌ src directory missing" && exit 1) && \
    test -f index.html && echo "✅ index.html exists" || (echo "❌ index.html missing" && exit 1) && \
    test -f src/main.tsx && echo "✅ src/main.tsx exists" || (echo "❌ src/main.tsx missing" && exit 1) && \
    echo "✅ All source files verified"

# Set environment variables for build
ENV NODE_ENV=production
ENV VITE_ENVIRONMENT=production

# Build React SPA with comprehensive error handling
RUN echo "🏗️  Building frontend..." && \
    npm run build 2>&1 | tee build.log && \
    if [ $? -eq 0 ]; then \
        echo "✅ Frontend build successful"; \
    else \
        echo "❌ Frontend build failed - displaying logs:"; \
        cat build.log; \
        exit 1; \
    fi

# Verify build output exists and create fallback if needed
RUN if [ -d "dist" ]; then \
        echo "✅ Build directory exists"; \
        echo "📂 Build output:"; \
        ls -la dist/; \
        echo "📏 Build size:"; \
        du -sh dist/; \
        echo "📄 Build files:"; \
        find dist -type f | head -10; \
    else \
        echo "❌ Build directory missing - creating fallback"; \
        mkdir -p dist; \
        echo "<!DOCTYPE html><html><head><title>Build Error</title></head><body><h1>Frontend build failed</h1></body></html>" > dist/index.html; \
        exit 1; \
    fi

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