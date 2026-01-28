# MySQL MCP 服务器

[English](README.md) | [简体中文](README.zh-CN.md)

一个用于 MySQL 数据库的模型上下文协议（MCP）服务器实现，使 Claude 等 AI 助手能够以安全、标准化和可控的方式与 MySQL 数据库交互。

## 特性

- **MCP 协议兼容**: 完全实现模型上下文协议规范
- **安全查询执行**: 内置查询验证和安全控制
- **架构检查**: 探索数据库结构的工具
- **事务支持**: 完整的事务管理（BEGIN、COMMIT、ROLLBACK）
- **资源暴露**: 数据库架构作为 MCP 资源暴露
- **全面的错误处理**: 带有 SQL 状态码的详细错误消息
- **基于属性的测试**: 通过基于属性的测试进行广泛的正确性验证

## 安装

### 从源码安装

```bash
# 克隆仓库
git clone <repository-url>
cd mysql-mcp-server

# 安装依赖
npm install

# 构建项目
npm run build

# 全局链接（使命令在系统中可用）
npm link
```

安装后，`mysql-mcp-server` 命令将在系统中可用。

## 配置

服务器完全通过环境变量进行配置：

### 必需的环境变量

- `MYSQL_HOST` - MySQL 服务器主机名（默认：`localhost`）
- `MYSQL_PORT` - MySQL 服务器端口（默认：`3306`）
- `MYSQL_USER` - MySQL 用户名（必需）
- `MYSQL_PASSWORD` - MySQL 密码（必需）
- `MYSQL_DATABASE` - 数据库名称（必需）

### 可选的环境变量

- `MYSQL_CONNECTION_LIMIT` - 连接池中的最大连接数（默认：`10`）
- `MAX_SELECT_ROWS` - SELECT 查询返回的最大行数（默认：`1000`）
- `ALLOW_DDL` - 允许 DDL 操作（CREATE、DROP、ALTER）（默认：`false`）
- `ALLOW_MULTIPLE_STATEMENTS` - 允许多条 SQL 语句（默认：`false`）
- `REQUIRE_WHERE_CLAUSE` - UPDATE/DELETE 需要 WHERE 子句（默认：`true`）
- `MCP_LOG_LEVEL` - 日志级别：`debug`、`info`、`warn`、`error`（默认：`info`）

## 使用方法

### 与 Claude Desktop 一起使用

添加到您的 Claude Desktop 配置文件：

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

### 与 Cursor 一起使用

添加到您的 Cursor MCP 设置（项目中的 `.cursor/mcp.json`）：

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

### 直接执行（无需全局安装）

您也可以直接运行服务器而无需全局安装。首先在项目目录中构建：

```bash
# 在项目目录中
npm run build
```

然后配置您的 MCP 客户端使用本地路径：

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

## 可用工具

服务器提供以下 MCP 工具：

### 1. `query`
执行 SQL 查询（SELECT、INSERT、UPDATE、DELETE）

```typescript
// Claude 中的使用示例
"执行查询查找所有用户：SELECT * FROM users WHERE active = 1"
```

**安全特性**：
- 自动为没有 LIMIT 的 SELECT 查询添加 LIMIT
- 拒绝没有 WHERE 子句的 DELETE/UPDATE（可配置）
- 拒绝多条语句
- 默认拒绝 DDL 操作

### 2. `list_tables`
列出当前数据库中的所有表

```typescript
// 使用示例
"显示数据库中的所有表"
```

### 3. `describe_table`
获取特定表的详细架构信息

```typescript
// 使用示例
"描述 users 表的结构"
```

### 4. `show_indexes`
显示特定表的所有索引

```typescript
// 使用示例
"显示 orders 表上的索引"
```

### 5. `begin_transaction`
开始一个新的数据库事务

### 6. `commit_transaction`
提交当前事务

### 7. `rollback_transaction`
回滚当前事务

```typescript
// 事务使用示例
"开始一个事务，更新用户的电子邮件，然后提交"
```

## 可用资源

服务器将数据库架构作为 MCP 资源暴露：

- **URI 格式**: `mysql://{database}/{table}`
- **内容**: 包含表架构信息的结构化 JSON

```typescript
// 使用示例
"读取 users 表的架构资源"
```

## 安全注意事项

### 默认安全控制

1. **查询验证**: 所有查询在执行前都会被验证
2. **行数限制**: SELECT 查询自动限制以防止内存耗尽
3. **WHERE 子句强制**: DELETE/UPDATE 默认需要 WHERE 子句
4. **DDL 限制**: CREATE、DROP、ALTER 默认被阻止
5. **单条语句**: 默认拒绝多条语句

