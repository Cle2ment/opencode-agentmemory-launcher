// Regression: the OpenCode host may run with a PATH that does not contain
// node's directory (bundled runtime, shim-only PATH). Spawning the resolved
// CLI via the bare "node" command would ENOENT there and fall back to the
// npx/cmd path (whose console allocation this launcher exists to avoid, and
// which may not even find node either). The launcher must spawn
// process.execPath — the node binary actually running the plugin — so the
// direct silent launch works regardless of PATH.
import assert from "node:assert/strict";
import fs from "node:fs";
import { after, before, test } from "node:test";
import {
  applyFixtureEnv,
  buildFixtures,
  loadPlugin,
  makeRoot,
  startBackendDownServer,
  waitForLaunches,
} from "./helpers.mjs";

let root;
let server;
let closeServer;
let fixtures;

before(async () => {
  root = makeRoot("execpath");
  fixtures = buildFixtures(root);
  const down = await startBackendDownServer();
  server = down.server;
  closeServer = down.close;
  // PATH contains only the symlinked shim dir — no node directory.
  applyFixtureEnv(root, { ...fixtures, port: down.port, includeNodeOnPath: false });
});

after(async () => {
  await closeServer();
  fs.rmSync(root, { recursive: true, force: true });
});

test("launches the resolved CLI via process.execPath even when PATH lacks node", async () => {
  const plugin = await loadPlugin();
  const cleanup = await plugin.setup();
  try {
    const lines = await waitForLaunches(fixtures.logFile, 1);
    assert.equal(
      lines.length,
      1,
      `expected exactly one direct launch of the resolved CLI, got: ${JSON.stringify(lines)} ` +
        "(zero means the spawn failed on PATH without node and fell back to npx)",
    );
    // The fake CLI records its own path (process.argv[1]); a line here proves
    // the resolved CLI was spawned directly (via process.execPath), not the
    // npx fallback, which would never write to this log.
    const launchedReal = fs.realpathSync(lines[0]);
    assert.equal(
      launchedReal.toLowerCase(),
      fixtures.persistCli.toLowerCase(),
      `expected launch resolved to the realpath global install (${fixtures.persistCli}), got: ${lines[0]}`,
    );
    assert.ok(
      !launchedReal.includes("_npx"),
      `stale npx-cache copy was chosen instead of the realpath global install: ${lines[0]}`,
    );
  } finally {
    cleanup();
  }
});
