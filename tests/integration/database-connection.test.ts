/**
 * Integration test: Database connection
 * Tests basic database connectivity and schema validation
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createTestPool,
  waitForDatabase,
  getAllTables,
  tableExists,
  getRowCount,
} from './test-helpers';
import type mysql from 'mysql2/promise';

describe('Integration: Database Connection', () => {
  let pool: mysql.Pool;

  beforeAll(async () => {
    // Wait for database to be ready
    await waitForDatabase();
    pool = createTestPool();
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  it('should connect to the test database', async () => {
    const connection = await pool.getConnection();
    expect(connection).toBeDefined();
    connection.release();
  });

  it('should have all required tables', async () => {
    const tables = await getAllTables(pool);
    
    const requiredTables = [
      'users',
      'products',
      'orders',
      'order_items',
      'test_transactions',
      'test_queries',
    ];

    for (const table of requiredTables) {
      expect(tables).toContain(table);
    }
  });

  it('should verify users table exists and has data', async () => {
    const exists = await tableExists(pool, 'users');
    expect(exists).toBe(true);

    const count = await getRowCount(pool, 'users');
    expect(count).toBeGreaterThan(0);
  });

  it('should verify products table exists and has data', async () => {
    const exists = await tableExists(pool, 'products');
    expect(exists).toBe(true);

    const count = await getRowCount(pool, 'products');
    expect(count).toBeGreaterThan(0);
  });

  it('should verify orders table exists and has data', async () => {
    const exists = await tableExists(pool, 'orders');
    expect(exists).toBe(true);

    const count = await getRowCount(pool, 'orders');
    expect(count).toBeGreaterThan(0);
  });

  it('should execute a simple SELECT query', async () => {
    const [rows] = await pool.execute('SELECT * FROM users LIMIT 1');
    expect(rows).toBeDefined();
    expect(Array.isArray(rows)).toBe(true);
  });

  it('should verify foreign key relationships', async () => {
    // Query orders with user information
    const [rows] = await pool.execute(`
      SELECT o.id, o.user_id, u.username
      FROM orders o
      JOIN users u ON o.user_id = u.id
      LIMIT 1
    `);
    
    expect(rows).toBeDefined();
    expect(Array.isArray(rows)).toBe(true);
    if (Array.isArray(rows) && rows.length > 0) {
      const row = rows[0] as any;
      expect(row.user_id).toBeDefined();
      expect(row.username).toBeDefined();
    }
  });
});
