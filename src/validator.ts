import type { SecurityConfig } from './config.js';

/**
 * SQL statement types
 */
export type StatementType = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'DDL' | 'UNKNOWN';

/**
 * Query validation result
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
  statementType?: StatementType;
  modifiedQuery?: string;
}

/**
 * Query validation error
 */
export class QueryValidationError extends Error {
  constructor(
    message: string,
    public readonly statementType?: StatementType
  ) {
    super(message);
    this.name = 'QueryValidationError';
  }
}

/**
 * QueryValidator class for validating and modifying SQL queries
 * according to security policies
 */
export class QueryValidator {
  private config: SecurityConfig;

  constructor(config: SecurityConfig) {
    this.config = config;
  }

  /**
   * Validate a SQL query against security policies
   * 
   * @param sql - SQL query to validate
   * @returns ValidationResult with validation status and any modifications
   */
  validate(sql: string): ValidationResult {
    // Check for empty or whitespace-only queries
    const trimmedSql = sql.trim();
    if (!trimmedSql) {
      return {
        valid: false,
        error: 'Query cannot be empty',
      };
    }

    // Check for multiple statements
    if (this.checkMultipleStatements(trimmedSql)) {
      return {
        valid: false,
        error: 'Multiple statements are not allowed',
      };
    }

    // Detect statement type
    const statementType = this.detectStatementType(trimmedSql);

    // Check if DDL operations are allowed
    if (statementType === 'DDL' && !this.config.allowDDL) {
      return {
        valid: false,
        error: 'DDL operations (CREATE, DROP, ALTER, TRUNCATE) are not allowed',
        statementType,
      };
    }

    // Check WHERE clause requirement for UPDATE and DELETE
    if ((statementType === 'UPDATE' || statementType === 'DELETE') && 
        this.config.requireWhereClause) {
      if (!this.checkWhereClause(trimmedSql, statementType)) {
        return {
          valid: false,
          error: `${statementType} queries must include a WHERE clause`,
          statementType,
        };
      }
    }

    // For SELECT queries, add LIMIT if not present
    if (statementType === 'SELECT') {
      const modifiedQuery = this.addLimitToSelect(trimmedSql);
      return {
        valid: true,
        statementType,
        modifiedQuery,
      };
    }

    // Query is valid
    return {
      valid: true,
      statementType,
      modifiedQuery: trimmedSql,
    };
  }

  /**
   * Detect the type of SQL statement
   * 
   * @param sql - SQL query to analyze
   * @returns StatementType
   */
  private detectStatementType(sql: string): StatementType {
    // Normalize: remove leading/trailing whitespace and convert to uppercase
    const normalized = sql.trim().toUpperCase();

    // Check for DDL operations
    if (
      normalized.startsWith('CREATE ') ||
      normalized.startsWith('DROP ') ||
      normalized.startsWith('ALTER ') ||
      normalized.startsWith('TRUNCATE ') ||
      normalized.startsWith('RENAME ')
    ) {
      return 'DDL';
    }

    // Check for DML operations
    if (normalized.startsWith('SELECT ')) {
      return 'SELECT';
    }
    if (normalized.startsWith('INSERT ')) {
      return 'INSERT';
    }
    if (normalized.startsWith('UPDATE ')) {
      return 'UPDATE';
    }
    if (normalized.startsWith('DELETE ')) {
      return 'DELETE';
    }

    // Unknown statement type
    return 'UNKNOWN';
  }

  /**
   * Check if the query contains multiple statements
   * 
   * @param sql - SQL query to check
   * @returns true if multiple statements detected
   */
  private checkMultipleStatements(sql: string): boolean {
    if (!this.config.allowMultipleStatements) {
      // Simple check: look for semicolons that are not in strings
      // This is a basic implementation - a full parser would be more robust
      
      let inSingleQuote = false;
      let inDoubleQuote = false;
      let escaped = false;

      for (let i = 0; i < sql.length; i++) {
        const char = sql[i];

        if (escaped) {
          escaped = false;
          continue;
        }

        if (char === '\\') {
          escaped = true;
          continue;
        }

        if (char === "'" && !inDoubleQuote) {
          inSingleQuote = !inSingleQuote;
          continue;
        }

        if (char === '"' && !inSingleQuote) {
          inDoubleQuote = !inDoubleQuote;
          continue;
        }

        // If we find a semicolon outside of quotes, it's a statement separator
        if (char === ';' && !inSingleQuote && !inDoubleQuote) {
          // Check if there's any non-whitespace content after the semicolon
          const remaining = sql.substring(i + 1).trim();
          if (remaining.length > 0) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Check if UPDATE or DELETE query has a WHERE clause
   * 
   * @param sql - SQL query to check
   * @param type - Statement type (UPDATE or DELETE)
   * @returns true if WHERE clause is present
   */
  private checkWhereClause(sql: string, type: StatementType): boolean {
    if (type !== 'UPDATE' && type !== 'DELETE') {
      return true; // Not applicable
    }

    // Normalize the query
    const normalized = sql.toUpperCase();

    // Look for WHERE keyword
    // Use word boundaries to avoid matching WHERE in column names or strings
    const wherePattern = /\bWHERE\b/;
    return wherePattern.test(normalized);
  }

  /**
   * Add LIMIT clause to SELECT query if not present
   * 
   * @param sql - SELECT query
   * @returns Modified query with LIMIT clause
   */
  private addLimitToSelect(sql: string): string {
    const normalized = sql.toUpperCase();

    // Check if LIMIT already exists
    const limitPattern = /\bLIMIT\b/;
    if (limitPattern.test(normalized)) {
      return sql; // LIMIT already present
    }

    // Add LIMIT at the end
    // Remove trailing semicolon if present
    let query = sql.trim();
    if (query.endsWith(';')) {
      query = query.substring(0, query.length - 1).trim();
    }

    return `${query} LIMIT ${this.config.maxSelectRows}`;
  }
}
