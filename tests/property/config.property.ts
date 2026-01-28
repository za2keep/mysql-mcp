import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { loadConfig, validateConfig, ConfigValidationError } from '../../src/config';

describe('Configuration Property Tests', () => {
  // Store original environment variables
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  // Feature: mysql-mcp-server, Property 4: Environment variable configuration loading
  // Validates: Requirements 2.1
  it('should correctly load any valid environment variable configuration', () => {
    fc.assert(
      fc.property(
        // Generate arbitrary valid configuration values
        fc.record({
          host: fc.string({ minLength: 1, maxLength: 255 }),
          port: fc.integer({ min: 1, max: 65535 }),
          user: fc.string({ minLength: 1, maxLength: 64 }),
          password: fc.string({ maxLength: 255 }),
          database: fc.string({ minLength: 1, maxLength: 64 }),
          connectionLimit: fc.integer({ min: 1, max: 100 }),
          maxSelectRows: fc.integer({ min: 1, max: 100000 }),
          allowDDL: fc.boolean(),
          allowMultipleStatements: fc.boolean(),
          requireWhereClause: fc.boolean(),
          logEnabled: fc.boolean(),
          logLevel: fc.constantFrom('debug', 'info', 'warn', 'error'),
        }),
        (envConfig) => {
          // Set environment variables
          process.env.MYSQL_HOST = envConfig.host;
          process.env.MYSQL_PORT = envConfig.port.toString();
          process.env.MYSQL_USER = envConfig.user;
          process.env.MYSQL_PASSWORD = envConfig.password;
          process.env.MYSQL_DATABASE = envConfig.database;
          process.env.MYSQL_CONNECTION_LIMIT = envConfig.connectionLimit.toString();
          process.env.MAX_SELECT_ROWS = envConfig.maxSelectRows.toString();
          process.env.ALLOW_DDL = envConfig.allowDDL.toString();
          process.env.ALLOW_MULTIPLE_STATEMENTS = envConfig.allowMultipleStatements.toString();
          process.env.REQUIRE_WHERE_CLAUSE = envConfig.requireWhereClause.toString();
          process.env.MCP_LOG_ENABLED = envConfig.logEnabled.toString();
          process.env.MCP_LOG_LEVEL = envConfig.logLevel;

          // Load configuration
          const config = loadConfig();

          // Verify all values are correctly loaded
          expect(config.mysql.host).toBe(envConfig.host);
          expect(config.mysql.port).toBe(envConfig.port);
          expect(config.mysql.user).toBe(envConfig.user);
          expect(config.mysql.password).toBe(envConfig.password);
          expect(config.mysql.database).toBe(envConfig.database);
          expect(config.mysql.connectionLimit).toBe(envConfig.connectionLimit);
          expect(config.security.maxSelectRows).toBe(envConfig.maxSelectRows);
          expect(config.security.allowDDL).toBe(envConfig.allowDDL);
          expect(config.security.allowMultipleStatements).toBe(envConfig.allowMultipleStatements);
          expect(config.security.requireWhereClause).toBe(envConfig.requireWhereClause);
          expect(config.logging.enabled).toBe(envConfig.logEnabled);
          expect(config.logging.level).toBe(envConfig.logLevel);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should apply default values when environment variables are not set', () => {
    fc.assert(
      fc.property(
        // Generate minimal required configuration
        fc.record({
          user: fc.string({ minLength: 1, maxLength: 64 }),
          password: fc.string({ maxLength: 255 }),
          database: fc.string({ minLength: 1, maxLength: 64 }),
        }),
        (envConfig) => {
          // Clear all optional environment variables
          delete process.env.MYSQL_HOST;
          delete process.env.MYSQL_PORT;
          delete process.env.MYSQL_CONNECTION_LIMIT;
          delete process.env.MAX_SELECT_ROWS;
          delete process.env.ALLOW_DDL;
          delete process.env.ALLOW_MULTIPLE_STATEMENTS;
          delete process.env.REQUIRE_WHERE_CLAUSE;
          delete process.env.MCP_LOG_ENABLED;
          delete process.env.MCP_LOG_LEVEL;

          // Set only required variables
          process.env.MYSQL_USER = envConfig.user;
          process.env.MYSQL_PASSWORD = envConfig.password;
          process.env.MYSQL_DATABASE = envConfig.database;

          // Load configuration
          const config = loadConfig();

          // Verify defaults are applied
          expect(config.mysql.host).toBe('localhost');
          expect(config.mysql.port).toBe(3306);
          expect(config.mysql.connectionLimit).toBe(10);
          expect(config.security.maxSelectRows).toBe(1000);
          expect(config.security.allowDDL).toBe(false);
          expect(config.security.allowMultipleStatements).toBe(false);
          expect(config.security.requireWhereClause).toBe(true);
          expect(config.logging.enabled).toBe(true);
          expect(config.logging.level).toBe('info');

          // Verify required values are set
          expect(config.mysql.user).toBe(envConfig.user);
          expect(config.mysql.password).toBe(envConfig.password);
          expect(config.mysql.database).toBe(envConfig.database);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject invalid configuration values', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          // Invalid port (out of range)
          fc.record({
            port: fc.oneof(
              fc.integer({ max: 0 }),
              fc.integer({ min: 65536 })
            ),
          }),
          // Empty required fields
          fc.record({
            user: fc.constant(''),
          }),
          fc.record({
            database: fc.constant(''),
          }),
          // Invalid connection limit
          fc.record({
            connectionLimit: fc.integer({ max: 0 }),
          }),
          // Invalid max select rows
          fc.record({
            maxSelectRows: fc.integer({ max: 0 }),
          })
        ),
        (invalidConfig) => {
          // Set valid base configuration
          process.env.MYSQL_USER = 'testuser';
          process.env.MYSQL_PASSWORD = 'testpass';
          process.env.MYSQL_DATABASE = 'testdb';

          // Apply invalid configuration
          if ('port' in invalidConfig) {
            process.env.MYSQL_PORT = invalidConfig.port.toString();
          }
          if ('user' in invalidConfig) {
            process.env.MYSQL_USER = invalidConfig.user;
          }
          if ('database' in invalidConfig) {
            process.env.MYSQL_DATABASE = invalidConfig.database;
          }
          if ('connectionLimit' in invalidConfig) {
            process.env.MYSQL_CONNECTION_LIMIT = invalidConfig.connectionLimit.toString();
          }
          if ('maxSelectRows' in invalidConfig) {
            process.env.MAX_SELECT_ROWS = invalidConfig.maxSelectRows.toString();
          }

          // Should throw ConfigValidationError
          expect(() => loadConfig()).toThrow(ConfigValidationError);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: mysql-mcp-server, Property 18: Configuration validation integrity
  // Validates: Requirements 10.1, 10.2, 10.3, 10.5
  it('should fail fast with clear error messages for any invalid configuration', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          // Missing required parameters (10.1, 10.2)
          fc.record({
            missingField: fc.constantFrom('user', 'database'),
          }),
          // Invalid port values (10.3)
          fc.record({
            invalidPort: fc.oneof(
              fc.integer({ max: 0 }),
              fc.integer({ min: 65536 })
            ),
          }),
          // Invalid connectionLimit (10.3)
          fc.record({
            invalidConnectionLimit: fc.integer({ max: 0 }),
          }),
          // Invalid maxSelectRows (10.3)
          fc.record({
            invalidMaxSelectRows: fc.integer({ max: 0 }),
          }),
          // Empty required strings (10.2) - only user and database since host has default
          fc.record({
            emptyField: fc.constantFrom('user', 'database'),
          })
        ),
        (testCase) => {
          // Start with minimal valid configuration
          process.env.MYSQL_HOST = 'localhost';
          process.env.MYSQL_PORT = '3306';
          process.env.MYSQL_USER = 'validuser';
          process.env.MYSQL_PASSWORD = 'validpass';
          process.env.MYSQL_DATABASE = 'validdb';

          // Apply the test case to create invalid configuration
          if ('missingField' in testCase) {
            // Remove required field
            if (testCase.missingField === 'user') {
              delete process.env.MYSQL_USER;
            } else if (testCase.missingField === 'database') {
              delete process.env.MYSQL_DATABASE;
            }
          } else if ('invalidPort' in testCase) {
            process.env.MYSQL_PORT = testCase.invalidPort.toString();
          } else if ('invalidConnectionLimit' in testCase) {
            process.env.MYSQL_CONNECTION_LIMIT = testCase.invalidConnectionLimit.toString();
          } else if ('invalidMaxSelectRows' in testCase) {
            process.env.MAX_SELECT_ROWS = testCase.invalidMaxSelectRows.toString();
          } else if ('emptyField' in testCase) {
            // Set empty string (will be treated as missing due to || operator)
            if (testCase.emptyField === 'user') {
              process.env.MYSQL_USER = '';
            } else if (testCase.emptyField === 'database') {
              process.env.MYSQL_DATABASE = '';
            }
          }

          // Validation should fail fast (10.3)
          let error: ConfigValidationError | null = null;
          try {
            loadConfig();
            // Should not reach here
            expect.fail('Expected ConfigValidationError to be thrown');
          } catch (e) {
            if (e instanceof ConfigValidationError) {
              error = e;
            } else {
              throw e;
            }
          }

          // Should throw ConfigValidationError (10.3)
          expect(error).toBeInstanceOf(ConfigValidationError);
          
          // Error message should be clear and descriptive (10.2)
          expect(error!.message).toBeTruthy();
          expect(error!.message.length).toBeGreaterThan(0);
          expect(error!.message).toContain('Configuration validation failed');
          
          // Should include field path in error message (10.2)
          const hasFieldPath = error!.message.includes('mysql.') || 
                               error!.message.includes('security.') ||
                               error!.message.includes('logging.');
          expect(hasFieldPath).toBe(true);

          // Should expose underlying validation errors (10.2)
          expect(error!.errors).toBeDefined();
          expect(error!.errors.errors.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});
