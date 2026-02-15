#!/bin/bash
# ==============================================================================
# Generate docker-compose.override.yml for Easypanel
# ==============================================================================
#
# This script automatically finds available ports and generates
# a docker-compose.override.yml file with the correct port values.
#
# Usage:
#   ./scripts/generate-easypanel-override.sh
#
# ==============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Port ranges
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

# Function to find available port
find_available_port() {
    local service=$1
    local start_port=$2
    local end_port=$3

    for port in $(seq $start_port $end_port); do
        if ! is_port_in_use "$port"; then
            echo "$port"
            return 0
        fi
    done

    echo -e "${RED}No available ports found in range ${start_port}-${end_port}${NC}"
    exit 1
}

# Main function
main() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  Generate docker-compose.override.yml${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""

    declare -A ports

    # Find available ports
    for service in "${!PORT_RANGES[@]}"; do
        range="${PORT_RANGES[$service]}"
        start_port=$(echo $range | cut -d: -f1)
        end_port=$(echo $range | cut -d: -f2)

        port=$(find_available_port "$service" "$start_port" "$end_port")
        ports[$service]=$port
    done

    echo -e "${BLUE}Available ports found:${NC}"
    echo -e "  Backend:      ${GREEN}${ports[backend]}${NC}"
    echo -e "  Edge Engine:  ${GREEN}${ports[edge]}${NC}"
    echo -e "  Frontend:     ${GREEN}${ports[frontend]}${NC}"
    echo -e "  Redis HTTP:   ${GREEN}${ports[redis-http]}${NC}"
    echo ""

    # Create docker-compose.override.yml
    cat > docker-compose.override.yml << EOF
version: '3.8'

services:
  backend:
    ports:
      - "${ports[backend]}:8000"
    environment:
      - BACKEND_PORT=${ports[backend]}

  edge:
    expose:
      - "${ports[edge]}"
    environment:
      - EDGE_PORT=${ports[edge]}
      - PORT=${ports[edge]}

  frontend:
    ports:
      - "${ports[frontend]}:80"
    environment:
      - FRONTEND_PORT=${ports[frontend]}

  redis-http:
    ports:
      - "${ports[redis-http]}:80"
EOF

    echo -e "${GREEN}✓ docker-compose.override.yml created${NC}"
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  Next Steps${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    echo -e "1. Save this file in your Easypanel project directory"
    echo -e "2. Redeploy in Easypanel"
    echo ""
    echo -e "${YELLOW}To revert:${NC}"
    echo -e "  rm docker-compose.override.yml"
    echo ""
}

main "$@"
