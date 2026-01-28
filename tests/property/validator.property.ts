import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { QueryValidator, type StatementType } from '../../src/validator.js';
import type { SecurityConfig } from '../../src/config.js';

describe('Query Validator Property Tests', () => {
  // Feature: mysql-mcp-server, Property 6: SELECT query automatic limit
  // Validates: Requirements 3.2
  it('should automatically add LIMIT to any SELECT query without LIMIT clause', () => {
    fc.assert(
      fc.property(
        // Generate arbitrary SELECT queries without LIMIT
        fc.record({
          columns: fc.oneof(
            fc.constant('*'),
            fc.array(fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz_'), { minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 5 })
              .map(cols => cols.join(', '))
          ),
          table: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz_'), { minLength: 1, maxLength: 20 }),
          whereClause: fc.option(
            fc.record({
              column: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz_'), { minLength: 1, maxLength: 20 }),
              operator: fc.constantFrom('=', '>', '<', '>=', '<=', '!=', 'LIKE'),
              value: fc.oneof(
                fc.integer().map(n => n.toString()),
                // Generate strings without quotes or semicolons to avoid SQL syntax issues
                fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789 '), { minLength: 1, maxLength: 20 })
                  .map(s => `'${s}'`)
              )
            }).map(w => `WHERE ${w.column} ${w.operator} ${w.value}`),
            { nil: undefined }
          ),
          orderBy: fc.option(
            fc.record({
              column: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz_'), { minLength: 1, maxLength: 20 }),
              direction: fc.constantFrom('ASC', 'DESC')
            }).map(o => `ORDER BY ${o.column} ${o.direction}`),
            { nil: undefined }
          ),
          maxSelectRows: fc.integer({ min: 1, max: 10000 }),
          trailingSemicolon: fc.boolean(),
          extraWhitespace: fc.boolean()
        }),
        (testCase) => {
          // Build SELECT query without LIMIT
          let query = `SELECT ${testCase.columns} FROM ${testCase.table}`;
          
          if (testCase.whereClause) {
            query += ` ${testCase.whereClause}`;
          }
          
          if (testCase.orderBy) {
            query += ` ${testCase.orderBy}`;
          }
          
          if (testCase.trailingSemicolon) {
            query += ';';
          }
          
          if (testCase.extraWhitespace) {
            query = `  ${query}  `;
          }

          // Create validator with the generated maxSelectRows
          const config: SecurityConfig = {
            maxSelectRows: testCase.maxSelectRows,
            allowDDL: false,
            allowMultipleStatements: false,
            requireWhereClause: true,
          };
          
          const validator = new QueryValidator(config);
          
          // Validate the query
          const result = validator.validate(query);
          
          // Query should be valid
          expect(result.valid).toBe(true);
          expect(result.statementType).toBe('SELECT');
          expect(result.modifiedQuery).toBeDefined();
          
          // Modified query should contain LIMIT clause
          const modifiedQuery = result.modifiedQuery!;
          const upperModified = modifiedQuery.toUpperCase();
          expect(upperModified).toContain('LIMIT');
          
          // LIMIT value should match the configured maxSelectRows
          const limitPattern = new RegExp(`LIMIT\\s+${testCase.maxSelectRows}`, 'i');
          expect(limitPattern.test(modifiedQuery)).toBe(true);
          
          // Modified query should not have trailing semicolon
          expect(modifiedQuery.trim().endsWith(';')).toBe(false);
          
          // Original query structure should be preserved
          expect(upperModified).toContain('SELECT');
          expect(upperModified).toContain('FROM');
          expect(upperModified).toContain(testCase.table.toUpperCase());
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not modify SELECT queries that already have LIMIT clause', () => {
    fc.assert(
      fc.property(
        fc.record({
          columns: fc.oneof(
            fc.constant('*'),
            fc.array(fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz_'), { minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 5 })
              .map(cols => cols.join(', '))
          ),
          table: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz_'), { minLength: 1, maxLength: 20 }),
          existingLimit: fc.integer({ min: 1, max: 10000 }),
          maxSelectRows: fc.integer({ min: 1, max: 10000 }),
          limitCase: fc.constantFrom('LIMIT', 'limit', 'Limit', 'LiMiT'),
          trailingSemicolon: fc.boolean()
        }),
        (testCase) => {
          // Build SELECT query with existing LIMIT
          let query = `SELECT ${testCase.columns} FROM ${testCase.table} ${testCase.limitCase} ${testCase.existingLimit}`;
          
          if (testCase.trailingSemicolon) {
            query += ';';
          }

          const config: SecurityConfig = {
            maxSelectRows: testCase.maxSelectRows,
            allowDDL: false,
            allowMultipleStatements: false,
            requireWhereClause: true,
          };
          
          const validator = new QueryValidator(config);
          const result = validator.validate(query);
          
          // Query should be valid
          expect(result.valid).toBe(true);
          expect(result.statementType).toBe('SELECT');
          expect(result.modifiedQuery).toBeDefined();
          
          // Modified query should preserve the original LIMIT value
          const modifiedQuery = result.modifiedQuery!;
          const limitPattern = new RegExp(`LIMIT\\s+${testCase.existingLimit}`, 'i');
          expect(limitPattern.test(modifiedQuery)).toBe(true);
          
          // Should not add another LIMIT clause
          const limitCount = (modifiedQuery.match(/LIMIT/gi) || []).length;
          expect(limitCount).toBe(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle SELECT queries with various SQL clauses and still add LIMIT', () => {
    fc.assert(
      fc.property(
        fc.record({
          table: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz_'), { minLength: 1, maxLength: 20 }),
          hasWhere: fc.boolean(),
          hasGroupBy: fc.boolean(),
          hasHaving: fc.boolean(),
          hasOrderBy: fc.boolean(),
          maxSelectRows: fc.integer({ min: 1, max: 10000 })
        }),
        (testCase) => {
          // Build complex SELECT query
          let query = `SELECT * FROM ${testCase.table}`;
          
          if (testCase.hasWhere) {
            query += ' WHERE id > 0';
          }
          
          if (testCase.hasGroupBy) {
            query += ' GROUP BY category';
          }
          
          if (testCase.hasHaving) {
            query += ' HAVING COUNT(*) > 1';
          }
          
          if (testCase.hasOrderBy) {
            query += ' ORDER BY created_at DESC';
          }

          const config: SecurityConfig = {
            maxSelectRows: testCase.maxSelectRows,
            allowDDL: false,
            allowMultipleStatements: false,
            requireWhereClause: true,
          };
          
          const validator = new QueryValidator(config);
          const result = validator.validate(query);
          
          // Query should be valid
          expect(result.valid).toBe(true);
          expect(result.statementType).toBe('SELECT');
          expect(result.modifiedQuery).toBeDefined();
          
          // Modified query should have LIMIT at the end
          const modifiedQuery = result.modifiedQuery!;
          expect(modifiedQuery).toMatch(new RegExp(`LIMIT\\s+${testCase.maxSelectRows}$`, 'i'));
          
          // All original clauses should be preserved
          const upperModified = modifiedQuery.toUpperCase();
          if (testCase.hasWhere) {
            expect(upperModified).toContain('WHERE');
          }
          if (testCase.hasGroupBy) {
            expect(upperModified).toContain('GROUP BY');
          }
          if (testCase.hasHaving) {
            expect(upperModified).toContain('HAVING');
          }
          if (testCase.hasOrderBy) {
            expect(upperModified).toContain('ORDER BY');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: mysql-mcp-server, Property 7: Unsafe query rejection
  // Validates: Requirements 3.3
  it('should reject DELETE or UPDATE queries without WHERE clause', () => {
    fc.assert(
      fc.property(
        fc.record({
          statementType: fc.constantFrom('DELETE', 'UPDATE'),
          table: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz_'), { minLength: 1, maxLength: 20 }),
          setClause: fc.option(
            fc.record({
              column: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz_'), { minLength: 1, maxLength: 20 }),
              value: fc.oneof(
                fc.integer().map(n => n.toString()),
                // Generate strings without quotes or semicolons to avoid SQL syntax issues
                fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789 '), { minLength: 1, maxLength: 20 })
                  .map(s => `'${s}'`)
              )
            }).map(s => `SET ${s.column} = ${s.value}`),
            { nil: undefined }
          ),
          trailingSemicolon: fc.boolean(),
          extraWhitespace: fc.boolean()
        }),
        (testCase) => {
          // Build DELETE or UPDATE query WITHOUT WHERE clause
          let query: string;
          
          if (testCase.statementType === 'DELETE') {
            query = `DELETE FROM ${testCase.table}`;
          } else {
            // UPDATE requires SET clause
            const setClause = testCase.setClause || 'SET status = 1';
            query = `UPDATE ${testCase.table} ${setClause}`;
          }
          
          if (testCase.trailingSemicolon) {
            query += ';';
          }
          
          if (testCase.extraWhitespace) {
            query = `  ${query}  `;
          }

          const config: SecurityConfig = {
            maxSelectRows: 1000,
            allowDDL: false,
            allowMultipleStatements: false,
            requireWhereClause: true,
          };
          
          const validator = new QueryValidator(config);
          const result = validator.validate(query);
          
          // Query should be INVALID
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
          expect(result.statementType).toBe(testCase.statementType);
          
          // Error message should mention WHERE clause requirement
          expect(result.error).toContain('WHERE');
          expect(result.error).toContain(testCase.statementType);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should accept DELETE or UPDATE queries WITH WHERE clause', () => {
    fc.assert(
      fc.property(
        fc.record({
          statementType: fc.constantFrom('DELETE', 'UPDATE'),
          table: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz_'), { minLength: 1, maxLength: 20 }),
          whereColumn: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz_'), { minLength: 1, maxLength: 20 }),
          whereOperator: fc.constantFrom('=', '>', '<', '>=', '<=', '!=', 'LIKE', 'IN'),
          whereValue: fc.oneof(
            fc.integer().map(n => n.toString()),
            // Generate strings without quotes or semicolons to avoid SQL syntax issues
            fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789 '), { minLength: 1, maxLength: 20 })
              .map(s => `'${s}'`)
          ),
          setClause: fc.option(
            fc.record({
              column: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz_'), { minLength: 1, maxLength: 20 }),
              value: fc.oneof(
                fc.integer().map(n => n.toString()),
                // Generate strings without quotes or semicolons to avoid SQL syntax issues
                fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789 '), { minLength: 1, maxLength: 20 })
                  .map(s => `'${s}'`)
              )
            }).map(s => `SET ${s.column} = ${s.value}`),
            { nil: undefined }
          ),
          whereCase: fc.constantFrom('WHERE', 'where', 'Where', 'wHeRe'),
          trailingSemicolon: fc.boolean()
        }),
        (testCase) => {
          // Build DELETE or UPDATE query WITH WHERE clause
          let query: string;
          
          if (testCase.statementType === 'DELETE') {
            query = `DELETE FROM ${testCase.table} ${testCase.whereCase} ${testCase.whereColumn} ${testCase.whereOperator} ${testCase.whereValue}`;
          } else {
            // UPDATE requires SET clause
            const setClause = testCase.setClause || 'SET status = 1';
            query = `UPDATE ${testCase.table} ${setClause} ${testCase.whereCase} ${testCase.whereColumn} ${testCase.whereOperator} ${testCase.whereValue}`;
          }
          
          if (testCase.trailingSemicolon) {
            query += ';';
          }

          const config: SecurityConfig = {
            maxSelectRows: 1000,
            allowDDL: false,
            allowMultipleStatements: false,
            requireWhereClause: true,
          };
          
          const validator = new QueryValidator(config);
          const result = validator.validate(query);
          
          // Query should be VALID
          expect(result.valid).toBe(true);
          expect(result.statementType).toBe(testCase.statementType);
          expect(result.error).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should allow DELETE or UPDATE without WHERE when requireWhereClause is false', () => {
    fc.assert(
      fc.property(
        fc.record({
          statementType: fc.constantFrom('DELETE', 'UPDATE'),
          table: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz_'), { minLength: 1, maxLength: 20 }),
          setClause: fc.option(
            fc.record({
              column: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz_'), { minLength: 1, maxLength: 20 }),
              value: fc.oneof(
                fc.integer().map(n => n.toString()),
                // Generate strings without quotes or semicolons to avoid SQL syntax issues
                fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789 '), { minLength: 1, maxLength: 20 })
                  .map(s => `'${s}'`)
              )
            }).map(s => `SET ${s.column} = ${s.value}`),
            { nil: undefined }
          )
        }),
        (testCase) => {
          // Build DELETE or UPDATE query WITHOUT WHERE clause
          let query: string;
          
          if (testCase.statementType === 'DELETE') {
            query = `DELETE FROM ${testCase.table}`;
          } else {
            const setClause = testCase.setClause || 'SET status = 1';
            query = `UPDATE ${testCase.table} ${setClause}`;
          }

          const config: SecurityConfig = {
            maxSelectRows: 1000,
            allowDDL: false,
            allowMultipleStatements: false,
            requireWhereClause: false, // WHERE clause NOT required
          };
          
          const validator = new QueryValidator(config);
          const result = validator.validate(query);
          
          // Query should be VALID when requireWhereClause is false
          expect(result.valid).toBe(true);
          expect(result.statementType).toBe(testCase.statementType);
          expect(result.error).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: mysql-mcp-server, Property 9: Comprehensive query validation rules
  // Validates: Requirements 5.1, 5.2, 5.3, 5.4
  it('should validate queries against comprehensive security rules', () => {
    fc.assert(
      fc.property(
        fc.record({
          // Generate different types of queries
          queryType: fc.constantFrom(
            'valid-select',
            'valid-insert',
            'valid-update',
            'valid-delete',
            'multiple-statements',
            'ddl-create',
            'ddl-drop',
            'ddl-alter',
            'ddl-truncate',
            'unknown-statement'
          ),
          table: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz_'), { minLength: 1, maxLength: 20 }),
          allowDDL: fc.boolean(),
          allowMultipleStatements: fc.boolean(),
          requireWhereClause: fc.boolean()
        }),
        (testCase) => {
          const config: SecurityConfig = {
            maxSelectRows: 1000,
            allowDDL: testCase.allowDDL,
            allowMultipleStatements: testCase.allowMultipleStatements,
            requireWhereClause: testCase.requireWhereClause,
          };
          
          const validator = new QueryValidator(config);
          let query: string;
          let expectedValid: boolean;
          let expectedStatementType: StatementType | undefined;
          let shouldHaveError: boolean;

          // Build query based on type
          switch (testCase.queryType) {
            case 'valid-select':
              query = `SELECT * FROM ${testCase.table}`;
              expectedValid = true;
              expectedStatementType = 'SELECT';
              shouldHaveError = false;
              break;

            case 'valid-insert':
              query = `INSERT INTO ${testCase.table} (name) VALUES ('test')`;
              expectedValid = true;
              expectedStatementType = 'INSERT';
              shouldHaveError = false;
              break;

            case 'valid-update':
              query = `UPDATE ${testCase.table} SET status = 1 WHERE id = 1`;
              expectedValid = true;
              expectedStatementType = 'UPDATE';
              shouldHaveError = false;
              break;

            case 'valid-delete':
              query = `DELETE FROM ${testCase.table} WHERE id = 1`;
              expectedValid = true;
              expectedStatementType = 'DELETE';
              shouldHaveError = false;
              break;

            case 'multiple-statements':
              query = `SELECT * FROM ${testCase.table}; DROP TABLE ${testCase.table}`;
              // Valid only if allowMultipleStatements is true
              expectedValid = testCase.allowMultipleStatements;
              shouldHaveError = !testCase.allowMultipleStatements;
              break;

            case 'ddl-create':
              query = `CREATE TABLE ${testCase.table} (id INT)`;
              // Valid only if allowDDL is true
              expectedValid = testCase.allowDDL;
              expectedStatementType = 'DDL';
              shouldHaveError = !testCase.allowDDL;
              break;

            case 'ddl-drop':
              query = `DROP TABLE ${testCase.table}`;
              // Valid only if allowDDL is true
              expectedValid = testCase.allowDDL;
              expectedStatementType = 'DDL';
              shouldHaveError = !testCase.allowDDL;
              break;

            case 'ddl-alter':
              query = `ALTER TABLE ${testCase.table} ADD COLUMN name VARCHAR(255)`;
              // Valid only if allowDDL is true
              expectedValid = testCase.allowDDL;
              expectedStatementType = 'DDL';
              shouldHaveError = !testCase.allowDDL;
              break;

            case 'ddl-truncate':
              query = `TRUNCATE TABLE ${testCase.table}`;
              // Valid only if allowDDL is true
              expectedValid = testCase.allowDDL;
              expectedStatementType = 'DDL';
              shouldHaveError = !testCase.allowDDL;
              break;

            case 'unknown-statement':
              query = `EXPLAIN SELECT * FROM ${testCase.table}`;
              expectedValid = true;
              expectedStatementType = 'UNKNOWN';
              shouldHaveError = false;
              break;

            default:
              query = `SELECT * FROM ${testCase.table}`;
              expectedValid = true;
              expectedStatementType = 'SELECT';
              shouldHaveError = false;
          }

          const result = validator.validate(query);

          // Requirement 5.1: Validate against allowed operation types
          // Requirement 5.2: Reject multiple statements
          // Requirement 5.3: Reject DDL unless enabled
          expect(result.valid).toBe(expectedValid);

          // Requirement 5.4: Return descriptive error when validation fails
          if (shouldHaveError) {
            expect(result.error).toBeDefined();
            expect(result.error).not.toBe('');
            
            // Error message should be descriptive
            if (testCase.queryType === 'multiple-statements') {
              expect(result.error).toContain('Multiple statements');
            } else if (testCase.queryType.startsWith('ddl-')) {
              expect(result.error).toContain('DDL');
            }
          } else {
            expect(result.error).toBeUndefined();
          }

          // Statement type should be detected correctly
          if (expectedStatementType) {
            expect(result.statementType).toBe(expectedStatementType);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should validate queries with multiple validation rules combined', () => {
    fc.assert(
      fc.property(
        fc.record({
          table: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz_'), { minLength: 1, maxLength: 20 }),
          hasMultipleStatements: fc.boolean(),
          queryType: fc.constantFrom('select', 'insert', 'update', 'delete', 'ddl'),
          hasWhereClause: fc.boolean(),
          allowDDL: fc.boolean(),
          allowMultipleStatements: fc.boolean(),
          requireWhereClause: fc.boolean()
        }),
        (testCase) => {
          const config: SecurityConfig = {
            maxSelectRows: 1000,
            allowDDL: testCase.allowDDL,
            allowMultipleStatements: testCase.allowMultipleStatements,
            requireWhereClause: testCase.requireWhereClause,
          };
          
          const validator = new QueryValidator(config);
          let query: string;

          // Build query based on type
          switch (testCase.queryType) {
            case 'ddl':
              query = `CREATE TABLE ${testCase.table} (id INT)`;
              break;
            case 'update':
              if (testCase.hasWhereClause) {
                query = `UPDATE ${testCase.table} SET status = 1 WHERE id = 1`;
              } else {
                query = `UPDATE ${testCase.table} SET status = 1`;
              }
              break;
            case 'delete':
              if (testCase.hasWhereClause) {
                query = `DELETE FROM ${testCase.table} WHERE id = 1`;
              } else {
                query = `DELETE FROM ${testCase.table}`;
              }
              break;
            case 'insert':
              query = `INSERT INTO ${testCase.table} (name) VALUES ('test')`;
              break;
            default: // select
              query = `SELECT * FROM ${testCase.table}`;
          }

          // Add multiple statements if requested
          if (testCase.hasMultipleStatements) {
            query += `; SELECT * FROM ${testCase.table}`;
          }

          const result = validator.validate(query);

          // Determine expected validity based on all rules
          let shouldBeValid = true;
          let expectedError: string | undefined;

          // Check multiple statements rule (5.2) - highest priority
          if (testCase.hasMultipleStatements && !testCase.allowMultipleStatements) {
            shouldBeValid = false;
            expectedError = 'Multiple statements';
          }

          // Check DDL rule (5.3)
          if (testCase.queryType === 'ddl' && !testCase.allowDDL && shouldBeValid) {
            shouldBeValid = false;
            expectedError = 'DDL';
          }

          // Check WHERE clause rule (combined with 3.3)
          if ((testCase.queryType === 'update' || testCase.queryType === 'delete') && 
              !testCase.hasWhereClause && 
              testCase.requireWhereClause && 
              shouldBeValid) {
            shouldBeValid = false;
            expectedError = 'WHERE';
          }

          // Validate result
          expect(result.valid).toBe(shouldBeValid);

          // Requirement 5.4: Descriptive error messages
          if (!shouldBeValid) {
            expect(result.error).toBeDefined();
            expect(result.error).not.toBe('');
            if (expectedError) {
              expect(result.error).toContain(expectedError);
            }
          } else {
            expect(result.error).toBeUndefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject empty or whitespace-only queries with descriptive error', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(''),
          fc.constant('   '),
          fc.constant('\t'),
          fc.constant('\n'),
          fc.constant('  \t\n  ')
        ),
        (emptyQuery) => {
          const config: SecurityConfig = {
            maxSelectRows: 1000,
            allowDDL: false,
            allowMultipleStatements: false,
            requireWhereClause: true,
          };
          
          const validator = new QueryValidator(config);
          const result = validator.validate(emptyQuery);

          // Should be invalid
          expect(result.valid).toBe(false);
          
          // Should have descriptive error (Requirement 5.4)
          expect(result.error).toBeDefined();
          expect(result.error).toContain('empty');
        }
      ),
      { numRuns: 100 }
    );
  });
});
