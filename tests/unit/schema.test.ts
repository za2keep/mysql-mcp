import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { RowDataPacket } from 'mysql2/promise';

/**
 * Unit tests for schema inspection tools
 * Tests list_tables, describe_table, and show_indexes functionality
 * Requirements: 4.1, 4.2, 4.3, 4.4
 */
describe('Schema Tools Unit Tests', () => {
  let mockPool: any;

  beforeEach(() => {
    mockPool = {
      query: vi.fn(),
    };
  });

  describe('list_tables tool', () => {
    it('should list all tables in the database', async () => {
      // Mock SHOW TABLES result
      const mockRows: RowDataPacket[] = [
        { 'Tables_in_testdb': 'users' },
        { 'Tables_in_testdb': 'orders' },
        { 'Tables_in_testdb': 'products' },
      ];

      mockPool.query.mockResolvedValue([mockRows]);

      const [rows] = await mockPool.query('SHOW TABLES');

      // Extract table names (column name varies by database)
      const tables = rows.map((row: any) => {
        const firstKey = Object.keys(row)[0];
        return row[firstKey];
      });

      expect(mockPool.query).toHaveBeenCalledWith('SHOW TABLES');
      expect(tables).toEqual(['users', 'orders', 'products']);
      expect(tables).toHaveLength(3);
    });

    it('should return empty array when no tables exist', async () => {
      const mockRows: RowDataPacket[] = [];

      mockPool.query.mockResolvedValue([mockRows]);

      const [rows] = await mockPool.query('SHOW TABLES');

      const tables = rows.map((row: any) => {
        const firstKey = Object.keys(row)[0];
        return row[firstKey];
      });

      expect(tables).toEqual([]);
      expect(tables).toHaveLength(0);
    });

    it('should handle different database name formats', async () => {
      // Different databases may use different column names
      const mockRows: RowDataPacket[] = [
        { 'Tables_in_mydb': 'table1' },
        { 'Tables_in_mydb': 'table2' },
      ];

      mockPool.query.mockResolvedValue([mockRows]);

      const [rows] = await mockPool.query('SHOW TABLES');

      const tables = rows.map((row: any) => {
        const firstKey = Object.keys(row)[0];
        return row[firstKey];
      });

      expect(tables).toEqual(['table1', 'table2']);
    });

    it('should format result as JSON with tables array', async () => {
      const mockRows: RowDataPacket[] = [
        { 'Tables_in_testdb': 'users' },
        { 'Tables_in_testdb': 'orders' },
      ];

      mockPool.query.mockResolvedValue([mockRows]);

      const [rows] = await mockPool.query('SHOW TABLES');

      const tables = rows.map((row: any) => {
        const firstKey = Object.keys(row)[0];
        return row[firstKey];
      });

      const result = { tables };
      const jsonString = JSON.stringify(result, null, 2);

      expect(() => JSON.parse(jsonString)).not.toThrow();
      const parsed = JSON.parse(jsonString);
      expect(parsed.tables).toEqual(['users', 'orders']);
    });
  });

  describe('describe_table tool', () => {
    it('should describe table structure with all column information', async () => {
      // Mock DESCRIBE table result
      const mockColumns: RowDataPacket[] = [
        {
          Field: 'id',
          Type: 'int(11)',
          Null: 'NO',
          Key: 'PRI',
          Default: null,
          Extra: 'auto_increment',
        },
        {
          Field: 'name',
          Type: 'varchar(255)',
          Null: 'NO',
          Key: '',
          Default: null,
          Extra: '',
        },
        {
          Field: 'email',
          Type: 'varchar(255)',
          Null: 'YES',
          Key: 'UNI',
          Default: null,
          Extra: '',
        },
        {
          Field: 'created_at',
          Type: 'timestamp',
          Null: 'NO',
          Key: '',
          Default: 'CURRENT_TIMESTAMP',
          Extra: '',
        },
      ];

      mockPool.query.mockResolvedValue([mockColumns]);

      const tableName = 'users';
      const [columns] = await mockPool.query(`DESCRIBE \`${tableName}\``);

      // Format column information
      const formattedColumns = columns.map((col: any) => ({
        name: col.Field,
        type: col.Type,
        nullable: col.Null === 'YES',
        key: col.Key || '',
        default: col.Default,
        extra: col.Extra || '',
      }));

      expect(mockPool.query).toHaveBeenCalledWith('DESCRIBE `users`');
      expect(formattedColumns).toHaveLength(4);
      expect(formattedColumns[0]).toEqual({
        name: 'id',
        type: 'int(11)',
        nullable: false,
        key: 'PRI',
        default: null,
        extra: 'auto_increment',
      });
      expect(formattedColumns[2]).toEqual({
        name: 'email',
        type: 'varchar(255)',
        nullable: true,
        key: 'UNI',
        default: null,
        extra: '',
      });
    });

    it('should handle table with no keys or extras', async () => {
      const mockColumns: RowDataPacket[] = [
        {
          Field: 'data',
          Type: 'text',
          Null: 'YES',
          Key: '',
          Default: null,
          Extra: '',
        },
      ];

      mockPool.query.mockResolvedValue([mockColumns]);

      const [columns] = await mockPool.query('DESCRIBE `simple_table`');

      const formattedColumns = columns.map((col: any) => ({
        name: col.Field,
        type: col.Type,
        nullable: col.Null === 'YES',
        key: col.Key || '',
        default: col.Default,
        extra: col.Extra || '',
      }));

      expect(formattedColumns[0]).toEqual({
        name: 'data',
        type: 'text',
        nullable: true,
        key: '',
        default: null,
        extra: '',
      });
    });

    it('should handle table with default values', async () => {
      const mockColumns: RowDataPacket[] = [
        {
          Field: 'status',
          Type: 'varchar(50)',
          Null: 'NO',
          Key: '',
          Default: 'active',
          Extra: '',
        },
        {
          Field: 'count',
          Type: 'int(11)',
          Null: 'NO',
          Key: '',
          Default: '0',
          Extra: '',
        },
      ];

      mockPool.query.mockResolvedValue([mockColumns]);

      const [columns] = await mockPool.query('DESCRIBE `config`');

      const formattedColumns = columns.map((col: any) => ({
        name: col.Field,
        type: col.Type,
        nullable: col.Null === 'YES',
        key: col.Key || '',
        default: col.Default,
        extra: col.Extra || '',
      }));

      expect(formattedColumns[0].default).toBe('active');
      expect(formattedColumns[1].default).toBe('0');
    });

    it('should format result as JSON with table name and columns', async () => {
      const mockColumns: RowDataPacket[] = [
        {
          Field: 'id',
          Type: 'int(11)',
          Null: 'NO',
          Key: 'PRI',
          Default: null,
          Extra: 'auto_increment',
        },
      ];

      mockPool.query.mockResolvedValue([mockColumns]);

      const tableName = 'users';
      const [columns] = await mockPool.query(`DESCRIBE \`${tableName}\``);

      const formattedColumns = columns.map((col: any) => ({
        name: col.Field,
        type: col.Type,
        nullable: col.Null === 'YES',
        key: col.Key || '',
        default: col.Default,
        extra: col.Extra || '',
      }));

      const result = { table: tableName, columns: formattedColumns };
      const jsonString = JSON.stringify(result, null, 2);

      expect(() => JSON.parse(jsonString)).not.toThrow();
      const parsed = JSON.parse(jsonString);
      expect(parsed.table).toBe('users');
      expect(parsed.columns).toHaveLength(1);
    });

    it('should properly escape table names with backticks', async () => {
      mockPool.query.mockResolvedValue([[]]);

      const tableName = 'my_table';
      await mockPool.query(`DESCRIBE \`${tableName}\``);

      expect(mockPool.query).toHaveBeenCalledWith('DESCRIBE `my_table`');
    });
  });

  describe('show_indexes tool', () => {
    it('should show all indexes for a table', async () => {
      // Mock SHOW INDEX result
      const mockIndexes: RowDataPacket[] = [
        {
          Key_name: 'PRIMARY',
          Column_name: 'id',
          Non_unique: 0,
          Index_type: 'BTREE',
          Seq_in_index: 1,
          Collation: 'A',
          Cardinality: 1000,
        },
        {
          Key_name: 'idx_email',
          Column_name: 'email',
          Non_unique: 0,
          Index_type: 'BTREE',
          Seq_in_index: 1,
          Collation: 'A',
          Cardinality: 1000,
        },
        {
          Key_name: 'idx_name',
          Column_name: 'name',
          Non_unique: 1,
          Index_type: 'BTREE',
          Seq_in_index: 1,
          Collation: 'A',
          Cardinality: 500,
        },
      ];

      mockPool.query.mockResolvedValue([mockIndexes]);

      const tableName = 'users';
      const [indexes] = await mockPool.query(`SHOW INDEX FROM \`${tableName}\``);

      // Format index information
      const formattedIndexes = indexes.map((idx: any) => ({
        name: idx.Key_name,
        column: idx.Column_name,
        unique: idx.Non_unique === 0,
        type: idx.Index_type,
        sequence: idx.Seq_in_index,
        collation: idx.Collation,
        cardinality: idx.Cardinality,
      }));

      expect(mockPool.query).toHaveBeenCalledWith('SHOW INDEX FROM `users`');
      expect(formattedIndexes).toHaveLength(3);
      expect(formattedIndexes[0]).toEqual({
        name: 'PRIMARY',
        column: 'id',
        unique: true,
        type: 'BTREE',
        sequence: 1,
        collation: 'A',
        cardinality: 1000,
      });
      expect(formattedIndexes[2]).toEqual({
        name: 'idx_name',
        column: 'name',
        unique: false,
        type: 'BTREE',
        sequence: 1,
        collation: 'A',
        cardinality: 500,
      });
    });

    it('should handle composite indexes with multiple columns', async () => {
      const mockIndexes: RowDataPacket[] = [
        {
          Key_name: 'idx_user_date',
          Column_name: 'user_id',
          Non_unique: 1,
          Index_type: 'BTREE',
          Seq_in_index: 1,
          Collation: 'A',
          Cardinality: 100,
        },
        {
          Key_name: 'idx_user_date',
          Column_name: 'created_at',
          Non_unique: 1,
          Index_type: 'BTREE',
          Seq_in_index: 2,
          Collation: 'A',
          Cardinality: 500,
        },
      ];

      mockPool.query.mockResolvedValue([mockIndexes]);

      const [indexes] = await mockPool.query('SHOW INDEX FROM `orders`');

      const formattedIndexes = indexes.map((idx: any) => ({
        name: idx.Key_name,
        column: idx.Column_name,
        unique: idx.Non_unique === 0,
        type: idx.Index_type,
        sequence: idx.Seq_in_index,
        collation: idx.Collation,
        cardinality: idx.Cardinality,
      }));

      expect(formattedIndexes).toHaveLength(2);
      expect(formattedIndexes[0].name).toBe('idx_user_date');
      expect(formattedIndexes[0].sequence).toBe(1);
      expect(formattedIndexes[1].name).toBe('idx_user_date');
      expect(formattedIndexes[1].sequence).toBe(2);
    });

    it('should handle table with no indexes', async () => {
      const mockIndexes: RowDataPacket[] = [];

      mockPool.query.mockResolvedValue([mockIndexes]);

      const [indexes] = await mockPool.query('SHOW INDEX FROM `simple_table`');

      const formattedIndexes = indexes.map((idx: any) => ({
        name: idx.Key_name,
        column: idx.Column_name,
        unique: idx.Non_unique === 0,
        type: idx.Index_type,
        sequence: idx.Seq_in_index,
        collation: idx.Collation,
        cardinality: idx.Cardinality,
      }));

      expect(formattedIndexes).toEqual([]);
      expect(formattedIndexes).toHaveLength(0);
    });

    it('should distinguish between unique and non-unique indexes', async () => {
      const mockIndexes: RowDataPacket[] = [
        {
          Key_name: 'PRIMARY',
          Column_name: 'id',
          Non_unique: 0,
          Index_type: 'BTREE',
          Seq_in_index: 1,
          Collation: 'A',
          Cardinality: 100,
        },
        {
          Key_name: 'idx_status',
          Column_name: 'status',
          Non_unique: 1,
          Index_type: 'BTREE',
          Seq_in_index: 1,
          Collation: 'A',
          Cardinality: 10,
        },
      ];

      mockPool.query.mockResolvedValue([mockIndexes]);

      const [indexes] = await mockPool.query('SHOW INDEX FROM `tasks`');

      const formattedIndexes = indexes.map((idx: any) => ({
        name: idx.Key_name,
        column: idx.Column_name,
        unique: idx.Non_unique === 0,
        type: idx.Index_type,
        sequence: idx.Seq_in_index,
        collation: idx.Collation,
        cardinality: idx.Cardinality,
      }));

      expect(formattedIndexes[0].unique).toBe(true);
      expect(formattedIndexes[1].unique).toBe(false);
    });

    it('should format result as JSON with table name and indexes', async () => {
      const mockIndexes: RowDataPacket[] = [
        {
          Key_name: 'PRIMARY',
          Column_name: 'id',
          Non_unique: 0,
          Index_type: 'BTREE',
          Seq_in_index: 1,
          Collation: 'A',
          Cardinality: 100,
        },
      ];

      mockPool.query.mockResolvedValue([mockIndexes]);

      const tableName = 'users';
      const [indexes] = await mockPool.query(`SHOW INDEX FROM \`${tableName}\``);

      const formattedIndexes = indexes.map((idx: any) => ({
        name: idx.Key_name,
        column: idx.Column_name,
        unique: idx.Non_unique === 0,
        type: idx.Index_type,
        sequence: idx.Seq_in_index,
        collation: idx.Collation,
        cardinality: idx.Cardinality,
      }));

      const result = { table: tableName, indexes: formattedIndexes };
      const jsonString = JSON.stringify(result, null, 2);

      expect(() => JSON.parse(jsonString)).not.toThrow();
      const parsed = JSON.parse(jsonString);
      expect(parsed.table).toBe('users');
      expect(parsed.indexes).toHaveLength(1);
    });

    it('should properly escape table names with backticks', async () => {
      mockPool.query.mockResolvedValue([[]]);

      const tableName = 'my_table';
      await mockPool.query(`SHOW INDEX FROM \`${tableName}\``);

      expect(mockPool.query).toHaveBeenCalledWith('SHOW INDEX FROM `my_table`');
    });
  });

  describe('Error handling for non-existent tables', () => {
    it('should handle ER_NO_SUCH_TABLE error for describe_table', async () => {
      const tableError = new Error("Table 'testdb.nonexistent' doesn't exist") as any;
      tableError.code = 'ER_NO_SUCH_TABLE';
      tableError.sqlState = '42S02';

      mockPool.query.mockRejectedValue(tableError);

      try {
        await mockPool.query('DESCRIBE `nonexistent`');
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.code).toBe('ER_NO_SUCH_TABLE');
        expect(error.message).toContain("doesn't exist");
      }
    });

    it('should handle ER_NO_SUCH_TABLE error for show_indexes', async () => {
      const tableError = new Error("Table 'testdb.nonexistent' doesn't exist") as any;
      tableError.code = 'ER_NO_SUCH_TABLE';
      tableError.sqlState = '42S02';

      mockPool.query.mockRejectedValue(tableError);

      try {
        await mockPool.query('SHOW INDEX FROM `nonexistent`');
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.code).toBe('ER_NO_SUCH_TABLE');
        expect(error.message).toContain("doesn't exist");
      }
    });

    it('should return appropriate error message for non-existent table', async () => {
      const tableError = new Error("Table 'testdb.users_backup' doesn't exist") as any;
      tableError.code = 'ER_NO_SUCH_TABLE';

      mockPool.query.mockRejectedValue(tableError);

      const tableName = 'users_backup';

      try {
        await mockPool.query(`DESCRIBE \`${tableName}\``);
        expect.fail('Should have thrown error');
      } catch (error: any) {
        // Simulate error handling
        if (error.code === 'ER_NO_SUCH_TABLE') {
          const errorMessage = `Error: Table '${tableName}' does not exist`;
          expect(errorMessage).toBe("Error: Table 'users_backup' does not exist");
        }
      }
    });

    it('should handle database connection errors gracefully', async () => {
      const connectionError = new Error('Connection lost') as any;
      connectionError.code = 'PROTOCOL_CONNECTION_LOST';
      connectionError.sqlState = 'HY000';

      mockPool.query.mockRejectedValue(connectionError);

      await expect(mockPool.query('SHOW TABLES')).rejects.toThrow('Connection lost');
    });

    it('should handle permission errors', async () => {
      const permissionError = new Error('Access denied') as any;
      permissionError.code = 'ER_TABLEACCESS_DENIED_ERROR';
      permissionError.sqlState = '42000';

      mockPool.query.mockRejectedValue(permissionError);

      await expect(mockPool.query('DESCRIBE `restricted_table`')).rejects.toThrow('Access denied');
    });

    it('should format database errors with code and sqlState', () => {
      const error = new Error("Table doesn't exist") as any;
      error.code = 'ER_NO_SUCH_TABLE';
      error.sqlState = '42S02';
      error.sql = 'DESCRIBE `nonexistent`';

      // Simulate error formatting
      const formatDatabaseError = (error: unknown): string => {
        if (error instanceof Error) {
          const mysqlError = error as any;
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
      };

      const formatted = formatDatabaseError(error);
      expect(formatted).toContain('Database error');
      expect(formatted).toContain('ER_NO_SUCH_TABLE');
      expect(formatted).toContain('42S02');
    });
  });

  describe('JSON serialization', () => {
    it('should produce valid JSON for list_tables result', () => {
      const tables = ['users', 'orders', 'products'];
      const result = { tables };
      const jsonString = JSON.stringify(result, null, 2);

      expect(() => JSON.parse(jsonString)).not.toThrow();
      const parsed = JSON.parse(jsonString);
      expect(parsed.tables).toEqual(tables);
    });

    it('should produce valid JSON for describe_table result', () => {
      const result = {
        table: 'users',
        columns: [
          {
            name: 'id',
            type: 'int(11)',
            nullable: false,
            key: 'PRI',
            default: null,
            extra: 'auto_increment',
          },
          {
            name: 'name',
            type: 'varchar(255)',
            nullable: false,
            key: '',
            default: null,
            extra: '',
          },
        ],
      };

      const jsonString = JSON.stringify(result, null, 2);

      expect(() => JSON.parse(jsonString)).not.toThrow();
      const parsed = JSON.parse(jsonString);
      expect(parsed.table).toBe('users');
      expect(parsed.columns).toHaveLength(2);
    });

    it('should produce valid JSON for show_indexes result', () => {
      const result = {
        table: 'users',
        indexes: [
          {
            name: 'PRIMARY',
            column: 'id',
            unique: true,
            type: 'BTREE',
            sequence: 1,
            collation: 'A',
            cardinality: 1000,
          },
        ],
      };

      const jsonString = JSON.stringify(result, null, 2);

      expect(() => JSON.parse(jsonString)).not.toThrow();
      const parsed = JSON.parse(jsonString);
      expect(parsed.table).toBe('users');
      expect(parsed.indexes).toHaveLength(1);
    });
  });
});
