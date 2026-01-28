import { z } from 'zod';

/**
 * MySQL connection configuration schema
 */
export const MySQLConfigSchema = z.object({
  host: z.string().min(1, 'MySQL host is required'),
  port: z.number().int().positive().max(65535),
  user: z.string().min(1, 'MySQL user is required'),
  password: z.string(),
  database: z.string().min(1, 'MySQL database is required'),
  connectionLimit: z.number().int().positive().default(10),
});

/**
 * Security configuration schema
 */
export const SecurityConfigSchema = z.object({
  maxSelectRows: z.number().int().positive().default(1000),
  allowDDL: z.boolean().default(false),
  allowMultipleStatements: z.boolean().default(false),
  requireWhereClause: z.boolean().default(true),
});

/**
 * Logging configuration schema
 */
export const LoggingConfigSchema = z.object({
  enabled: z.boolean().default(true),
  level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

/**
 * Complete server configuration schema
 */
export const ServerConfigSchema = z.object({
  mysql: MySQLConfigSchema,
  security: SecurityConfigSchema,
  logging: LoggingConfigSchema,
});

/**
 * TypeScript types inferred from Zod schemas
 */
export type MySQLConfig = z.infer<typeof MySQLConfigSchema>;
export type SecurityConfig = z.infer<typeof SecurityConfigSchema>;
export type LoggingConfig = z.infer<typeof LoggingConfigSchema>;
export type ServerConfig = z.infer<typeof ServerConfigSchema>;

/**
 * Configuration validation error
 */
export class ConfigValidationError extends Error {
  constructor(
    message: string,
    public readonly errors: z.ZodError
  ) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

/**
 * Load configuration from environment variables with defaults
 * 
 * Environment variables:
 * - MYSQL_HOST: MySQL server host (default: localhost)
 * - MYSQL_PORT: MySQL server port (default: 3306)
 * - MYSQL_USER: MySQL username (required)
 * - MYSQL_PASSWORD: MySQL password (required)
 * - MYSQL_DATABASE: MySQL database name (required)
 * - MYSQL_CONNECTION_LIMIT: Connection pool size (default: 10)
 * - MAX_SELECT_ROWS: Maximum rows for SELECT queries (default: 1000)
 * - ALLOW_DDL: Allow DDL operations (default: false)
 * - ALLOW_MULTIPLE_STATEMENTS: Allow multiple SQL statements (default: false)
 * - REQUIRE_WHERE_CLAUSE: Require WHERE clause for UPDATE/DELETE (default: true)
 * - MCP_LOG_LEVEL: Logging level (default: info)
 * - MCP_LOG_ENABLED: Enable logging (default: true)
 * 
 * @returns ServerConfig object
 * @throws ConfigValidationError if configuration is invalid
 */
export function loadConfig(): ServerConfig {
  // Parse environment variables with defaults
  const rawConfig = {
    mysql: {
      host: process.env.MYSQL_HOST || 'localhost',
      port: parseInt(process.env.MYSQL_PORT || '3306', 10),
      user: process.env.MYSQL_USER || '',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || '',
      connectionLimit: parseInt(process.env.MYSQL_CONNECTION_LIMIT || '10', 10),
    },
    security: {
      maxSelectRows: parseInt(process.env.MAX_SELECT_ROWS || '1000', 10),
      allowDDL: process.env.ALLOW_DDL === 'true',
      allowMultipleStatements: process.env.ALLOW_MULTIPLE_STATEMENTS === 'true',
      requireWhereClause: process.env.REQUIRE_WHERE_CLAUSE !== 'false', // default true
    },
    logging: {
      enabled: process.env.MCP_LOG_ENABLED !== 'false', // default true
      level: (process.env.MCP_LOG_LEVEL || 'info') as 'debug' | 'info' | 'warn' | 'error',
    },
  };

  // Validate configuration
  return validateConfig(rawConfig);
}

/**
 * Validate configuration object against schema
 * 
 * @param config - Raw configuration object to validate
 * @returns Validated ServerConfig object
 * @throws ConfigValidationError if validation fails
 */
export function validateConfig(config: unknown): ServerConfig {
  try {
    return ServerConfigSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Format error messages for better readability
      const errorMessages = error.errors.map((err) => {
        const path = err.path.join('.');
        return `  - ${path}: ${err.message}`;
      }).join('\n');

      throw new ConfigValidationError(
        `Configuration validation failed:\n${errorMessages}`,
        error
      );
    }
    throw error;
  }
}
