# Agentmemory Launcher for OpenCode

> OpenCode 插件，自动启动 [agentmemory](https://github.com/rohitg00/agentmemory) 后端并附带健康检查监控。

[![npm version](https://img.shields.io/npm/v/opencode-agentmemory-launcher)](https://www.npmjs.com/package/opencode-agentmemory-launcher)
[![License](https://img.shields.io/npm/l/opencode-agentmemory-launcher)](./LICENSE)
[![Node.js](https://img.shields.io/node/v/opencode-agentmemory-launcher)](https://nodejs.org/)
[![CI](https://github.com/Cle2ment/opencode-agentmemory-launcher/actions/workflows/ci.yml/badge.svg)](https://github.com/Cle2ment/opencode-agentmemory-launcher/actions/workflows/ci.yml)

[英语](/README.md) | [中文](/docs/README.zh.md) | [法语](/docs/README.fr.md)

## 系统要求

- **Node.js** ≥ 18.0.0
- 支持插件的 **OpenCode**
- **agentmemory** 后端（若未安装，插件会自动通过 `npx @agentmemory/agentmemory` 安装）

> **注意：** 本插件仅在 Windows 11 上测试过。如需其他平台支持，欢迎提交 Pull Request。

## 功能说明

本插件会在 OpenCode 加载配置时自动启动 [agentmemory](https://github.com/rohitg00/agentmemory) 后端（REST API + iii-engine）。它会在每个 OpenCode 进程中执行一次，并每 60 秒对后端进行一次健康检查，若进程死亡则自动重启。

## 安装方式

### 从 npm 安装（推荐）

在 OpenCode 配置中添加：

```jsonc
// opencode.json
{
  "plugin": ["opencode-agentmemory-launcher@latest"]
}
```

OpenCode 会在启动时自动安装该包。更多详情请参阅 [OpenCode 插件文档](https://opencode.ai/docs/en/plugins/)。

### 从本地文件安装

将插件文件放入 `.opencode/plugins/` 目录：

```
.opencode/plugins/
└── agentmemory-launcher.ts
```

该目录下的文件会在启动时自动加载。

### 手动安装（从 GitHub Releases）

1. 从最新的 [GitHub Release](https://github.com/Cle2ment/opencode-agentmemory-launcher/releases) 下载 `agentmemory-launcher.ts`
2. 将其放入 `.opencode/plugins/` 目录：

```
.opencode/plugins/
└── agentmemory-launcher.ts
```

OpenCode 会在启动时自动加载 `.opencode/plugins/` 目录下的 `.ts` 文件。

## 使用方法

本启动器会启动 agentmemory 后端。要在 OpenCode 中使用 agentmemory，还需安装 agentmemory 插件，并参考 [OpenCode agentmemory 插件使用指南](https://github.com/rohitg00/agentmemory/blob/main/plugin/opencode/README.md) 了解设置说明、可用工具及配置选项。

## 更新

更新 agentmemory 到最新版本：

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

重新启动 OpenCode，即可使用更新后的 agentmemory 版本。

## 工作原理

1. **首次加载配置时**：插件启动一个健康检查定时器（间隔 60 秒）
2. **健康检查**：向后端发送 `GET /agentmemory/livez` 请求（公开接口，无需认证）
3. **自动重启**：如果健康检查失败，则在分离进程中执行 `npx @agentmemory/agentmemory`
4. **调试模式**：设置环境变量 `OPENCODE_AGENTMEMORY_DEBUG=1` 可输出详细日志

## 环境变量

| 变量 | 默认值 | 描述 |
|----------|---------|-------------|
| `AGENTMEMORY_URL` | `http://localhost:3111` | 后端 API URL |
| `OPENCODE_AGENTMEMORY_DEBUG` | 未设置 | 设为 `1` 开启调试日志 |

## API

插件导出一个符合 `@opencode-ai/plugin` 接口的对象：

```typescript
import type { Plugin } from "@opencode-ai/plugin";

export const AgentmemoryLauncherPlugin: Plugin;
```

该插件实现了 `config` 生命周期钩子，每次 OpenCode 加载配置时都会调用。

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

## 版权信息

Copyright (C) 2026 Cle2ment.
