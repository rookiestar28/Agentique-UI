#!/usr/bin/env node
import fs from "node:fs";

const failures = [];
const planningMarker = `.${"plan"}${"ning"}`;
const referenceDocsMarker = ["reference", "docs"].join("/");
const itemCodePattern = new RegExp("\\b" + "R" + "\\d{4}\\b", "u");

const closeout = readText("docs/validation/rebuilt-workspace-closeout.md");
const rebuiltEvidence = readText("docs/validation/rebuilt-ui-regression-evidence.md");
const visualCloseout = readText("docs/validation/visual-redesign-closeout.md");
const packageJson = JSON.parse(readText("package.json"));

requireIncludes(closeout, [
  "Rebuilt Workspace Closeout",
  "workspace shell",
  "task-native workspaces",
  "Graph canvas",
  "fit and zoom controls",
  "node selection",
  "validation overlays",
  "credential-risk indicators",
  "unsupported-node reporting",
  "docs/validation/rebuilt-ui-regression-evidence.md",
  "docs/validation/artifacts/rebuilt-ui-graph-desktop.png",
  "docs/validation/artifacts/rebuilt-ui-graph-mobile.png",
  "docs/validation/visual-regression-evidence.md",
  "docs/validation/visual-redesign-closeout.md",
  "npm run validate",
  "No installer, updater, production desktop runtime, generic shell or sidecar runtime, automatic arbitrary-resource execution, cloud runtime, or universal workflow runtime is claimed by this closeout."
], "rebuilt workspace closeout");

requireIncludes(rebuiltEvidence, [
  "Graph workspace shows canvas controls",
  "visible nodes",
  "visible edges",
  "node inspector",
  "No installer, updater, production desktop runtime, hosted runtime, universal runtime, or automatic arbitrary-resource execution capability is claimed by this evidence."
], "rebuilt UI evidence");

requireIncludes(visualCloseout, [
  "Graph canvas workspace",
  "Rebuilt UI regression evidence"
], "visual redesign closeout");

for (const artifact of [
  "docs/validation/artifacts/rebuilt-ui-graph-desktop.png",
  "docs/validation/artifacts/rebuilt-ui-graph-mobile.png"
]) {
  if (!fs.existsSync(artifact)) {
    failures.push(`missing rebuilt workspace evidence artifact: ${artifact}`);
  } else if (fs.statSync(artifact).size < 1000) {
    failures.push(`rebuilt workspace evidence artifact is unexpectedly small: ${artifact}`);
  }
}

if (!String(packageJson.scripts?.["validate:rebuilt-workspace-closeout"] ?? "").includes("check-rebuilt-workspace-closeout.mjs")) {
  failures.push("package scripts must define validate:rebuilt-workspace-closeout");
}

if (!String(packageJson.scripts?.validate ?? "").includes("validate:rebuilt-workspace-closeout")) {
  failures.push("validate script must include validate:rebuilt-workspace-closeout");
}

for (const [label, text] of [["rebuilt workspace closeout", closeout]]) {
  for (const rule of [
    { id: "private-planning-marker", pattern: new RegExp(escapeRegExp(planningMarker), "iu") },
    { id: "private-reference-docs", pattern: new RegExp(escapeRegExp(referenceDocsMarker), "iu") },
    { id: "local-absolute-path", pattern: /(?<![A-Za-z])[A-Za-z]:[\\/][^\s)`"']+/u },
    { id: "internal-item-code", pattern: itemCodePattern },
    { id: "released-installer", pattern: /\b(?:has|offers|ships|publishes|provides)\s+(?:a\s+)?released\s+(?:desktop\s+)?installer\b/iu },
    { id: "signed-updater", pattern: /\bsigned\s+updater\s+is\s+available\b/iu },
    { id: "automatic-execution", pattern: /\bautomatic\s+workflow\s+execution\s+is\s+supported\b/iu },
    { id: "universal-runtime", pattern: /\buniversal\s+workflow\s+runtime\s+is\s+available\b/iu }
  ]) {
    if (rule.pattern.test(text)) {
      failures.push(`${label} violates ${rule.id}`);
    }
  }
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "passed",
  checked: [
    "docs/validation/rebuilt-workspace-closeout.md",
    "docs/validation/rebuilt-ui-regression-evidence.md",
    "docs/validation/visual-redesign-closeout.md",
    "docs/validation/artifacts/rebuilt-ui-graph-desktop.png",
    "docs/validation/artifacts/rebuilt-ui-graph-mobile.png",
    "package.json"
  ]
}, null, 2));

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function requireIncludes(text, required, label) {
  for (const phrase of required) {
    if (!text.includes(phrase)) {
      failures.push(`${label} missing required phrase: ${phrase}`);
    }
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
