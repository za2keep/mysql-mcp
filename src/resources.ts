import type { Pool, RowDataPacket } from 'mysql2/promise';

/**
 * MCP Resource representation
 */
export interface Resource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

/**
 * MCP Resource content
 */
export interface ResourceContent {
  uri: string;
  mimeType: string;
  text: string;
}

/**
 * Parsed resource URI components
 */
interface ParsedResourceURI {
  database: string;
  table: string;
}

/**
 * Resource handler error
 */
export class ResourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResourceError';
  }
}

/**
 * ResourceHandler class manages MCP resources for database schema
 * Provides access to table schemas as MCP resources
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4
 */
export class ResourceHandler {
  private pool: Pool;
  private databaseName: string;

  constructor(pool: Pool, databaseName: string) {
    this.pool = pool;
    this.databaseName = databaseName;
  }

  /**
   * List all available resources (table schemas)
   * Returns a resource for each table in the database
   * 
   * Requirements: 6.1, 6.3
   * 
   * @returns Array of Resource objects
   */
  async listResources(): Promise<Resource[]> {
    try {
      // Get all tables in the database
      const [rows] = await this.pool.query<RowDataPacket[]>('SHOW TABLES');

      // Extract table names
      const tables = rows.map((row) => {
        const firstKey = Object.keys(row)[0];
        return row[firstKey] as string;
      });

      // Create resource for each table
      return tables.map((table) => ({
        uri: `mysql://${this.databaseName}/${table}`,
        name: `${table} schema`,
        description: `Schema information for table ${table}`,
        mimeType: 'application/json',
      }));
    } catch (error) {
      if (error instanceof Error) {
        throw new ResourceError(`Failed to list resources: ${error.message}`);
      }
      throw new ResourceError('Failed to list resources');
    }
  }

  /**
   * Read a specific resource by URI
   * Returns the table schema as structured JSON
   * 
   * Requirements: 6.2, 6.3, 6.4
   * 
   * @param uri - Resource URI in format "mysql://database/table"
   * @returns ResourceContent with table schema
   * @throws ResourceError if URI is invalid or table doesn't exist
   */
  async readResource(uri: string): Promise<ResourceContent> {
    try {
      // Parse the URI
      const { database, table } = this.parseResourceURI(uri);

      // Validate database matches current database
      if (database !== this.databaseName) {
        throw new ResourceError(
          `Database mismatch: URI specifies '${database}' but connected to '${this.databaseName}'`
        );
      }

      // Get table schema
      const schema = await this.getTableSchema(table);

      // Return structured content
      return {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(schema, null, 2),
      };
    } catch (error) {
      if (error instanceof ResourceError) {
        throw error;
      }
      if (error instanceof Error) {
        throw new ResourceError(`Failed to read resource: ${error.message}`);
      }
      throw new ResourceError('Failed to read resource');
    }
  }

  /**
   * Parse a resource URI into components
   * Expected format: mysql://database/table
   * 
   * Requirements: 6.3
   * 
   * @param uri - Resource URI to parse
   * @returns Parsed URI components
   * @throws ResourceError if URI format is invalid
   */
  private parseResourceURI(uri: string): ParsedResourceURI {
    // Check if URI starts with mysql://
    if (!uri.startsWith('mysql://')) {
      throw new ResourceError(`Invalid resource URI: must start with 'mysql://'`);
    }

    // Remove protocol prefix
    const path = uri.substring('mysql://'.length);

    // Split into database and table
    const parts = path.split('/');
    
    if (parts.length !== 2) {
      throw new ResourceError(
        `Invalid resource URI format: expected 'mysql://database/table', got '${uri}'`
      );
    }

    const [database, table] = parts;

    if (!database || !table) {
      throw new ResourceError(
        `Invalid resource URI: database and table names cannot be empty`
      );
    }

    return { database, table };
  }

  /**
   * Get complete schema information for a table
   * Includes columns, indexes, and constraints
   * 
   * Requirements: 6.2, 6.4
   * 
   * @param table - Table name
   * @returns Table schema object
   * @throws Error if table doesn't exist
   */
  private async getTableSchema(table: string): Promise<any> {
    try {
      // Get column information
      const [columns] = await this.pool.query<RowDataPacket[]>(
        `DESCRIBE \`${table}\``
      );

      // Get index information
      const [indexes] = await this.pool.query<RowDataPacket[]>(
        `SHOW INDEX FROM \`${table}\``
      );

      // Format column information
      const formattedColumns = columns.map((col) => ({
        name: col.Field,
        type: col.Type,
        nullable: col.Null === 'YES',
        key: col.Key || '',
        default: col.Default,
        extra: col.Extra || '',
      }));

      // Format index information
      const formattedIndexes = indexes.map((idx) => ({
        name: idx.Key_name,
        column: idx.Column_name,
        unique: idx.Non_unique === 0,
        type: idx.Index_type,
        sequence: idx.Seq_in_index,
      }));

      return {
        table,
        database: this.databaseName,
        columns: formattedColumns,
        indexes: formattedIndexes,
      };
    } catch (error) {
      // Check if the error is due to table not existing
      const mysqlError = error as any;
      if (mysqlError.code === 'ER_NO_SUCH_TABLE') {
        throw new ResourceError(`Table '${table}' does not exist`);
      }
      throw error;
    }
  }
}
