# Agentmemory Launcher pour OpenCode

> Plugin OpenCode qui démarre automatiquement le backend [agentmemory](https://github.com/rohitg00/agentmemory) avec une supervision par vérification de l'état.

[![npm version](https://img.shields.io/npm/v/opencode-agentmemory-launcher)](https://www.npmjs.com/package/opencode-agentmemory-launcher)
[![License](https://img.shields.io/npm/l/opencode-agentmemory-launcher)](./LICENSE)
[![Node.js](https://img.shields.io/node/v/opencode-agentmemory-launcher)](https://nodejs.org/)
[![CI](https://github.com/Cle2ment/opencode-agentmemory-launcher/actions/workflows/ci.yml/badge.svg)](https://github.com/Cle2ment/opencode-agentmemory-launcher/actions/workflows/ci.yml)

[English](/README.md) | [中文](/docs/README.zh.md) | [Français](/docs/README.fr.md)

## Prérequis

- **Node.js** ≥ 18.0.0
- **OpenCode** avec support des plugins
- **agentmemory** backend (installé automatiquement via `npx @agentmemory/agentmemory` s'il n'est pas présent)

> **Remarque :** Ce plugin a été testé uniquement sur Windows 11. Si vous avez besoin d'un support pour d'autres plateformes, les pull requests sont les bienvenues.

## Fonctionnement

Ce plugin démarre automatiquement le backend [agentmemory](https://github.com/rohitg00/agentmemory) (API REST + iii-engine) lorsque OpenCode charge sa configuration. Il s'exécute une fois par processus OpenCode et vérifie l'état du backend toutes les 60 secondes, en le redémarrant si le processus se termine.

## Installation

### Depuis npm (recommandé)

Ajoutez à votre configuration OpenCode :

```jsonc
// opencode.json
{
  "plugin": ["opencode-agentmemory-launcher@latest"]
}
```

OpenCode installera automatiquement le package au démarrage. Consultez la [documentation des plugins OpenCode](https://opencode.ai/docs/en/plugins/) pour plus de détails.

### Depuis un fichier local

Placez le fichier du plugin dans `.opencode/plugins/` :

```
.opencode/plugins/
└── agentmemory-launcher.ts
```

Les fichiers dans ce répertoire sont chargés automatiquement au démarrage.

### Installation manuelle (depuis les versions GitHub)

1. Téléchargez `agentmemory-launcher.ts` depuis la dernière [version GitHub](https://github.com/Cle2ment/opencode-agentmemory-launcher/releases)
2. Placez-le dans `.opencode/plugins/` :

```
.opencode/plugins/
└── agentmemory-launcher.ts
```

OpenCode charge les fichiers `.ts` depuis `.opencode/plugins/` automatiquement au démarrage.

## Utilisation

Ce lanceur démarre le backend agentmemory. Pour utiliser agentmemory avec OpenCode, installez également le plugin agentmemory et consultez le [guide d'utilisation du plugin agentmemory pour OpenCode](https://github.com/rohitg00/agentmemory/blob/main/plugin/opencode/README.md) pour les instructions de configuration, les outils disponibles et les options de configuration.

## Mise à jour

Pour mettre à jour agentmemory vers la dernière version :

```bash
npx @agentmemory/agentmemory upgrade
```

Après la mise à jour, arrêtez le processus agentmemory en cours et videz le cache npx :

**Windows (PowerShell) :**

```powershell
# Arrêter le processus agentmemory
Get-Process -Name "node" | Where-Object {
    (Get-CimInstance Win32_Process -Filter "ProcessId = $($_.Id)").CommandLine -match 'agentmemory'
} | Stop-Process -Force

# Vider le cache npx
Get-ChildItem "$env:LOCALAPPDATA\npm-cache\_npx" -Directory | Where-Object {
    Test-Path "$($_.FullName)\node_modules\@agentmemory"
} | Remove-Item -Recurse -Force
```

Redémarrez OpenCode pour relancer agentmemory avec la version mise à jour.

## Fonctionnement

1. **Au premier chargement de la configuration** : Le plugin démarre une vérification périodique de l'état (60s)
2. **Vérification de l'état** : Envoie une requête `GET /agentmemory/livez` au backend (public, sans authentification)
3. **Redémarrage automatique** : Si la vérification de l'état échoue, lance `npx @agentmemory/agentmemory` dans un processus détaché
4. **Mode débogage** : Définissez `OPENCODE_AGENTMEMORY_DEBUG=1` pour des journaux détaillés

## Variables d'environnement

| Variable | Défaut | Description |
|----------|--------|-------------|
| `AGENTMEMORY_URL` | `http://localhost:3111` | URL de l'API backend |
| `OPENCODE_AGENTMEMORY_DEBUG` | non défini | Définir à `1` pour les journaux de débogage |

## API

Le plugin exporte un objet unique conforme à l'interface `@opencode-ai/plugin` :

```typescript
import type { Plugin } from "@opencode-ai/plugin";

export const AgentmemoryLauncherPlugin: Plugin;
```

Ce plugin implémente le hook de cycle de vie `config`, qui est appelé chaque fois qu'OpenCode charge sa configuration.

## Développement

```bash
# Installer les dépendances
npm install

# Vérification des types
npm run typecheck

# Compiler
npm run build

# Exécuter les tests
npm test
```

## Communauté

- [Guide de contribution](./CONTRIBUTING.md)
- [Code de conduite](./CODE_OF_CONDUCT.md)
- [Politique de sécurité](./SECURITY.md)

## Licence

[GNU Affero General Public License v3.0](./LICENSE)

## Copyright

Copyright (C) 2026 Cle2ment.
