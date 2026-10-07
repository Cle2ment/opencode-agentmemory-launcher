# Agentmemory Launcher pour OpenCode

> Plugin OpenCode qui démarre automatiquement le backend [agentmemory](https://github.com/rohitg00/agentmemory) avec supervision par health-check.

[![npm version](https://img.shields.io/npm/v/opencode-agentmemory-launcher)](https://www.npmjs.com/package/opencode-agentmemory-launcher)
[![License](https://img.shields.io/npm/l/opencode-agentmemory-launcher)](./LICENSE)
[![Node.js](https://img.shields.io/node/v/opencode-agentmemory-launcher)](https://nodejs.org/)
[![CI](https://github.com/Cle2ment/opencode-agentmemory-launcher/actions/workflows/ci.yml/badge.svg)](https://github.com/Cle2ment/opencode-agentmemory-launcher/actions/workflows/ci.yml)

[English](/README.md) | [中文](/docs/README.zh.md) | [Français](/docs/README.fr.md)

## Prérequis

- **OpenCode V2** (`opencode2`)
- **Node.js** ≥ 18.0.0 pour le plugin lui-même ; le backend agentmemory 0.9.30 requiert **Node.js ≥ 20.0.0**
- Le backend **agentmemory** (installé automatiquement via `npx @agentmemory/agentmemory` s'il n'est pas présent)

> **Utilisateurs de la V1 :** OpenCode V1 (`opencode` 1.x) n'est plus pris en charge à partir de la v4.0.0 — épinglez `opencode-agentmemory-launcher@^3` si vous avez encore besoin de la V1.

> **Remarque :** Ce plugin a uniquement été testé sous Windows 11. Si vous avez besoin d'un support pour d'autres plateformes, les pull requests sont les bienvenues.

## Ce qu'il fait

Ce plugin démarre automatiquement le backend [agentmemory](https://github.com/rohitg00/agentmemory) (REST API + iii-engine) lorsque OpenCode charge sa configuration. Il s'exécute une fois par processus OpenCode et effectue un health-check du backend toutes les 60 secondes, en le redémarrant si le processus meurt.

## Compatibilité

Conçu pour **agentmemory 0.9.30** (2026-10-06) et rétrocompatible avec les versions antérieures :

- **L'authentification est activée par défaut.** agentmemory génère un secret dans `~/.agentmemory/secret` au premier démarrage. Le lanceur appelle uniquement `/agentmemory/livez`, qui est toujours public, donc il n'a pas besoin de secret et n'est pas affecté. Les appels REST écrits à la main vers `:3111` nécessitent désormais `Authorization: Bearer $(cat ~/.agentmemory/secret)`.
- **iii-engine 0.22.1.** agentmemory 0.9.30 a déplacé son épinglage de moteur de `0.11.2` à `0.22.1` et l'impose. Le lanceur ne gère pas le moteur (c'est le CLI agentmemory qui le fait), mais un épinglage incompatible fait désormais quitter le CLI avec le code 1 — le lanceur remonte cela comme un `warn`.
- **La version la plus récente gagne.** Sous Windows, le lanceur démarre l'agentmemory le plus récent qu'il peut trouver dans le cache npx **ou une installation globale sur le `PATH`**, afin que `npm i -g @agentmemory/agentmemory@latest` prenne effet sans vider le cache npx.

## Installation

### Depuis npm (recommandé)

Ajoutez à votre configuration OpenCode (`plugins`, au pluriel) :

```jsonc
{
  "plugins": ["opencode-agentmemory-launcher@latest"]
}
```

OpenCode installera automatiquement le paquet au démarrage. Consultez le [guide des plugins V2](https://opencode.ai/v2/docs/build/plugins) pour plus de détails.

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

Ce lanceur démarre le backend agentmemory. Pour utiliser agentmemory avec OpenCode, installez également le plugin agentmemory et consultez le [guide d'utilisation du plugin agentmemory pour OpenCode](https://github.com/rohitg00/agentmemory/blob/main/plugin/opencode/README.md) pour les instructions de configuration, les outils disponibles et les options de configuration.

## Mise à jour

Pour mettre à jour agentmemory vers la dernière version :

```bash
npx @agentmemory/agentmemory upgrade
```

Si vous avez installé agentmemory globalement, mettez à jour cette copie à la place avec `npm i -g @agentmemory/agentmemory@latest` — le lanceur sélectionne la version la plus récente entre le cache npx et les installations globales.

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

## Comment ça fonctionne

1. **Au chargement** (`setup()`) : le plugin démarre un intervalle de health-check (60 s)
2. **Health check** : Ping `GET /agentmemory/livez` sur le backend (toujours public, sans auth — même avec l'auth par défaut d'agentmemory 0.9.30)
3. **Redémarrage automatique (deux modes)** : Si le health check échoue, le backend est lancé.
   - **Démarrage** (backend arrêté au chargement du plugin) : ouvre un onglet visible du Windows Terminal intitulé `agentmemory` (`wt -w 0 nt --title agentmemory …`), afin que le démarrage du backend soit visible. Le focus est pris une seule fois ici — acceptable au démarrage, et jamais sur le chemin de récupération. Bascule vers le chemin silencieux lorsque `wt.exe` n'est pas disponible.
   - **Récupération** (chaque (re)lancement ultérieur depuis la boucle de 60 s) : totalement silencieux. Sous Windows, le plugin contourne entièrement npx/cmd — il résout le **plus récent** `dist/cli.mjs` qu'il peut trouver dans le cache npm/npx ou une installation globale sur le `PATH`, et lance `node` directement sur celui-ci, afin que l'arbre de processus (node → cli.mjs → iii.exe) ne touche jamais cmd.exe et n'alloue jamais de console : aucune fenêtre/onglet et aucun vol de focus, en pleine session ou au repos (`windowsHide` seul est insuffisant car chaque saut via cmd.exe permet à un petit-fils d'allouer une nouvelle console). Bascule vers un spawn npx lorsqu'aucune copie locale n'est trouvée. Les relances sont limitées par une fenêtre de grâce de démarrage de 90 s ainsi qu'un verrou de lancement inter-instances (plusieurs serveurs OpenCode partagent un seul backend)
4. **Mode debug** : Définissez `OPENCODE_AGENTMEMORY_DEBUG=1` pour une journalisation verbeuse
5. **Diagnostic d'échec** : Un lancement de backend qui se termine avec un code non nul est journalisé en `warn` avec les causes probables — un daemon répondant déjà sur le port (agentmemory 0.9.30 refuse de démarrer une seconde instance) ou l'incompatibilité d'épinglage iii-engine imposée. Un onglet de démarrage visible dont le processus se termine avec un code non nul reste ouvert (`closeOnExit: graceful` du Windows Terminal) afin que le texte d'erreur reste lisible

## Variables d'environnement

| Variable | Valeur par défaut | Description |
|----------|---------|-------------|
| `AGENTMEMORY_URL` | `http://localhost:3111` | URL de l'API du backend |
| `OPENCODE_AGENTMEMORY_DEBUG` | non défini | Réglez sur `1` pour la journalisation de debug |

## Dépannage

**Le backend ne démarre jamais et le log affiche un code de sortie de lancement non nul.**
Deux causes courantes : agentmemory 0.9.30 impose son épinglage iii-engine (v0.22.1), donc un moteur différent sur le `PATH` fait quitter le CLI avec le code 1 ; ou une instance obsolète détient toujours le port. Exécutez-le manuellement pour voir l'erreur réelle :

```bash
npx @agentmemory/agentmemory doctor
```

**Un onglet de démarrage visible affiche `agentmemory worker did not become ready within 15s` et se termine avec le code 1.**
Une instance obsolète d'une session précédente détient toujours le port REST, donc le nouveau CLI démarre son moteur mais son enregistrement de worker ne devient jamais prêt — un démarrage sain se termine en ~2 s. Identifiez la ou les instances restantes et arrêtez-les, puis laissez la boucle de supervision du lanceur les relancer :

```powershell
Get-NetTCPConnection -LocalPort 3111 -State Listen   # who owns the port
npx @agentmemory/agentmemory stop                     # stop the instance it belongs to
```

**Une version plus récente d'agentmemory est installée mais le lanceur continue d'en exécuter une plus ancienne.**
Le lanceur privilégie la version la plus récente entre le cache npx et les installations globales ; si une copie obsolète gagne encore, videz le cache :

```bash
npx clear-npx-cache
```

## API

Le plugin cible l'API plugin d'OpenCode V2 (`@opencode/plugin` >= 2.0.18). La supervision démarre dans `setup()` lorsque le plugin se charge, et la fonction de nettoyage renvoyée arrête la boucle de health-check au déchargement.

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
