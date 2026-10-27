// ── cli-resolution ──
// Resolves the newest installed @agentmemory/agentmemory CLI entry
// (`dist/cli.mjs`) so the launcher can spawn `node` directly on it. Two
// sources are scanned and the highest version wins:
//
//   1. the npm/npx cache (`<cache>/_npx/<hash>/node_modules/…`) — the layout
//      npx creates on first use, which is not always
//      `%LOCALAPPDATA%/npm-cache` (redirectable via `npm_config_cache` or
//      `~/.npmrc`; portable installs keep it beside the node bin dir);
//   2. global installs found through PATH — both the standard npm global
//      layout (`<bin>/node_modules/…`) and the prefix layout
//      (`<bin>/../lib/node_modules/…`).
//
// Windows/Scoop: a PATH entry can be a symlinked shim dir (scoop's
// `apps/nodejs/current/bin`) while the real global packages live at the
// entry's realpath (`…/persist/nodejs/bin`). Each PATH entry is therefore
// scanned together with its realpath (deduped), so a newer global install is
// not shadowed by a stale npx-cache copy.
//
// This module is pure: environment variables are read at call time, never at
// import time.

import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

export type CliCandidate = { path: string; version: string };

/**
 * Read a candidate agentmemory installation from a package directory:
 * parse `<pkgDir>/package.json`, resolve the `bin` entry (key `"agentmemory"`
 * when `bin` is an object), and return `{ path, version }` only when the CLI
 * file exists. Returns null on any missing file or parse/IO error.
 */
export function readCliCandidate(pkgDir: string): CliCandidate | null {
  const pkgJsonPath = join(pkgDir, "package.json");
  if (!existsSync(pkgJsonPath)) return null;
  try {
    const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf-8")) as {
      version?: string;
      bin?: string | Record<string, string>;
    };
    const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.["agentmemory"];
    if (!pkg.version || !bin) return null;
    const cliPath = join(pkgDir, bin);
    if (!existsSync(cliPath)) return null;
    return { path: cliPath, version: pkg.version };
  } catch {
    return null;
  }
}

/**
 * Candidate npm cache directories (`<cache>/_npx` holds npx's installs).
 * The cache is not always `%LOCALAPPDATA%/npm-cache`: it can be redirected via
 * `npm_config_cache` or a `cache=` line in `~/.npmrc`, and portable installs
 * (e.g. scoop) keep it beside the node bin dir that is on PATH
 * (`<persist>/nodejs/bin` → `<persist>/nodejs/cache`).
 */
export function npxCacheRoots(): string[] {
  const roots = new Set<string>();
  const add = (base: string | undefined): void => {
    if (!base) return;
    const clean = base.trim().replace(/^"(.*)"$/, "$1");
    if (!clean) return;
    const expanded = clean.startsWith("~") ? join(homedir(), clean.slice(1)) : clean;
    roots.add(join(expanded, "_npx"));
  };
  add(process.env.npm_config_cache);
  if (process.env.LOCALAPPDATA) add(join(process.env.LOCALAPPDATA, "npm-cache"));
  try {
    const match = readFileSync(join(homedir(), ".npmrc"), "utf-8").match(/^\s*cache\s*=\s*(.+?)\s*$/m);
    if (match) add(match[1]);
  } catch {
    // No user-level .npmrc.
  }
  for (const entry of (process.env.PATH ?? "").split(delimiter)) {
    if (entry) add(join(entry, "..", "cache"));
  }
  return [...roots];
}

/**
 * Resolve the newest agentmemory CLI entry from the npm/npx cache across every
 * candidate cache root (see `npxCacheRoots`). Picks the highest cached
 * version. Returns null when the package has never been npx-cached.
 */
export function resolveCliFromNpxCache(): CliCandidate | null {
  let best: CliCandidate | null = null;
  for (const cacheRoot of npxCacheRoots()) {
    let entries: string[];
    try {
      entries = readdirSync(cacheRoot);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const pkgDir = join(cacheRoot, entry, "node_modules", "@agentmemory", "agentmemory");
      const cand = readCliCandidate(pkgDir);
      if (cand && (!best || compareVersion(cand.version, best.version) > 0)) best = cand;
    }
  }
  return best;
}

/**
 * Resolve the newest agentmemory CLI entry installed GLOBALLY (npm i -g,
 * scoop, …) by scanning PATH. For each PATH directory D we check the standard
 * npm global bin layout (`D/node_modules/...`) and the prefix layout
 * (`D/../lib/node_modules/...`), each at both the literal path and its
 * realpath. Returns the highest-version candidate.
 */
export function resolveCliFromPath(): CliCandidate | null {
  const pathEnv = process.env.PATH;
  if (!pathEnv) return null;
  let best: CliCandidate | null = null;
  for (const entry of pathEnv.split(delimiter)) {
    if (!entry) continue;
    // Windows/Scoop: a PATH entry can be a symlinked shim dir (e.g. scoop's
    // `apps/nodejs/current/bin`) while the real global packages live at the
    // entry's realpath (`…/persist/nodejs/bin`). Scan both, deduped, so a
    // newer global install is not shadowed by a stale npx-cache copy.
    const dirs = new Set<string>([entry]);
    try {
      dirs.add(realpathSync(entry));
    } catch {
      // Unresolvable entry — the literal path is kept above.
    }
    for (const dir of dirs) {
      const pkgDirs = [
        join(dir, "node_modules", "@agentmemory", "agentmemory"),
        join(dir, "..", "lib", "node_modules", "@agentmemory", "agentmemory"),
      ];
      for (const pkgDir of pkgDirs) {
        const cand = readCliCandidate(pkgDir);
        if (cand && (!best || compareVersion(cand.version, best.version) > 0)) best = cand;
      }
    }
  }
  return best;
}

/**
 * Resolve the newest agentmemory CLI across the npx cache and any global
 * install on PATH. Ties keep the first found (npx cache first).
 */
export function resolveCli(): CliCandidate | null {
  const candidates = [resolveCliFromNpxCache(), resolveCliFromPath()].filter(
    (c): c is CliCandidate => c !== null,
  );
  let best: CliCandidate | null = null;
  for (const cand of candidates) {
    if (!best || compareVersion(cand.version, best.version) > 0) best = cand;
  }
  return best;
}

export function compareVersion(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}
