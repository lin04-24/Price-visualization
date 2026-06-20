# Price Visualization

Steam 市场情报站配置管理面板。项目已迁移为 Next.js App Router 架构，前端使用 React 组件实现，后端接口使用 Next Route Handlers，配置数据存储在本地 SQLite 数据库中。

## 功能概览

- 武器箱配置管理：新增、编辑、删除、启用/禁用监控，并可点击武器箱查看饰品市场详情。
- 全局开关配置：BUFF / 悠悠有品、Steam、涨跌幅监控。
- CSQAQ 接入：每天自动同步武器箱/收藏品总览到 SQLite；添加时支持输入残缺名称选择候选，再查询 good_id，并展示当前饰品在网易 BUFF、悠悠有品、Steam 市场的在售价；服务端对外部 API 做短缓存、串行节流与 429 重试。
- 冷却期配置：按不同规则设置冷却天数，并支持一键重置。
- 抓取配置：执行间隔、页面超时；抓取固定为单线程，不并发。
- 本地 SQLite 持久化：默认数据库为 `data/app.db`。
- 首次启动自动从 `data/settings.json` 和 `data/cases_state.json` 迁移数据。

## 技术栈

- Next.js App Router
- React
- TypeScript
- SQLite via `sqlite3`
- lucide-react 图标

## 环境要求

推荐使用 Node.js 20.17 或更新版本。本项目使用 `sqlite3` 持久化本地数据，不再依赖 Node.js 内置实验性 `node:sqlite`。

检查版本：

```powershell
node --version
npm --version
```

## 环境变量

项目通过 CSQAQ API 查询饰品 good_id 和单件饰品市场价格。请在项目根目录创建 `.env`：

```powershell
CSQAQ_API_TOKEN=你的 CSQAQ API Token
```

`.env` 已被 `.gitignore` 忽略，不会提交到 GitHub。修改环境变量后需要重新启动 Next.js 服务。

注意：CSQAQ 单件详情接口需要饰品 `good_id`，不是武器箱/收藏品 ID。旧配置如果保存过收藏品 ID，请在添加/编辑弹窗中输入饰品中文名并点击“查询饰品ID”重新填入。

收藏品总览会缓存在 SQLite 表 `csqaq_containers` 中。服务启动后会启动后台检查任务，每小时检查一次，超过 24 小时会自动调用 CSQAQ `container_data_info` 刷新；添加饰品时输入 2 个以上字符也会触发缓存检查。也可以手动刷新：

```powershell
Invoke-WebRequest -Method POST http://127.0.0.1:3000/api/csqaq/containers
```

CSQAQ 查询在服务端有保护层：请求会串行排队并保持约 1.2 秒间隔；饰品名称查询缓存 10 分钟，饰品详情缓存 5 分钟；遇到 HTTP 429 会按退避策略最多重试 3 次。如果 API Token 已经进入平台限流窗口，接口会返回 429 和“请求过于频繁，请稍后再试”的提示，等待一段时间后再操作即可。

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
GET    /api/csqaq/containers
POST   /api/csqaq/containers
GET    /api/csqaq/containers/lookup?name=...
GET    /api/csqaq/containers/[containerId]/items
GET    /api/csqaq/goods/lookup?name=...
GET    /api/csqaq/goods/[goodId]
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

### CSQAQ 返回 429

这是 CSQAQ 平台的频率限制。项目会自动排队、缓存并重试请求；如果仍然返回 429，说明当前 Token 或 IP 仍处在平台限流窗口中，稍后重试即可。已保存的数字 good_id 会直接查询详情，不会重复做名称匹配，能减少连续请求。

### 数据没有按预期迁移

确认 `data/app.db` 是否已经存在。系统只会在首次创建数据库时从 JSON 导入。需要重新导入时，停止服务，删除 `data/app.db`，再重新启动服务。

