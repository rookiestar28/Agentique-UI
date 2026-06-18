#!/usr/bin/env node
import fs from "node:fs";
import { reviewDurableRunLedgerGate } from "../src/core/durable-run-ledger.mjs";

const failures = [];
const review = reviewDurableRunLedgerGate();
const moduleText = readText("src/core/durable-run-ledger.mjs");
const tests = readText("tests/durable-run-ledger.test.mjs");
const contract = readText("docs/contracts/durable-run-ledger.md");
const hook = readText("src/app-state/useRunnerWorkspaceState.ts");
const route = readText("src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx");
const types = readText("src/workspaces/TrustRunSettingsTypes.ts");
const workspace = readText("src/workspaces/RunWorkspace.tsx");
const panel = readText("src/workspaces/DurableRunLedgerPanel.tsx");
const packageJson = JSON.parse(readText("package.json"));

if (!review.ok) {
  failures.push(...review.errors.map((error) => error.message ?? error.code));
}

requireIncludes(
  moduleText,
  [
    "agentique.durableRunLedger.v1",
    "createDurableRunLedger",
    "createMemoryDurableRunLedgerStorage",
    "createDurableRunLedgerSurface",
    "reviewDurableRunLedgerGate",
    "corrupt-fallback",
    "source-first-json-ledger",
    "Replay after reload",
    "Migration rollback sample",
    "Corruption fallback sample",
    "Bounded export sample",
    "noSignedInstallerDependency: true",
    "noCloudSessionDependency: true",
    "noBrowserDataAccess: true"
  ],
  "durable run ledger module"
);

requireIncludes(
  tests,
  [
    "durable run ledger replays records after app reload",
    "legacy snapshots migrate with rollback evidence",
    "corrupt storage falls back without replaying stale success",
    "retention and export are bounded redacted and path-neutral",
    "durable run ledger gate proves replay migration fallback export and no dependency widening"
  ],
  "durable run ledger tests"
);

requireIncludes(
  contract,
  [
    "Durable Run Ledger",
    "restart replay",
    "schema migration",
    "corruption fallback",
    "bounded retention",
    "redacted export",
    "source-first",
    "no signed installer",
    "no cloud session"
  ],
  "durable run ledger contract"
);

requireIncludes(hook, ["createDurableRunLedgerSurface", "durableRunLedgerSurface", "handleDurableRunLedgerAction", "migrate", "corrupt"], "runner workspace state hook");
requireIncludes(route, ["durableRunLedgerSurface", "handleDurableRunLedgerAction"], "graph/run workspace route");
requireIncludes(types, ["durableRunLedgerSurface", "onDurableRunLedgerAction", "DurableRunLedgerAction"], "run workspace prop types");
requireIncludes(workspace, ["DurableRunLedgerPanel", "durableRunLedgerSurface", "onDurableRunLedgerAction"], "run workspace durable ledger mount");
requireIncludes(
  panel,
  ["Durable run ledger controls", "durableRunLedgerSurface", "durableRunLedgerSurface.controls.map", "onDurableRunLedgerAction(control.action)"],
  "durable run ledger panel"
);

if (!String(packageJson.scripts?.["validate:durable-run-ledger"] ?? "").includes("check-durable-run-ledger.mjs")) {
  failures.push("package scripts must define validate:durable-run-ledger");
}

if (!String(packageJson.scripts?.validate ?? "").includes("validate:durable-run-ledger")) {
  failures.push("full validate script must include validate:durable-run-ledger");
}

if (
  !review.checks.restartReplay ||
  !review.checks.migrationRollback ||
  !review.checks.corruptionFallback ||
  !review.checks.boundedRetentionExport ||
  !review.checks.redactedPathNeutralExport ||
  !review.checks.noInstallerOrCloudDependency
) {
  failures.push("durable run ledger gate must prove replay, migration, corruption fallback, bounded export, redaction, and no installer/cloud dependency");
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      checked: [
        "src/core/durable-run-ledger.mjs",
        "tests/durable-run-ledger.test.mjs",
        "docs/contracts/durable-run-ledger.md",
        "src/app-state/useRunnerWorkspaceState.ts",
        "src/workspaces/DurableRunLedgerPanel.tsx",
        "package.json"
      ],
      summary: review.summary
    },
    null,
    2
  )
);

function readText(filePath) {
  if (!fs.existsSync(filePath)) return "";
  return fs.readFileSync(filePath, "utf8");
}

function requireIncludes(text, required, label) {
  for (const phrase of required) {
    if (!text.includes(phrase)) {
      failures.push(`${label} missing required phrase: ${phrase}`);
    }
  }
}
