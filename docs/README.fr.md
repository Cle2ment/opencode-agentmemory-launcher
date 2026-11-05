# Agentmemory Launcher pour OpenCode

> Plugin OpenCode qui démarre automatiquement le backend [agentmemory](https://github.com/rohitg00/agentmemory) avec supervision par health-check.

[![npm version](https://img.shields.io/npm/v/opencode-agentmemory-launcher)](https://www.npmjs.com/package/opencode-agentmemory-launcher)
[![License](https://img.shields.io/npm/l/opencode-agentmemory-launcher)](./LICENSE)
[![Node.js](https://img.shields.io/node/v/opencode-agentmemory-launcher)](https://nodejs.org/)
[![CI](https://github.com/Cle2ment/opencode-agentmemory-launcher/actions/workflows/ci.yml/badge.svg)](https://github.com/Cle2ment/opencode-agentmemory-launcher/actions/workflows/ci.yml)

[English](/README.md) | [中文](/docs/README.zh.md) | [Français](/docs/README.fr.md)

## Prérequis

- **OpenCode V2** (`opencode2`)
- **Node.js** ≥ 18.0.0 pour le plugin lui-même ; agentmemory 0.9.30+ nécessite **Node.js ≥ 20.0.0**
- Backend **agentmemory** (auto-installé via `npx @agentmemory/agentmemory` s'il n'est pas présent)

> **Utilisateurs V1 :** OpenCode V1 (`opencode` 1.x) n'est plus pris en charge depuis la v4.0.0 — épinglez `opencode-agentmemory-launcher@^3` si vous avez encore besoin de la V1.

> **Remarque :** Ce plugin n'a été testé que sur Windows 11. Si vous avez besoin de la prise en charge d'autres plateformes, les pull requests sont les bienvenues.

## Ce qu'il fait

Ce plugin démarre automatiquement le backend [agentmemory](https://github.com/rohitg00/agentmemory) (API REST + iii-engine) lorsque OpenCode charge sa configuration. Il s'exécute une fois par processus OpenCode et effectue un health-check du backend toutes les 60 secondes, en le redémarrant si le processus meurt.

## Compatibilité

Conçu pour **agentmemory 0.9.32** (iii-engine 0.25.0, Worker Compose) et rétrocompatible avec les versions antérieures :

- **L'authentification est activée par défaut.** agentmemory génère un secret dans `~/.agentmemory/secret` au premier démarrage. Le lanceur n'appelle que l'endpoint toujours public `/agentmemory/livez`, il n'a donc besoin d'aucun secret et n'est pas affecté. Les appels REST écrits à la main vers `:3111` nécessitent désormais `Authorization: Bearer $(cat ~/.agentmemory/secret)`.
- **Préparation de Worker Compose.** agentmemory 0.9.31+ prévoit jusqu'à 120s pour le démarrage du moteur plus 300s pour la préparation des workers. Le budget de démarrage de 450s du lanceur et le verrou inter-instances empêchent les lancements en double pendant cette fenêtre.
- **Le démarrage sous Windows est non interactif.** agentmemory 0.9.32 ignore les invites interactives de configuration du moteur sous Windows et lorsque stdio n'est pas un TTY, et peut installer automatiquement son moteur Windows épinglé. Cela le rend adapté au spawn en arrière-plan avec stdio ignoré du lanceur.
- **Les fenêtres de console vides restent un problème en amont.** agentmemory 0.9.31 et 0.9.32 épinglent tous deux iii 0.25.0, dont le Worker Compose sous Windows peut ouvrir une console vide pour le moteur et chaque worker ([iii#2430](https://github.com/iii-hq/iii/issues/2430)). Le lanceur ne peut pas supprimer ces fenêtres petites-filles avec `windowsHide` ; le correctif se trouve dans [iii#2437](https://github.com/iii-hq/iii/pull/2437), mais il n'est pas dans le moteur stable 0.25.0 utilisé par agentmemory 0.9.32. Le lanceur n'épingle pas de moteur alpha et ne patche pas de fichiers tiers.
- **Les épinglages de moteur sont gérés par agentmemory.** Le lanceur n'installe, ne sélectionne ni ne remplace iii-engine. Un épinglage incompatible fait quitter la CLI avec le code 1 et est signalé comme un `warn`.
- **La version la plus récente l'emporte.** Sous Windows, le lanceur démarre l'agentmemory le plus récent qu'il puisse trouver dans le cache npx **ou une installation globale sur le `PATH`**, y compris les installations globales derrière des entrées PATH Scoop liées symboliquement, afin que `npm i -g @agentmemory/agentmemory@latest` prenne effet sans vider le cache npx.

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

Ce lanceur démarre le backend agentmemory. Pour utiliser agentmemory avec OpenCode, installez également le plugin agentmemory et consultez le [guide d'utilisation du plugin OpenCode agentmemory](https://github.com/rohitg00/agentmemory/blob/main/plugin/opencode/README.md) pour les instructions de configuration, les outils disponibles et les options de configuration.

## Mise à jour

Pour mettre à jour agentmemory vers la dernière version :

```bash
npx @agentmemory/agentmemory upgrade
```

Si vous avez installé agentmemory globalement, mettez plutôt à jour cette copie avec `npm i -g @agentmemory/agentmemory@latest` — le lanceur choisit la version la plus récente entre le cache npx et les installations globales.

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
2. **Health check** : envoie une requête `GET /agentmemory/livez` au backend (toujours public, sans authentification — même avec l'authentification par défaut d'agentmemory 0.9.30)
3. **Redémarrage automatique** : si le health-check échoue, le backend est lancé.
   - **Toujours silencieux sur le chemin de spawn propre au lanceur** (démarrage et chaque (re)lancement ultérieur depuis la boucle de 60s) : sous Windows, le plugin résout le `dist/cli.mjs` **le plus récent** dans le cache npm/npx ou une installation globale sur le `PATH`, puis l'exécute avec le propre `process.execPath` de l'hôte OpenCode. Cela évite une recherche `node` dans le PATH, des sauts de shims et un fallback npx/cmd inutile. agentmemory 0.9.31/0.9.32 peut encore ouvrir des consoles vides dans l'arborescence de workers d'iii 0.25.0 ; cette limitation en amont distincte est décrite dans la section **Compatibilité**. Les relances sont limitées par un budget de démarrage de 450s plus un verrou de lancement inter-instances (plusieurs serveurs OpenCode partagent un seul backend). Le backoff exponentiel de nouvelle tentative conserve sa base de 90s, produisant 450s → 450s → 450s → 720s … jusqu'à 12min
4. **Mode debug** : définissez `OPENCODE_AGENTMEMORY_DEBUG=1` pour une journalisation détaillée
5. **Diagnostic des échecs** : un lancement de backend qui se termine avec un code non nul est journalisé au niveau `warn` avec les causes probables — un démon répondant déjà sur le port, une incompatibilité d'épinglage iii-engine imposée, ou un échec de préparation de Worker Compose 0.9.31+. Le backend s'exécute avec `stdio: "ignore"`, donc pour obtenir le texte d'erreur réel, exécutez `npx @agentmemory/agentmemory doctor`

## Variables d'environnement

| Variable | Par défaut | Description |
|----------|---------|-------------|
| `AGENTMEMORY_URL` | `http://localhost:3111` | URL de l'API du backend |
| `OPENCODE_AGENTMEMORY_DEBUG` | non défini | Définir à `1` pour la journalisation de debug |

## Dépannage

**Le backend démarre, mais des fenêtres de console vides apparaissent sous Windows.**
Il s'agit d'un problème connu de Worker Compose d'agentmemory 0.9.31/0.9.32 + iii 0.25.0, et non d'une fenêtre du lanceur. Voir [iii#2430](https://github.com/iii-hq/iii/issues/2430). Mettez à niveau uniquement lorsque agentmemory épingle une version stable d'iii contenant [iii#2437](https://github.com/iii-hq/iii/pull/2437) ; forcer le remplacement par une version alpha n'est pas une configuration de lanceur prise en charge.

**Le backend ne démarre jamais et le journal affiche une sortie de lancement non nulle.**
Les causes courantes sont une incompatibilité d'épinglage iii-engine imposée, une instance obsolète qui détient encore le port, ou un worker de Worker Compose 0.9.31+ qui ne parvient pas à se préparer. Exécutez le doctor manuellement pour voir l'erreur réelle :

```bash
npx @agentmemory/agentmemory doctor
```

**Sur agentmemory 0.9.30, le journal du lanceur affiche `agentmemory worker did not become ready within 15s` et le lancement se termine avec le code 1.**
Une instance obsolète d'une session précédente détient encore le port REST, de sorte que la nouvelle CLI démarre son moteur mais son enregistrement de worker ne devient jamais prêt — un démarrage propre et sain se termine en ~2s. Diagnostiquez et redémarrez toute la chaîne (ne tuez jamais un seul processus worker : il peut être le gestionnaire de route actif, et le tuer fait que `/agentmemory/livez` renvoie 404) :

```powershell
Get-NetTCPConnection -LocalPort 3111 -State Listen   # who owns the port
npx @agentmemory/agentmemory stop                     # stop the instance it belongs to
# if that leaves the port held, stop the engine + worker pair together and
# let the launcher's supervision loop relaunch them (~60s, silently)
```

**Une version plus récente d'agentmemory est installée mais le lanceur continue d'en exécuter une plus ancienne.**
Le lanceur privilégie la version la plus récente entre le cache npx et les installations globales ; si une copie obsolète l'emporte encore, videz le cache :

```bash
npx clear-npx-cache
```

## API

Le plugin cible l'API de plugin OpenCode V2 (`@opencode/plugin` >= 2.2.5). La supervision démarre dans `setup()` au chargement du plugin, et la fonction de nettoyage retournée arrête la boucle de health-check au déchargement.

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

## Copyright

Copyright (C) 2026 Cle2ment.
