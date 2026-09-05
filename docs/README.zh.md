# 用于 OpenCode 的 Agentmemory Launcher

> OpenCode 插件，可自动启动 [agentmemory](https://github.com/rohitg00/agentmemory) 后端，并带有健康检查监督功能。

[![npm version](https://img.shields.io/npm/v/opencode-agentmemory-launcher)](https://www.npmjs.com/package/opencode-agentmemory-launcher)
[![License](https://img.shields.io/npm/l/opencode-agentmemory-launcher)](./LICENSE)
[![Node.js](https://img.shields.io/node/v/opencode-agentmemory-launcher)](https://nodejs.org/)
[![CI](https://github.com/Cle2ment/opencode-agentmemory-launcher/actions/workflows/ci.yml/badge.svg)](https://github.com/Cle2ment/opencode-agentmemory-launcher/actions/workflows/ci.yml)

[English](/README.md) | [中文](/docs/README.zh.md) | [Français](/docs/README.fr.md)

## 环境要求

- **Node.js** ≥ 18.0.0
- **OpenCode V1** (`opencode` ≥ 1.17.10) 或 **OpenCode V2** (`opencode2`) — 同一个包同时适用于两个宿主
- **agentmemory** 后端（如果不存在，将通过 `npx @agentmemory/agentmemory` 自动安装）

> **注意：** 此插件仅在 Windows 11 上测试过。如果您需要其他平台的支持，欢迎提交 pull request。

## 功能说明

此插件会在 OpenCode 加载其配置时自动启动 [agentmemory](https://github.com/rohitg00/agentmemory) 后端（REST API + iii-engine）。它会在每个 OpenCode 进程中运行一次，并每 60 秒对后端执行一次健康检查，如果进程死亡则自动重启。

## 安装

### 从 npm 安装（推荐）

**OpenCode V1** — 添加到您的 `opencode.json`（`plugin`，单数）：

```jsonc
{
  "plugin": ["opencode-agentmemory-launcher@latest"]
}
```

**OpenCode V2** — 添加到您的配置（`plugins`，复数）：

```jsonc
{
  "plugins": ["opencode-agentmemory-launcher@latest"]
}
```

OpenCode 会在启动时自动安装该包。更多详情请参阅 [V1 插件文档](https://opencode.ai/docs/en/plugins/) 或 [V2 插件指南](https://opencode.ai/v2/docs/build/plugins)。

同一个包通过组合默认导出同时运行在两个宿主上：V1 调用 `server()`，V2 调用 `setup()`。

### 从本地文件安装

将插件文件放入 `.opencode/plugins/` 目录：

```
.opencode/plugins/
└── agentmemory-launcher.ts
```

V1 和 V2 都会在启动时自动加载此目录中的文件。

### 手动安装（从 GitHub Releases）

1. 从最新的 [GitHub Release](https://github.com/Cle2ment/opencode-agentmemory-launcher/releases) 下载 `agentmemory-launcher.ts`
2. 将其放入 `.opencode/plugins/` 目录：

```
.opencode/plugins/
└── agentmemory-launcher.ts
```

OpenCode 会在启动时自动加载 `.opencode/plugins/` 目录中的 `.ts` 文件。

## 使用方法

此 launcher 用于启动 agentmemory 后端。要在 OpenCode 中使用 agentmemory，请同时安装 agentmemory 插件，并参阅 [OpenCode agentmemory 插件使用指南](https://github.com/rohitg00/agentmemory/blob/main/plugin/opencode/README.md) 了解设置说明、可用工具和配置选项。

## 日志

后端会在后台静默启动；其输出被捕获到 `~/.agentmemory/agentmemory.log`。该文件会在每次后端启动时被截断，因此不会无限增长。

查看实时日志 — 打印最后 200 行并持续跟踪：

```bash
npx opencode-agentmemory-launcher
```

（如果包已全局安装，也可以使用 `agentmemory-logs`。）

- `agentmemory-logs --tab` — 在新的 Windows Terminal 标签页中打开实时视图
- `agentmemory-logs --lines N` — 更改打印的历史行数
- `agentmemory-logs --no-follow` — 打印日志尾部后退出，不进行持续跟踪

agentmemory 的 Web Viewer 仍可在 http://localhost:3113 访问。

## 更新

要将 agentmemory 更新到最新版本：

```bash
npx @agentmemory/agentmemory upgrade
```

更新后，停止正在运行的 agentmemory 进程并清除 npx 缓存：

**Windows (PowerShell)：**

```powershell
# 停止 agentmemory 进程
Get-Process -Name "node" | Where-Object {
    (Get-CimInstance Win32_Process -Filter "ProcessId = $($_.Id)").CommandLine -match 'agentmemory'
} | Stop-Process -Force

# 清除 npx 缓存
Get-ChildItem "$env:LOCALAPPDATA\npm-cache\_npx" -Directory | Where-Object {
    Test-Path "$($_.FullName)\node_modules\@agentmemory"
} | Remove-Item -Recurse -Force
```

重新启动 OpenCode 以使用更新后的版本重新启动 agentmemory。

## 工作原理

1. **加载时**（V1：首次 `config` 钩子调用 · V2：`setup()`）：插件启动一个健康检查定时器（60 秒）
2. **健康检查**：向后端发送 `GET /agentmemory/livez` 请求（公开接口，无需认证）
3. **自动重启**：如果健康检查失败，则以隐藏后台进程的方式生成 `npx @agentmemory/agentmemory`（输出捕获到 `~/.agentmemory/agentmemory.log`）
4. **调试模式**：设置 `OPENCODE_AGENTMEMORY_DEBUG=1` 以启用详细日志

## 环境变量

| 变量 | 默认值 | 描述 |
|----------|---------|-------------|
| `AGENTMEMORY_URL` | `http://localhost:3111` | 后端 API URL |
| `OPENCODE_AGENTMEMORY_DEBUG` | 未设置 | 设置为 `1` 以启用调试日志 |

## API

该插件提供双轨模块：默认导出同时包含两个宿主的入口点，命名导出则为现有使用者保留经典 V1 插件接口。

```typescript
import type { Plugin } from "@opencode-ai/plugin";

// V1 入口点（命名导出，为向后兼容保留）
export const AgentmemoryLauncherPlugin: Plugin;

// 组合式双轨默认导出
export default {
  id: "agentmemory-launcher",
  server: AgentmemoryLauncherPlugin, // 由 OpenCode V1 调用
  setup: async (context) => { /* 启动监督；返回清理函数 */ }, // 由 OpenCode V2 调用
};
```

在 V1 上，插件实现 `config` 生命周期钩子（每次 OpenCode 加载配置时调用）以及 `event`/`dispose` 清理逻辑。在 V2 上，当插件加载时，监督在 `setup()` 中启动，返回的清理函数用于停止健康检查循环。

## 开发

```bash
# 安装依赖
npm install

# 类型检查
npm run typecheck

# 构建
npm run build

# 运行测试
npm test
```

## 社区

- [贡献指南](./CONTRIBUTING.md)
- [行为准则](./CODE_OF_CONDUCT.md)
- [安全策略](./SECURITY.md)

## 许可证

[GNU Affero General Public License v3.0](./LICENSE)

## 版权

版权所有 (C) 2026 Cle2ment。
