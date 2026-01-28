import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TransactionManager, TransactionError, TransactionState } from '../../src/transaction';
import type mysql from 'mysql2/promise';

describe('Transaction Management Unit Tests', () => {
  let mockPool: any;
  let mockConnection: any;
  let transactionManager: TransactionManager;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create mock connection
    mockConnection = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    };

    // Create mock pool
    mockPool = {
      getConnection: vi.fn().mockResolvedValue(mockConnection),
    };

    // Create fresh transaction manager
    transactionManager = new TransactionManager();
  });

  describe('Transaction State Transitions', () => {
    it('should start in NONE state', () => {
      expect(transactionManager.getState()).toBe(TransactionState.NONE);
      expect(transactionManager.isInTransaction()).toBe(false);
    });

    it('should transition to ACTIVE state after begin', async () => {
      await transactionManager.begin(mockPool);

      expect(transactionManager.getState()).toBe(TransactionState.ACTIVE);
      expect(transactionManager.isInTransaction()).toBe(true);
    });

    it('should transition to COMMITTED state after commit', async () => {
      await transactionManager.begin(mockPool);
      await transactionManager.commit();

      expect(transactionManager.getState()).toBe(TransactionState.COMMITTED);
      expect(transactionManager.isInTransaction()).toBe(false);
    });

    it('should transition to ROLLED_BACK state after rollback', async () => {
      await transactionManager.begin(mockPool);
      await transactionManager.rollback();

      expect(transactionManager.getState()).toBe(TransactionState.ROLLED_BACK);
      expect(transactionManager.isInTransaction()).toBe(false);
    });

    it('should allow new transaction after commit', async () => {
      await transactionManager.begin(mockPool);
      await transactionManager.commit();

      // Should be able to start new transaction
      await transactionManager.begin(mockPool);
      expect(transactionManager.getState()).toBe(TransactionState.ACTIVE);
    });

    it('should allow new transaction after rollback', async () => {
      await transactionManager.begin(mockPool);
      await transactionManager.rollback();

      // Should be able to start new transaction
      await transactionManager.begin(mockPool);
      expect(transactionManager.getState()).toBe(TransactionState.ACTIVE);
    });

    it('should reject nested transactions', async () => {
      await transactionManager.begin(mockPool);

      await expect(transactionManager.begin(mockPool)).rejects.toThrow(TransactionError);
      await expect(transactionManager.begin(mockPool)).rejects.toThrow(
        'Transaction already active. Nested transactions are not supported.'
      );
    });

    it('should reject commit when no transaction is active', async () => {
      await expect(transactionManager.commit()).rejects.toThrow(TransactionError);
      await expect(transactionManager.commit()).rejects.toThrow('No active transaction to commit');
    });

    it('should reject rollback when no transaction is active', async () => {
      await expect(transactionManager.rollback()).rejects.toThrow(TransactionError);
      await expect(transactionManager.rollback()).rejects.toThrow('No active transaction to rollback');
    });

    it('should reject commit after already committed', async () => {
      await transactionManager.begin(mockPool);
      await transactionManager.commit();

      await expect(transactionManager.commit()).rejects.toThrow(TransactionError);
      await expect(transactionManager.commit()).rejects.toThrow('No active transaction to commit');
    });

    it('should reject rollback after already rolled back', async () => {
      await transactionManager.begin(mockPool);
      await transactionManager.rollback();

      await expect(transactionManager.rollback()).rejects.toThrow(TransactionError);
      await expect(transactionManager.rollback()).rejects.toThrow('No active transaction to rollback');
    });
  });

  describe('Connection Management', () => {
    it('should acquire connection from pool on begin', async () => {
      await transactionManager.begin(mockPool);

      expect(mockPool.getConnection).toHaveBeenCalledTimes(1);
      expect(mockConnection.beginTransaction).toHaveBeenCalledTimes(1);
    });

    it('should return active connection when transaction is active', async () => {
      await transactionManager.begin(mockPool);

      const connection = transactionManager.getConnection();
      expect(connection).toBe(mockConnection);
    });

    it('should return null when no transaction is active', () => {
      const connection = transactionManager.getConnection();
      expect(connection).toBeNull();
    });

    it('should return null after transaction is committed', async () => {
      await transactionManager.begin(mockPool);
      await transactionManager.commit();

      const connection = transactionManager.getConnection();
      expect(connection).toBeNull();
    });

    it('should return null after transaction is rolled back', async () => {
      await transactionManager.begin(mockPool);
      await transactionManager.rollback();

      const connection = transactionManager.getConnection();
      expect(connection).toBeNull();
    });

    it('should release connection after commit', async () => {
      await transactionManager.begin(mockPool);
      await transactionManager.commit();

      expect(mockConnection.release).toHaveBeenCalledTimes(1);
    });

    it('should release connection after rollback', async () => {
      await transactionManager.begin(mockPool);
      await transactionManager.rollback();

      expect(mockConnection.release).toHaveBeenCalledTimes(1);
    });

    it('should release connection even if commit fails', async () => {
      mockConnection.commit.mockRejectedValueOnce(new Error('Commit failed'));

      await transactionManager.begin(mockPool);

      await expect(transactionManager.commit()).rejects.toThrow(TransactionError);
      expect(mockConnection.release).toHaveBeenCalledTimes(1);
    });

    it('should release connection even if rollback fails', async () => {
      mockConnection.rollback.mockRejectedValueOnce(new Error('Rollback failed'));

      await transactionManager.begin(mockPool);

      await expect(transactionManager.rollback()).rejects.toThrow(TransactionError);
      expect(mockConnection.release).toHaveBeenCalledTimes(1);
    });

    it('should clean up connection if begin fails', async () => {
      mockConnection.beginTransaction.mockRejectedValueOnce(new Error('Begin failed'));

      await expect(transactionManager.begin(mockPool)).rejects.toThrow(TransactionError);

      expect(mockConnection.release).toHaveBeenCalledTimes(1);
      expect(transactionManager.getState()).toBe(TransactionState.NONE);
      expect(transactionManager.getConnection()).toBeNull();
    });

    it('should use same connection for entire transaction lifecycle', async () => {
      await transactionManager.begin(mockPool);

      const conn1 = transactionManager.getConnection();
      const conn2 = transactionManager.getConnection();

      expect(conn1).toBe(conn2);
      expect(conn1).toBe(mockConnection);
    });
  });

  describe('Error Handling', () => {
    it('should throw TransactionError when pool.getConnection fails', async () => {
      mockPool.getConnection.mockRejectedValueOnce(new Error('Pool exhausted'));

      const error = await transactionManager.begin(mockPool).catch(e => e);
      
      expect(error).toBeInstanceOf(TransactionError);
      expect(error.message).toContain('Failed to begin transaction: Pool exhausted');
    });

    it('should throw TransactionError when beginTransaction fails', async () => {
      mockConnection.beginTransaction.mockRejectedValueOnce(new Error('Database error'));

      const error = await transactionManager.begin(mockPool).catch(e => e);
      
      expect(error).toBeInstanceOf(TransactionError);
      expect(error.message).toContain('Failed to begin transaction: Database error');
    });

    it('should throw TransactionError when commit fails', async () => {
      await transactionManager.begin(mockPool);
      
      mockConnection.commit.mockRejectedValueOnce(new Error('Commit error'));

      const error = await transactionManager.commit().catch(e => e);
      
      expect(error).toBeInstanceOf(TransactionError);
      expect(error.message).toContain('Failed to commit transaction: Commit error');
    });

    it('should throw TransactionError when rollback fails', async () => {
      await transactionManager.begin(mockPool);
      
      mockConnection.rollback.mockRejectedValueOnce(new Error('Rollback error'));

      const error = await transactionManager.rollback().catch(e => e);
      
      expect(error).toBeInstanceOf(TransactionError);
      expect(error.message).toContain('Failed to rollback transaction: Rollback error');
    });

    it('should attempt rollback if commit fails', async () => {
      mockConnection.commit.mockRejectedValueOnce(new Error('Commit failed'));

      await transactionManager.begin(mockPool);

      await expect(transactionManager.commit()).rejects.toThrow(TransactionError);

      expect(mockConnection.rollback).toHaveBeenCalledTimes(1);
      expect(transactionManager.getState()).toBe(TransactionState.ROLLED_BACK);
    });

    it('should handle rollback failure during commit failure gracefully', async () => {
      await transactionManager.begin(mockPool);
      
      mockConnection.commit.mockRejectedValueOnce(new Error('Commit failed'));
      mockConnection.rollback.mockRejectedValueOnce(new Error('Rollback also failed'));

      const error = await transactionManager.commit().catch(e => e);
      
      expect(error).toBeInstanceOf(TransactionError);
      expect(error.message).toContain('Failed to commit transaction');

      // Connection should still be released
      expect(mockConnection.release).toHaveBeenCalledTimes(1);
    });

    it('should throw error when commit called without active connection', async () => {
      // Manually set state to ACTIVE but no connection (edge case)
      await transactionManager.begin(mockPool);
      (transactionManager as any).activeConnection = null;

      await expect(transactionManager.commit()).rejects.toThrow(TransactionError);
      await expect(transactionManager.commit()).rejects.toThrow(
        'No active connection for transaction'
      );
    });

    it('should throw error when rollback called without active connection', async () => {
      // Manually set state to ACTIVE but no connection (edge case)
      await transactionManager.begin(mockPool);
      (transactionManager as any).activeConnection = null;

      await expect(transactionManager.rollback()).rejects.toThrow(TransactionError);
      await expect(transactionManager.rollback()).rejects.toThrow(
        'No active connection for transaction'
      );
    });

    it('should handle non-Error exceptions in begin', async () => {
      mockConnection.beginTransaction.mockRejectedValueOnce('String error');

      const error = await transactionManager.begin(mockPool).catch(e => e);
      
      expect(error).toBeInstanceOf(TransactionError);
      expect(error.message).toContain('Failed to begin transaction');
    });

    it('should handle non-Error exceptions in commit', async () => {
      await transactionManager.begin(mockPool);
      
      mockConnection.commit.mockRejectedValueOnce('String error');

      const error = await transactionManager.commit().catch(e => e);
      
      expect(error).toBeInstanceOf(TransactionError);
      expect(error.message).toContain('Failed to commit transaction');
    });

    it('should handle non-Error exceptions in rollback', async () => {
      await transactionManager.begin(mockPool);
      
      mockConnection.rollback.mockRejectedValueOnce('String error');

      const error = await transactionManager.rollback().catch(e => e);
      
      expect(error).toBeInstanceOf(TransactionError);
      expect(error.message).toContain('Failed to rollback transaction');
    });
  });

  describe('Reset Functionality', () => {
    it('should reset state to NONE', async () => {
      await transactionManager.begin(mockPool);
      transactionManager.reset();

      expect(transactionManager.getState()).toBe(TransactionState.NONE);
      expect(transactionManager.isInTransaction()).toBe(false);
    });

    it('should clear active connection', async () => {
      await transactionManager.begin(mockPool);
      transactionManager.reset();

      expect(transactionManager.getConnection()).toBeNull();
    });

    it('should allow new transaction after reset', async () => {
      await transactionManager.begin(mockPool);
      transactionManager.reset();

      await transactionManager.begin(mockPool);
      expect(transactionManager.getState()).toBe(TransactionState.ACTIVE);
    });
  });
});
