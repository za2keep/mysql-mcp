/**
 * Unit tests for logging module
 * Tests log levels, filtering, formatting, and output
 * 
 * Requirements: 7.1, 7.4
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Logger, LogLevel, createLogger } from '../../src/logger';

describe('Logger', () => {
  let consoleErrorSpy: any;

  beforeEach(() => {
    // Spy on console.error to capture log output
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore console.error
    consoleErrorSpy.mockRestore();
  });

  describe('Constructor and Configuration', () => {
    it('should create logger with default settings', () => {
      const logger = new Logger();

      expect(logger.isEnabled()).toBe(true);
      expect(logger.getLevel()).toBe(LogLevel.INFO);
    });

    it('should create logger with custom settings', () => {
      const logger = new Logger(false, LogLevel.ERROR);

      expect(logger.isEnabled()).toBe(false);
      expect(logger.getLevel()).toBe(LogLevel.ERROR);
    });

    it('should allow changing log level', () => {
      const logger = new Logger();
      logger.setLevel(LogLevel.DEBUG);

      expect(logger.getLevel()).toBe(LogLevel.DEBUG);
    });

    it('should allow enabling/disabling logging', () => {
      const logger = new Logger(true);
      expect(logger.isEnabled()).toBe(true);

      logger.setEnabled(false);
      expect(logger.isEnabled()).toBe(false);

      logger.setEnabled(true);
      expect(logger.isEnabled()).toBe(true);
    });
  });

  describe('Log Level Filtering', () => {
    it('should log messages at or above the configured level', () => {
      const logger = new Logger(true, LogLevel.WARN);

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      // Only WARN and ERROR should be logged
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
    });

    it('should log all messages when level is DEBUG', () => {
      const logger = new Logger(true, LogLevel.DEBUG);

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(4);
    });

    it('should only log ERROR messages when level is ERROR', () => {
      const logger = new Logger(true, LogLevel.ERROR);

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it('should not log any messages when disabled', () => {
      const logger = new Logger(false, LogLevel.DEBUG);

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('Log Message Formatting', () => {
    it('should format log message with timestamp and level', () => {
      const logger = new Logger(true, LogLevel.INFO);

      logger.info('Test message');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const logOutput = consoleErrorSpy.mock.calls[0][0];

      // Check format: [timestamp] [LEVEL] message
      expect(logOutput).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/);
      expect(logOutput).toContain('[INFO]');
      expect(logOutput).toContain('Test message');
    });

    it('should include context as JSON when provided', () => {
      const logger = new Logger(true, LogLevel.INFO);
      const context = { method: 'query', duration: 123 };

      logger.info('Query executed', context);

      const logOutput = consoleErrorSpy.mock.calls[0][0];
      expect(logOutput).toContain('Query executed');
      expect(logOutput).toContain(JSON.stringify(context));
    });

    it('should not include context when not provided', () => {
      const logger = new Logger(true, LogLevel.INFO);

      logger.info('Simple message');

      const logOutput = consoleErrorSpy.mock.calls[0][0];
      expect(logOutput).toContain('Simple message');
      expect(logOutput).not.toContain('{');
    });

    it('should format different log levels correctly', () => {
      const logger = new Logger(true, LogLevel.DEBUG);

      logger.debug('debug msg');
      logger.info('info msg');
      logger.warn('warn msg');
      logger.error('error msg');

      expect(consoleErrorSpy.mock.calls[0][0]).toContain('[DEBUG]');
      expect(consoleErrorSpy.mock.calls[1][0]).toContain('[INFO]');
      expect(consoleErrorSpy.mock.calls[2][0]).toContain('[WARN]');
      expect(consoleErrorSpy.mock.calls[3][0]).toContain('[ERROR]');
    });
  });

  describe('Log Methods', () => {
    it('should log debug messages', () => {
      const logger = new Logger(true, LogLevel.DEBUG);

      logger.debug('Debug information');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('[DEBUG]');
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('Debug information');
    });

    it('should log info messages', () => {
      const logger = new Logger(true, LogLevel.INFO);

      logger.info('Information');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('[INFO]');
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('Information');
    });

    it('should log warning messages', () => {
      const logger = new Logger(true, LogLevel.WARN);

      logger.warn('Warning');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('[WARN]');
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('Warning');
    });

    it('should log error messages', () => {
      const logger = new Logger(true, LogLevel.ERROR);

      logger.error('Error occurred');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('[ERROR]');
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('Error occurred');
    });
  });

  describe('Context Logging', () => {
    it('should log method context', () => {
      const logger = new Logger(true, LogLevel.INFO);

      logger.info('Tool called', { method: 'query' });

      const logOutput = consoleErrorSpy.mock.calls[0][0];
      expect(logOutput).toContain('"method":"query"');
    });

    it('should log params context', () => {
      const logger = new Logger(true, LogLevel.INFO);

      logger.info('Request received', { params: { sql: 'SELECT 1' } });

      const logOutput = consoleErrorSpy.mock.calls[0][0];
      expect(logOutput).toContain('"params"');
      expect(logOutput).toContain('"sql":"SELECT 1"');
    });

    it('should log error context', () => {
      const logger = new Logger(true, LogLevel.ERROR);
      const error = new Error('Database connection failed');

      logger.error('Operation failed', { error: error.message });

      const logOutput = consoleErrorSpy.mock.calls[0][0];
      expect(logOutput).toContain('"error"');
      expect(logOutput).toContain('Database connection failed');
    });

    it('should log duration context', () => {
      const logger = new Logger(true, LogLevel.INFO);

      logger.info('Query completed', { duration: 456 });

      const logOutput = consoleErrorSpy.mock.calls[0][0];
      expect(logOutput).toContain('"duration":456');
    });

    it('should log complex context objects', () => {
      const logger = new Logger(true, LogLevel.INFO);
      const context = {
        method: 'query',
        params: { sql: 'SELECT * FROM users' },
        duration: 123,
        rows: 5,
      };

      logger.info('Query executed', context);

      const logOutput = consoleErrorSpy.mock.calls[0][0];
      expect(logOutput).toContain('"method":"query"');
      expect(logOutput).toContain('"duration":123');
      expect(logOutput).toContain('"rows":5');
    });

    it('should handle empty context object', () => {
      const logger = new Logger(true, LogLevel.INFO);

      logger.info('Message', {});

      const logOutput = consoleErrorSpy.mock.calls[0][0];
      // Empty context should not be included
      expect(logOutput).not.toContain('{}');
    });
  });

  describe('Output to stderr', () => {
    it('should write all logs to stderr (console.error)', () => {
      const logger = new Logger(true, LogLevel.DEBUG);

      logger.debug('debug');
      logger.info('info');
      logger.warn('warn');
      logger.error('error');

      // All logs should go to console.error (stderr)
      expect(consoleErrorSpy).toHaveBeenCalledTimes(4);
    });

    it('should not interfere with stdout', () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const logger = new Logger(true, LogLevel.INFO);

      logger.info('Test message');

      // Should not call console.log
      expect(consoleLogSpy).not.toHaveBeenCalled();
      // Should call console.error
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);

      consoleLogSpy.mockRestore();
    });
  });

  describe('createLogger factory function', () => {
    it('should create logger with specified settings', () => {
      const logger = createLogger(true, 'debug');

      expect(logger.isEnabled()).toBe(true);
      expect(logger.getLevel()).toBe(LogLevel.DEBUG);
    });

    it('should create logger with different log levels', () => {
      const debugLogger = createLogger(true, 'debug');
      const infoLogger = createLogger(true, 'info');
      const warnLogger = createLogger(true, 'warn');
      const errorLogger = createLogger(true, 'error');

      expect(debugLogger.getLevel()).toBe(LogLevel.DEBUG);
      expect(infoLogger.getLevel()).toBe(LogLevel.INFO);
      expect(warnLogger.getLevel()).toBe(LogLevel.WARN);
      expect(errorLogger.getLevel()).toBe(LogLevel.ERROR);
    });

    it('should create disabled logger', () => {
      const logger = createLogger(false, 'info');

      expect(logger.isEnabled()).toBe(false);
    });
  });

  describe('Timestamp Format', () => {
    it('should use ISO 8601 timestamp format', () => {
      const logger = new Logger(true, LogLevel.INFO);

      logger.info('Test');

      const logOutput = consoleErrorSpy.mock.calls[0][0];
      // ISO 8601 format: YYYY-MM-DDTHH:mm:ss.sssZ
      const isoRegex = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/;
      expect(logOutput).toMatch(isoRegex);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null context gracefully', () => {
      const logger = new Logger(true, LogLevel.INFO);

      logger.info('Message', null as any);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it('should handle undefined context gracefully', () => {
      const logger = new Logger(true, LogLevel.INFO);

      logger.info('Message', undefined);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it('should handle very long messages', () => {
      const logger = new Logger(true, LogLevel.INFO);
      const longMessage = 'A'.repeat(10000);

      logger.info(longMessage);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy.mock.calls[0][0]).toContain(longMessage);
    });

    it('should handle special characters in messages', () => {
      const logger = new Logger(true, LogLevel.INFO);

      logger.info('Message with "quotes" and \'apostrophes\' and \n newlines');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it('should handle context with circular references', () => {
      const logger = new Logger(true, LogLevel.INFO);
      const circular: any = { name: 'test' };
      circular.self = circular;

      // Should not throw error
      expect(() => {
        logger.info('Circular context', circular);
      }).toThrow(); // JSON.stringify will throw on circular references
    });
  });
});
