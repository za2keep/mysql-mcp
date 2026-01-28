#!/bin/bash

# Verification script for integration test setup
# This script verifies that all necessary files and configurations are in place

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${YELLOW}ℹ${NC} $1"
}

echo "Verifying integration test setup..."
echo ""

# Check if Docker Compose file exists
if [ -f "$PROJECT_ROOT/docker-compose.test.yml" ]; then
    print_success "Docker Compose configuration found"
else
    print_error "Docker Compose configuration not found"
    exit 1
fi

# Check if init-db directory exists
if [ -d "$SCRIPT_DIR/init-db" ]; then
    print_success "Database initialization directory found"
else
    print_error "Database initialization directory not found"
    exit 1
fi

# Check if schema file exists
if [ -f "$SCRIPT_DIR/init-db/01-schema.sql" ]; then
    print_success "Schema initialization script found"
else
    print_error "Schema initialization script not found"
    exit 1
fi

# Check if data file exists
if [ -f "$SCRIPT_DIR/init-db/02-data.sql" ]; then
    print_success "Data initialization script found"
else
    print_error "Data initialization script not found"
    exit 1
fi

# Check if db-setup script exists and is executable
if [ -f "$SCRIPT_DIR/db-setup.sh" ]; then
    print_success "Database setup script found"
    if [ -x "$SCRIPT_DIR/db-setup.sh" ]; then
        print_success "Database setup script is executable"
    else
        print_error "Database setup script is not executable"
        echo "  Run: chmod +x $SCRIPT_DIR/db-setup.sh"
        exit 1
    fi
else
    print_error "Database setup script not found"
    exit 1
fi

# Check if test environment file exists
if [ -f "$SCRIPT_DIR/test.env" ]; then
    print_success "Test environment configuration found"
else
    print_error "Test environment configuration not found"
    exit 1
fi

# Check if test helpers exist
if [ -f "$SCRIPT_DIR/test-helpers.ts" ]; then
    print_success "Test helper utilities found"
else
    print_error "Test helper utilities not found"
    exit 1
fi

# Check if README exists
if [ -f "$SCRIPT_DIR/README.md" ]; then
    print_success "Integration test documentation found"
else
    print_error "Integration test documentation not found"
    exit 1
fi

# Check if Docker is installed
if command -v docker &> /dev/null; then
    print_success "Docker is installed"
    
    # Check if Docker is running
    if docker info &> /dev/null; then
        print_success "Docker daemon is running"
        
        # Check if port 3307 is available
        if lsof -Pi :3307 -sTCP:LISTEN -t >/dev/null 2>&1; then
            print_error "Port 3307 is already in use"
            echo "  Either stop the service using port 3307 or modify docker-compose.test.yml"
        else
            print_success "Port 3307 is available"
        fi
    else
        print_info "Docker daemon is not running (start it to run integration tests)"
    fi
else
    print_info "Docker is not installed (required for integration tests)"
fi

# Check if Node.js is installed
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    print_success "Node.js is installed ($NODE_VERSION)"
else
    print_error "Node.js is not installed"
    exit 1
fi

# Check if npm scripts are configured
cd "$PROJECT_ROOT"
if grep -q "db:start" package.json; then
    print_success "Database management npm scripts configured"
else
    print_error "Database management npm scripts not configured"
    exit 1
fi

echo ""
echo "Setup verification complete!"
echo ""
echo "To start the test database, run:"
echo "  npm run db:start"
echo ""
echo "To run integration tests, run:"
echo "  npm run test:integration"
echo ""
