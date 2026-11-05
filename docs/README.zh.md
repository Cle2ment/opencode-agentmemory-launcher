# 面向 OpenCode 的 Agentmemory 启动器

> 一个 OpenCode plugin，可自动启动 [agentmemory](https://github.com/rohitg00/agentmemory) 后端，并带有健康检查监控。

[![npm version](https://img.shields.io/npm/v/opencode-agentmemory-launcher)](https://www.npmjs.com/package/opencode-agentmemory-launcher)
[![License](https://img.shields.io/npm/l/opencode-agentmemory-launcher)](./LICENSE)
[![Node.js](https://img.shields.io/node/v/opencode-agentmemory-launcher)](https://nodejs.org/)
[![CI](https://github.com/Cle2ment/opencode-agentmemory-launcher/actions/workflows/ci.yml/badge.svg)](https://github.com/Cle2ment/opencode-agentmemory-launcher/actions/workflows/ci.yml)

[English](/README.md) | [中文](/docs/README.zh.md) | [Français](/docs/README.fr.md)

## 要求

- **OpenCode V2**（`opencode2`）
- 插件本身要求 **Node.js** ≥ 18.0.0；agentmemory 0.9.30+ 要求 **Node.js ≥ 20.0.0**
- **agentmemory** 后端（如果不存在，将通过 `npx @agentmemory/agentmemory` 自动安装）

> **V1 用户：** 自 v4.0.0 起，不再支持 OpenCode V1（`opencode` 1.x）——如果你仍需要 V1，请固定使用 `opencode-agentmemory-launcher@^3`。

> **注意：** 此插件仅在 Windows 11 上测试过。如果你需要支持其他平台，欢迎提交 pull request。

## 功能说明

当 OpenCode 加载其配置时，此插件会自动启动 [agentmemory](https://github.com/rohitg00/agentmemory) 后端（REST API + iii-engine）。它每个 OpenCode 进程只运行一次，并每 60 秒对后端进行健康检查；如果进程死亡，则重新启动它。

## 兼容性

专为 **agentmemory 0.9.32**（iii-engine 0.25.0，Worker Compose）构建，并向后兼容更早版本：

- **默认开启认证。** agentmemory 在首次启动时会生成一个密钥到 `~/.agentmemory/secret`。启动器只调用始终公开的 `/agentmemory/livez`，因此不需要密钥，也不受影响。现在手写发往 `:3111` 的 REST 调用需要 `Authorization: Bearer $(cat ~/.agentmemory/secret)`。
- **Worker Compose 就绪状态。** agentmemory 0.9.31+ 为引擎启动最多预留 120 秒，并为 worker 就绪最多预留 300 秒。启动器的 450 秒启动预算和跨实例锁可防止在此时间窗口内发生重复启动。
- **Windows 启动为非交互式。** agentmemory 0.9.32 在 Windows 上以及 stdio 不是 TTY 时，会跳过交互式引擎设置提示，并且可以自动安装其固定版本的 Windows 引擎。这使其适用于启动器使用 ignored-stdio 的后台 spawn。
- **空控制台窗口仍是上游问题。** agentmemory 0.9.31 和 0.9.32 都固定使用 iii 0.25.0；其 Windows Worker Compose 可能会为引擎和每个 worker 打开一个空控制台（[iii#2430](https://github.com/iii-hq/iii/issues/2430)）。启动器无法通过 `windowsHide` 抑制这些孙进程窗口；修复位于 [iii#2437](https://github.com/iii-hq/iii/pull/2437)，但该修复尚未包含在 agentmemory 0.9.32 所使用的稳定版 0.25.0 引擎中。启动器不会固定 alpha 引擎，也不会修补第三方文件。
- **引擎版本固定由 agentmemory 管理。** 启动器不会安装、选择或覆盖 iii-engine。固定版本不匹配时，CLI 会以退出码 1 退出，并显示为 `warn`。
- **最新版本优先。** 在 Windows 上，启动器会启动它能在 npx 缓存**或 `PATH` 上的全局安装**中找到的最新 agentmemory，包括位于符号链接 Scoop PATH 条目之后的全局安装；因此 `npm i -g @agentmemory/agentmemory@latest` 会生效，而无需清除 npx 缓存。

## 安装

### 从 npm 安装（推荐）

添加到你的 OpenCode 配置中（`plugins`，复数）：

```jsonc
{
  "plugins": ["opencode-agentmemory-launcher@latest"]
}
```

OpenCode 会在启动时自动安装该包。更多详情请参见 [V2 plugins 指南](https://opencode.ai/v2/docs/build/plugins)。

## 用法

此启动器用于启动 agentmemory 后端。要在 OpenCode 中使用 agentmemory，还需安装 agentmemory plugin，并参阅 [OpenCode agentmemory plugin 使用指南](https://github.com/rohitg00/agentmemory/blob/main/plugin/opencode/README.md)以了解设置说明、可用工具和配置选项。

## 更新

要将 agentmemory 更新到最新版本：

```bash
npx @agentmemory/agentmemory upgrade
```

如果你全局安装了 agentmemory，请改用 `npm i -g @agentmemory/agentmemory@latest` 更新该副本——启动器会在 npx 缓存和全局安装中选择最新版本。

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

1. **加载时**（`setup()`）：插件启动一个健康检查间隔（60 秒）
2. **健康检查**：向后端的 `GET /agentmemory/livez` 发送 ping 请求（始终公开、无需认证——即使 agentmemory 0.9.30 默认启用认证也是如此）
3. **自动重启**：如果健康检查失败，则启动后端。
   - **在启动器自身的 spawn 路径上始终保持静默**（启动时以及之后每 60 秒循环触发的每次重新启动）：在 Windows 上，插件会在 npm/npx 缓存或 `PATH` 上的全局安装中解析**最新的** `dist/cli.mjs`，然后使用 OpenCode 宿主自身的 `process.execPath` 执行它。这避免了 `node` PATH 查找、shim 跳转以及不必要的 npx/cmd 回退。agentmemory 0.9.31/0.9.32 仍可能在 iii 0.25.0 的 worker 树内打开空控制台；这一单独的上游限制已在 **兼容性** 中说明。重新启动会受到 450 秒启动预算以及跨实例启动锁的限制（多个 OpenCode server 共享一个后端）。指数退避重试保持其 90 秒基数，产生 450 秒 → 450 秒 → 450 秒 → 720 秒……最高 12 分钟
4. **调试模式**：设置 `OPENCODE_AGENTMEMORY_DEBUG=1` 以启用详细日志记录
5. **失败诊断**：以非零代码退出的后端启动会以 `warn` 级别记录，并附带可能原因——已有守护进程在端口上响应、强制固定的 iii-engine 版本不匹配，或 0.9.31+ Worker Compose 就绪失败。后端以 `stdio: "ignore"` 运行，因此若要查看实际错误文本，请运行 `npx @agentmemory/agentmemory doctor`

## 环境变量

| 变量 | 默认值 | 描述 |
|----------|---------|-------------|
| `AGENTMEMORY_URL` | `http://localhost:3111` | 后端 API URL |
| `OPENCODE_AGENTMEMORY_DEBUG` | 未设置 | 设为 `1` 以启用调试日志记录 |

## 故障排查

**后端启动了，但 Windows 上出现空控制台窗口。**
这是已知的 agentmemory 0.9.31/0.9.32 + iii 0.25.0 Worker Compose 问题，不是启动器窗口。参见 [iii#2430](https://github.com/iii-hq/iii/issues/2430)。只有当 agentmemory 固定到包含 [iii#2437](https://github.com/iii-hq/iii/pull/2437) 的稳定版 iii 版本时才升级；强制使用 alpha 覆盖不是启动器支持的配置。

**后端始终无法启动，并且日志显示启动以非零状态退出。**
常见原因是强制固定的 iii-engine 版本不匹配、仍有陈旧实例占用端口，或 0.9.31+ Worker Compose worker 未能就绪。手动运行 doctor 以查看实际错误：

```bash
npx @agentmemory/agentmemory doctor
```

**在 agentmemory 0.9.30 上，启动器日志显示 `agentmemory worker did not become ready within 15s`，并且启动以退出码 1 退出。**
来自先前会话的陈旧实例仍占用 REST 端口，因此新的 CLI 会启动其引擎，但其 worker 注册始终无法就绪——正常的新启动会在约 2 秒内完成。请诊断并重启整条链路（绝不要只杀死单个 worker 进程：它可能是活动路由处理器，杀死它会使 `/agentmemory/livez` 返回 404）：

```powershell
Get-NetTCPConnection -LocalPort 3111 -State Listen   # who owns the port
npx @agentmemory/agentmemory stop                     # stop the instance it belongs to
# if that leaves the port held, stop the engine + worker pair together and
# let the launcher's supervision loop relaunch them (~60s, silently)
```

**已安装较新的 agentmemory，但启动器仍运行较旧版本。**
启动器会优先选择 npx 缓存和全局安装中的最新版本；如果陈旧副本仍然胜出，请清除缓存：

```bash
npx clear-npx-cache
```

## API

该插件面向 OpenCode V2 plugin API（`@opencode/plugin` >= 2.2.5）。当插件加载时，监控会在 `setup()` 中启动；返回的清理函数会在卸载时停止健康检查循环。

```typescript
import type { Plugin } from "@opencode/plugin";

const plugin: Plugin.Plugin = {
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
