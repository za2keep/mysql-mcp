#!/bin/bash

# SSH Tunnel Setup Script for MySQL MCP Server
# This script helps you set up an SSH tunnel to access remote MySQL servers from Cursor

echo "=========================================="
echo "MySQL MCP Server - SSH 隧道设置向导"
echo "=========================================="
echo ""
echo "这个脚本将帮助你设置 SSH 隧道，让 Cursor 可以访问局域网的 MySQL 服务器。"
echo ""

# Check if SSH is available
if ! command -v ssh &> /dev/null; then
    echo "❌ 错误: SSH 未安装或不在 PATH 中"
    echo ""
    echo "请先安装 SSH："
    echo "  - macOS: 已预装"
    echo "  - Windows: 安装 OpenSSH 或使用 Git Bash"
    echo "  - Linux: sudo apt-get install openssh-client"
    exit 1
fi

echo "✅ SSH 已安装"
echo ""

# Get configuration
echo "请输入以下信息："
echo ""

read -p "1️⃣  MySQL 服务器 IP 地址 (例如: 192.168.1.200): " MYSQL_HOST
if [ -z "$MYSQL_HOST" ]; then
    echo "❌ MySQL 服务器 IP 不能为空"
    exit 1
fi

read -p "2️⃣  MySQL 端口 (默认: 3306，直接回车使用默认值): " MYSQL_PORT
MYSQL_PORT=${MYSQL_PORT:-3306}

read -p "3️⃣  本地端口 (默认: 3307，直接回车使用默认值): " LOCAL_PORT
LOCAL_PORT=${LOCAL_PORT:-3307}

read -p "4️⃣  SSH 用户名@服务器 (例如: admin@192.168.1.200): " SSH_HOST
if [ -z "$SSH_HOST" ]; then
    echo "❌ SSH 登录信息不能为空"
    exit 1
fi

echo ""
echo "=========================================="
echo "配置摘要"
echo "=========================================="
echo "远程 MySQL 服务器: $MYSQL_HOST:$MYSQL_PORT"
echo "本地端口: $LOCAL_PORT"
echo "SSH 登录: $SSH_HOST"
echo ""
echo "⚠️  重要提示："
echo "  1. 执行后需要输入 SSH 密码"
echo "  2. 不要关闭这个终端窗口（可以最小化）"
echo "  3. 按 Ctrl+C 可以停止隧道"
echo ""

read -p "确认启动 SSH 隧道? (y/n): " CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    echo "已取消。"
    exit 0
fi

echo ""
echo "=========================================="
echo "正在启动 SSH 隧道..."
echo "=========================================="
echo ""
echo "执行命令: ssh -L $LOCAL_PORT:$MYSQL_HOST:$MYSQL_PORT $SSH_HOST"
echo ""
echo "📝 下一步操作："
echo ""
echo "1. 输入 SSH 密码（输入时不会显示，这是正常的）"
echo ""
echo "2. 看到登录成功提示后，保持这个终端打开"
echo ""
echo "3. 修改 Cursor 配置文件，将以下内容复制到配置中："
echo ""
echo "   {"
echo "     \"mcpServers\": {"
echo "       \"mysql\": {"
echo "         \"command\": \"mysql-mcp-server\","
echo "         \"env\": {"
echo "           \"MYSQL_HOST\": \"127.0.0.1\","
echo "           \"MYSQL_PORT\": \"$LOCAL_PORT\","
echo "           \"MYSQL_USER\": \"your_mysql_username\","
echo "           \"MYSQL_PASSWORD\": \"your_mysql_password\","
echo "           \"MYSQL_DATABASE\": \"your_database_name\""
echo "         }"
echo "       }"
echo "     }"
echo "   }"
echo ""
echo "   ⚠️  注意修改："
echo "   - MYSQL_HOST 必须是 127.0.0.1 (不是 $MYSQL_HOST)"
echo "   - MYSQL_PORT 必须是 $LOCAL_PORT (不是 $MYSQL_PORT)"
echo "   - 替换 your_mysql_username 为你的 MySQL 用户名"
echo "   - 替换 your_mysql_password 为你的 MySQL 密码"
echo "   - 替换 your_database_name 为你的数据库名"
echo ""
echo "4. 完全重启 Cursor（退出应用，不是关闭窗口）"
echo ""
echo "5. 测试 MySQL MCP 连接"
echo ""
echo "=========================================="
echo "按 Ctrl+C 停止隧道"
echo "=========================================="
echo ""

# Start the tunnel
ssh -L $LOCAL_PORT:$MYSQL_HOST:$MYSQL_PORT $SSH_HOST

# This line will only execute if SSH exits
echo ""
echo "SSH 隧道已关闭。"
echo ""
echo "如需重新启动，请再次运行此脚本。"
