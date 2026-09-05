# 用于 OpenCode 的 Agentmemory Launcher

> 一个 OpenCode plugin，可自动启动 [agentmemory](https://github.com/rohitg00/agentmemory) 后端并进行健康检查守护。

[![npm version](https://img.shields.io/npm/v/opencode-agentmemory-launcher)](https://www.npmjs.com/package/opencode-agentmemory-launcher)
[![License](https://img.shields.io/npm/l/opencode-agentmemory-launcher)](./LICENSE)
[![Node.js](https://img.shields.io/node/v/opencode-agentmemory-launcher)](https://nodejs.org/)
[![CI](https://github.com/Cle2ment/opencode-agentmemory-launcher/actions/workflows/ci.yml/badge.svg)](https://github.com/Cle2ment/opencode-agentmemory-launcher/actions/workflows/ci.yml)

[English](/README.md) | [中文](/docs/README.zh.md) | [Français](/docs/README.fr.md)

## 环境要求

- **Node.js** ≥ 18.0.0
- **OpenCode V1** (`opencode` ≥ 1.17.10) 或 **OpenCode V2** (`opencode2`) — 同一个包同时支持两种宿主环境
- **agentmemory** 后端（如果不存在，将自动通过 `npx @agentmemory/agentmemory` 安装）

> **注意：** 此 plugin 仅在 Windows 11 上测试过。如果你需要其他平台的支持，欢迎提交 pull request。

## 功能说明

当 OpenCode 加载配置时，此 plugin 会自动启动 [agentmemory](https://github.com/rohitg00/agentmemory) 后端（REST API + iii-engine）。它会在每个 OpenCode 进程中运行一次，并每 60 秒对后端执行一次健康检查；如果进程终止，则将其重新启动。

## 安装

### 从 npm 安装（推荐）

**OpenCode V1** — 在 `opencode.json` 中添加（`plugin`，单数）：

```jsonc
{
  "plugin": ["opencode-agentmemory-launcher@latest"]
}
```

**OpenCode V2** — 在你的配置中添加（`plugins`，复数）：

```jsonc
{
  "plugins": ["opencode-agentmemory-launcher@latest"]
}
```

OpenCode 会在启动时自动安装该包。更多详细信息，请参阅 [V1 plugins 文档](https://opencode.ai/docs/en/plugins/) 或 [V2 plugins 指南](https://opencode.ai/v2/docs/build/plugins)。

同一个包通过合并的默认导出同时兼容两种宿主环境：V1 调用 `server()`，V2 调用 `setup()`。

### 从本地文件安装

将 plugin 文件放在 `.opencode/plugins/` 目录中：

```
.opencode/plugins/
└── agentmemory-launcher.ts
```

V1 和 V2 都会在启动时自动加载该目录中的文件。

### 手动安装（通过 GitHub Releases）

1. 从最新的 [GitHub Release](https://github.com/Cle2ment/opencode-agentmemory-launcher/releases) 下载 `agentmemory-launcher.ts`
2. 将其放到 `.opencode/plugins/` 目录中：

```
.opencode/plugins/
└── agentmemory-launcher.ts
```

OpenCode 会在启动时自动加载 `.opencode/plugins/` 目录中的 `.ts` 文件。

## 使用方法

该 launcher 会启动 agentmemory 后端。要在 OpenCode 中使用 agentmemory，还需要安装 agentmemory plugin，并参阅 [OpenCode agentmemory plugin 使用指南](https://github.com/rohitg00/agentmemory/blob/main/plugin/opencode/README.md) 以了解设置说明、可用工具和配置选项。

## 更新

要将 agentmemory 更新到最新版本：

```bash
npx @agentmemory/agentmemory upgrade
```

更新后，停止正在运行的 agentmemory 进程并清除 npx 缓存：

**Windows (PowerShell):**

```powershell
# Stop the agentmemory process
Get-Process -Name "node" | Where-Object {
    (Get-CimInstance Win32_Process -Filter "ProcessId = $($_.Id)").CommandLine -match 'agentmemory'
} | Stop-Process -Force

# Clear the npx cache
Get-ChildItem "$env:LOCALAPPDATA\npm-cache\_npx" -Directory | Where-Object {
    Test-Path "$($_.FullName)\node_modules\@agentmemory"
} | Remove-Item -Recurse -Force
```

重启 OpenCode，即可使用更新后的版本重新启动 agentmemory。

## 工作原理

1. **加载时**（V1：首次 `config` 钩子调用 · V2：`setup()`）：plugin 启动一个健康检查定时器（60 秒）
2. **健康检查**：向后端的 `GET /agentmemory/livez` 发送 ping（公开接口，无需认证）
3. **自动重启**：如果健康检查失败，则在独立进程中启动 `npx @agentmemory/agentmemory`
4. **调试模式**：设置 `OPENCODE_AGENTMEMORY_DEBUG=1` 可启用详细日志

## 环境变量

| 变量 | 默认值 | 说明 |
|----------|---------|-------------|
| `AGENTMEMORY_URL` | `http://localhost:3111` | 后端 API URL |
| `OPENCODE_AGENTMEMORY_DEBUG` | 未设置 | 设置为 `1` 可启用调试日志 |

## API

该 plugin 采用双轨模块结构：默认导出同时包含两种宿主的入口点，而命名导出则为现有使用者保留了经典 V1 plugin。

```typescript
import type { Plugin } from "@opencode-ai/plugin";

// V1 entrypoint (named export, kept for back-compat)
export const AgentmemoryLauncherPlugin: Plugin;

// Combined dual-track default export
export default {
  id: "agentmemory-launcher",
  server: AgentmemoryLauncherPlugin, // called by OpenCode V1
  setup: async (context) => { /* start supervision; return cleanup */ }, // called by OpenCode V2
};
```

在 V1 中，plugin 实现 `config` 生命周期钩子（OpenCode 每次加载配置时都会调用它），并通过 `event`/`dispose` 进行清理。在 V2 中，plugin 在加载时通过 `setup()` 启动守护逻辑，返回的清理函数会停止健康检查循环。

## 开发

```bash
# Install dependencies
npm install

# Type-check
npm run typecheck

# Build
npm run build

# Run tests
npm test
```

## 社区

- [贡献指南](./CONTRIBUTING.md)
- [行为准则](./CODE_OF_CONDUCT.md)
- [安全策略](./SECURITY.md)

## 许可证

[GNU Affero General Public License v3.0](./LICENSE)

## 版权

Copyright (C) 2026 Cle2ment.
