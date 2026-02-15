#!/bin/bash
# ==============================================================================
# Frontbase Multi-Tenant Deployment Script (Smart Port Allocation)
# ==============================================================================
#
# This script deploys a new Frontbase tenant instance with automatic port
# allocation and service isolation. It scans for available ports and retries
# if ports are already in use.
#
# Usage:
#   ./scripts/deploy_tenant.sh <TENANT_NAME> [OPTIONS]
#
# Examples:
#   ./scripts/deploy_tenant.sh tenant1
#   ./scripts/deploy_tenant.sh tenant2 --database postgres
#   ./scripts/deploy_tenant.sh tenant3 --db-password mysecret
#
# ==============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Port ranges for each service
declare -A PORT_RANGES
PORT_RANGES=(
    ["backend"]="8000:8999"
    ["edge"]="3002:3999"
    ["frontend"]="8080:8999"
    ["redis-http"]="8079:8999"
)

# Function to check if port is in use
is_port_in_use() {
    local port=$1
    if netstat -an 2>/dev/null | grep -q ":$port " || netstat -an 2>/dev/null | grep -q ":$port " | grep -q LISTEN; then
        return 0
    fi
    return 1
}

# Function to scan for available port
find_available_port() {
    local service=$1
    local start_port=$2
    local end_port=$3

    echo -e "${BLUE}Scanning for available ${service} port in range ${start_port}-${end_port}...${NC}"

    for port in $(seq $start_port $end_port); do
        if ! is_port_in_use "$port"; then
            echo -e "${GREEN}✓ Available port found: ${port}${NC}"
            echo "$port"
            return 0
        fi
    done

    echo -e "${RED}✗ No available ports found in range ${start_port}-${end_port}${NC}"
    return 1
}

# Function to get available ports for all services
get_available_ports() {
    local service
    local range
    local start_port
    local end_port
    local port
    local ports_found=0
    declare -A ports

    for service in "${!PORT_RANGES[@]}"; do
        range="${PORT_RANGES[$service]}"
        start_port=$(echo $range | cut -d: -f1)
        end_port=$(echo $range | cut -d: -f2)

        port=$(find_available_port "$service" "$start_port" "$end_port")

        if [ $? -eq 0 ]; then
            ports[$service]=$port
            ports_found=1
        else
            echo -e "${RED}Failed to find available port for ${service}${NC}"
            return 1
        fi
    done

    echo "${ports[@]}"
    return 0
}

# Default values
TENANT_NAME=${1:-tenant}
DATABASE_TYPE=${DATABASE_TYPE:-sqlite}
DB_PASSWORD=${DB_PASSWORD:-}
REDIS_TOKEN=${REDIS_TOKEN:-}
COMPOSE_PROJECT_NAME=""
MAX_RETRIES=3
RETRY_DELAY=2

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
        --max-retries)
            MAX_RETRIES="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 <TENANT_NAME> [OPTIONS]"
            echo ""
            echo "Arguments:"
            echo "  TENANT_NAME  Tenant name (string, used for project name)"
            echo ""
            echo "Options:"
            echo "  --database TYPE  Database type: sqlite (default) or postgres"
            echo "  --db-password    Database password (auto-generated if not provided)"
            echo "  --redis-token    Redis HTTP token (auto-generated if not provided)"
            echo "  --project-name   Custom Docker Compose project name"
            echo "  --max-retries    Maximum retry attempts (default: 3)"
            echo ""
            echo "Examples:"
            echo "  $0 tenant1"
            echo "  $0 tenant2 --database postgres"
            echo "  $0 tenant3 --db-password mysecret"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Validate input
if [[ -z "$TENANT_NAME" ]]; then
    echo -e "${RED}Error: TENANT_NAME is required${NC}"
    echo "Usage: $0 <TENANT_NAME> [OPTIONS]"
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

# Set project name
if [[ -z "$COMPOSE_PROJECT_NAME" ]]; then
    COMPOSE_PROJECT_NAME="${TENANT_NAME}_frontbase"
fi

# Environment file path
ENV_FILE=".env.${TENANT_NAME}"

# Function to deploy with retry logic
deploy_with_retry() {
    local attempt=1
    local max_attempts=$1
    shift

    while [[ $attempt -le $max_attempts ]]; do
        echo ""
        echo -e "${BLUE}========================================${NC}"
        echo -e "${BLUE}  Deployment Attempt ${attempt}/${max_attempts}${NC}"
        echo -e "${BLUE}========================================${NC}"
        echo ""

        if docker-compose -p ${COMPOSE_PROJECT_NAME} -f docker-compose.yml --env-file ${ENV_FILE} "$@" up -d; then
            return 0
        fi

        if [[ $attempt -lt $max_attempts ]]; then
            echo -e "${YELLOW}Attempt ${attempt} failed. Retrying in ${RETRY_DELAY}s...${NC}"
            sleep $RETRY_DELAY
        fi

        attempt=$((attempt + 1))
    done

    return 1
}

# Main deployment loop
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Frontbase Tenant Deployment${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "Tenant Name:    ${GREEN}${TENANT_NAME}${NC}"
echo -e "Project Name:   ${GREEN}${COMPOSE_PROJECT_NAME}${NC}"
echo -e "Max Retries:    ${GREEN}${MAX_RETRIES}${NC}"
echo ""

# Loop until deployment succeeds
while true; do
    # Get available ports
    echo -e "${BLUE}Scanning for available ports...${NC}"
    IFS=' ' read -r -a PORTS <<< "$(get_available_ports)"
    unset IFS

    BACKEND_PORT="${PORTS[0]}"
    EDGE_PORT="${PORTS[1]}"
    FRONTEND_PORT="${PORTS[2]}"
    REDIS_HTTP_PORT="${PORTS[3]}"

    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  Port Allocation Summary${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    echo -e "Backend:      ${GREEN}${BACKEND_PORT}${NC}"
    echo -e "Edge Engine:  ${GREEN}${EDGE_PORT}${NC}"
    echo -e "Frontend:     ${GREEN}${FRONTEND_PORT}${NC}"
    echo -e "Redis HTTP:   ${GREEN}${REDIS_HTTP_PORT}${NC}"
    echo ""

    # Create environment file
    cat > ${ENV_FILE} << EOF
# ==============================================================================
# Frontbase Tenant Environment Configuration
# ==============================================================================
# Generated: $(date)
# Tenant: ${TENANT_NAME}
# ==============================================================================

TENANT_ID=$(date +%s)
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

    echo -e "${BLUE}Environment file: ${GREEN}${ENV_FILE}${NC}"
    echo ""

    # Try deployment
    if deploy_with_retry $MAX_RETRIES; then
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
        break
    else
        echo ""
        echo -e "${RED}========================================${NC}"
        echo -e "${RED}  ✗ Deployment Failed After ${MAX_RETRIES} Attempts${NC}"
        echo -e "${RED}========================================${NC}"
        echo ""
        echo -e "${YELLOW}Tip: Try cleaning up existing tenants:${NC}"
        echo -e "  ./scripts/cleanup_tenant.sh ${TENANT_NAME}"
        echo ""
        echo -e "Or check what's using the ports:"
        echo -e "  netstat -an | grep LISTEN"
        echo ""
        exit 1
    fi
done

# Cleanup symlink
rm -f .env
