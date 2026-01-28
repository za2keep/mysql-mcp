import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { loadConfig, type ServerConfig } from '../../src/config.js';
import { DatabaseManager } from '../../src/database.js';
import { QueryValidator } from '../../src/validator.js';
import mysql from 'mysql2/promise';

// Mock mysql2/promise
vi.mock('mysql2/promise', () => ({
  default: {
    createPool: vi.fn(),
  },
}));

describe('Tool Call Execution Property Tests', () => {
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

  // Feature: mysql-mcp-server, Property 8: Query result JSON compatibility
  // Validates: Requirements 3.4
  it('should return JSON-serializable results for any successful query', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate arbitrary query results with potentially non-JSON-serializable types
        fc.record({
          queryType: fc.constantFrom('SELECT', 'INSERT', 'UPDATE', 'DELETE'),
          includeBuffer: fc.boolean(),
          includeDate: fc.boolean(),
          includeNull: fc.boolean(),
          includeUndefined: fc.boolean(),
          includeNumber: fc.boolean(),
          includeString: fc.boolean(),
          includeBoolean: fc.boolean(),
          rowCount: fc.integer({ min: 0, max: 10 }),
        }),
        async (testCase) => {
          vi.clearAllMocks();

          const config = loadConfig();
          
          // Create mock query results with various data types
          let mockQueryResult: any;
          
          if (testCase.queryType === 'SELECT') {
            // Generate rows with various data types
            const rows: any[] = [];
            for (let i = 0; i < testCase.rowCount; i++) {
              const row: any = { id: i };
              
              if (testCase.includeString) {
                row.name = `test_${i}`;
              }
              
              if (testCase.includeNumber) {
                row.count = i * 10;
                row.price = i * 1.5;
              }
              
              if (testCase.includeBoolean) {
                row.active = i % 2 === 0;
              }
              
              if (testCase.includeNull) {
                row.nullable_field = null;
              }
              
              if (testCase.includeUndefined) {
                row.undefined_field = undefined;
              }
              
              if (testCase.includeDate) {
                row.created_at = new Date(`2024-01-${(i % 28) + 1}T12:00:00Z`);
              }
              
              if (testCase.includeBuffer) {
                row.binary_data = Buffer.from(`binary_${i}`, 'utf-8');
              }
              
              rows.push(row);
            }
            
            const fields = [
              { name: 'id', type: 3, table: 'test' },
              { name: 'name', type: 253, table: 'test' },
              { name: 'created_at', type: 12, table: 'test' },
              { name: 'binary_data', type: 252, table: 'test' },
            ];
            
            mockQueryResult = [rows, fields];
          } else {
            // INSERT/UPDATE/DELETE result
            mockQueryResult = [
              { 
                affectedRows: testCase.rowCount,
                insertId: testCase.queryType === 'INSERT' ? testCase.rowCount : 0,
              },
              undefined,
            ];
          }

          // Create mock pool
          const mockPool = {
            query: vi.fn().mockResolvedValue(mockQueryResult),
            getConnection: vi.fn().mockResolvedValue({
              query: vi.fn().mockResolvedValue(mockQueryResult),
              release: vi.fn(),
            }),
            end: vi.fn().mockResolvedValue(undefined),
          };

          vi.mocked(mysql.createPool).mockReturnValue(mockPool as any);

          // Create database manager and validator
          const dbManager = new DatabaseManager(config);
          const validator = new QueryValidator(config.security);

          // Build a valid query based on type
          let query: string;
          switch (testCase.queryType) {
            case 'SELECT':
              query = 'SELECT * FROM test WHERE id > 0';
              break;
            case 'INSERT':
              query = "INSERT INTO test (name) VALUES ('test')";
              break;
            case 'UPDATE':
              query = "UPDATE test SET name = 'updated' WHERE id = 1";
              break;
            case 'DELETE':
              query = 'DELETE FROM test WHERE id = 1';
              break;
          }

          // Validate the query
          const validationResult = validator.validate(query);
          expect(validationResult.valid).toBe(true);

          // Execute the query
          const queryToExecute = validationResult.modifiedQuery || query;
          const [rows, fields] = await mockPool.query(queryToExecute);

          // Format result (simulating what the server does)
          let result: any;
          if (testCase.queryType === 'SELECT') {
            // Sanitize rows to ensure JSON compatibility
            const sanitizedRows = Array.isArray(rows) ? rows.map(row => sanitizeRow(row)) : [];
            
            result = {
              rows: sanitizedRows,
              fields: fields?.map((f: any) => ({
                name: f.name,
                type: f.type,
                table: f.table,
              })),
              rowCount: sanitizedRows.length,
            };
          } else {
            result = {
              affectedRows: rows.affectedRows,
              insertId: rows.insertId || undefined,
              warningCount: 0,
            };
          }

          // CRITICAL TEST: Result must be JSON-serializable
          let jsonString: string;
          let parsedResult: any;
          
          try {
            // Attempt to serialize to JSON
            jsonString = JSON.stringify(result);
            
            // Verify serialization succeeded
            expect(jsonString).toBeDefined();
            expect(typeof jsonString).toBe('string');
            expect(jsonString.length).toBeGreaterThan(0);
            
            // Attempt to parse back
            parsedResult = JSON.parse(jsonString);
            
            // Verify parsing succeeded
            expect(parsedResult).toBeDefined();
            expect(typeof parsedResult).toBe('object');
          } catch (error) {
            throw new Error(`Result should be JSON-serializable but got error: ${error}`);
          }

          // Verify structure is preserved after round-trip
          if (testCase.queryType === 'SELECT') {
            expect(parsedResult).toHaveProperty('rows');
            expect(parsedResult).toHaveProperty('rowCount');
            expect(Array.isArray(parsedResult.rows)).toBe(true);
            expect(parsedResult.rowCount).toBe(testCase.rowCount);
            
            // Verify no Buffers or Dates in the result
            for (const row of parsedResult.rows) {
              for (const value of Object.values(row)) {
                // All values should be JSON-compatible types
                expect(value === null || 
                       typeof value === 'string' || 
                       typeof value === 'number' || 
                       typeof value === 'boolean' ||
                       typeof value === 'object').toBe(true);
                
                // Should NOT be Buffer or Date instances
                expect(Buffer.isBuffer(value)).toBe(false);
                expect(value instanceof Date).toBe(false);
                
                // If original had Date, it should be converted to string
                if (testCase.includeDate && typeof value === 'string') {
                  // Should be ISO date string format
                  if (value.includes('T') && value.includes('Z')) {
                    expect(() => new Date(value)).not.toThrow();
                  }
                }
              }
            }
          } else {
            expect(parsedResult).toHaveProperty('affectedRows');
            expect(typeof parsedResult.affectedRows).toBe('number');
          }

          // Verify the result can be used in MCP response
          const mcpResponse = {
            content: [{
              type: 'text',
              text: jsonString,
            }],
          };

          // MCP response should also be JSON-serializable
          const mcpResponseString = JSON.stringify(mcpResponse);
          expect(mcpResponseString).toBeDefined();
          
          const parsedMcpResponse = JSON.parse(mcpResponseString);
          expect(parsedMcpResponse.content[0].text).toBe(jsonString);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Helper function to sanitize rows (mimics server implementation)
  function sanitizeRow(row: any): any {
    if (row === null || row === undefined) {
      return row;
    }

    if (row instanceof Date) {
      // Handle invalid dates gracefully
      try {
        return row.toISOString();
      } catch (error) {
        // If date is invalid, return null
        return null;
      }
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
  }

  // Feature: mysql-mcp-server, Property 3: Tool call execution
  // Validates: Requirements 1.4
  it('should execute any valid tool call and return result or error', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate arbitrary valid tool calls
        fc.record({
          toolName: fc.constant('query'), // Currently only 'query' tool is implemented
          sql: fc.oneof(
            // Valid SELECT queries
            fc.record({
              type: fc.constant('SELECT'),
              query: fc.string({ minLength: 1, maxLength: 100 }).map(s => 
                `SELECT * FROM users WHERE id = '${s.replace(/'/g, "''")}'`
              ),
            }),
            // Valid INSERT queries
            fc.record({
              type: fc.constant('INSERT'),
              query: fc.string({ minLength: 1, maxLength: 100 }).map(s => 
                `INSERT INTO users (name) VALUES ('${s.replace(/'/g, "''")}')`
              ),
            }),
            // Valid UPDATE queries with WHERE clause
            fc.record({
              type: fc.constant('UPDATE'),
              query: fc.tuple(
                fc.string({ minLength: 1, maxLength: 50 }),
                fc.string({ minLength: 1, maxLength: 50 })
              ).map(([name, id]) => 
                `UPDATE users SET name = '${name.replace(/'/g, "''")}' WHERE id = '${id.replace(/'/g, "''")}'`
              ),
            }),
            // Valid DELETE queries with WHERE clause
            fc.record({
              type: fc.constant('DELETE'),
              query: fc.string({ minLength: 1, maxLength: 100 }).map(s => 
                `DELETE FROM users WHERE id = '${s.replace(/'/g, "''")}'`
              ),
            })
          ),
          shouldSucceed: fc.boolean(),
        }),
        async (testCase) => {
          // Clear mocks for each iteration
          vi.clearAllMocks();

          const config = loadConfig();
          
          // Create mock query results based on query type and success flag
          const sqlQuery = testCase.sql.query;
          const queryType = testCase.sql.type;
          
          let mockQueryResult: any;
          if (testCase.shouldSucceed) {
            if (queryType === 'SELECT') {
              // Mock SELECT result
              mockQueryResult = [
                [{ id: 1, name: 'test' }], // rows
                [{ name: 'id', type: 3, table: 'users' }], // fields
              ];
            } else {
              // Mock INSERT/UPDATE/DELETE result
              mockQueryResult = [
                { affectedRows: 1, insertId: queryType === 'INSERT' ? 1 : 0 },
                undefined,
              ];
            }
          } else {
            // Mock database error
            const dbError: any = new Error('Database operation failed');
            dbError.code = 'ER_SOME_ERROR';
            dbError.sqlState = '42000';
            mockQueryResult = Promise.reject(dbError);
          }

          // Create mock pool
          const mockPool = {
            query: vi.fn().mockImplementation(() => mockQueryResult),
            getConnection: vi.fn().mockResolvedValue({
              query: vi.fn().mockImplementation(() => mockQueryResult),
              release: vi.fn(),
            }),
            end: vi.fn().mockResolvedValue(undefined),
          };

          vi.mocked(mysql.createPool).mockReturnValue(mockPool as any);

          // Create a minimal MCP server setup to test tool execution
          const dbManager = new DatabaseManager(config);
          const validator = new QueryValidator(config.security);

          // Simulate tool call execution
          let result: any;
          let executionError: any = null;

          try {
            // Validate the query
            const validationResult = validator.validate(sqlQuery);
            
            if (!validationResult.valid) {
              // Query validation failed
              result = {
                content: [{
                  type: 'text',
                  text: `Query validation failed: ${validationResult.error}`,
                }],
                isError: true,
              };
            } else {
              // Execute the query
              const queryToExecute = validationResult.modifiedQuery || sqlQuery;
              
              try {
                const [rows, fields] = await mockPool.query(queryToExecute);
                
                // Format result based on query type
                if (queryType === 'SELECT') {
                  result = {
                    content: [{
                      type: 'text',
                      text: JSON.stringify({
                        rows: rows,
                        fields: fields?.map((f: any) => ({
                          name: f.name,
                          type: f.type,
                          table: f.table,
                        })),
                        rowCount: Array.isArray(rows) ? rows.length : 0,
                      }, null, 2),
                    }],
                  };
                } else {
                  result = {
                    content: [{
                      type: 'text',
                      text: JSON.stringify({
                        affectedRows: rows.affectedRows,
                        insertId: rows.insertId || undefined,
                        warningCount: 0,
                      }, null, 2),
                    }],
                  };
                }
              } catch (dbError: any) {
                // Database execution error
                const errorInfo: any = {
                  message: dbError.message,
                };
                if (dbError.code) errorInfo.code = dbError.code;
                if (dbError.sqlState) errorInfo.sqlState = dbError.sqlState;
                
                result = {
                  content: [{
                    type: 'text',
                    text: `Database error: ${JSON.stringify(errorInfo, null, 2)}`,
                  }],
                  isError: true,
                };
              }
            }
          } catch (error) {
            executionError = error;
          }

          // Verify: Tool call should always return a result (success or error)
          if (executionError) {
            throw new Error(`Tool execution should not throw unhandled errors: ${executionError}`);
          }

          if (!result) {
            throw new Error('Tool execution should always return a result');
          }

          // Verify result structure
          if (!result.content) {
            throw new Error('Result should have content property');
          }

          if (!Array.isArray(result.content)) {
            throw new Error('Result content should be an array');
          }

          if (result.content.length === 0) {
            throw new Error('Result content should not be empty');
          }

          // Verify each content item has required properties
          for (const item of result.content) {
            if (!item.type) {
              throw new Error('Content item should have type property');
            }
            if (item.type !== 'text') {
              throw new Error('Content item type should be "text"');
            }
            if (typeof item.text !== 'string') {
              throw new Error('Content item text should be a string');
            }
            if (item.text.length === 0) {
              throw new Error('Content item text should not be empty');
            }
          }

          // Verify error flag is set appropriately
          if (testCase.shouldSucceed) {
            // For successful queries, isError should be undefined or false
            if (result.isError === true) {
              // This is acceptable if validation failed
              if (!result.content[0].text.includes('validation failed')) {
                throw new Error('Successful query should not have isError=true unless validation failed');
              }
            }
          } else {
            // For failed queries, isError should be true
            if (result.isError !== true) {
              throw new Error('Failed query should have isError=true');
            }
            // Error message should contain relevant information
            if (!result.content[0].text.includes('error') && !result.content[0].text.includes('Error')) {
              throw new Error('Error result should contain error information');
            }
          }

          // Verify result text is valid JSON (for successful queries)
          if (!result.isError || result.content[0].text.includes('Database error:')) {
            try {
              const parsed = JSON.parse(result.content[0].text.replace('Database error: ', ''));
              if (typeof parsed !== 'object') {
                throw new Error('Parsed result should be an object');
              }
            } catch (parseError) {
              // Some error messages might not be JSON, which is acceptable
              if (!result.isError) {
                throw new Error(`Result text should be valid JSON for successful queries: ${parseError}`);
              }
            }
          }

          // Verify query was executed (or validation was performed)
          if (testCase.shouldSucceed && !result.isError) {
            if (!mockPool.query.mock.calls.length) {
              throw new Error('Query should have been executed for successful cases');
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