### 推荐做法

1. **使用只读用户**: 为只读用例创建仅具有 SELECT 权限的 MySQL 用户
2. **限制权限**: 仅授予 MySQL 用户必要的权限
3. **网络安全**: 使用 localhost 或安全的网络连接
4. **环境变量**: 永远不要将凭据提交到版本控制
5. **启用日志**: 使用 `MCP_LOG_LEVEL=info` 监控查询执行

### 示例：创建只读用户

```sql
-- 创建只读用户
CREATE USER 'mcp_readonly'@'localhost' IDENTIFIED BY 'secure_password';
GRANT SELECT ON your_database.* TO 'mcp_readonly'@'localhost';
FLUSH PRIVILEGES;
```

### 示例：创建有限写入权限的用户

```sql
-- 创建具有有限写入权限的用户
CREATE USER 'mcp_user'@'localhost' IDENTIFIED BY 'secure_password';
GRANT SELECT, INSERT, UPDATE ON your_database.* TO 'mcp_user'@'localhost';
FLUSH PRIVILEGES;
```

## 开发

### 前置要求

- Node.js >= 18.0.0
- npm 或 yarn
- MySQL 数据库（用于测试和开发）
- Docker（可选，用于集成测试）

### 设置

```bash
# 安装依赖
npm install

# 构建项目
npm run build

# 运行测试
npm test
```

### 测试

```bash
# 运行所有测试
npm test

# 运行特定测试套件
npm run test:unit          # 仅单元测试
npm run test:property      # 仅基于属性的测试
npm run test:integration   # 仅集成测试

# 在监视模式下运行测试
npm run test:watch

# 运行带覆盖率的测试
npm run test:coverage
```

### 集成测试

集成测试需要 MySQL 数据库。您可以使用提供的 Docker 设置：

```bash
# 启动测试数据库
npm run db:start

# 运行集成测试
npm run test:integration

# 停止测试数据库
npm run db:stop

# 查看数据库日志
npm run db:logs

# 连接到测试数据库
npm run db:connect
```

详情请参阅 [tests/integration/README.md](tests/integration/README.md)。

## 项目结构

