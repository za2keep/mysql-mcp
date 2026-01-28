# Integration Tests Quick Start

## TL;DR

```bash
# 1. Start the test database
npm run db:start

# 2. Run integration tests
npm run test:integration

# 3. Stop the test database
npm run db:stop
```

## What's Included

This integration test setup provides:

✅ **Docker Compose configuration** - MySQL 8.0 test database  
✅ **Database schema** - 6 tables with realistic relationships  
✅ **Sample data** - Users, products, orders for testing  
✅ **Management scripts** - Easy database lifecycle management  
✅ **Test helpers** - Utilities for writing integration tests  
✅ **Sample test** - Database connection verification test  

## Database Management

```bash
npm run db:start    # Start database
npm run db:stop     # Stop database
npm run db:reset    # Reset to fresh state
npm run db:status   # Check if running
npm run db:logs     # View logs
npm run db:connect  # Connect with MySQL client
```

## Connection Details

- **Host:** localhost
- **Port:** 3307 (not 3306 to avoid conflicts)
- **Database:** test_db
- **User:** test_user
- **Password:** test_password

## Tables Available

1. **users** - Test user accounts
2. **products** - Product catalog
3. **orders** - Order records
4. **order_items** - Order line items
5. **test_transactions** - For transaction testing
6. **test_queries** - For query validation testing

## Writing Your First Integration Test

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestPool, waitForDatabase } from './test-helpers';
import type mysql from 'mysql2/promise';

describe('My Integration Test', () => {
  let pool: mysql.Pool;

  beforeAll(async () => {
    await waitForDatabase();
    pool = createTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  it('should do something', async () => {
    const [rows] = await pool.execute('SELECT * FROM users LIMIT 1');
    expect(rows).toBeDefined();
  });
});
```

## Troubleshooting

**Database won't start?**
- Check Docker is running: `docker info`
- Check port 3307 is free: `lsof -i :3307`

**Tests can't connect?**
- Ensure database is running: `npm run db:status`
- Wait ~10 seconds after starting for health check

**Need fresh data?**
- Reset database: `npm run db:reset`

## Next Steps

See [README.md](./README.md) for detailed documentation.
