/**
 * Integration test helpers
 * Provides utilities for setting up and tearing down test database connections
 */

import mysql from 'mysql2/promise';

export interface TestDbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

/**
 * Get test database configuration from environment variables
 */
export function getTestDbConfig(): TestDbConfig {
  return {
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3307', 10),
    user: process.env.MYSQL_USER || 'test_user',
    password: process.env.MYSQL_PASSWORD || 'test_password',
    database: process.env.MYSQL_DATABASE || 'test_db',
  };
}

/**
 * Create a test database connection pool
 */
export function createTestPool(): mysql.Pool {
  const config = getTestDbConfig();
  return mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });
}

/**
 * Wait for database to be ready
 */
export async function waitForDatabase(
  maxAttempts: number = 30,
  delayMs: number = 1000
): Promise<void> {
  const config = getTestDbConfig();
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const connection = await mysql.createConnection({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
      });
      
      await connection.ping();
      await connection.end();
      return;
    } catch (error) {
      if (attempt === maxAttempts) {
        throw new Error(
          `Database not ready after ${maxAttempts} attempts: ${error}`
        );
      }
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

/**
 * Clean up test data from a table
 */
export async function cleanTable(
  pool: mysql.Pool,
  tableName: string
): Promise<void> {
  await pool.execute(`DELETE FROM ${tableName}`);
}

/**
 * Reset auto-increment counter for a table
 */
export async function resetAutoIncrement(
  pool: mysql.Pool,
  tableName: string
): Promise<void> {
  await pool.execute(`ALTER TABLE ${tableName} AUTO_INCREMENT = 1`);
}

/**
 * Get row count from a table
 */
export async function getRowCount(
  pool: mysql.Pool,
  tableName: string
): Promise<number> {
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) as count FROM ${tableName}`
  );
  return rows[0].count;
}

/**
 * Execute a query and return results
 */
export async function executeQuery<T = any>(
  pool: mysql.Pool,
  sql: string,
  params?: any[]
): Promise<T[]> {
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(sql, params);
  return rows as T[];
}

/**
 * Check if a table exists
 */
export async function tableExists(
  pool: mysql.Pool,
  tableName: string
): Promise<boolean> {
  // SHOW TABLES doesn't support placeholders, so we use query() with string interpolation
  // This is safe in a test context where tableName is controlled
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SHOW TABLES LIKE '${tableName}'`
  );
  return rows.length > 0;
}

/**
 * Get all table names in the database
 */
export async function getAllTables(pool: mysql.Pool): Promise<string[]> {
  const [rows] = await pool.execute<mysql.RowDataPacket[]>('SHOW TABLES');
  const key = Object.keys(rows[0])[0];
  return rows.map(row => row[key]);
}

/**
 * Create a test transaction and return connection
 */
export async function beginTestTransaction(
  pool: mysql.Pool
): Promise<mysql.PoolConnection> {
  const connection = await pool.getConnection();
  await connection.beginTransaction();
  return connection;
}

/**
 * Rollback and release a test transaction connection
 */
export async function rollbackTestTransaction(
  connection: mysql.PoolConnection
): Promise<void> {
  try {
    await connection.rollback();
  } finally {
    connection.release();
  }
}

/**
 * Load environment variables from test.env file
 */
export function loadTestEnv(): void {
  // In a real implementation, you might use dotenv here
  // For now, we assume environment variables are set externally
  const requiredVars = [
    'MYSQL_HOST',
    'MYSQL_PORT',
    'MYSQL_USER',
    'MYSQL_PASSWORD',
    'MYSQL_DATABASE',
  ];
  
  const missing = requiredVars.filter(v => !process.env[v]);
  if (missing.length > 0) {
    console.warn(
      `Warning: Missing environment variables: ${missing.join(', ')}`
    );
    console.warn('Using default test configuration');
  }
}
