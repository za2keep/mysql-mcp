/**
 * Unit tests for error handling module
 * Tests error response formatting, SQL state extraction, and error builders
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.4
 */

import { describe, it, expect } from 'vitest';
import {
  ErrorCode,
  buildErrorResponse,
  buildDatabaseErrorResponse,
  buildValidationErrorResponse,
  buildConnectionErrorResponse,
  buildTransactionErrorResponse,
  buildSecurityErrorResponse,
  extractSqlState,
  extractSqlMessage,
  extractSqlQuery,
} from '../../src/errors';

describe('Error Handling', () => {
  describe('ErrorCode enum', () => {
    it('should have JSON-RPC 2.0 standard error codes', () => {
      expect(ErrorCode.PARSE_ERROR).toBe(-32700);
      expect(ErrorCode.INVALID_REQUEST).toBe(-32600);
      expect(ErrorCode.METHOD_NOT_FOUND).toBe(-32601);
      expect(ErrorCode.INVALID_PARAMS).toBe(-32602);
      expect(ErrorCode.INTERNAL_ERROR).toBe(-32603);
    });

    it('should have application-specific error codes', () => {
      expect(ErrorCode.DATABASE_ERROR).toBe(-32000);
      expect(ErrorCode.VALIDATION_ERROR).toBe(-32001);
      expect(ErrorCode.CONNECTION_ERROR).toBe(-32002);
      expect(ErrorCode.TRANSACTION_ERROR).toBe(-32003);
      expect(ErrorCode.SECURITY_ERROR).toBe(-32004);
    });
  });

  describe('extractSqlState', () => {
    it('should extract SQL state from MySQL error with sqlState property', () => {
      const error = { sqlState: '42S02' };
      expect(extractSqlState(error)).toBe('42S02');
    });

    it('should extract SQL state from MySQL error with sqlStateMarker property', () => {
      const error = { sqlStateMarker: '42000' };
      expect(extractSqlState(error)).toBe('42000');
    });

    it('should return undefined for error without SQL state', () => {
      const error = { message: 'Some error' };
      expect(extractSqlState(error)).toBeUndefined();
    });

    it('should return undefined for non-object error', () => {
      expect(extractSqlState('string error')).toBeUndefined();
      expect(extractSqlState(null)).toBeUndefined();
      expect(extractSqlState(undefined)).toBeUndefined();
    });
  });

  describe('extractSqlMessage', () => {
    it('should extract SQL message from MySQL error', () => {
      const error = { sqlMessage: "Table 'test.users' doesn't exist" };
      expect(extractSqlMessage(error)).toBe("Table 'test.users' doesn't exist");
    });

    it('should return undefined for error without SQL message', () => {
      const error = { message: 'Some error' };
      expect(extractSqlMessage(error)).toBeUndefined();
    });

    it('should return undefined for non-object error', () => {
      expect(extractSqlMessage('string error')).toBeUndefined();
      expect(extractSqlMessage(null)).toBeUndefined();
    });
  });

  describe('extractSqlQuery', () => {
    it('should extract SQL query from MySQL error', () => {
      const error = { sql: 'SELECT * FROM users' };
      expect(extractSqlQuery(error)).toBe('SELECT * FROM users');
    });

    it('should return undefined for error without SQL query', () => {
      const error = { message: 'Some error' };
      expect(extractSqlQuery(error)).toBeUndefined();
    });

    it('should return undefined for non-object error', () => {
      expect(extractSqlQuery('string error')).toBeUndefined();
      expect(extractSqlQuery(null)).toBeUndefined();
    });
  });

  describe('buildErrorResponse', () => {
    it('should build basic error response with required fields', () => {
      const response = buildErrorResponse(
        ErrorCode.INTERNAL_ERROR,
        'Internal server error',
        123
      );

      expect(response).toEqual({
        jsonrpc: '2.0',
        id: 123,
        error: {
          code: -32603,
          message: 'Internal server error',
        },
      });
    });

    it('should build error response with null id', () => {
      const response = buildErrorResponse(
        ErrorCode.PARSE_ERROR,
        'Parse error',
        null
      );

      expect(response.id).toBeNull();
      expect(response.error.code).toBe(-32700);
    });

    it('should build error response with string id', () => {
      const response = buildErrorResponse(
        ErrorCode.INVALID_REQUEST,
        'Invalid request',
        'req-123'
      );

      expect(response.id).toBe('req-123');
      expect(response.error.code).toBe(-32600);
    });

    it('should include error data when provided', () => {
      const response = buildErrorResponse(
        ErrorCode.DATABASE_ERROR,
        'Database error',
        1,
        { sqlState: '42S02', details: { table: 'users' } }
      );

      expect(response.error.data).toEqual({
        sqlState: '42S02',
        details: { table: 'users' },
      });
    });

    it('should not include data field when data is undefined', () => {
      const response = buildErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        'Validation failed',
        1
      );

      expect(response.error).not.toHaveProperty('data');
    });
  });

  describe('buildDatabaseErrorResponse', () => {
    it('should build database error response from Error object', () => {
      const error = new Error('Connection lost');
      const response = buildDatabaseErrorResponse(error, 456);

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(456);
      expect(response.error.code).toBe(ErrorCode.DATABASE_ERROR);
      expect(response.error.message).toBe('Connection lost');
    });

    it('should extract SQL state, message, and query from MySQL error', () => {
      const mysqlError = Object.assign(new Error('Table not found'), {
        sqlState: '42S02',
        sqlMessage: "Table 'test.users' doesn't exist",
        sql: 'SELECT * FROM users',
        code: 'ER_NO_SUCH_TABLE',
      });

      const response = buildDatabaseErrorResponse(mysqlError, 789);

      expect(response.error.code).toBe(ErrorCode.DATABASE_ERROR);
      expect(response.error.message).toBe('Table not found');
      expect(response.error.data).toEqual({
        sqlState: '42S02',
        sqlMessage: "Table 'test.users' doesn't exist",
        query: 'SELECT * FROM users',
        details: { code: 'ER_NO_SUCH_TABLE' },
      });
    });

    it('should handle error without SQL information', () => {
      const error = new Error('Generic database error');
      const response = buildDatabaseErrorResponse(error);

      expect(response.error.code).toBe(ErrorCode.DATABASE_ERROR);
      expect(response.error.message).toBe('Generic database error');
      expect(response.error.data).toBeUndefined();
    });

    it('should handle non-Error objects', () => {
      const response = buildDatabaseErrorResponse('string error', 1);

      expect(response.error.code).toBe(ErrorCode.DATABASE_ERROR);
      expect(response.error.message).toBe('Database error occurred');
    });

    it('should include only available SQL information', () => {
      const partialError = Object.assign(new Error('Syntax error'), {
        sqlState: '42000',
      });

      const response = buildDatabaseErrorResponse(partialError);

      expect(response.error.data).toEqual({
        sqlState: '42000',
      });
    });
  });

  describe('buildValidationErrorResponse', () => {
    it('should build validation error response', () => {
      const response = buildValidationErrorResponse(
        'Invalid SQL query',
        100
      );

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(100);
      expect(response.error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(response.error.message).toBe('Invalid SQL query');
    });

    it('should include validation details when provided', () => {
      const details = { field: 'sql', reason: 'Multiple statements not allowed' };
      const response = buildValidationErrorResponse(
        'Validation failed',
        200,
        details
      );

      expect(response.error.data).toEqual({
        details: { field: 'sql', reason: 'Multiple statements not allowed' },
      });
    });

    it('should not include data when details are not provided', () => {
      const response = buildValidationErrorResponse('Invalid input', 300);

      expect(response.error).not.toHaveProperty('data');
    });
  });

  describe('buildConnectionErrorResponse', () => {
    it('should build connection error response from Error object', () => {
      const error = new Error('ECONNREFUSED');
      const response = buildConnectionErrorResponse(error, 400);

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(400);
      expect(response.error.code).toBe(ErrorCode.CONNECTION_ERROR);
      expect(response.error.message).toBe('ECONNREFUSED');
    });

    it('should handle non-Error objects', () => {
      const response = buildConnectionErrorResponse('connection failed', 500);

      expect(response.error.code).toBe(ErrorCode.CONNECTION_ERROR);
      expect(response.error.message).toBe('Connection error occurred');
    });

    it('should not include data field', () => {
      const error = new Error('Connection timeout');
      const response = buildConnectionErrorResponse(error);

      expect(response.error).not.toHaveProperty('data');
    });
  });

  describe('buildTransactionErrorResponse', () => {
    it('should build transaction error response from Error object', () => {
      const error = new Error('Transaction already active');
      const response = buildTransactionErrorResponse(error, 600);

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(600);
      expect(response.error.code).toBe(ErrorCode.TRANSACTION_ERROR);
      expect(response.error.message).toBe('Transaction already active');
    });

    it('should handle non-Error objects', () => {
      const response = buildTransactionErrorResponse('transaction failed', 700);

      expect(response.error.code).toBe(ErrorCode.TRANSACTION_ERROR);
      expect(response.error.message).toBe('Transaction error occurred');
    });

    it('should not include data field', () => {
      const error = new Error('Cannot commit');
      const response = buildTransactionErrorResponse(error);

      expect(response.error).not.toHaveProperty('data');
    });
  });

  describe('buildSecurityErrorResponse', () => {
    it('should build security error response', () => {
      const response = buildSecurityErrorResponse(
        'DDL operations not allowed',
        800
      );

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(800);
      expect(response.error.code).toBe(ErrorCode.SECURITY_ERROR);
      expect(response.error.message).toBe('DDL operations not allowed');
    });

    it('should include security violation details when provided', () => {
      const details = { operation: 'DROP TABLE', reason: 'DDL disabled' };
      const response = buildSecurityErrorResponse(
        'Unsafe operation',
        900,
        details
      );

      expect(response.error.data).toEqual({
        details: { operation: 'DROP TABLE', reason: 'DDL disabled' },
      });
    });

    it('should not include data when details are not provided', () => {
      const response = buildSecurityErrorResponse('Security violation', 1000);

      expect(response.error).not.toHaveProperty('data');
    });
  });

  describe('Error Response Format Consistency', () => {
    it('should always include jsonrpc version 2.0', () => {
      const responses = [
        buildErrorResponse(ErrorCode.INTERNAL_ERROR, 'test', 1),
        buildDatabaseErrorResponse(new Error('test'), 2),
        buildValidationErrorResponse('test', 3),
        buildConnectionErrorResponse(new Error('test'), 4),
        buildTransactionErrorResponse(new Error('test'), 5),
        buildSecurityErrorResponse('test', 6),
      ];

      responses.forEach((response) => {
        expect(response.jsonrpc).toBe('2.0');
      });
    });

    it('should always include error object with code and message', () => {
      const responses = [
        buildErrorResponse(ErrorCode.INTERNAL_ERROR, 'test', 1),
        buildDatabaseErrorResponse(new Error('test'), 2),
        buildValidationErrorResponse('test', 3),
        buildConnectionErrorResponse(new Error('test'), 4),
        buildTransactionErrorResponse(new Error('test'), 5),
        buildSecurityErrorResponse('test', 6),
      ];

      responses.forEach((response) => {
        expect(response.error).toBeDefined();
        expect(typeof response.error.code).toBe('number');
        expect(typeof response.error.message).toBe('string');
      });
    });

    it('should use correct error codes for each error type', () => {
      expect(buildDatabaseErrorResponse(new Error('test')).error.code).toBe(
        ErrorCode.DATABASE_ERROR
      );
      expect(buildValidationErrorResponse('test').error.code).toBe(
        ErrorCode.VALIDATION_ERROR
      );
      expect(buildConnectionErrorResponse(new Error('test')).error.code).toBe(
        ErrorCode.CONNECTION_ERROR
      );
      expect(buildTransactionErrorResponse(new Error('test')).error.code).toBe(
        ErrorCode.TRANSACTION_ERROR
      );
      expect(buildSecurityErrorResponse('test').error.code).toBe(
        ErrorCode.SECURITY_ERROR
      );
    });
  });
});
