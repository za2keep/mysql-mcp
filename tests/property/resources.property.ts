import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { ResourceHandler } from '../../src/resources.js';
import type { Pool, RowDataPacket } from 'mysql2/promise';

/**
 * Property-based tests for ResourceHandler
 * Feature: mysql-mcp-server, Property 12: Resource URI format consistency
 * Validates: Requirements 6.3
 * 
 * Feature: mysql-mcp-server, Property 13: Resource content structure
 * Validates: Requirements 6.2, 6.4
 */
describe('Resource Property Tests', () => {
  let mockPool: any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Feature: mysql-mcp-server, Property 12: Resource URI format consistency
  // Validates: Requirements 6.3
  it('should format all resource URIs consistently as mysql://{database}/{table}', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate arbitrary database name
        fc.stringMatching(/^[a-z][a-z0-9_]{0,30}$/),
        // Generate arbitrary array of UNIQUE table names
        fc.uniqueArray(
          fc.stringMatching(/^[a-z][a-z0-9_]{0,30}$/),
          { minLength: 1, maxLength: 20 }
        ),
        async (databaseName, tableNames) => {
          vi.clearAllMocks();

          // Create mock pool
          mockPool = {
            query: vi.fn(),
            getConnection: vi.fn(),
            end: vi.fn(),
          };

          // Create mock SHOW TABLES result
          const mockRows = tableNames.map((tableName) => ({
            [`Tables_in_${databaseName}`]: tableName,
          }));

          mockPool.query.mockResolvedValue([mockRows]);

          // Create resource handler
          const resourceHandler = new ResourceHandler(mockPool as Pool, databaseName);

          // List resources
          const resources = await resourceHandler.listResources();

          // CRITICAL TEST: Verify all URIs follow the mysql://{database}/{table} format
          expect(resources).toBeDefined();
          expect(Array.isArray(resources)).toBe(true);
          expect(resources.length).toBe(tableNames.length);

          for (let i = 0; i < resources.length; i++) {
            const resource = resources[i];
            const expectedTableName = tableNames[i];

            // Property 1: URI must exist and be a string
            expect(resource).toHaveProperty('uri');
            expect(typeof resource.uri).toBe('string');
            expect(resource.uri.length).toBeGreaterThan(0);

            // Property 2: URI must start with 'mysql://'
            expect(resource.uri.startsWith('mysql://')).toBe(true);

            // Property 3: URI must follow exact format mysql://{database}/{table}
            const expectedUri = `mysql://${databaseName}/${expectedTableName}`;
            expect(resource.uri).toBe(expectedUri);

            // Property 4: URI must have exactly 4 segments when split by '/'
            // Format: ['mysql:', '', '{database}', '{table}']
            const segments = resource.uri.split('/');
            expect(segments.length).toBe(4);
            expect(segments[0]).toBe('mysql:');
            expect(segments[1]).toBe('');
            expect(segments[2]).toBe(databaseName);
            expect(segments[3]).toBe(expectedTableName);

            // Property 5: URI must not contain extra slashes or path segments
            const pathAfterProtocol = resource.uri.substring('mysql://'.length);
            const pathSegments = pathAfterProtocol.split('/');
            expect(pathSegments.length).toBe(2); // Only database and table

            // Property 6: Database name in URI must match the configured database
            expect(pathSegments[0]).toBe(databaseName);

            // Property 7: Table name in URI must match the table from SHOW TABLES
            expect(pathSegments[1]).toBe(expectedTableName);

            // Property 8: URI must be parseable back to database and table
            const uriRegex = /^mysql:\/\/([^/]+)\/([^/]+)$/;
            const match = resource.uri.match(uriRegex);
            expect(match).not.toBeNull();
            expect(match![1]).toBe(databaseName);
            expect(match![2]).toBe(expectedTableName);

            // Property 9: URI must not contain query parameters or fragments
            expect(resource.uri).not.toContain('?');
            expect(resource.uri).not.toContain('#');

            // Property 10: URI must not have trailing slashes
            expect(resource.uri.endsWith('/')).toBe(false);
          }

          // Property 11: All URIs in the list must be unique
          const uris = resources.map((r) => r.uri);
          const uniqueUris = new Set(uris);
          expect(uniqueUris.size).toBe(uris.length);

          // Property 12: All URIs must follow the same pattern
          const uriPattern = /^mysql:\/\/[^/]+\/[^/]+$/;
          for (const resource of resources) {
            expect(uriPattern.test(resource.uri)).toBe(true);
          }

          // Property 13: URI format must be consistent across all resources
          for (const resource of resources) {
            const parts = resource.uri.split('://');
            expect(parts.length).toBe(2);
            expect(parts[0]).toBe('mysql');

            const pathParts = parts[1].split('/');
            expect(pathParts.length).toBe(2);
            expect(pathParts[0].length).toBeGreaterThan(0);
            expect(pathParts[1].length).toBeGreaterThan(0);
          }

          // Verify the query was executed
          expect(mockPool.query).toHaveBeenCalledWith('SHOW TABLES');
          expect(mockPool.query).toHaveBeenCalledTimes(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: mysql-mcp-server, Property 13: Resource content structure
  // Validates: Requirements 6.2, 6.4
  it('should return structured JSON content with complete table schema information for any valid resource', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate arbitrary database name
        fc.stringMatching(/^[a-z][a-z0-9_]{0,30}$/),
        // Generate arbitrary table name
        fc.stringMatching(/^[a-z][a-z0-9_]{0,30}$/),
        // Generate arbitrary columns (at least 1) with UNIQUE names
        fc.uniqueArray(
          fc.record({
            name: fc.stringMatching(/^[a-z][a-z0-9_]{0,30}$/),
            type: fc.constantFrom('int(11)', 'varchar(255)', 'text', 'datetime', 'decimal(10,2)', 'tinyint(1)'),
            nullable: fc.boolean(),
            key: fc.constantFrom('', 'PRI', 'UNI', 'MUL'),
            default: fc.oneof(fc.constant(null), fc.string(), fc.integer()),
            extra: fc.constantFrom('', 'auto_increment', 'on update CURRENT_TIMESTAMP'),
          }),
          { minLength: 1, maxLength: 10, selector: (col) => col.name }
        ),
        // Generate arbitrary indexes (0 or more)
        fc.array(
          fc.record({
            name: fc.stringMatching(/^[a-z][a-z0-9_]{0,30}$/),
            column: fc.stringMatching(/^[a-z][a-z0-9_]{0,30}$/),
            unique: fc.boolean(),
            type: fc.constantFrom('BTREE', 'HASH', 'FULLTEXT'),
            sequence: fc.integer({ min: 1, max: 10 }),
          }),
          { minLength: 0, maxLength: 5 }
        ),
        async (databaseName, tableName, columns, indexes) => {
          vi.clearAllMocks();

          // Create mock pool
          mockPool = {
            query: vi.fn(),
            getConnection: vi.fn(),
            end: vi.fn(),
          };

          // Create mock DESCRIBE result
          const mockColumns = columns.map((col) => ({
            Field: col.name,
            Type: col.type,
            Null: col.nullable ? 'YES' : 'NO',
            Key: col.key,
            Default: col.default,
            Extra: col.extra,
          }));

          // Create mock SHOW INDEX result
          const mockIndexes = indexes.map((idx) => ({
            Key_name: idx.name,
            Column_name: idx.column,
            Non_unique: idx.unique ? 0 : 1,
            Index_type: idx.type,
            Seq_in_index: idx.sequence,
          }));

          mockPool.query
            .mockResolvedValueOnce([mockColumns])
            .mockResolvedValueOnce([mockIndexes]);

          // Create resource handler
          const resourceHandler = new ResourceHandler(mockPool as Pool, databaseName);

          // Read resource
          const uri = `mysql://${databaseName}/${tableName}`;
          const content = await resourceHandler.readResource(uri);

          // Property 1: Content must have all required fields
          expect(content).toBeDefined();
          expect(content).toHaveProperty('uri');
          expect(content).toHaveProperty('mimeType');
          expect(content).toHaveProperty('text');

          // Property 2: URI must match the requested URI
          expect(content.uri).toBe(uri);

          // Property 3: MIME type must be application/json
          expect(content.mimeType).toBe('application/json');

          // Property 4: Text content must be a non-empty string
          expect(typeof content.text).toBe('string');
          expect(content.text.length).toBeGreaterThan(0);

          // Property 5: Text content must be valid JSON (parseable)
          let schema: any;
          expect(() => {
            schema = JSON.parse(content.text);
          }).not.toThrow();

          // Property 6: Parsed schema must be an object
          expect(schema).toBeDefined();
          expect(typeof schema).toBe('object');
          expect(schema).not.toBeNull();
          expect(Array.isArray(schema)).toBe(false);

          // Property 7: Schema must contain all required top-level fields
          expect(schema).toHaveProperty('table');
          expect(schema).toHaveProperty('database');
          expect(schema).toHaveProperty('columns');
          expect(schema).toHaveProperty('indexes');

          // Property 8: Table name must match the requested table
          expect(schema.table).toBe(tableName);

          // Property 9: Database name must match the configured database
          expect(schema.database).toBe(databaseName);

          // Property 10: Columns must be an array
          expect(Array.isArray(schema.columns)).toBe(true);

          // Property 11: Columns array must have the same length as input
          expect(schema.columns.length).toBe(columns.length);

          // Property 12: Each column must have complete information
          for (let i = 0; i < schema.columns.length; i++) {
            const schemaCol = schema.columns[i];
            const inputCol = columns[i];

            // Column must have all required fields
            expect(schemaCol).toHaveProperty('name');
            expect(schemaCol).toHaveProperty('type');
            expect(schemaCol).toHaveProperty('nullable');
            expect(schemaCol).toHaveProperty('key');
            expect(schemaCol).toHaveProperty('default');
            expect(schemaCol).toHaveProperty('extra');

            // Column fields must have correct types
            expect(typeof schemaCol.name).toBe('string');
            expect(typeof schemaCol.type).toBe('string');
            expect(typeof schemaCol.nullable).toBe('boolean');
            expect(typeof schemaCol.key).toBe('string');
            expect(typeof schemaCol.extra).toBe('string');

            // Column values must match input
            expect(schemaCol.name).toBe(inputCol.name);
            expect(schemaCol.type).toBe(inputCol.type);
            expect(schemaCol.nullable).toBe(inputCol.nullable);
            expect(schemaCol.key).toBe(inputCol.key);
            expect(schemaCol.default).toEqual(inputCol.default);
            expect(schemaCol.extra).toBe(inputCol.extra);
          }

          // Property 13: Indexes must be an array
          expect(Array.isArray(schema.indexes)).toBe(true);

          // Property 14: Indexes array must have the same length as input
          expect(schema.indexes.length).toBe(indexes.length);

          // Property 15: Each index must have complete information
          for (let i = 0; i < schema.indexes.length; i++) {
            const schemaIdx = schema.indexes[i];
            const inputIdx = indexes[i];

            // Index must have all required fields
            expect(schemaIdx).toHaveProperty('name');
            expect(schemaIdx).toHaveProperty('column');
            expect(schemaIdx).toHaveProperty('unique');
            expect(schemaIdx).toHaveProperty('type');
            expect(schemaIdx).toHaveProperty('sequence');

            // Index fields must have correct types
            expect(typeof schemaIdx.name).toBe('string');
            expect(typeof schemaIdx.column).toBe('string');
            expect(typeof schemaIdx.unique).toBe('boolean');
            expect(typeof schemaIdx.type).toBe('string');
            expect(typeof schemaIdx.sequence).toBe('number');

            // Index values must match input
            expect(schemaIdx.name).toBe(inputIdx.name);
            expect(schemaIdx.column).toBe(inputIdx.column);
            expect(schemaIdx.unique).toBe(inputIdx.unique);
            expect(schemaIdx.type).toBe(inputIdx.type);
            expect(schemaIdx.sequence).toBe(inputIdx.sequence);
          }

          // Property 16: Schema must be serializable back to JSON (round-trip)
          let reserialized: string;
          expect(() => {
            reserialized = JSON.stringify(schema);
          }).not.toThrow();
          expect(reserialized).toBeTruthy();

          // Property 17: Re-parsed schema must be equivalent to original
          const reparsed = JSON.parse(reserialized!);
          expect(reparsed).toEqual(schema);

          // Property 18: Schema must not contain undefined values
          const schemaString = JSON.stringify(schema);
          expect(schemaString).not.toContain('undefined');

          // Property 19: All column names must be unique within the schema
          const columnNames = schema.columns.map((col: any) => col.name);
          const uniqueColumnNames = new Set(columnNames);
          expect(uniqueColumnNames.size).toBe(columnNames.length);

          // Property 20: Schema structure must be consistent (same keys for all columns)
          if (schema.columns.length > 1) {
            const firstColKeys = Object.keys(schema.columns[0]).sort();
            for (let i = 1; i < schema.columns.length; i++) {
              const colKeys = Object.keys(schema.columns[i]).sort();
              expect(colKeys).toEqual(firstColKeys);
            }
          }

          // Property 21: Schema structure must be consistent (same keys for all indexes)
          if (schema.indexes.length > 1) {
            const firstIdxKeys = Object.keys(schema.indexes[0]).sort();
            for (let i = 1; i < schema.indexes.length; i++) {
              const idxKeys = Object.keys(schema.indexes[i]).sort();
              expect(idxKeys).toEqual(firstIdxKeys);
            }
          }

          // Verify the queries were executed correctly
          expect(mockPool.query).toHaveBeenCalledWith(`DESCRIBE \`${tableName}\``);
          expect(mockPool.query).toHaveBeenCalledWith(`SHOW INDEX FROM \`${tableName}\``);
          expect(mockPool.query).toHaveBeenCalledTimes(2);
        }
      ),
      { numRuns: 100 }
    );
  });
});
