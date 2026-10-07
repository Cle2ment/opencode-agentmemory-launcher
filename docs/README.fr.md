# Lanceur agentmemory pour OpenCode

> Plugin OpenCode qui démarre automatiquement le backend [agentmemory](https://github.com/rohitg00/agentmemory) avec une supervision par health-check.

[![npm version](https://img.shields.io/npm/v/opencode-agentmemory-launcher)](https://www.npmjs.com/package/opencode-agentmemory-launcher)
[![License](https://img.shields.io/npm/l/opencode-agentmemory-launcher)](./LICENSE)
[![Node.js](https://img.shields.io/node/v/opencode-agentmemory-launcher)](https://nodejs.org/)
[![CI](https://github.com/Cle2ment/opencode-agentmemory-launcher/actions/workflows/ci.yml/badge.svg)](https://github.com/Cle2ment/opencode-agentmemory-launcher/actions/workflows/ci.yml)

[English](/README.md) | [中文](/docs/README.zh.md) | [Français](/docs/README.fr.md)

## Prérequis

- **OpenCode V2** (`opencode2`)
- **Node.js** ≥ 18.0.0 pour le plugin lui-même ; le backend agentmemory 0.9.30 nécessite **Node.js ≥ 20.0.0**
- Backend **agentmemory** (installé automatiquement via `npx @agentmemory/agentmemory` s'il n'est pas présent)

> **Utilisateurs de V1 :** OpenCode V1 (`opencode` 1.x) n'est plus pris en charge à partir de la v4.0.0 — épinglez `opencode-agentmemory-launcher@^3` si vous avez encore besoin de V1.

> **Remarque :** Ce plugin n'a été testé que sur Windows 11. Si vous avez besoin d'un support pour d'autres plateformes, les pull requests sont les bienvenues.

## Ce qu'il fait

Ce plugin démarre automatiquement le backend [agentmemory](https://github.com/rohitg00/agentmemory) (REST API + iii-engine) lorsque OpenCode charge sa configuration. Il s'exécute une fois par processus OpenCode et effectue un health-check du backend toutes les 60 secondes, en le redémarrant si le processus s'arrête.

## Compatibilité

Conçu pour **agentmemory 0.9.30** (2026-10-06) et rétrocompatible avec les versions antérieures :

- **L'authentification est activée par défaut.** agentmemory génère un secret dans `~/.agentmemory/secret` au premier démarrage. Le lanceur n'appelle que le point de terminaison toujours public `/agentmemory/livez`, il n'a donc besoin d'aucun secret et n'est pas affecté. Les appels REST écrits à la main vers `:3111` nécessitent désormais `Authorization: Bearer $(cat ~/.agentmemory/secret)`.
- **iii-engine 0.22.1.** agentmemory 0.9.30 a déplacé l'épinglage de son moteur de `0.11.2` à `0.22.1` et l'impose. Le lanceur ne gère pas le moteur (c'est la CLI agentmemory qui le fait), mais une version épinglée incompatible fait désormais quitter la CLI avec le code 1 — le lanceur le signale comme un `warn`.
- **La version la plus récente l'emporte.** Sur Windows, le lanceur démarre la version la plus récente d'agentmemory qu'il peut trouver dans le cache npx **ou une installation globale sur le `PATH`**, de sorte que `npm i -g @agentmemory/agentmemory@latest` prend effet sans vider le cache npx.

## Installation

### Depuis npm (recommandé)

Ajoutez à votre configuration OpenCode (`plugins`, au pluriel) :

```jsonc
{
  "plugins": ["opencode-agentmemory-launcher@latest"]
}
```

OpenCode installera automatiquement le package au démarrage. Consultez le [guide des plugins V2](https://opencode.ai/v2/docs/build/plugins) pour plus de détails.

### Depuis un fichier local

Placez le fichier du plugin dans `.opencode/plugins/` :

```
.opencode/plugins/
└── agentmemory-launcher.ts
```

Les fichiers de ce répertoire sont automatiquement chargés au démarrage.

### Installation manuelle (depuis les releases GitHub)

1. Téléchargez `agentmemory-launcher.ts` depuis la dernière [release GitHub](https://github.com/Cle2ment/opencode-agentmemory-launcher/releases)
2. Placez-le dans `.opencode/plugins/` :

```
.opencode/plugins/
└── agentmemory-launcher.ts
```

OpenCode charge automatiquement les fichiers `.ts` de `.opencode/plugins/` au démarrage.

## Utilisation

Ce lanceur démarre le backend agentmemory. Pour utiliser agentmemory avec OpenCode, installez également le plugin agentmemory et consultez le [guide d'utilisation du plugin agentmemory pour OpenCode](https://github.com/rohitg00/agentmemory/blob/main/plugin/opencode/README.md) pour les instructions d'installation, les outils disponibles et les options de configuration.

## Mise à jour

Pour mettre à jour agentmemory vers la dernière version :

```bash
npx @agentmemory/agentmemory upgrade
```

Si vous avez installé agentmemory globalement, mettez plutôt à jour cette copie avec `npm i -g @agentmemory/agentmemory@latest` — le lanceur choisit la version la plus récente parmi le cache npx et les installations globales.

Après la mise à jour, arrêtez le processus agentmemory en cours d'exécution et videz le cache npx :

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

## Fonctionnement

1. **Au chargement** (`setup()`) : le plugin démarre un intervalle de health-check (60s)
2. **Health check** : effectue un ping `GET /agentmemory/livez` sur le backend (toujours public, sans authentification — même avec l'authentification par défaut d'agentmemory 0.9.30)
3. **Redémarrage automatique** : si le health-check échoue, lance la CLI agentmemory en mode détaché. Sur Windows, le plugin contourne entièrement npx/cmd — il résout le **plus récent** `dist/cli.mjs` qu'il peut trouver dans le cache npx ou une installation globale sur le `PATH`, et lance `node` directement dessus, de sorte que l'arbre de processus (node → cli.mjs → iii.exe) ne touche jamais cmd.exe et n'alloue jamais de console : aucune fenêtre/onglet de terminal n'apparaît et le focus n'est pas volé (le simple `windowsHide` est insuffisant car chaque saut par cmd.exe permet à un petit-fils d'allouer une nouvelle console). Revient à un lancement via npx lorsqu'aucune copie locale n'est trouvée. Les relances sont limitées par une fenêtre de grâce de 90s au démarrage ainsi qu'un verrou de lancement inter-instances (plusieurs serveurs OpenCode partagent un seul backend)
4. **Mode debug** : définissez `OPENCODE_AGENTMEMORY_DEBUG=1` pour une journalisation détaillée
5. **Diagnostic des échecs** : un lancement de backend qui se termine avec un code non nul est journalisé en `warn` — par ex. lorsque agentmemory 0.9.30 rejette une version épinglée d'iii-engine incompatible avec le code de sortie 1

## Variables d'environnement

| Variable | Valeur par défaut | Description |
|----------|---------|-------------|
| `AGENTMEMORY_URL` | `http://localhost:3111` | URL de l'API backend |
| `OPENCODE_AGENTMEMORY_DEBUG` | non définie | Définir à `1` pour la journalisation de debug |

## Dépannage

**Le backend ne démarre jamais et le log affiche une sortie de lancement non nulle.**
agentmemory 0.9.30 impose l'épinglage de son iii-engine (v0.22.1). Si un moteur différent se trouve sur le `PATH`, la CLI se termine avec le code 1. Exécutez-la manuellement pour voir l'erreur :

```bash
npx @agentmemory/agentmemory doctor
```

**Une version plus récente d'agentmemory est installée mais le lanceur continue d'en exécuter une plus ancienne.**
Le lanceur privilégie la version la plus récente parmi le cache npx et les installations globales ; si une copie obsolète l'emporte encore, videz le cache :

```bash
npx clear-npx-cache
```

## API

Le plugin cible l'API de plugin OpenCode V2 (`@opencode/plugin` >= 2.0.18). La supervision démarre dans `setup()` lors du chargement du plugin, et la fonction de nettoyage renvoyée arrête la boucle de health-check lors du déchargement.

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
