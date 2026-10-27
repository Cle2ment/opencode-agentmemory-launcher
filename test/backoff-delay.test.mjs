// Regression: retry timing after agentmemory 0.9.31 raised engine/worker
// readiness budgets to 120s+300s. The minimum delay between launches must be
// the 450s boot budget, while the exponential backoff keeps its 90s base:
//   attempts 0,1,2 → max(450s, 90s·2^n)  = 450s
//   attempt  3    → max(450s, 90s·8)     = 720s
// Under the old 90s base the second launch already happened ~90s after the
// first, relaunching a backend whose normal boot was still in progress.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, before, test } from "node:test";
import {
  applyFixtureEnv,
  buildFixtures,
  gapToNextLaunch,
  loadPlugin,
  makeRoot,
  makeLaunchProbe,
  startBackendDownServer,
} from "./helpers.mjs";

let root;
let server;
let closeServer;
let fixtures;
let probe;

const hasMockTimers = (t) => typeof t.mock?.timers?.enable === "function";

before(async () => {
  root = makeRoot("backoff");
  fixtures = buildFixtures(root);
  const down = await startBackendDownServer();
  server = down.server;
  closeServer = down.close;
  applyFixtureEnv(root, { ...fixtures, port: down.port });
});

after(async () => {
  probe?.restore();
  await closeServer();
  fs.rmSync(root, { recursive: true, force: true });
});

test("retry delay is max(450s boot budget, 90s·2^attempts capped)", async (t) => {
  if (!hasMockTimers(t)) {
    t.skip("t.mock.timers requires Node >= 20.2");
    return;
  }
  t.mock.timers.enable({ apis: ["Date", "setInterval", "setTimeout"], now: Date.now() });

  const plugin = await loadPlugin();
  probe = makeLaunchProbe();
  const setupPromise = plugin.setup();
  try {
    // Startup launch happens immediately (setup's ensureRunning progresses
    // as the pump ticks fake time past CONFIRM_RECHECK).
    const startupGap = await gapToNextLaunch(t, probe, 0, 20_000);
    assert.notEqual(startupGap, Infinity, "startup launch never happened");
    assert.ok(startupGap < 20_000, `startup launch should be immediate, got gap ${startupGap}ms`);

    // Measure each inter-launch gap: the health-check interval quantizes
    // launch times onto a 60s grid (+3s recheck), so a delay D lands in
    // [D, D+63s]. Under the old 90s base the first gap was ~90-153s.
    const expectations = [
      { min: 450_000, max: 513_000 }, // launch 2: attempts 0 → boot budget
      { min: 450_000, max: 513_000 }, // launch 3: attempts 1 → max(450s, 180s)
      { min: 450_000, max: 513_000 }, // launch 4: attempts 2 → max(450s, 360s)
      { min: 720_000, max: 783_000 }, // launch 5: attempts 3 → max(450s, 720s) — 90s base kept
    ];
    for (let launch = 2; launch <= 5; launch++) {
      const exp = expectations[launch - 2];
      const gap = await gapToNextLaunch(t, probe, launch - 1, exp.max + 120_000);
      assert.notEqual(gap, Infinity, `launch ${launch} never happened`);
      assert.ok(
        gap >= exp.min,
        `launch ${launch}: gap ${gap}ms must be >= ${exp.min}ms (old 90s base would land near 90-153s)`,
      );
      assert.ok(gap <= exp.max, `launch ${launch}: gap ${gap}ms must be <= ${exp.max}ms`);
    }
  } finally {
    (await setupPromise)();
    t.mock.timers.reset();
  }
});
