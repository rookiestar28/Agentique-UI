import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";
import {
  createLogsArtifactWorkbenchScenario,
  createLogsArtifactWorkbenchSurface,
  logsArtifactWorkbenchSchemaVersion,
  requiredWorkbenchFilters,
  reviewLogsArtifactWorkbench,
  validateLogsArtifactWorkbenchSurface
} from "../src/core/logs-artifact-workbench.mjs";

test("logs artifact workbench validation gate passes", () => {
  const output = execFileSync(process.execPath, ["scripts/check-logs-artifact-workbench.mjs"], { encoding: "utf8" });
  const result = JSON.parse(output);

  assert.equal(result.status, "passed");
  assert.equal(result.schemaVersion, logsArtifactWorkbenchSchemaVersion);
  assert.equal(result.summary.filters, requiredWorkbenchFilters.length);
  assert.equal(result.summary.interactionViewports, 2);
});

test("workbench exposes bounded redacted logs and identity descriptors", () => {
  const surface = createLogsArtifactWorkbenchSurface();

  assert.equal(surface.schemaVersion, logsArtifactWorkbenchSchemaVersion);
  assert.equal(surface.logs.length > 0, true);
  assert.equal(
    surface.logs.every((entry) => entry.redacted === true && entry.maxBytes <= 262144 && entry.text.length <= entry.previewChars),
    true
  );
  assert.equal(surface.identity.runId.startsWith("run-"), true);
  assert.equal(surface.identity.resourceId.startsWith("resource."), true);
  assert.equal(
    surface.artifacts.every((artifact) => /^[a-f0-9]{64}$/u.test(artifact.digest)),
    true
  );
});

test("artifact filters cover receipt cleanup retention mime viewer and stale states", () => {
  const surface = createLogsArtifactWorkbenchSurface();
  const filterIds = new Set(surface.filters.map((entry) => entry.id));

  for (const filter of requiredWorkbenchFilters) {
    assert.equal(filterIds.has(filter), true, filter);
  }
  assert.equal(
    surface.filters.every((entry) => entry.keyboardAccessible === true),
    true
  );
  assert.equal(surface.summary.receipts >= 1, true);
  assert.equal(surface.summary.cleanupAware >= 1, true);
  assert.equal(surface.summary.staleCleanup >= 1, true);
});

test("preview policy blocks unsafe content and keeps risky families metadata only", () => {
  const surface = createLogsArtifactWorkbenchSurface({ scenario: "risky-preview" });
  const risky = surface.previews.find((entry) => entry.family === "html");
  const blocked = surface.previews.find((entry) => entry.mode === "blocked");

  assert.equal(risky?.renderable, false);
  assert.equal(risky?.mode, "metadata-only");
  assert.equal(blocked?.reason, "unsafe-content");
  assert.equal(surface.summary.metadataOnlyPreviews >= 1, true);
});

test("export review redacts sensitive and path material", () => {
  const surface = createLogsArtifactWorkbenchSurface({ scenario: "export-denied" });
  const review = surface.exportReview;
  const text = JSON.stringify(surface);

  assert.equal(review.redacted, true);
  assert.equal(review.allowed, false);
  assert.equal(review.denials.includes("raw-log-export"), true);
  assert.equal(review.denials.includes("signed-url"), true);
  assert.doesNotMatch(text, /bearer\s+[A-Za-z0-9._-]+/iu);
  assert.doesNotMatch(text, /sk-[A-Za-z0-9_-]{16,}/iu);
  assert.doesNotMatch(text, /cookie=/iu);
  assert.doesNotMatch(text, /[A-Z]:[\\/]/u);
  assert.doesNotMatch(text, /\/Users\/|\/home\//u);
  assert.doesNotMatch(text, /https:\/\/[^"]+\?(?:[^"]*signature|[^"]*token)/iu);
});

test("workbench preserves authority boundary without storage or filesystem widening", () => {
  const review = reviewLogsArtifactWorkbench();

  assert.equal(review.ok, true, JSON.stringify(review.errors));
  assert.equal(validateLogsArtifactWorkbenchSurface(review.surface).ok, true);
  assert.equal(review.surface.boundary.frontendAuthority, "display-and-request-only");
  assert.equal(review.surface.boundary.nativeReadbackRequired, true);
  assert.equal(review.surface.boundary.storePluginEnabled, false);
  assert.equal(review.surface.boundary.sqlPluginEnabled, false);
  assert.equal(review.surface.boundary.fileSystemPluginEnabled, false);
  assert.equal(review.surface.boundary.rawArtifactBytes, false);
  assert.equal(review.surface.boundary.shellOrProcessEnabled, false);
  assert.equal(review.surface.boundary.packageLifecycleEnabled, false);
  assert.equal(review.surface.boundary.browserDataEnabled, false);
  assert.equal(review.surface.boundary.containerStartEnabled, false);
  assert.equal(review.surface.boundary.externalProviderAutomationEnabled, false);
});

test("scenario filters update deterministic workbench views", () => {
  const scenarios = ["all", "run", "resource", "mime", "cleanup", "retention", "risky-preview", "stale"].map((scenario) => createLogsArtifactWorkbenchScenario(scenario));
  const activeFilters = new Set(scenarios.map((surface) => surface.activeFilter.id));

  for (const filter of ["all", "run", "resource", "mime", "cleanup", "retention", "risky-preview", "stale"]) {
    assert.equal(activeFilters.has(filter), true, filter);
  }
});

test("run workspace renders logs artifact workbench with accessible filters", () => {
  const source = fs.readFileSync("src/workspaces/RunWorkspace.tsx", "utf8");
  const route = fs.readFileSync("src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx", "utf8");
  const state = fs.readFileSync("src/app-state/useRunnerWorkspaceState.ts", "utf8");
  const panel = fs.readFileSync("src/workspaces/LogsArtifactWorkbenchPanel.tsx", "utf8");

  assert.match(panel, /aria-label="Logs and artifact workbench"/u);
  assert.match(panel, /aria-label="Logs artifact filter actions"/u);
  assert.match(source, /LogsArtifactWorkbenchPanel/u);
  assert.match(source, /logsArtifactWorkbenchSurface/u);
  assert.match(route, /logsArtifactWorkbenchSurface/u);
  assert.match(state, /createLogsArtifactWorkbenchSurface/u);
});
