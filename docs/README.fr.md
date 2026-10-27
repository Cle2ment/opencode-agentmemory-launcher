# Lanceur Agentmemory pour OpenCode

> Plugin OpenCode qui démarre automatiquement le backend [agentmemory](https://github.com/rohitg00/agentmemory) avec une supervision par health-check.

[![npm version](https://img.shields.io/npm/v/opencode-agentmemory-launcher)](https://www.npmjs.com/package/opencode-agentmemory-launcher)
[![License](https://img.shields.io/npm/l/opencode-agentmemory-launcher)](./LICENSE)
[![Node.js](https://img.shields.io/node/v/opencode-agentmemory-launcher)](https://nodejs.org/)
[![CI](https://github.com/Cle2ment/opencode-agentmemory-launcher/actions/workflows/ci.yml/badge.svg)](https://github.com/Cle2ment/opencode-agentmemory-launcher/actions/workflows/ci.yml)

[English](/README.md) | [中文](/docs/README.zh.md) | [Français](/docs/README.fr.md)

## Prérequis

- **OpenCode V2** (`opencode2`)
- **Node.js** ≥ 18.0.0 pour le plugin lui-même ; agentmemory 0.9.30+ nécessite **Node.js ≥ 20.0.0**
- backend **agentmemory** (auto-installé via `npx @agentmemory/agentmemory` s'il n'est pas présent)

> **Utilisateurs V1 :** OpenCode V1 (`opencode` 1.x) n'est plus pris en charge depuis la v4.0.0 — épinglez `opencode-agentmemory-launcher@^3` si vous avez encore besoin de V1.

> **Note :** Ce plugin n'a été testé que sur Windows 11. Si vous avez besoin de prise en charge d'autres plateformes, les pull requests sont les bienvenues.

## Ce qu'il fait

Ce plugin démarre automatiquement le backend [agentmemory](https://github.com/rohitg00/agentmemory) (REST API + iii-engine) lorsque OpenCode charge sa configuration. Il s'exécute une fois par processus OpenCode et effectue un health-check du backend toutes les 60 secondes, en le redémarrant si le processus meurt.

## Compatibilité

Conçu pour **agentmemory 0.9.31** (iii-engine 0.25.0, Worker Compose) et rétrocompatible avec les versions antérieures :

- **L'authentification est activée par défaut.** agentmemory génère un secret dans `~/.agentmemory/secret` au premier démarrage. Le lanceur n'appelle que le point de terminaison toujours public `/agentmemory/livez`, il n'a donc pas besoin de secret et n'est pas affecté. Les appels REST écrits à la main vers `:3111` nécessitent désormais `Authorization: Bearer $(cat ~/.agentmemory/secret)`.
- **Attente de disponibilité Worker Compose.** agentmemory 0.9.31 budgète jusqu'à 120 s pour le démarrage du moteur plus 300 s pour la disponibilité du worker. Le budget de démarrage de 450 s du lanceur et le verrou de lancement inter-instances empêchent les lancements en double pendant cette fenêtre.
- **Les épinglages de moteur sont gérés par agentmemory.** Le lanceur n'installe ni ne sélectionne iii-engine. Un épinglage incompatible fait quitter la CLI avec le code 1 et est remonté sous forme de `warn`. Sous Windows natif, il faut installer manuellement le moteur épinglé ; la version 0.9.31 connaît également un problème de démarrage Worker Compose sous Windows natif suivi dans [agentmemory#1618](https://github.com/rohitg00/agentmemory/issues/1618).
- **La version la plus récente l'emporte.** Sous Windows, le lanceur démarre l'agentmemory le plus récent qu'il peut trouver dans le cache npx **ou une installation globale sur `PATH`**, y compris les installations globales derrière des entrées PATH Scoop symboliquement liées, de sorte que `npm i -g @agentmemory/agentmemory@latest` prend effet sans vider le cache npx.

## Installation

### Depuis npm (recommandé)

Ajoutez à votre configuration OpenCode (`plugins`, au pluriel) :

```jsonc
{
  "plugins": ["opencode-agentmemory-launcher@latest"]
}
```

OpenCode installera automatiquement le package au démarrage. Consultez le [guide des plugins V2](https://opencode.ai/v2/docs/build/plugins) pour plus de détails.

## Utilisation

Ce lanceur démarre le backend agentmemory. Pour utiliser agentmemory avec OpenCode, installez également le plugin agentmemory et consultez le [guide d'utilisation du plugin OpenCode agentmemory](https://github.com/rohitg00/agentmemory/blob/main/plugin/opencode/README.md) pour les instructions d'installation, les outils disponibles et les options de configuration.

## Mise à jour

Pour mettre à jour agentmemory vers la dernière version :

```bash
npx @agentmemory/agentmemory upgrade
```

Si vous avez installé agentmemory globalement, mettez plutôt à jour cette copie avec `npm i -g @agentmemory/agentmemory@latest` — le lanceur choisit la version la plus récente entre le cache npx et les installations globales.

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

1. **Au chargement** (`setup()`) : le plugin démarre un intervalle de health-check (60 s)
2. **Health check** : Ping `GET /agentmemory/livez` sur le backend (toujours public, sans authentification — même avec l'authentification par défaut d'agentmemory 0.9.30)
3. **Redémarrage automatique** : Si le health check échoue, le backend est lancé.
   - **Toujours silencieux sur le propre chemin de spawn du lanceur** (au démarrage et à chaque (re)lancement ultérieur depuis la boucle de 60 s) : sous Windows, le plugin contourne npx/cmd, résout le `dist/cli.mjs` **le plus récent** dans le cache npm/npx ou une installation globale sur `PATH`, et lance `node` directement dessus. Le Worker Compose d'agentmemory 0.9.31+ peut créer cmd.exe/conhost dans son propre arbre de workers ; le démarrage sous Windows natif est actuellement affecté par [agentmemory#1618](https://github.com/rohitg00/agentmemory/issues/1618). Les relances sont limitées par un budget de démarrage de 450 s plus un verrou de lancement inter-instances (plusieurs serveurs OpenCode partagent un seul backend). Le backoff exponentiel conserve sa base de 90 s, produisant 450 s → 450 s → 450 s → 720 s … jusqu'à 12 min
4. **Mode debug** : Définissez `OPENCODE_AGENTMEMORY_DEBUG=1` pour une journalisation détaillée
5. **Diagnostics d'échec** : Un lancement de backend qui se termine avec un code non nul est journalisé en `warn` avec les causes probables — un daemon répondant déjà sur le port, l'incompatibilité d'épinglage iii-engine imposée, ou un échec de disponibilité du Worker Compose 0.9.31+. Le backend s'exécute avec `stdio: "ignore"`, donc pour obtenir le texte d'erreur réel, exécutez `npx @agentmemory/agentmemory doctor`

## Variables d'environnement

| Variable | Défaut | Description |
|----------|---------|-------------|
| `AGENTMEMORY_URL` | `http://localhost:3111` | URL de l'API du backend |
| `OPENCODE_AGENTMEMORY_DEBUG` | non défini | Définir à `1` pour la journalisation debug |

## Dépannage

**Le backend ne démarre jamais et le journal affiche une sortie de lancement non nulle.**
Les causes courantes sont une incompatibilité d'épinglage iii-engine imposée, une instance obsolète possédant encore le port, ou un worker Worker Compose 0.9.31+ qui ne devient pas prêt. Sous Windows natif, consultez [agentmemory#1618](https://github.com/rohitg00/agentmemory/issues/1618) pour le problème de démarrage 0.9.31 connu. Exécutez le doctor manuellement pour voir l'erreur réelle :

```bash
npx @agentmemory/agentmemory doctor
```

**Sous agentmemory 0.9.30, le journal du lanceur affiche `agentmemory worker did not become ready within 15s` et le lancement se termine avec le code 1.**
Une instance obsolète d'une session antérieure occupe encore le port REST, donc la nouvelle CLI démarre son moteur mais son enregistrement de worker ne devient jamais prêt — un démarrage sain se termine en ~2 s. Diagnostiquez et redémarrez toute la chaîne (ne tuez jamais un seul processus worker : il peut être le gestionnaire de route actif, et le tuer fait renvoyer 404 à `/agentmemory/livez`) :

```powershell
Get-NetTCPConnection -LocalPort 3111 -State Listen   # who owns the port
npx @agentmemory/agentmemory stop                     # stop the instance it belongs to
# if that leaves the port held, stop the engine + worker pair together and
# let the launcher's supervision loop relaunch them (~60s, silently)
```

**Une version plus récente d'agentmemory est installée mais le lanceur continue d'en exécuter une plus ancienne.**
Le lanceur préfère la version la plus récente entre le cache npx et les installations globales ; si une copie obsolète l'emporte encore, videz le cache :

```bash
npx clear-npx-cache
```

## API

Le plugin cible l'API des plugins OpenCode V2 (`@opencode/plugin` >= 2.0.18). La supervision démarre dans `setup()` lorsque le plugin se charge, et la fonction de nettoyage renvoyée arrête la boucle de health-check au déchargement.

```typescript
import type { Plugin } from "@opencode/plugin";

const plugin: Plugin.Plugin = {
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

## Droits d'auteur

Copyright (C) 2026 Cle2ment.
