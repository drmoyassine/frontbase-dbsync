FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
  gcc \
  libpq-dev \
  default-libmysqlclient-dev \
  curl \
  sqlite3 \
  dos2unix \
  && rm -rf /var/lib/apt/lists/*

# Copy requirements first for caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Copy entrypoint script and make executable
COPY docker_entrypoint.sh /usr/local/bin/
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
