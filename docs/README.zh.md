# OpenCode 的 Agentmemory 启动器

> 一个 OpenCode 插件，可自动启动 [agentmemory](https://github.com/rohitg00/agentmemory) 后端，并进行健康检查监控。

[![npm version](https://img.shields.io/npm/v/opencode-agentmemory-launcher)](https://www.npmjs.com/package/opencode-agentmemory-launcher)
[![License](https://img.shields.io/npm/l/opencode-agentmemory-launcher)](./LICENSE)
[![Node.js](https://img.shields.io/node/v/opencode-agentmemory-launcher)](https://nodejs.org/)
[![CI](https://github.com/Cle2ment/opencode-agentmemory-launcher/actions/workflows/ci.yml/badge.svg)](https://github.com/Cle2ment/opencode-agentmemory-launcher/actions/workflows/ci.yml)

[English](/README.md) | [中文](/docs/README.zh.md) | [Français](/docs/README.fr.md)

## 环境要求

- **OpenCode V2**（`opencode2`）
- 插件本身要求 **Node.js** ≥ 18.0.0；agentmemory 0.9.30+ 要求 **Node.js ≥ 20.0.0**
- **agentmemory** 后端（若不存在，会通过 `npx @agentmemory/agentmemory` 自动安装）

> **V1 用户：** 自 v4.0.0 起不再支持 OpenCode V1（`opencode` 1.x）——如果你仍需要 V1，请固定使用 `opencode-agentmemory-launcher@^3`。

> **注意：** 本插件仅在 Windows 11 上测试过。如果你需要支持其他平台，欢迎提交 pull request。

## 功能说明

当 OpenCode 加载其配置时，本插件会自动启动 [agentmemory](https://github.com/rohitg00/agentmemory) 后端（REST API + iii-engine）。它为每个 OpenCode 进程仅运行一次，并每 60 秒对后端进行一次健康检查；如果进程终止，则会重新启动它。

## 兼容性

为 **agentmemory 0.9.31**（iii-engine 0.25.0，Worker Compose）构建，并向后兼容更早的版本：

- **默认启用认证。** agentmemory 在首次启动时会生成一个 secret 并存入 `~/.agentmemory/secret`。启动器仅调用始终公开的 `/agentmemory/livez`，因此无需 secret，也不受影响。现在，手动向 `:3111` 发起的 REST 调用需要 `Authorization: Bearer $(cat ~/.agentmemory/secret)`。
- **Worker Compose 就绪状态。** agentmemory 0.9.31 为引擎启动预留最多 120s，为 worker 就绪预留 300s。启动器的 450s 启动预算和跨实例锁可防止在该时间窗口内重复启动。
- **引擎版本固定由 agentmemory 管理。** 启动器不会安装或选择 iii-engine。版本固定不匹配时，CLI 会以代码 1 退出，并会以 `warn` 形式显示。原生 Windows 需要手动安装固定版本的引擎；0.9.31 还有一个已知的原生 Windows Worker Compose 启动问题，记录于 [agentmemory#1618](https://github.com/rohitg00/agentmemory/issues/1618)。
- **最新版本优先。** 在 Windows 上，启动器会在 npx 缓存**或 `PATH` 上的全局安装**中查找它能找到的最新 agentmemory，包括位于符号链接 Scoop PATH 条目背后的全局安装，因此 `npm i -g @agentmemory/agentmemory@latest` 无需清除 npx 缓存即可生效。

## 安装

### 从 npm 安装（推荐）

添加到你的 OpenCode 配置中（`plugins`，复数）：

```jsonc
{
  "plugins": ["opencode-agentmemory-launcher@latest"]
}
```

OpenCode 将在启动时自动安装该包。详情请参阅 [V2 插件指南](https://opencode.ai/v2/docs/build/plugins)。

## 使用

本启动器负责启动 agentmemory 后端。要在 OpenCode 中使用 agentmemory，还需安装 agentmemory 插件，并参阅 [OpenCode agentmemory 插件使用指南](https://github.com/rohitg00/agentmemory/blob/main/plugin/opencode/README.md) 了解设置说明、可用工具和配置选项。

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

1. **加载时**（`setup()`）：插件启动一个健康检查间隔（60s）
2. **健康检查**：对后端执行 `GET /agentmemory/livez` 请求（始终公开，无需认证——即使 agentmemory 0.9.30 默认启用认证）
3. **自动重启**：如果健康检查失败，则启动后端。
   - **在启动器自身的 spawn 路径上始终保持静默**（启动时以及 60s 循环中后续的每次（重新）启动）：在 Windows 上，插件绕过 npx/cmd，在 npm/npx 缓存或 `PATH` 上的全局安装中解析**最新**的 `dist/cli.mjs`，并直接用 `node` 对其执行 spawn。agentmemory 0.9.31+ Worker Compose 可能在其自身的 worker 树中创建 cmd.exe/conhost；原生 Windows 启动目前受 [agentmemory#1618](https://github.com/rohitg00/agentmemory/issues/1618) 影响。重新启动受 450s 启动预算加上跨实例启动锁的限制（多个 OpenCode 服务器共享一个后端）。指数重试退避保持其 90s 基数，产生 450s → 450s → 450s → 720s … 最长至 12min
4. **调试模式**：设置 `OPENCODE_AGENTMEMORY_DEBUG=1` 以启用详细日志
5. **失败诊断**：以非零代码退出的后端启动会以 `warn` 级别记录，并附上可能的原因——端口上已有守护进程响应、强制执行的 iii-engine 版本固定不匹配，或 0.9.31+ Worker Compose 就绪失败。后端以 `stdio: "ignore"` 运行，因此要查看实际错误文本，请运行 `npx @agentmemory/agentmemory doctor`

## 环境变量

| 变量 | 默认值 | 描述 |
|----------|---------|-------------|
| `AGENTMEMORY_URL` | `http://localhost:3111` | 后端 API URL |
| `OPENCODE_AGENTMEMORY_DEBUG` | 未设置 | 设为 `1` 以启用调试日志 |

## 故障排查

**后端始终无法启动，日志显示非零的启动退出码。**
常见原因是强制执行的 iii-engine 版本固定不匹配、仍有旧实例占用端口，或 0.9.31+ Worker Compose worker 未能就绪。在原生 Windows 上，请查看 [agentmemory#1618](https://github.com/rohitg00/agentmemory/issues/1618) 了解已知的 0.9.31 启动问题。手动运行 doctor 以查看实际错误：

```bash
npx @agentmemory/agentmemory doctor
```

**在 agentmemory 0.9.30 上，启动器日志显示 `agentmemory worker did not become ready within 15s`，且启动以代码 1 退出。**
来自早前会话的旧实例仍占用着 REST 端口，因此新的 CLI 启动其引擎，但它的 worker 注册始终无法就绪——一次健康的全新启动约在 2s 内完成。诊断并重启整条链路（绝不要只杀掉单个 worker 进程：它可能是当前活跃的路由处理器，杀掉它会使 `/agentmemory/livez` 返回 404）：

```powershell
Get-NetTCPConnection -LocalPort 3111 -State Listen   # who owns the port
npx @agentmemory/agentmemory stop                     # stop the instance it belongs to
# if that leaves the port held, stop the engine + worker pair together and
# let the launcher's supervision loop relaunch them (~60s, silently)
```

**安装了更新的 agentmemory，但启动器仍在运行较旧的版本。**
启动器优先选择 npx 缓存和全局安装中的最新版本；如果旧副本仍被优先使用，请清除缓存：

```bash
npx clear-npx-cache
```

## API

该插件面向 OpenCode V2 插件 API（`@opencode/plugin` >= 2.0.18）。监控在插件加载时的 `setup()` 中启动，返回的清理函数会在卸载时停止健康检查循环。

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
