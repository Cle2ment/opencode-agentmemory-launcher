# OpenCode 的 Agentmemory 启动器

> 一款 OpenCode 插件，可自动启动 [agentmemory](https://github.com/rohitg00/agentmemory) 后端，并通过健康检查进行监督。

[![npm version](https://img.shields.io/npm/v/opencode-agentmemory-launcher)](https://www.npmjs.com/package/opencode-agentmemory-launcher)
[![License](https://img.shields.io/npm/l/opencode-agentmemory-launcher)](./LICENSE)
[![Node.js](https://img.shields.io/node/v/opencode-agentmemory-launcher)](https://nodejs.org/)
[![CI](https://github.com/Cle2ment/opencode-agentmemory-launcher/actions/workflows/ci.yml/badge.svg)](https://github.com/Cle2ment/opencode-agentmemory-launcher/actions/workflows/ci.yml)

[English](/README.md) | [中文](/docs/README.zh.md) | [Français](/docs/README.fr.md)

## 环境要求

- **Node.js** ≥ 18.0.0
- **OpenCode V1** (`opencode` ≥ 1.17.10) 或 **OpenCode V2** (`opencode2`) — 同一个软件包可服务于两种宿主
- **agentmemory** 后端（如果不存在，可通过 `npx @agentmemory/agentmemory` 自动安装）

> **注意：** 该插件仅已在 Windows 11 上测试。如果你需要其他平台的支持，欢迎提交拉取请求。

## 功能简介

当 OpenCode 加载其配置时，该插件会自动启动 [agentmemory](https://github.com/rohitg00/agentmemory) 后端（REST API + iii-engine）。对于每个 OpenCode 进程，它仅运行一次，并每 60 秒对后端执行一次健康检查，若进程终止则自动重启。

## 安装

### 从 npm 安装（推荐）

**OpenCode V1** — 将其添加到你的 `opencode.json`（`plugin`，单数形式）：

```jsonc
{
  "plugin": ["opencode-agentmemory-launcher@latest"]
}
```

**OpenCode V2** — 将其添加到你的配置中（`plugins`，复数形式）：

```jsonc
{
  "plugins": ["opencode-agentmemory-launcher@latest"]
}
```

OpenCode 会在启动时自动安装该软件包。更多详情请参阅 [V1 插件文档](https://opencode.ai/docs/en/plugins/) 或 [V2 插件指南](https://opencode.ai/v2/docs/build/plugins)。

同一软件包通过组合默认导出在两种宿主上运行：V1 调用 `server()`，V2 调用 `setup()`。

### 从本地文件安装

将插件文件放置在 `.opencode/plugins/` 目录中：

```
.opencode/plugins/
└── agentmemory-launcher.ts
```

此目录中的文件会在启动时由 V1 和 V2 自动加载。

### 手动安装（从 GitHub Releases）

1. 从最新的 [GitHub Release](https://github.com/Cle2ment/opencode-agentmemory-launcher/releases) 下载 `agentmemory-launcher.ts`
2. 将其放置在 `.opencode/plugins/` 目录中：

```
.opencode/plugins/
└── agentmemory-launcher.ts
```

OpenCode 会在启动时自动加载 `.opencode/plugins/` 目录中的 `.ts` 文件。

## 使用方法

此启动器用于启动 agentmemory 后端。若要在 OpenCode 中使用 agentmemory，还需要安装 agentmemory 插件，并参阅 [OpenCode agentmemory 插件使用指南](https://github.com/rohitg00/agentmemory/blob/main/plugin/opencode/README.md) 了解设置说明、可用工具及配置选项。

## 更新

将 agentmemory 更新至最新版本：

```bash
npx @agentmemory/agentmemory upgrade
```

更新完成后，停止正在运行的 agentmemory 进程并清除 npx 缓存：

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

重新启动 OpenCode，即可使用更新后的版本重新启动 agentmemory。

## 工作原理

1. **加载时**（V1：首次 `config` 钩子调用 · V2：`setup()`）：插件启动一个健康检查定时器（60 秒）
2. **健康检查**：对后端 `GET /agentmemory/livez` 接口进行 Ping（公共接口，无需身份验证）
3. **自动重启**：若健康检查失败，则派生一个独立进程运行 `npx @agentmemory/agentmemory`
4. **调试模式**：设置 `OPENCODE_AGENTMEMORY_DEBUG=1` 可查看详细日志

## 环境变量

| 变量 | 默认值 | 说明 |
|----------|---------|-------------|
| `AGENTMEMORY_URL` | `http://localhost:3111` | 后端 API URL |
| `OPENCODE_AGENTMEMORY_DEBUG` | 未设置 | 设为 `1` 以启用调试日志 |

## API

该插件采用双轨模块结构：默认导出同时携带两个宿主的入口点，而命名导出则为现有使用者保留了经典的 V1 插件。

```typescript
import type { Plugin } from "@opencode-ai/plugin";

// V1 入口点（命名导出，为向后兼容而保留）
export const AgentmemoryLauncherPlugin: Plugin;

// 组合式双轨默认导出
export default {
  id: "agentmemory-launcher",
  server: AgentmemoryLauncherPlugin, // 由 OpenCode V1 调用
  setup: async (context) => { /* 启动监督；返回清理函数 */ }, // 由 OpenCode V2 调用
};
```

在 V1 上，该插件实现了 `config` 生命周期钩子（每次 OpenCode 加载其配置时调用）以及 `event`/`dispose` 清理逻辑。在 V2 上，当插件加载时，监督在 `setup()` 中启动，返回的清理函数用于停止健康检查循环。

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

[GNU Affero 通用公共许可证 v3.0](./LICENSE)

## 版权

Copyright (C) 2026 Cle2ment.
