# Agentmemory Launcher pour OpenCode

> Plugin OpenCode qui démarre automatiquement le backend [agentmemory](https://github.com/rohitg00/agentmemory) avec une supervision par health-check.

[![npm version](https://img.shields.io/npm/v/opencode-agentmemory-launcher)](https://www.npmjs.com/package/opencode-agentmemory-launcher)
[![License](https://img.shields.io/npm/l/opencode-agentmemory-launcher)](./LICENSE)
[![Node.js](https://img.shields.io/node/v/opencode-agentmemory-launcher)](https://nodejs.org/)
[![CI](https://github.com/Cle2ment/opencode-agentmemory-launcher/actions/workflows/ci.yml/badge.svg)](https://github.com/Cle2ment/opencode-agentmemory-launcher/actions/workflows/ci.yml)

[English](/README.md) | [中文](/docs/README.zh.md) | [Français](/docs/README.fr.md)

## Prérequis

- **Node.js** ≥ 18.0.0
- **OpenCode V1** (`opencode` ≥ 1.17.10) ou **OpenCode V2** (`opencode2`) — le même package fonctionne avec les deux hôtes
- Backend **agentmemory** (auto-installé via `npx @agentmemory/agentmemory` s’il n’est pas présent)

> **Remarque :** Ce plugin n’a été testé que sur Windows 11. Si vous avez besoin de support pour d’autres plateformes, les pull requests sont les bienvenues.

## Ce qu’il fait

Ce plugin démarre automatiquement le backend [agentmemory](https://github.com/rohitg00/agentmemory) (API REST + iii-engine) lorsqu’OpenCode charge sa configuration. Il s’exécute une fois par processus OpenCode et vérifie l’état du backend toutes les 60 secondes, en le redémarrant si le processus meurt.

## Installation

### Depuis npm (recommandé)

**OpenCode V1** — ajoutez à votre `opencode.json` (`plugin`, au singulier) :

```jsonc
{
  "plugin": ["opencode-agentmemory-launcher@latest"]
}
```

**OpenCode V2** — ajoutez à votre configuration (`plugins`, au pluriel) :

```jsonc
{
  "plugins": ["opencode-agentmemory-launcher@latest"]
}
```

OpenCode installera automatiquement le package au démarrage. Voir la [documentation des plugins V1](https://opencode.ai/docs/en/plugins/) ou le [guide des plugins V2](https://opencode.ai/v2/docs/build/plugins) pour plus de détails.

Le même package est utilisé sur les deux hôtes grâce à un export par défaut combiné : V1 appelle `server()`, V2 appelle `setup()`.

### Depuis un fichier local

Placez le fichier du plugin dans `.opencode/plugins/` :

```
.opencode/plugins/
└── agentmemory-launcher.ts
```

Les fichiers de ce répertoire sont automatiquement chargés au démarrage par V1 et V2.

### Installation manuelle (depuis GitHub Releases)

1. Téléchargez `agentmemory-launcher.ts` depuis la dernière [GitHub Release](https://github.com/Cle2ment/opencode-agentmemory-launcher/releases)
2. Placez-le dans `.opencode/plugins/` :

```
.opencode/plugins/
└── agentmemory-launcher.ts
```

OpenCode charge automatiquement les fichiers `.ts` de `.opencode/plugins/` au démarrage.

## Utilisation

Ce lanceur démarre le backend agentmemory. Pour utiliser agentmemory avec OpenCode, installez également le plugin agentmemory et consultez le [guide d’utilisation du plugin agentmemory pour OpenCode](https://github.com/rohitg00/agentmemory/blob/main/plugin/opencode/README.md) pour les instructions de configuration, les outils disponibles et les options.

## Journaux

Le backend démarre silencieusement en arrière-plan ; sa sortie est capturée dans `~/.agentmemory/agentmemory.log`. Le fichier est tronqué à chaque démarrage du backend, il ne peut donc pas croître indéfiniment.

Afficher les journaux en direct — imprime les 200 dernières lignes et suit le fichier :

```bash
npx opencode-agentmemory-launcher
```

(ou `agentmemory-logs` si le package est installé globalement.)

- `agentmemory-logs --tab` — ouvrir l’affichage en direct dans un nouvel onglet de Windows Terminal
- `agentmemory-logs --lines N` — changer le nombre de lignes historiques imprimées
- `agentmemory-logs --no-follow` — imprimer la fin du fichier et quitter sans suivre

La visionneuse web d’agentmemory reste disponible sur http://localhost:3113.

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

1. **Au chargement** (V1 : premier appel du hook `config` · V2 : `setup()`) : le plugin démarre un intervalle de vérification de santé (60 s)
2. **Vérification de santé** : ping `GET /agentmemory/livez` sur le backend (public, sans authentification)
3. **Redémarrage automatique** : si la vérification échoue, lance `npx @agentmemory/agentmemory` comme processus d’arrière-plan caché (sortie capturée dans `~/.agentmemory/agentmemory.log`)
4. **Mode débogage** : définissez `OPENCODE_AGENTMEMORY_DEBUG=1` pour des journaux détaillés

## Variables d’environnement

| Variable | Défaut | Description |
|----------|---------|-------------|
| `AGENTMEMORY_URL` | `http://localhost:3111` | URL de l’API backend |
| `OPENCODE_AGENTMEMORY_DEBUG` | non définie | Définir à `1` pour activer la journalisation de débogage |

## API

Le plugin embarque un module à double piste : l’export par défaut contient les deux points d’entrée des hôtes, et un export nommé conserve le plugin V1 classique pour les consommateurs existants.

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

Sur V1, le plugin implémente le hook de cycle de vie `config` (appelé à chaque chargement de la configuration d’OpenCode) ainsi qu’un nettoyage via `event`/`dispose`. Sur V2, la supervision démarre dans `setup()` au chargement du plugin, et la fonction de nettoyage retournée arrête la boucle de vérification de santé.

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

[Licence publique générale GNU Affero v3.0](./LICENSE)

## Droits d’auteur

Copyright (C) 2026 Cle2ment.
