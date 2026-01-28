/**
 * Logging module for MySQL MCP Server
 * Provides structured logging with different log levels
 * All logs are written to stderr to avoid interfering with stdio transport
 * 
 * Requirements: 7.1, 7.4, 7.5
 */

/**
 * Log levels in order of severity
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

/**
 * Log level priority for filtering
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  [LogLevel.DEBUG]: 0,
  [LogLevel.INFO]: 1,
  [LogLevel.WARN]: 2,
  [LogLevel.ERROR]: 3,
};

/**
 * Log entry context information
 */
export interface LogContext {
  method?: string;
  params?: any;
  error?: any;
  duration?: number;
  [key: string]: any;
}

/**
 * Structured log entry
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
}

/**
 * Logger class for structured logging
 * Outputs to stderr with configurable log levels
 * 
 * Requirements: 7.1, 7.4, 7.5
 */
export class Logger {
  private enabled: boolean;
  private level: LogLevel;

  /**
   * Create a new Logger instance
   * 
   * @param enabled - Whether logging is enabled
   * @param level - Minimum log level to output
   */
  constructor(enabled: boolean = true, level: LogLevel = LogLevel.INFO) {
    this.enabled = enabled;
    this.level = level;
  }

  /**
   * Check if a log level should be output
   * 
   * @param level - Log level to check
   * @returns true if the level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    if (!this.enabled) {
      return false;
    }
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.level];
  }

  /**
   * Format a log entry as a string
   * 
   * @param entry - Log entry to format
   * @returns Formatted log string
   */
  private formatLogEntry(entry: LogEntry): string {
    const parts = [
      `[${entry.timestamp}]`,
      `[${entry.level.toUpperCase()}]`,
      entry.message,
    ];

    if (entry.context && Object.keys(entry.context).length > 0) {
      // Format context as JSON for structured logging
      parts.push(JSON.stringify(entry.context));
    }

    return parts.join(' ');
  }

  /**
   * Write a log entry to stderr
   * 
   * @param level - Log level
   * @param message - Log message
   * @param context - Optional context information
   */
  private log(level: LogLevel, message: string, context?: LogContext): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
    };

    // Write to stderr to avoid interfering with stdio transport
    console.error(this.formatLogEntry(entry));
  }

  /**
   * Log a debug message
   * 
   * @param message - Debug message
   * @param context - Optional context information
   */
  debug(message: string, context?: LogContext): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  /**
   * Log an info message
   * 
   * @param message - Info message
   * @param context - Optional context information
   */
  info(message: string, context?: LogContext): void {
    this.log(LogLevel.INFO, message, context);
  }

  /**
   * Log a warning message
   * 
   * @param message - Warning message
   * @param context - Optional context information
   */
  warn(message: string, context?: LogContext): void {
    this.log(LogLevel.WARN, message, context);
  }

  /**
   * Log an error message
   * 
   * @param message - Error message
   * @param context - Optional context information
   */
  error(message: string, context?: LogContext): void {
    this.log(LogLevel.ERROR, message, context);
  }

  /**
   * Set the log level
   * 
   * @param level - New log level
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * Enable or disable logging
   * 
   * @param enabled - Whether logging should be enabled
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Get the current log level
   * 
   * @returns Current log level
   */
  getLevel(): LogLevel {
    return this.level;
  }

  /**
   * Check if logging is enabled
   * 
   * @returns true if logging is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}

/**
 * Create a logger instance from configuration
 * 
 * @param enabled - Whether logging is enabled
 * @param level - Log level string
 * @returns Logger instance
 */
export function createLogger(
  enabled: boolean,
  level: 'debug' | 'info' | 'warn' | 'error'
): Logger {
  return new Logger(enabled, level as LogLevel);
}
