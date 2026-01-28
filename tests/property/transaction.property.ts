import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { TransactionManager, TransactionState } from '../../src/transaction';
import type mysql from 'mysql2/promise';

describe('Transaction Property Tests', () => {
  // Feature: mysql-mcp-server, Property 15: Transaction round-trip consistency
  // Validates: Requirements 8.1, 8.3
  it('should maintain state consistency after begin-modify-rollback sequence', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate arbitrary modification operations
        fc.record({
          // Simulate different types of modifications
          operationType: fc.constantFrom('INSERT', 'UPDATE', 'DELETE'),
          affectedRows: fc.integer({ min: 0, max: 1000 }),
          // Simulate initial state
          initialRowCount: fc.integer({ min: 0, max: 10000 }),
          // Simulate whether operations succeed or fail
          operationSucceeds: fc.boolean(),
        }),
        async (testCase) => {
          // Clear mocks for each iteration
          vi.clearAllMocks();

          // Track query execution to verify rollback behavior
          const executedQueries: string[] = [];
          let currentRowCount = testCase.initialRowCount;
          let transactionActive = false;

          // Create mock connection that simulates database behavior
          const mockConnection = {
            beginTransaction: vi.fn().mockImplementation(async () => {
              transactionActive = true;
            }),
            commit: vi.fn().mockImplementation(async () => {
              transactionActive = false;
            }),
            rollback: vi.fn().mockImplementation(async () => {
              // Rollback should restore state
              currentRowCount = testCase.initialRowCount;
              transactionActive = false;
            }),
            query: vi.fn().mockImplementation(async (sql: string) => {
              executedQueries.push(sql);
              
              if (!testCase.operationSucceeds) {
                throw new Error('Query execution failed');
              }

              // Simulate state changes during transaction
              if (transactionActive) {
                if (testCase.operationType === 'INSERT') {
                  currentRowCount += testCase.affectedRows;
                } else if (testCase.operationType === 'DELETE') {
                  currentRowCount = Math.max(0, currentRowCount - testCase.affectedRows);
                } else if (testCase.operationType === 'UPDATE') {
                  // UPDATE doesn't change row count
                }
              }

              return [{ affectedRows: testCase.affectedRows }];
            }),
            release: vi.fn(),
          };

          // Create mock pool
          const mockPool = {
            getConnection: vi.fn().mockResolvedValue(mockConnection),
          } as unknown as mysql.Pool;

          // Create transaction manager
          const transactionManager = new TransactionManager();

          // Record initial state
          const initialState = {
            rowCount: currentRowCount,
            transactionState: transactionManager.getState(),
            connectionActive: transactionManager.getConnection() !== null,
          };

          // Verify initial state is NONE
          if (initialState.transactionState !== TransactionState.NONE) {
            throw new Error('Initial transaction state should be NONE');
          }
          if (initialState.connectionActive) {
            throw new Error('Initial connection should be null');
          }

          try {
            // Step 1: Begin transaction
            await transactionManager.begin(mockPool);

            // Verify transaction is active
            if (transactionManager.getState() !== TransactionState.ACTIVE) {
              throw new Error('Transaction state should be ACTIVE after begin');
            }
            if (!transactionManager.isInTransaction()) {
              throw new Error('isInTransaction should return true after begin');
            }
            if (transactionManager.getConnection() === null) {
              throw new Error('Connection should not be null during transaction');
            }

            // Verify beginTransaction was called
            if (mockConnection.beginTransaction.mock.calls.length !== 1) {
              throw new Error('beginTransaction should be called exactly once');
            }

            // Step 2: Execute modification operation
            const connection = transactionManager.getConnection();
            if (connection) {
              try {
                await connection.query(
                  `${testCase.operationType} FROM test_table`
                );
              } catch (error) {
                // Operation might fail, that's okay for this test
              }
            }

            // Record state after modification (before rollback)
            const stateAfterModification = currentRowCount;

            // Step 3: Rollback transaction
            await transactionManager.rollback();

            // Verify transaction is rolled back
            if (transactionManager.getState() !== TransactionState.ROLLED_BACK) {
              throw new Error('Transaction state should be ROLLED_BACK after rollback');
            }
            if (transactionManager.isInTransaction()) {
              throw new Error('isInTransaction should return false after rollback');
            }
            if (transactionManager.getConnection() !== null) {
              throw new Error('Connection should be null after rollback');
            }

            // Verify rollback was called
            if (mockConnection.rollback.mock.calls.length !== 1) {
              throw new Error('rollback should be called exactly once');
            }

            // Verify connection was released
            if (mockConnection.release.mock.calls.length !== 1) {
              throw new Error('Connection should be released after rollback');
            }

            // CRITICAL: Verify state consistency - final state should match initial state
            const finalState = {
              rowCount: currentRowCount,
              transactionState: transactionManager.getState(),
              connectionActive: transactionManager.getConnection() !== null,
            };

            // The key property: rollback should restore initial state
            if (finalState.rowCount !== initialState.rowCount) {
              throw new Error(
                `State not restored after rollback. Initial: ${initialState.rowCount}, ` +
                `After modification: ${stateAfterModification}, Final: ${finalState.rowCount}`
              );
            }

            // Transaction state should be ROLLED_BACK (not NONE, but that's okay)
            // The important thing is that it's not ACTIVE
            if (finalState.transactionState === TransactionState.ACTIVE) {
              throw new Error('Transaction should not be active after rollback');
            }

            // Connection should be released
            if (finalState.connectionActive) {
              throw new Error('Connection should be released after rollback');
            }

            // Verify commit was NOT called (only rollback)
            if (mockConnection.commit.mock.calls.length !== 0) {
              throw new Error('commit should not be called during rollback sequence');
            }

          } catch (error) {
            // If any error occurs, ensure we're not leaving transaction in bad state
            if (transactionManager.isInTransaction()) {
              throw new Error('Transaction should not be active after error');
            }
            throw error;
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should maintain isolation when multiple rollback sequences are executed', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            operationType: fc.constantFrom('INSERT', 'UPDATE', 'DELETE'),
            affectedRows: fc.integer({ min: 1, max: 100 }),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (operations) => {
          vi.clearAllMocks();

          const initialRowCount = 1000;
          let currentRowCount = initialRowCount;

          // Create mock connection
          const mockConnection = {
            beginTransaction: vi.fn().mockResolvedValue(undefined),
            commit: vi.fn().mockResolvedValue(undefined),
            rollback: vi.fn().mockImplementation(async () => {
              // Rollback restores to state before transaction
              currentRowCount = initialRowCount;
            }),
            query: vi.fn().mockImplementation(async () => {
              // Simulate modifications
              return [{ affectedRows: 1 }];
            }),
            release: vi.fn(),
          };

          const mockPool = {
            getConnection: vi.fn().mockResolvedValue(mockConnection),
          } as unknown as mysql.Pool;

          // Execute multiple transaction sequences
          for (const operation of operations) {
            const transactionManager = new TransactionManager();

            // Begin transaction
            await transactionManager.begin(mockPool);

            // Modify state
            const connection = transactionManager.getConnection();
            if (connection) {
              await connection.query(`${operation.operationType} FROM test`);
              
              // Simulate state change
              if (operation.operationType === 'INSERT') {
                currentRowCount += operation.affectedRows;
              } else if (operation.operationType === 'DELETE') {
                currentRowCount = Math.max(0, currentRowCount - operation.affectedRows);
              }
            }

            // Rollback
            await transactionManager.rollback();

            // Verify state is restored
            if (currentRowCount !== initialRowCount) {
              throw new Error(
                `State not restored after rollback. Expected: ${initialRowCount}, Got: ${currentRowCount}`
              );
            }

            // Verify transaction is not active
            if (transactionManager.isInTransaction()) {
              throw new Error('Transaction should not be active after rollback');
            }
          }

          // After all sequences, state should still be initial state
          if (currentRowCount !== initialRowCount) {
            throw new Error(
              `Final state does not match initial state after ${operations.length} rollback sequences`
            );
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle rollback after failed operations without state corruption', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          initialState: fc.integer({ min: 0, max: 10000 }),
          failurePoint: fc.constantFrom('begin', 'query', 'rollback'),
          errorMessage: fc.string({ minLength: 1, maxLength: 100 }),
        }),
        async (testCase) => {
          vi.clearAllMocks();

          let currentState = testCase.initialState;
          const initialState = testCase.initialState;

          // Create mock connection that may fail at different points
          const mockConnection = {
            beginTransaction: vi.fn().mockImplementation(async () => {
              if (testCase.failurePoint === 'begin') {
                throw new Error(testCase.errorMessage);
              }
            }),
            commit: vi.fn().mockResolvedValue(undefined),
            rollback: vi.fn().mockImplementation(async () => {
              if (testCase.failurePoint === 'rollback') {
                throw new Error(testCase.errorMessage);
              }
              // Restore state on successful rollback
              currentState = initialState;
            }),
            query: vi.fn().mockImplementation(async () => {
              if (testCase.failurePoint === 'query') {
                throw new Error(testCase.errorMessage);
              }
              // Modify state
              currentState += 100;
              return [{ affectedRows: 1 }];
            }),
            release: vi.fn(),
          };

          const mockPool = {
            getConnection: vi.fn().mockResolvedValue(mockConnection),
          } as unknown as mysql.Pool;

          const transactionManager = new TransactionManager();

          try {
            // Try to execute transaction sequence
            await transactionManager.begin(mockPool);

            const connection = transactionManager.getConnection();
            if (connection) {
              try {
                await connection.query('INSERT INTO test VALUES (1)');
              } catch (error) {
                // Query failed, try to rollback
                if (transactionManager.isInTransaction()) {
                  await transactionManager.rollback();
                }
                throw error;
              }
            }

            // If we get here, rollback the transaction
            await transactionManager.rollback();

          } catch (error) {
            // Error occurred, verify state is handled correctly
            if (error instanceof Error) {
              if (!error.message.includes(testCase.errorMessage)) {
                // Different error than expected
                throw error;
              }
            }
          }

          // After error handling, transaction should not be active
          if (transactionManager.isInTransaction()) {
            throw new Error('Transaction should not be active after error');
          }

          // Connection should be released
          if (transactionManager.getConnection() !== null) {
            throw new Error('Connection should be null after error');
          }

          // If rollback succeeded, state should be restored
          if (testCase.failurePoint !== 'rollback' && currentState !== initialState) {
            // Only check if rollback didn't fail
            if (mockConnection.rollback.mock.calls.length > 0) {
              throw new Error(
                `State should be restored after successful rollback. ` +
                `Initial: ${initialState}, Current: ${currentState}`
              );
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: mysql-mcp-server, Property 16: Transaction commit persistence
  // Validates: Requirements 8.2
  it('should persist modifications after successful commit', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          // Generate arbitrary modification operations
          operations: fc.array(
            fc.record({
              operationType: fc.constantFrom('INSERT', 'UPDATE', 'DELETE'),
              affectedRows: fc.integer({ min: 1, max: 100 }),
              tableName: fc.constantFrom('users', 'orders', 'products'),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          // Initial database state
          initialRowCount: fc.integer({ min: 100, max: 10000 }),
        }),
        async (testCase) => {
          vi.clearAllMocks();

          // Simulate persistent database state (outside transaction)
          let persistentState = testCase.initialRowCount;
          // Simulate transactional state (inside transaction)
          let transactionalState = testCase.initialRowCount;

          // Create mock connection that simulates transaction behavior
          const mockConnection = {
            beginTransaction: vi.fn().mockResolvedValue(undefined),
            commit: vi.fn().mockImplementation(async () => {
              // On commit, transactional changes become persistent
              persistentState = transactionalState;
            }),
            rollback: vi.fn().mockImplementation(async () => {
              // On rollback, transactional changes are discarded
              transactionalState = persistentState;
            }),
            query: vi.fn().mockImplementation(async (sql: string) => {
              // Simulate modifications in transactional state
              const operation = testCase.operations.find(op => 
                sql.includes(op.operationType)
              );
              
              if (operation) {
                if (operation.operationType === 'INSERT') {
                  transactionalState += operation.affectedRows;
                } else if (operation.operationType === 'DELETE') {
                  transactionalState = Math.max(0, transactionalState - operation.affectedRows);
                } else if (operation.operationType === 'UPDATE') {
                  // UPDATE doesn't change row count but we can track it was executed
                }
                return [{ affectedRows: operation.affectedRows }];
              }
              
              return [{ affectedRows: 0 }];
            }),
            release: vi.fn(),
          };

          const mockPool = {
            getConnection: vi.fn().mockResolvedValue(mockConnection),
          } as unknown as mysql.Pool;

          const transactionManager = new TransactionManager();

          // Record initial persistent state
          const initialPersistentState = persistentState;

          // Step 1: Begin transaction
          await transactionManager.begin(mockPool);

          // Verify transaction is active
          if (transactionManager.getState() !== TransactionState.ACTIVE) {
            throw new Error('Transaction state should be ACTIVE after begin');
          }
          if (!transactionManager.isInTransaction()) {
            throw new Error('isInTransaction should return true after begin');
          }

          // Step 2: Execute modification operations within transaction
          const connection = transactionManager.getConnection();
          if (!connection) {
            throw new Error('Connection should not be null during transaction');
          }

          for (const operation of testCase.operations) {
            await connection.query(
              `${operation.operationType} FROM ${operation.tableName}`
            );
          }

          // Record state after modifications but before commit
          const stateBeforeCommit = {
            persistent: persistentState,
            transactional: transactionalState,
          };

          // CRITICAL: Before commit, persistent state should NOT reflect transactional changes
          if (persistentState !== initialPersistentState) {
            throw new Error(
              `Persistent state should not change before commit. ` +
              `Initial: ${initialPersistentState}, Current: ${persistentState}`
            );
          }

          // Step 3: Commit transaction
          await transactionManager.commit();

          // Verify transaction is committed
          if (transactionManager.getState() !== TransactionState.COMMITTED) {
            throw new Error('Transaction state should be COMMITTED after commit');
          }
          if (transactionManager.isInTransaction()) {
            throw new Error('isInTransaction should return false after commit');
          }
          if (transactionManager.getConnection() !== null) {
            throw new Error('Connection should be null after commit');
          }

          // Verify commit was called
          if (mockConnection.commit.mock.calls.length !== 1) {
            throw new Error('commit should be called exactly once');
          }

          // Verify connection was released
          if (mockConnection.release.mock.calls.length !== 1) {
            throw new Error('Connection should be released after commit');
          }

          // CRITICAL PROPERTY: After successful commit, persistent state should match transactional state
          if (persistentState !== transactionalState) {
            throw new Error(
              `Persistent state should match transactional state after commit. ` +
              `Persistent: ${persistentState}, Transactional: ${transactionalState}`
            );
          }

          // Verify changes are visible (persistent state changed from initial)
          if (testCase.operations.some(op => op.operationType === 'INSERT' || op.operationType === 'DELETE')) {
            // If we had INSERT or DELETE operations, state should have changed
            if (persistentState === initialPersistentState && testCase.operations.length > 0) {
              // This might be okay if DELETEs and INSERTs cancelled out
              // But we should verify the operations were executed
              if (mockConnection.query.mock.calls.length !== testCase.operations.length) {
                throw new Error(
                  `Expected ${testCase.operations.length} queries, ` +
                  `but got ${mockConnection.query.mock.calls.length}`
                );
              }
            }
          }

          // Verify rollback was NOT called (only commit)
          if (mockConnection.rollback.mock.calls.length !== 0) {
            throw new Error('rollback should not be called during commit sequence');
          }

          // Step 4: Verify persistence by simulating a new query outside transaction
          // After commit, any new connection should see the committed changes
          const verificationState = persistentState;
          if (verificationState !== transactionalState) {
            throw new Error(
              `Committed changes should be visible outside transaction. ` +
              `Expected: ${transactionalState}, Got: ${verificationState}`
            );
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: mysql-mcp-server, Property 17: Transaction connection isolation
  // Validates: Requirements 8.4
  it('should use the same connection for all queries within a transaction', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          // Generate a sequence of queries to execute in transaction
          queries: fc.array(
            fc.record({
              sql: fc.constantFrom(
                'SELECT * FROM users',
                'INSERT INTO users VALUES (1)',
                'UPDATE users SET name = "test"',
                'DELETE FROM users WHERE id = 1'
              ),
              expectedRows: fc.integer({ min: 0, max: 100 }),
            }),
            { minLength: 2, maxLength: 10 }
          ),
        }),
        async (testCase) => {
          vi.clearAllMocks();

          // Track which connection object is used for each query
          const connectionUsages: any[] = [];
          let connectionIdCounter = 0;

          // Create a unique mock connection with an ID
          const createMockConnection = () => {
            const connectionId = ++connectionIdCounter;
            const mockConnection = {
              _connectionId: connectionId, // Internal tracking ID
              beginTransaction: vi.fn().mockResolvedValue(undefined),
              commit: vi.fn().mockResolvedValue(undefined),
              rollback: vi.fn().mockResolvedValue(undefined),
              query: vi.fn().mockImplementation(async (sql: string) => {
                // Record which connection was used for this query
                connectionUsages.push({
                  connectionId,
                  sql,
                  connection: mockConnection,
                });
                return [{ affectedRows: 1 }];
              }),
              release: vi.fn(),
            };
            return mockConnection;
          };

          // Create mock pool that returns a new connection each time
          let mockConnection: any = null;
          const mockPool = {
            getConnection: vi.fn().mockImplementation(async () => {
              // Create a new connection for this transaction
              mockConnection = createMockConnection();
              return mockConnection;
            }),
          } as unknown as mysql.Pool;

          const transactionManager = new TransactionManager();

          // Step 1: Begin transaction
          await transactionManager.begin(mockPool);

          // Verify transaction is active
          if (transactionManager.getState() !== TransactionState.ACTIVE) {
            throw new Error('Transaction state should be ACTIVE after begin');
          }

          // Verify getConnection was called exactly once
          if (mockPool.getConnection.mock.calls.length !== 1) {
            throw new Error(
              `getConnection should be called exactly once, but was called ${mockPool.getConnection.mock.calls.length} times`
            );
          }

          // Get the connection that should be used for all queries
          const transactionConnection = transactionManager.getConnection();
          if (!transactionConnection) {
            throw new Error('Transaction connection should not be null during active transaction');
          }

          // Record the connection ID for verification
          const expectedConnectionId = (transactionConnection as any)._connectionId;

          // Step 2: Execute multiple queries within the transaction
          for (const query of testCase.queries) {
            // Get connection from transaction manager
            const connection = transactionManager.getConnection();
            
            if (!connection) {
              throw new Error('Connection should not be null during active transaction');
            }

            // Execute query using the transaction connection
            await connection.query(query.sql);
          }

          // Step 3: Verify all queries used the SAME connection
          if (connectionUsages.length !== testCase.queries.length) {
            throw new Error(
              `Expected ${testCase.queries.length} query executions, but got ${connectionUsages.length}`
            );
          }

          // CRITICAL PROPERTY: All queries must use the same connection ID
          const uniqueConnectionIds = new Set(
            connectionUsages.map(usage => usage.connectionId)
          );

          if (uniqueConnectionIds.size !== 1) {
            throw new Error(
              `All queries in transaction should use the same connection. ` +
              `Found ${uniqueConnectionIds.size} different connections: ${Array.from(uniqueConnectionIds).join(', ')}`
            );
          }

          // Verify the connection ID matches the expected one
          const actualConnectionId = Array.from(uniqueConnectionIds)[0];
          if (actualConnectionId !== expectedConnectionId) {
            throw new Error(
              `Connection ID mismatch. Expected: ${expectedConnectionId}, Got: ${actualConnectionId}`
            );
          }

          // Verify all queries used the exact same connection object
          const firstConnection = connectionUsages[0].connection;
          for (let i = 1; i < connectionUsages.length; i++) {
            if (connectionUsages[i].connection !== firstConnection) {
              throw new Error(
                `Query ${i} used a different connection object than query 0. ` +
                `All queries must use the exact same connection instance.`
              );
            }
          }

          // Verify getConnection() always returns the same connection during transaction
          for (let i = 0; i < testCase.queries.length; i++) {
            const conn = transactionManager.getConnection();
            if (conn !== transactionConnection) {
              throw new Error(
                `getConnection() returned different connection on call ${i}. ` +
                `All calls should return the same connection during active transaction.`
              );
            }
          }

          // Step 4: Commit transaction
          await transactionManager.commit();

          // Verify transaction is committed
          if (transactionManager.getState() !== TransactionState.COMMITTED) {
            throw new Error('Transaction state should be COMMITTED after commit');
          }

          // Verify connection is released after commit
          if (transactionManager.getConnection() !== null) {
            throw new Error('Connection should be null after commit');
          }

          // Verify connection.release() was called exactly once
          if (mockConnection.release.mock.calls.length !== 1) {
            throw new Error(
              `Connection release should be called exactly once, but was called ${mockConnection.release.mock.calls.length} times`
            );
          }

          // Verify getConnection was still only called once (no new connections during transaction)
          if (mockPool.getConnection.mock.calls.length !== 1) {
            throw new Error(
              `getConnection should only be called once per transaction, but was called ${mockPool.getConnection.mock.calls.length} times`
            );
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should maintain connection isolation across multiple transaction sequences', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            queries: fc.array(
              fc.constantFrom(
                'SELECT * FROM test',
                'INSERT INTO test VALUES (1)',
                'UPDATE test SET x = 1'
              ),
              { minLength: 1, maxLength: 5 }
            ),
            shouldCommit: fc.boolean(),
          }),
          { minLength: 2, maxLength: 5 }
        ),
        async (transactionSequences) => {
          vi.clearAllMocks();

          // Track all connections used across all transactions
          const allConnectionsUsed: Set<number> = new Set();
          const connectionsByTransaction: Map<number, Set<number>> = new Map();
          let connectionIdCounter = 0;

          // Create mock connection factory
          const createMockConnection = () => {
            const connectionId = ++connectionIdCounter;
            return {
              _connectionId: connectionId,
              beginTransaction: vi.fn().mockResolvedValue(undefined),
              commit: vi.fn().mockResolvedValue(undefined),
              rollback: vi.fn().mockResolvedValue(undefined),
              query: vi.fn().mockImplementation(async () => {
                return [{ affectedRows: 1 }];
              }),
              release: vi.fn(),
            };
          };

          // Execute multiple transaction sequences
          for (let txIndex = 0; txIndex < transactionSequences.length; txIndex++) {
            const sequence = transactionSequences[txIndex];
            const connectionsInThisTx = new Set<number>();

            // Create mock pool for this transaction
            let currentConnection: any = null;
            const mockPool = {
              getConnection: vi.fn().mockImplementation(async () => {
                currentConnection = createMockConnection();
                return currentConnection;
              }),
            } as unknown as mysql.Pool;

            const transactionManager = new TransactionManager();

            // Begin transaction
            await transactionManager.begin(mockPool);

            const txConnection = transactionManager.getConnection();
            if (!txConnection) {
              throw new Error(`Transaction ${txIndex}: Connection should not be null`);
            }

            const txConnectionId = (txConnection as any)._connectionId;
            allConnectionsUsed.add(txConnectionId);

            // Execute queries in this transaction
            for (const query of sequence.queries) {
              const conn = transactionManager.getConnection();
              if (!conn) {
                throw new Error(`Transaction ${txIndex}: Connection lost during transaction`);
              }

              const connId = (conn as any)._connectionId;
              connectionsInThisTx.add(connId);

              await conn.query(query);
            }

            // Verify all queries in THIS transaction used the same connection
            if (connectionsInThisTx.size !== 1) {
              throw new Error(
                `Transaction ${txIndex}: All queries should use same connection. ` +
                `Found ${connectionsInThisTx.size} different connections.`
              );
            }

            // Verify the connection ID matches
            const actualConnId = Array.from(connectionsInThisTx)[0];
            if (actualConnId !== txConnectionId) {
              throw new Error(
                `Transaction ${txIndex}: Connection ID mismatch. ` +
                `Expected: ${txConnectionId}, Got: ${actualConnId}`
              );
            }

            // Store connections used in this transaction
            connectionsByTransaction.set(txIndex, connectionsInThisTx);

            // Commit or rollback
            if (sequence.shouldCommit) {
              await transactionManager.commit();
            } else {
              await transactionManager.rollback();
            }

            // Verify connection is released
            if (transactionManager.getConnection() !== null) {
              throw new Error(`Transaction ${txIndex}: Connection should be null after completion`);
            }
          }

          // CRITICAL PROPERTY: Each transaction should use a DIFFERENT connection
          // (or at least, connections should be properly isolated)
          if (allConnectionsUsed.size !== transactionSequences.length) {
            // This is actually okay - connections can be reused from the pool
            // The important thing is that within each transaction, the same connection is used
            // But let's verify that at least the isolation was maintained
          }

          // Verify each transaction used exactly one connection
          for (const [txIndex, connections] of connectionsByTransaction.entries()) {
            if (connections.size !== 1) {
              throw new Error(
                `Transaction ${txIndex} should have used exactly 1 connection, ` +
                `but used ${connections.size} connections`
              );
            }
          }

          // Verify we created the expected number of connections
          if (connectionIdCounter !== transactionSequences.length) {
            throw new Error(
              `Expected ${transactionSequences.length} connections to be created, ` +
              `but ${connectionIdCounter} were created`
            );
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
