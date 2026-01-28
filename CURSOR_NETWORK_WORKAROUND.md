# Cursor 网络访问问题解决方案

## 问题描述

Cursor 在运行 MCP 服务器时可能在沙箱环境中执行，这会**限制对本地局域网（私有网络）的访问**，例如：
- `192.168.x.x` (私有网络 C 类)
- `10.x.x.x` (私有网络 A 类)
- `172.16.x.x - 172.31.x.x` (私有网络 B 类)
- `127.0.0.1` (本地回环，通常允许)

**重要说明**：
- ✅ **公网 IP 和云服务器通常不受限制** - 如果你的 MySQL 在云上（AWS RDS、阿里云 RDS、腾讯云等），使用公网 IP 或域名应该可以直接连接
- ❌ **局域网 IP 会被限制** - 如果 MySQL 在本地网络的其他机器上（如 192.168.1.200），则需要使用 SSH 隧道

即使你的网络连接正常，Navicat 可以连接局域网 MySQL，Cursor 中的 MCP 服务器也可能无法访问。

## 解决方案

### 快速决策流程

```
你的 MySQL 服务器在哪里？
│
├─ 云服务器（公网 IP 或域名）
│  └─ ✅ 直接配置，无需 SSH 隧道
│     示例：xxx.rds.amazonaws.com, 1.2.3.4
│
└─ 局域网（私有 IP）
   └─ ❌ 需要 SSH 隧道
      示例：192.168.1.200, 10.0.0.5
```

### 场景判断

**首先判断你的 MySQL 服务器类型：**

#### 场景 A: 云服务器 MySQL（公网访问）
如果你的 MySQL 在云上，使用公网 IP 或域名：
- AWS RDS: `xxx.rds.amazonaws.com`
- 阿里云 RDS: `xxx.mysql.rds.aliyuncs.com`
- 腾讯云: `xxx.tencentcdb.com`
- 或任何公网 IP: `1.2.3.4`

**✅ 直接配置即可，无需 SSH 隧道：**

```json
{
  "mcpServers": {
    "mysql": {
      "command": "mysql-mcp-server",
      "env": {
        "MYSQL_HOST": "your-rds-endpoint.rds.amazonaws.com",
        "MYSQL_PORT": "3306",
        "MYSQL_USER": "your_username",
        "MYSQL_PASSWORD": "your_password",
        "MYSQL_DATABASE": "your_database"
      }
    }
  }
}
```

#### 场景 B: 局域网 MySQL（私有网络）
如果你的 MySQL 在本地网络：
- `192.168.x.x`
- `10.x.x.x`
- `172.16.x.x - 172.31.x.x`

**❌ 需要使用 SSH 隧道或其他方案**

### 方案 1: 使用 SSH 隧道（推荐 - 仅局域网需要）

SSH 隧道可以将远程服务器的端口"映射"到你本地电脑，让 Cursor 以为是在访问本地服务。

#### 什么是 SSH 隧道？

简单理解：
- 你的电脑 ←→ SSH 隧道 ←→ MySQL 服务器
- Cursor 访问 `localhost:3307` → SSH 隧道自动转发到 → `192.168.1.200:3306`

#### 完整步骤（适合小白）

**步骤 1: 打开终端**

- **macOS**: 打开"终端"应用（在"应用程序" → "实用工具"中）
- **Windows**: 打开"PowerShell"或"命令提示符"
- **Linux**: 打开你的终端应用

**步骤 2: 执行 SSH 隧道命令**

在终端中输入以下命令（替换成你的实际信息）：

```bash
ssh -L 3307:192.168.1.200:3306 user@192.168.1.200
```

**命令解释：**
- `ssh` - SSH 连接命令
- `-L 3307:192.168.1.200:3306` - 端口转发配置
  - `3307` - 本地端口（可以改成其他未占用的端口，如 3308、3309）
  - `192.168.1.200:3306` - 远程 MySQL 服务器地址和端口
- `user@192.168.1.200` - SSH 登录信息
  - `user` - 替换成你的 SSH 用户名
  - `192.168.1.200` - MySQL 服务器的 IP 地址

**实际例子：**

假设你的情况是：
- MySQL 服务器 IP: `192.168.1.200`
- MySQL 端口: `3306`
- SSH 用户名: `admin`

那么命令就是：
```bash
ssh -L 3307:192.168.1.200:3306 admin@192.168.1.200
```

**步骤 3: 输入 SSH 密码**

执行命令后，会提示你输入 SSH 密码：
```
admin@192.168.1.200's password: 
```

输入密码（注意：输入时不会显示任何字符，这是正常的），然后按回车。

