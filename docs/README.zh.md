# 适用于 OpenCode 的 Agentmemory 启动器

> 自动启动 [agentmemory](https://github.com/rohitg00/agentmemory) 后端并进行健康检查监控的 OpenCode 插件。

[![npm version](https://img.shields.io/npm/v/opencode-agentmemory-launcher)](https://www.npmjs.com/package/opencode-agentmemory-launcher)
[![License](https://img.shields.io/npm/l/opencode-agentmemory-launcher)](./LICENSE)
[![Node.js](https://img.shields.io/node/v/opencode-agentmemory-launcher)](https://nodejs.org/)
[![CI](https://github.com/Cle2ment/opencode-agentmemory-launcher/actions/workflows/ci.yml/badge.svg)](https://github.com/Cle2ment/opencode-agentmemory-launcher/actions/workflows/ci.yml)

[English](/README.md) | [中文](/docs/README.zh.md) | [Français](/docs/README.fr.md)

## 环境要求

- **OpenCode V2**（`opencode2`）
- 插件本身需要 **Node.js** ≥ 18.0.0；agentmemory 0.9.30 后端需要 **Node.js ≥ 20.0.0**
- **agentmemory** 后端（若未安装，可通过 `npx @agentmemory/agentmemory` 自动安装）

> **V1 用户：** 自 v4.0.0 起不再支持 OpenCode V1（`opencode` 1.x）——如果你仍需使用 V1，请固定版本到 `opencode-agentmemory-launcher@^3`。

> **注意：** 本插件仅在 Windows 11 上测试过。如果你需要支持其他平台，欢迎提交 pull request。

## 功能说明

当 OpenCode 加载其配置时，本插件会自动启动 [agentmemory](https://github.com/rohitg00/agentmemory) 后端（REST API + iii-engine）。它每个 OpenCode 进程只运行一次，并每 60 秒对后端进行一次健康检查，若进程挂掉则重启它。

## 兼容性

针对 **agentmemory 0.9.30**（2026-10-06）构建，并向后兼容更早的版本：

- **默认开启鉴权。** agentmemory 在首次启动时会向 `~/.agentmemory/secret` 生成一个密钥。启动器只调用始终公开的 `/agentmemory/livez`，因此无需密钥，也不受影响。现在对手写发往 `:3111` 的 REST 调用需要 `Authorization: Bearer $(cat ~/.agentmemory/secret)`。
- **iii-engine 0.22.1。** agentmemory 0.9.30 将其引擎固定版本从 `0.11.2` 升级到 `0.22.1` 并强制执行。启动器不管理引擎（由 agentmemory CLI 管理），但版本不匹配现在会导致 CLI 以退出码 1 退出——启动器会以 `warn` 级别揭示该情况。
- **最新版本优先。** 在 Windows 上，启动器会启动它在 npx 缓存**或 `PATH` 上的全局安装**中找到的最新 agentmemory，因此 `npm i -g @agentmemory/agentmemory@latest` 会立即生效，无需清除 npx 缓存。

## 安装

### 从 npm 安装（推荐）

添加到你的 OpenCode 配置（`plugins`，复数）：

```jsonc
{
  "plugins": ["opencode-agentmemory-launcher@latest"]
}
```

OpenCode 会在启动时自动安装该包。更多详情请参阅 [V2 插件指南](https://opencode.ai/v2/docs/build/plugins)。

### 从本地文件安装

将插件文件放入 `.opencode/plugins/`：

```
.opencode/plugins/
└── agentmemory-launcher.ts
```

该目录中的文件会在启动时自动加载。

### 手动安装（从 GitHub Releases）

1. 从最新的 [GitHub Release](https://github.com/Cle2ment/opencode-agentmemory-launcher/releases) 下载 `agentmemory-launcher.ts`
2. 将其放入 `.opencode/plugins/`：

```
.opencode/plugins/
└── agentmemory-launcher.ts
```

OpenCode 会在启动时自动从 `.opencode/plugins/` 加载 `.ts` 文件。

## 使用

本启动器负责启动 agentmemory 后端。若要在 OpenCode 中使用 agentmemory，还需安装 agentmemory 插件，并参阅 [OpenCode agentmemory 插件使用指南](https://github.com/rohitg00/agentmemory/blob/main/plugin/opencode/README.md)以了解设置说明、可用工具和配置选项。

## 更新

要将 agentmemory 更新到最新版本：

```bash
npx @agentmemory/agentmemory upgrade
```

如果你全局安装了 agentmemory，则改用 `npm i -g @agentmemory/agentmemory@latest` 更新该副本——启动器会在 npx 缓存和全局安装中选取最新版本。

更新后，停止正在运行的 agentmemory 进程并清除 npx 缓存：

**Windows（PowerShell）：**

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

1. **加载时**（`setup()`）：插件启动一个健康检查定时器（60 秒）
2. **健康检查**：对后端的 `GET /agentmemory/livez` 进行 ping（该端点始终公开、无需鉴权——即便在 agentmemory 0.9.30 默认开启鉴权的情况下也是如此）
3. **自动重启（两种模式）**：如果健康检查失败，则启动后端。
   - **启动**（插件加载时后端已下线）：打开一个标题为 `agentmemory` 的可见 Windows Terminal 标签页（`wt -w 0 nt --title agentmemory --suppressApplicationTitle node <cli>`）——由 Windows Terminal 自行启动 `node`，因此不涉及 cmd/pwsh shell。后端启动过程可见；仅在此处获取一次焦点——这在启动时可接受，且绝不会发生在恢复路径上。当 `wt.exe` 不可用时回退到静默路径。
   - **恢复**（之后每次由 60 秒循环触发的（重新）启动）：完全静默。在 Windows 上，插件完全绕过 npx/cmd——它会在 npm/npx 缓存或 `PATH` 上的全局安装中找到**最新**的 `dist/cli.mjs`，并直接在其上生成 `node`，因此进程树（node → cli.mjs → iii.exe）绝不触及 cmd.exe，也绝不分配控制台：无论是会话中途还是空闲时，都不会有窗口/标签页，也不会抢占焦点（仅靠 `windowsHide` 是不够的，因为每一次 cmd.exe 跳转都会让孙进程分配新的控制台）。当找不到本地副本时，回退到 npx 生成。重启会受到 90 秒启动宽限期以及跨实例启动锁的限制（多个 OpenCode 服务器共享一个后端）
4. **调试模式**：设置 `OPENCODE_AGENTMEMORY_DEBUG=1` 以启用详细日志
5. **失败诊断**：以非零退出码退出的后端启动会以 `warn` 级别记录，并附带可能的原因——已有守护进程在端口上应答（agentmemory 0.9.30 拒绝启动第二个实例），或强制执行的 iii-engine 固定版本不匹配。一个可见的启动标签页，若其进程以非零退出码退出，会保持打开（Windows Terminal 的 `closeOnExit: graceful`），以便错误文本仍然可读

## 环境变量

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENTMEMORY_URL` | `http://localhost:3111` | 后端 API URL |
| `OPENCODE_AGENTMEMORY_DEBUG` | unset | 设置为 `1` 以启用调试日志 |

## 故障排查

**后端始终无法启动，且日志显示启动退出码非零。**
两个常见原因：agentmemory 0.9.30 强制其 iii-engine 固定版本（v0.22.1），因此 `PATH` 上不同的引擎会导致 CLI 以退出码 1 退出；或者一个陈旧的实例仍占用着端口。手动运行它以查看实际错误：

```bash
npx @agentmemory/agentmemory doctor
```

**一个可见的启动标签页显示 `agentmemory worker did not become ready within 15s` 并以退出码 1 退出。**
来自早前会话的陈旧实例仍占用着 REST 端口，因此新的 CLI 会启动其引擎，但它的 worker 注册始终无法就绪——而健康的全新启动约 2 秒即可完成。诊断并重启整条链路（切勿只杀死单个 worker 进程：它可能是当前活跃的路由处理器，杀死它会让 `/agentmemory/livez` 返回 404）：

```powershell
Get-NetTCPConnection -LocalPort 3111 -State Listen   # who owns the port
npx @agentmemory/agentmemory stop                     # stop the instance it belongs to
# if that leaves the port held, stop the engine + worker pair together and
# let the launcher's supervision loop relaunch them (~60s, silently)
```

**安装了更新的 agentmemory，但启动器仍运行旧版本。**
启动器会在 npx 缓存和全局安装中优先选取最新版本；如果陈旧副本仍然胜出，请清除缓存：

```bash
npx clear-npx-cache
```

## API

本插件针对 OpenCode V2 插件 API（`@opencode/plugin` >= 2.0.18）。监控在插件加载时的 `setup()` 中启动，返回的清理函数会在卸载时停止健康检查循环。

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
