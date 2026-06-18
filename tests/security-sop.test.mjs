import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const threatModel = fs.readFileSync("docs/security/threat-model.md", "utf8");
const sop = fs.readFileSync("docs/security/desktop-runner-sop.md", "utf8");

test("threat model covers required local runtime risk families", () => {
  for (const term of [
    "Local files",
    "Network",
    "Shell/process",
    "Environment variables",
    "Local secrets",
    "WebView",
    "Sidecars",
    "Containers and GPU",
    "Updates",
    "Browser data",
    "Logs and artifacts"
  ]) {
    assert.match(threatModel, new RegExp(term, "i"));
  }
});

test("threat model preserves default deny runtime posture", () => {
  assert.match(threatModel, /supported-local-only boundary/i);
  assert.match(threatModel, /No resource code execution by default/i);
  assert.match(threatModel, /No ambient file access/i);
  assert.match(threatModel, /No ambient network access/i);
  assert.match(threatModel, /No browser-cookie or browser-storage scraping/i);
  assert.match(threatModel, /does not approve arbitrary downloaded-resource execution/i);
});

test("desktop runner SOP defines evidence categories and acceptance rule", () => {
  for (const term of [
    "Cross-Platform Runner Acceptance Matrix",
    "Windows",
    "macOS",
    "Linux",
    "No-execution baseline",
    "File permissions",
    "Network permissions",
    "Shell/process",
    "Environment",
    "Secrets",
    "WebView/content",
    "Updates/signing",
    "Sidecars",
    "Containers/GPU",
    "Logs/artifacts",
    "Browser data",
    "Public boundary",
    "process-tree cleanup",
    "crash recovery",
    "Playwright workflow coverage",
    "adapter signature",
    "release-claim boundary"
  ]) {
    assert.match(sop, new RegExp(term, "i"));
  }
  assert.match(sop, /Partial validation cannot support public runnable claims/i);
  assert.match(sop, /Missing platform evidence.*fail the gate/i);
});
