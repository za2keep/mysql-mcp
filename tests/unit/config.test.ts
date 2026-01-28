import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, validateConfig, ConfigValidationError } from '../../src/config';

describe('Configuration Unit Tests', () => {
  // Store original environment variables
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
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
    // Restore original environment
    process.env = originalEnv;
  });

  describe('Default Value Application', () => {
    it('should apply default host when MYSQL_HOST is not set', () => {
      process.env.MYSQL_USER = 'testuser';
      process.env.MYSQL_PASSWORD = 'testpass';
      process.env.MYSQL_DATABASE = 'testdb';

      const config = loadConfig();
      expect(config.mysql.host).toBe('localhost');
    });

    it('should apply default port when MYSQL_PORT is not set', () => {
      process.env.MYSQL_USER = 'testuser';
      process.env.MYSQL_PASSWORD = 'testpass';
      process.env.MYSQL_DATABASE = 'testdb';

      const config = loadConfig();
      expect(config.mysql.port).toBe(3306);
    });

    it('should apply default connectionLimit when MYSQL_CONNECTION_LIMIT is not set', () => {
      process.env.MYSQL_USER = 'testuser';
      process.env.MYSQL_PASSWORD = 'testpass';
      process.env.MYSQL_DATABASE = 'testdb';

      const config = loadConfig();
      expect(config.mysql.connectionLimit).toBe(10);
    });

    it('should apply default maxSelectRows when MAX_SELECT_ROWS is not set', () => {
      process.env.MYSQL_USER = 'testuser';
      process.env.MYSQL_PASSWORD = 'testpass';
      process.env.MYSQL_DATABASE = 'testdb';

      const config = loadConfig();
      expect(config.security.maxSelectRows).toBe(1000);
    });

    it('should apply default allowDDL (false) when ALLOW_DDL is not set', () => {
      process.env.MYSQL_USER = 'testuser';
      process.env.MYSQL_PASSWORD = 'testpass';
      process.env.MYSQL_DATABASE = 'testdb';

      const config = loadConfig();
      expect(config.security.allowDDL).toBe(false);
    });

    it('should apply default allowMultipleStatements (false) when ALLOW_MULTIPLE_STATEMENTS is not set', () => {
      process.env.MYSQL_USER = 'testuser';
      process.env.MYSQL_PASSWORD = 'testpass';
      process.env.MYSQL_DATABASE = 'testdb';

      const config = loadConfig();
      expect(config.security.allowMultipleStatements).toBe(false);
    });

    it('should apply default requireWhereClause (true) when REQUIRE_WHERE_CLAUSE is not set', () => {
      process.env.MYSQL_USER = 'testuser';
      process.env.MYSQL_PASSWORD = 'testpass';
      process.env.MYSQL_DATABASE = 'testdb';

      const config = loadConfig();
      expect(config.security.requireWhereClause).toBe(true);
    });

    it('should apply default logging enabled (true) when MCP_LOG_ENABLED is not set', () => {
      process.env.MYSQL_USER = 'testuser';
      process.env.MYSQL_PASSWORD = 'testpass';
      process.env.MYSQL_DATABASE = 'testdb';

      const config = loadConfig();
      expect(config.logging.enabled).toBe(true);
    });

    it('should apply default log level (info) when MCP_LOG_LEVEL is not set', () => {
      process.env.MYSQL_USER = 'testuser';
      process.env.MYSQL_PASSWORD = 'testpass';
      process.env.MYSQL_DATABASE = 'testdb';

      const config = loadConfig();
      expect(config.logging.level).toBe('info');
    });

    it('should apply all defaults when only required fields are set', () => {
      process.env.MYSQL_USER = 'testuser';
      process.env.MYSQL_PASSWORD = 'testpass';
      process.env.MYSQL_DATABASE = 'testdb';

      const config = loadConfig();

      // MySQL defaults
      expect(config.mysql.host).toBe('localhost');
      expect(config.mysql.port).toBe(3306);
      expect(config.mysql.connectionLimit).toBe(10);

      // Security defaults
      expect(config.security.maxSelectRows).toBe(1000);
      expect(config.security.allowDDL).toBe(false);
      expect(config.security.allowMultipleStatements).toBe(false);
      expect(config.security.requireWhereClause).toBe(true);

      // Logging defaults
      expect(config.logging.enabled).toBe(true);
      expect(config.logging.level).toBe('info');
    });
  });

  describe('Invalid Configuration Rejection', () => {
    it('should reject empty MYSQL_USER', () => {
      process.env.MYSQL_USER = '';
      process.env.MYSQL_PASSWORD = 'testpass';
      process.env.MYSQL_DATABASE = 'testdb';

      expect(() => loadConfig()).toThrow(ConfigValidationError);
    });

    it('should reject empty MYSQL_DATABASE', () => {
      process.env.MYSQL_USER = 'testuser';
      process.env.MYSQL_PASSWORD = 'testpass';
      process.env.MYSQL_DATABASE = '';

      expect(() => loadConfig()).toThrow(ConfigValidationError);
    });

    it('should reject port less than 1', () => {
      process.env.MYSQL_USER = 'testuser';
      process.env.MYSQL_PASSWORD = 'testpass';
      process.env.MYSQL_DATABASE = 'testdb';
      process.env.MYSQL_PORT = '0';

      expect(() => loadConfig()).toThrow(ConfigValidationError);
    });

    it('should reject port greater than 65535', () => {
      process.env.MYSQL_USER = 'testuser';
      process.env.MYSQL_PASSWORD = 'testpass';
      process.env.MYSQL_DATABASE = 'testdb';
      process.env.MYSQL_PORT = '65536';

      expect(() => loadConfig()).toThrow(ConfigValidationError);
    });

    it('should reject negative connectionLimit', () => {
      process.env.MYSQL_USER = 'testuser';
      process.env.MYSQL_PASSWORD = 'testpass';
      process.env.MYSQL_DATABASE = 'testdb';
      process.env.MYSQL_CONNECTION_LIMIT = '-1';

      expect(() => loadConfig()).toThrow(ConfigValidationError);
    });

    it('should reject zero connectionLimit', () => {
      process.env.MYSQL_USER = 'testuser';
      process.env.MYSQL_PASSWORD = 'testpass';
      process.env.MYSQL_DATABASE = 'testdb';
      process.env.MYSQL_CONNECTION_LIMIT = '0';

      expect(() => loadConfig()).toThrow(ConfigValidationError);
    });

    it('should reject negative maxSelectRows', () => {
      process.env.MYSQL_USER = 'testuser';
      process.env.MYSQL_PASSWORD = 'testpass';
      process.env.MYSQL_DATABASE = 'testdb';
      process.env.MAX_SELECT_ROWS = '-1';

      expect(() => loadConfig()).toThrow(ConfigValidationError);
    });

    it('should reject zero maxSelectRows', () => {
      process.env.MYSQL_USER = 'testuser';
      process.env.MYSQL_PASSWORD = 'testpass';
      process.env.MYSQL_DATABASE = 'testdb';
      process.env.MAX_SELECT_ROWS = '0';

      expect(() => loadConfig()).toThrow(ConfigValidationError);
    });

    it('should reject invalid log level', () => {
      const invalidConfig = {
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
          level: 'invalid',
        },
      };

      expect(() => validateConfig(invalidConfig)).toThrow(ConfigValidationError);
    });

    it('should reject non-integer port', () => {
      const invalidConfig = {
        mysql: {
          host: 'localhost',
          port: 3306.5,
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

      expect(() => validateConfig(invalidConfig)).toThrow(ConfigValidationError);
    });

    it('should reject missing required mysql configuration', () => {
      const invalidConfig = {
        mysql: {
          host: 'localhost',
          port: 3306,
          // missing user, password, database
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

      expect(() => validateConfig(invalidConfig)).toThrow(ConfigValidationError);
    });
  });

  describe('Error Message Clarity', () => {
    it('should provide clear error message for empty user', () => {
      process.env.MYSQL_USER = '';
      process.env.MYSQL_PASSWORD = 'testpass';
      process.env.MYSQL_DATABASE = 'testdb';

      try {
        loadConfig();
        expect.fail('Should have thrown ConfigValidationError');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigValidationError);
        expect((error as ConfigValidationError).message).toContain('mysql.user');
        expect((error as ConfigValidationError).message).toContain('MySQL user is required');
      }
    });

    it('should provide clear error message for empty database', () => {
      process.env.MYSQL_USER = 'testuser';
      process.env.MYSQL_PASSWORD = 'testpass';
      process.env.MYSQL_DATABASE = '';

      try {
        loadConfig();
        expect.fail('Should have thrown ConfigValidationError');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigValidationError);
        expect((error as ConfigValidationError).message).toContain('mysql.database');
        expect((error as ConfigValidationError).message).toContain('MySQL database is required');
      }
    });

    it('should provide clear error message for invalid port', () => {
      process.env.MYSQL_USER = 'testuser';
      process.env.MYSQL_PASSWORD = 'testpass';
      process.env.MYSQL_DATABASE = 'testdb';
      process.env.MYSQL_PORT = '70000';

      try {
        loadConfig();
        expect.fail('Should have thrown ConfigValidationError');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigValidationError);
        expect((error as ConfigValidationError).message).toContain('mysql.port');
      }
    });

    it('should provide clear error message for invalid connectionLimit', () => {
      process.env.MYSQL_USER = 'testuser';
      process.env.MYSQL_PASSWORD = 'testpass';
      process.env.MYSQL_DATABASE = 'testdb';
      process.env.MYSQL_CONNECTION_LIMIT = '0';

      try {
        loadConfig();
        expect.fail('Should have thrown ConfigValidationError');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigValidationError);
        expect((error as ConfigValidationError).message).toContain('mysql.connectionLimit');
      }
    });

    it('should provide clear error message for invalid maxSelectRows', () => {
      process.env.MYSQL_USER = 'testuser';
      process.env.MYSQL_PASSWORD = 'testpass';
      process.env.MYSQL_DATABASE = 'testdb';
      process.env.MAX_SELECT_ROWS = '-100';

      try {
        loadConfig();
        expect.fail('Should have thrown ConfigValidationError');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigValidationError);
        expect((error as ConfigValidationError).message).toContain('security.maxSelectRows');
      }
    });

    it('should provide clear error message for invalid log level', () => {
      const invalidConfig = {
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
          level: 'trace',
        },
      };

      try {
        validateConfig(invalidConfig);
        expect.fail('Should have thrown ConfigValidationError');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigValidationError);
        expect((error as ConfigValidationError).message).toContain('logging.level');
      }
    });

    it('should include field path in error message', () => {
      const invalidConfig = {
        mysql: {
          host: 'localhost',
          port: 3306,
          user: '',
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

      try {
        validateConfig(invalidConfig);
        expect.fail('Should have thrown ConfigValidationError');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigValidationError);
        const message = (error as ConfigValidationError).message;
        expect(message).toContain('Configuration validation failed');
        expect(message).toContain('mysql.user');
      }
    });

    it('should expose underlying Zod errors', () => {
      process.env.MYSQL_USER = '';
      process.env.MYSQL_PASSWORD = 'testpass';
      process.env.MYSQL_DATABASE = 'testdb';

      try {
        loadConfig();
        expect.fail('Should have thrown ConfigValidationError');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigValidationError);
        const configError = error as ConfigValidationError;
        expect(configError.errors).toBeDefined();
        expect(configError.errors.errors.length).toBeGreaterThan(0);
      }
    });
  });
});
