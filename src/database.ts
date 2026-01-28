import mysql from 'mysql2/promise';
import type { ServerConfig } from './config.js';

/**
 * Database connection error
 */
export class DatabaseConnectionError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'DatabaseConnectionError';
  }
}

/**
 * Database manager class that handles connection pool lifecycle
 */
export class DatabaseManager {
  private pool: mysql.Pool | null = null;
  private config: ServerConfig;

  constructor(config: ServerConfig) {
    this.config = config;
  }

  /**
   * Create and initialize the connection pool
   * Tests the connection to ensure database is accessible
   * 
   * @throws DatabaseConnectionError if connection fails
   */
  async connect(): Promise<void> {
    try {
      // Create connection pool
      this.pool = mysql.createPool({
        host: this.config.mysql.host,
        port: this.config.mysql.port,
        user: this.config.mysql.user,
        password: this.config.mysql.password,
        database: this.config.mysql.database,
        connectionLimit: this.config.mysql.connectionLimit,
        waitForConnections: true,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
        connectTimeout: 10000, // 10 seconds - valid mysql2 option
      });

      // Test the connection
      await this.testConnection();
    } catch (error) {
      // Clean up pool if connection test fails
      if (this.pool) {
        await this.pool.end().catch(() => {
          // Ignore cleanup errors
        });
        this.pool = null;
      }

      if (error instanceof Error) {
        throw new DatabaseConnectionError(
          `Failed to connect to MySQL database: ${error.message}`,
          error
        );
      }
      throw new DatabaseConnectionError('Failed to connect to MySQL database');
    }
  }

  /**
   * Test the database connection by executing a simple query
   * Also validates that the database exists
   * 
   * @throws Error if connection test fails
   */
  private async testConnection(): Promise<void> {
    if (!this.pool) {
      throw new Error('Connection pool not initialized');
    }

    try {
      // Execute a simple query to test connection
      const connection = await this.pool.getConnection();
      try {
        await connection.query('SELECT 1');
        // Verify database exists by querying it
        await connection.query('SELECT DATABASE()');
      } finally {
        connection.release();
      }
    } catch (error) {
      if (error instanceof Error) {
        // Provide more specific error messages based on error code
        const mysqlError = error as any;
        
        // Network-related errors
        if (mysqlError.code === 'ECONNREFUSED') {
          throw new Error(
            `Cannot connect to MySQL server at ${this.config.mysql.host}:${this.config.mysql.port}. ` +
            `Please verify that MySQL is running and accessible.`
          );
        } else if (mysqlError.code === 'EHOSTUNREACH') {
          throw new Error(
            `Host unreachable: ${this.config.mysql.host}:${this.config.mysql.port}. ` +
            `Please check:\n` +
            `1. Network connectivity to the MySQL server\n` +
            `2. Firewall rules allowing connections to port ${this.config.mysql.port}\n` +
            `3. MySQL server's bind-address configuration\n` +
            `4. Try using 'localhost' or '127.0.0.1' if MySQL is on the same machine`
          );
        } else if (mysqlError.code === 'ETIMEDOUT') {
          throw new Error(
            `Connection timeout to ${this.config.mysql.host}:${this.config.mysql.port}. ` +
            `The server may be unreachable or too slow to respond.`
          );
        } else if (mysqlError.code === 'ENOTFOUND') {
          throw new Error(
            `Cannot resolve hostname: ${this.config.mysql.host}. ` +
            `Please verify the hostname is correct.`
          );
        }
        
        // Authentication errors
        else if (mysqlError.code === 'ER_ACCESS_DENIED_ERROR') {
          throw new Error(
            `Access denied for user '${this.config.mysql.user}'. ` +
            `Please verify username and password are correct.`
          );
        }
        
        // Database errors
        else if (mysqlError.code === 'ER_BAD_DB_ERROR') {
          throw new Error(
            `Database '${this.config.mysql.database}' does not exist. ` +
            `Please create the database or verify the name is correct.`
          );
        }
      }
      throw error;
    }
  }

  /**
   * Get the connection pool
   * 
   * @returns The MySQL connection pool
   * @throws Error if pool is not initialized
   */
  getPool(): mysql.Pool {
    if (!this.pool) {
      throw new Error('Database connection pool not initialized. Call connect() first.');
    }
    return this.pool;
  }

  /**
   * Check if the database is connected
   */
  isConnected(): boolean {
    return this.pool !== null;
  }

  /**
   * Gracefully close the connection pool
   * Waits for all active connections to complete
   */
  async close(): Promise<void> {
    if (this.pool) {
      try {
        await this.pool.end();
      } catch (error) {
        // Log error but don't throw during cleanup
        console.error('Error closing database connection pool:', error);
      } finally {
        this.pool = null;
      }
    }
  }
}

/**
 * Setup graceful shutdown handlers for the process
 * Ensures database connections are properly closed on exit
 * 
 * @param dbManager - Database manager instance to close
 */
export function setupGracefulShutdown(dbManager: DatabaseManager): void {
  const shutdown = async (signal: string) => {
    console.error(`\nReceived ${signal}, closing database connections...`);
    
    try {
      await dbManager.close();
      console.error('Database connections closed successfully');
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  };

  // Handle termination signals
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Handle uncaught errors
  process.on('uncaughtException', async (error) => {
    console.error('Uncaught exception:', error);
    await dbManager.close();
    process.exit(1);
  });

  process.on('unhandledRejection', async (reason) => {
    console.error('Unhandled rejection:', reason);
    await dbManager.close();
    process.exit(1);
  });
}
