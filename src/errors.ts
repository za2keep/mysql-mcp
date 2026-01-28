/**
 * Error handling module for MySQL MCP Server
 * Provides standardized error codes and error response formatting
 * 
 * Requirements: 7.2, 7.3
 */

/**
 * Error codes following JSON-RPC 2.0 specification
 * Extended with application-specific error codes
 */
export enum ErrorCode {
  // JSON-RPC 2.0 standard errors
  PARSE_ERROR = -32700,
  INVALID_REQUEST = -32600,
  METHOD_NOT_FOUND = -32601,
  INVALID_PARAMS = -32602,
  INTERNAL_ERROR = -32603,

  // Application-specific errors
  DATABASE_ERROR = -32000,
  VALIDATION_ERROR = -32001,
  CONNECTION_ERROR = -32002,
  TRANSACTION_ERROR = -32003,
  SECURITY_ERROR = -32004,
}

/**
 * Error response data structure
 * Contains additional context about the error
 */
export interface ErrorData {
  sqlState?: string;
  sqlMessage?: string;
  query?: string;
  details?: any;
}

/**
 * JSON-RPC 2.0 error response structure
 */
export interface ErrorResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  error: {
    code: number;
    message: string;
    data?: ErrorData;
  };
}

/**
 * Extract SQL state code from MySQL error
 * 
 * @param error - Error object (potentially a MySQL error)
 * @returns SQL state code if available, undefined otherwise
 */
export function extractSqlState(error: unknown): string | undefined {
  if (error && typeof error === 'object') {
    const mysqlError = error as any;
    return mysqlError.sqlState || mysqlError.sqlStateMarker;
  }
  return undefined;
}

/**
 * Extract SQL error message from MySQL error
 * 
 * @param error - Error object (potentially a MySQL error)
 * @returns SQL error message if available, undefined otherwise
 */
export function extractSqlMessage(error: unknown): string | undefined {
  if (error && typeof error === 'object') {
    const mysqlError = error as any;
    return mysqlError.sqlMessage;
  }
  return undefined;
}

/**
 * Extract SQL query from MySQL error
 * 
 * @param error - Error object (potentially a MySQL error)
 * @returns SQL query if available, undefined otherwise
 */
export function extractSqlQuery(error: unknown): string | undefined {
  if (error && typeof error === 'object') {
    const mysqlError = error as any;
    return mysqlError.sql;
  }
  return undefined;
}

/**
 * Build a standardized error response
 * 
 * Requirements: 7.2, 7.3
 * 
 * @param code - Error code from ErrorCode enum
 * @param message - Human-readable error message
 * @param id - Request ID (for JSON-RPC correlation)
 * @param data - Additional error context
 * @returns Formatted error response
 */
export function buildErrorResponse(
  code: ErrorCode,
  message: string,
  id: string | number | null = null,
  data?: ErrorData
): ErrorResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      ...(data && { data }),
    },
  };
}

/**
 * Build error response from a database error
 * Extracts SQL state, message, and query information
 * 
 * Requirements: 7.2, 7.3
 * 
 * @param error - Database error object
 * @param id - Request ID (for JSON-RPC correlation)
 * @returns Formatted error response with database error details
 */
export function buildDatabaseErrorResponse(
  error: unknown,
  id: string | number | null = null
): ErrorResponse {
  const message = error instanceof Error ? error.message : 'Database error occurred';
  
  const data: ErrorData = {};
  
  // Extract SQL state code
  const sqlState = extractSqlState(error);
  if (sqlState) {
    data.sqlState = sqlState;
  }
  
  // Extract SQL error message
  const sqlMessage = extractSqlMessage(error);
  if (sqlMessage) {
    data.sqlMessage = sqlMessage;
  }
  
  // Extract SQL query
  const query = extractSqlQuery(error);
  if (query) {
    data.query = query;
  }
  
  // Add error code if available
  if (error && typeof error === 'object') {
    const mysqlError = error as any;
    if (mysqlError.code) {
      data.details = { code: mysqlError.code };
    }
  }

  return buildErrorResponse(
    ErrorCode.DATABASE_ERROR,
    message,
    id,
    Object.keys(data).length > 0 ? data : undefined
  );
}

/**
 * Build error response from a validation error
 * 
 * Requirements: 7.3
 * 
 * @param message - Validation error message
 * @param id - Request ID (for JSON-RPC correlation)
 * @param details - Additional validation details
 * @returns Formatted error response
 */
export function buildValidationErrorResponse(
  message: string,
  id: string | number | null = null,
  details?: any
): ErrorResponse {
  return buildErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    message,
    id,
    details ? { details } : undefined
  );
}

/**
 * Build error response from a connection error
 * 
 * Requirements: 7.2, 7.3
 * 
 * @param error - Connection error object
 * @param id - Request ID (for JSON-RPC correlation)
 * @returns Formatted error response
 */
export function buildConnectionErrorResponse(
  error: unknown,
  id: string | number | null = null
): ErrorResponse {
  const message = error instanceof Error ? error.message : 'Connection error occurred';
  
  return buildErrorResponse(
    ErrorCode.CONNECTION_ERROR,
    message,
    id
  );
}

/**
 * Build error response from a transaction error
 * 
 * Requirements: 7.2, 7.3
 * 
 * @param error - Transaction error object
 * @param id - Request ID (for JSON-RPC correlation)
 * @returns Formatted error response
 */
export function buildTransactionErrorResponse(
  error: unknown,
  id: string | number | null = null
): ErrorResponse {
  const message = error instanceof Error ? error.message : 'Transaction error occurred';
  
  return buildErrorResponse(
    ErrorCode.TRANSACTION_ERROR,
    message,
    id
  );
}

/**
 * Build error response from a security/validation error
 * 
 * Requirements: 7.3
 * 
 * @param message - Security error message
 * @param id - Request ID (for JSON-RPC correlation)
 * @param details - Additional security violation details
 * @returns Formatted error response
 */
export function buildSecurityErrorResponse(
  message: string,
  id: string | number | null = null,
  details?: any
): ErrorResponse {
  return buildErrorResponse(
    ErrorCode.SECURITY_ERROR,
    message,
    id,
    details ? { details } : undefined
  );
}
