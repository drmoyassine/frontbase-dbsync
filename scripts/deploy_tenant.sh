#!/bin/bash
# ==============================================================================
# Frontbase Multi-Tenant Deployment Script
# ==============================================================================
#
# This script deploys a new Frontbase tenant instance with automatic port
# allocation and service isolation.
#
# Usage:
#   ./scripts/deploy_tenant.sh <TENANT_ID> <TENANT_NAME> [OPTIONS]
#
# Examples:
#   ./scripts/deploy_tenant.sh 1 tenant1
#   ./scripts/deploy_tenant.sh 2 tenant2 --database postgres
#   ./scripts/deploy_tenant.sh 3 tenant3 --db-password mysecret
#
# ==============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
TENANT_ID=${1:-1}
TENANT_NAME=${2:-tenant}
DATABASE_TYPE=${DATABASE_TYPE:-sqlite}
DB_PASSWORD=${DB_PASSWORD:-}
REDIS_TOKEN=${REDIS_TOKEN:-}
COMPOSE_PROJECT_NAME=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --database)
            DATABASE_TYPE="$2"
            shift 2
            ;;
        --db-password)
            DB_PASSWORD="$2"
            shift 2
            ;;
        --redis-token)
            REDIS_TOKEN="$2"
            shift 2
            ;;
        --project-name)
            COMPOSE_PROJECT_NAME="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 <TENANT_ID> <TENANT_NAME> [OPTIONS]"
            echo ""
            echo "Arguments:"
            echo "  TENANT_ID        Tenant identifier (number)"
            echo "  TENANT_NAME      Tenant name (string, used for project name)"
            echo ""
            echo "Options:"
            echo "  --database TYPE  Database type: sqlite (default) or postgres"
            echo "  --db-password    Database password (auto-generated if not provided)"
            echo "  --redis-token    Redis HTTP token (auto-generated if not provided)"
            echo "  --project-name   Custom Docker Compose project name"
            echo ""
            echo "Examples:"
            echo "  $0 1 tenant1"
            echo "  $0 2 tenant2 --database postgres"
            echo "  $0 3 tenant3 --db-password mysecret"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Validate inputs
if [[ -z "$TENANT_ID" ]] || [[ -z "$TENANT_NAME" ]]; then
    echo -e "${RED}Error: TENANT_ID and TENANT_NAME are required${NC}"
    echo "Usage: $0 <TENANT_ID> <TENANT_NAME> [OPTIONS]"
    exit 1
fi

# Generate secure passwords if not provided
if [[ -z "$DB_PASSWORD" ]]; then
    DB_PASSWORD=$(openssl rand -base64 16)
    echo -e "${YELLOW}Generated database password (save this securely!)${NC}"
fi

if [[ -z "$REDIS_TOKEN" ]]; then
    REDIS_TOKEN=$(openssl rand -base64 32)
    echo -e "${YELLOW}Generated Redis token (save this securely!)${NC}"
fi

# Port allocation (sequential)
BACKEND_PORT=$((8000 + TENANT_ID))
EDGE_PORT=$((3002 + TENANT_ID))
FRONTEND_PORT=$((8080 + TENANT_ID))
REDIS_HTTP_PORT=$((8079 + TENANT_ID))

# Set project name
if [[ -z "$COMPOSE_PROJECT_NAME" ]]; then
    COMPOSE_PROJECT_NAME="${TENANT_NAME}_frontbase"
fi

# Environment file path
ENV_FILE=".env.${TENANT_NAME}"

# Create environment file
cat > ${ENV_FILE} << EOF
# ==============================================================================
# Frontbase Tenant Environment Configuration
# ==============================================================================
# Generated: $(date)
# Tenant: ${TENANT_NAME}
# ==============================================================================

TENANT_ID=${TENANT_ID}
TENANT_NAME=${TENANT_NAME}
COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME}

# Port Configuration
BACKEND_PORT=${BACKEND_PORT}
EDGE_PORT=${EDGE_PORT}
FRONTEND_PORT=${FRONTEND_PORT}
REDIS_HTTP_PORT=${REDIS_HTTP_PORT}

# Database Configuration
DATABASE_TYPE=${DATABASE_TYPE}
DATABASE_URL=sqlite+aiosqlite:////app/data/frontbase.db

# Security
SECRET_KEY=$(openssl rand -hex 32)
CORS_ORIGINS=*
ADMIN_EMAIL=admin@${TENANT_NAME}.example.com
ADMIN_PASSWORD=${DB_PASSWORD}
ENVIRONMENT=production
ALLOW_REGISTRATION=false

# Redis
REDIS_TOKEN=${REDIS_TOKEN}

# ==============================================================================
# Access URLs:
#   Frontend:  http://localhost:${FRONTEND_PORT}
#   Backend:   http://localhost:${BACKEND_PORT}
#   Edge:      http://localhost:${EDGE_PORT}
# ==============================================================================
EOF

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Frontbase Tenant Deployment${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "Tenant ID:      ${GREEN}${TENANT_ID}${NC}"
echo -e "Tenant Name:    ${GREEN}${TENANT_NAME}${NC}"
echo -e "Project Name:   ${GREEN}${COMPOSE_PROJECT_NAME}${NC}"
echo ""
echo -e "Port Allocation:"
echo -e "  Backend:      ${GREEN}${BACKEND_PORT}${NC}"
echo -e "  Edge Engine:  ${GREEN}${EDGE_PORT}${NC}"
echo -e "  Frontend:     ${GREEN}${FRONTEND_PORT}${NC}"
echo -e "  Redis HTTP:   ${GREEN}${REDIS_HTTP_PORT}${NC}"
echo ""
echo -e "Database:       ${GREEN}${DATABASE_TYPE}${NC}"
echo ""
echo -e "Environment file: ${GREEN}${ENV_FILE}${NC}"
echo ""

# Create .env file symlink for docker-compose
ln -sf ${ENV_FILE} .env

# Deploy using docker-compose
echo -e "${BLUE}Deploying tenant...${NC}"
echo ""

if docker-compose -p ${COMPOSE_PROJECT_NAME} -f docker-compose.yml --env-file ${ENV_FILE} up -d; then
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  ✓ Deployment Successful!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "Access URLs:"
    echo -e "  Frontend:  http://localhost:${FRONTEND_PORT}"
    echo -e "  Backend:   http://localhost:${BACKEND_PORT}"
    echo -e "  Edge:      http://localhost:${EDGE_PORT}"
    echo ""
    echo -e "Management:"
    echo -e "  View logs:  docker-compose -p ${COMPOSE_PROJECT_NAME} -f docker-compose.yml logs -f"
    echo -e "  Stop:       docker-compose -p ${COMPOSE_PROJECT_NAME} -f docker-compose.yml down"
    echo -e "  Restart:    docker-compose -p ${COMPOSE_PROJECT_NAME} -f docker-compose.yml restart"
    echo ""
    echo -e "Environment file saved to: ${ENV_FILE}"
    echo -e "Save this file securely - it contains sensitive credentials!"
    echo ""
else
    echo ""
    echo -e "${RED}========================================${NC}"
    echo -e "${RED}  ✗ Deployment Failed${NC}"
    echo -e "${RED}========================================${NC}"
    echo ""
    echo -e "Please check the error messages above."
    echo -e "Common issues:"
    echo -e "  - Port already in use: Try a different TENANT_ID"
    echo -e "  - Docker not running: Start Docker Desktop"
    echo -e "  - Permission denied: Run with sudo or add to docker group"
    echo ""
    exit 1
fi

# Cleanup symlink
rm -f .env
