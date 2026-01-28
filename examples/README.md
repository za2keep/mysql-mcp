# Configuration Examples

This directory contains example configuration files for different use cases and MCP clients.

## Files

### MCP Client Configurations

- **`claude-desktop-config.json`** - Full configuration for Claude Desktop with all options
- **`cursor-config.json`** - Basic configuration for Cursor IDE
- **`npx-config.json`** - Configuration using npx (no installation required)

### Use Case Configurations

- **`read-only-config.json`** - Read-only configuration for safe database access
- **`development-config.json`** - Development configuration with relaxed security
- **`cloud-mysql-config.json`** - Configuration for cloud MySQL (AWS RDS, Alibaba Cloud, etc.)

### Environment Variables

- **`.env.example`** - Example environment variables file

## Network Configuration Guide

### Scenario 1: Cloud MySQL (Public IP/Domain)

If your MySQL is hosted on a cloud provider with a public endpoint:
- ✅ **Works directly in Cursor** - No special configuration needed
- Examples: AWS RDS, Alibaba Cloud RDS, Tencent Cloud, Azure Database

Use `cloud-mysql-config.json` as a template:

```json
{
  "mcpServers": {
    "mysql": {
      "command": "mysql-mcp-server",
      "env": {
        "MYSQL_HOST": "your-instance.rds.amazonaws.com",
        "MYSQL_PORT": "3306",
        "MYSQL_USER": "admin",
        "MYSQL_PASSWORD": "your_password",
        "MYSQL_DATABASE": "your_database"
      }
    }
  }
}
```

### Scenario 2: Local Network MySQL (Private IP)

If your MySQL is on a local network (192.168.x.x, 10.x.x.x, etc.):
- ❌ **Requires SSH tunnel in Cursor** - Due to sandbox restrictions
- See [CURSOR_NETWORK_WORKAROUND.md](../CURSOR_NETWORK_WORKAROUND.md) for solutions

Quick solution using SSH tunnel:

```bash
# In a terminal (keep running)
ssh -L 3307:192.168.1.200:3306 user@192.168.1.200
```

Then use localhost in your config:

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

### Scenario 3: Localhost MySQL

If MySQL is running on the same machine as Cursor:
- ✅ **Works directly** - Use `localhost` or `127.0.0.1`

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

## Usage

### Claude Desktop

1. Locate your Claude Desktop configuration file:
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
   - **Linux**: `~/.config/Claude/claude_desktop_config.json`

2. Copy the content from `claude-desktop-config.json` or another example

3. Update the credentials:
   ```json
   {
     "MYSQL_USER": "your_actual_username",
     "MYSQL_PASSWORD": "your_actual_password",
     "MYSQL_DATABASE": "your_actual_database"
   }
   ```

4. Restart Claude Desktop

### Cursor

1. Create or edit `.cursor/mcp.json` in your project directory

2. Copy the content from `cursor-config.json`

3. Update the credentials

4. Restart Cursor

### Environment Variables

If you prefer using environment variables instead of inline configuration:

1. Copy `.env.example` to `.env`

2. Update the values in `.env`

3. Modify your MCP configuration to reference environment variables:
   ```json
   {
     "mcpServers": {
       "mysql": {
         "command": "mysql-mcp-server",
         "env": {
           "MYSQL_HOST": "${MYSQL_HOST}",
           "MYSQL_USER": "${MYSQL_USER}",
           "MYSQL_PASSWORD": "${MYSQL_PASSWORD}",
           "MYSQL_DATABASE": "${MYSQL_DATABASE}"
         }
       }
     }
   }
   ```

## Configuration Options

### Required

- `MYSQL_HOST` - MySQL server hostname
- `MYSQL_PORT` - MySQL server port
- `MYSQL_USER` - MySQL username
- `MYSQL_PASSWORD` - MySQL password
- `MYSQL_DATABASE` - Database name

### Optional

- `MYSQL_CONNECTION_LIMIT` - Max connections in pool (default: 10)
- `MAX_SELECT_ROWS` - Max rows returned by SELECT (default: 1000)
- `ALLOW_DDL` - Allow CREATE/DROP/ALTER (default: false)
- `ALLOW_MULTIPLE_STATEMENTS` - Allow multiple SQL statements (default: false)
- `REQUIRE_WHERE_CLAUSE` - Require WHERE in UPDATE/DELETE (default: true)
- `MCP_LOG_LEVEL` - Logging level: debug, info, warn, error (default: info)

## Security Recommendations

### Production Use

Use the **read-only configuration** with a MySQL user that has SELECT-only permissions:

```sql
CREATE USER 'mcp_readonly'@'localhost' IDENTIFIED BY 'secure_password';
GRANT SELECT ON your_database.* TO 'mcp_readonly'@'localhost';
FLUSH PRIVILEGES;
```

### Development Use

Use the **development configuration** with relaxed security for local development:

```sql
CREATE USER 'dev_user'@'localhost' IDENTIFIED BY 'dev_password';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, ALTER ON dev_database.* TO 'dev_user'@'localhost';
FLUSH PRIVILEGES;
```

### General Best Practices

1. **Never commit credentials** - Use environment variables or secure vaults
2. **Use localhost** - Avoid exposing database to network when possible
3. **Limit permissions** - Grant only necessary privileges to the MySQL user
4. **Enable logging** - Use `MCP_LOG_LEVEL=info` to monitor activity
5. **Regular audits** - Review query logs and user permissions regularly

## Troubleshooting

### Connection Refused

- Verify MySQL is running
- Check host and port settings
- Verify firewall rules

### Authentication Failed

- Verify username and password
- Check MySQL user exists: `SELECT User, Host FROM mysql.user;`
- Verify user has access from the connection host

### Permission Denied

- Check user permissions: `SHOW GRANTS FOR 'username'@'host';`
- Grant necessary permissions
- Run `FLUSH PRIVILEGES;` after granting permissions

### Configuration Not Loading

- Verify JSON syntax is valid
- Check file location matches your MCP client
- Restart the MCP client after configuration changes
- Check MCP client logs for errors
