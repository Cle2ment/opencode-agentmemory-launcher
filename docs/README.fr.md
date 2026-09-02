# Lanceur Agentmemory pour OpenCode

> Plugin OpenCode qui démarre automatiquement le backend [agentmemory](https://github.com/rohitg00/agentmemory) avec supervision par contrôle de santé.

[![npm version](https://img.shields.io/npm/v/opencode-agentmemory-launcher)](https://www.npmjs.com/package/opencode-agentmemory-launcher)
[![License](https://img.shields.io/npm/l/opencode-agentmemory-launcher)](./LICENSE)
[![Node.js](https://img.shields.io/node/v/opencode-agentmemory-launcher)](https://nodejs.org/)
[![CI](https://github.com/Cle2ment/opencode-agentmemory-launcher/actions/workflows/ci.yml/badge.svg)](https://github.com/Cle2ment/opencode-agentmemory-launcher/actions/workflows/ci.yml)

[English](/README.md) | [中文](/docs/README.zh.md) | [Français](/docs/README.fr.md)

## Prérequis

- **Node.js** ≥ 18.0.0
- **OpenCode V1** (`opencode` ≥ 1.17.10) ou **OpenCode V2** (`opencode2`) — le même package sert les deux hôtes
- Backend **agentmemory** (installé automatiquement via `npx @agentmemory/agentmemory` s'il n'est pas présent)

> **Remarque :** Ce plugin n'a été testé que sur Windows 11. Si vous avez besoin d'un support pour d'autres plateformes, les pull requests sont les bienvenues.

## Ce qu'il fait

Ce plugin démarre automatiquement le backend [agentmemory](https://github.com/rohitg00/agentmemory) (API REST + moteur iii) lorsqu'OpenCode charge sa configuration. Il s'exécute une fois par processus OpenCode et vérifie l'état de santé du backend toutes les 60 secondes, le redémarrant si le processus meurt.

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

OpenCode installera automatiquement le package au démarrage. Consultez la [documentation des plugins V1](https://opencode.ai/docs/en/plugins/) ou le [guide des plugins V2](https://opencode.ai/v2/docs/build/plugins) pour plus de détails.

Le même package fonctionne sur les deux hôtes grâce à un export par défaut combiné : V1 appelle `server()`, V2 appelle `setup()`.

### Depuis un fichier local

Placez le fichier du plugin dans `.opencode/plugins/` :

```
.opencode/plugins/
└── agentmemory-launcher.ts
```

Les fichiers de ce répertoire sont automatiquement chargés au démarrage par V1 et V2.

### Installation manuelle (depuis les versions GitHub)

1. Téléchargez `agentmemory-launcher.ts` depuis la dernière [version GitHub](https://github.com/Cle2ment/opencode-agentmemory-launcher/releases)
2. Placez-le dans `.opencode/plugins/` :

```
.opencode/plugins/
└── agentmemory-launcher.ts
```

OpenCode charge automatiquement les fichiers `.ts` depuis `.opencode/plugins/` au démarrage.

## Utilisation

Ce lanceur démarre le backend agentmemory. Pour utiliser agentmemory avec OpenCode, installez également le plugin agentmemory et consultez le [guide d'utilisation du plugin agentmemory pour OpenCode](https://github.com/rohitg00/agentmemory/blob/main/plugin/opencode/README.md) pour les instructions d'installation, les outils disponibles et les options de configuration.

## Mise à jour

Pour mettre à jour agentmemory vers la dernière version :

```bash
npx @agentmemory/agentmemory upgrade
```

Après la mise à jour, arrêtez le processus agentmemory en cours d'exécution et videz le cache npx :

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

## Comment cela fonctionne

1. **Au chargement** (V1 : premier appel au hook `config` · V2 : `setup()`) : le plugin démarre une boucle de contrôle de santé (60 s)
2. **Contrôle de santé** : envoie une requête `GET /agentmemory/livez` au backend (public, sans authentification)
3. **Redémarrage automatique** : si le contrôle de santé échoue, lance `npx @agentmemory/agentmemory` dans un processus détaché
4. **Mode débogage** : définissez `OPENCODE_AGENTMEMORY_DEBUG=1` pour une journalisation détaillée

## Variables d'environnement

| Variable | Défaut | Description |
|----------|---------|-------------|
| `AGENTMEMORY_URL` | `http://localhost:3111` | URL de l'API backend |
| `OPENCODE_AGENTMEMORY_DEBUG` | non défini | Définissez à `1` pour la journalisation de débogage |

## API

Le plugin offre un module à double voie : l'export par défaut contient les deux points d'entrée des hôtes, et un export nommé préserve le plugin V1 classique pour les consommateurs existants.

```typescript
import type { Plugin } from "@opencode-ai/plugin";

// Point d'entrée V1 (export nommé, conservé pour la rétrocompatibilité)
export const AgentmemoryLauncherPlugin: Plugin;

// Export par défaut combiné à double voie
export default {
  id: "agentmemory-launcher",
  server: AgentmemoryLauncherPlugin, // appelé par OpenCode V1
  setup: async (context) => { /* démarrer la supervision ; retourner le nettoyage */ }, // appelé par OpenCode V2
};
```

Sur V1, le plugin implémente le hook de cycle de vie `config` (appelé à chaque chargement de la configuration d'OpenCode) ainsi que le nettoyage `event`/`dispose`. Sur V2, la supervision démarre dans `setup()` au chargement du plugin, et la fonction de nettoyage retournée arrête la boucle de contrôle de santé.

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