```
mysql-mcp-server/
├── src/                    # TypeScript 源文件
│   ├── index.ts           # 主入口点
│   ├── config.ts          # 配置管理
│   ├── database.ts        # 数据库连接处理
│   ├── validator.ts       # 查询验证
│   ├── transaction.ts     # 事务管理
│   ├── resources.ts       # MCP 资源处理器
│   ├── errors.ts          # 错误处理
│   └── logger.ts          # 日志系统
├── tests/
│   ├── unit/              # 单元测试
│   ├── property/          # 基于属性的测试（fast-check）
│   └── integration/       # 集成测试
├── dist/                  # 编译后的 JavaScript 输出
├── .kiro/specs/           # 项目规范
│   └── mysql-mcp-server/
│       ├── requirements.md # 正式需求（EARS 格式）
│       ├── design.md      # 带有正确性属性的设计文档
│       └── tasks.md       # 实现任务列表
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## 技术栈

- **运行时**: Node.js with TypeScript
- **MCP SDK**: @modelcontextprotocol/sdk
- **数据库**: mysql2
- **验证**: Zod
- **测试**: Vitest + fast-check（基于属性的测试）

## 故障排除

### 不同 MCP 客户端的网络访问

**重要提示**：不同的 MCP 客户端有不同的网络访问策略：

- **AI IDE（Cursor、Windsurf 等）**：通常出于安全考虑限制私有网络访问（192.168.x.x、10.x.x.x）
- **桌面应用（Claude Desktop）**：完全网络访问，无限制
- **CLI 工具**：完全网络访问，继承终端权限

**这会影响所有数据库 MCP 服务器**（MySQL、PostgreSQL、Redis、MongoDB 等）连接局域网数据库时。

详细对比和解决方案请参阅 [MCP_CLIENT_NETWORK_COMPARISON.md](MCP_CLIENT_NETWORK_COMPARISON.md)。

### 连接问题

**问题**: 服务器无法连接到 MySQL

**解决方案**：
- 验证 MySQL 正在运行：`mysql -h localhost -u your_user -p`
- 检查环境变量中的凭据
- 验证网络连接和防火墙规则
- 检查 MySQL 用户权限

**问题**: 连接远程 MySQL 服务器时出现 `EHOSTUNREACH` 错误

在 Cursor 中运行 MCP 服务器时可能出现此错误，特别是连接**私有网络（局域网）MySQL 服务器**时：

**受影响的场景：**
- ❌ 局域网 MySQL：`192.168.x.x`、`10.x.x.x`、`172.16.x.x - 172.31.x.x`
- ✅ 云服务器/公网 MySQL：AWS RDS、阿里云 RDS、公网 IP - **应该可以直接连接**

**根本原因**：Cursor 可能在沙箱环境中运行 MCP 服务器，出于安全考虑限制了对私有网络的访问。

**解决方案**：

**如果你的 MySQL 在云服务器上（公网 IP/域名）：**

直接使用公网端点即可 - 无需特殊配置：

```json
{
  "mcpServers": {
    "mysql": {
      "command": "mysql-mcp-server",
      "env": {
        "MYSQL_HOST": "your-rds.rds.aliyuncs.com",
        "MYSQL_PORT": "3306",
        "MYSQL_USER": "your_username",
        "MYSQL_PASSWORD": "your_password",
        "MYSQL_DATABASE": "your_database"
      }
    }
  }
}
```

**如果你的 MySQL 在局域网（192.168.x.x 等）：**

**方案 1: 使用 SSH 隧道（推荐）**

SSH 隧道将远程 MySQL 端口转发到本地，让 Cursor 可以通过 localhost 访问。

**详细步骤：**

1. **打开终端**并运行以下命令（保持终端打开）：

```bash
ssh -L 3307:192.168.1.200:3306 user@192.168.1.200
```

替换为你的实际信息：
- `3307` - 本地端口（可以是任何未占用的端口）
- `192.168.1.200:3306` - 你的 MySQL 服务器 IP 和端口
- `user@192.168.1.200` - 你的 SSH 用户名和服务器 IP

2. **输入 SSH 密码**（提示时）

3. **保持终端窗口打开**（可以最小化，但不要关闭）

4. **更新 Cursor 配置**使用 localhost：

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

关键修改：
- ✅ `MYSQL_HOST`：从 `192.168.1.200` 改为 `127.0.0.1`
- ✅ `MYSQL_PORT`：从 `3306` 改为 `3307`（与 SSH 命令中的本地端口一致）
- ⚠️ 用户名、密码、数据库名保持不变

5. **完全重启 Cursor** 并测试连接

详细教程（包含图解和故障排除）请参阅 [CURSOR_NETWORK_WORKAROUND.md](CURSOR_NETWORK_WORKAROUND.md)。

**方案 2: 测试是否是 Cursor 的限制**

运行测试脚本验证连接在 Cursor 外部是否正常：

```bash
export MYSQL_HOST=192.168.1.200
export MYSQL_PORT=3306
export MYSQL_USER=your_username
export MYSQL_PASSWORD=your_password
export MYSQL_DATABASE=your_database

node test-connection.js
```

如果测试成功但 Cursor 失败，则确认是 Cursor 的沙箱阻止了连接。

**方案 3: 使用 Docker**

在 Docker 中运行 MCP 服务器，通常具有较少的网络限制。

详细解决方案和替代方案请参阅 [CURSOR_NETWORK_WORKAROUND.md](CURSOR_NETWORK_WORKAROUND.md)。

### 查询被拒绝

**问题**: 查询被验证错误拒绝

**解决方案**：
- 为 DELETE/UPDATE 查询添加 WHERE 子句
- 为 SELECT 查询添加 LIMIT（或让服务器自动添加）
- 检查是否需要 DDL 操作（设置 `ALLOW_DDL=true`）
- 验证查询语法

### 事务错误

**问题**: 事务提交/回滚失败

**解决方案**：
- 确保使用 `begin_transaction` 启动了事务
- 检查连接问题
- 验证没有嵌套事务（不支持）
- 检查 MySQL 日志以查找数据库级错误

### 日志记录

启用调试日志以排除问题：

```json
{
  "env": {
    "MCP_LOG_LEVEL": "debug"
  }
}
```

日志写入 stderr，不会干扰 MCP 协议通信。

## 贡献

欢迎贡献！请：

1. Fork 仓库
2. 创建功能分支
3. 为新功能编写测试
4. 确保所有测试通过
5. 提交 pull request

## 许可证

MIT

## 致谢

- 使用 [Model Context Protocol SDK](https://github.com/modelcontextprotocol/sdk) 构建
- 使用 [mysql2](https://github.com/sidorares/node-mysql2) 进行 MySQL 连接
- 使用 [fast-check](https://github.com/dubzzz/fast-check) 进行基于属性的测试

## 支持

如有问题、疑问或贡献，请访问项目仓库。
