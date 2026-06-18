import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const boundaryDoc = fs.readFileSync("docs/contracts/companion-capability-boundary.md", "utf8");

test("companion capability boundary lists immediate source package surfaces", () => {
  for (const phrase of [
    "@agentique.io/readback",
    "@agentique.io/validator",
    "@agentique.io/uploader",
    "@agentique.io/action",
    "read-only public resource readback",
    "static package validation",
    "review-only upload, import, variant, agent-native plan summaries",
    "CI reference only"
  ]) {
    assert.match(boundaryDoc, new RegExp(escapeRegExp(phrase), "u"));
  }
});

test("companion capability boundary separates immediate and deferred capabilities", () => {
  for (const phrase of [
    "read-only catalog and resource readback projection",
    "static package validation reports",
    "safe download metadata review",
    "review-only plan, draft, and patch preview",
    "bounded local folder or repository intake scanning with no execution",
    "authenticated review submission",
    "live upload availability",
    "release governance execution",
    "GitHub Action execution inside the desktop app"
  ]) {
    assert.match(boundaryDoc, new RegExp(escapeRegExp(phrase), "u"));
  }
});

test("companion capability boundary preserves no-execution and no-credential rules", () => {
  for (const phrase of [
    "must not execute package scripts",
    "workflow actions",
    "Dockerfiles",
    "Local file access must be user selected",
    "bounded redirects",
    "digest checks",
    "Browser cookies",
    "ambient environment variables",
    "cloud credentials"
  ]) {
    assert.match(boundaryDoc, new RegExp(escapeRegExp(phrase), "u"));
  }
});

test("companion capability boundary does not claim release or runtime availability", () => {
  for (const phrase of [
    "does not prove",
    "public package publication",
    "live upload availability",
    "automatic execution of downloaded resources",
    "released installer availability",
    "signed updater availability",
    "production desktop runtime availability",
    "universal workflow execution"
  ]) {
    assert.match(boundaryDoc, new RegExp(escapeRegExp(phrase), "u"));
  }
});

test("companion capability boundary stays public safe", () => {
  assert.doesNotMatch(boundaryDoc, /\bR\d{4}\b/u);
  assert.doesNotMatch(boundaryDoc, /[A-Za-z]:[\\/]/u);
  assert.doesNotMatch(boundaryDoc, new RegExp(["\\.", "plan", "ning"].join(""), "iu"));
  assert.doesNotMatch(boundaryDoc, new RegExp(["ref", "erence", "[\\\\/]", "docs"].join(""), "iu"));
  assert.doesNotMatch(boundaryDoc, /(sk-[A-Za-z0-9]{20,}|github_pat_|ghp_)/u);
});

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
