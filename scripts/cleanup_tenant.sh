#!/bin/bash
# ==============================================================================
# Frontbase Tenant Cleanup Script
# ==============================================================================
#
# This script stops and removes a tenant's Docker containers, volumes, and
# environment files.
#
# Usage:
#   ./scripts/cleanup_tenant.sh <TENANT_NAME> [OPTIONS]
#
# Examples:
#   ./scripts/cleanup_tenant.sh tenant1
#   ./scripts/cleanup_tenant.sh tenant1 --remove-volumes
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
TENANT_NAME=${1:-tenant}
REMOVE_VOLUMES=false
DRY_RUN=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --remove-volumes)
            REMOVE_VOLUMES=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --help)
            echo "Usage: $0 <TENANT_NAME> [OPTIONS]"
            echo ""
            echo "Arguments:"
            echo "  TENANT_NAME  Tenant name (string, used for project name)"
            echo ""
            echo "Options:"
            echo "  --remove-volumes  Remove volumes (containers and volumes)"
            echo "  --dry-run         Show what would be done without executing"
            echo ""
            echo "Examples:"
            echo "  $0 tenant1"
            echo "  $0 tenant1 --remove-volumes"
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

# Set project name
COMPOSE_PROJECT_NAME="${TENANT_NAME}_frontbase"
ENV_FILE=".env.${TENANT_NAME}"

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Frontbase Tenant Cleanup${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "Tenant Name:    ${YELLOW}${TENANT_NAME}${NC}"
echo -e "Project Name:   ${YELLOW}${COMPOSE_PROJECT_NAME}${NC}"
echo -e "Remove Volumes: ${YELLOW}${REMOVE_VOLUMES}${NC}"
echo ""

# Check if tenant is running
if docker-compose -p ${COMPOSE_PROJECT_NAME} -f docker-compose.yml ps > /dev/null 2>&1; then
    echo -e "${BLUE}Stopping containers...${NC}"
    if [[ "$DRY_RUN" == false ]]; then
        docker-compose -p ${COMPOSE_PROJECT_NAME} -f docker-compose.yml down
    else
        echo "  [DRY RUN] docker-compose -p ${COMPOSE_PROJECT_NAME} -f docker-compose.yml down"
    fi
    echo -e "${GREEN}✓ Containers stopped${NC}"
    echo ""
fi

# Remove volumes if requested
if [[ "$REMOVE_VOLUMES" == true ]]; then
    echo -e "${BLUE}Removing volumes...${NC}"
    if [[ "$DRY_RUN" == false ]]; then
        docker-compose -p ${COMPOSE_PROJECT_NAME} -f docker-compose.yml down -v
    else
        echo "  [DRY RUN] docker-compose -p ${COMPOSE_PROJECT_NAME} -f docker-compose.yml down -v"
    fi
    echo -e "${GREEN}✓ Volumes removed${NC}"
    echo ""
fi

# Remove environment file
if [[ -f "${ENV_FILE}" ]]; then
    echo -e "${BLUE}Removing environment file...${NC}"
    if [[ "$DRY_RUN" == false ]]; then
        rm -f ${ENV_FILE}
    else
        echo "  [DRY RUN] rm -f ${ENV_FILE}"
    fi
    echo -e "${GREEN}✓ Environment file removed${NC}"
    echo ""
else
    echo -e "${YELLOW}Environment file not found: ${ENV_FILE}${NC}"
    echo ""
fi

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  ✓ Cleanup Complete${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Tenant ${TENANT_NAME} has been removed."
echo ""
