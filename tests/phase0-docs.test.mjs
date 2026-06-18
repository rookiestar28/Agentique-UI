import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("repository boundary states independent and non-runnable posture", () => {
  const text = fs.readFileSync("docs/governance/repository-boundary.md", "utf8");
  assert.match(text, /independent public repository line/i);
  assert.match(text, /not claim an installable production desktop runtime/i);
  assert.match(text, /Resource execution is blocked by default outside supported-local-only evidence gates/i);
});

test("desktop technology decision defines stack and release gates", () => {
  const text = fs.readFileSync("docs/decisions/desktop-technology-and-release-strategy.md", "utf8");
  assert.match(text, /Tauri v2, React, TypeScript, and Rust/i);
  assert.match(text, /release packaging validation/i);
  assert.match(text, /code-signing owner/i);
  assert.match(text, /signed update artifact verification/i);
  assert.match(text, /Rollback and downgrade behavior/i);
  assert.match(text, /Build provenance evidence/i);
  assert.match(text, /does not create:[\s\S]*an installable production desktop runtime/i);
});
