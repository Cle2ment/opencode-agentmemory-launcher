# OpenCode 的 Agentmemory 启动器

> OpenCode plugin，可自动启动 [agentmemory](https://github.com/rohitg00/agentmemory) 后端，并带有健康检查监控。

[![npm version](https://img.shields.io/npm/v/opencode-agentmemory-launcher)](https://www.npmjs.com/package/opencode-agentmemory-launcher)
[![License](https://img.shields.io/npm/l/opencode-agentmemory-launcher)](./LICENSE)
[![Node.js](https://img.shields.io/node/v/opencode-agentmemory-launcher)](https://nodejs.org/)
[![CI](https://github.com/Cle2ment/opencode-agentmemory-launcher/actions/workflows/ci.yml/badge.svg)](https://github.com/Cle2ment/opencode-agentmemory-launcher/actions/workflows/ci.yml)

[English](/README.md) | [中文](/docs/README.zh.md) | [Français](/docs/README.fr.md)

## 环境要求

- **OpenCode V2**（`opencode2`）
- plugin 本身需要 **Node.js** ≥ 18.0.0；agentmemory 0.9.30 后端需要 **Node.js ≥ 20.0.0**
- **agentmemory** 后端（若不存在，则通过 `npx @agentmemory/agentmemory` 自动安装）

> **V1 用户：** 自 v4.0.0 起，不再支持 OpenCode V1（`opencode` 1.x）——如果你仍需要 V1，请固定使用 `opencode-agentmemory-launcher@^3`。

> **注意：** 此 plugin 仅在 Windows 11 上测试过。如果你需要支持其他平台，欢迎提交 pull request。

## 功能说明

此 plugin 会在 OpenCode 加载其配置时自动启动 [agentmemory](https://github.com/rohitg00/agentmemory) 后端（REST API + iii-engine）。每个 OpenCode 进程只运行一次，并每 60 秒对后端进行一次健康检查，如果进程挂掉则重启它。

## 兼容性

为 **agentmemory 0.9.30**（2026-10-06）构建，并向后兼容更早版本：

- **默认开启认证。** agentmemory 会在首次启动时生成一个密钥到 `~/.agentmemory/secret`。启动器只调用始终公开的 `/agentmemory/livez`，因此无需密钥，也不受影响。现在对手写发往 `:3111` 的 REST 调用需要 `Authorization: Bearer $(cat ~/.agentmemory/secret)`。
- **iii-engine 0.22.1。** agentmemory 0.9.30 将其引擎固定版本从 `0.11.2` 改为 `0.22.1` 并强制执行。启动器不管理引擎（由 agentmemory CLI 管理），但版本固定不匹配现在会让 CLI 以代码 1 退出——启动器会将其作为 `warn` 输出。
- **最新版本优先。** 在 Windows 上，启动器会启动它能在 npx 缓存**或 `PATH` 上的全局安装**中找到的最新 agentmemory，因此 `npm i -g @agentmemory/agentmemory@latest` 无需清除 npx 缓存即可生效。

## 安装

### 从 npm 安装（推荐）

添加到你的 OpenCode 配置（`plugins`，复数）：

```jsonc
{
  "plugins": ["opencode-agentmemory-launcher@latest"]
}
```

OpenCode 会在启动时自动安装该包。更多详情请参阅 [V2 plugins 指南](https://opencode.ai/v2/docs/build/plugins)。

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

此启动器用于启动 agentmemory 后端。若要将 agentmemory 与 OpenCode 配合使用，还需安装 agentmemory plugin，并参阅 [OpenCode agentmemory plugin 使用指南](https://github.com/rohitg00/agentmemory/blob/main/plugin/opencode/README.md) 以了解设置说明、可用工具和配置选项。

## 更新

要将 agentmemory 更新到最新版本：

```bash
npx @agentmemory/agentmemory upgrade
```

如果你全局安装了 agentmemory，请改用 `npm i -g @agentmemory/agentmemory@latest` 更新该副本——启动器会在 npx 缓存和全局安装中选取最新版本。

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

1. **加载时**（`setup()`）：plugin 启动一个健康检查间隔（60 秒）
2. **健康检查**：对后端执行 `GET /agentmemory/livez` 的 ping（始终公开，无需认证——即使 agentmemory 0.9.30 默认开启认证）
3. **自动重启（两种模式）**：如果健康检查失败，则启动后端。
   - **启动时**（plugin 加载时后端已关闭）：打开一个标题为 `agentmemory` 的可见 Windows Terminal 标签页（`wt -w 0 nt --title agentmemory …`），以便可以看到后端正在启动。此处会获取一次焦点——在启动时是可接受的，且绝不会发生在恢复路径上。当 `wt.exe` 不可用时，回退到静默路径。
   - **恢复**（此后每次从 60 秒循环中的（重新）启动）：完全静默。在 Windows 上，plugin 完全绕过 npx/cmd——它解析它能在 npm/npx 缓存或 `PATH` 上的全局安装中找到的**最新** `dist/cli.mjs`，并直接在其上 spawn `node`，因此进程树（node → cli.mjs → iii.exe）绝不会触及 cmd.exe，也绝不会分配控制台：无论是在会话中途还是空闲时，都不会有窗口/标签页，也不会抢焦点（仅靠 `windowsHide` 是不够的，因为每一次 cmd.exe 跳转都会让孙进程分配新控制台）。当找不到本地副本时，回退到 npx spawn。重新启动由 90 秒的启动宽限窗口加上跨实例启动锁进行节流（多个 OpenCode 服务器共享一个后端）
4. **调试模式**：设置 `OPENCODE_AGENTMEMORY_DEBUG=1` 以输出详细日志
5. **故障诊断**：以非零代码退出的后端启动会以 `warn` 级别记录，并附上可能的原因——某个守护进程已在端口上响应（agentmemory 0.9.30 拒绝启动第二个实例），或强制执行的 iii-engine 固定版本不匹配。进程以非零代码退出的可见启动标签页会保持打开（Windows Terminal 的 `closeOnExit: graceful`），以便错误文本仍可阅读

## 环境变量

| 变量 | 默认值 | 描述 |
|----------|---------|-------------|
| `AGENTMEMORY_URL` | `http://localhost:3111` | 后端 API URL |
| `OPENCODE_AGENTMEMORY_DEBUG` | 未设置 | 设为 `1` 以启用调试日志 |

## 故障排查

**后端始终无法启动，且日志显示非零的启动退出代码。**
agentmemory 0.9.30 强制执行其 iii-engine 固定版本（v0.22.1）。如果 `PATH` 上有不同的引擎，CLI 会以代码 1 退出。手动运行它以查看错误：

```bash
npx @agentmemory/agentmemory doctor
```

**已安装更新的 agentmemory，但启动器仍在运行较旧的那个。**
启动器优先选择 npx 缓存和全局安装中的最新版本；如果仍然由过期副本胜出，请清除缓存：

```bash
npx clear-npx-cache
```

## API

此 plugin 面向 OpenCode V2 plugin API（`@opencode/plugin` >= 2.0.18）。监控在 plugin 加载时的 `setup()` 中启动，返回的清理函数会在卸载时停止健康检查循环。

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
