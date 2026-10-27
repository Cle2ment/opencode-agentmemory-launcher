// Regression: on Windows/Scoop the OpenCode server PATH contains the symlinked
// shim dir (apps/nodejs/current/bin) while the real global packages live at
// the realpath (persist/nodejs/bin). The resolver must scan both so a newer
// global install (fixture 99.0.0, only reachable via realpath) wins over the
// stale npx-cache copy (0.9.30). Before the fix it launched the 0.9.30 CLI.
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
  root = makeRoot("realpath");
  fixtures = buildFixtures(root);
  const down = await startBackendDownServer();
  server = down.server;
  closeServer = down.close;
  applyFixtureEnv(root, { ...fixtures, port: down.port });
});

after(async () => {
  await closeServer();
  fs.rmSync(root, { recursive: true, force: true });
});

test("resolves the global install behind a symlinked PATH entry via realpath", async () => {
  const plugin = await loadPlugin();
  const cleanup = await plugin.setup();
  try {
    const lines = await waitForLaunches(fixtures.logFile, 1);
    assert.equal(lines.length, 1, `expected exactly one launch, got: ${JSON.stringify(lines)}`);
    // The launcher may report the shim-traversed path (Windows resolves
    // junctions transparently); what matters is that it resolves to the
    // realpath global install (99.0.0 fixture), not the stale npx-cache copy.
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
