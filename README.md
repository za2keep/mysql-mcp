# MySQL MCP Server

[English](README.md) | [简体中文](README.zh-CN.md)

A Model Context Protocol (MCP) server implementation for MySQL databases, enabling AI assistants like Claude to interact with MySQL databases in a safe, standardized, and controlled way.

## Features

- **MCP Protocol Compliant**: Fully implements the Model Context Protocol specification
- **Safe Query Execution**: Built-in query validation and safety controls
- **Schema Inspection**: Tools to explore database structure
- **Transaction Support**: Full transaction management (BEGIN, COMMIT, ROLLBACK)
- **Resource Exposure**: Database schemas exposed as MCP resources
- **Comprehensive Error Handling**: Detailed error messages with SQL state codes
- **Property-Based Testing**: Extensively tested with property-based testing for correctness

## Installation

### From Source

```bash
# Clone the repository
git clone <repository-url>
cd mysql-mcp-server

# Install dependencies
npm install

# Build the project
npm run build

# Link globally (makes the command available system-wide)
npm link
```

After installation, the `mysql-mcp-server` command will be available system-wide.

## Configuration

The server is configured entirely through environment variables:

### Required Environment Variables

- `MYSQL_HOST` - MySQL server hostname (default: `localhost`)
- `MYSQL_PORT` - MySQL server port (default: `3306`)
- `MYSQL_USER` - MySQL username (required)
- `MYSQL_PASSWORD` - MySQL password (required)
- `MYSQL_DATABASE` - Database name (required)

### Optional Environment Variables

- `MYSQL_CONNECTION_LIMIT` - Maximum number of connections in pool (default: `10`)
- `MAX_SELECT_ROWS` - Maximum rows returned by SELECT queries (default: `1000`)
- `ALLOW_DDL` - Allow DDL operations (CREATE, DROP, ALTER) (default: `false`)
- `ALLOW_MULTIPLE_STATEMENTS` - Allow multiple SQL statements (default: `false`)
- `REQUIRE_WHERE_CLAUSE` - Require WHERE clause for UPDATE/DELETE (default: `true`)
- `MCP_LOG_LEVEL` - Logging level: `debug`, `info`, `warn`, `error` (default: `info`)

## Usage

### With Claude Desktop

Add to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "mysql": {
      "command": "mysql-mcp-server",
      "env": {
        "MYSQL_HOST": "localhost",
        "MYSQL_PORT": "3306",
        "MYSQL_USER": "your_username",
        "MYSQL_PASSWORD": "your_password",
        "MYSQL_DATABASE": "your_database"
      }
    }
  }
}
```

### With Cursor

Add to your Cursor MCP settings (`.cursor/mcp.json` in your project):

```json
{
  "mcpServers": {
    "mysql": {
      "command": "mysql-mcp-server",
      "env": {
        "MYSQL_HOST": "localhost",
        "MYSQL_USER": "your_username",
        "MYSQL_PASSWORD": "your_password",
        "MYSQL_DATABASE": "your_database"
      }
    }
  }
}
```

### With npx (Direct Execution)

You can also run the server directly using npx without installation. First, build the project locally:

```bash
# In the project directory
npm run build
```

Then configure your MCP client to use npx with the local path:

```json
{
  "mcpServers": {
    "mysql": {
      "command": "node",
      "args": ["/absolute/path/to/mysql-mcp-server/dist/index.js"],
      "env": {
        "MYSQL_HOST": "localhost",
        "MYSQL_USER": "your_username",
        "MYSQL_PASSWORD": "your_password",
        "MYSQL_DATABASE": "your_database"
      }
    }
  }
}
```

## Available Tools

The server provides the following MCP tools:

### 1. `query`
Execute SQL queries (SELECT, INSERT, UPDATE, DELETE)

```typescript
// Example usage in Claude
"Execute a query to find all users: SELECT * FROM users WHERE active = 1"
```

**Safety Features**:
- Automatically adds LIMIT to SELECT queries without one
- Rejects DELETE/UPDATE without WHERE clause (configurable)
- Rejects multiple statements
- Rejects DDL operations by default

### 2. `list_tables`
List all tables in the current database

```typescript
// Example usage
"Show me all tables in the database"
```

### 3. `describe_table`
Get detailed schema information for a specific table

```typescript
// Example usage
"Describe the structure of the users table"
```

### 4. `show_indexes`
Show all indexes for a specific table

```typescript
// Example usage
"Show me the indexes on the orders table"
```

### 5. `begin_transaction`
Start a new database transaction

### 6. `commit_transaction`
Commit the current transaction

### 7. `rollback_transaction`
Rollback the current transaction

```typescript
// Example transaction usage
"Start a transaction, update the user's email, then commit"
```

## Available Resources

The server exposes database schemas as MCP resources:

- **URI Format**: `mysql://{database}/{table}`
- **Content**: Structured JSON with table schema information

