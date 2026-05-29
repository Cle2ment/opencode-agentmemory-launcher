# Agentmemory Launcher for OpenCode

> Plugin OpenCode qui démarre automatiquement le backend [agentmemory](https://github.com/rohitg00/agentmemory) avec une supervision par health-check.

[![npm version](https://img.shields.io/npm/v/opencode-agentmemory-launcher)](https://www.npmjs.com/package/opencode-agentmemory-launcher)
[![License](https://img.shields.io/npm/l/opencode-agentmemory-launcher)](./LICENSE)
[![Node.js](https://img.shields.io/node/v/opencode-agentmemory-launcher)](https://nodejs.org/)
[![CI](https://github.com/Cle2ment/opencode-agentmemory-launcher/actions/workflows/ci.yml/badge.svg)](https://github.com/Cle2ment/opencode-agentmemory-launcher/actions/workflows/ci.yml)

## Prérequis

- **Node.js** ≥ 18.0.0
- **OpenCode** avec prise en charge des plugins
- Backend **agentmemory** (installé automatiquement via `npx @agentmemory/agentmemory` s'il n'est pas présent)

> **Note :** Ce plugin a uniquement été testé sur Windows 11. Si vous avez besoin de la prise en charge d'autres plateformes, les pull requests sont les bienvenues.

## Ce qu'il fait

Ce plugin démarre automatiquement le backend [agentmemory](https://github.com/rohitg00/agentmemory) (REST API + iii-engine) lorsqu'OpenCode charge sa configuration. Il s'exécute une fois par processus OpenCode et vérifie la santé du backend toutes les 60 secondes, en le redémarrant si le processus s'arrête.

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

Les fichiers dans ce répertoire sont automatiquement chargés au démarrage.

### Installation manuelle (depuis GitHub Releases)

1. Téléchargez `agentmemory-launcher.ts` depuis la dernière [GitHub Release](https://github.com/Cle2ment/opencode-agentmemory-launcher/releases)
2. Placez-le dans `.opencode/plugins/` :

```
.opencode/plugins/
└── agentmemory-launcher.ts
```

OpenCode charge automatiquement les fichiers `.ts` depuis `.opencode/plugins/` au démarrage.

## Utilisation

Ce lanceur démarre le backend agentmemory. Pour utiliser agentmemory avec OpenCode, installez également le plugin agentmemory et consultez le [guide d'utilisation du plugin OpenCode agentmemory](https://github.com/rohitg00/agentmemory/blob/main/plugin/opencode/README.md) pour les instructions de configuration, les outils disponibles et les options de configuration.

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

1. **Au premier chargement de la configuration** : Le plugin démarre un intervalle de health-check (60 s)
2. **Health-check** : Envoie une requête `GET /agentmemory/livez` au backend (public, sans authentification)
3. **Redémarrage automatique** : Si le health-check échoue, lance `npx @agentmemory/agentmemory` dans un processus détaché
4. **Mode debug** : Définissez `OPENCODE_AGENTMEMORY_DEBUG=1` pour une journalisation détaillée

## Variables d'environnement

| Variable | Valeur par défaut | Description |
| `AGENTMEMORY_URL` | `http://localhost:3111` | URL de l'API backend |
| `OPENCODE_AGENTMEMORY_DEBUG` | non défini | Définir à `1` pour la journalisation de débogage |

## API

Le plugin exporte un objet unique conforme à l'interface `@opencode-ai/plugin` :

```typescript
import type { Plugin } from "@opencode-ai/plugin";

export const AgentmemoryLauncherPlugin: Plugin;
```

Ce plugin implémente le hook de cycle de vie `config`, qui est appelé à chaque fois qu'OpenCode charge sa configuration.

## Développement

```bash
# Installer les dépendances
npm install

# Vérification des types
npm run typecheck

# Compilation
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

## Droits d'auteur

Copyright (C) 2026 Cle2ment.
