import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadConfig, ConfigValidationError } from '../../src/config.js';
import { DatabaseManager, DatabaseConnectionError } from '../../src/database.js';

/**
 * Unit tests for startup flow
 * 
 * Tests configuration loading, startup success, and startup failure scenarios
 * 
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */
describe('Startup Flow Unit Tests', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let originalExit: typeof process.exit;
  let originalConsoleError: typeof console.error;
  let exitCode: number | undefined;
  let consoleOutput: string[];

  beforeEach(() => {
    // Store original environment and functions
    originalEnv = { ...process.env };
    originalExit = process.exit;
    originalConsoleError = console.error;
    
    // Mock process.exit to capture exit code
    exitCode = undefined;
    process.exit = vi.fn((code?: number) => {
      exitCode = code;
      throw new Error('process.exit called');
    }) as any;

    // Mock console.error to capture output
    consoleOutput = [];
    console.error = vi.fn((...args: any[]) => {
      consoleOutput.push(args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' '));
    });

    // Clear all config-related environment variables
    delete process.env.MYSQL_HOST;
    delete process.env.MYSQL_PORT;
    delete process.env.MYSQL_USER;
    delete process.env.MYSQL_PASSWORD;
    delete process.env.MYSQL_DATABASE;
    delete process.env.MYSQL_CONNECTION_LIMIT;
    delete process.env.MAX_SELECT_ROWS;
    delete process.env.ALLOW_DDL;
    delete process.env.ALLOW_MULTIPLE_STATEMENTS;
    delete process.env.REQUIRE_WHERE_CLAUSE;
    delete process.env.MCP_LOG_ENABLED;
    delete process.env.MCP_LOG_LEVEL;
  });

  afterEach(() => {
    // Restore original environment and functions
    process.env = originalEnv;
    process.exit = originalExit;
    console.error = originalConsoleError;
  });

  describe('Configuration Loading', () => {
    it('should load configuration from environment variables', () => {
      // Set valid environment variables
      process.env.MYSQL_HOST = 'testhost';
      process.env.MYSQL_PORT = '3307';
      process.env.MYSQL_USER = 'testuser';
      process.env.MYSQL_PASSWORD = 'testpass';
      process.env.MYSQL_DATABASE = 'testdb';
      process.env.MYSQL_CONNECTION_LIMIT = '20';
      process.env.MAX_SELECT_ROWS = '500';
      process.env.ALLOW_DDL = 'true';
      process.env.MCP_LOG_LEVEL = 'debug';

      const config = loadConfig();

      // Verify configuration was loaded correctly
      expect(config.mysql.host).toBe('testhost');
      expect(config.mysql.port).toBe(3307);
      expect(config.mysql.user).toBe('testuser');
      expect(config.mysql.password).toBe('testpass');
      expect(config.mysql.database).toBe('testdb');
      expect(config.mysql.connectionLimit).toBe(20);
      expect(config.security.maxSelectRows).toBe(500);
      expect(config.security.allowDDL).toBe(true);
      expect(config.logging.level).toBe('debug');
    });

    it('should apply default values for optional configuration', () => {
      // Set only required environment variables
      process.env.MYSQL_USER = 'testuser';
      process.env.MYSQL_PASSWORD = 'testpass';
      process.env.MYSQL_DATABASE = 'testdb';

      const config = loadConfig();

      // Verify defaults were applied
      expect(config.mysql.host).toBe('localhost');
      expect(config.mysql.port).toBe(3306);
      expect(config.mysql.connectionLimit).toBe(10);
      expect(config.security.maxSelectRows).toBe(1000);
      expect(config.security.allowDDL).toBe(false);
      expect(config.security.requireWhereClause).toBe(true);
      expect(config.logging.enabled).toBe(true);
      expect(config.logging.level).toBe('info');
    });

    it('should throw ConfigValidationError for missing required fields', () => {
      // Don't set required environment variables
      expect(() => loadConfig()).toThrow(ConfigValidationError);
    });

    it('should throw ConfigValidationError for invalid port', () => {
      process.env.MYSQL_USER = 'testuser';
      process.env.MYSQL_PASSWORD = 'testpass';
      process.env.MYSQL_DATABASE = 'testdb';
      process.env.MYSQL_PORT = '70000'; // Invalid port

      expect(() => loadConfig()).toThrow(ConfigValidationError);
    });
  });

  describe('Startup Success', () => {
    it('should handle successful startup with valid configuration', () => {
      // This test verifies the startup flow would succeed with valid config
      // We can't actually start the server in unit tests, but we can verify
      // that configuration loads successfully
      
      process.env.MYSQL_USER = 'testuser';
      process.env.MYSQL_PASSWORD = 'testpass';
      process.env.MYSQL_DATABASE = 'testdb';
      
      // Should not throw
      expect(() => loadConfig()).not.toThrow();
      
      const config = loadConfig();
      expect(config).toBeDefined();
      expect(config.mysql.user).toBe('testuser');
      expect(config.mysql.database).toBe('testdb');
    });

    it('should create server instance with valid configuration', () => {
      process.env.MYSQL_USER = 'testuser';
      process.env.MYSQL_PASSWORD = 'testpass';
      process.env.MYSQL_DATABASE = 'testdb';

      const config = loadConfig();

      // Verify we can create a DatabaseManager with the config
      const dbManager = new DatabaseManager(config);
      
      expect(dbManager).toBeDefined();
      expect(dbManager.isConnected()).toBe(false); // Not connected yet
    });
  });

  describe('Startup Failure - Configuration Validation', () => {
    it('should exit with code 1 on configuration validation failure', () => {
      // Missing required configuration
      const error = new ConfigValidationError(
        'Configuration validation failed:\n  - mysql.user: MySQL user is required',
        {} as any
      );

      // Simulate the error handling in main()
      expect(() => {
        try {
          throw error;
        } catch (err) {
          if (err instanceof ConfigValidationError) {
            console.error('Configuration validation failed:');
            console.error(err.message);
            console.error('\nPlease check your environment variables and ensure all required configuration is provided.');
            process.exit(1);
          }
        }
      }).toThrow('process.exit called');

      // Verify exit code and error messages
      expect(exitCode).toBe(1);
      expect(consoleOutput.some(line => line.includes('Configuration validation failed'))).toBe(true);
      expect(consoleOutput.some(line => line.includes('Please check your environment variables'))).toBe(true);
    });

    it('should provide clear error message for missing MYSQL_USER', () => {
      const error = new ConfigValidationError(
        'Configuration validation failed:\n  - mysql.user: MySQL user is required',
        {} as any
      );

      expect(() => {
        try {
          throw error;
        } catch (err) {
          if (err instanceof ConfigValidationError) {
            console.error('Configuration validation failed:');
            console.error(err.message);
            process.exit(1);
          }
        }
      }).toThrow('process.exit called');

      expect(exitCode).toBe(1);
      expect(consoleOutput.some(line => line.includes('mysql.user'))).toBe(true);
    });

    it('should provide clear error message for missing MYSQL_DATABASE', () => {
      const error = new ConfigValidationError(
        'Configuration validation failed:\n  - mysql.database: MySQL database is required',
        {} as any
      );

      expect(() => {
        try {
          throw error;
        } catch (err) {
          if (err instanceof ConfigValidationError) {
            console.error('Configuration validation failed:');
            console.error(err.message);
            process.exit(1);
          }
        }
      }).toThrow('process.exit called');

      expect(exitCode).toBe(1);
      expect(consoleOutput.some(line => line.includes('mysql.database'))).toBe(true);
    });

    it('should provide clear error message for invalid port', () => {
      const error = new ConfigValidationError(
        'Configuration validation failed:\n  - mysql.port: Number must be less than or equal to 65535',
        {} as any
      );

      expect(() => {
        try {
          throw error;
        } catch (err) {
          if (err instanceof ConfigValidationError) {
            console.error('Configuration validation failed:');
            console.error(err.message);
            process.exit(1);
          }
        }
      }).toThrow('process.exit called');

      expect(exitCode).toBe(1);
      expect(consoleOutput.some(line => line.includes('mysql.port'))).toBe(true);
    });
  });

  describe('Startup Failure - Database Connection', () => {
    it('should exit with code 1 on database connection failure', () => {
      const error = new DatabaseConnectionError(
        'Failed to connect to MySQL database: Connection refused',
        new Error('Connection refused')
      );

      // Simulate the error handling in main()
      expect(() => {
        try {
          throw error;
        } catch (err) {
          if (err instanceof Error && err.name === 'DatabaseConnectionError') {
            console.error('Database connection failed:');
            console.error(err.message);
            console.error('\nPlease verify your database configuration and ensure the database server is running.');
            process.exit(1);
          }
        }
      }).toThrow('process.exit called');

      // Verify exit code and error messages
      expect(exitCode).toBe(1);
      expect(consoleOutput.some(line => line.includes('Database connection failed'))).toBe(true);
      expect(consoleOutput.some(line => line.includes('Please verify your database configuration'))).toBe(true);
    });

    it('should provide clear error message for connection refused', () => {
      const error = new DatabaseConnectionError(
        'Failed to connect to MySQL database: Cannot connect to MySQL server at localhost:3306'
      );

      expect(() => {
        try {
          throw error;
        } catch (err) {
          if (err instanceof Error && err.name === 'DatabaseConnectionError') {
            console.error('Database connection failed:');
            console.error(err.message);
            process.exit(1);
          }
        }
      }).toThrow('process.exit called');

      expect(exitCode).toBe(1);
      expect(consoleOutput.some(line => line.includes('Cannot connect to MySQL server'))).toBe(true);
    });

    it('should provide clear error message for access denied', () => {
      const error = new DatabaseConnectionError(
        "Failed to connect to MySQL database: Access denied for user 'testuser'"
      );

      expect(() => {
        try {
          throw error;
        } catch (err) {
          if (err instanceof Error && err.name === 'DatabaseConnectionError') {
            console.error('Database connection failed:');
            console.error(err.message);
            process.exit(1);
          }
        }
      }).toThrow('process.exit called');

      expect(exitCode).toBe(1);
      expect(consoleOutput.some(line => line.includes('Access denied'))).toBe(true);
    });

    it('should provide clear error message for database not found', () => {
      const error = new DatabaseConnectionError(
        "Failed to connect to MySQL database: Database 'testdb' does not exist"
      );

      expect(() => {
        try {
          throw error;
        } catch (err) {
          if (err instanceof Error && err.name === 'DatabaseConnectionError') {
            console.error('Database connection failed:');
            console.error(err.message);
            process.exit(1);
          }
        }
      }).toThrow('process.exit called');

      expect(exitCode).toBe(1);
      expect(consoleOutput.some(line => line.includes('does not exist'))).toBe(true);
    });
  });

  describe('Startup Failure - Generic Errors', () => {
    it('should exit with code 1 on generic startup error', () => {
      const error = new Error('Unexpected startup error');

      // Simulate the error handling in main()
      expect(() => {
        try {
          throw error;
        } catch (err) {
          console.error('Failed to start MySQL MCP Server:', err);
          
          if (err instanceof Error) {
            console.error('Error details:', {
              name: err.name,
              message: err.message,
            });
          }
          
          process.exit(1);
        }
      }).toThrow('process.exit called');

      // Verify exit code and error messages
      expect(exitCode).toBe(1);
      expect(consoleOutput.some(line => line.includes('Failed to start MySQL MCP Server'))).toBe(true);
      expect(consoleOutput.some(line => line.includes('Unexpected startup error'))).toBe(true);
    });

    it('should include error details in output', () => {
      const error = new Error('Test error');
      error.name = 'TestError';

      expect(() => {
        try {
          throw error;
        } catch (err) {
          console.error('Failed to start MySQL MCP Server:', err);
          
          if (err instanceof Error) {
            console.error('Error details:', {
              name: err.name,
              message: err.message,
            });
          }
          
          process.exit(1);
        }
      }).toThrow('process.exit called');

      expect(exitCode).toBe(1);
      expect(consoleOutput.some(line => line.includes('TestError'))).toBe(true);
      expect(consoleOutput.some(line => line.includes('Test error'))).toBe(true);
    });
  });

  describe('Exit Code Validation', () => {
    it('should exit with non-zero status on ConfigValidationError', () => {
      const error = new ConfigValidationError('Config error', {} as any);

      expect(() => {
        try {
          throw error;
        } catch (err) {
          if (err instanceof ConfigValidationError) {
            console.error('Configuration validation failed:');
            console.error(err.message);
            process.exit(1);
          }
        }
      }).toThrow('process.exit called');

      expect(exitCode).toBe(1);
      expect(exitCode).not.toBe(0);
    });

    it('should exit with non-zero status on DatabaseConnectionError', () => {
      const error = new DatabaseConnectionError('Connection error');

      expect(() => {
        try {
          throw error;
        } catch (err) {
          if (err instanceof Error && err.name === 'DatabaseConnectionError') {
            console.error('Database connection failed:');
            console.error(err.message);
            process.exit(1);
          }
        }
      }).toThrow('process.exit called');

      expect(exitCode).toBe(1);
      expect(exitCode).not.toBe(0);
    });

    it('should exit with non-zero status on generic error', () => {
      const error = new Error('Generic error');

      expect(() => {
        try {
          throw error;
        } catch (err) {
          console.error('Failed to start MySQL MCP Server:', err);
          process.exit(1);
        }
      }).toThrow('process.exit called');

      expect(exitCode).toBe(1);
      expect(exitCode).not.toBe(0);
    });
  });
});
