# Price Visualization

Steam 市场情报站配置管理面板。项目已迁移为 Next.js App Router 架构，前端使用 React 组件实现，后端接口使用 Next Route Handlers，配置数据存储在本地 SQLite 数据库中。

## 功能概览

- 武器箱配置管理：新增、编辑、删除、启用/禁用监控。
- 全局开关配置：BUFF / 悠悠有品、Steam、涨跌幅监控。
- 冷却期配置：按不同规则设置冷却天数，并支持一键重置。
- 抓取配置：执行间隔、页面超时；抓取固定为单线程，不并发。
- 本地 SQLite 持久化：默认数据库为 `data/app.db`。
- 首次启动自动从 `data/settings.json` 和 `data/cases_state.json` 迁移数据。

## 技术栈

- Next.js App Router
- React
- TypeScript
- SQLite via Node.js `node:sqlite`
- lucide-react 图标

## 环境要求

推荐使用 Node.js 25 或更新版本。本项目使用 Node.js 内置 `node:sqlite`，在当前环境 Node `25.0.0` 下已通过构建和运行验证。

检查版本：

```powershell
node --version
npm --version
```

## 本地开发部署

1. 克隆仓库：

```powershell
git clone https://github.com/lin04-24/Price-visualization.git
cd Price-visualization
```

2. 安装依赖：

```powershell
npm install
```

如果 Windows 上遇到 npm 默认缓存目录权限问题，可以把缓存放到项目目录：

```powershell
npm install --cache .\.npm-cache
```

3. 启动开发服务：

```powershell
npm run dev -- --hostname 127.0.0.1 --port 3000
```

4. 打开浏览器访问：

```text
http://127.0.0.1:3000
```

## 生产部署

1. 安装依赖：

```powershell
npm install
```

2. 构建项目：

```powershell
npm run build
```

3. 启动生产服务：

```powershell
npm run start -- --hostname 127.0.0.1 --port 3000
```

如果需要局域网内其他设备访问，把 hostname 改成 `0.0.0.0`：

```powershell
npm run start -- --hostname 0.0.0.0 --port 3000
```

然后访问服务器 IP：

```text
http://服务器IP:3000
```

## Windows 后台运行示例

开发环境可以打开一个独立 PowerShell 窗口保持服务运行：

```powershell
Start-Process powershell -ArgumentList '-NoExit','-Command','cd "F:\1\cs"; npm run dev -- --hostname 127.0.0.1 --port 3000'
```

生产环境建议使用系统服务、计划任务或进程管理工具托管。最小命令如下：

```powershell
npm run build
npm run start -- --hostname 127.0.0.1 --port 3000
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

如果想重新从 JSON 初始化一份本地数据，可以停止服务后删除 `data/app.db`，再重新启动服务。

## API

页面使用以下本地接口：

```text
GET    /api/settings
GET    /api/cases/state
GET    /api/uptime
POST   /api/switches
POST   /api/cooldown
POST   /api/cooldown/reset
POST   /api/scrape
POST   /api/cases/[caseId]
DELETE /api/cases/[caseId]
POST   /api/cases/[caseId]/cooldown/reset
```

## 验证命令

类型检查：

```powershell
npm run typecheck
```

生产构建：

```powershell
npm run build
```

接口验证示例：

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3000/api/settings
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3000/api/uptime
```

## 常见问题

### npm install 提示 npm-cache 权限不足

使用项目内缓存目录：

```powershell
npm install --cache .\.npm-cache
```

### 端口 3000 被占用

换一个端口启动：

```powershell
npm run dev -- --hostname 127.0.0.1 --port 3001
```

### 看到 node:sqlite ExperimentalWarning

这是 Node.js 对内置 SQLite API 的实验特性提示。在 Node `25.0.0` 下，本项目已经通过 `typecheck`、`build` 和接口冒烟测试。警告不会影响本地运行。

### 数据没有按预期迁移

确认 `data/app.db` 是否已经存在。系统只会在首次创建数据库时从 JSON 导入。需要重新导入时，停止服务，删除 `data/app.db`，再重新启动服务。
