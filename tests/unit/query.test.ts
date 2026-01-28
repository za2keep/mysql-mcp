import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ServerConfig } from '../../src/config';
import type { RowDataPacket, FieldPacket, OkPacket } from 'mysql2/promise';
import { QueryValidator } from '../../src/validator';

// We'll test the query handling logic by creating a test harness
// that simulates the MySQLMCPServer's query handling

describe('Query Tool Unit Tests', () => {
  let testConfig: ServerConfig;
  let mockPool: any;

  beforeEach(() => {
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
        enabled: false,
        level: 'info',
      },
    };

    mockPool = {
      query: vi.fn(),
    };
  });

  describe('Query Type Handling', () => {
    it('should execute SELECT query and return formatted results', async () => {
      const mockRows: RowDataPacket[] = [
        { id: 1, name: 'John', email: 'john@example.com' },
        { id: 2, name: 'Jane', email: 'jane@example.com' },
      ];
      const mockFields: FieldPacket[] = [
        { name: 'id', type: 3, table: 'users' } as FieldPacket,
        { name: 'name', type: 253, table: 'users' } as FieldPacket,
        { name: 'email', type: 253, table: 'users' } as FieldPacket,
      ];

      mockPool.query.mockResolvedValue([mockRows, mockFields]);

      const validator = new QueryValidator(testConfig.security);

      const sql = 'SELECT * FROM users';
      const validationResult = validator.validate(sql);
      expect(validationResult.valid).toBe(true);

      const [rows, fields] = await mockPool.query(validationResult.modifiedQuery || sql);

      // Verify the query was executed with LIMIT added
      expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM users LIMIT 1000');

      // Verify result structure
      expect(rows).toHaveLength(2);
      expect(fields).toHaveLength(3);
    });

    it('should execute INSERT query and return affected rows', async () => {
      const mockResult: OkPacket = {
        affectedRows: 1,
        insertId: 123,
        warningCount: 0,
      } as OkPacket;

      mockPool.query.mockResolvedValue([mockResult, undefined]);

      const validator = new QueryValidator(testConfig.security);

      const sql = 'INSERT INTO users (name, email) VALUES ("John", "john@example.com")';
      const validationResult = validator.validate(sql);
      expect(validationResult.valid).toBe(true);

      const [result] = await mockPool.query(sql);

      expect(mockPool.query).toHaveBeenCalledWith(sql);
      expect(result.affectedRows).toBe(1);
      expect(result.insertId).toBe(123);
    });

    it('should execute UPDATE query and return affected rows', async () => {
      const mockResult: OkPacket = {
        affectedRows: 3,
        insertId: 0,
        warningCount: 0,
      } as OkPacket;

      mockPool.query.mockResolvedValue([mockResult, undefined]);

      const validator = new QueryValidator(testConfig.security);

      const sql = 'UPDATE users SET active = 1 WHERE status = "pending"';
      const validationResult = validator.validate(sql);
      expect(validationResult.valid).toBe(true);

      const [result] = await mockPool.query(sql);

      expect(mockPool.query).toHaveBeenCalledWith(sql);
      expect(result.affectedRows).toBe(3);
    });

    it('should execute DELETE query and return affected rows', async () => {
      const mockResult: OkPacket = {
        affectedRows: 2,
        insertId: 0,
        warningCount: 0,
      } as OkPacket;

      mockPool.query.mockResolvedValue([mockResult, undefined]);

      const validator = new QueryValidator(testConfig.security);

      const sql = 'DELETE FROM users WHERE id > 100';
      const validationResult = validator.validate(sql);
      expect(validationResult.valid).toBe(true);

      const [result] = await mockPool.query(sql);

      expect(mockPool.query).toHaveBeenCalledWith(sql);
      expect(result.affectedRows).toBe(2);
    });
  });

  describe('Result Formatting', () => {
    it('should format SELECT results with rows, fields, and rowCount', async () => {
      const mockRows: RowDataPacket[] = [
        { id: 1, name: 'John' },
        { id: 2, name: 'Jane' },
      ];
      const mockFields: FieldPacket[] = [
        { name: 'id', type: 3, table: 'users' } as FieldPacket,
        { name: 'name', type: 253, table: 'users' } as FieldPacket,
      ];

      mockPool.query.mockResolvedValue([mockRows, mockFields]);

      const [rows, fields] = await mockPool.query('SELECT * FROM users LIMIT 1000');

      // Simulate result formatting
      const formattedResult = {
        rows: rows,
        fields: fields.map((field: FieldPacket) => ({
          name: field.name,
          type: field.type,
          table: field.table,
        })),
        rowCount: rows.length,
      };

      expect(formattedResult.rows).toHaveLength(2);
      expect(formattedResult.fields).toHaveLength(2);
      expect(formattedResult.rowCount).toBe(2);
      expect(formattedResult.fields[0]).toEqual({ name: 'id', type: 3, table: 'users' });
    });

    it('should format INSERT/UPDATE/DELETE results with affectedRows', async () => {
      const mockResult: OkPacket = {
        affectedRows: 5,
        insertId: 42,
        warningCount: 0,
      } as OkPacket;

      mockPool.query.mockResolvedValue([mockResult, undefined]);

      const [result] = await mockPool.query('INSERT INTO users VALUES (...)');

      // Simulate result formatting
      const formattedResult = {
        affectedRows: result.affectedRows,
        insertId: result.insertId || undefined,
        warningCount: 0,
      };

      expect(formattedResult.affectedRows).toBe(5);
      expect(formattedResult.insertId).toBe(42);
    });

    it('should handle empty result set', async () => {
      const mockRows: RowDataPacket[] = [];
      const mockFields: FieldPacket[] = [
        { name: 'id', type: 3, table: 'users' } as FieldPacket,
      ];

      mockPool.query.mockResolvedValue([mockRows, mockFields]);

      const [rows, fields] = await mockPool.query('SELECT * FROM users WHERE id = 999 LIMIT 1000');

      const formattedResult = {
        rows: rows,
        fields: fields.map((field: FieldPacket) => ({
          name: field.name,
          type: field.type,
          table: field.table,
        })),
        rowCount: rows.length,
      };

      expect(formattedResult.rows).toHaveLength(0);
      expect(formattedResult.rowCount).toBe(0);
      expect(formattedResult.fields).toHaveLength(1);
    });

    it('should sanitize Date objects to ISO strings', () => {
      const testDate = new Date('2024-01-15T10:30:00Z');
      const row = {
        id: 1,
        created_at: testDate,
      };

      // Simulate sanitization
      const sanitizeRow = (row: any): any => {
        if (row instanceof Date) {
          return row.toISOString();
        }
        if (typeof row === 'object' && row !== null) {
          const sanitized: any = {};
          for (const [key, value] of Object.entries(row)) {
            if (value instanceof Date) {
              sanitized[key] = value.toISOString();
            } else {
              sanitized[key] = value;
            }
          }
          return sanitized;
        }
        return row;
      };

      const sanitized = sanitizeRow(row);
      expect(sanitized.created_at).toBe('2024-01-15T10:30:00.000Z');
      expect(typeof sanitized.created_at).toBe('string');
    });

    it('should sanitize Buffer objects to UTF-8 strings', () => {
      const testBuffer = Buffer.from('Hello World', 'utf-8');
      const row = {
        id: 1,
        data: testBuffer,
      };

      // Simulate sanitization
      const sanitizeRow = (row: any): any => {
        if (Buffer.isBuffer(row)) {
          return row.toString('utf-8');
        }
        if (typeof row === 'object' && row !== null) {
          const sanitized: any = {};
          for (const [key, value] of Object.entries(row)) {
            if (Buffer.isBuffer(value)) {
              sanitized[key] = value.toString('utf-8');
            } else {
              sanitized[key] = value;
            }
          }
          return sanitized;
        }
        return row;
      };

      const sanitized = sanitizeRow(row);
      expect(sanitized.data).toBe('Hello World');
      expect(typeof sanitized.data).toBe('string');
    });

    it('should handle nested objects in result sanitization', () => {
      const row = {
        id: 1,
        metadata: {
          created_at: new Date('2024-01-15T10:30:00Z'),
          data: Buffer.from('test', 'utf-8'),
        },
      };

      // Simulate recursive sanitization
      const sanitizeRow = (row: any): any => {
        if (row === null || row === undefined) {
          return row;
        }
        if (row instanceof Date) {
          return row.toISOString();
        }
        if (Buffer.isBuffer(row)) {
          return row.toString('utf-8');
        }
        if (typeof row === 'object') {
          const sanitized: any = {};
          for (const [key, value] of Object.entries(row)) {
            sanitized[key] = sanitizeRow(value);
          }
          return sanitized;
        }
        return row;
      };

      const sanitized = sanitizeRow(row);
      expect(sanitized.metadata.created_at).toBe('2024-01-15T10:30:00.000Z');
      expect(sanitized.metadata.data).toBe('test');
    });

    it('should handle null and undefined values', () => {
      const row = {
        id: 1,
        name: 'John',
        email: null,
        phone: undefined,
      };

      const sanitizeRow = (row: any): any => {
        if (row === null || row === undefined) {
          return row;
        }
        if (typeof row === 'object') {
          const sanitized: any = {};
          for (const [key, value] of Object.entries(row)) {
            sanitized[key] = value;
          }
          return sanitized;
        }
        return row;
      };

      const sanitized = sanitizeRow(row);
      expect(sanitized.email).toBeNull();
      expect(sanitized.phone).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors', async () => {
      const connectionError = new Error('Connection lost') as any;
      connectionError.code = 'PROTOCOL_CONNECTION_LOST';
      connectionError.sqlState = 'HY000';

      mockPool.query.mockRejectedValue(connectionError);

      await expect(mockPool.query('SELECT * FROM users')).rejects.toThrow('Connection lost');
    });

    it('should handle syntax errors', async () => {
      const syntaxError = new Error('You have an error in your SQL syntax') as any;
      syntaxError.code = 'ER_PARSE_ERROR';
      syntaxError.sqlState = '42000';
      syntaxError.sql = 'SELCT * FROM users';

      mockPool.query.mockRejectedValue(syntaxError);

      try {
        await mockPool.query('SELCT * FROM users');
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).toContain('SQL syntax');
        expect(error.code).toBe('ER_PARSE_ERROR');
        expect(error.sqlState).toBe('42000');
      }
    });

    it('should handle table not found errors', async () => {
      const tableError = new Error("Table 'testdb.nonexistent' doesn't exist") as any;
      tableError.code = 'ER_NO_SUCH_TABLE';
      tableError.sqlState = '42S02';

      mockPool.query.mockRejectedValue(tableError);

      await expect(mockPool.query('SELECT * FROM nonexistent')).rejects.toThrow("doesn't exist");
    });

    it('should handle column not found errors', async () => {
      const columnError = new Error("Unknown column 'invalid_col' in 'field list'") as any;
      columnError.code = 'ER_BAD_FIELD_ERROR';
      columnError.sqlState = '42S22';

      mockPool.query.mockRejectedValue(columnError);

      await expect(mockPool.query('SELECT invalid_col FROM users')).rejects.toThrow('Unknown column');
    });

    it('should format database error with code and sqlState', () => {
      const error = new Error('Duplicate entry') as any;
      error.code = 'ER_DUP_ENTRY';
      error.sqlState = '23000';
      error.sql = 'INSERT INTO users (email) VALUES ("test@example.com")';

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
      expect(formatted).toContain('ER_DUP_ENTRY');
      expect(formatted).toContain('23000');
      expect(formatted).toContain('Duplicate entry');
    });

    it('should handle non-Error objects', () => {
      const formatDatabaseError = (error: unknown): string => {
        if (error instanceof Error) {
          return `Database error: ${error.message}`;
        }
        return `Unknown error: ${String(error)}`;
      };

      const stringError = 'Something went wrong';
      const formatted = formatDatabaseError(stringError);
      expect(formatted).toBe('Unknown error: Something went wrong');
    });

    it('should handle validation errors before query execution', () => {
      const validator = new QueryValidator(testConfig.security);

      const invalidSql = 'SELECT * FROM users; DROP TABLE users';
      const result = validator.validate(invalidSql);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Multiple statements');
      // Query should not be executed
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should handle empty query validation error', () => {
      const validator = new QueryValidator(testConfig.security);

      const result = validator.validate('');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Query cannot be empty');
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should handle DDL rejection error', () => {
      const validator = new QueryValidator(testConfig.security);

      const result = validator.validate('DROP TABLE users');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('DDL operations');
      expect(mockPool.query).not.toHaveBeenCalled();
    });
  });

  describe('Query Validation Integration', () => {
    it('should validate and modify SELECT query before execution', () => {
      const validator = new QueryValidator(testConfig.security);

      const sql = 'SELECT * FROM users WHERE active = 1';
      const result = validator.validate(sql);

      expect(result.valid).toBe(true);
      expect(result.modifiedQuery).toBe('SELECT * FROM users WHERE active = 1 LIMIT 1000');
      expect(result.statementType).toBe('SELECT');
    });

    it('should reject unsafe UPDATE without WHERE', () => {
      const validator = new QueryValidator(testConfig.security);

      const sql = 'UPDATE users SET active = 0';
      const result = validator.validate(sql);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('WHERE clause');
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should reject unsafe DELETE without WHERE', () => {
      const validator = new QueryValidator(testConfig.security);

      const sql = 'DELETE FROM users';
      const result = validator.validate(sql);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('WHERE clause');
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should allow safe UPDATE with WHERE', () => {
      const validator = new QueryValidator(testConfig.security);

      const sql = 'UPDATE users SET active = 0 WHERE id = 5';
      const result = validator.validate(sql);

      expect(result.valid).toBe(true);
      expect(result.statementType).toBe('UPDATE');
    });

    it('should allow safe DELETE with WHERE', () => {
      const validator = new QueryValidator(testConfig.security);

      const sql = 'DELETE FROM users WHERE id = 5';
      const result = validator.validate(sql);

      expect(result.valid).toBe(true);
      expect(result.statementType).toBe('DELETE');
    });
  });

  describe('JSON Compatibility', () => {
    it('should produce JSON-serializable results for SELECT', async () => {
      const mockRows: RowDataPacket[] = [
        {
          id: 1,
          name: 'John',
          created_at: new Date('2024-01-15T10:30:00Z'),
          data: Buffer.from('test', 'utf-8'),
        },
      ];
      const mockFields: FieldPacket[] = [
        { name: 'id', type: 3, table: 'users' } as FieldPacket,
      ];

      mockPool.query.mockResolvedValue([mockRows, mockFields]);

      const [rows] = await mockPool.query('SELECT * FROM users LIMIT 1');

      // Simulate sanitization
      const sanitizeRow = (row: any): any => {
        if (row === null || row === undefined) return row;
        if (row instanceof Date) return row.toISOString();
        if (Buffer.isBuffer(row)) return row.toString('utf-8');
        if (typeof row === 'object') {
          const sanitized: any = {};
          for (const [key, value] of Object.entries(row)) {
            sanitized[key] = sanitizeRow(value);
          }
          return sanitized;
        }
        return row;
      };

      const sanitizedRows = rows.map(sanitizeRow);
      const jsonString = JSON.stringify(sanitizedRows);

      expect(() => JSON.parse(jsonString)).not.toThrow();
      const parsed = JSON.parse(jsonString);
      expect(parsed[0].created_at).toBe('2024-01-15T10:30:00.000Z');
      expect(parsed[0].data).toBe('test');
    });

    it('should handle complex nested structures', () => {
      const complexRow = {
        id: 1,
        metadata: {
          timestamps: {
            created: new Date('2024-01-15T10:30:00Z'),
            updated: new Date('2024-01-16T15:45:00Z'),
          },
          binary: Buffer.from('binary data', 'utf-8'),
        },
        tags: ['tag1', 'tag2'],
      };

      const sanitizeRow = (row: any): any => {
        if (row === null || row === undefined) return row;
        if (row instanceof Date) return row.toISOString();
        if (Buffer.isBuffer(row)) return row.toString('utf-8');
        if (Array.isArray(row)) return row.map(sanitizeRow);
        if (typeof row === 'object') {
          const sanitized: any = {};
          for (const [key, value] of Object.entries(row)) {
            sanitized[key] = sanitizeRow(value);
          }
          return sanitized;
        }
        return row;
      };

      const sanitized = sanitizeRow(complexRow);
      const jsonString = JSON.stringify(sanitized);

      expect(() => JSON.parse(jsonString)).not.toThrow();
      const parsed = JSON.parse(jsonString);
      expect(parsed.metadata.timestamps.created).toBe('2024-01-15T10:30:00.000Z');
      expect(parsed.metadata.binary).toBe('binary data');
      expect(parsed.tags).toEqual(['tag1', 'tag2']);
    });
  });
});
