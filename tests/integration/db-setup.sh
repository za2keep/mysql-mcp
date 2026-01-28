#!/bin/bash

# Database setup script for integration tests
# This script manages the test MySQL database container

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored messages
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker and try again."
        exit 1
    fi
}

# Function to start the test database
start_db() {
    print_info "Starting test database..."
    cd "$PROJECT_ROOT"
    docker-compose -f docker-compose.test.yml up -d
    
    print_info "Waiting for database to be ready..."
    local max_attempts=30
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if docker exec mysql-mcp-test mysqladmin ping -h localhost -u root -ptest_root_password --silent > /dev/null 2>&1; then
            print_info "Database is ready!"
            return 0
        fi
        attempt=$((attempt + 1))
        echo -n "."
        sleep 1
    done
    
    print_error "Database failed to start within expected time"
    exit 1
}

# Function to stop the test database
stop_db() {
    print_info "Stopping test database..."
    cd "$PROJECT_ROOT"
    docker-compose -f docker-compose.test.yml down
    print_info "Database stopped"
}

# Function to reset the test database
reset_db() {
    print_info "Resetting test database..."
    stop_db
    start_db
}

# Function to show database logs
logs_db() {
    cd "$PROJECT_ROOT"
    docker-compose -f docker-compose.test.yml logs -f mysql-test
}

# Function to connect to the database
connect_db() {
    print_info "Connecting to test database..."
    docker exec -it mysql-mcp-test mysql -u test_user -ptest_password test_db
}

# Function to show database status
status_db() {
    cd "$PROJECT_ROOT"
    if docker ps | grep -q mysql-mcp-test; then
        print_info "Test database is running"
        docker ps | grep mysql-mcp-test
    else
        print_warn "Test database is not running"
    fi
}

# Main script logic
case "${1:-}" in
    start)
        check_docker
        start_db
        ;;
    stop)
        check_docker
        stop_db
        ;;
    reset)
        check_docker
        reset_db
        ;;
    logs)
        check_docker
        logs_db
        ;;
    connect)
        check_docker
        connect_db
        ;;
    status)
        check_docker
        status_db
        ;;
    *)
        echo "Usage: $0 {start|stop|reset|logs|connect|status}"
        echo ""
        echo "Commands:"
        echo "  start   - Start the test database container"
        echo "  stop    - Stop the test database container"
        echo "  reset   - Stop and restart the database (resets all data)"
        echo "  logs    - Show database logs"
        echo "  connect - Connect to the database using MySQL client"
        echo "  status  - Show database container status"
        exit 1
        ;;
esac
