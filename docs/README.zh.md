# Agentmemory Launcher for OpenCode

> OpenCode plugin，用于自动启动 [agentmemory](https://github.com/rohitg00/agentmemory) 后端，并带有健康检查监控。

[![npm version](https://img.shields.io/npm/v/opencode-agentmemory-launcher)](https://www.npmjs.com/package/opencode-agentmemory-launcher)
[![License](https://img.shields.io/npm/l/opencode-agentmemory-launcher)](./LICENSE)
[![Node.js](https://img.shields.io/node/v/opencode-agentmemory-launcher)](https://nodejs.org/)
[![CI](https://github.com/Cle2ment/opencode-agentmemory-launcher/actions/workflows/ci.yml/badge.svg)](https://github.com/Cle2ment/opencode-agentmemory-launcher/actions/workflows/ci.yml)

[English](/README.md) | [中文](/docs/README.zh.md) | [Français](/docs/README.fr.md)

## 环境要求

- **OpenCode V2** (`opencode2`)
- **Node.js** ≥ 18.0.0
- **agentmemory** 后端（如果不存在，会通过 `npx @agentmemory/agentmemory` 自动安装）

> **V1 用户：** 从 v4.0.0 起，不再支持 OpenCode V1（`opencode` 1.x）——如果你仍需要 V1，请锁定 `opencode-agentmemory-launcher@^3`。

> **注意：** 此 plugin 仅在 Windows 11 上测试过。如果你需要支持其他平台，欢迎提交 pull request。

## 功能说明

此 plugin 会在 OpenCode 加载其配置时自动启动 [agentmemory](https://github.com/rohitg00/agentmemory) 后端（REST API + iii-engine）。它每个 OpenCode 进程只运行一次，并每 60 秒对后端进行一次健康检查，如果进程死亡则将其重启。

## 安装

### 从 npm 安装（推荐）

添加到你的 OpenCode 配置中（`plugins`，复数）：

```jsonc
{
  "plugins": ["opencode-agentmemory-launcher@latest"]
}
```

OpenCode 会在启动时自动安装该 package。更多详情请参阅 [V2 plugins 指南](https://opencode.ai/v2/docs/build/plugins)。

### 从本地文件安装

将 plugin 文件放入 `.opencode/plugins/`：

```
.opencode/plugins/
└── agentmemory-launcher.ts
```

此目录中的文件会在启动时自动加载。

### 手动安装（从 GitHub Releases）

1. 从最新的 [GitHub Release](https://github.com/Cle2ment/opencode-agentmemory-launcher/releases) 下载 `agentmemory-launcher.ts`
2. 将其放入 `.opencode/plugins/`：

```
.opencode/plugins/
└── agentmemory-launcher.ts
```

OpenCode 会在启动时自动从 `.opencode/plugins/` 加载 `.ts` 文件。

## 使用方法

此 launcher 会启动 agentmemory 后端。若要将 agentmemory 与 OpenCode 搭配使用，还需要安装 agentmemory plugin，并参考 [OpenCode agentmemory plugin 使用指南](https://github.com/rohitg00/agentmemory/blob/main/plugin/opencode/README.md)获取设置说明、可用工具和配置选项。

## 更新

要将 agentmemory 更新到最新版本：

```bash
npx @agentmemory/agentmemory upgrade
```

更新后，停止正在运行的 agentmemory 进程并清除 npx 缓存：

**Windows (PowerShell)：**

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

重启 OpenCode，以使用更新后的版本重新启动 agentmemory。

## 工作原理

1. **加载时**（`setup()`）：plugin 启动一个健康检查间隔（60 秒）
2. **健康检查**：对后端 ping `GET /agentmemory/livez`（公开，无需认证）
3. **自动重启**：如果健康检查失败，则以分离方式启动 agentmemory CLI。在 Windows 上，plugin 完全绕过 npx/cmd —— 它从 npx 缓存中解析 `dist/cli.mjs`，并直接在其上启动 `node`，这样进程树（node → cli.mjs → iii.exe）永远不会触及 cmd.exe，也永远不会分配控制台：不会弹出终端窗口/标签页，也不会抢占焦点（单纯的 `windowsHide` 不够，因为每一次 cmd.exe 跳转都会让孙进程分配一个新的控制台）。当缓存为冷启动时，回退到 npx 启动。重新启动受到 90 秒启动宽限窗口以及跨实例启动锁的节流限制（多个 OpenCode server 共享同一个后端）
4. **调试模式**：设置 `OPENCODE_AGENTMEMORY_DEBUG=1` 以输出详细日志

## 环境变量

| 变量 | 默认值 | 描述 |
|----------|---------|-------------|
| `AGENTMEMORY_URL` | `http://localhost:3111` | 后端 API URL |
| `OPENCODE_AGENTMEMORY_DEBUG` | 未设置 | 设置为 `1` 以启用调试日志 |

## API

此 plugin 面向 OpenCode V2 plugin API（`@opencode/plugin` >= 2.0.18）。监控会在 plugin 加载时的 `setup()` 中启动，返回的清理函数会在卸载时停止健康检查循环。

```typescript
import type { Plugin } from "@opencode/plugin";

const plugin: Plugin = {
  id: "agentmemory-launcher",
  setup: async (ctx) => {
    // start supervision; return cleanup
  },
};

export default plugin;
```

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
