import type mysql from 'mysql2/promise';

/**
 * Transaction error types
 */
export class TransactionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransactionError';
  }
}

/**
 * Transaction state enum
 */
export enum TransactionState {
  NONE = 'NONE',
  ACTIVE = 'ACTIVE',
  COMMITTED = 'COMMITTED',
  ROLLED_BACK = 'ROLLED_BACK',
}

/**
 * TransactionManager handles database transaction lifecycle
 * Manages transaction state and ensures proper connection handling
 * 
 * Requirements:
 * - 8.1: Begin new database transactions
 * - 8.2: Commit current transaction
 * - 8.3: Rollback current transaction
 * - 8.4: Use same connection for all queries in transaction
 * - 8.5: Auto-rollback on connection close if not committed
 */
export class TransactionManager {
  private activeConnection: mysql.PoolConnection | null = null;
  private state: TransactionState = TransactionState.NONE;

  /**
   * Begin a new database transaction
   * 
   * @param pool - MySQL connection pool to get connection from
   * @throws TransactionError if transaction is already active
   * 
   * Validates: Requirements 8.1
   */
  async begin(pool: mysql.Pool): Promise<void> {
    // Check if transaction is already active
    if (this.state === TransactionState.ACTIVE) {
      throw new TransactionError('Transaction already active. Nested transactions are not supported.');
    }

    try {
      // Get a connection from the pool
      this.activeConnection = await pool.getConnection();
      
      // Start the transaction
      await this.activeConnection.beginTransaction();
      
      // Update state
      this.state = TransactionState.ACTIVE;
    } catch (error) {
      // Clean up connection if begin fails
      if (this.activeConnection) {
        this.activeConnection.release();
        this.activeConnection = null;
      }
      this.state = TransactionState.NONE;
      
      if (error instanceof Error) {
        throw new TransactionError(`Failed to begin transaction: ${error.message}`);
      }
      throw new TransactionError('Failed to begin transaction');
    }
  }

  /**
   * Commit the current transaction
   * 
   * @throws TransactionError if no transaction is active
   * 
   * Validates: Requirements 8.2
   */
  async commit(): Promise<void> {
    // Check if transaction is active
    if (this.state !== TransactionState.ACTIVE) {
      throw new TransactionError('No active transaction to commit');
    }

    if (!this.activeConnection) {
      throw new TransactionError('No active connection for transaction');
    }

    try {
      // Commit the transaction
      await this.activeConnection.commit();
      
      // Update state
      this.state = TransactionState.COMMITTED;
    } catch (error) {
      // If commit fails, try to rollback
      try {
        await this.activeConnection.rollback();
        this.state = TransactionState.ROLLED_BACK;
      } catch (rollbackError) {
        // Ignore rollback errors during commit failure
      }
      
      if (error instanceof Error) {
        throw new TransactionError(`Failed to commit transaction: ${error.message}`);
      }
      throw new TransactionError('Failed to commit transaction');
    } finally {
      // Always release the connection
      this.activeConnection.release();
      this.activeConnection = null;
    }
  }

  /**
   * Rollback the current transaction
   * 
   * @throws TransactionError if no transaction is active
   * 
   * Validates: Requirements 8.3
   */
  async rollback(): Promise<void> {
    // Check if transaction is active
    if (this.state !== TransactionState.ACTIVE) {
      throw new TransactionError('No active transaction to rollback');
    }

    if (!this.activeConnection) {
      throw new TransactionError('No active connection for transaction');
    }

    try {
      // Rollback the transaction
      await this.activeConnection.rollback();
      
      // Update state
      this.state = TransactionState.ROLLED_BACK;
    } catch (error) {
      // Even if rollback fails, we need to clean up the state
      // The transaction is no longer usable
      this.state = TransactionState.ROLLED_BACK;
      
      if (error instanceof Error) {
        throw new TransactionError(`Failed to rollback transaction: ${error.message}`);
      }
      throw new TransactionError('Failed to rollback transaction');
    } finally {
      // Always release the connection
      this.activeConnection.release();
      this.activeConnection = null;
    }
  }

  /**
   * Get the active transaction connection
   * This ensures all queries in a transaction use the same connection
   * 
   * @returns The active connection or null if no transaction is active
   * 
   * Validates: Requirements 8.4
   */
  getConnection(): mysql.PoolConnection | null {
    if (this.state === TransactionState.ACTIVE) {
      return this.activeConnection;
    }
    return null;
  }

  /**
   * Check if a transaction is currently active
   * 
   * @returns true if transaction is active, false otherwise
   */
  isInTransaction(): boolean {
    return this.state === TransactionState.ACTIVE;
  }

  /**
   * Get the current transaction state
   * 
   * @returns Current transaction state
   */
  getState(): TransactionState {
    return this.state;
  }

  /**
   * Reset transaction state
   * Used for cleanup and testing
   */
  reset(): void {
    this.state = TransactionState.NONE;
    this.activeConnection = null;
  }
}
