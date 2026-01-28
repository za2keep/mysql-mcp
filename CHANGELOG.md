# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-01-26

### Added

#### Core Features
- Initial release of MySQL MCP Server
- Full MCP (Model Context Protocol) compliance with JSON-RPC 2.0 messaging
- stdio transport for seamless integration with MCP clients

#### Database Operations
- `query` tool for executing SQL queries (SELECT, INSERT, UPDATE, DELETE)
- `list_tables` tool for listing all tables in the database
- `describe_table` tool for retrieving table schema information
- `show_indexes` tool for displaying table indexes
- Connection pooling for efficient database access
- Graceful connection shutdown on server termination

#### Transaction Management
- `begin_transaction` tool for starting database transactions
- `commit_transaction` tool for committing transactions
- `rollback_transaction` tool for rolling back transactions
- Transaction state management with connection isolation
- Automatic rollback on connection close if not explicitly committed

#### Security Features
- Query validation before execution
- Automatic LIMIT addition to SELECT queries without explicit limits
- WHERE clause requirement for DELETE and UPDATE operations (configurable)
- DDL operation blocking by default (CREATE, DROP, ALTER)
- Multiple statement rejection to prevent SQL injection
- Configurable security policies via environment variables

#### Resource Exposure
- Database schemas exposed as MCP resources
- Resource URI format: `mysql://{database}/{table}`
- Structured JSON schema information in resource content
- `resources/list` endpoint for discovering available schemas
- `resources/read` endpoint for reading schema details

#### Configuration Management
- Environment variable-based configuration
- Zod schema validation for configuration integrity
- Sensible defaults for all optional settings
- Support for connection pool configuration
- Configurable security policies
- Flexible logging configuration

#### Error Handling
- Comprehensive error handling with descriptive messages
- JSON-RPC error response format compliance
- SQL state code extraction and reporting
- Detailed validation error messages
- Structured error logging with context

#### Logging System
- Configurable log levels (debug, info, warn, error)
- stderr output to avoid interfering with stdio transport
- Timestamped log entries
- Contextual information in log messages
- Query execution logging

#### Testing
- Comprehensive unit test suite
- Property-based testing with fast-check
- Integration tests with real MySQL database
- 18 correctness properties validated
- Docker-based test database setup
- Test coverage reporting

#### Documentation
- Comprehensive README with usage examples
- Configuration examples for Claude Desktop and Cursor
- Security best practices and recommendations
- Troubleshooting guide
- API documentation for all tools
- Development setup instructions

#### Cross-Platform Support
- Windows, macOS, and Linux compatibility
- Platform-specific path handling
- Node.js shebang for executable script
- npm package with bin entry point

### Technical Details

#### Dependencies
- `@modelcontextprotocol/sdk` ^1.0.0 - MCP protocol implementation
- `mysql2` ^3.3.3 - MySQL database driver
- `zod` ^3.22.0 - Runtime type validation

#### Development Dependencies
- `typescript` ^5.3.0 - TypeScript compiler
- `vitest` ^1.2.0 - Testing framework
- `fast-check` ^3.15.0 - Property-based testing library
- `@types/node` ^20.0.0 - Node.js type definitions

#### Requirements
- Node.js >= 18.0.0
- MySQL database server

### Architecture

- **Protocol Layer**: MCP SDK integration with stdio transport
- **Tool Handlers**: Modular tool implementation for database operations
- **Resource Handlers**: Schema exposure through MCP resources
- **Query Validator**: SQL query validation and safety checks
- **Transaction Manager**: Transaction state and connection management
- **Configuration Manager**: Environment-based configuration with validation
- **Error Handler**: Centralized error handling and formatting
- **Logger**: Structured logging system

### Security Considerations

This release implements multiple layers of security:

1. **Query Validation**: All queries validated before execution
2. **Row Limits**: Automatic limits on SELECT queries
3. **WHERE Clause Enforcement**: Required for DELETE/UPDATE by default
4. **DDL Restrictions**: CREATE/DROP/ALTER blocked by default
5. **Single Statement**: Multiple statements rejected
6. **Connection Security**: Support for secure MySQL connections

### Known Limitations

- No support for prepared statements (planned for future release)
- No support for stored procedures (planned for future release)
- No support for multiple database connections (planned for future release)
- No SSL/TLS configuration options (planned for future release)
- Transaction support is single-connection only (no distributed transactions)

### Migration Notes

This is the initial release, no migration required.

---

## [Unreleased]

### Planned Features

- SSL/TLS support for encrypted database connections
- Prepared statement support for better performance and security
- Stored procedure execution
- Query history and audit logging
- Query plan analysis (EXPLAIN tool)
- Batch operation support
- Multiple database connection support
- Read-only mode configuration
- Query template system with parameterization
- Performance metrics and monitoring
- Connection retry logic with exponential backoff
- Query timeout configuration
- Result streaming for large datasets

### Under Consideration

- GraphQL-style query interface
- Database migration tools
- Backup and restore tools
- User management tools
- Performance optimization suggestions
- Query caching layer
- WebSocket transport support
- HTTP/SSE transport support

---

## Version History

- **1.0.0** (2026-01-26) - Initial release

---

## Contributing

See [README.md](README.md) for contribution guidelines.

## License

MIT License - See [LICENSE](LICENSE) file for details.