```typescript
// Example usage
"Read the schema resource for the users table"
```

## Security Considerations

### Default Safety Controls

1. **Query Validation**: All queries are validated before execution
2. **Row Limits**: SELECT queries are automatically limited to prevent memory exhaustion
3. **WHERE Clause Enforcement**: DELETE/UPDATE require WHERE clause by default
4. **DDL Restrictions**: CREATE, DROP, ALTER are blocked by default
5. **Single Statement**: Multiple statements are rejected by default

### Recommended Practices

1. **Use Read-Only Users**: Create a MySQL user with SELECT-only permissions for read-only use cases
2. **Limit Permissions**: Grant only necessary permissions to the MySQL user
3. **Network Security**: Use localhost or secure network connections
4. **Environment Variables**: Never commit credentials to version control
5. **Enable Logging**: Use `MCP_LOG_LEVEL=info` to monitor query execution

### Example: Creating a Read-Only User

```sql
-- Create a read-only user
CREATE USER 'mcp_readonly'@'localhost' IDENTIFIED BY 'secure_password';
GRANT SELECT ON your_database.* TO 'mcp_readonly'@'localhost';
FLUSH PRIVILEGES;
```

### Example: Creating a Limited Write User

```sql
-- Create a user with limited write permissions
CREATE USER 'mcp_user'@'localhost' IDENTIFIED BY 'secure_password';
GRANT SELECT, INSERT, UPDATE ON your_database.* TO 'mcp_user'@'localhost';
FLUSH PRIVILEGES;
```

## Development

### Prerequisites

- Node.js >= 18.0.0
- npm or yarn
- MySQL database (for testing and development)
- Docker (optional, for integration tests)

### Setup

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test
```

### Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit          # Unit tests only
npm run test:property      # Property-based tests only
npm run test:integration   # Integration tests only

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Integration Tests

Integration tests require a MySQL database. You can use the provided Docker setup:

```bash
# Start test database
npm run db:start

# Run integration tests
npm run test:integration

# Stop test database
npm run db:stop

# View database logs
npm run db:logs

# Connect to test database
npm run db:connect
```

See [tests/integration/README.md](tests/integration/README.md) for more details.

## Project Structure

```
mysql-mcp-server/
├── src/                    # TypeScript source files
│   ├── index.ts           # Main entry point
│   ├── config.ts          # Configuration management
│   ├── database.ts        # Database connection handling
│   ├── validator.ts       # Query validation
│   ├── transaction.ts     # Transaction management
│   ├── resources.ts       # MCP resource handlers
│   ├── errors.ts          # Error handling
│   └── logger.ts          # Logging system
├── tests/
│   ├── unit/              # Unit tests
│   ├── property/          # Property-based tests (fast-check)
│   └── integration/       # Integration tests
├── dist/                  # Compiled JavaScript output
├── .kiro/specs/           # Project specifications
│   └── mysql-mcp-server/
│       ├── requirements.md # Formal requirements (EARS format)
│       ├── design.md      # Design document with correctness properties
│       └── tasks.md       # Implementation task list
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## Technology Stack

- **Runtime**: Node.js with TypeScript
- **MCP SDK**: @modelcontextprotocol/sdk
- **Database**: mysql2
- **Validation**: Zod
- **Testing**: Vitest + fast-check (property-based testing)

## Troubleshooting

### Network Access in Different MCP Clients

**Important**: Different MCP clients have different network access policies:

- **AI IDEs (Cursor, Windsurf, etc.)**: Usually restrict private network access (192.168.x.x, 10.x.x.x) for security
- **Desktop Apps (Claude Desktop)**: Full network access, no restrictions
- **CLI Tools**: Full network access, inherit terminal permissions

**This affects ALL database MCP servers** (MySQL, PostgreSQL, Redis, MongoDB, etc.) when connecting to local network databases.

See [MCP_CLIENT_NETWORK_COMPARISON.md](MCP_CLIENT_NETWORK_COMPARISON.md) for detailed comparison and solutions.

### Connection Issues

**Problem**: Server fails to connect to MySQL

**Solutions**:
- Verify MySQL is running: `mysql -h localhost -u your_user -p`
- Check credentials in environment variables
- Verify network connectivity and firewall rules
- Check MySQL user permissions

