import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { DatabaseManager, DatabaseConnectionError } from '../../src/database';
import type { ServerConfig } from '../../src/config';
import mysql from 'mysql2/promise';

// Mock mysql2/promise
vi.mock('mysql2/promise', () => ({
  default: {
    createPool: vi.fn(),
  },
}));

describe('Database Connection Property Tests', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  // Feature: mysql-mcp-server, Property 5: Connection failure error handling
  // Validates: Requirements 2.4
  it('should return descriptive error messages for any connection failure scenario', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate arbitrary connection failure scenarios
        fc.record({
          config: fc.record({
            host: fc.string({ minLength: 1, maxLength: 255 }),
            port: fc.integer({ min: 1, max: 65535 }),
            user: fc.string({ minLength: 1, maxLength: 64 }),
            password: fc.string({ maxLength: 255 }),
            database: fc.string({ minLength: 1, maxLength: 64 }),
            connectionLimit: fc.integer({ min: 1, max: 100 }),
          }),
          errorType: fc.constantFrom(
            'ECONNREFUSED',
            'ER_ACCESS_DENIED_ERROR',
            'ER_BAD_DB_ERROR',
            'ETIMEDOUT',
            'ENOTFOUND',
            'GENERIC'
          ),
          errorMessage: fc.string({ minLength: 1, maxLength: 200 }),
        }),
        async (testCase) => {
          // Clear mocks for each iteration
          vi.clearAllMocks();

          // Create test configuration
          const testConfig: ServerConfig = {
            mysql: testCase.config,
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

          // Create mock connection that will fail
          const mockConnection = {
            query: vi.fn(),
            release: vi.fn(),
          };

          // Create error based on error type
          const mockError: any = new Error(testCase.errorMessage);
          if (testCase.errorType !== 'GENERIC') {
            mockError.code = testCase.errorType;
          }

          // Setup mock to fail with the error
          mockConnection.query.mockRejectedValue(mockError);

          // Create mock pool
          const mockPool = {
            getConnection: vi.fn().mockResolvedValue(mockConnection),
            end: vi.fn().mockResolvedValue(undefined),
          };

          vi.mocked(mysql.createPool).mockReturnValue(mockPool as any);

          // Create database manager and attempt connection
          const dbManager = new DatabaseManager(testConfig);

          let caughtError: DatabaseConnectionError | null = null;
          try {
            await dbManager.connect();
            // Should not reach here
            throw new Error('Expected DatabaseConnectionError to be thrown');
          } catch (error) {
            if (error instanceof DatabaseConnectionError) {
              caughtError = error;
            } else {
              throw error;
            }
          }

          // Verify error is DatabaseConnectionError
          if (!(caughtError instanceof DatabaseConnectionError)) {
            throw new Error('Expected DatabaseConnectionError but got: ' + caughtError);
          }

          // Verify error message is descriptive and contains relevant information
          const errorMessage = caughtError.message;
          if (!errorMessage || errorMessage.length === 0) {
            throw new Error('Error message should not be empty');
          }

          // Error message should contain context about the failure
          if (!errorMessage.includes('Failed to connect to MySQL database')) {
            throw new Error('Error message should contain "Failed to connect to MySQL database"');
          }

          // Verify specific error messages based on error type
          if (testCase.errorType === 'ECONNREFUSED') {
            if (!errorMessage.includes('Cannot connect to MySQL server')) {
              throw new Error('ECONNREFUSED error should mention "Cannot connect to MySQL server"');
            }
            if (!errorMessage.includes(testCase.config.host)) {
              throw new Error('ECONNREFUSED error should include host');
            }
            if (!errorMessage.includes(testCase.config.port.toString())) {
              throw new Error('ECONNREFUSED error should include port');
            }
          } else if (testCase.errorType === 'ER_ACCESS_DENIED_ERROR') {
            if (!errorMessage.includes('Access denied')) {
              throw new Error('ER_ACCESS_DENIED_ERROR should mention "Access denied"');
            }
            if (!errorMessage.includes(testCase.config.user)) {
              throw new Error('ER_ACCESS_DENIED_ERROR should include username');
            }
          } else if (testCase.errorType === 'ER_BAD_DB_ERROR') {
            if (!errorMessage.includes('Database')) {
              throw new Error('ER_BAD_DB_ERROR should mention "Database"');
            }
            if (!errorMessage.includes(testCase.config.database)) {
              throw new Error('ER_BAD_DB_ERROR should include database name');
            }
            if (!errorMessage.includes('does not exist')) {
              throw new Error('ER_BAD_DB_ERROR should mention "does not exist"');
            }
          }

          // Verify original error is preserved as cause
          if (!caughtError.cause) {
            throw new Error('Original error should be preserved as cause');
          }
          if (!(caughtError.cause instanceof Error)) {
            throw new Error('Cause should be an Error instance');
          }

          // Verify pool cleanup was attempted
          if (!mockPool.end.mock.calls.length) {
            throw new Error('Pool cleanup should have been attempted');
          }

          // Verify database manager is not in connected state
          if (dbManager.isConnected()) {
            throw new Error('Database manager should not be in connected state after error');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle pool cleanup failures gracefully during connection errors', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          config: fc.record({
            host: fc.string({ minLength: 1, maxLength: 255 }),
            port: fc.integer({ min: 1, max: 65535 }),
            user: fc.string({ minLength: 1, maxLength: 64 }),
            password: fc.string({ maxLength: 255 }),
            database: fc.string({ minLength: 1, maxLength: 64 }),
            connectionLimit: fc.integer({ min: 1, max: 100 }),
          }),
          connectionError: fc.string({ minLength: 1, maxLength: 200 }),
          cleanupError: fc.string({ minLength: 1, maxLength: 200 }),
        }),
        async (testCase) => {
          // Clear mocks for each iteration
          vi.clearAllMocks();

          const testConfig: ServerConfig = {
            mysql: testCase.config,
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

          // Create mock connection that fails
          const mockConnection = {
            query: vi.fn().mockRejectedValue(new Error(testCase.connectionError)),
            release: vi.fn(),
          };

          // Create mock pool that fails cleanup
          const mockPool = {
            getConnection: vi.fn().mockResolvedValue(mockConnection),
            end: vi.fn().mockRejectedValue(new Error(testCase.cleanupError)),
          };

          vi.mocked(mysql.createPool).mockReturnValue(mockPool as any);

          const dbManager = new DatabaseManager(testConfig);

          // Should still throw DatabaseConnectionError even if cleanup fails
          let caughtError: DatabaseConnectionError | null = null;
          try {
            await dbManager.connect();
            throw new Error('Expected DatabaseConnectionError to be thrown');
          } catch (error) {
            if (error instanceof DatabaseConnectionError) {
              caughtError = error;
            } else {
              throw error;
            }
          }

          // Verify connection error is thrown (not cleanup error)
          if (!(caughtError instanceof DatabaseConnectionError)) {
            throw new Error('Expected DatabaseConnectionError');
          }
          if (!caughtError.message.includes('Failed to connect to MySQL database')) {
            throw new Error('Error message should contain "Failed to connect to MySQL database"');
          }
          if (!caughtError.message.includes(testCase.connectionError)) {
            throw new Error('Error message should contain original connection error message');
          }

          // Verify cleanup was attempted
          if (!mockPool.end.mock.calls.length) {
            throw new Error('Pool cleanup should have been attempted');
          }

          // Verify database manager is not connected
          if (dbManager.isConnected()) {
            throw new Error('Database manager should not be connected');
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
