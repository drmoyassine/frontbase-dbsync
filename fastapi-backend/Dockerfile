FROM python:3.11-slim

WORKDIR /app

# Install system dependencies + Node.js (needed for Netlify CLI)
RUN apt-get update && apt-get install -y \
  gcc \
  libpq-dev \
  default-libmysqlclient-dev \
  curl \
  sqlite3 \
  dos2unix \
  && rm -rf /var/lib/apt/lists/*

# Install Node.js (required for Netlify CLI edge function bundling)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
  && apt-get install -y nodejs \
  && rm -rf /var/lib/apt/lists/*

# Cloud edition: pre-install Netlify CLI for instant deploys
# Community edition: CLI is lazy-installed on first Netlify provider connect
ARG FRONTBASE_EDITION=cloud
RUN if [ "$FRONTBASE_EDITION" = "cloud" ]; then \
      npm install -g netlify-cli && echo "[Docker] Netlify CLI pre-installed"; \
    fi
ENV FRONTBASE_EDITION=${FRONTBASE_EDITION}

# Install Standalone Tailwind CSS CLI (for build-time CSS generation)
RUN curl -sLO https://github.com/tailwindlabs/tailwindcss/releases/latest/download/tailwindcss-linux-x64 \
  && chmod +x tailwindcss-linux-x64 \
  && mv tailwindcss-linux-x64 /usr/local/bin/tailwindcss

# Copy requirements first for caching (build context is monorepo root)
COPY fastapi-backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY fastapi-backend/ .

# Copy Edge source files (both SSR and Hydration components)
# for Tailwind CSS class scanning
COPY services/edge/src/ /app/edge-source/

# Copy shared UI packages (e.g. @frontbase/datatable) for Tailwind scanning
COPY packages/ /app/packages/

# Copy entrypoint script and make executable
COPY fastapi-backend/docker_entrypoint.sh /usr/local/bin/
RUN dos2unix /usr/local/bin/docker_entrypoint.sh && chmod +x /usr/local/bin/docker_entrypoint.sh

# Create data directory
RUN mkdir -p /app/data

# Environment variables
ENV PYTHONUNBUFFERED=1
ENV DATABASE_URL=sqlite+aiosqlite:///./data/unified.db

# Expose port
EXPOSE 8000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

# Run entrypoint script
CMD ["docker_entrypoint.sh"]

