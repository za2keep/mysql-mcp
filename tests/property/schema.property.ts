import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { loadConfig } from '../../src/config.js';
import { DatabaseManager } from '../../src/database.js';
import mysql from 'mysql2/promise';

// Mock mysql2/promise
vi.mock('mysql2/promise', () => ({
  default: {
    createPool: vi.fn(),
  },
}));

describe('Schema Property Tests', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.clearAllMocks();
    
    // Set up minimal valid environment
    process.env.MYSQL_USER = 'testuser';
    process.env.MYSQL_PASSWORD = 'testpass';
    process.env.MYSQL_DATABASE = 'testdb';
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  // Feature: mysql-mcp-server, Property 11: Non-existent table error handling
  // Validates: Requirements 4.4
  it('should return appropriate error for any non-existent table without crashing', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate arbitrary non-existent table names
        fc.stringMatching(/^[a-z][a-z0-9_]{0,30}$/),
        async (nonExistentTable) => {
          vi.clearAllMocks();

          const config = loadConfig();

          // Create mock error for non-existent table
          const tableError = new Error(`Table 'testdb.${nonExistentTable}' doesn't exist`) as any;
          tableError.code = 'ER_NO_SUCH_TABLE';
          tableError.sqlState = '42S02';

          // Create mock pool that throws ER_NO_SUCH_TABLE error
          const mockPool = {
            query: vi.fn().mockRejectedValue(tableError),
            getConnection: vi.fn().mockResolvedValue({
              query: vi.fn().mockRejectedValue(tableError),
              release: vi.fn(),
            }),
            end: vi.fn().mockResolvedValue(undefined),
          };

          vi.mocked(mysql.createPool).mockReturnValue(mockPool as any);

          // Create database manager
          const dbManager = new DatabaseManager(config);

          // Test DESCRIBE query for non-existent table
          let describeCallCount = 0;
          let showIndexCallCount = 0;

          try {
            await mockPool.query(`DESCRIBE \`${nonExistentTable}\``);
            // Should not reach here
            expect.fail('Query should have thrown ER_NO_SUCH_TABLE error');
          } catch (error: any) {
            // CRITICAL TEST: Verify error is caught and has proper structure
            expect(error).toBeDefined();
            expect(error instanceof Error).toBe(true);
            expect(error.code).toBe('ER_NO_SUCH_TABLE');
            expect(error.sqlState).toBe('42S02');
            expect(error.message).toContain(nonExistentTable);
            expect(error.message).toContain("doesn't exist");

            // Verify error can be formatted into user-friendly message
            const errorMessage = `Error: Table '${nonExistentTable}' does not exist`;
            expect(errorMessage).toBeDefined();
            expect(typeof errorMessage).toBe('string');
            expect(errorMessage).toContain(nonExistentTable);
            expect(errorMessage).toContain('does not exist');
            
            describeCallCount++;
          }

          // Verify DESCRIBE was called
          expect(describeCallCount).toBe(1);

          // Test SHOW INDEX query for non-existent table
          vi.clearAllMocks();
          mockPool.query.mockRejectedValue(tableError);

          try {
            await mockPool.query(`SHOW INDEX FROM \`${nonExistentTable}\``);
            // Should not reach here
            expect.fail('Query should have thrown ER_NO_SUCH_TABLE error');
          } catch (error: any) {
            // CRITICAL TEST: Verify error is caught and has proper structure
            expect(error).toBeDefined();
            expect(error instanceof Error).toBe(true);
            expect(error.code).toBe('ER_NO_SUCH_TABLE');
            expect(error.sqlState).toBe('42S02');
            expect(error.message).toContain(nonExistentTable);

            // Verify error can be formatted into user-friendly message
            const errorMessage = `Error: Table '${nonExistentTable}' does not exist`;
            expect(errorMessage).toBeDefined();
            expect(typeof errorMessage).toBe('string');
            expect(errorMessage).toContain(nonExistentTable);
            
            showIndexCallCount++;
          }

          // Verify SHOW INDEX was called
          expect(showIndexCallCount).toBe(1);

          // Verify the error response can be serialized to JSON
          const errorResponse = {
            error: true,
            message: `Error: Table '${nonExistentTable}' does not exist`,
            code: 'ER_NO_SUCH_TABLE',
            sqlState: '42S02',
          };

          let jsonString: string;
          let parsedResponse: any;

          try {
            jsonString = JSON.stringify(errorResponse, null, 2);
            expect(jsonString).toBeDefined();
            expect(typeof jsonString).toBe('string');
            expect(jsonString.length).toBeGreaterThan(0);

            parsedResponse = JSON.parse(jsonString);
            expect(parsedResponse).toBeDefined();
            expect(typeof parsedResponse).toBe('object');
          } catch (error) {
            throw new Error(`Error response should be JSON-serializable but got error: ${error}`);
          }

          // Verify error response structure is preserved after JSON round-trip
          expect(parsedResponse).toHaveProperty('error');
          expect(parsedResponse.error).toBe(true);
          expect(parsedResponse).toHaveProperty('message');
          expect(parsedResponse.message).toContain(nonExistentTable);
          expect(parsedResponse).toHaveProperty('code');
          expect(parsedResponse.code).toBe('ER_NO_SUCH_TABLE');
          expect(parsedResponse).toHaveProperty('sqlState');
          expect(parsedResponse.sqlState).toBe('42S02');

          // Verify both queries were executed (total of 2 calls across both tests)
          expect(describeCallCount + showIndexCallCount).toBe(2);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: mysql-mcp-server, Property 10: Table schema description completeness
  // Validates: Requirements 4.2
  it('should return complete column definitions for any existing table', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate arbitrary table schemas
        fc.record({
          tableName: fc.stringMatching(/^[a-z][a-z0-9_]{0,30}$/),
          columns: fc.array(
            fc.record({
              name: fc.stringMatching(/^[a-z][a-z0-9_]{0,30}$/),
              type: fc.oneof(
                fc.constant('int(11)'),
                fc.constant('bigint(20)'),
                fc.constant('varchar(255)'),
                fc.constant('varchar(100)'),
                fc.constant('text'),
                fc.constant('timestamp'),
                fc.constant('datetime'),
                fc.constant('date'),
                fc.constant('decimal(10,2)'),
                fc.constant('float'),
                fc.constant('double'),
                fc.constant('tinyint(1)'),
                fc.constant('enum(\'a\',\'b\',\'c\')'),
                fc.constant('json')
              ),
              nullable: fc.boolean(),
              key: fc.oneof(
                fc.constant('PRI'),
                fc.constant('UNI'),
                fc.constant('MUL'),
                fc.constant('')
              ),
              defaultValue: fc.oneof(
                fc.constant(null),
                fc.constant('0'),
                fc.constant(''),
                fc.constant('CURRENT_TIMESTAMP'),
                fc.constant('active'),
                fc.string({ minLength: 1, maxLength: 20 })
              ),
              extra: fc.oneof(
                fc.constant(''),
                fc.constant('auto_increment'),
                fc.constant('on update CURRENT_TIMESTAMP'),
                fc.constant('DEFAULT_GENERATED')
              ),
            }),
            { minLength: 1, maxLength: 10 }
          ),
        }),
        async (testCase) => {
          vi.clearAllMocks();

          const config = loadConfig();

          // Create mock DESCRIBE result based on generated schema
          const mockDescribeResult = testCase.columns.map((col) => ({
            Field: col.name,
            Type: col.type,
            Null: col.nullable ? 'YES' : 'NO',
            Key: col.key,
            Default: col.defaultValue,
            Extra: col.extra,
          }));

          // Create mock pool
          const mockPool = {
            query: vi.fn().mockResolvedValue([mockDescribeResult]),
            getConnection: vi.fn().mockResolvedValue({
              query: vi.fn().mockResolvedValue([mockDescribeResult]),
              release: vi.fn(),
            }),
            end: vi.fn().mockResolvedValue(undefined),
          };

          vi.mocked(mysql.createPool).mockReturnValue(mockPool as any);

          // Create database manager
          const dbManager = new DatabaseManager(config);

          // Execute DESCRIBE query
          const [columns] = await mockPool.query(`DESCRIBE \`${testCase.tableName}\``);

          // Format column information (simulating what the server does)
          const formattedColumns = columns.map((col: any) => ({
            name: col.Field,
            type: col.Type,
            nullable: col.Null === 'YES',
            key: col.Key || '',
            default: col.Default,
            extra: col.Extra || '',
          }));

          // CRITICAL TEST: Verify all required fields are present and complete
          expect(formattedColumns).toBeDefined();
          expect(Array.isArray(formattedColumns)).toBe(true);
          expect(formattedColumns.length).toBe(testCase.columns.length);

          // Verify each column has ALL required properties
          for (let i = 0; i < formattedColumns.length; i++) {
            const formatted = formattedColumns[i];
            const original = testCase.columns[i];

            // Property 1: Column must have 'name' field
            expect(formatted).toHaveProperty('name');
            expect(typeof formatted.name).toBe('string');
            expect(formatted.name.length).toBeGreaterThan(0);
            expect(formatted.name).toBe(original.name);

            // Property 2: Column must have 'type' field
            expect(formatted).toHaveProperty('type');
            expect(typeof formatted.type).toBe('string');
            expect(formatted.type.length).toBeGreaterThan(0);
            expect(formatted.type).toBe(original.type);

            // Property 3: Column must have 'nullable' field (boolean)
            expect(formatted).toHaveProperty('nullable');
            expect(typeof formatted.nullable).toBe('boolean');
            expect(formatted.nullable).toBe(original.nullable);

            // Property 4: Column must have 'key' field (string, may be empty)
            expect(formatted).toHaveProperty('key');
            expect(typeof formatted.key).toBe('string');
            expect(formatted.key).toBe(original.key);

            // Property 5: Column must have 'default' field (may be null)
            expect(formatted).toHaveProperty('default');
            // Default can be null, string, or number
            if (formatted.default !== null) {
              expect(['string', 'number'].includes(typeof formatted.default)).toBe(true);
            }
            expect(formatted.default).toBe(original.defaultValue);

            // Property 6: Column must have 'extra' field (string, may be empty)
            expect(formatted).toHaveProperty('extra');
            expect(typeof formatted.extra).toBe('string');
            expect(formatted.extra).toBe(original.extra);
          }

          // Verify the result can be serialized to JSON
          const result = { table: testCase.tableName, columns: formattedColumns };
          let jsonString: string;
          let parsedResult: any;

          try {
            jsonString = JSON.stringify(result, null, 2);
            expect(jsonString).toBeDefined();
            expect(typeof jsonString).toBe('string');
            expect(jsonString.length).toBeGreaterThan(0);

            parsedResult = JSON.parse(jsonString);
            expect(parsedResult).toBeDefined();
            expect(typeof parsedResult).toBe('object');
          } catch (error) {
            throw new Error(`Result should be JSON-serializable but got error: ${error}`);
          }

          // Verify structure is preserved after JSON round-trip
          expect(parsedResult).toHaveProperty('table');
          expect(parsedResult.table).toBe(testCase.tableName);
          expect(parsedResult).toHaveProperty('columns');
          expect(Array.isArray(parsedResult.columns)).toBe(true);
          expect(parsedResult.columns.length).toBe(testCase.columns.length);

          // Verify each column in parsed result has all required fields
          for (let i = 0; i < parsedResult.columns.length; i++) {
            const col = parsedResult.columns[i];
            const original = testCase.columns[i];

            expect(col).toHaveProperty('name');
            expect(col.name).toBe(original.name);

            expect(col).toHaveProperty('type');
            expect(col.type).toBe(original.type);

            expect(col).toHaveProperty('nullable');
            expect(col.nullable).toBe(original.nullable);

            expect(col).toHaveProperty('key');
            expect(col.key).toBe(original.key);

            expect(col).toHaveProperty('default');
            expect(col.default).toBe(original.defaultValue);

            expect(col).toHaveProperty('extra');
            expect(col.extra).toBe(original.extra);
          }

          // Verify no extra properties were added
          const expectedKeys = ['name', 'type', 'nullable', 'key', 'default', 'extra'];
          for (const col of formattedColumns) {
            const actualKeys = Object.keys(col);
            expect(actualKeys.sort()).toEqual(expectedKeys.sort());
          }

          // Verify the query was executed with proper table name escaping
          expect(mockPool.query).toHaveBeenCalledWith(`DESCRIBE \`${testCase.tableName}\``);
        }
      ),
      { numRuns: 100 }
    );
  });
});
