#!/bin/bash

echo "🔍 Frontbase Container Debugging Tool"
echo "======================================"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Function to check port availability
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo "❌ Port $port is already in use"
        lsof -Pi :$port -sTCP:LISTEN
        return 1
    else
        echo "✅ Port $port is available"
        return 0
    fi
}

# Function to create data directory
setup_data_directory() {
    echo "📁 Setting up data directory..."
    
    # Create data directory structure
    mkdir -p ./data/uploads ./data/exports
    
    # Set permissions
    chmod 755 ./data
    chmod 755 ./data/uploads
    chmod 755 ./data/exports
    
    echo "✅ Data directory structure created"
    ls -la ./data/
}

# Function to inspect container logs
inspect_container() {
    echo "📋 Container inspection..."
    
    # Get container ID
    CONTAINER_ID=$(docker-compose ps -q frontbase)
    
    if [ -z "$CONTAINER_ID" ]; then
        echo "❌ No frontbase container found"
        return 1
    fi
    
    echo "Container ID: $CONTAINER_ID"
    
    # Check container status
    echo "🔍 Container status:"
    docker inspect $CONTAINER_ID --format='{{.State.Status}}: {{.State.Error}}'
    
    # Check container logs
    echo "📜 Recent container logs:"
    docker logs --tail=50 $CONTAINER_ID
    
    # Check if container is healthy
    echo "🏥 Health check status:"
    docker inspect $CONTAINER_ID --format='{{.State.Health.Status}}'
}

# Function to test container interactively
test_interactive() {
    echo "🧪 Running interactive container test..."
    
    # Stop existing containers
    docker-compose down
    
    # Run container interactively
    docker-compose run --rm -e STARTUP_DEBUG=1 frontbase sh -c "
        echo '🔍 Interactive startup test...'
        echo 'Environment variables:'
        env | grep -E '(NODE_ENV|DB_PATH|PORT|DEBUG)'
        echo ''
        echo 'File system check:'
        ls -la /app/
        echo ''
        echo 'Data directory check:'
        ls -la /app/data/ || echo 'Data directory not accessible'
        echo ''
        echo 'Starting server in test mode...'
        timeout 30s node index.js || echo 'Server startup failed or timed out'
    "
}

# Function to run comprehensive diagnostics
run_diagnostics() {
    echo "🩺 Running comprehensive diagnostics..."
    
    echo "1. Checking system requirements..."
    check_port 3000
    
    echo ""
    echo "2. Setting up environment..."
    setup_data_directory
    
    echo ""
    echo "3. Building fresh container..."
    docker-compose build --no-cache
    
    echo ""
    echo "4. Testing container startup..."
    test_interactive
    
    echo ""
    echo "5. Inspecting running container..."
    inspect_container
}

# Main menu
case "${1:-help}" in
    "port")
        check_port 3000
        ;;
    "setup")
        setup_data_directory
        ;;
    "logs")
        inspect_container
        ;;
    "test")
        test_interactive
        ;;
    "full")
        run_diagnostics
        ;;
    "help"|*)
        echo "Usage: $0 [command]"
        echo ""
        echo "Commands:"
        echo "  port   - Check if port 3000 is available"
        echo "  setup  - Create and setup data directories"
        echo "  logs   - Show container logs and status"
        echo "  test   - Run interactive container test"
        echo "  full   - Run full diagnostic suite"
        echo "  help   - Show this help message"
        echo ""
        echo "Quick start: $0 full"
        ;;
esac