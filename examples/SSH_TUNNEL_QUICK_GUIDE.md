# SSH 隧道快速指南

## 5 分钟快速设置

### 第 1 步：打开终端

- **macOS**: 应用程序 → 实用工具 → 终端
- **Windows**: 搜索"PowerShell"或"命令提示符"
- **Linux**: 打开你的终端应用

### 第 2 步：执行命令

```bash
ssh -L 3307:192.168.1.200:3306 user@192.168.1.200
```

**替换这些值：**
- `user` → 你的 SSH 用户名
- `192.168.1.200` → 你的 MySQL 服务器 IP

### 第 3 步：输入密码

```
user@192.168.1.200's password: [输入密码]
```

**注意：** 输入时不会显示任何字符，这是正常的！

### 第 4 步：保持终端打开

看到登录成功后，**不要关闭这个终端窗口**！

可以最小化，但不能关闭。

### 第 5 步：修改 Cursor 配置

找到 Cursor 的 MCP 配置文件，修改这两个值：

```json
{
  "mcpServers": {
    "mysql": {
      "command": "mysql-mcp-server",
      "env": {
        "MYSQL_HOST": "127.0.0.1",     ← 改成这个
        "MYSQL_PORT": "3307",          ← 改成这个
        "MYSQL_USER": "your_username",
        "MYSQL_PASSWORD": "your_password",
        "MYSQL_DATABASE": "your_database"
      }
    }
  }
}
```

### 第 6 步：重启 Cursor

完全退出 Cursor（不是关闭窗口），然后重新打开。

### 完成！

现在 Cursor 应该可以连接到你的 MySQL 了。

---

## 常见问题速查

### ❓ 端口 3307 被占用？

换一个端口：

```bash
ssh -L 3308:192.168.1.200:3306 user@192.168.1.200
```

然后在 Cursor 配置中也改成 `3308`。

### ❓ 关闭终端后怎么办？

重新执行第 2 步的命令即可。

### ❓ 想后台运行不占用终端？

使用这个命令：

```bash
ssh -fN -L 3307:192.168.1.200:3306 user@192.168.1.200
```

停止后台隧道：

```bash
# 查找进程
ps aux | grep "ssh -fN"

# 停止（替换 12345 为实际的进程 ID）
kill 12345
```

### ❓ 每次输入密码太麻烦？

设置 SSH 密钥认证：

```bash
# 生成密钥（如果还没有）
ssh-keygen -t rsa -b 4096

# 复制到服务器
ssh-copy-id user@192.168.1.200
```

之后就不需要密码了。

---

## 配置对比

### ❌ 原来的配置（不能用）

```json
{
  "MYSQL_HOST": "192.168.1.200",
  "MYSQL_PORT": "3306"
}
```

### ✅ 使用隧道后的配置（可以用）

```json
{
  "MYSQL_HOST": "127.0.0.1",
  "MYSQL_PORT": "3307"
}
```

---

## 工作原理

```
Cursor
  ↓ 连接 127.0.0.1:3307
  ↓
SSH 隧道（加密）
  ↓
MySQL 服务器 192.168.1.200:3306
```

Cursor 以为在访问本地服务，实际上 SSH 隧道自动转发到远程服务器。

---

## 使用辅助脚本

我们提供了一个交互式脚本来简化设置：

```bash
./setup-ssh-tunnel.sh
```

脚本会一步步引导你完成所有配置。

---

## 需要帮助？

详细教程请参阅：
- [CURSOR_NETWORK_WORKAROUND.md](../CURSOR_NETWORK_WORKAROUND.md) - 完整教程
- [README.md](../README.md) - 项目文档
