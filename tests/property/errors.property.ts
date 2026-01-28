/**
 * Property tests for error response format consistency
 * Validates that all error types return properly formatted JSON-RPC 2.0 error responses
 * 
 * Requirements: 1.6, 7.2, 7.3
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  ErrorCode,
  buildErrorResponse,
  buildDatabaseErrorResponse,
  buildValidationErrorResponse,
  buildConnectionErrorResponse,
  buildTransactionErrorResponse,
  buildSecurityErrorResponse,
  type ErrorResponse,
} from '../../src/errors.js';

describe('Error Response Format Consistency Property Tests', () => {
  // Feature: mysql-mcp-server, Property 14: Error response format consistency
  // Validates: Requirements 1.6, 7.2, 7.3
  it('should return consistent JSON-RPC 2.0 error format for all error types', () => {
    fc.assert(
      fc.property(
        fc.record({
          // Generate different error scenarios
          errorType: fc.constantFrom(
            'database',
            'validation',
            'connection',
            'transaction',
            'security',
            'generic'
          ),
          // Generate various error messages
          errorMessage: fc.oneof(
            fc.string({ minLength: 1, maxLength: 200 }),
            fc.constant('Connection failed'),
            fc.constant('Invalid query syntax'),
            fc.constant('Transaction already active'),
            fc.constant('DDL operations not allowed'),
            fc.constant('Table not found')
          ),
          // Generate various request IDs
          requestId: fc.oneof(
            fc.string({ minLength: 1, maxLength: 50 }),
            fc.integer(),
            fc.constant(null)
          ),
          // Generate MySQL error properties
          hasSqlState: fc.boolean(),
          sqlState: fc.stringOf(
            fc.constantFrom(...'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'),
            { minLength: 5, maxLength: 5 }
          ),
          hasSqlMessage: fc.boolean(),
          sqlMessage: fc.string({ minLength: 1, maxLength: 100 }),
          hasSqlQuery: fc.boolean(),
          sqlQuery: fc.string({ minLength: 1, maxLength: 200 }),
          hasErrorCode: fc.boolean(),
          mysqlErrorCode: fc.stringOf(
            fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ_'),
            { minLength: 2, maxLength: 20 }
          ),
          // Generate validation/security details
          hasDetails: fc.boolean(),
          detailsField: fc.string({ minLength: 1, maxLength: 50 }),
          detailsValue: fc.oneof(
            fc.string({ minLength: 1, maxLength: 100 }),
            fc.integer(),
            fc.boolean()
          ),
        }),
        (testCase) => {
          let response: ErrorResponse;
          let expectedErrorCode: ErrorCode;

          // Build error response based on error type
          switch (testCase.errorType) {
            case 'database': {
              // Create a mock MySQL error object
              const mysqlError: any = new Error(testCase.errorMessage);
              
              if (testCase.hasSqlState) {
                mysqlError.sqlState = testCase.sqlState;
              }
              
              if (testCase.hasSqlMessage) {
                mysqlError.sqlMessage = testCase.sqlMessage;
              }
              
              if (testCase.hasSqlQuery) {
                mysqlError.sql = testCase.sqlQuery;
              }
              
              if (testCase.hasErrorCode) {
                mysqlError.code = testCase.mysqlErrorCode;
              }

              response = buildDatabaseErrorResponse(mysqlError, testCase.requestId);
              expectedErrorCode = ErrorCode.DATABASE_ERROR;
              break;
            }

            case 'validation': {
              const details = testCase.hasDetails
                ? { [testCase.detailsField]: testCase.detailsValue }
                : undefined;
              
              response = buildValidationErrorResponse(
                testCase.errorMessage,
                testCase.requestId,
                details
              );
              expectedErrorCode = ErrorCode.VALIDATION_ERROR;
              break;
            }

            case 'connection': {
              const connectionError = new Error(testCase.errorMessage);
              response = buildConnectionErrorResponse(connectionError, testCase.requestId);
              expectedErrorCode = ErrorCode.CONNECTION_ERROR;
              break;
            }

            case 'transaction': {
              const transactionError = new Error(testCase.errorMessage);
              response = buildTransactionErrorResponse(transactionError, testCase.requestId);
              expectedErrorCode = ErrorCode.TRANSACTION_ERROR;
              break;
            }

            case 'security': {
              const details = testCase.hasDetails
                ? { [testCase.detailsField]: testCase.detailsValue }
                : undefined;
              
              response = buildSecurityErrorResponse(
                testCase.errorMessage,
                testCase.requestId,
                details
              );
              expectedErrorCode = ErrorCode.SECURITY_ERROR;
              break;
            }

            case 'generic':
            default: {
              // Use generic buildErrorResponse
              const errorCode = fc.sample(
                fc.constantFrom(
                  ErrorCode.PARSE_ERROR,
                  ErrorCode.INVALID_REQUEST,
                  ErrorCode.METHOD_NOT_FOUND,
                  ErrorCode.INVALID_PARAMS,
                  ErrorCode.INTERNAL_ERROR
                ),
                1
              )[0];
              
              response = buildErrorResponse(
                errorCode,
                testCase.errorMessage,
                testCase.requestId
              );
              expectedErrorCode = errorCode;
              break;
            }
          }

          // CRITICAL TEST 1: Response must have jsonrpc field set to "2.0"
          expect(response).toHaveProperty('jsonrpc');
          expect(response.jsonrpc).toBe('2.0');
          expect(typeof response.jsonrpc).toBe('string');

          // CRITICAL TEST 2: Response must have id field matching request ID
          expect(response).toHaveProperty('id');
          expect(response.id).toBe(testCase.requestId);
          
          // ID must be string, number, or null (JSON-RPC 2.0 spec)
          expect(
            response.id === null ||
              typeof response.id === 'string' ||
              typeof response.id === 'number'
          ).toBe(true);

          // CRITICAL TEST 3: Response must have error object
          expect(response).toHaveProperty('error');
          expect(typeof response.error).toBe('object');
          expect(response.error).not.toBeNull();

          // CRITICAL TEST 4: Error object must have code field (number)
          expect(response.error).toHaveProperty('code');
          expect(typeof response.error.code).toBe('number');
          expect(response.error.code).toBe(expectedErrorCode);

          // CRITICAL TEST 5: Error code must be valid JSON-RPC or application-specific
          const validStandardCodes = [
            ErrorCode.PARSE_ERROR,
            ErrorCode.INVALID_REQUEST,
            ErrorCode.METHOD_NOT_FOUND,
            ErrorCode.INVALID_PARAMS,
            ErrorCode.INTERNAL_ERROR,
          ];
          
          const validApplicationCodes = [
            ErrorCode.DATABASE_ERROR,
            ErrorCode.VALIDATION_ERROR,
            ErrorCode.CONNECTION_ERROR,
            ErrorCode.TRANSACTION_ERROR,
            ErrorCode.SECURITY_ERROR,
          ];
          
          const isValidCode =
            validStandardCodes.includes(response.error.code) ||
            validApplicationCodes.includes(response.error.code) ||
            (response.error.code >= -32099 && response.error.code <= -32000);
          
          expect(isValidCode).toBe(true);

          // CRITICAL TEST 6: Error object must have message field (non-empty string)
          expect(response.error).toHaveProperty('message');
          expect(typeof response.error.message).toBe('string');
          expect(response.error.message.length).toBeGreaterThan(0);

          // CRITICAL TEST 7: Response must NOT have result field (errors don't have results)
          expect(response).not.toHaveProperty('result');

          // CRITICAL TEST 8: Response must be JSON-serializable
          let jsonString: string;
          let parsedResponse: any;

          try {
            jsonString = JSON.stringify(response);
            expect(jsonString).toBeDefined();
            expect(typeof jsonString).toBe('string');
            expect(jsonString.length).toBeGreaterThan(0);

            parsedResponse = JSON.parse(jsonString);
            expect(parsedResponse).toBeDefined();
            expect(typeof parsedResponse).toBe('object');
            expect(parsedResponse).not.toBeNull();
          } catch (error) {
            throw new Error(
              `Error response must be JSON-serializable but got error: ${error}`
            );
          }

          // CRITICAL TEST 9: Structure must be preserved after JSON round-trip
          expect(parsedResponse.jsonrpc).toBe('2.0');
          expect(parsedResponse.id).toBe(testCase.requestId);
          expect(parsedResponse).toHaveProperty('error');
          expect(parsedResponse.error).toHaveProperty('code');
          expect(parsedResponse.error.code).toBe(expectedErrorCode);
          expect(parsedResponse.error).toHaveProperty('message');
          expect(parsedResponse.error.message).toBe(response.error.message);

          // CRITICAL TEST 10: Verify data field consistency (Requirements 7.2, 7.3)
          if (response.error.data) {
            // If data exists, it must be an object
            expect(typeof response.error.data).toBe('object');
            expect(response.error.data).not.toBeNull();

            // Data must be JSON-serializable
            expect(parsedResponse.error).toHaveProperty('data');
            expect(typeof parsedResponse.error.data).toBe('object');

            // For database errors, verify SQL state/message/query are included when available
            if (testCase.errorType === 'database') {
              if (testCase.hasSqlState) {
                expect(response.error.data).toHaveProperty('sqlState');
                expect(response.error.data.sqlState).toBe(testCase.sqlState);
                expect(parsedResponse.error.data.sqlState).toBe(testCase.sqlState);
              }

              if (testCase.hasSqlMessage) {
                expect(response.error.data).toHaveProperty('sqlMessage');
                expect(response.error.data.sqlMessage).toBe(testCase.sqlMessage);
                expect(parsedResponse.error.data.sqlMessage).toBe(testCase.sqlMessage);
              }

              if (testCase.hasSqlQuery) {
                expect(response.error.data).toHaveProperty('query');
                expect(response.error.data.query).toBe(testCase.sqlQuery);
                expect(parsedResponse.error.data.query).toBe(testCase.sqlQuery);
              }

              if (testCase.hasErrorCode) {
                expect(response.error.data).toHaveProperty('details');
                expect(response.error.data.details).toHaveProperty('code');
                expect(response.error.data.details.code).toBe(testCase.mysqlErrorCode);
              }
            }

            // For validation/security errors, verify details are included when provided
            if (
              (testCase.errorType === 'validation' || testCase.errorType === 'security') &&
              testCase.hasDetails
            ) {
              expect(response.error.data).toHaveProperty('details');
              expect(response.error.data.details).toHaveProperty(testCase.detailsField);
              expect(response.error.data.details[testCase.detailsField]).toBe(
                testCase.detailsValue
              );
              expect(parsedResponse.error.data.details[testCase.detailsField]).toBe(
                testCase.detailsValue
              );
            }
          } else {
            // If data doesn't exist in response, it shouldn't exist after parsing
            expect(parsedResponse.error.data).toBeUndefined();
          }

          // CRITICAL TEST 11: Verify response structure matches JSON-RPC 2.0 spec exactly
          const responseKeys = Object.keys(response).sort();
          const expectedKeys = response.error.data
            ? ['error', 'id', 'jsonrpc']
            : ['error', 'id', 'jsonrpc'];
          
          expect(responseKeys).toEqual(expectedKeys);

          // CRITICAL TEST 12: Verify error object structure
          const errorKeys = Object.keys(response.error).sort();
          const expectedErrorKeys = response.error.data
            ? ['code', 'data', 'message']
            : ['code', 'message'];
          
          expect(errorKeys).toEqual(expectedErrorKeys);

          // CRITICAL TEST 13: Verify all string fields are non-empty
          expect(response.jsonrpc.length).toBeGreaterThan(0);
          expect(response.error.message.length).toBeGreaterThan(0);

          // CRITICAL TEST 14: Verify error message is descriptive (not just generic)
          // For database errors with SQL state, message should be meaningful
          if (testCase.errorType === 'database' && testCase.errorMessage.length > 0) {
            expect(response.error.message).toBe(testCase.errorMessage);
          }

          // CRITICAL TEST 15: Verify consistency across multiple serialization cycles
          const secondJsonString = JSON.stringify(parsedResponse);
          const secondParsedResponse = JSON.parse(secondJsonString);
          
          expect(secondParsedResponse.jsonrpc).toBe('2.0');
          expect(secondParsedResponse.id).toBe(testCase.requestId);
          expect(secondParsedResponse.error.code).toBe(expectedErrorCode);
          expect(secondParsedResponse.error.message).toBe(response.error.message);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Additional property test: Verify error responses handle edge cases
  it('should handle edge cases in error response formatting', () => {
    fc.assert(
      fc.property(
        fc.record({
          // Test edge cases for error messages
          errorMessage: fc.oneof(
            fc.constant(''), // Empty string (should be handled)
            fc.string({ minLength: 1, maxLength: 1 }), // Single character
            fc.string({ minLength: 1000, maxLength: 2000 }), // Very long message
            fc.constant('Error with "quotes" and \'apostrophes\''),
            fc.constant('Error with\nnewlines\nand\ttabs'),
            fc.constant('Error with special chars: <>&"\''),
            fc.constant('Error with unicode: 你好世界 🚀'),
          ),
          // Test edge cases for request IDs
          requestId: fc.oneof(
            fc.constant(0), // Zero
            fc.constant(-1), // Negative number
            fc.integer({ min: Number.MIN_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER }),
            fc.constant(''), // Empty string
            fc.string({ minLength: 1000, maxLength: 1000 }), // Very long string
            fc.constant(null),
          ),
          errorType: fc.constantFrom(
            'database',
            'validation',
            'connection',
            'transaction',
            'security'
          ),
        }),
        (testCase) => {
          let response: ErrorResponse;

          // Build error response based on type
          switch (testCase.errorType) {
            case 'database':
              response = buildDatabaseErrorResponse(
                new Error(testCase.errorMessage || 'Database error'),
                testCase.requestId
              );
              break;
            case 'validation':
              response = buildValidationErrorResponse(
                testCase.errorMessage || 'Validation error',
                testCase.requestId
              );
              break;
            case 'connection':
              response = buildConnectionErrorResponse(
                new Error(testCase.errorMessage || 'Connection error'),
                testCase.requestId
              );
              break;
            case 'transaction':
              response = buildTransactionErrorResponse(
                new Error(testCase.errorMessage || 'Transaction error'),
                testCase.requestId
              );
              break;
            case 'security':
              response = buildSecurityErrorResponse(
                testCase.errorMessage || 'Security error',
                testCase.requestId
              );
              break;
          }

          // All edge cases should still produce valid JSON-RPC 2.0 responses
          expect(response.jsonrpc).toBe('2.0');
          expect(response.id).toBe(testCase.requestId);
          expect(response.error).toBeDefined();
          expect(typeof response.error.code).toBe('number');
          expect(typeof response.error.message).toBe('string');

          // Message should never be empty (fallback to default if needed)
          expect(response.error.message.length).toBeGreaterThan(0);

          // Must be JSON-serializable even with edge cases
          const jsonString = JSON.stringify(response);
          expect(jsonString).toBeDefined();

          const parsed = JSON.parse(jsonString);
          expect(parsed.jsonrpc).toBe('2.0');
          expect(parsed.id).toBe(testCase.requestId);
          expect(parsed.error.code).toBe(response.error.code);
          expect(parsed.error.message).toBe(response.error.message);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Additional property test: Verify all error codes are within valid ranges
  it('should use error codes within valid JSON-RPC 2.0 ranges', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          ErrorCode.PARSE_ERROR,
          ErrorCode.INVALID_REQUEST,
          ErrorCode.METHOD_NOT_FOUND,
          ErrorCode.INVALID_PARAMS,
          ErrorCode.INTERNAL_ERROR,
          ErrorCode.DATABASE_ERROR,
          ErrorCode.VALIDATION_ERROR,
          ErrorCode.CONNECTION_ERROR,
          ErrorCode.TRANSACTION_ERROR,
          ErrorCode.SECURITY_ERROR
        ),
        (errorCode) => {
          const response = buildErrorResponse(errorCode, 'Test error', 1);

          // Error code must be a negative integer
          expect(response.error.code).toBeLessThan(0);
          expect(Number.isInteger(response.error.code)).toBe(true);

          // Standard JSON-RPC 2.0 errors: -32768 to -32000
          // Application-specific errors: -32099 to -32000
          const isStandardError =
            response.error.code >= -32768 && response.error.code <= -32000;
          
          expect(isStandardError).toBe(true);

          // Verify specific error code ranges
          if (
            errorCode === ErrorCode.PARSE_ERROR ||
            errorCode === ErrorCode.INVALID_REQUEST ||
            errorCode === ErrorCode.METHOD_NOT_FOUND ||
            errorCode === ErrorCode.INVALID_PARAMS ||
            errorCode === ErrorCode.INTERNAL_ERROR
          ) {
            // Standard JSON-RPC 2.0 errors: -32700 to -32600
            expect(response.error.code).toBeGreaterThanOrEqual(-32768);
            expect(response.error.code).toBeLessThanOrEqual(-32600);
          } else {
            // Application-specific errors: -32099 to -32000
            expect(response.error.code).toBeGreaterThanOrEqual(-32099);
            expect(response.error.code).toBeLessThanOrEqual(-32000);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
