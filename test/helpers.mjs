// Shared helpers for the launcher regression tests. These run the real
// built plugin (dist/) against fixture installs and a mock backend, with no
// changes to the plugin's public surface (default { id, setup } only).
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Fresh temp root; also isolates the plugin's cross-instance lock (TMPDIR). */
export function makeRoot(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `aml-${name}-`));
}

/**
 * Synchronous launch counter: with OPENCODE_AGENTMEMORY_DEBUG=1 the plugin
 * logs "launching backend silently via …" from within launch() itself, so
 * intercepting console.error observes a launch at the exact fake time it
 * happens — unlike the spawned child's log file, which lags ~50ms of REAL
 * time behind (inflating fake-time measurements under mock timers).
 */
export function makeLaunchProbe() {
  let launches = 0;
  const origError = console.error;
  console.error = (...args) => {
    if (typeof args[0] === "string" && args[0].includes("launching backend silently")) launches++;
    return origError.apply(console, args);
  };
  return {
    count: () => launches,
    restore: () => {
      console.error = origError;
    },
  };
}

export function readLaunches(logFile) {
  try {
    return fs.readFileSync(logFile, "utf-8").split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

/** Real-time pump: poll the fake-CLI launch log until `count` lines appear. */
export async function waitForLaunches(logFile, count, timeoutMs = 20_000) {
  const start = Date.now();
  for (;;) {
    const lines = readLaunches(logFile);
    if (lines.length >= count || Date.now() - start > timeoutMs) return lines;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/**
 * Fake-timer pump (mock timers must already be enabled): advance fake time in
 * small steps, letting real I/O (fetch to the mock backend) settle between
 * ticks, until the launch probe reports `count` launches.
 */
export async function pumpUntilLaunches(t, probe, count, maxFakeMs) {
  let advanced = 0;
  while (probe.count() < count && advanced < maxFakeMs) {
    t.mock.timers.tick(1000);
    advanced += 1000;
    for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve));
  }
  return probe.count() >= count;
}

/**
 * Measure the fake-time gap from "now" until the launch probe reports one
 * more launch (beyond `count`). Returns Infinity when no new launch appears
 * within `maxFakeMs` of fake time.
 */
export async function gapToNextLaunch(t, probe, count, maxFakeMs) {
  let advanced = 0;
  while (probe.count() <= count) {
    if (advanced >= maxFakeMs) return Infinity;
    t.mock.timers.tick(1000);
    advanced += 1000;
    for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve));
  }
  return advanced;
}

async function closeServer(server) {
  // undici keep-alive sockets would otherwise keep server.close() pending.
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
}

/** A mock backend that is always "down" (/agentmemory/livez never answers ok). */
export async function startBackendDownServer() {
  const server = http.createServer((req, res) => {
    res.statusCode = 503;
    res.end("down");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, port: server.address().port, close: () => closeServer(server) };
}

/**
 * Write a fake agentmemory install mimicking the real 0.9.30/0.9.31 package
 * layout: `bin` is the object form `{ "agentmemory": "dist/cli.mjs" }` and
 * the CLI entry lives at `dist/cli.mjs`. The launched CLI records its own
 * path so tests can assert which candidate the resolver picked.
 */
function writePkg(pkgDir, version, logFile) {
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.writeFileSync(
    path.join(pkgDir, "package.json"),
    JSON.stringify({ name: "@agentmemory/agentmemory", version, bin: { agentmemory: "dist/cli.mjs" } }),
  );
  fs.mkdirSync(path.join(pkgDir, "dist"), { recursive: true });
  fs.writeFileSync(
    path.join(pkgDir, "dist", "cli.mjs"),
    `import fs from "node:fs";\nfs.appendFileSync(${JSON.stringify(logFile)}, process.argv[1] + "\\n");\n`,
  );
}

/**
 * Fixture simulating the Scoop layout that triggered the realpath bug:
 *
 *   <root>/apps/nodejs/current/      (real dir; only bin is linked)
 *   <root>/apps/nodejs/current/bin   (junction → <root>/persist/nodejs/bin)
 *   <root>/persist/nodejs/bin/       (real dir, empty)
 *   <root>/persist/nodejs/lib/node_modules/@agentmemory/agentmemory@persistVersion
 *   <root>/cache/_npx/<hash>/node_modules/@agentmemory/agentmemory@npxVersion
 *
 * The global install uses the npm prefix layout (`../lib/node_modules`): the
 * literal PATH entry (`…/current/bin`) scans `…/current/lib/node_modules`,
 * which does not exist — only the realpath entry (`…/persist/nodejs/bin`)
 * reaches it. Before the fix the resolver missed it and fell back to the
 * stale npx-cache copy. `persistVersion` defaults to 99.0.0 so the fixture
 * always wins over whatever real installs exist on the test machine.
 */
export function buildFixtures(root, { persistVersion = "99.0.0", npxVersion = "0.9.30" } = {}) {
  const logFile = path.join(root, "launches.log");
  const persistBin = path.join(root, "persist", "nodejs", "bin");
  const persistLibPkg = path.join(root, "persist", "nodejs", "lib", "node_modules", "@agentmemory", "agentmemory");
  writePkg(persistLibPkg, persistVersion, logFile);
  fs.mkdirSync(persistBin, { recursive: true });
  const shimBin = path.join(root, "apps", "nodejs", "current", "bin");
  fs.mkdirSync(path.dirname(shimBin), { recursive: true });
  // "junction" needs no admin rights on Windows dir links; ignored elsewhere.
  fs.symlinkSync(persistBin, shimBin, "junction");
  const cacheRoot = path.join(root, "cache");
  writePkg(
    path.join(cacheRoot, "_npx", "0badf00d", "node_modules", "@agentmemory", "agentmemory"),
    npxVersion,
    logFile,
  );
  return {
    logFile,
    persistBin,
    shimBin,
    cacheRoot,
    persistCli: path.join(persistLibPkg, "dist", "cli.mjs"),
  };
}

/**
 * Point the plugin's environment at the fixtures. Must run BEFORE importing
 * dist/: the module reads API/PATH/npm_config_cache/TMP,TEMP at import or
 * call time. On Windows os.tmpdir() honors TMP/TEMP (it ignores TMPDIR),
 * so all three are set to keep the plugin's cross-instance lock inside the
 * fixture root instead of the machine-wide temp dir.
 */
export function applyFixtureEnv(root, { shimBin, cacheRoot, port }) {
  process.env.TMPDIR = root;
  process.env.TMP = root;
  process.env.TEMP = root;
  process.env.PATH = [shimBin, path.dirname(process.execPath)].join(path.delimiter);
  process.env.npm_config_cache = cacheRoot;
  process.env.AGENTMEMORY_URL = `http://127.0.0.1:${port}`;
  process.env.AGENTMEMORY_LAUNCHER_RESOLVE_CLI = "1";
  // Read at module import; enables the "launching backend silently" info log
  // that makeLaunchProbe() counts.
  process.env.OPENCODE_AGENTMEMORY_DEBUG = "1";
}

export async function loadPlugin() {
  const mod = await import(pathToFileURL(path.resolve("dist/agentmemory-launcher.js")).href);
  return mod.default;
}
