#!/bin/bash
# ==============================================================================
# Port Scanner for Multi-Tenant Deployment
# ==============================================================================
#
# This script scans for available ports and finds the next available port
# for each service type within specified ranges.
#
# Usage:
#   ./scripts/port-scanner.sh
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
    if netstat -an | grep -q ":$port " || netstat -an | grep -q ":$port " | grep -q LISTEN; then
        return 0  # Port is in use
    fi
    return 1  # Port is available
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

# Main function
main() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  Port Scanner for Multi-Tenant${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""

    declare -A allocated_ports

    for service in "${!PORT_RANGES[@]}"; do
        range="${PORT_RANGES[$service]}"
        start_port=$(echo $range | cut -d: -f1)
        end_port=$(echo $range | cut -d: -f2)

        port=$(find_available_port "$service" "$start_port" "$end_port")

        if [ $? -eq 0 ]; then
            allocated_ports[$service]=$port
        else
            echo -e "${RED}Failed to find available port for ${service}${NC}"
            exit 1
        fi
    done

    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  Port Allocation Summary${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""

    for service in "${!allocated_ports[@]}"; do
        port="${allocated_ports[$service]}"
        echo -e "${GREEN}${service^^}${NC}: ${YELLOW}${port}${NC}"
    done

    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -
}

main "$@"
