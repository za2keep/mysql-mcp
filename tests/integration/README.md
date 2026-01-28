# Integration Tests

This directory contains integration tests for the MySQL MCP Server that test the complete system with a real MySQL database.

## Prerequisites

- Docker and Docker Compose installed
- Node.js 18+ installed
- Port 3307 available (or modify `docker-compose.test.yml` to use a different port)

## Test Database Setup

### Quick Start

```bash
# Start the test database
./tests/integration/db-setup.sh start

# Run integration tests
npm test -- tests/integration

# Stop the test database
./tests/integration/db-setup.sh stop
```

### Database Management Commands

The `db-setup.sh` script provides several commands for managing the test database:

```bash
# Start the database container
./tests/integration/db-setup.sh start

# Stop the database container
./tests/integration/db-setup.sh stop

# Reset the database (stop, remove, and restart with fresh data)
./tests/integration/db-setup.sh reset

# View database logs
./tests/integration/db-setup.sh logs

# Connect to the database using MySQL client
./tests/integration/db-setup.sh connect

# Check database status
./tests/integration/db-setup.sh status
```

## Test Database Schema

The test database includes the following tables:

### users
- User accounts for testing
- Fields: id, username, email, created_at, updated_at
- Indexes: username, email

### products
- Product catalog for testing
- Fields: id, name, description, price, stock, category, created_at
- Indexes: category, price

### orders
- Order records for testing
- Fields: id, user_id, total_amount, status, created_at, updated_at
- Foreign key: user_id → users(id)
- Indexes: user_id, status, created_at

### order_items
- Order line items for testing
- Fields: id, order_id, product_id, quantity, price
- Foreign keys: order_id → orders(id), product_id → products(id)
- Indexes: order_id, product_id

### test_transactions
- Simple table for transaction testing
- Fields: id, value, created_at

### test_queries
- Simple table for query validation testing
- Fields: id, data, number, flag

## Test Data

The database is initialized with sample data:
- 5 test users (alice, bob, charlie, diana, eve)
- 10 test products across different categories
- 6 test orders with order items
- 5 test query records

## Environment Variables

Integration tests use the following environment variables (defined in `test.env`):

```
MYSQL_HOST=localhost
MYSQL_PORT=3307
MYSQL_USER=test_user
MYSQL_PASSWORD=test_password
MYSQL_DATABASE=test_db
```

## Docker Compose Configuration

The test database runs in a Docker container defined in `docker-compose.test.yml`:
- Image: MySQL 8.0
- Container name: mysql-mcp-test
- Port mapping: 3307:3306 (to avoid conflicts with local MySQL)
- Initialization scripts: `init-db/*.sql` (executed in alphabetical order)

## Writing Integration Tests

Integration tests should:
1. Use the test database connection settings from `test.env`
2. Clean up any test data they create (or use transactions and rollback)
3. Be idempotent (can run multiple times without side effects)
4. Test complete workflows from MCP client to database

Example test structure:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('Integration: Query Tool', () => {
  beforeAll(async () => {
    // Setup: ensure database is running
  });

  afterAll(async () => {
    // Cleanup: close connections
  });

  it('should execute SELECT query and return results', async () => {
    // Test implementation
  });
});
```

## Troubleshooting

### Database won't start
- Check if Docker is running: `docker info`
- Check if port 3307 is available: `lsof -i :3307`
- View logs: `./tests/integration/db-setup.sh logs`

### Connection refused
- Ensure database is running: `./tests/integration/db-setup.sh status`
- Wait for database to be ready (health check takes ~10 seconds)
- Check connection settings in `test.env`

### Tests fail with "database not found"
- Reset the database: `./tests/integration/db-setup.sh reset`
- Check initialization scripts in `init-db/` directory

### Permission denied on db-setup.sh
- Make script executable: `chmod +x tests/integration/db-setup.sh`
