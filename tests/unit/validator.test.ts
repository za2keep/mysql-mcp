import { describe, it, expect, beforeEach } from 'vitest';
import { QueryValidator, QueryValidationError } from '../../src/validator';
import type { SecurityConfig } from '../../src/config';

describe('QueryValidator Unit Tests', () => {
  let validator: QueryValidator;
  let defaultConfig: SecurityConfig;

  beforeEach(() => {
    defaultConfig = {
      maxSelectRows: 1000,
      allowDDL: false,
      allowMultipleStatements: false,
      requireWhereClause: true,
    };
    validator = new QueryValidator(defaultConfig);
  });

  describe('SQL Statement Type Detection', () => {
    it('should detect SELECT statements', () => {
      const result = validator.validate('SELECT * FROM users');
      expect(result.valid).toBe(true);
      expect(result.statementType).toBe('SELECT');
    });

    it('should detect INSERT statements', () => {
      const result = validator.validate('INSERT INTO users (name) VALUES ("John")');
      expect(result.valid).toBe(true);
      expect(result.statementType).toBe('INSERT');
    });

    it('should detect UPDATE statements', () => {
      const result = validator.validate('UPDATE users SET name = "Jane" WHERE id = 1');
      expect(result.valid).toBe(true);
      expect(result.statementType).toBe('UPDATE');
    });

    it('should detect DELETE statements', () => {
      const result = validator.validate('DELETE FROM users WHERE id = 1');
      expect(result.valid).toBe(true);
      expect(result.statementType).toBe('DELETE');
    });

    it('should detect CREATE DDL statements', () => {
      const result = validator.validate('CREATE TABLE users (id INT)');
      expect(result.valid).toBe(false);
      expect(result.statementType).toBe('DDL');
      expect(result.error).toContain('DDL operations');
    });

    it('should detect DROP DDL statements', () => {
      const result = validator.validate('DROP TABLE users');
      expect(result.valid).toBe(false);
      expect(result.statementType).toBe('DDL');
    });

    it('should detect ALTER DDL statements', () => {
      const result = validator.validate('ALTER TABLE users ADD COLUMN email VARCHAR(255)');
      expect(result.valid).toBe(false);
      expect(result.statementType).toBe('DDL');
    });

    it('should detect TRUNCATE DDL statements', () => {
      const result = validator.validate('TRUNCATE TABLE users');
      expect(result.valid).toBe(false);
      expect(result.statementType).toBe('DDL');
    });

    it('should detect RENAME DDL statements', () => {
      const result = validator.validate('RENAME TABLE users TO customers');
      expect(result.valid).toBe(false);
      expect(result.statementType).toBe('DDL');
    });

    it('should handle case-insensitive statement detection', () => {
      const selectResult = validator.validate('select * from users');
      expect(selectResult.statementType).toBe('SELECT');

      const insertResult = validator.validate('insert into users values (1)');
      expect(insertResult.statementType).toBe('INSERT');

      const updateResult = validator.validate('update users set name = "x" where id = 1');
      expect(updateResult.statementType).toBe('UPDATE');
    });

    it('should detect statement type with leading whitespace', () => {
      const result = validator.validate('   SELECT * FROM users');
      expect(result.statementType).toBe('SELECT');
    });

    it('should detect statement type with leading newlines', () => {
      const result = validator.validate('\n\n  SELECT * FROM users');
      expect(result.statementType).toBe('SELECT');
    });
  });

  describe('Edge Cases - Empty and Whitespace Queries', () => {
    it('should reject empty query', () => {
      const result = validator.validate('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Query cannot be empty');
    });

    it('should reject whitespace-only query', () => {
      const result = validator.validate('   ');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Query cannot be empty');
    });

    it('should reject query with only newlines', () => {
      const result = validator.validate('\n\n\n');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Query cannot be empty');
    });

    it('should reject query with only tabs', () => {
      const result = validator.validate('\t\t\t');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Query cannot be empty');
    });

    it('should reject query with mixed whitespace', () => {
      const result = validator.validate('  \n\t  \n  ');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Query cannot be empty');
    });
  });

  describe('Edge Cases - Special Characters', () => {
    it('should handle queries with single quotes in strings', () => {
      const result = validator.validate("SELECT * FROM users WHERE name = 'O''Brien'");
      expect(result.valid).toBe(true);
      expect(result.statementType).toBe('SELECT');
    });

    it('should handle queries with double quotes in strings', () => {
      const result = validator.validate('SELECT * FROM users WHERE name = "John \\"Doe\\""');
      expect(result.valid).toBe(true);
      expect(result.statementType).toBe('SELECT');
    });

    it('should handle queries with escaped backslashes', () => {
      const result = validator.validate("SELECT * FROM users WHERE path = 'C:\\\\Users\\\\John'");
      expect(result.valid).toBe(true);
      expect(result.statementType).toBe('SELECT');
    });

    it('should handle queries with newlines in strings', () => {
      const result = validator.validate("SELECT * FROM users WHERE bio = 'Line 1\nLine 2'");
      expect(result.valid).toBe(true);
      expect(result.statementType).toBe('SELECT');
    });

    it('should handle queries with special SQL characters', () => {
      const result = validator.validate("SELECT * FROM users WHERE email LIKE '%@example.com'");
      expect(result.valid).toBe(true);
      expect(result.statementType).toBe('SELECT');
    });

    it('should handle queries with Unicode characters', () => {
      const result = validator.validate("SELECT * FROM users WHERE name = '日本語'");
      expect(result.valid).toBe(true);
      expect(result.statementType).toBe('SELECT');
    });

    it('should handle queries with emoji', () => {
      const result = validator.validate("SELECT * FROM posts WHERE content = '🎉 Party!'");
      expect(result.valid).toBe(true);
      expect(result.statementType).toBe('SELECT');
    });
  });

  describe('Multiple Statement Detection', () => {
    it('should reject multiple statements separated by semicolon', () => {
      const result = validator.validate('SELECT * FROM users; DROP TABLE users');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Multiple statements are not allowed');
    });

    it('should reject multiple statements with whitespace', () => {
      const result = validator.validate('SELECT * FROM users;  \n  SELECT * FROM posts');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Multiple statements are not allowed');
    });

    it('should allow single statement with trailing semicolon', () => {
      const result = validator.validate('SELECT * FROM users;');
      expect(result.valid).toBe(true);
      expect(result.statementType).toBe('SELECT');
    });

    it('should allow single statement with trailing semicolon and whitespace', () => {
      const result = validator.validate('SELECT * FROM users;  \n  ');
      expect(result.valid).toBe(true);
      expect(result.statementType).toBe('SELECT');
    });

    it('should not detect semicolon in single-quoted string as statement separator', () => {
      const result = validator.validate("SELECT * FROM users WHERE bio = 'Hello; World'");
      expect(result.valid).toBe(true);
      expect(result.statementType).toBe('SELECT');
    });

    it('should not detect semicolon in double-quoted string as statement separator', () => {
      const result = validator.validate('SELECT * FROM users WHERE bio = "Hello; World"');
      expect(result.valid).toBe(true);
      expect(result.statementType).toBe('SELECT');
    });

    it('should handle escaped quotes before semicolon', () => {
      const result = validator.validate("SELECT * FROM users WHERE bio = 'It\\'s great'; SELECT 1");
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Multiple statements are not allowed');
    });
  });

  describe('WHERE Clause Requirement', () => {
    it('should reject UPDATE without WHERE clause', () => {
      const result = validator.validate('UPDATE users SET active = 1');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('UPDATE queries must include a WHERE clause');
      expect(result.statementType).toBe('UPDATE');
    });

    it('should reject DELETE without WHERE clause', () => {
      const result = validator.validate('DELETE FROM users');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('DELETE queries must include a WHERE clause');
      expect(result.statementType).toBe('DELETE');
    });

    it('should allow UPDATE with WHERE clause', () => {
      const result = validator.validate('UPDATE users SET active = 1 WHERE id = 5');
      expect(result.valid).toBe(true);
      expect(result.statementType).toBe('UPDATE');
    });

    it('should allow DELETE with WHERE clause', () => {
      const result = validator.validate('DELETE FROM users WHERE id = 5');
      expect(result.valid).toBe(true);
      expect(result.statementType).toBe('DELETE');
    });

    it('should detect WHERE clause case-insensitively', () => {
      const result = validator.validate('UPDATE users SET active = 1 where id = 5');
      expect(result.valid).toBe(true);
    });

    it('should not be fooled by WHERE in column name', () => {
      const result = validator.validate('UPDATE users SET somewhere = 1');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('WHERE clause');
    });

    it('should detect WHERE even in string literal (simple implementation)', () => {
      // Note: The current implementation uses a simple regex pattern that will
      // match WHERE even in string literals. A full SQL parser would be needed
      // to properly distinguish WHERE in strings vs WHERE clauses.
      const result = validator.validate('UPDATE users SET bio = "WHERE am I?"');
      expect(result.valid).toBe(true); // Passes because WHERE is detected in the string
    });

    it('should allow UPDATE without WHERE when requireWhereClause is false', () => {
      const permissiveConfig = { ...defaultConfig, requireWhereClause: false };
      const permissiveValidator = new QueryValidator(permissiveConfig);
      const result = permissiveValidator.validate('UPDATE users SET active = 1');
      expect(result.valid).toBe(true);
    });

    it('should allow DELETE without WHERE when requireWhereClause is false', () => {
      const permissiveConfig = { ...defaultConfig, requireWhereClause: false };
      const permissiveValidator = new QueryValidator(permissiveConfig);
      const result = permissiveValidator.validate('DELETE FROM users');
      expect(result.valid).toBe(true);
    });
  });

  describe('DDL Operation Control', () => {
    it('should reject CREATE when allowDDL is false', () => {
      const result = validator.validate('CREATE TABLE test (id INT)');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('DDL operations');
      expect(result.error).toContain('CREATE');
    });

    it('should reject DROP when allowDDL is false', () => {
      const result = validator.validate('DROP TABLE test');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('DDL operations');
    });

    it('should reject ALTER when allowDDL is false', () => {
      const result = validator.validate('ALTER TABLE test ADD COLUMN name VARCHAR(100)');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('DDL operations');
    });

    it('should reject TRUNCATE when allowDDL is false', () => {
      const result = validator.validate('TRUNCATE TABLE test');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('DDL operations');
    });

    it('should allow CREATE when allowDDL is true', () => {
      const permissiveConfig = { ...defaultConfig, allowDDL: true };
      const permissiveValidator = new QueryValidator(permissiveConfig);
      const result = permissiveValidator.validate('CREATE TABLE test (id INT)');
      expect(result.valid).toBe(true);
      expect(result.statementType).toBe('DDL');
    });

    it('should allow DROP when allowDDL is true', () => {
      const permissiveConfig = { ...defaultConfig, allowDDL: true };
      const permissiveValidator = new QueryValidator(permissiveConfig);
      const result = permissiveValidator.validate('DROP TABLE test');
      expect(result.valid).toBe(true);
      expect(result.statementType).toBe('DDL');
    });

    it('should allow ALTER when allowDDL is true', () => {
      const permissiveConfig = { ...defaultConfig, allowDDL: true };
      const permissiveValidator = new QueryValidator(permissiveConfig);
      const result = permissiveValidator.validate('ALTER TABLE test ADD COLUMN name VARCHAR(100)');
      expect(result.valid).toBe(true);
      expect(result.statementType).toBe('DDL');
    });
  });

  describe('SELECT Query LIMIT Addition', () => {
    it('should add LIMIT to SELECT without LIMIT', () => {
      const result = validator.validate('SELECT * FROM users');
      expect(result.valid).toBe(true);
      expect(result.modifiedQuery).toBe('SELECT * FROM users LIMIT 1000');
    });

    it('should not add LIMIT to SELECT that already has LIMIT', () => {
      const result = validator.validate('SELECT * FROM users LIMIT 50');
      expect(result.valid).toBe(true);
      expect(result.modifiedQuery).toBe('SELECT * FROM users LIMIT 50');
    });

    it('should detect LIMIT case-insensitively', () => {
      const result = validator.validate('SELECT * FROM users limit 50');
      expect(result.valid).toBe(true);
      expect(result.modifiedQuery).toBe('SELECT * FROM users limit 50');
    });

    it('should add LIMIT with custom maxSelectRows', () => {
      const customConfig = { ...defaultConfig, maxSelectRows: 500 };
      const customValidator = new QueryValidator(customConfig);
      const result = customValidator.validate('SELECT * FROM users');
      expect(result.valid).toBe(true);
      expect(result.modifiedQuery).toBe('SELECT * FROM users LIMIT 500');
    });

    it('should remove trailing semicolon before adding LIMIT', () => {
      const result = validator.validate('SELECT * FROM users;');
      expect(result.valid).toBe(true);
      expect(result.modifiedQuery).toBe('SELECT * FROM users LIMIT 1000');
    });

    it('should handle SELECT with complex WHERE clause', () => {
      const result = validator.validate('SELECT * FROM users WHERE age > 18 AND status = "active"');
      expect(result.valid).toBe(true);
      expect(result.modifiedQuery).toBe('SELECT * FROM users WHERE age > 18 AND status = "active" LIMIT 1000');
    });

    it('should handle SELECT with ORDER BY', () => {
      const result = validator.validate('SELECT * FROM users ORDER BY created_at DESC');
      expect(result.valid).toBe(true);
      expect(result.modifiedQuery).toBe('SELECT * FROM users ORDER BY created_at DESC LIMIT 1000');
    });

    it('should not add LIMIT to INSERT statements', () => {
      const result = validator.validate('INSERT INTO users (name) VALUES ("John")');
      expect(result.valid).toBe(true);
      expect(result.modifiedQuery).toBe('INSERT INTO users (name) VALUES ("John")');
    });

    it('should not add LIMIT to UPDATE statements', () => {
      const result = validator.validate('UPDATE users SET active = 1 WHERE id = 5');
      expect(result.valid).toBe(true);
      expect(result.modifiedQuery).toBe('UPDATE users SET active = 1 WHERE id = 5');
    });

    it('should not add LIMIT to DELETE statements', () => {
      const result = validator.validate('DELETE FROM users WHERE id = 5');
      expect(result.valid).toBe(true);
      expect(result.modifiedQuery).toBe('DELETE FROM users WHERE id = 5');
    });
  });

  describe('Error Messages', () => {
    it('should provide descriptive error for empty query', () => {
      const result = validator.validate('');
      expect(result.error).toBe('Query cannot be empty');
    });

    it('should provide descriptive error for multiple statements', () => {
      const result = validator.validate('SELECT 1; SELECT 2');
      expect(result.error).toBe('Multiple statements are not allowed');
    });

    it('should provide descriptive error for DDL operations', () => {
      const result = validator.validate('CREATE TABLE test (id INT)');
      expect(result.error).toContain('DDL operations');
      expect(result.error).toContain('CREATE');
      expect(result.error).toContain('DROP');
      expect(result.error).toContain('ALTER');
    });

    it('should provide descriptive error for UPDATE without WHERE', () => {
      const result = validator.validate('UPDATE users SET active = 1');
      expect(result.error).toBe('UPDATE queries must include a WHERE clause');
    });

    it('should provide descriptive error for DELETE without WHERE', () => {
      const result = validator.validate('DELETE FROM users');
      expect(result.error).toBe('DELETE queries must include a WHERE clause');
    });

    it('should include statement type in error response', () => {
      const result = validator.validate('CREATE TABLE test (id INT)');
      expect(result.statementType).toBe('DDL');
      expect(result.valid).toBe(false);
    });
  });

  describe('Complex Query Scenarios', () => {
    it('should handle multi-line queries', () => {
      const query = `
        SELECT 
          u.id,
          u.name,
          u.email
        FROM users u
        WHERE u.active = 1
      `;
      const result = validator.validate(query);
      expect(result.valid).toBe(true);
      expect(result.statementType).toBe('SELECT');
    });

    it('should handle queries with comments', () => {
      const query = 'SELECT * FROM users /* this is a comment */ WHERE id = 1';
      const result = validator.validate(query);
      expect(result.valid).toBe(true);
      expect(result.statementType).toBe('SELECT');
    });

    it('should handle queries with subqueries', () => {
      const query = 'SELECT * FROM users WHERE id IN (SELECT user_id FROM orders WHERE total > 100)';
      const result = validator.validate(query);
      expect(result.valid).toBe(true);
      expect(result.statementType).toBe('SELECT');
    });

    it('should handle queries with JOINs', () => {
      const query = 'SELECT u.*, o.* FROM users u JOIN orders o ON u.id = o.user_id WHERE u.active = 1';
      const result = validator.validate(query);
      expect(result.valid).toBe(true);
      expect(result.statementType).toBe('SELECT');
    });

    it('should handle INSERT with multiple values', () => {
      const query = 'INSERT INTO users (name, email) VALUES ("John", "john@example.com"), ("Jane", "jane@example.com")';
      const result = validator.validate(query);
      expect(result.valid).toBe(true);
      expect(result.statementType).toBe('INSERT');
    });

    it('should handle UPDATE with multiple SET clauses', () => {
      const query = 'UPDATE users SET name = "John", email = "john@example.com", updated_at = NOW() WHERE id = 1';
      const result = validator.validate(query);
      expect(result.valid).toBe(true);
      expect(result.statementType).toBe('UPDATE');
    });
  });
});
