# Agentmemory Launcher pour OpenCode

> Plugin OpenCode qui démarre automatiquement le backend [agentmemory](https://github.com/rohitg00/agentmemory) avec supervision par health-check.

[![npm version](https://img.shields.io/npm/v/opencode-agentmemory-launcher)](https://www.npmjs.com/package/opencode-agentmemory-launcher)
[![License](https://img.shields.io/npm/l/opencode-agentmemory-launcher)](./LICENSE)
[![Node.js](https://img.shields.io/node/v/opencode-agentmemory-launcher)](https://nodejs.org/)
[![CI](https://github.com/Cle2ment/opencode-agentmemory-launcher/actions/workflows/ci.yml/badge.svg)](https://github.com/Cle2ment/opencode-agentmemory-launcher/actions/workflows/ci.yml)

[English](/README.md) | [中文](/docs/README.zh.md) | [Français](/docs/README.fr.md)

## Prérequis

- **OpenCode V2** (`opencode2`)
- **Node.js** ≥ 18.0.0 pour le plugin lui-même ; le backend agentmemory 0.9.30 nécessite **Node.js ≥ 20.0.0**
- Backend **agentmemory** (installé automatiquement via `npx @agentmemory/agentmemory` s'il est absent)

> **Utilisateurs de V1 :** OpenCode V1 (`opencode` 1.x) n'est plus pris en charge à partir de la v4.0.0 — épinglez `opencode-agentmemory-launcher@^3` si vous avez encore besoin de V1.

> **Remarque :** Ce plugin n'a été testé que sur Windows 11. Si vous avez besoin d'une prise en charge d'autres plateformes, les pull requests sont les bienvenues.

## Ce qu'il fait

Ce plugin démarre automatiquement le backend [agentmemory](https://github.com/rohitg00/agentmemory) (REST API + iii-engine) lorsque OpenCode charge sa configuration. Il s'exécute une fois par processus OpenCode et vérifie l'état du backend toutes les 60 secondes, en le redémarrant si le processus s'arrête.

## Compatibilité

Conçu pour **agentmemory 0.9.30** (2026-10-06) et rétrocompatible avec les versions antérieures :

- **L'authentification est activée par défaut.** agentmemory génère un secret dans `~/.agentmemory/secret` au premier démarrage. Le launcher n'appelle que `/agentmemory/livez`, toujours public, il n'a donc besoin d'aucun secret et n'est pas affecté. Les appels REST écrits à la main vers `:3111` nécessitent désormais `Authorization: Bearer $(cat ~/.agentmemory/secret)`.
- **iii-engine 0.22.1.** agentmemory 0.9.30 a fait passer son épinglage de moteur de `0.11.2` à `0.22.1` et l'impose. Le launcher ne gère pas le moteur (c'est le CLI d'agentmemory qui s'en charge), mais un épinglage non concordant fait désormais quitter le CLI avec le code 1 — le launcher le signale comme un `warn`.
- **La version la plus récente l'emporte.** Sur Windows, le launcher démarre l'agentmemory le plus récent qu'il peut trouver dans le cache npx **ou une installation globale sur le `PATH`**, de sorte que `npm i -g @agentmemory/agentmemory@latest` prend effet sans vider le cache npx.

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

Si vous avez installé agentmemory globalement, mettez à jour cette copie à la place avec `npm i -g @agentmemory/agentmemory@latest` — le launcher choisit la version la plus récente entre le cache npx et les installations globales.

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
2. **Health check** : effectue un ping sur `GET /agentmemory/livez` du backend (toujours public, sans authentification — même avec l'authentification par défaut d'agentmemory 0.9.30)
3. **Redémarrage automatique (deux modes)** : si le health check échoue, le backend est lancé.
   - **Démarrage** (backend arrêté lors du chargement du plugin) : ouvre un onglet Windows Terminal visible intitulé `agentmemory` (`wt -w 0 nt --title agentmemory --suppressApplicationTitle node <cli>`) — Windows Terminal lance `node` lui-même, donc aucun shell cmd/pwsh n'est impliqué. Le démarrage du backend est visible ; le focus est pris une seule fois ici — acceptable au démarrage, et jamais sur le chemin de récupération. Revient au chemin silencieux lorsque `wt.exe` n'est pas disponible.
   - **Récupération** (chaque (re)lancement ultérieur depuis la boucle de 60s) : entièrement silencieux. Sur Windows, le plugin contourne entièrement npx/cmd — il résout le **plus récent** `dist/cli.mjs` qu'il peut trouver dans le cache npm/npx ou une installation globale sur le `PATH`, et lance `node` directement dessus, de sorte que l'arborescence des processus (node → cli.mjs → iii.exe) ne touche jamais cmd.exe et n'alloue jamais de console : aucune fenêtre/onglet et aucune prise de focus, en pleine session ou au repos (`windowsHide` seul est insuffisant car chaque saut par cmd.exe permet à un petit-enfant d'allouer une nouvelle console). Revient à un lancement npx lorsqu'aucune copie locale n'est trouvée. Les relances sont limitées par une fenêtre de grâce de démarrage de 90s ainsi qu'un verrou de lancement inter-instances (plusieurs serveurs OpenCode partagent un seul backend)
4. **Mode debug** : définissez `OPENCODE_AGENTMEMORY_DEBUG=1` pour une journalisation détaillée
5. **Diagnostic des échecs** : un lancement de backend qui se termine avec un code non nul est journalisé au niveau `warn` avec les causes probables — un daemon répondant déjà sur le port (agentmemory 0.9.30 refuse de démarrer une seconde instance) ou la non-concordance de l'épinglage iii-engine imposé. Un onglet de démarrage visible dont le processus se termine avec un code non nul reste ouvert (`closeOnExit: graceful` de Windows Terminal) afin que le texte de l'erreur reste lisible

## Variables d'environnement

| Variable | Par défaut | Description |
|----------|---------|-------------|
| `AGENTMEMORY_URL` | `http://localhost:3111` | URL de l'API du backend |
| `OPENCODE_AGENTMEMORY_DEBUG` | non défini | Définir à `1` pour la journalisation de debug |

## Dépannage

**Le backend ne démarre jamais et le log affiche une sortie de lancement avec un code non nul.**
Deux causes courantes : agentmemory 0.9.30 impose son épinglage iii-engine (v0.22.1), donc un moteur différent sur le `PATH` fait quitter le CLI avec le code 1 ; ou une instance obsolète occupe toujours le port. Exécutez-le manuellement pour voir l'erreur réelle :

```bash
npx @agentmemory/agentmemory doctor
```

**Un onglet de démarrage visible affiche `agentmemory worker did not become ready within 15s` et se termine avec le code 1.**
Une instance obsolète d'une session précédente occupe encore le port REST, donc le nouveau CLI démarre son moteur mais son enregistrement de worker n'aboutit jamais — un démarrage sain se termine en ~2s. Diagnostiquez et redémarrez toute la chaîne (ne tuez jamais un processus worker seul : il peut être le gestionnaire de route actif, et le tuer fait renvoyer un 404 à `/agentmemory/livez`) :

```powershell
Get-NetTCPConnection -LocalPort 3111 -State Listen   # who owns the port
npx @agentmemory/agentmemory stop                     # stop the instance it belongs to
# if that leaves the port held, stop the engine + worker pair together and
# let the launcher's supervision loop relaunch them (~60s, silently)
```

**Une version plus récente d'agentmemory est installée mais le launcher continue d'exécuter une version plus ancienne.**
Le launcher privilégie la version la plus récente entre le cache npx et les installations globales ; si une copie obsolète l'emporte encore, videz le cache :

```bash
npx clear-npx-cache
```

## API

Le plugin cible l'API de plugin OpenCode V2 (`@opencode/plugin` >= 2.0.18). La supervision démarre dans `setup()` lorsque le plugin est chargé, et la fonction de nettoyage renvoyée arrête la boucle de health-check au déchargement.

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
