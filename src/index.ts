#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  ListResourcesRequestSchema, 
  ReadResourceRequestSchema 
} from '@modelcontextprotocol/sdk/types.js';
import { loadConfig, type ServerConfig, ConfigValidationError } from './config.js';
import { DatabaseManager, setupGracefulShutdown } from './database.js';
import { QueryValidator } from './validator.js';
import { TransactionManager } from './transaction.js';
import { ResourceHandler } from './resources.js';
import { Logger, createLogger } from './logger.js';
import type { RowDataPacket, FieldPacket, OkPacket } from 'mysql2/promise';

/**
 * MySQL MCP Server implementation
 */
class MySQLMCPServer {
  private mcpServer: McpServer;
  private dbManager: DatabaseManager;
  private validator: QueryValidator;
  private transactionManager: TransactionManager;
  private resourceHandler: ResourceHandler | null = null;
  private config: ServerConfig;
  private logger: Logger;

  constructor(config: ServerConfig) {
    this.config = config;
    this.dbManager = new DatabaseManager(config);
    this.validator = new QueryValidator(config.security);
    this.transactionManager = new TransactionManager();
    this.logger = createLogger(config.logging.enabled, config.logging.level);

    // Initialize MCP server
    this.mcpServer = new McpServer(
      {
        name: 'mysql-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    // Setup tools
    this.setupTools();
  }

  /**
   * Setup MCP tools
   */
  private setupTools(): void {
    // Register query tool
    this.mcpServer.tool(
      'query',
      'Execute SQL queries (SELECT, INSERT, UPDATE, DELETE)',
      async (args: any) => {
        const sql = args?.sql;
        if (!sql || typeof sql !== 'string') {
          this.logger.warn('Invalid query parameters', { params: args });
          throw new Error('Missing required parameter: sql');
        }
        return await this.handleQuery(sql);
      }
    );

    // Register list_tables tool
    this.mcpServer.tool(
      'list_tables',
      'List all tables in the current database',
      async () => {
        return await this.handleListTables();
      }
    );

    // Register describe_table tool
    this.mcpServer.tool(
      'describe_table',
      'Get column definitions, types, and constraints for a table',
      async (args: any) => {
        const table = args?.table;
        if (!table || typeof table !== 'string') {
          this.logger.warn('Invalid describe_table parameters', { params: args });
          throw new Error('Missing required parameter: table');
        }
        return await this.handleDescribeTable(table);
      }
    );

    // Register show_indexes tool
    this.mcpServer.tool(
      'show_indexes',
      'Show all indexes for a table',
      async (args: any) => {
        const table = args?.table;
        if (!table || typeof table !== 'string') {
          this.logger.warn('Invalid show_indexes parameters', { params: args });
          throw new Error('Missing required parameter: table');
        }
        return await this.handleShowIndexes(table);
      }
    );

    // Register begin_transaction tool
    this.mcpServer.tool(
      'begin_transaction',
      'Begin a new database transaction',
      async () => {
        return await this.handleBeginTransaction();
      }
    );

    // Register commit_transaction tool
    this.mcpServer.tool(
      'commit_transaction',
      'Commit the current transaction',
      async () => {
        return await this.handleCommitTransaction();
      }
    );

    // Register rollback_transaction tool
    this.mcpServer.tool(
      'rollback_transaction',
      'Rollback the current transaction',
      async () => {
        return await this.handleRollbackTransaction();
      }
    );
  }

  /**
   * Setup MCP resources
   * Registers resource handlers for database schema access
   * 
   * Requirements: 6.1, 6.2
   */
  private setupResources(): void {
    // Handle resources/list request using the SDK's schema
    (this.mcpServer.server as any).setRequestHandler(
      ListResourcesRequestSchema,
      async () => {
        try {
          this.logger.debug('Resources list requested');
          
          if (!this.resourceHandler) {
            this.logger.error('Resource handler not initialized');
            throw new Error('Resource handler not initialized');
          }

          const resources = await this.resourceHandler.listResources();
          
          this.logger.debug('Resources listed successfully', { count: resources.length });
          
          return {
            resources: resources.map((resource) => ({
              uri: resource.uri,
              name: resource.name,
              description: resource.description,
              mimeType: resource.mimeType,
            })),
          };
        } catch (error) {
          this.logger.error('Failed to list resources', { 
            error: error instanceof Error ? error.message : String(error) 
          });
          
          if (error instanceof Error) {
            throw new Error(`Failed to list resources: ${error.message}`);
          }
          throw new Error('Failed to list resources');
        }
      }
    );

    // Handle resources/read request using the SDK's schema
    (this.mcpServer.server as any).setRequestHandler(
      ReadResourceRequestSchema,
      async (request: any) => {
        try {
          if (!this.resourceHandler) {
            this.logger.error('Resource handler not initialized');
            throw new Error('Resource handler not initialized');
          }

          const { uri } = request.params;
          
          if (!uri || typeof uri !== 'string') {
            this.logger.warn('Invalid resource read parameters', { params: request.params });
            throw new Error('Missing required parameter: uri');
          }

          this.logger.debug('Resource read requested', { uri });

          const content = await this.resourceHandler.readResource(uri);
          
          this.logger.debug('Resource read successfully', { uri });
          
          return {
            contents: [
              {
                uri: content.uri,
                mimeType: content.mimeType,
                text: content.text,
              },
            ],
          };
        } catch (error) {
          this.logger.error('Failed to read resource', { 
            uri: request.params?.uri,
            error: error instanceof Error ? error.message : String(error) 
          });
          
          if (error instanceof Error) {
            throw new Error(`Failed to read resource: ${error.message}`);
          }
          throw new Error('Failed to read resource');
        }
      }
    );
  }

  /**
   * Handle query tool execution
   */
  private async handleQuery(sql: string): Promise<{
    content: Array<{ type: 'text'; text: string }>;
    isError?: boolean;
  }> {
    try {
      this.logger.debug('Executing query', { sql: sql.substring(0, 100) });
      
      // Validate the query
      const validationResult = this.validator.validate(sql);
      
      if (!validationResult.valid) {
        this.logger.warn('Query validation failed', { 
          sql: sql.substring(0, 100),
          error: validationResult.error 
        });
        
        return {
          content: [
            {
              type: 'text',
              text: `Query validation failed: ${validationResult.error}`,
            },
          ],
          isError: true,
        };
      }

      // Use the modified query (with LIMIT added if needed)
      const queryToExecute = validationResult.modifiedQuery || sql;

      // Execute the query
      const pool = this.dbManager.getPool();
      const [rows, fields] = await pool.query<RowDataPacket[]>(queryToExecute);

      // Format the result
      const result = this.formatQueryResult(rows, fields, validationResult.statementType);

      this.logger.info('Query executed successfully', { 
        statementType: validationResult.statementType,
        rowCount: Array.isArray(rows) ? rows.length : 0
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      this.logger.error('Query execution failed', { 
        sql: sql.substring(0, 100),
        error: error instanceof Error ? error.message : String(error) 
      });
      
      // Handle database errors
      const errorMessage = this.formatDatabaseError(error);
      
      return {
        content: [
          {
            type: 'text',
            text: errorMessage,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Handle list_tables tool execution
   * Lists all tables in the current database
   */
  private async handleListTables(): Promise<{
    content: Array<{ type: 'text'; text: string }>;
    isError?: boolean;
  }> {
    try {
      this.logger.debug('Listing tables');
      
      const pool = this.dbManager.getPool();
      const [rows] = await pool.query<RowDataPacket[]>('SHOW TABLES');

      // Extract table names from the result
      // The column name varies based on database name, so we get the first column
      const tables = rows.map((row) => {
        const firstKey = Object.keys(row)[0];
        return row[firstKey];
      });

      this.logger.info('Tables listed successfully', { count: tables.length });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ tables }, null, 2),
          },
        ],
      };
    } catch (error) {
      this.logger.error('Failed to list tables', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      
      const errorMessage = this.formatDatabaseError(error);
      return {
        content: [
          {
            type: 'text',
            text: errorMessage,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Handle describe_table tool execution
   * Returns column definitions, types, and constraints for a table
   */
  private async handleDescribeTable(table: string): Promise<{
    content: Array<{ type: 'text'; text: string }>;
    isError?: boolean;
  }> {
    try {
      this.logger.debug('Describing table', { table });
      
      const pool = this.dbManager.getPool();
      
      // Use DESCRIBE to get column information
      const [columns] = await pool.query<RowDataPacket[]>(`DESCRIBE \`${table}\``);

      // Format column information
      const formattedColumns = columns.map((col) => ({
        name: col.Field,
        type: col.Type,
        nullable: col.Null === 'YES',
        key: col.Key || '',
        default: col.Default,
        extra: col.Extra || '',
      }));

      this.logger.info('Table described successfully', { table, columnCount: formattedColumns.length });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ table, columns: formattedColumns }, null, 2),
          },
        ],
      };
    } catch (error) {
      // Check if the error is due to table not existing
      const mysqlError = error as any;
      if (mysqlError.code === 'ER_NO_SUCH_TABLE') {
        this.logger.warn('Table does not exist', { table });
        
        return {
          content: [
            {
              type: 'text',
              text: `Error: Table '${table}' does not exist`,
            },
          ],
          isError: true,
        };
      }

      this.logger.error('Failed to describe table', { 
        table,
        error: error instanceof Error ? error.message : String(error) 
      });

      const errorMessage = this.formatDatabaseError(error);
      return {
        content: [
          {
            type: 'text',
            text: errorMessage,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Handle show_indexes tool execution
   * Returns all indexes for a table
   */
  private async handleShowIndexes(table: string): Promise<{
    content: Array<{ type: 'text'; text: string }>;
    isError?: boolean;
  }> {
    try {
      this.logger.debug('Showing indexes', { table });
      
      const pool = this.dbManager.getPool();
      
      // Use SHOW INDEX to get index information
      const [indexes] = await pool.query<RowDataPacket[]>(`SHOW INDEX FROM \`${table}\``);

      // Format index information
      const formattedIndexes = indexes.map((idx) => ({
        name: idx.Key_name,
        column: idx.Column_name,
        unique: idx.Non_unique === 0,
        type: idx.Index_type,
        sequence: idx.Seq_in_index,
        collation: idx.Collation,
        cardinality: idx.Cardinality,
      }));

      this.logger.info('Indexes shown successfully', { table, indexCount: formattedIndexes.length });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ table, indexes: formattedIndexes }, null, 2),
          },
        ],
      };
    } catch (error) {
      // Check if the error is due to table not existing
      const mysqlError = error as any;
      if (mysqlError.code === 'ER_NO_SUCH_TABLE') {
        this.logger.warn('Table does not exist', { table });
        
        return {
          content: [
            {
              type: 'text',
              text: `Error: Table '${table}' does not exist`,
            },
          ],
          isError: true,
        };
      }

      this.logger.error('Failed to show indexes', { 
        table,
        error: error instanceof Error ? error.message : String(error) 
      });

      const errorMessage = this.formatDatabaseError(error);
      return {
        content: [
          {
            type: 'text',
            text: errorMessage,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Format query results into a JSON-compatible structure
   */
  private formatQueryResult(
    rows: any,
    fields: FieldPacket[] | undefined,
    statementType?: string
  ): any {
    // For SELECT queries, return rows and field information
    if (statementType === 'SELECT') {
      return {
        rows: this.sanitizeRows(rows),
        fields: fields?.map((field) => ({
          name: field.name,
          type: field.type,
          table: field.table,
        })),
        rowCount: Array.isArray(rows) ? rows.length : 0,
      };
    }

    // For INSERT, UPDATE, DELETE queries
    if (typeof rows === 'object' && 'affectedRows' in rows) {
      const okPacket = rows as OkPacket;
      return {
        affectedRows: okPacket.affectedRows,
        insertId: okPacket.insertId || undefined,
        warningCount: 0,
      };
    }

    // Fallback for other query types
    return {
      result: this.sanitizeRows(rows),
    };
  }

  /**
   * Sanitize rows to ensure JSON compatibility
   * Converts Buffers, Dates, and other non-JSON types to strings
   */
  private sanitizeRows(rows: any): any {
    if (Array.isArray(rows)) {
      return rows.map((row) => this.sanitizeRow(row));
    }
    return this.sanitizeRow(rows);
  }

  /**
   * Sanitize a single row object
   */
  private sanitizeRow(row: any): any {
    if (row === null || row === undefined) {
      return row;
    }

    if (row instanceof Date) {
      // Handle invalid dates gracefully
      try {
        return row.toISOString();
      } catch (error) {
        // If date is invalid, return null or a string representation
        return null;
      }
    }

    if (Buffer.isBuffer(row)) {
      return row.toString('utf-8');
    }

    if (typeof row === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(row)) {
        sanitized[key] = this.sanitizeRow(value);
      }
      return sanitized;
    }

    return row;
  }

  /**
   * Format database errors into user-friendly messages
   */
  private formatDatabaseError(error: unknown): string {
    if (error instanceof Error) {
      const mysqlError = error as any;
      
      // Extract SQL state and error code if available
      const errorInfo: any = {
        message: error.message,
      };

      if (mysqlError.code) {
        errorInfo.code = mysqlError.code;
      }

      if (mysqlError.sqlState) {
        errorInfo.sqlState = mysqlError.sqlState;
      }

      if (mysqlError.sql) {
        errorInfo.sql = mysqlError.sql;
      }

      return `Database error: ${JSON.stringify(errorInfo, null, 2)}`;
    }

    return `Unknown error: ${String(error)}`;
  }

  /**
   * Handle begin_transaction tool execution
   * Starts a new database transaction
   * 
   * Requirements: 8.1
   */
  private async handleBeginTransaction(): Promise<{
    content: Array<{ type: 'text'; text: string }>;
    isError?: boolean;
  }> {
    try {
      this.logger.debug('Beginning transaction');
      
      const pool = this.dbManager.getPool();
      await this.transactionManager.begin(pool);

      this.logger.info('Transaction started successfully');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ 
              success: true, 
              message: 'Transaction started successfully' 
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      this.logger.error('Failed to begin transaction', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      
      // Handle transaction errors (e.g., nested transaction attempt)
      if (error instanceof Error) {
        return {
          content: [
            {
              type: 'text',
              text: `Transaction error: ${error.message}`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: 'Unknown transaction error',
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Handle commit_transaction tool execution
   * Commits the current transaction
   * 
   * Requirements: 8.2
   */
  private async handleCommitTransaction(): Promise<{
    content: Array<{ type: 'text'; text: string }>;
    isError?: boolean;
  }> {
    try {
      this.logger.debug('Committing transaction');
      
      await this.transactionManager.commit();

      this.logger.info('Transaction committed successfully');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ 
              success: true, 
              message: 'Transaction committed successfully' 
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      this.logger.error('Failed to commit transaction', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      
      // Handle transaction errors (e.g., no active transaction)
      if (error instanceof Error) {
        return {
          content: [
            {
              type: 'text',
              text: `Transaction error: ${error.message}`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: 'Unknown transaction error',
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Handle rollback_transaction tool execution
   * Rolls back the current transaction
   * 
   * Requirements: 8.3
   */
  private async handleRollbackTransaction(): Promise<{
    content: Array<{ type: 'text'; text: string }>;
    isError?: boolean;
  }> {
    try {
      this.logger.debug('Rolling back transaction');
      
      await this.transactionManager.rollback();

      this.logger.info('Transaction rolled back successfully');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ 
              success: true, 
              message: 'Transaction rolled back successfully' 
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      this.logger.error('Failed to rollback transaction', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      
      // Handle transaction errors (e.g., no active transaction)
      if (error instanceof Error) {
        return {
          content: [
            {
              type: 'text',
              text: `Transaction error: ${error.message}`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: 'Unknown transaction error',
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    try {
      this.logger.info('Starting MySQL MCP Server...');
      
      // Connect to database
      await this.dbManager.connect();
      
      this.logger.info('Database connection established', {
        host: this.config.mysql.host,
        port: this.config.mysql.port,
        database: this.config.mysql.database,
      });

      // Initialize resource handler after database connection
      const pool = this.dbManager.getPool();
      this.resourceHandler = new ResourceHandler(pool, this.config.mysql.database);

      // Setup resources
      this.setupResources();

      // Setup graceful shutdown
      setupGracefulShutdown(this.dbManager);

      // Connect to stdio transport
      const transport = new StdioServerTransport();
      await this.mcpServer.connect(transport);

      this.logger.info('MySQL MCP Server started successfully');
    } catch (error) {
      this.logger.error('Failed to start MySQL MCP Server', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Stop the MCP server
   */
  async stop(): Promise<void> {
    try {
      this.logger.info('Stopping MySQL MCP Server...');
      
      await this.mcpServer.close();
      await this.dbManager.close();
      
      this.logger.info('MySQL MCP Server stopped successfully');
    } catch (error) {
      this.logger.error('Error stopping MySQL MCP Server', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

/**
 * Main entry point
 * 
 * Loads configuration from environment variables, validates it,
 * creates the MCP server instance, and starts it.
 * 
 * Handles startup errors and exits with non-zero status on failure.
 * 
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */
async function main() {
  try {
    // Load and validate configuration from environment variables
    // This will throw ConfigValidationError if validation fails
    const config = loadConfig();

    // Create and start server
    const server = new MySQLMCPServer(config);
    await server.start();
  } catch (error) {
    // Use console.error directly for startup errors since logger may not be initialized
    
    // Handle configuration validation errors with clear messages
    if (error instanceof ConfigValidationError) {
      console.error('Configuration validation failed:');
      console.error(error.message);
      console.error('\nPlease check your environment variables and ensure all required configuration is provided.');
      process.exit(1);
    }
    
    // Handle database connection errors
    if (error instanceof Error && error.name === 'DatabaseConnectionError') {
      console.error('Database connection failed:');
      console.error(error.message);
      console.error('\nPlease verify your database configuration and ensure the database server is running.');
      process.exit(1);
    }
    
    // Handle other errors
    console.error('Failed to start MySQL MCP Server:', error);
    
    if (error instanceof Error) {
      console.error('Error details:', {
        name: error.name,
        message: error.message,
      });
    }
    
    // Exit with non-zero status code to indicate failure
    process.exit(1);
  }
}

// Run the server
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
