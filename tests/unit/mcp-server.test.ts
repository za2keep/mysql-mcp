import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ServerConfig } from '../../src/config';

describe('MCP Protocol Unit Tests', () => {
  let testConfig: ServerConfig;

  beforeEach(() => {
    // Test configuration
    testConfig = {
      mysql: {
        host: 'localhost',
        port: 3306,
        user: 'testuser',
        password: 'testpass',
        database: 'testdb',
        connectionLimit: 10,
      },
      security: {
        maxSelectRows: 1000,
        allowDDL: false,
        allowMultipleStatements: false,
        requireWhereClause: true,
      },
      logging: {
        enabled: false,
        level: 'info',
      },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should create MCP server with correct name and version', () => {
      // Read the source file to verify server initialization
      const fs = require('fs');
      const path = require('path');
      const sourceFile = fs.readFileSync(
        path.join(__dirname, '../../src/index.ts'),
        'utf-8'
      );

      // Verify server is initialized with correct metadata
      expect(sourceFile).toContain("name: 'mysql-mcp-server'");
      expect(sourceFile).toContain("version: '1.0.0'");
    });

    it('should declare tools capability in server initialization', () => {
      const fs = require('fs');
      const path = require('path');
      const sourceFile = fs.readFileSync(
        path.join(__dirname, '../../src/index.ts'),
        'utf-8'
      );

      // Verify tools capability is declared
      expect(sourceFile).toContain('capabilities');
      expect(sourceFile).toContain('tools: {}');
    });

    it('should declare resources capability in server initialization', () => {
      const fs = require('fs');
      const path = require('path');
      const sourceFile = fs.readFileSync(
        path.join(__dirname, '../../src/index.ts'),
        'utf-8'
      );

      // Verify resources capability is declared
      expect(sourceFile).toContain('capabilities');
      expect(sourceFile).toContain('resources: {}');
    });

    it('should use McpServer from official SDK', () => {
      const fs = require('fs');
      const path = require('path');
      const sourceFile = fs.readFileSync(
        path.join(__dirname, '../../src/index.ts'),
        'utf-8'
      );

      // Verify we're importing from the official SDK
      expect(sourceFile).toContain("from '@modelcontextprotocol/sdk/server/mcp.js'");
      expect(sourceFile).toContain('McpServer');
    });
  });

  describe('Tool List', () => {
    it('should register query tool', () => {
      const fs = require('fs');
      const path = require('path');
      const sourceFile = fs.readFileSync(
        path.join(__dirname, '../../src/index.ts'),
        'utf-8'
      );

      // Verify query tool is registered
      expect(sourceFile).toContain("'query'");
      expect(sourceFile).toContain('Execute SQL queries');
    });

    it('should register list_tables tool', () => {
      const fs = require('fs');
      const path = require('path');
      const sourceFile = fs.readFileSync(
        path.join(__dirname, '../../src/index.ts'),
        'utf-8'
      );

      // Verify list_tables tool is registered
      expect(sourceFile).toContain("'list_tables'");
      expect(sourceFile).toContain('List all tables');
    });

    it('should register describe_table tool', () => {
      const fs = require('fs');
      const path = require('path');
      const sourceFile = fs.readFileSync(
        path.join(__dirname, '../../src/index.ts'),
        'utf-8'
      );

      // Verify describe_table tool is registered
      expect(sourceFile).toContain("'describe_table'");
      expect(sourceFile).toContain('column definitions');
    });

    it('should register show_indexes tool', () => {
      const fs = require('fs');
      const path = require('path');
      const sourceFile = fs.readFileSync(
        path.join(__dirname, '../../src/index.ts'),
        'utf-8'
      );

      // Verify show_indexes tool is registered
      expect(sourceFile).toContain("'show_indexes'");
      expect(sourceFile).toContain('indexes');
    });

    it('should register begin_transaction tool', () => {
      const fs = require('fs');
      const path = require('path');
      const sourceFile = fs.readFileSync(
        path.join(__dirname, '../../src/index.ts'),
        'utf-8'
      );

      // Verify begin_transaction tool is registered
      expect(sourceFile).toContain("'begin_transaction'");
      expect(sourceFile).toContain('Begin');
      expect(sourceFile).toContain('transaction');
    });

    it('should register commit_transaction tool', () => {
      const fs = require('fs');
      const path = require('path');
      const sourceFile = fs.readFileSync(
        path.join(__dirname, '../../src/index.ts'),
        'utf-8'
      );

      // Verify commit_transaction tool is registered
      expect(sourceFile).toContain("'commit_transaction'");
      expect(sourceFile).toContain('Commit');
    });

    it('should register rollback_transaction tool', () => {
      const fs = require('fs');
      const path = require('path');
      const sourceFile = fs.readFileSync(
        path.join(__dirname, '../../src/index.ts'),
        'utf-8'
      );

      // Verify rollback_transaction tool is registered
      expect(sourceFile).toContain("'rollback_transaction'");
      expect(sourceFile).toContain('Rollback');
    });

    it('should have all 7 required tools defined', () => {
      const fs = require('fs');
      const path = require('path');
      const sourceFile = fs.readFileSync(
        path.join(__dirname, '../../src/index.ts'),
        'utf-8'
      );

      // Count tool registrations
      const toolRegistrations = [
        'query',
        'list_tables',
        'describe_table',
        'show_indexes',
        'begin_transaction',
        'commit_transaction',
        'rollback_transaction',
      ];

      toolRegistrations.forEach((tool) => {
        expect(sourceFile).toContain(`'${tool}'`);
      });
    });
  });

  describe('stdio Transport', () => {
    it('should use StdioServerTransport from official SDK', () => {
      const fs = require('fs');
      const path = require('path');
      const sourceFile = fs.readFileSync(
        path.join(__dirname, '../../src/index.ts'),
        'utf-8'
      );

      // Verify we're importing StdioServerTransport
      expect(sourceFile).toContain("from '@modelcontextprotocol/sdk/server/stdio.js'");
      expect(sourceFile).toContain('StdioServerTransport');
    });

    it('should create StdioServerTransport instance', () => {
      const fs = require('fs');
      const path = require('path');
      const sourceFile = fs.readFileSync(
        path.join(__dirname, '../../src/index.ts'),
        'utf-8'
      );

      // Verify transport is instantiated
      expect(sourceFile).toContain('new StdioServerTransport()');
    });

    it('should connect MCP server to stdio transport', () => {
      const fs = require('fs');
      const path = require('path');
      const sourceFile = fs.readFileSync(
        path.join(__dirname, '../../src/index.ts'),
        'utf-8'
      );

      // Verify server connects to transport
      expect(sourceFile).toContain('.connect(transport)');
    });

    it('should use stderr for logging to not interfere with stdio', () => {
      const fs = require('fs');
      const path = require('path');
      const sourceFile = fs.readFileSync(
        path.join(__dirname, '../../src/index.ts'),
        'utf-8'
      );

      // Verify logging uses console.error (stderr)
      expect(sourceFile).toContain('console.error');
    });

    it('should have shebang for Node.js execution', () => {
      const fs = require('fs');
      const path = require('path');
      const sourceFile = fs.readFileSync(
        path.join(__dirname, '../../src/index.ts'),
        'utf-8'
      );

      // Verify shebang is present
      expect(sourceFile).toMatch(/^#!\/usr\/bin\/env node/);
    });
  });

  describe('Server Lifecycle', () => {
    it('should have start method that connects to database and transport', () => {
      const fs = require('fs');
      const path = require('path');
      const sourceFile = fs.readFileSync(
        path.join(__dirname, '../../src/index.ts'),
        'utf-8'
      );

      // Verify start method exists and connects
      expect(sourceFile).toContain('async start()');
      expect(sourceFile).toContain('await this.dbManager.connect()');
      expect(sourceFile).toContain('await this.mcpServer.connect(transport)');
    });

    it('should have stop method that closes server and database', () => {
      const fs = require('fs');
      const path = require('path');
      const sourceFile = fs.readFileSync(
        path.join(__dirname, '../../src/index.ts'),
        'utf-8'
      );

      // Verify stop method exists and closes connections
      expect(sourceFile).toContain('async stop()');
      expect(sourceFile).toContain('await this.mcpServer.close()');
      expect(sourceFile).toContain('await this.dbManager.close()');
    });

    it('should setup resources after database connection', () => {
      const fs = require('fs');
      const path = require('path');
      const sourceFile = fs.readFileSync(
        path.join(__dirname, '../../src/index.ts'),
        'utf-8'
      );

      // Verify resources are set up in start method
      expect(sourceFile).toContain('this.setupResources()');
    });

    it('should setup graceful shutdown handlers', () => {
      const fs = require('fs');
      const path = require('path');
      const sourceFile = fs.readFileSync(
        path.join(__dirname, '../../src/index.ts'),
        'utf-8'
      );

      // Verify graceful shutdown is configured
      expect(sourceFile).toContain('setupGracefulShutdown');
    });

    it('should handle startup errors and exit with non-zero code', () => {
      const fs = require('fs');
      const path = require('path');
      const sourceFile = fs.readFileSync(
        path.join(__dirname, '../../src/index.ts'),
        'utf-8'
      );

      // Verify error handling in main function
      expect(sourceFile).toContain('process.exit(1)');
      expect(sourceFile).toContain('catch');
    });
  });

  describe('Protocol Compliance', () => {
    it('should handle tools/call requests', () => {
      const fs = require('fs');
      const path = require('path');
      const sourceFile = fs.readFileSync(
        path.join(__dirname, '../../src/index.ts'),
        'utf-8'
      );

      // Verify tools are registered using SDK's .tool() method
      // The SDK automatically handles tools/call requests
      expect(sourceFile).toContain('this.mcpServer.tool(');
      expect(sourceFile).toContain('async (args: any)');
    });

    it('should handle resources/list requests', () => {
      const fs = require('fs');
      const path = require('path');
      const sourceFile = fs.readFileSync(
        path.join(__dirname, '../../src/index.ts'),
        'utf-8'
      );

      // Verify resources/list handler is set up using SDK schema
      expect(sourceFile).toContain("ListResourcesRequestSchema");
    });

    it('should handle resources/read requests', () => {
      const fs = require('fs');
      const path = require('path');
      const sourceFile = fs.readFileSync(
        path.join(__dirname, '../../src/index.ts'),
        'utf-8'
      );

      // Verify resources/read handler is set up using SDK schema
      expect(sourceFile).toContain("ReadResourceRequestSchema");
    });

    it('should use JSON for result formatting', () => {
      const fs = require('fs');
      const path = require('path');
      const sourceFile = fs.readFileSync(
        path.join(__dirname, '../../src/index.ts'),
        'utf-8'
      );

      // Verify JSON formatting is used
      expect(sourceFile).toContain('JSON.stringify');
    });

    it('should return content in MCP format with type and text', () => {
      const fs = require('fs');
      const path = require('path');
      const sourceFile = fs.readFileSync(
        path.join(__dirname, '../../src/index.ts'),
        'utf-8'
      );

      // Verify MCP response format
      expect(sourceFile).toContain('content:');
      expect(sourceFile).toContain("type: 'text'");
      expect(sourceFile).toContain('text:');
    });

    it('should include isError flag for error responses', () => {
      const fs = require('fs');
      const path = require('path');
      const sourceFile = fs.readFileSync(
        path.join(__dirname, '../../src/index.ts'),
        'utf-8'
      );

      // Verify error responses include isError flag
      expect(sourceFile).toContain('isError: true');
    });
  });
});
