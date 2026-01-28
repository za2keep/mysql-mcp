/**
 * End-to-End Integration Tests for MySQL MCP Server
 * 
 * Tests complete MCP client-server interactions with real database operations
 * 
 * Requirements: All (comprehensive end-to-end testing)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  createTestPool,
  waitForDatabase,
  executeQuery,
  cleanTable,
  resetAutoIncrement,
} from './test-helpers.js';
import type mysql from 'mysql2/promise';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Helper to create MCP client connected to server
 */
async function createMCPClient(): Promise<{
  client: Client;
  serverProcess: ChildProcess;
}> {
  // Path to the compiled server
  const serverPath = path.join(__dirname, '../../dist/index.js');

  // Spawn the server process
  const serverProcess = spawn('node', [serverPath], {
    env: {
      ...process.env,
      MYSQL_HOST: process.env.MYSQL_HOST || 'localhost',
      MYSQL_PORT: process.env.MYSQL_PORT || '3307',
      MYSQL_USER: process.env.MYSQL_USER || 'test_user',
      MYSQL_PASSWORD: process.env.MYSQL_PASSWORD || 'test_password',
      MYSQL_DATABASE: process.env.MYSQL_DATABASE || 'test_db',
      MCP_LOG_ENABLED: 'false', // Disable logging for cleaner test output
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // Create transport using the spawned process
  const transport = new StdioClientTransport({
    command: 'node',
    args: [serverPath],
    env: {
      MYSQL_HOST: process.env.MYSQL_HOST || 'localhost',
      MYSQL_PORT: process.env.MYSQL_PORT || '3307',
      MYSQL_USER: process.env.MYSQL_USER || 'test_user',
      MYSQL_PASSWORD: process.env.MYSQL_PASSWORD || 'test_password',
      MYSQL_DATABASE: process.env.MYSQL_DATABASE || 'test_db',
      MCP_LOG_ENABLED: 'false',
    },
  });

  // Create client
  const client = new Client(
    {
      name: 'test-client',
      version: '1.0.0',
    },
    {
      capabilities: {},
    }
  );

  // Connect client to server
  await client.connect(transport);

  return { client, serverProcess };
}

/**
 * Helper to close MCP client and server
 */
async function closeMCPClient(
  client: Client,
  serverProcess: ChildProcess
): Promise<void> {
  try {
    await client.close();
  } catch (error) {
    // Ignore close errors
  }

  // Kill server process
  serverProcess.kill('SIGTERM');

  // Wait for process to exit
  await new Promise<void>((resolve) => {
    serverProcess.on('exit', () => resolve());
    setTimeout(() => {
      serverProcess.kill('SIGKILL');
      resolve();
    }, 5000);
  });
}

describe('Integration: End-to-End MCP Server', () => {
  let pool: mysql.Pool;

  beforeAll(async () => {
    // Wait for database to be ready
    await waitForDatabase();
    pool = createTestPool();
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  describe('MCP Protocol Initialization', () => {
    it('should initialize and return server capabilities', async () => {
      const { client, serverProcess } = await createMCPClient();

      try {
        // Server should be initialized after connection
        const serverInfo = client.getServerVersion();
        expect(serverInfo).toBeDefined();
        expect(serverInfo?.name).toBe('mysql-mcp-server');
        expect(serverInfo?.version).toBe('1.0.0');
      } finally {
        await closeMCPClient(client, serverProcess);
      }
    });

    it('should list all available tools', async () => {
      const { client, serverProcess } = await createMCPClient();

      try {
        const tools = await client.listTools();
        
        expect(tools).toBeDefined();
        expect(tools.tools).toBeDefined();
        expect(Array.isArray(tools.tools)).toBe(true);

        // Verify all expected tools are present
        const toolNames = tools.tools.map((t) => t.name);
        expect(toolNames).toContain('query');
        expect(toolNames).toContain('list_tables');
        expect(toolNames).toContain('describe_table');
        expect(toolNames).toContain('show_indexes');
        expect(toolNames).toContain('begin_transaction');
        expect(toolNames).toContain('commit_transaction');
        expect(toolNames).toContain('rollback_transaction');
      } finally {
        await closeMCPClient(client, serverProcess);
      }
    });
  });

  describe('Query Tool - SELECT Operations', () => {
    it('should execute SELECT query and return results', async () => {
      const { client, serverProcess } = await createMCPClient();

      try {
        const result = await client.callTool({
          name: 'query',
          arguments: {
            sql: 'SELECT * FROM users LIMIT 3',
          },
        });

        expect(result).toBeDefined();
        expect(result.content).toBeDefined();
        expect(Array.isArray(result.content)).toBe(true);
        expect(result.content.length).toBeGreaterThan(0);

        const content = result.content[0];
        expect(content.type).toBe('text');
        
        if (content.type === 'text') {
          const data = JSON.parse(content.text);
          expect(data.rows).toBeDefined();
          expect(Array.isArray(data.rows)).toBe(true);
          expect(data.rows.length).toBeLessThanOrEqual(3);
          expect(data.fields).toBeDefined();
        }
      } finally {
        await closeMCPClient(client, serverProcess);
      }
    });

    it('should automatically add LIMIT to SELECT without LIMIT', async () => {
      const { client, serverProcess } = await createMCPClient();

      try {
        const result = await client.callTool({
          name: 'query',
          arguments: {
            sql: 'SELECT * FROM products',
          },
        });

        expect(result).toBeDefined();
        const content = result.content[0];
        
        if (content.type === 'text') {
          const data = JSON.parse(content.text);
          expect(data.rows).toBeDefined();
          // Should be limited to default max (1000)
          expect(data.rows.length).toBeLessThanOrEqual(1000);
        }
      } finally {
        await closeMCPClient(client, serverProcess);
      }
    });

    it('should execute SELECT with WHERE clause', async () => {
      const { client, serverProcess } = await createMCPClient();

      try {
        const result = await client.callTool({
          name: 'query',
          arguments: {
            sql: "SELECT * FROM users WHERE username = 'alice'",
          },
        });

        expect(result).toBeDefined();
        const content = result.content[0];
        
        if (content.type === 'text') {
          const data = JSON.parse(content.text);
          expect(data.rows).toBeDefined();
          expect(data.rows.length).toBe(1);
          expect(data.rows[0].username).toBe('alice');
        }
      } finally {
        await closeMCPClient(client, serverProcess);
      }
    });

    it('should execute SELECT with JOIN', async () => {
      const { client, serverProcess } = await createMCPClient();

      try {
        const result = await client.callTool({
          name: 'query',
          arguments: {
            sql: `
              SELECT o.id, o.total_amount, u.username
              FROM orders o
              JOIN users u ON o.user_id = u.id
              LIMIT 5
            `,
          },
        });

        expect(result).toBeDefined();
        const content = result.content[0];
        
        if (content.type === 'text') {
          const data = JSON.parse(content.text);
          expect(data.rows).toBeDefined();
          expect(data.rows.length).toBeGreaterThan(0);
          expect(data.rows[0]).toHaveProperty('username');
          expect(data.rows[0]).toHaveProperty('total_amount');
        }
      } finally {
        await closeMCPClient(client, serverProcess);
      }
    });
  });

  describe('Query Tool - INSERT/UPDATE/DELETE Operations', () => {
    beforeEach(async () => {
      // Clean test_queries table before each test
      await cleanTable(pool, 'test_queries');
      await resetAutoIncrement(pool, 'test_queries');
    });

    it('should execute INSERT query', async () => {
      const { client, serverProcess } = await createMCPClient();

      try {
        const result = await client.callTool({
          name: 'query',
          arguments: {
            sql: "INSERT INTO test_queries (data, number, flag) VALUES ('test_insert', 100, TRUE)",
          },
        });

        expect(result).toBeDefined();
        const content = result.content[0];
        
        if (content.type === 'text') {
          const data = JSON.parse(content.text);
          expect(data.affectedRows).toBe(1);
          expect(data.insertId).toBeGreaterThan(0);
        }

        // Verify the insert
        const rows = await executeQuery(pool, 'SELECT * FROM test_queries WHERE data = ?', [
          'test_insert',
        ]);
        expect(rows.length).toBe(1);
        expect(rows[0].number).toBe(100);
      } finally {
        await closeMCPClient(client, serverProcess);
      }
    });

    it('should execute UPDATE query with WHERE clause', async () => {
      // Insert test data
      await executeQuery(
        pool,
        "INSERT INTO test_queries (data, number) VALUES ('update_test', 50)"
      );

      const { client, serverProcess } = await createMCPClient();

      try {
        const result = await client.callTool({
          name: 'query',
          arguments: {
            sql: "UPDATE test_queries SET number = 75 WHERE data = 'update_test'",
          },
        });

        expect(result).toBeDefined();
        const content = result.content[0];
        
        if (content.type === 'text') {
          const data = JSON.parse(content.text);
          expect(data.affectedRows).toBe(1);
        }

        // Verify the update
        const rows = await executeQuery(pool, 'SELECT * FROM test_queries WHERE data = ?', [
          'update_test',
        ]);
        expect(rows[0].number).toBe(75);
      } finally {
        await closeMCPClient(client, serverProcess);
      }
    });

    it('should reject UPDATE without WHERE clause', async () => {
      const { client, serverProcess } = await createMCPClient();

      try {
        const result = await client.callTool({
          name: 'query',
          arguments: {
            sql: 'UPDATE test_queries SET number = 999',
          },
        });

        expect(result).toBeDefined();
        const content = result.content[0];
        
        if (content.type === 'text') {
          expect(content.text).toContain('validation failed');
          expect(content.text.toLowerCase()).toContain('where');
        }
      } finally {
        await closeMCPClient(client, serverProcess);
      }
    });

    it('should execute DELETE query with WHERE clause', async () => {
      // Insert test data
      await executeQuery(
        pool,
        "INSERT INTO test_queries (data, number) VALUES ('delete_test', 25)"
      );

      const { client, serverProcess } = await createMCPClient();

      try {
        const result = await client.callTool({
          name: 'query',
          arguments: {
            sql: "DELETE FROM test_queries WHERE data = 'delete_test'",
          },
        });

        expect(result).toBeDefined();
        const content = result.content[0];
        
        if (content.type === 'text') {
          const data = JSON.parse(content.text);
          expect(data.affectedRows).toBe(1);
        }

        // Verify the delete
        const rows = await executeQuery(pool, 'SELECT * FROM test_queries WHERE data = ?', [
          'delete_test',
        ]);
        expect(rows.length).toBe(0);
      } finally {
        await closeMCPClient(client, serverProcess);
      }
    });

    it('should reject DELETE without WHERE clause', async () => {
      const { client, serverProcess } = await createMCPClient();

      try {
        const result = await client.callTool({
          name: 'query',
          arguments: {
            sql: 'DELETE FROM test_queries',
          },
        });

        expect(result).toBeDefined();
        const content = result.content[0];
        
        if (content.type === 'text') {
          expect(content.text).toContain('validation failed');
          expect(content.text.toLowerCase()).toContain('where');
        }
      } finally {
        await closeMCPClient(client, serverProcess);
      }
    });
  });

  describe('Schema Inspection Tools', () => {
    it('should list all tables', async () => {
      const { client, serverProcess } = await createMCPClient();

      try {
        const result = await client.callTool({
          name: 'list_tables',
          arguments: {},
        });

        expect(result).toBeDefined();
        const content = result.content[0];
        
        if (content.type === 'text') {
          const data = JSON.parse(content.text);
          expect(data.tables).toBeDefined();
          expect(Array.isArray(data.tables)).toBe(true);
          expect(data.tables).toContain('users');
          expect(data.tables).toContain('products');
          expect(data.tables).toContain('orders');
        }
      } finally {
        await closeMCPClient(client, serverProcess);
      }
    });

    it('should describe table structure', async () => {
      const { client, serverProcess } = await createMCPClient();

      try {
        const result = await client.callTool({
          name: 'describe_table',
          arguments: {
            table: 'users',
          },
        });

        expect(result).toBeDefined();
        const content = result.content[0];
        
        if (content.type === 'text') {
          const data = JSON.parse(content.text);
          expect(data.table).toBe('users');
          expect(data.columns).toBeDefined();
          expect(Array.isArray(data.columns)).toBe(true);
          
          // Check for expected columns
          const columnNames = data.columns.map((c: any) => c.name);
          expect(columnNames).toContain('id');
          expect(columnNames).toContain('username');
          expect(columnNames).toContain('email');
        }
      } finally {
        await closeMCPClient(client, serverProcess);
      }
    });

    it('should return error for non-existent table', async () => {
      const { client, serverProcess } = await createMCPClient();

      try {
        const result = await client.callTool({
          name: 'describe_table',
          arguments: {
            table: 'nonexistent_table',
          },
        });

        expect(result).toBeDefined();
        const content = result.content[0];
        
        if (content.type === 'text') {
          expect(content.text.toLowerCase()).toContain('does not exist');
        }
      } finally {
        await closeMCPClient(client, serverProcess);
      }
    });

    it('should show table indexes', async () => {
      const { client, serverProcess } = await createMCPClient();

      try {
        const result = await client.callTool({
          name: 'show_indexes',
          arguments: {
            table: 'users',
          },
        });

        expect(result).toBeDefined();
        const content = result.content[0];
        
        if (content.type === 'text') {
          const data = JSON.parse(content.text);
          expect(data.table).toBe('users');
          expect(data.indexes).toBeDefined();
          expect(Array.isArray(data.indexes)).toBe(true);
          expect(data.indexes.length).toBeGreaterThan(0);
        }
      } finally {
        await closeMCPClient(client, serverProcess);
      }
    });
  });

  describe('Transaction Management', () => {
    beforeEach(async () => {
      // Clean test_transactions table before each test
      await cleanTable(pool, 'test_transactions');
      await resetAutoIncrement(pool, 'test_transactions');
    });

    it('should complete full transaction workflow: begin -> insert -> commit', async () => {
      const { client, serverProcess } = await createMCPClient();

      try {
        // Begin transaction
        const beginResult = await client.callTool({
          name: 'begin_transaction',
          arguments: {},
        });
        expect(beginResult).toBeDefined();
        
        let content = beginResult.content[0];
        if (content.type === 'text') {
          const data = JSON.parse(content.text);
          expect(data.success).toBe(true);
        }

        // Insert data in transaction
        const insertResult = await client.callTool({
          name: 'query',
          arguments: {
            sql: "INSERT INTO test_transactions (value) VALUES ('committed_value')",
          },
        });
        expect(insertResult).toBeDefined();

        // Commit transaction
        const commitResult = await client.callTool({
          name: 'commit_transaction',
          arguments: {},
        });
        expect(commitResult).toBeDefined();
        
        content = commitResult.content[0];
        if (content.type === 'text') {
          const data = JSON.parse(content.text);
          expect(data.success).toBe(true);
        }

        // Verify data was committed
        const rows = await executeQuery(
          pool,
          "SELECT * FROM test_transactions WHERE value = 'committed_value'"
        );
        expect(rows.length).toBe(1);
      } finally {
        await closeMCPClient(client, serverProcess);
      }
    });

    it('should rollback transaction and not persist changes', async () => {
      const { client, serverProcess } = await createMCPClient();

      try {
        // Begin transaction
        await client.callTool({
          name: 'begin_transaction',
          arguments: {},
        });

        // Insert data in transaction
        await client.callTool({
          name: 'query',
          arguments: {
            sql: "INSERT INTO test_transactions (value) VALUES ('rollback_value')",
          },
        });

        // Rollback transaction
        const rollbackResult = await client.callTool({
          name: 'rollback_transaction',
          arguments: {},
        });
        expect(rollbackResult).toBeDefined();
        
        const content = rollbackResult.content[0];
        if (content.type === 'text') {
          const data = JSON.parse(content.text);
          expect(data.success).toBe(true);
        }

        // Verify data was NOT committed
        const rows = await executeQuery(
          pool,
          "SELECT * FROM test_transactions WHERE value = 'rollback_value'"
        );
        expect(rows.length).toBe(0);
      } finally {
        await closeMCPClient(client, serverProcess);
      }
    });

    it('should handle multiple operations in a transaction', async () => {
      const { client, serverProcess } = await createMCPClient();

      try {
        // Begin transaction
        await client.callTool({
          name: 'begin_transaction',
          arguments: {},
        });

        // Multiple inserts
        await client.callTool({
          name: 'query',
          arguments: {
            sql: "INSERT INTO test_transactions (value) VALUES ('tx_value_1')",
          },
        });

        await client.callTool({
          name: 'query',
          arguments: {
            sql: "INSERT INTO test_transactions (value) VALUES ('tx_value_2')",
          },
        });

        await client.callTool({
          name: 'query',
          arguments: {
            sql: "INSERT INTO test_transactions (value) VALUES ('tx_value_3')",
          },
        });

        // Commit all changes
        await client.callTool({
          name: 'commit_transaction',
          arguments: {},
        });

        // Verify all data was committed
        const rows = await executeQuery(
          pool,
          "SELECT * FROM test_transactions WHERE value LIKE 'tx_value_%' ORDER BY value"
        );
        expect(rows.length).toBe(3);
        expect(rows[0].value).toBe('tx_value_1');
        expect(rows[1].value).toBe('tx_value_2');
        expect(rows[2].value).toBe('tx_value_3');
      } finally {
        await closeMCPClient(client, serverProcess);
      }
    });
  });

  describe('Resource Access', () => {
    it('should list available resources', async () => {
      const { client, serverProcess } = await createMCPClient();

      try {
        const resources = await client.listResources();

        expect(resources).toBeDefined();
        expect(resources.resources).toBeDefined();
        expect(Array.isArray(resources.resources)).toBe(true);
        expect(resources.resources.length).toBeGreaterThan(0);

        // Check resource format
        const resource = resources.resources[0];
        expect(resource.uri).toBeDefined();
        expect(resource.uri).toMatch(/^mysql:\/\//);
        expect(resource.name).toBeDefined();
        expect(resource.mimeType).toBe('application/json');
      } finally {
        await closeMCPClient(client, serverProcess);
      }
    });

    it('should read resource content for a table', async () => {
      const { client, serverProcess } = await createMCPClient();

      try {
        const result = await client.readResource({
          uri: 'mysql://test_db/users',
        });

        expect(result).toBeDefined();
        expect(result.contents).toBeDefined();
        expect(Array.isArray(result.contents)).toBe(true);
        expect(result.contents.length).toBeGreaterThan(0);

        const content = result.contents[0];
        expect(content.uri).toBe('mysql://test_db/users');
        expect(content.mimeType).toBe('application/json');
        
        if (content.text) {
          const data = JSON.parse(content.text);
          expect(data.table).toBe('users');
          expect(data.columns).toBeDefined();
          expect(Array.isArray(data.columns)).toBe(true);
        }
      } finally {
        await closeMCPClient(client, serverProcess);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle SQL syntax errors gracefully', async () => {
      const { client, serverProcess } = await createMCPClient();

      try {
        const result = await client.callTool({
          name: 'query',
          arguments: {
            sql: 'SELCT * FROM users', // Typo: SELCT instead of SELECT
          },
        });

        expect(result).toBeDefined();
        const content = result.content[0];
        
        if (content.type === 'text') {
          expect(content.text.toLowerCase()).toContain('error');
        }
      } finally {
        await closeMCPClient(client, serverProcess);
      }
    });

    it('should handle missing required parameters', async () => {
      const { client, serverProcess } = await createMCPClient();

      try {
        await expect(
          client.callTool({
            name: 'query',
            arguments: {}, // Missing 'sql' parameter
          })
        ).rejects.toThrow();
      } finally {
        await closeMCPClient(client, serverProcess);
      }
    });

    it('should reject multiple SQL statements', async () => {
      const { client, serverProcess } = await createMCPClient();

      try {
        const result = await client.callTool({
          name: 'query',
          arguments: {
            sql: 'SELECT * FROM users; DROP TABLE users;',
          },
        });

        expect(result).toBeDefined();
        const content = result.content[0];
        
        if (content.type === 'text') {
          expect(content.text).toContain('validation failed');
          expect(content.text.toLowerCase()).toContain('multiple');
        }
      } finally {
        await closeMCPClient(client, serverProcess);
      }
    });

    it('should reject DDL operations by default', async () => {
      const { client, serverProcess } = await createMCPClient();

      try {
        const result = await client.callTool({
          name: 'query',
          arguments: {
            sql: 'CREATE TABLE test_ddl (id INT)',
          },
        });

        expect(result).toBeDefined();
        const content = result.content[0];
        
        if (content.type === 'text') {
          expect(content.text).toContain('validation failed');
          expect(content.text.toLowerCase()).toContain('ddl');
        }
      } finally {
        await closeMCPClient(client, serverProcess);
      }
    });
  });

  describe('Complex Workflows', () => {
    beforeEach(async () => {
      await cleanTable(pool, 'test_queries');
      await resetAutoIncrement(pool, 'test_queries');
    });

    it('should handle complete CRUD workflow', async () => {
      const { client, serverProcess } = await createMCPClient();

      try {
        // CREATE: Insert a record
        const insertResult = await client.callTool({
          name: 'query',
          arguments: {
            sql: "INSERT INTO test_queries (data, number, flag) VALUES ('crud_test', 42, TRUE)",
          },
        });
        
        let content = insertResult.content[0];
        if (content.type === 'text') {
          const data = JSON.parse(content.text);
          expect(data.affectedRows).toBe(1);
        }

        // READ: Select the record
        const selectResult = await client.callTool({
          name: 'query',
          arguments: {
            sql: "SELECT * FROM test_queries WHERE data = 'crud_test'",
          },
        });
        
        content = selectResult.content[0];
        if (content.type === 'text') {
          const data = JSON.parse(content.text);
          expect(data.rows.length).toBe(1);
          expect(data.rows[0].number).toBe(42);
        }

        // UPDATE: Modify the record
        const updateResult = await client.callTool({
          name: 'query',
          arguments: {
            sql: "UPDATE test_queries SET number = 84 WHERE data = 'crud_test'",
          },
        });
        
        content = updateResult.content[0];
        if (content.type === 'text') {
          const data = JSON.parse(content.text);
          expect(data.affectedRows).toBe(1);
        }

        // READ: Verify update
        const verifyResult = await client.callTool({
          name: 'query',
          arguments: {
            sql: "SELECT * FROM test_queries WHERE data = 'crud_test'",
          },
        });
        
        content = verifyResult.content[0];
        if (content.type === 'text') {
          const data = JSON.parse(content.text);
          expect(data.rows[0].number).toBe(84);
        }

        // DELETE: Remove the record
        const deleteResult = await client.callTool({
          name: 'query',
          arguments: {
            sql: "DELETE FROM test_queries WHERE data = 'crud_test'",
          },
        });
        
        content = deleteResult.content[0];
        if (content.type === 'text') {
          const data = JSON.parse(content.text);
          expect(data.affectedRows).toBe(1);
        }

        // READ: Verify deletion
        const finalResult = await client.callTool({
          name: 'query',
          arguments: {
            sql: "SELECT * FROM test_queries WHERE data = 'crud_test'",
          },
        });
        
        content = finalResult.content[0];
        if (content.type === 'text') {
          const data = JSON.parse(content.text);
          expect(data.rows.length).toBe(0);
        }
      } finally {
        await closeMCPClient(client, serverProcess);
      }
    });

    it('should handle schema inspection followed by data query', async () => {
      const { client, serverProcess } = await createMCPClient();

      try {
        // First, inspect the schema
        const describeResult = await client.callTool({
          name: 'describe_table',
          arguments: {
            table: 'products',
          },
        });
        
        let content = describeResult.content[0];
        let columns: string[] = [];
        
        if (content.type === 'text') {
          const data = JSON.parse(content.text);
          columns = data.columns.map((c: any) => c.name);
          expect(columns).toContain('name');
          expect(columns).toContain('price');
        }

        // Then, query data based on schema knowledge
        const queryResult = await client.callTool({
          name: 'query',
          arguments: {
            sql: 'SELECT name, price FROM products WHERE category = "electronics" LIMIT 5',
          },
        });
        
        content = queryResult.content[0];
        if (content.type === 'text') {
          const data = JSON.parse(content.text);
          expect(data.rows).toBeDefined();
          expect(data.rows.length).toBeGreaterThan(0);
          expect(data.rows[0]).toHaveProperty('name');
          expect(data.rows[0]).toHaveProperty('price');
        }
      } finally {
        await closeMCPClient(client, serverProcess);
      }
    });
  });
});
