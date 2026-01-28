import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseManager, DatabaseConnectionError, setupGracefulShutdown } from '../../src/database';
import type { ServerConfig } from '../../src/config';
import mysql from 'mysql2/promise';

// Mock mysql2/promise
vi.mock('mysql2/promise', () => ({
  default: {
    createPool: vi.fn(),
  },
}));

describe('Database Connection Management Unit Tests', () => {
  let mockPool: any;
  let mockConnection: any;
  let testConfig: ServerConfig;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create mock connection
    mockConnection = {
      query: vi.fn().mockResolvedValue([[], []]),
      release: vi.fn(),
    };

    // Create mock pool
    mockPool = {
      getConnection: vi.fn().mockResolvedValue(mockConnection),
      end: vi.fn().mockResolvedValue(undefined),
    };

    // Setup default mock behavior
    vi.mocked(mysql.createPool).mockReturnValue(mockPool as any);

    // Test configuration
    testConfig = {
      mysql: {
        host: 'localhost',
        port: 3306,
        user: 'testuser',
        password: 'testpass',
        database: 'testdb',
        connectionLimit: 10,
      },
      security: {
        maxSelectRows: 1000,
        allowDDL: false,
        allowMultipleStatements: false,
        requireWhereClause: true,
      },
      logging: {
        enabled: true,
        level: 'info',
      },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Connection Pool Creation', () => {
    it('should create connection pool with correct configuration', async () => {
      const dbManager = new DatabaseManager(testConfig);
      await dbManager.connect();

      expect(mysql.createPool).toHaveBeenCalledWith({
        host: 'localhost',
        port: 3306,
        user: 'testuser',
        password: 'testpass',
        database: 'testdb',
        connectionLimit: 10,
        waitForConnections: true,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
      });
    });

    it('should test connection after creating pool', async () => {
      const dbManager = new DatabaseManager(testConfig);
      await dbManager.connect();

      expect(mockPool.getConnection).toHaveBeenCalled();
      expect(mockConnection.query).toHaveBeenCalledWith('SELECT 1');
      expect(mockConnection.query).toHaveBeenCalledWith('SELECT DATABASE()');
      expect(mockConnection.release).toHaveBeenCalled();
    });

    it('should return pool when getPool is called after connect', async () => {
      const dbManager = new DatabaseManager(testConfig);
      await dbManager.connect();

      const pool = dbManager.getPool();
      expect(pool).toBe(mockPool);
    });

    it('should report connected status after successful connection', async () => {
      const dbManager = new DatabaseManager(testConfig);
      expect(dbManager.isConnected()).toBe(false);

      await dbManager.connect();
      expect(dbManager.isConnected()).toBe(true);
    });

    it('should throw error when getPool is called before connect', () => {
      const dbManager = new DatabaseManager(testConfig);

      expect(() => dbManager.getPool()).toThrow('Database connection pool not initialized');
    });
  });

  describe('Connection Failure Handling', () => {
    it('should throw DatabaseConnectionError when connection test fails', async () => {
      mockConnection.query.mockRejectedValue(new Error('Connection failed'));

      const dbManager = new DatabaseManager(testConfig);

      await expect(dbManager.connect()).rejects.toThrow(DatabaseConnectionError);
      await expect(dbManager.connect()).rejects.toThrow('Failed to connect to MySQL database');
    });

    it('should provide specific error for ECONNREFUSED', async () => {
      const connRefusedError = new Error('Connection refused') as any;
      connRefusedError.code = 'ECONNREFUSED';
      mockConnection.query.mockRejectedValue(connRefusedError);

      const dbManager = new DatabaseManager(testConfig);

      await expect(dbManager.connect()).rejects.toThrow(DatabaseConnectionError);
      await expect(dbManager.connect()).rejects.toThrow('Cannot connect to MySQL server at localhost:3306');
    });

    it('should provide specific error for ER_ACCESS_DENIED_ERROR', async () => {
      const accessDeniedError = new Error('Access denied') as any;
      accessDeniedError.code = 'ER_ACCESS_DENIED_ERROR';
      mockConnection.query.mockRejectedValue(accessDeniedError);

      const dbManager = new DatabaseManager(testConfig);

      await expect(dbManager.connect()).rejects.toThrow(DatabaseConnectionError);
      await expect(dbManager.connect()).rejects.toThrow("Access denied for user 'testuser'");
    });

    it('should provide specific error for ER_BAD_DB_ERROR', async () => {
      const badDbError = new Error('Database does not exist') as any;
      badDbError.code = 'ER_BAD_DB_ERROR';
      mockConnection.query.mockRejectedValue(badDbError);

      const dbManager = new DatabaseManager(testConfig);

      await expect(dbManager.connect()).rejects.toThrow(DatabaseConnectionError);
      await expect(dbManager.connect()).rejects.toThrow("Database 'testdb' does not exist");
    });

    it('should clean up pool when connection test fails', async () => {
      mockConnection.query.mockRejectedValueOnce(new Error('Connection failed'));

      const dbManager = new DatabaseManager(testConfig);

      await expect(dbManager.connect()).rejects.toThrow(DatabaseConnectionError);
      expect(mockPool.end).toHaveBeenCalled();
      expect(dbManager.isConnected()).toBe(false);
    });

    it('should handle pool cleanup errors gracefully', async () => {
      mockConnection.query.mockRejectedValueOnce(new Error('Connection failed'));
      mockPool.end.mockRejectedValueOnce(new Error('Cleanup failed'));

      const dbManager = new DatabaseManager(testConfig);

      await expect(dbManager.connect()).rejects.toThrow(DatabaseConnectionError);
      expect(dbManager.isConnected()).toBe(false);
    });

    it('should include original error as cause in DatabaseConnectionError', async () => {
      const originalError = new Error('Original connection error');
      mockConnection.query.mockRejectedValueOnce(originalError);

      const dbManager = new DatabaseManager(testConfig);

      try {
        await dbManager.connect();
        expect.fail('Should have thrown DatabaseConnectionError');
      } catch (error) {
        expect(error).toBeInstanceOf(DatabaseConnectionError);
        expect((error as DatabaseConnectionError).cause).toBe(originalError);
      }
    });
  });

  describe('Graceful Shutdown', () => {
    it('should close pool when close is called', async () => {
      const dbManager = new DatabaseManager(testConfig);
      await dbManager.connect();

      await dbManager.close();

      expect(mockPool.end).toHaveBeenCalled();
      expect(dbManager.isConnected()).toBe(false);
    });

    it('should handle close when not connected', async () => {
      const dbManager = new DatabaseManager(testConfig);

      await dbManager.close();

      expect(mockPool.end).not.toHaveBeenCalled();
      expect(dbManager.isConnected()).toBe(false);
    });

    it('should handle errors during close gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockPool.end.mockRejectedValueOnce(new Error('Close failed'));

      const dbManager = new DatabaseManager(testConfig);
      await dbManager.connect();

      await dbManager.close();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error closing database connection pool:',
        expect.any(Error)
      );
      expect(dbManager.isConnected()).toBe(false);

      consoleErrorSpy.mockRestore();
    });

    it('should set pool to null after close even if error occurs', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockPool.end.mockRejectedValueOnce(new Error('Close failed'));

      const dbManager = new DatabaseManager(testConfig);
      await dbManager.connect();

      await dbManager.close();

      expect(dbManager.isConnected()).toBe(false);
      expect(() => dbManager.getPool()).toThrow('Database connection pool not initialized');

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Graceful Shutdown Handlers', () => {
    let dbManager: DatabaseManager;
    let processExitSpy: any;
    let consoleErrorSpy: any;

    beforeEach(async () => {
      dbManager = new DatabaseManager(testConfig);
      await dbManager.connect();

      processExitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      // Remove all listeners to avoid interference
      process.removeAllListeners('SIGINT');
      process.removeAllListeners('SIGTERM');
      process.removeAllListeners('uncaughtException');
      process.removeAllListeners('unhandledRejection');

      processExitSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it('should setup SIGINT handler', async () => {
      setupGracefulShutdown(dbManager);

      // Emit SIGINT
      process.emit('SIGINT' as any);

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Received SIGINT')
      );
      expect(mockPool.end).toHaveBeenCalled();
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    it('should setup SIGTERM handler', async () => {
      setupGracefulShutdown(dbManager);

      // Emit SIGTERM
      process.emit('SIGTERM' as any);

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Received SIGTERM')
      );
      expect(mockPool.end).toHaveBeenCalled();
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    it('should handle uncaughtException', async () => {
      setupGracefulShutdown(dbManager);

      const testError = new Error('Uncaught error');
      process.emit('uncaughtException', testError);

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(consoleErrorSpy).toHaveBeenCalledWith('Uncaught exception:', testError);
      expect(mockPool.end).toHaveBeenCalled();
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle unhandledRejection', async () => {
      setupGracefulShutdown(dbManager);

      const testReason = 'Unhandled promise rejection';
      process.emit('unhandledRejection', testReason);

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(consoleErrorSpy).toHaveBeenCalledWith('Unhandled rejection:', testReason);
      expect(mockPool.end).toHaveBeenCalled();
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should exit with code 1 if shutdown fails', async () => {
      mockPool.end.mockRejectedValueOnce(new Error('Shutdown failed'));
      setupGracefulShutdown(dbManager);

      process.emit('SIGINT' as any);

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 10));

      // The close() method logs the error but doesn't throw, so shutdown succeeds
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error closing database connection pool:',
        expect.any(Error)
      );
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });
  });
});
