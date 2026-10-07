# Agentmemory Launcher pour OpenCode

> Plugin OpenCode qui démarre automatiquement le backend [agentmemory](https://github.com/rohitg00/agentmemory) avec une supervision par health-check.

[![npm version](https://img.shields.io/npm/v/opencode-agentmemory-launcher)](https://www.npmjs.com/package/opencode-agentmemory-launcher)
[![License](https://img.shields.io/npm/l/opencode-agentmemory-launcher)](./LICENSE)
[![Node.js](https://img.shields.io/node/v/opencode-agentmemory-launcher)](https://nodejs.org/)
[![CI](https://github.com/Cle2ment/opencode-agentmemory-launcher/actions/workflows/ci.yml/badge.svg)](https://github.com/Cle2ment/opencode-agentmemory-launcher/actions/workflows/ci.yml)

[English](/README.md) | [中文](/docs/README.zh.md) | [Français](/docs/README.fr.md)

## Prérequis

- **OpenCode V2** (`opencode2`)
- **Node.js** ≥ 18.0.0 pour le plugin lui-même ; le backend agentmemory 0.9.30 nécessite **Node.js ≥ 20.0.0**
- Backend **agentmemory** (auto-installé via `npx @agentmemory/agentmemory` s'il n'est pas présent)

> **Utilisateurs de la V1 :** OpenCode V1 (`opencode` 1.x) n'est plus pris en charge à partir de la v4.0.0 — épinglez `opencode-agentmemory-launcher@^3` si vous avez encore besoin de la V1.

> **Remarque :** Ce plugin n'a été testé que sur Windows 11. Si vous souhaitez un support pour d'autres plateformes, les pull requests sont les bienvenues.

## Ce qu'il fait

Ce plugin démarre automatiquement le backend [agentmemory](https://github.com/rohitg00/agentmemory) (REST API + iii-engine) lorsque OpenCode charge sa configuration. Il s'exécute une fois par processus OpenCode et effectue un health-check du backend toutes les 60 secondes, en le redémarrant si le processus meurt.

## Compatibilité

Conçu pour **agentmemory 0.9.30** (2026-10-06) et rétrocompatible avec les versions antérieures :

- **L'authentification est activée par défaut.** agentmemory génère un secret dans `~/.agentmemory/secret` au premier démarrage. Le launcher n'appelle que `/agentmemory/livez`, toujours public, donc il n'a besoin d'aucun secret et n'est pas affecté. Les appels REST écrits à la main vers `:3111` nécessitent désormais `Authorization: Bearer $(cat ~/.agentmemory/secret)`.
- **iii-engine 0.22.1.** agentmemory 0.9.30 a déplacé son épinglage de moteur de `0.11.2` à `0.22.1` et l'impose. Le launcher ne gère pas le moteur (c'est le CLI agentmemory qui s'en charge), mais un épinglage non concordant fait maintenant quitter le CLI avec le code 1 — le launcher le signale comme un `warn`.
- **La version la plus récente l'emporte.** Sur Windows, le launcher démarre l'agentmemory le plus récent qu'il peut trouver dans le cache npx **ou une installation globale sur le `PATH`**, donc `npm i -g @agentmemory/agentmemory@latest` prend effet sans vider le cache npx.

## Installation

### Depuis npm (recommandé)

Ajoutez à votre config OpenCode (`plugins`, au pluriel) :

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

### Installation manuelle (depuis les GitHub Releases)

1. Téléchargez `agentmemory-launcher.ts` depuis la dernière [GitHub Release](https://github.com/Cle2ment/opencode-agentmemory-launcher/releases)
2. Placez-le dans `.opencode/plugins/` :

```
.opencode/plugins/
└── agentmemory-launcher.ts
```

OpenCode charge automatiquement les fichiers `.ts` de `.opencode/plugins/` au démarrage.

## Utilisation

Ce launcher démarre le backend agentmemory. Pour utiliser agentmemory avec OpenCode, installez également le plugin agentmemory et consultez le [guide d'utilisation du plugin agentmemory pour OpenCode](https://github.com/rohitg00/agentmemory/blob/main/plugin/opencode/README.md) pour les instructions de configuration, les outils disponibles et les options de configuration.

## Mise à jour

Pour mettre à jour agentmemory vers la dernière version :

```bash
npx @agentmemory/agentmemory upgrade
```

Si vous avez installé agentmemory globalement, mettez plutôt à jour cette copie avec `npm i -g @agentmemory/agentmemory@latest` — le launcher sélectionne la version la plus récente entre le cache npx et les installations globales.

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

## Fonctionnement

1. **Au chargement** (`setup()`) : le plugin démarre un intervalle de health-check (60s)
2. **Health check** : effectue un ping sur `GET /agentmemory/livez` du backend (toujours public, sans authentification — même avec l'authentification par défaut d'agentmemory 0.9.30)
3. **Redémarrage automatique (deux modes)** : si le health-check échoue, le backend est lancé.
   - **Démarrage** (backend arrêté au chargement du plugin) : ouvre un onglet Windows Terminal visible intitulé `agentmemory` (`wt -w 0 nt --title agentmemory …`), afin que le démarrage du backend soit visible. Le focus est pris une seule fois ici — acceptable au démarrage, et jamais sur le chemin de récupération. Bascule vers le chemin silencieux lorsque `wt.exe` est indisponible.
   - **Récupération** (à chaque (re)lancement ultérieur depuis la boucle de 60s) : totalement silencieux. Sur Windows, le plugin contourne entièrement npx/cmd — il résout le `dist/cli.mjs` **le plus récent** qu'il peut trouver dans le cache npm/npx ou une installation globale sur le `PATH`, et lance directement `node` dessus, de sorte que l'arborescence des processus (node → cli.mjs → iii.exe) ne touche jamais à cmd.exe et n'alloue jamais de console : aucune fenêtre/onglet et aucun vol de focus, en pleine session ou au repos (un simple `windowsHide` est insuffisant car chaque saut par cmd.exe permet à un petit-enfant d'allouer une nouvelle console). Bascule vers un lancement npx lorsqu'aucune copie locale n'est trouvée. Les relances sont limitées par une fenêtre de grâce de démarrage de 90s plus un verrou de lancement inter-instances (plusieurs serveurs OpenCode partagent un seul backend)
4. **Mode debug** : définissez `OPENCODE_AGENTMEMORY_DEBUG=1` pour une journalisation détaillée
5. **Diagnostic des échecs** : un lancement de backend qui se termine avec un code non nul est journalisé au niveau `warn` avec les causes probables — un daemon répondant déjà sur le port (agentmemory 0.9.30 refuse de démarrer une seconde instance) ou l'épinglage iii-engine imposé qui ne concorde pas. Un onglet de démarrage visible dont le processus se termine avec un code non nul reste ouvert (`closeOnExit: graceful` de Windows Terminal) afin que le texte de l'erreur reste lisible

## Variables d'environnement

| Variable | Par défaut | Description |
|----------|---------|-------------|
| `AGENTMEMORY_URL` | `http://localhost:3111` | URL de l'API backend |
| `OPENCODE_AGENTMEMORY_DEBUG` | non défini | Définir à `1` pour la journalisation de debug |

## Dépannage

**Le backend ne démarre jamais et le log affiche un lancement terminé avec un code non nul.**
agentmemory 0.9.30 impose son épinglage iii-engine (v0.22.1). Si un moteur différent est sur le `PATH`, le CLI se termine avec le code 1. Lancez-le manuellement pour voir l'erreur :

```bash
npx @agentmemory/agentmemory doctor
```

**Une version plus récente d'agentmemory est installée mais le launcher continue d'en exécuter une plus ancienne.**
Le launcher privilégie la version la plus récente entre le cache npx et les installations globales ; si une copie obsolète l'emporte encore, videz le cache :

```bash
npx clear-npx-cache
```

## API

Le plugin cible l'API des plugins OpenCode V2 (`@opencode/plugin` >= 2.0.18). La supervision démarre dans `setup()` lorsque le plugin se charge, et la fonction de nettoyage retournée arrête la boucle de health-check au déchargement.

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
