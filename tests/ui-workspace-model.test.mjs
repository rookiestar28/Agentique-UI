import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const decision = fs.readFileSync("docs/decisions/ui-workspace-model.md", "utf8");

function literal(value) {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u");
}

test("workspace model records style source roles without copying external brands", () => {
  for (const phrase of [
    "Apple is the quality reference",
    "Agentique.io is the product identity reference",
    "shadcn/ui is a component taxonomy reference",
    "React Aria is the accessibility and interaction reference",
    "Magic UI, Aceternity UI, and React Bits may inform small module ideas",
    "Do not copy either site's assets"
  ]) {
    assert.match(decision, literal(phrase));
  }
});

test("workspace model rejects bento and card-dump page layouts", () => {
  for (const phrase of [
    "The main workspace must not be a wall of cards or a metric grid",
    "Bento grids",
    "summary cards used as the primary content for every tab",
    "static graph cards pretending to be a workflow editor"
  ]) {
    assert.match(decision, literal(phrase));
  }
});

test("workspace model maps feature areas to task-native workspaces", () => {
  for (const heading of [
    "Library And Import",
    "Verify And Permissions",
    "Preview And Artifacts",
    "Graph",
    "Run And Settings",
    "Handoff"
  ]) {
    assert.match(decision, new RegExp(`### ${heading}`, "u"));
  }
});

test("graph acceptance requires a real canvas with node and edge behavior", () => {
  for (const phrase of [
    "real node/edge canvas",
    "pan, zoom, and fit controls",
    "selected-node inspector",
    "validation/risk overlays",
    "unsupported-node report",
    "supported-local-only/no-overclaim guard"
  ]) {
    assert.match(decision, literal(phrase));
  }
});

test("accessibility and motion baseline is explicit", () => {
  for (const phrase of [
    "Native controls are preferred",
    "keyboard reachable",
    "Focus states must be visible",
    "WCAG 2.2 AA",
    "prefers-reduced-motion",
    "Color is never the only state indicator"
  ]) {
    assert.match(decision, literal(phrase));
  }
});