**步骤 4: 确认隧道已建立**

成功后，你会看到类似这样的提示：
```
Welcome to Ubuntu 20.04 LTS
Last login: Tue Jan 28 10:00:00 2026
admin@mysql-server:~$
```

**重要提示：**
- ⚠️ **不要关闭这个终端窗口！** 关闭后隧道就断开了
- ⚠️ **保持这个终端窗口在后台运行**
- ✅ 你可以最小化这个窗口，但不要关闭

**步骤 5: 修改 Cursor 配置**

现在需要修改 Cursor 的 MCP 配置，让它连接到本地端口而不是远程 IP。

**原来的配置（不能用）：**
```json
{
  "mcpServers": {
    "mysql": {
      "command": "mysql-mcp-server",
      "env": {
        "MYSQL_HOST": "192.168.1.200",
        "MYSQL_PORT": "3306",
        "MYSQL_USER": "your_username",
        "MYSQL_PASSWORD": "your_password",
        "MYSQL_DATABASE": "your_database"
      }
    }
  }
}
```

**修改后的配置（可以用）：**
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

**关键修改：**
- ✅ `MYSQL_HOST`: `192.168.1.200` → `127.0.0.1`（或 `localhost`）
- ✅ `MYSQL_PORT`: `3306` → `3307`（与 SSH 命令中的本地端口一致）
- ⚠️ 其他配置（用户名、密码、数据库名）保持不变

**步骤 6: 重启 Cursor**

1. 完全退出 Cursor（不是关闭窗口，是退出应用）
2. 重新打开 Cursor
3. 测试 MySQL MCP 连接

**步骤 7: 测试连接**

在 Cursor 中测试 MCP 是否能正常工作。如果成功，你应该能够：
- 列出数据库表
- 执行查询
- 查看表结构

#### 常见问题

**Q1: 如果我关闭了终端窗口怎么办？**

A: 重新执行步骤 2 的 SSH 命令即可。

**Q2: 端口 3307 已被占用怎么办？**

A: 换一个端口号，比如 3308：
```bash
ssh -L 3308:192.168.1.200:3306 user@192.168.1.200
```
然后在 Cursor 配置中也改成 `3308`。

**Q3: 如何查看哪些端口被占用？**

A: 在终端执行：
```bash
# macOS/Linux
lsof -i :3307

# Windows
netstat -ano | findstr :3307
```

**Q4: SSH 连接超时或失败？**

A: 检查：
- MySQL 服务器是否开启了 SSH 服务
- 你的 SSH 用户名和密码是否正确
- 防火墙是否允许 SSH 连接（端口 22）

**Q5: 每次都要手动建立隧道太麻烦？**

A: 可以使用自动化脚本（见下面的"进阶技巧"）。

#### 进阶技巧

**技巧 1: 使用后台运行（不占用终端）**

```bash
ssh -fN -L 3307:192.168.1.200:3306 user@192.168.1.200
```

参数说明：
- `-f` - 后台运行
- `-N` - 不执行远程命令，只做端口转发

这样就不会占用终端窗口了。

**停止后台隧道：**
```bash
# 查找进程
ps aux | grep "ssh -fN"

# 停止进程（替换 PID 为实际的进程 ID）
kill <PID>
```

**技巧 2: 使用 SSH 配置文件**

创建或编辑 `~/.ssh/config` 文件：

```
Host mysql-tunnel
    HostName 192.168.1.200
    User admin
    LocalForward 3307 192.168.1.200:3306
```

然后只需要执行：
```bash
ssh mysql-tunnel
```

**技巧 3: 使用密钥认证（免密码）**

生成 SSH 密钥：
```bash
ssh-keygen -t rsa -b 4096
```

复制公钥到服务器：
```bash
ssh-copy-id user@192.168.1.200
```

之后就不需要输入密码了。

**技巧 4: 使用 autossh（自动重连）**

安装 autossh：
```bash
# macOS
brew install autossh

# Ubuntu/Debian
sudo apt-get install autossh
```

使用 autossh：
```bash
autossh -M 0 -fN -L 3307:192.168.1.200:3306 user@192.168.1.200
```

这样即使连接断开也会自动重连。

#### 图解说明

```
┌─────────────────┐
│   你的电脑      │
│   (macOS)       │
│                 │
│  Cursor IDE     │
│     ↓           │
│  连接到:        │
│  127.0.0.1:3307 │
└────────┬────────┘
         │
         │ SSH 隧道
         │ (加密传输)
         │
         ↓
┌─────────────────┐
│  MySQL 服务器   │
│  192.168.1.200  │
│                 │
│  MySQL 端口:    │
│  3306           │
└─────────────────┘
```

