import { readFileSync } from "node:fs";
import { createSchedulerFencingState, createSchedulerFencingSurface, reviewSchedulerFencing } from "../src/core/scheduler-fencing.mjs";
import { createAjv } from "./validate-contracts.mjs";

const checked = [
  "src/core/scheduler-fencing.mjs",
  "tests/scheduler-fencing.test.mjs",
  "tests/scheduler-fencing-surface.test.mjs",
  "schemas/scheduler-fencing-state.schema.json",
  "src/workspaces/SchedulerFencingPanel.tsx",
  "src/workspaces/RunWorkspace.tsx",
  "package.json"
];
for (const path of checked) readFileSync(path);

const validate = createAjv().compile(JSON.parse(readFileSync("schemas/scheduler-fencing-state.schema.json", "utf8")));
const state = createSchedulerFencingState();
if (!validate(state)) throw new Error(JSON.stringify(validate.errors));
const review = reviewSchedulerFencing();
if (!review.ok) throw new Error(JSON.stringify(review.errors));
const surface = createSchedulerFencingSurface({ scenario: "rollback" });
if (surface.boundary.schedulerStarted || surface.boundary.executionAccepted || surface.summary.activeLeasesAfterRollback !== 0) {
  throw new Error("Scheduler review surface widened execution authority or retained an active lease.");
}

console.log(
  JSON.stringify({ status: "passed", checked, summary: { ...review.summary, schemaValidated: true, productAdmissionOpen: surface.boundary.productAdmissionOpen } }, null, 2)
);
