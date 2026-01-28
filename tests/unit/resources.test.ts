import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ResourceHandler, ResourceError } from '../../src/resources';
import type { RowDataPacket } from 'mysql2/promise';

/**
 * Unit tests for ResourceHandler
 * Tests resource listing, reading, and URI parsing
 * Requirements: 6.1, 6.2, 6.3, 6.4
 */
describe('ResourceHandler Unit Tests', () => {
  let mockPool: any;
  let resourceHandler: ResourceHandler;
  const testDatabase = 'testdb';

  beforeEach(() => {
    mockPool = {
      query: vi.fn(),
    };
    resourceHandler = new ResourceHandler(mockPool, testDatabase);
  });

  describe('listResources', () => {
    it('should list all table resources in the database', async () => {
      // Mock SHOW TABLES result
      const mockRows: RowDataPacket[] = [
        { 'Tables_in_testdb': 'users' },
        { 'Tables_in_testdb': 'orders' },
        { 'Tables_in_testdb': 'products' },
      ];

      mockPool.query.mockResolvedValue([mockRows]);

      const resources = await resourceHandler.listResources();

      expect(mockPool.query).toHaveBeenCalledWith('SHOW TABLES');
      expect(resources).toHaveLength(3);
      expect(resources[0]).toEqual({
        uri: 'mysql://testdb/users',
        name: 'users schema',
        description: 'Schema information for table users',
        mimeType: 'application/json',
      });
      expect(resources[1]).toEqual({
        uri: 'mysql://testdb/orders',
        name: 'orders schema',
        description: 'Schema information for table orders',
        mimeType: 'application/json',
      });
      expect(resources[2]).toEqual({
        uri: 'mysql://testdb/products',
        name: 'products schema',
        description: 'Schema information for table products',
        mimeType: 'application/json',
      });
    });

    it('should return empty array when no tables exist', async () => {
      const mockRows: RowDataPacket[] = [];

      mockPool.query.mockResolvedValue([mockRows]);

      const resources = await resourceHandler.listResources();

      expect(resources).toEqual([]);
      expect(resources).toHaveLength(0);
    });

    it('should handle different database column name formats', async () => {
      // Different databases may use different column names
      const mockRows: RowDataPacket[] = [
        { 'Tables_in_mydb': 'table1' },
        { 'Tables_in_mydb': 'table2' },
      ];

      mockPool.query.mockResolvedValue([mockRows]);

      const resources = await resourceHandler.listResources();

      expect(resources).toHaveLength(2);
      expect(resources[0].uri).toBe('mysql://testdb/table1');
      expect(resources[1].uri).toBe('mysql://testdb/table2');
    });

    it('should throw ResourceError on database failure', async () => {
      const dbError = new Error('Connection lost');
      mockPool.query.mockRejectedValue(dbError);

      await expect(resourceHandler.listResources()).rejects.toThrow(ResourceError);
      await expect(resourceHandler.listResources()).rejects.toThrow('Failed to list resources: Connection lost');
    });

    it('should format all resources with correct mimeType', async () => {
      const mockRows: RowDataPacket[] = [
        { 'Tables_in_testdb': 'users' },
        { 'Tables_in_testdb': 'orders' },
      ];

      mockPool.query.mockResolvedValue([mockRows]);

      const resources = await resourceHandler.listResources();

      resources.forEach((resource) => {
        expect(resource.mimeType).toBe('application/json');
      });
    });

    it('should include database name in URI', async () => {
      const mockRows: RowDataPacket[] = [
        { 'Tables_in_testdb': 'users' },
      ];

      mockPool.query.mockResolvedValue([mockRows]);

      const resources = await resourceHandler.listResources();

      expect(resources[0].uri).toContain(testDatabase);
      expect(resources[0].uri).toBe(`mysql://${testDatabase}/users`);
    });
  });

  describe('readResource', () => {
    it('should read table schema resource successfully', async () => {
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
      ];

      const mockIndexes: RowDataPacket[] = [
        {
          Key_name: 'PRIMARY',
          Column_name: 'id',
          Non_unique: 0,
          Index_type: 'BTREE',
          Seq_in_index: 1,
        },
      ];

      mockPool.query
        .mockResolvedValueOnce([mockColumns])
        .mockResolvedValueOnce([mockIndexes]);

      const uri = 'mysql://testdb/users';
      const content = await resourceHandler.readResource(uri);

      expect(content.uri).toBe(uri);
      expect(content.mimeType).toBe('application/json');
      expect(content.text).toBeTruthy();

      const schema = JSON.parse(content.text);
      expect(schema.table).toBe('users');
      expect(schema.database).toBe('testdb');
      expect(schema.columns).toHaveLength(2);
      expect(schema.indexes).toHaveLength(1);
    });

    it('should return structured JSON content', async () => {
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

      const mockIndexes: RowDataPacket[] = [];

      mockPool.query
        .mockResolvedValueOnce([mockColumns])
        .mockResolvedValueOnce([mockIndexes]);

      const content = await resourceHandler.readResource('mysql://testdb/users');

      expect(() => JSON.parse(content.text)).not.toThrow();
      const schema = JSON.parse(content.text);
      expect(schema).toHaveProperty('table');
      expect(schema).toHaveProperty('database');
      expect(schema).toHaveProperty('columns');
      expect(schema).toHaveProperty('indexes');
    });

    it('should include column details in schema', async () => {
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
          Field: 'email',
          Type: 'varchar(255)',
          Null: 'YES',
          Key: 'UNI',
          Default: null,
          Extra: '',
        },
      ];

      const mockIndexes: RowDataPacket[] = [];

      mockPool.query
        .mockResolvedValueOnce([mockColumns])
        .mockResolvedValueOnce([mockIndexes]);

      const content = await resourceHandler.readResource('mysql://testdb/users');
      const schema = JSON.parse(content.text);

      expect(schema.columns[0]).toEqual({
        name: 'id',
        type: 'int(11)',
        nullable: false,
        key: 'PRI',
        default: null,
        extra: 'auto_increment',
      });
      expect(schema.columns[1]).toEqual({
        name: 'email',
        type: 'varchar(255)',
        nullable: true,
        key: 'UNI',
        default: null,
        extra: '',
      });
    });

    it('should include index details in schema', async () => {
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

      const mockIndexes: RowDataPacket[] = [
        {
          Key_name: 'PRIMARY',
          Column_name: 'id',
          Non_unique: 0,
          Index_type: 'BTREE',
          Seq_in_index: 1,
        },
        {
          Key_name: 'idx_email',
          Column_name: 'email',
          Non_unique: 0,
          Index_type: 'BTREE',
          Seq_in_index: 1,
        },
      ];

      mockPool.query
        .mockResolvedValueOnce([mockColumns])
        .mockResolvedValueOnce([mockIndexes]);

      const content = await resourceHandler.readResource('mysql://testdb/users');
      const schema = JSON.parse(content.text);

      expect(schema.indexes).toHaveLength(2);
      expect(schema.indexes[0]).toEqual({
        name: 'PRIMARY',
        column: 'id',
        unique: true,
        type: 'BTREE',
        sequence: 1,
      });
      expect(schema.indexes[1]).toEqual({
        name: 'idx_email',
        column: 'email',
        unique: true,
        type: 'BTREE',
        sequence: 1,
      });
    });

    it('should throw ResourceError for invalid URI format', async () => {
      await expect(resourceHandler.readResource('invalid://uri')).rejects.toThrow(ResourceError);
      await expect(resourceHandler.readResource('invalid://uri')).rejects.toThrow("must start with 'mysql://'");
    });

    it('should throw ResourceError for database mismatch', async () => {
      const uri = 'mysql://wrongdb/users';

      await expect(resourceHandler.readResource(uri)).rejects.toThrow(ResourceError);
      await expect(resourceHandler.readResource(uri)).rejects.toThrow('Database mismatch');
    });

    it('should throw ResourceError for non-existent table', async () => {
      const tableError = new Error("Table 'testdb.nonexistent' doesn't exist") as any;
      tableError.code = 'ER_NO_SUCH_TABLE';

      mockPool.query.mockRejectedValue(tableError);

      await expect(resourceHandler.readResource('mysql://testdb/nonexistent')).rejects.toThrow(ResourceError);
      await expect(resourceHandler.readResource('mysql://testdb/nonexistent')).rejects.toThrow("Table 'nonexistent' does not exist");
    });

    it('should properly escape table names in queries', async () => {
      const mockColumns: RowDataPacket[] = [];
      const mockIndexes: RowDataPacket[] = [];

      mockPool.query
        .mockResolvedValueOnce([mockColumns])
        .mockResolvedValueOnce([mockIndexes]);

      await resourceHandler.readResource('mysql://testdb/my_table');

      expect(mockPool.query).toHaveBeenCalledWith('DESCRIBE `my_table`');
      expect(mockPool.query).toHaveBeenCalledWith('SHOW INDEX FROM `my_table`');
    });
  });

  describe('URI parsing', () => {
    it('should parse valid mysql:// URI correctly', async () => {
      const mockColumns: RowDataPacket[] = [];
      const mockIndexes: RowDataPacket[] = [];

      mockPool.query
        .mockResolvedValueOnce([mockColumns])
        .mockResolvedValueOnce([mockIndexes]);

      await resourceHandler.readResource('mysql://testdb/users');

      // Verify the table name was extracted correctly
      expect(mockPool.query).toHaveBeenCalledWith('DESCRIBE `users`');
    });

    it('should reject URI without mysql:// prefix', async () => {
      await expect(resourceHandler.readResource('http://testdb/users')).rejects.toThrow(ResourceError);
      await expect(resourceHandler.readResource('http://testdb/users')).rejects.toThrow("must start with 'mysql://'");
    });

    it('should reject URI with missing database', async () => {
      await expect(resourceHandler.readResource('mysql:///users')).rejects.toThrow(ResourceError);
      await expect(resourceHandler.readResource('mysql:///users')).rejects.toThrow('database and table names cannot be empty');
    });

    it('should reject URI with missing table', async () => {
      await expect(resourceHandler.readResource('mysql://testdb/')).rejects.toThrow(ResourceError);
      await expect(resourceHandler.readResource('mysql://testdb/')).rejects.toThrow('database and table names cannot be empty');
    });

    it('should reject URI with too many path segments', async () => {
      await expect(resourceHandler.readResource('mysql://testdb/schema/users')).rejects.toThrow(ResourceError);
      await expect(resourceHandler.readResource('mysql://testdb/schema/users')).rejects.toThrow("expected 'mysql://database/table'");
    });

    it('should reject URI with no path segments', async () => {
      await expect(resourceHandler.readResource('mysql://testdb')).rejects.toThrow(ResourceError);
      await expect(resourceHandler.readResource('mysql://testdb')).rejects.toThrow("expected 'mysql://database/table'");
    });

    it('should handle table names with underscores', async () => {
      const mockColumns: RowDataPacket[] = [];
      const mockIndexes: RowDataPacket[] = [];

      mockPool.query
        .mockResolvedValueOnce([mockColumns])
        .mockResolvedValueOnce([mockIndexes]);

      await resourceHandler.readResource('mysql://testdb/user_profiles');

      expect(mockPool.query).toHaveBeenCalledWith('DESCRIBE `user_profiles`');
    });

    it('should handle database names with underscores', async () => {
      const handler = new ResourceHandler(mockPool, 'my_test_db');
      const mockColumns: RowDataPacket[] = [];
      const mockIndexes: RowDataPacket[] = [];

      mockPool.query
        .mockResolvedValueOnce([mockColumns])
        .mockResolvedValueOnce([mockIndexes]);

      await handler.readResource('mysql://my_test_db/users');

      expect(mockPool.query).toHaveBeenCalledWith('DESCRIBE `users`');
    });
  });

  describe('Error handling', () => {
    it('should wrap database errors in ResourceError', async () => {
      const dbError = new Error('Connection timeout');
      mockPool.query.mockRejectedValue(dbError);

      await expect(resourceHandler.listResources()).rejects.toThrow(ResourceError);
    });

    it('should preserve ResourceError when thrown', async () => {
      await expect(resourceHandler.readResource('invalid://uri')).rejects.toThrow(ResourceError);
    });

    it('should handle unknown error types', async () => {
      mockPool.query.mockRejectedValue('string error');

      await expect(resourceHandler.listResources()).rejects.toThrow(ResourceError);
      await expect(resourceHandler.listResources()).rejects.toThrow('Failed to list resources');
    });

    it('should include error context in ResourceError message', async () => {
      const dbError = new Error('Specific database error');
      mockPool.query.mockRejectedValue(dbError);

      await expect(resourceHandler.listResources()).rejects.toThrow('Specific database error');
    });

    it('should handle ER_NO_SUCH_TABLE error specifically', async () => {
      const tableError = new Error("Table doesn't exist") as any;
      tableError.code = 'ER_NO_SUCH_TABLE';

      mockPool.query.mockRejectedValue(tableError);

      await expect(resourceHandler.readResource('mysql://testdb/missing')).rejects.toThrow("Table 'missing' does not exist");
    });
  });

  describe('Resource format compliance', () => {
    it('should return resources with all required fields', async () => {
      const mockRows: RowDataPacket[] = [
        { 'Tables_in_testdb': 'users' },
      ];

      mockPool.query.mockResolvedValue([mockRows]);

      const resources = await resourceHandler.listResources();

      expect(resources[0]).toHaveProperty('uri');
      expect(resources[0]).toHaveProperty('name');
      expect(resources[0]).toHaveProperty('description');
      expect(resources[0]).toHaveProperty('mimeType');
    });

    it('should return resource content with all required fields', async () => {
      const mockColumns: RowDataPacket[] = [];
      const mockIndexes: RowDataPacket[] = [];

      mockPool.query
        .mockResolvedValueOnce([mockColumns])
        .mockResolvedValueOnce([mockIndexes]);

      const content = await resourceHandler.readResource('mysql://testdb/users');

      expect(content).toHaveProperty('uri');
      expect(content).toHaveProperty('mimeType');
      expect(content).toHaveProperty('text');
    });

    it('should format URIs consistently', async () => {
      const mockRows: RowDataPacket[] = [
        { 'Tables_in_testdb': 'users' },
        { 'Tables_in_testdb': 'orders' },
      ];

      mockPool.query.mockResolvedValue([mockRows]);

      const resources = await resourceHandler.listResources();

      resources.forEach((resource) => {
        expect(resource.uri).toMatch(/^mysql:\/\/[^/]+\/[^/]+$/);
        expect(resource.uri.split('/').length).toBe(4); // mysql: // database table
      });
    });

    it('should use application/json mimeType consistently', async () => {
      const mockRows: RowDataPacket[] = [
        { 'Tables_in_testdb': 'users' },
      ];

      mockPool.query.mockResolvedValue([mockRows]);

      const resources = await resourceHandler.listResources();

      const mockColumns: RowDataPacket[] = [];
      const mockIndexes: RowDataPacket[] = [];

      mockPool.query
        .mockResolvedValueOnce([mockColumns])
        .mockResolvedValueOnce([mockIndexes]);

      const content = await resourceHandler.readResource(resources[0].uri);

      expect(resources[0].mimeType).toBe('application/json');
      expect(content.mimeType).toBe('application/json');
    });
  });
});