#### 完整示例（从头到尾）

假设你的配置是：
- MySQL 服务器: `192.168.1.200`
- MySQL 端口: `3306`
- SSH 用户: `admin`
- SSH 密码: `mypassword`
- MySQL 用户: `dbuser`
- MySQL 密码: `dbpass`
- 数据库名: `mydb`

**第 1 步：打开终端，执行**
```bash
ssh -L 3307:192.168.1.200:3306 admin@192.168.1.200
```

**第 2 步：输入密码**
```
admin@192.168.1.200's password: mypassword
```

**第 3 步：看到登录成功提示，保持终端打开**
```
admin@mysql-server:~$
```

**第 4 步：修改 Cursor 配置文件**

找到 `.cursor/mcp.json` 或 Cursor 设置中的 MCP 配置，修改为：

```json
{
  "mcpServers": {
    "mysql": {
      "command": "mysql-mcp-server",
      "env": {
        "MYSQL_HOST": "127.0.0.1",
        "MYSQL_PORT": "3307",
        "MYSQL_USER": "dbuser",
        "MYSQL_PASSWORD": "dbpass",
        "MYSQL_DATABASE": "mydb"
      }
    }
  }
}
```

**第 5 步：重启 Cursor**

完全退出并重新打开 Cursor。

**第 6 步：测试**

在 Cursor 中使用 MySQL MCP，应该可以正常连接了！

#### 使用辅助脚本

我们提供了一个辅助脚本来简化设置过程：

```bash
./setup-ssh-tunnel.sh
```

脚本会引导你输入所有必要的信息，并自动建立隧道。

### 方案 2: 在 MySQL 服务器上创建本地转发

如果你可以访问 MySQL 服务器，可以使用 socat 或 rinetd 创建端口转发：

```bash
# 在 MySQL 服务器上运行
socat TCP-LISTEN:3307,fork TCP:localhost:3306
```

### 方案 3: 使用 Docker 容器运行 MCP 服务器

Docker 容器通常有更宽松的网络访问权限：

```bash
# 构建 Docker 镜像
docker build -t mysql-mcp-server .

# 运行容器
docker run -it --rm \
  -e MYSQL_HOST=192.168.1.200 \
  -e MYSQL_PORT=3306 \
  -e MYSQL_USER=your_username \
  -e MYSQL_PASSWORD=your_password \
  -e MYSQL_DATABASE=your_database \
  mysql-mcp-server
```

### 方案 4: 在本地安装 MySQL 代理

使用 MySQL Proxy 或 ProxySQL 在本地创建一个代理：

```bash
# 安装 ProxySQL
brew install proxysql  # macOS

# 配置 ProxySQL 连接到远程 MySQL
# 然后 Cursor 连接到本地 ProxySQL
```

### 方案 5: 测试是否真的是 Cursor 的限制

运行测试脚本验证：

```bash
# 设置环境变量
export MYSQL_HOST=192.168.1.200
export MYSQL_PORT=3306
export MYSQL_USER=your_username
export MYSQL_PASSWORD=your_password
export MYSQL_DATABASE=your_database

# 运行测试
node test-connection.js
```

如果测试脚本成功但 Cursor 失败，那就确认是 Cursor 的沙箱限制。

### 方案 6: 直接在终端运行 MCP 服务器

不通过 Cursor 启动，而是在终端中手动运行：

```bash
# 设置环境变量
export MYSQL_HOST=192.168.1.200
export MYSQL_PORT=3306
export MYSQL_USER=your_username
export MYSQL_PASSWORD=your_password
export MYSQL_DATABASE=your_database

# 运行服务器
node dist/index.js
```

然后配置 Cursor 连接到已运行的服务器（如果 Cursor 支持）。

## 推荐方案

**最简单且最可靠的方案是使用 SSH 隧道（方案 1）**，因为：
1. 不需要修改 MySQL 服务器配置
2. 安全性高（通过 SSH 加密）
3. 兼容性好（绕过 Cursor 的网络限制）
4. 易于设置和管理

## 验证步骤

1. 首先运行 `node test-connection.js` 验证直接连接是否工作
2. 如果直接连接工作但 Cursor 不工作，使用 SSH 隧道方案
3. 更新 Cursor 配置使用 `127.0.0.1` 和隧道端口
4. 重启 Cursor 并测试

## 注意事项

- SSH 隧道需要保持终端窗口打开
- 可以使用 `autossh` 来自动重连 SSH 隧道
- 确保 SSH 服务器允许端口转发（`AllowTcpForwarding yes`）
