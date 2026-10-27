// Regression: the cross-instance launch lock must stay fresh for the full
// 450s boot budget (agentmemory 0.9.31 engine+worker readiness). A lock only
// 120s old must still block a launch (the old 90s budget treated it as
// stale), while a 500s-old lock must be reclaimable.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import {
  applyFixtureEnv,
  buildFixtures,
  loadPlugin,
  makeRoot,
  makeLaunchProbe,
  mockTimersUsable,
  pumpUntilLaunches,
  startBackendDownServer,
} from "./helpers.mjs";

let root;
let server;
let closeServer;
let fixtures;
let lockPath;
let probe;

// Node 18 ships an incompatible experimental mock-timers implementation; the
// guard feature-tests the real API instead of checking availability.
const hasMockTimers = (t) => mockTimersUsable(t);

function seedLock(ageMs) {
  fs.writeFileSync(lockPath, "12345");
  const past = new Date(Date.now() - ageMs);
  fs.utimesSync(lockPath, past, past);
}

before(async () => {
  root = makeRoot("lock");
  fixtures = buildFixtures(root);
  const down = await startBackendDownServer();
  server = down.server;
  closeServer = down.close;
  applyFixtureEnv(root, { ...fixtures, port: down.port });
  // After applyFixtureEnv: os.tmpdir() resolves to the fixture root, which
  // is also where the plugin computes its cross-instance lock path.
  lockPath = path.join(os.tmpdir(), "agentmemory-launcher.lock");
});

after(async () => {
  probe?.restore();
  await closeServer();
  fs.rmSync(root, { recursive: true, force: true });
});

test("launch lock honors the 450s boot budget", async (t) => {
  if (!hasMockTimers(t)) {
    t.skip("t.mock.timers requires Node >= 20.2");
    return;
  }
  t.mock.timers.enable({ apis: ["Date", "setInterval", "setTimeout"], now: Date.now() });

  // 120s-old lock: fresh under the 450s budget (would be stale under 90s).
  // setup() awaits ensureRunning, whose CONFIRM_RECHECK uses the mocked
  // timer — so pump fake time concurrently and await setup in the finally.
  seedLock(120_000);
  const plugin = await loadPlugin();
  probe = makeLaunchProbe();
  const setupPromise = plugin.setup();
  try {
    const blocked = await pumpUntilLaunches(t, probe, 1, 200_000);
    assert.equal(blocked, false, "a 120s-old lock must still block launches within the 450s boot budget");

    // 500s-old lock: stale, the next 60s health check may reclaim it.
    seedLock(500_000);
    const launched = await pumpUntilLaunches(t, probe, 1, 200_000);
    assert.equal(launched, true, "a 500s-old lock must be reclaimable");
  } finally {
    (await setupPromise)();
    t.mock.timers.reset();
  }
});
