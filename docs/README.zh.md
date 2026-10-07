# OpenCode 的 Agentmemory Launcher

> OpenCode plugin，可自动启动 [agentmemory](https://github.com/rohitg00/agentmemory) 后端，并带有健康检查监控。

[![npm version](https://img.shields.io/npm/v/opencode-agentmemory-launcher)](https://www.npmjs.com/package/opencode-agentmemory-launcher)
[![License](https://img.shields.io/npm/l/opencode-agentmemory-launcher)](./LICENSE)
[![Node.js](https://img.shields.io/node/v/opencode-agentmemory-launcher)](https://nodejs.org/)
[![CI](https://github.com/Cle2ment/opencode-agentmemory-launcher/actions/workflows/ci.yml/badge.svg)](https://github.com/Cle2ment/opencode-agentmemory-launcher/actions/workflows/ci.yml)

[English](/README.md) | [中文](/docs/README.zh.md) | [Français](/docs/README.fr.md)

## 要求

- **OpenCode V2**（`opencode2`）
- 插件本身要求 **Node.js** ≥ 18.0.0；agentmemory 0.9.30 后端要求 **Node.js ≥ 20.0.0**
- **agentmemory** 后端（若不存在则通过 `npx @agentmemory/agentmemory` 自动安装）

> **V1 用户：** 自 v4.0.0 起不再支持 OpenCode V1（`opencode` 1.x）——如果你仍需要 V1，请固定使用 `opencode-agentmemory-launcher@^3`。

> **注意：** 此插件仅在 Windows 11 上测试过。如果你需要其他平台的支持，欢迎提交 pull request。

## 功能说明

此插件会在 OpenCode 加载其配置时自动启动 [agentmemory](https://github.com/rohitg00/agentmemory) 后端（REST API + iii-engine）。每个 OpenCode 进程仅运行一次，并每 60 秒对后端进行健康检查，如果进程死亡则重启它。

## 兼容性

专为 **agentmemory 0.9.30**（2026-10-06）构建，并向后兼容更早的版本：

- **默认开启认证。** agentmemory 在首次启动时会生成一个 secret 到 `~/.agentmemory/secret`。该 launcher 仅调用始终公开的 `/agentmemory/livez`，因此无需 secret 且不受影响。现在手写对 `:3111` 的 REST 调用需要 `Authorization: Bearer $(cat ~/.agentmemory/secret)`。
- **iii-engine 0.22.1。** agentmemory 0.9.30 将其 engine pin 从 `0.11.2` 移至 `0.22.1` 并强制执行。该 launcher 不管理 engine（由 agentmemory CLI 管理），但 pin 不匹配现在会导致 CLI 以退出码 1 退出——launcher 会将其作为 `warn` 呈现。
- **最新版本优先。** 在 Windows 上，该 launcher 会启动它在 npx cache **或 `PATH` 上的全局安装** 中找到的最新 agentmemory，因此 `npm i -g @agentmemory/agentmemory@latest` 无需清除 npx cache 即可生效。

## 安装

### 从 npm 安装（推荐）

添加到你的 OpenCode 配置中（`plugins`，复数）：

```jsonc
{
  "plugins": ["opencode-agentmemory-launcher@latest"]
}
```

OpenCode 将在启动时自动安装该包。详情请参阅 [V2 plugins 指南](https://opencode.ai/v2/docs/build/plugins)。

### 从本地文件安装

将插件文件放入 `.opencode/plugins/`：

```
.opencode/plugins/
└── agentmemory-launcher.ts
```

此目录中的文件将在启动时自动加载。

### 手动安装（从 GitHub Releases）

1. 从最新的 [GitHub Release](https://github.com/Cle2ment/opencode-agentmemory-launcher/releases) 下载 `agentmemory-launcher.ts`
2. 将其放入 `.opencode/plugins/`：

```
.opencode/plugins/
└── agentmemory-launcher.ts
```

OpenCode 会在启动时自动从 `.opencode/plugins/` 加载 `.ts` 文件。

## 用法

此 launcher 启动 agentmemory 后端。要将 agentmemory 与 OpenCode 配合使用，还需安装 agentmemory 插件，并参阅 [OpenCode agentmemory 插件使用指南](https://github.com/rohitg00/agentmemory/blob/main/plugin/opencode/README.md) 了解设置说明、可用工具和配置选项。

## 更新

将 agentmemory 更新到最新版本：

```bash
npx @agentmemory/agentmemory upgrade
```

如果你全局安装了 agentmemory，请改用 `npm i -g @agentmemory/agentmemory@latest` 更新该副本——launcher 会从 npx cache 和全局安装中选择最新版本。

更新后，停止正在运行的 agentmemory 进程并清除 npx cache：

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

重启 OpenCode，即可使用更新后的版本重新启动 agentmemory。

## 工作原理

1. **加载时**（`setup()`）：插件启动一个健康检查间隔（60 秒）
2. **健康检查**：对后端 ping `GET /agentmemory/livez`（始终公开，无需认证——即使 agentmemory 0.9.30 默认开启认证）
3. **自动重启**：如果健康检查失败，则以分离模式 spawn agentmemory CLI。在 Windows 上，插件完全绕过 npx/cmd——它会解析在 npx cache 或 `PATH` 上的全局安装中找到的**最新** `dist/cli.mjs`，并直接在它上面 spawn `node`，因此进程树（node → cli.mjs → iii.exe）永远不会触及 cmd.exe，也永远不分配控制台：不会弹出终端窗口/标签页，也不会抢占焦点（仅使用 `windowsHide` 是不够的，因为每一次 cmd.exe 跳转都会让孙进程分配一个新控制台）。当找不到本地副本时，回退到 npx spawn。重启受 90 秒启动宽限期以及跨实例启动锁的限制（多个 OpenCode 服务器共享一个后端）
4. **调试模式**：设置 `OPENCODE_AGENTMEMORY_DEBUG=1` 以启用详细日志记录
5. **故障诊断**：以非零退出码退出的后端启动会以 `warn` 级别记录——例如当 agentmemory 0.9.30 因 iii-engine pin 不匹配而拒绝并以退出码 1 退出时

## 环境变量

| 变量 | 默认值 | 描述 |
|----------|---------|-------------|
| `AGENTMEMORY_URL` | `http://localhost:3111` | 后端 API URL |
| `OPENCODE_AGENTMEMORY_DEBUG` | 未设置 | 设置为 `1` 以启用调试日志记录 |

## 故障排查

**后端始终无法启动，且日志显示非零启动退出。**
agentmemory 0.9.30 强制执行其 iii-engine pin（v0.22.1）。如果 `PATH` 上有不同的 engine，CLI 会以退出码 1 退出。手动运行它以查看错误：

```bash
npx @agentmemory/agentmemory doctor
```

**已安装更新的 agentmemory，但 launcher 仍在运行旧版本。**
launcher 会优先选择 npx cache 和全局安装中的最新版本；如果旧副本仍然胜出，请清除 cache：

```bash
npx clear-npx-cache
```

## API

该插件面向 OpenCode V2 插件 API（`@opencode/plugin` >= 2.0.18）。监控在插件加载时于 `setup()` 中启动，返回的 cleanup 函数会在卸载时停止健康检查循环。

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
- [安全政策](./SECURITY.md)

## 许可证

[GNU Affero General Public License v3.0](./LICENSE)

## 版权

Copyright (C) 2026 Cle2ment.
