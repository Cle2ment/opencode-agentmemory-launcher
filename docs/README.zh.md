# 用于 OpenCode 的 Agentmemory Launcher

> OpenCode plugin，可自动启动 [agentmemory](https://github.com/rohitg00/agentmemory) 后端，并进行健康检查监控。

[![npm version](https://img.shields.io/npm/v/opencode-agentmemory-launcher)](https://www.npmjs.com/package/opencode-agentmemory-launcher)
[![License](https://img.shields.io/npm/l/opencode-agentmemory-launcher)](./LICENSE)
[![Node.js](https://img.shields.io/node/v/opencode-agentmemory-launcher)](https://nodejs.org/)
[![CI](https://github.com/Cle2ment/opencode-agentmemory-launcher/actions/workflows/ci.yml/badge.svg)](https://github.com/Cle2ment/opencode-agentmemory-launcher/actions/workflows/ci.yml)

[English](/README.md) | [中文](/docs/README.zh.md) | [Français](/docs/README.fr.md)

## 环境要求

- **OpenCode V2**（`opencode2`）
- plugin 本身需要 **Node.js** ≥ 18.0.0；agentmemory 0.9.30 后端需要 **Node.js ≥ 20.0.0**
- **agentmemory** 后端（若不存在，会通过 `npx @agentmemory/agentmemory` 自动安装）

> **V1 用户：** 自 v4.0.0 起不再支持 OpenCode V1（`opencode` 1.x）——如果你仍需要 V1，请锁定 `opencode-agentmemory-launcher@^3`。

> **注意：** 此 plugin 仅在 Windows 11 上测试过。如果你需要支持其他平台，欢迎提交 pull request。

## 功能说明

此 plugin 会在 OpenCode 加载其配置时自动启动 [agentmemory](https://github.com/rohitg00/agentmemory) 后端（REST API + iii-engine）。它在每个 OpenCode 进程中只运行一次，并每 60 秒对后端进行一次健康检查，若进程死亡则重新启动它。

## 兼容性

针对 **agentmemory 0.9.30**（2026-10-06）构建，并向后兼容更早的版本：

- **默认开启鉴权。** agentmemory 在首次启动时会生成一个 secret 写入 `~/.agentmemory/secret`。launcher 只调用始终公开的 `/agentmemory/livez`，因此无需 secret 也不受影响。手写对 `:3111` 的 REST 调用现在需要 `Authorization: Bearer $(cat ~/.agentmemory/secret)`。
- **iii-engine 0.22.1。** agentmemory 0.9.30 将其 engine 版本锁定从 `0.11.2` 改为 `0.22.1` 并强制执行。launcher 不管理 engine（由 agentmemory CLI 管理），但版本锁定不匹配现在会让 CLI 以退出码 1 退出——launcher 会将其以 `warn` 形式呈现。
- **最新版本优先。** 在 Windows 上，launcher 会启动它在 npx 缓存**或 `PATH` 上的全局安装**中找到的最新 agentmemory，因此 `npm i -g @agentmemory/agentmemory@latest` 无需清除 npx 缓存即可生效。

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

该目录中的文件会在启动时自动加载。

### 手动安装（从 GitHub Releases）

1. 从最新的 [GitHub Release](https://github.com/Cle2ment/opencode-agentmemory-launcher/releases) 下载 `agentmemory-launcher.ts`
2. 将其放入 `.opencode/plugins/`：

```
.opencode/plugins/
└── agentmemory-launcher.ts
```

OpenCode 会在启动时自动加载 `.opencode/plugins/` 中的 `.ts` 文件。

## 使用方法

此 launcher 负责启动 agentmemory 后端。要在 OpenCode 中使用 agentmemory，还需安装 agentmemory plugin，并参阅 [OpenCode agentmemory plugin 使用指南](https://github.com/rohitg00/agentmemory/blob/main/plugin/opencode/README.md) 了解安装说明、可用工具和配置选项。

## 更新

要将 agentmemory 更新到最新版本：

```bash
npx @agentmemory/agentmemory upgrade
```

如果你全局安装了 agentmemory，请改用 `npm i -g @agentmemory/agentmemory@latest` 更新该副本——launcher 会在 npx 缓存和全局安装中选择最新版本。

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
2. **健康检查**：对后端 ping `GET /agentmemory/livez`（始终公开、无需鉴权——即使 agentmemory 0.9.30 默认开启鉴权也是如此）
3. **自动重启**：如果健康检查失败，则启动后端。
   - **始终静默**（启动时以及 60 秒循环中之后的每一次（重新）启动）：在 Windows 上 plugin 完全绕过 npx/cmd——它会在 npm/npx 缓存或 `PATH` 上的全局安装中解析出**最新**的 `dist/cli.mjs`，并直接在其上 spawn `node`，因此进程树（node → cli.mjs → iii.exe）永远不会触碰 cmd.exe 也永远不会分配控制台：无论是在启动时、会话中途还是空闲时，都不会出现窗口/标签页，也不会抢占焦点（仅靠 `windowsHide` 不够，因为每一层 cmd.exe 跳转都会让孙进程分配新的控制台）。如果未找到本地副本，则回退到 npx spawn。重新启动受 90 秒启动宽限期和跨实例启动锁的限制（多个 OpenCode 服务共享一个后端）；启动时的启动不计入失败退避，因此启动失败会在约 90 秒后重试
4. **调试模式**：设置 `OPENCODE_AGENTMEMORY_DEBUG=1` 以输出详细日志
5. **失败诊断**：以非零退出码退出的后端启动会以 `warn` 级别记录可能的原因——已有守护进程在端口上应答（agentmemory 0.9.30 拒绝启动第二个实例）或强制执行的 iii-engine 版本锁定不匹配。后端以 `stdio: "ignore"` 运行，因此要查看实际错误文本，请运行 `npx @agentmemory/agentmemory doctor`

## 环境变量

| 变量 | 默认值 | 描述 |
|----------|---------|-------------|
| `AGENTMEMORY_URL` | `http://localhost:3111` | 后端 API URL |
| `OPENCODE_AGENTMEMORY_DEBUG` | 未设置 | 设为 `1` 以启用调试日志 |

## 故障排查

**后端始终无法启动，且日志显示启动以非零退出码退出。**
两个常见原因：agentmemory 0.9.30 强制执行其 iii-engine 版本锁定（v0.22.1），因此 `PATH` 上不同的 engine 会让 CLI 以退出码 1 退出；或者一个陈旧的实例仍占用着端口。手动运行它以查看实际错误：

```bash
npx @agentmemory/agentmemory doctor
```

**launcher 日志显示 `agentmemory worker did not become ready within 15s`，且启动以退出码 1 退出。**
之前会话遗留的陈旧实例仍占用着 REST 端口，因此新的 CLI 启动了它的 engine，但其 worker 注册始终无法就绪——健康的全新启动约 2 秒即可完成。诊断并重启整条链路（切勿只杀掉单个 worker 进程：它可能是当前活动的路由处理器，杀掉它会让 `/agentmemory/livez` 返回 404）：

```powershell
Get-NetTCPConnection -LocalPort 3111 -State Listen   # who owns the port
npx @agentmemory/agentmemory stop                     # stop the instance it belongs to
# if that leaves the port held, stop the engine + worker pair together and
# let the launcher's supervision loop relaunch them (~60s, silently)
```

**安装了更新的 agentmemory，但 launcher 仍在运行较旧的版本。**
launcher 会优先选择 npx 缓存和全局安装中的最新版本；如果陈旧副本仍然胜出，请清除缓存：

```bash
npx clear-npx-cache
```

## API

此 plugin 面向 OpenCode V2 plugin API（`@opencode/plugin` >= 2.0.18）。监控在 plugin 加载时的 `setup()` 中启动，返回的 cleanup 函数会在卸载时停止健康检查循环。

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
