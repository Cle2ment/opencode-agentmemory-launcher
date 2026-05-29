# Agentmemory Launcher for OpenCode

> OpenCode 插件，自动启动 [agentmemory](https://github.com/rohitg00/agentmemory) 后端并进行健康检查监控。

[![npm version](https://img.shields.io/npm/v/opencode-agentmemory-launcher)](https://www.npmjs.com/package/opencode-agentmemory-launcher)
[![License](https://img.shields.io/npm/l/opencode-agentmemory-launcher)](./LICENSE)
[![Node.js](https://img.shields.io/node/v/opencode-agentmemory-launcher)](https://nodejs.org/)
[![CI](https://github.com/Cle2ment/opencode-agentmemory-launcher/actions/workflows/ci.yml/badge.svg)](https://github.com/Cle2ment/opencode-agentmemory-launcher/actions/workflows/ci.yml)

## 环境要求

- **Node.js** ≥ 18.0.0
- 支持 plugin 的 **OpenCode**
- **agentmemory** 后端（如未安装，将通过 `npx @agentmemory/agentmemory` 自动安装）

> **注意：** 此插件仅在 Windows 11 上经过测试。如需适配其他平台，欢迎提交 Pull Request。

## 功能简介

此插件在 OpenCode 加载配置时自动启动 [agentmemory](https://github.com/rohitg00/agentmemory) 后端（REST API + iii-engine）。每个 OpenCode 进程只运行一次，并每 60 秒对后端进行健康检查，如果进程终止则自动重启。

## 安装

### 通过 npm 安装（推荐）

在 OpenCode 配置中添加：

```jsonc
// opencode.json
{
  "plugin": ["opencode-agentmemory-launcher@latest"]
}
```

OpenCode 将在启动时自动安装此包。详情请参阅 [OpenCode Plugins 文档](https://opencode.ai/docs/en/plugins/)。

### 本地文件安装

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

OpenCode 会在启动时自动加载 `.opencode/plugins/` 中的 `.ts` 文件。

## 使用方式

此启动器负责启动 agentmemory 后端。要在 OpenCode 中使用 agentmemory，还需安装 agentmemory 插件，并参考 [OpenCode agentmemory 插件使用指南](https://github.com/rohitg00/agentmemory/blob/main/plugin/opencode/README.md) 了解配置说明、可用工具和配置选项。

## 更新

将 agentmemory 更新到最新版本：

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

重启 OpenCode 以使用更新后的版本启动 agentmemory。

## 工作原理

1. **首次配置加载**：插件启动健康检查定时器（每 60 秒）
2. **健康检查**：向后端发送 `GET /agentmemory/livez` 请求（公共接口，无需认证）
3. **自动重启**：如果健康检查失败，在独立进程中启动 `npx @agentmemory/agentmemory`
4. **调试模式**：设置 `OPENCODE_AGENTMEMORY_DEBUG=1` 以启用详细日志

## 环境变量

| 变量 | 默认值 | 描述 |
| `AGENTMEMORY_URL` | `http://localhost:3111` | 后端 API 地址 |
| `OPENCODE_AGENTMEMORY_DEBUG` | 未设置 | 设为 `1` 以启用调试日志 |

## API

插件导出符合 `@opencode-ai/plugin` 接口的单一对象：

```typescript
import type { Plugin } from "@opencode-ai/plugin";

export const AgentmemoryLauncherPlugin: Plugin;
```

此插件实现了 `config` 生命周期钩子，在 OpenCode 每次加载配置时被调用。

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

## 版权

Copyright (C) 2026 Cle2ment.
