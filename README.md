# Price Visualization

当前版本：v0.1

本项目采用 CC BY-NC 4.0（Creative Commons Attribution-NonCommercial）许可证。

允许学习、修改、非商用分享；严禁任何盈利、商业产品、付费服务使用。

感谢 [CSQAQ.COM](https://csqaq.com/) 提供的 API 接口，使本项目能够真正的落地实施。

Steam 市场情报站配置管理面板。项目基于 Next.js App Router、React、TypeScript 和 SQLite，支持饰品价格配置、CSQAQ 价格查询、自动批量监控与 QQ 邮箱提醒。

## 功能概览

- 饰品配置管理：新增、编辑、删除、启用/禁用监控，点击卡片查看当前市场详情。
- 全局开关配置：分别控制悠悠有品、Steam 的上下限提醒。
- 批量查询：手动批量查询已配置饰品的悠悠有品、Steam 当前价格。
- 自动监控：服务端每 30 分钟自动执行一次批量查询；若价格超出用户设置的各平台上下限，会发送邮件提醒。
- 邮件提醒：提醒内容包含中文名、ID、英文名、各平台价格和触发原因。
- CSQAQ 接入：服务端对外部 API 做短缓存、串行节流与 429 重试。
- 本地 SQLite 持久化：默认数据库为 `data/app.db`。
- 首次启动自动从 `data/settings.json` 和 `data/cases_state.json` 迁移数据。
- 所有确认/提示弹窗均为应用内样式弹窗，不使用浏览器原生 `alert/confirm/prompt`。

## 技术栈

- Next.js App Router
- React
- TypeScript
- SQLite via `sqlite3`
- lucide-react 图标

## 环境要求

推荐使用 Node.js 20.17 或更新版本。

检查版本：

```powershell
node --version
npm --version
```

## 环境变量

在项目根目录创建 `.env`。`.env` 已被 `.gitignore` 忽略，不会提交到 GitHub。

```env
CSQAQ_API_TOKEN=你的 CSQAQ API Token
SEND_MAIL=发件 QQ 邮箱
SEND_KEY=QQ 邮箱 SMTP 授权码
ACCEPT_MAIL=收件邮箱，多个可用英文逗号或分号分隔
SEND_PORT=465
```

邮件配置等价于：

```json
{
  "email": {
    "enabled": true,
    "smtp_host": "smtp.qq.com",
    "smtp_port": "SEND_PORT",
    "smtp_user": "SEND_MAIL",
    "smtp_password": "SEND_KEY",
    "from_addr": "SEND_MAIL",
    "to_addr": "ACCEPT_MAIL"
  }
}
```

修改 `.env` 后需要重启服务。

## Windows 部署流程

1. 克隆仓库：

```powershell
git clone https://github.com/lin04-24/Price-visualization.git
cd Price-visualization
```

2. 创建 `.env` 并填写上面的环境变量。

3. 安装依赖：

```powershell
npm install
```

如果遇到 npm 缓存目录权限问题：

```powershell
npm install --cache .\.npm-cache
```

4. 构建生产版本：

```powershell
npm run build
```

5. 启动生产服务：

```powershell
npm run start -- --hostname 127.0.0.1 --port 3000
```

局域网访问可改为：

```powershell
npm run start -- --hostname 0.0.0.0 --port 3000
```

访问：

```text
http://127.0.0.1:3000
```

Windows 后台运行示例：

```powershell
Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoExit','-Command','cd "C:\path\to\Price-visualization"; npm run start -- --hostname 0.0.0.0 --port 3000'
```

## Windows 旧版本更新方法

在已有项目目录中执行：

```powershell
cd C:\path\to\Price-visualization
git pull
npm install
npm run build
```

如果使用前台方式启动，停止旧进程后重新运行：

```powershell
npm run start -- --hostname 0.0.0.0 --port 3000
```

如果使用 `Start-Process` 后台运行，先在任务管理器或 PowerShell 中停止旧的 Node.js 进程，再使用原启动命令重新启动。更新前请保留 `.env`、`data/app.db` 以及必要的数据文件。

## Linux 部署流程

1. 安装 Node.js 20+、Git 和构建依赖。Ubuntu/Debian 示例：

```bash
sudo apt update
sudo apt install -y git curl build-essential python3
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version
npm --version
```

2. 克隆仓库：

```bash
git clone https://github.com/lin04-24/Price-visualization.git
cd Price-visualization
```

3. 创建 `.env`：

```bash
nano .env
```

写入 `CSQAQ_API_TOKEN`、`SEND_MAIL`、`SEND_KEY`、`ACCEPT_MAIL`、`SEND_PORT`。

4. 安装依赖并构建：

```bash
npm install
npm run build
```

5. 启动生产服务：

```bash
npm run start -- --hostname 0.0.0.0 --port 3000
```

访问：

```text
http://服务器IP:3000
```

如使用云服务器，请确认安全组/防火墙已放行 3000 端口，或使用 Nginx 反向代理到 127.0.0.1:3000。

## Linux 旧版本更新方法

在已有项目目录中执行：

```bash
cd /opt/Price-visualization
git pull
npm install
npm run build
```

如果使用 systemd：

```bash
sudo systemctl restart price-visualization
sudo systemctl status price-visualization
```

如果使用 PM2：

```bash
pm2 restart price-visualization
pm2 save
```

如果使用 `nohup` 或前台命令，请先停止旧进程，再重新运行启动命令。更新前请保留 `.env`、`data/app.db` 以及必要的数据文件。

## Linux 持久化后台运行方案

### systemd（推荐）

创建服务文件：

```bash
sudo nano /etc/systemd/system/price-visualization.service
```

写入并按实际路径修改 `WorkingDirectory`：

```ini
[Unit]
Description=Price Visualization Next.js Service
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/Price-visualization
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm run start -- --hostname 0.0.0.0 --port 3000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

启用并启动：

```bash
sudo systemctl daemon-reload
sudo systemctl enable price-visualization
sudo systemctl start price-visualization
sudo systemctl status price-visualization
```

查看日志：

```bash
journalctl -u price-visualization -f
```

### PM2

```bash
sudo npm install -g pm2
pm2 start npm --name price-visualization -- run start -- --hostname 0.0.0.0 --port 3000
pm2 save
pm2 startup
```

查看日志：

```bash
pm2 logs price-visualization
```

### nohup（临时方案）

```bash
nohup npm run start -- --hostname 0.0.0.0 --port 3000 > app.log 2>&1 &
```

查看进程：

```bash
ps aux | grep 'next start'
```

## 自动监控与邮件提醒

服务启动后会注册后台任务，每 30 分钟自动执行一次批量查询。自动执行阶段若价格超出用户设置的上下限，会发送邮件提醒，邮件包含：

```text
中文名
ID
英文名
悠悠有品、Steam 市场价格
触发提醒的具体原因
```

手动发送邮箱测试邮件：

```bash
curl -X POST http://127.0.0.1:3000/api/email/test
```

Windows PowerShell：

```powershell
Invoke-WebRequest -Method POST http://127.0.0.1:3000/api/email/test
```

## 数据与迁移

运行时数据库文件：

```text
data/app.db
```

`data/app.db` 是本地运行时数据，不建议提交到 Git。首次启动时，如果数据库还不存在，系统会自动读取：

```text
data/settings.json
data/cases_state.json
```

并迁移到 SQLite。迁移完成后会在 `app_meta` 表写入 `json_migrated_at`，避免重复导入。

如果想重新从 JSON 初始化本地数据，可以停止服务后删除 `data/app.db`，再重新启动服务。

## API

```text
GET    /api/settings
GET    /api/cases/state
GET    /api/uptime
POST   /api/switches
POST   /api/cooldown
POST   /api/cooldown/reset
POST   /api/cases/[caseId]
DELETE /api/cases/[caseId]
POST   /api/cases/[caseId]/cooldown/reset
POST   /api/cases/[caseId]/market-snapshot
GET    /api/csqaq/containers
POST   /api/csqaq/containers
GET    /api/csqaq/containers/lookup?name=...
GET    /api/csqaq/containers/[containerId]/items
GET    /api/csqaq/goods/lookup?name=...
GET    /api/csqaq/goods/[goodId]
POST   /api/csqaq/goods/prices/batch
POST   /api/email/test
```

## 验证命令

```bash
npm run typecheck
npm run build
```

接口验证：

```bash
curl http://127.0.0.1:3000/api/settings
curl -X POST http://127.0.0.1:3000/api/email/test
```

## 常见问题

### CSQAQ 返回 429

这是 CSQAQ 平台频率限制。项目会自动排队、缓存并重试请求；如果仍然返回 429，说明当前 Token 或 IP 仍处在平台限流窗口中，稍后重试即可。

### 收不到 QQ 邮件

确认 QQ 邮箱已开启 SMTP 服务，`SEND_KEY` 使用的是 SMTP 授权码，不是登录密码。常用 `SEND_PORT` 为 `465`。

### 端口 3000 被占用

换一个端口启动：

```bash
npm run start -- --hostname 0.0.0.0 --port 3001
```

### 数据没有按预期迁移

确认 `data/app.db` 是否已经存在。系统只会在首次创建数据库时从 JSON 导入。需要重新导入时，停止服务，删除 `data/app.db`，再重新启动服务。