**Problem**: `EHOSTUNREACH` error when connecting to remote MySQL server

This error can occur when running the MCP server in Cursor, specifically when connecting to **private network (LAN) MySQL servers**:

**Affected scenarios:**
- ❌ Local network MySQL: `192.168.x.x`, `10.x.x.x`, `172.16.x.x - 172.31.x.x`
- ✅ Cloud/Public MySQL: AWS RDS, Alibaba Cloud RDS, public IPs - **should work directly**

**Root cause**: Cursor may run MCP servers in a sandboxed environment that restricts access to private networks for security reasons.

**Solutions**:

**If your MySQL is on a cloud server (public IP/domain):**

Simply use the public endpoint directly - no special configuration needed:

```json
{
  "mcpServers": {
    "mysql": {
      "command": "mysql-mcp-server",
      "env": {
        "MYSQL_HOST": "your-rds.amazonaws.com",
        "MYSQL_PORT": "3306",
        "MYSQL_USER": "your_username",
        "MYSQL_PASSWORD": "your_password",
        "MYSQL_DATABASE": "your_database"
      }
    }
  }
}
```

**If your MySQL is on a local network (192.168.x.x, etc.):**

**Option 1: Use SSH Tunnel (Recommended)**

SSH tunnel forwards the remote MySQL port to your local machine, allowing Cursor to access it via localhost.

**Step-by-step guide:**

1. **Open a terminal** and run this command (keep the terminal open):

```bash
ssh -L 3307:192.168.1.200:3306 user@192.168.1.200
```

Replace:
- `3307` - Local port (can be any unused port)
- `192.168.1.200:3306` - Your MySQL server IP and port
- `user@192.168.1.200` - Your SSH username and server IP

2. **Enter your SSH password** when prompted

3. **Keep the terminal window open** (minimize it, don't close it)

4. **Update your Cursor config** to use localhost:

```json
{
  "mcpServers": {
    "mysql": {
      "command": "mysql-mcp-server",
      "env": {
        "MYSQL_HOST": "127.0.0.1",
        "MYSQL_PORT": "3307",
        "MYSQL_USER": "your_username",
        "MYSQL_PASSWORD": "your_password",
        "MYSQL_DATABASE": "your_database"
      }
    }
  }
}
```

Key changes:
- ✅ `MYSQL_HOST`: Change from `192.168.1.200` to `127.0.0.1`
- ✅ `MYSQL_PORT`: Change from `3306` to `3307` (match the local port in SSH command)
- ⚠️ Keep username, password, and database unchanged

5. **Restart Cursor** completely and test the connection

See [CURSOR_NETWORK_WORKAROUND.md](CURSOR_NETWORK_WORKAROUND.md) for detailed tutorial with screenshots and troubleshooting.

**Option 2: Test if it's a Cursor limitation**

Run the test script to verify the connection works outside of Cursor:

```bash
export MYSQL_HOST=192.168.1.200
export MYSQL_PORT=3306
export MYSQL_USER=your_username
export MYSQL_PASSWORD=your_password
export MYSQL_DATABASE=your_database

node test-connection.js
```

If the test succeeds but Cursor fails, it confirms Cursor's sandbox is blocking the connection.

**Option 3: Use Docker**

Run the MCP server in Docker, which typically has fewer network restrictions.

See [CURSOR_NETWORK_WORKAROUND.md](CURSOR_NETWORK_WORKAROUND.md) for detailed solutions and alternatives.

### Query Rejected

**Problem**: Query is rejected with validation error

**Solutions**:
- Add WHERE clause to DELETE/UPDATE queries
- Add LIMIT to SELECT queries (or let server add it automatically)
- Check if DDL operations are needed (set `ALLOW_DDL=true`)
- Verify query syntax

### Transaction Errors

**Problem**: Transaction commit/rollback fails

**Solutions**:
- Ensure transaction was started with `begin_transaction`
- Check for connection issues
- Verify no nested transactions (not supported)
- Check MySQL logs for database-level errors

### Logging

Enable debug logging to troubleshoot issues:

```json
{
  "env": {
    "MCP_LOG_LEVEL": "debug"
  }
}
```

Logs are written to stderr and won't interfere with MCP protocol communication.

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Write tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

MIT

## Acknowledgments

- Built with the [Model Context Protocol SDK](https://github.com/modelcontextprotocol/sdk)
- Uses [mysql2](https://github.com/sidorares/node-mysql2) for MySQL connectivity
- Property-based testing with [fast-check](https://github.com/dubzzz/fast-check)

## Support

For issues, questions, or contributions, please visit the project repository.
