import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createSchedulerFencingSurface } from "../src/core/scheduler-fencing.mjs";

test("default scheduler surface resolves the startup-closed admission state", () => {
  const surface = createSchedulerFencingSurface();
  assert.equal(surface.scenario, "startup-closed");
  assert.equal(surface.admission.state, "closed");
});

test("scheduler fencing review surface keeps execution closed and exposes accessible controls", () => {
  const surface = createSchedulerFencingSurface({ scenario: "claimed" });
  assert.equal(surface.boundary.schedulerStarted, false);
  assert.equal(surface.boundary.executionAccepted, false);
  assert.deepEqual(
    surface.controls.map((control) => control.scenario),
    ["startup-closed", "ready", "claimed", "stale-writer", "canceled", "rollback"]
  );
  assert.ok(surface.summary.activeClaims >= 0);
});

test("run workspace wires the scheduler fencing review panel without execution authority", () => {
  const panel = fs.readFileSync("src/workspaces/SchedulerFencingPanel.tsx", "utf8");
  const workspace = fs.readFileSync("src/workspaces/RunWorkspace.tsx", "utf8");
  assert.match(panel, /Scheduler admission and fencing/);
  assert.match(panel, /aria-label="Scheduler fencing scenarios"/);
  assert.match(panel, /Execution remains disabled/);
  assert.match(workspace, /<SchedulerFencingPanel \/>/);
});
