# Agentmemory Launcher pour OpenCode

> Plugin OpenCode qui démarre automatiquement le backend [agentmemory](https://github.com/rohitg00/agentmemory) avec une supervision par contrôle de santé.

[![npm version](https://img.shields.io/npm/v/opencode-agentmemory-launcher)](https://www.npmjs.com/package/opencode-agentmemory-launcher)
[![License](https://img.shields.io/npm/l/opencode-agentmemory-launcher)](./LICENSE)
[![Node.js](https://img.shields.io/node/v/opencode-agentmemory-launcher)](https://nodejs.org/)
[![CI](https://github.com/Cle2ment/opencode-agentmemory-launcher/actions/workflows/ci.yml/badge.svg)](https://github.com/Cle2ment/opencode-agentmemory-launcher/actions/workflows/ci.yml)

[English](/README.md) | [中文](/docs/README.zh.md) | [Français](/docs/README.fr.md)

## Prérequis

- **Node.js** ≥ 18.0.0
- **OpenCode V1** (`opencode` ≥ 1.17.10) ou **OpenCode V2** (`opencode2`) — le même paquet est compatible avec les deux hôtes
- Backend **agentmemory** (installé automatiquement via `npx @agentmemory/agentmemory` s’il n’est pas présent)

> **Remarque :** Ce plugin n’a été testé que sur Windows 11. Si vous avez besoin d’une prise en charge pour d’autres plateformes, les pull requests sont les bienvenues.

## Ce qu’il fait

Ce plugin démarre automatiquement le backend [agentmemory](https://github.com/rohitg00/agentmemory) (API REST + iii-engine) lorsqu’OpenCode charge sa configuration. Il s’exécute une seule fois par processus OpenCode et vérifie la santé du backend toutes les 60 secondes, en le redémarrant si le processus s’arrête.

## Installation

### Depuis npm (recommandé)

**OpenCode V1** — ajoutez-le à votre `opencode.json` (`plugin`, au singulier) :

```jsonc
{
  "plugin": ["opencode-agentmemory-launcher@latest"]
}
```

**OpenCode V2** — ajoutez-le à votre configuration (`plugins`, au pluriel) :

```jsonc
{
  "plugins": ["opencode-agentmemory-launcher@latest"]
}
```

OpenCode installera automatiquement le paquet au démarrage. Consultez la [documentation des plugins V1](https://opencode.ai/docs/en/plugins/) ou le [guide des plugins V2](https://opencode.ai/v2/docs/build/plugins) pour plus de détails.

Le même paquet fonctionne sur les deux hôtes via un export par défaut combiné : V1 appelle `server()`, V2 appelle `setup()`.

### Depuis un fichier local

Placez le fichier du plugin dans `.opencode/plugins/` :

```
.opencode/plugins/
└── agentmemory-launcher.ts
```

Les fichiers de ce répertoire sont automatiquement chargés au démarrage par V1 et V2.

### Installation manuelle (via GitHub Releases)

1. Téléchargez `agentmemory-launcher.ts` depuis la dernière [release GitHub](https://github.com/Cle2ment/opencode-agentmemory-launcher/releases)
2. Placez-le dans `.opencode/plugins/` :

```
.opencode/plugins/
└── agentmemory-launcher.ts
```

OpenCode charge automatiquement les fichiers `.ts` de `.opencode/plugins/` au démarrage.

## Utilisation

Ce launcher démarre le backend agentmemory. Pour utiliser agentmemory avec OpenCode, installez également le plugin agentmemory et reportez-vous au [guide d’utilisation du plugin agentmemory pour OpenCode](https://github.com/rohitg00/agentmemory/blob/main/plugin/opencode/README.md) pour les instructions de configuration, les outils disponibles et les options de configuration.

## Mise à jour

Pour mettre à jour agentmemory vers la dernière version :

```bash
npx @agentmemory/agentmemory upgrade
```

Après la mise à jour, arrêtez le processus agentmemory en cours et videz le cache npx :

**Windows (PowerShell) :**

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

Redémarrez OpenCode pour relancer agentmemory avec la version mise à jour.

## Comment ça fonctionne

1. **Au chargement** (V1 : premier appel du hook `config` ; V2 : `setup()`) : le plugin lance une boucle de contrôle de santé avec un intervalle de 60 s
2. **Contrôle de santé** : envoie une requête `GET /agentmemory/livez` au backend (public, sans authentification)
3. **Redémarrage automatique** : si le contrôle de santé échoue, lance `npx @agentmemory/agentmemory` dans un processus détaché
4. **Mode debug** : définissez `OPENCODE_AGENTMEMORY_DEBUG=1` pour une journalisation détaillée

## Variables d’environnement

| Variable | Valeur par défaut | Description |
|----------|-------------------|-------------|
| `AGENTMEMORY_URL` | `http://localhost:3111` | URL de l’API backend |
| `OPENCODE_AGENTMEMORY_DEBUG` | non définie | Mettez la variable à `1` pour activer la journalisation de debug |

## API

Le plugin est fourni sous forme de module à deux volets : l’export par défaut réunit les points d’entrée des deux hôtes, tandis qu’un export nommé préserve le plugin V1 classique pour les consommateurs existants.

```typescript
import type { Plugin } from "@opencode-ai/plugin";

// V1 entrypoint (named export, kept for back-compat)
export const AgentmemoryLauncherPlugin: Plugin;

// Combined dual-track default export
export default {
  id: "agentmemory-launcher",
  server: AgentmemoryLauncherPlugin, // called by OpenCode V1
  setup: async (context) => { /* start supervision; return cleanup */ }, // called by OpenCode V2
};
```

Sur V1, le plugin implémente le hook de cycle de vie `config` (appelé à chaque fois qu’OpenCode charge sa configuration), ainsi que le nettoyage via `event`/`dispose`. Sur V2, la supervision démarre dans `setup()` au chargement du plugin, et la fonction de nettoyage renvoyée arrête la boucle de contrôle de santé.

## Développement

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

## Communauté

- [Guide de contribution](./CONTRIBUTING.md)
- [Code de conduite](./CODE_OF_CONDUCT.md)
- [Politique de sécurité](./SECURITY.md)

## Licence

[GNU Affero General Public License v3.0](./LICENSE)

## Copyright

Copyright (C) 2026 Cle2ment.
