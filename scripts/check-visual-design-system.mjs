#!/usr/bin/env node
import fs from "node:fs";
import { readStyleSourceBundle } from "../src/core/style-source-boundary.mjs";

const failures = [];
const css = readStyleSourceBundle();
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));

requireIncludes(
  css,
  ["color-scheme: dark", "--agent-bg", "--agent-surface", "--agent-accent", "--agent-warm", "--agent-lime", "--agent-radius-surface", "--agent-focus-ring"],
  "style tokens"
);

const allDependencies = {
  ...packageJson.dependencies,
  ...packageJson.devDependencies
};

for (const dependencyName of ["tailwindcss", "framer-motion", "motion", "@magicui/cli"]) {
  if (Object.prototype.hasOwnProperty.call(allDependencies, dependencyName)) {
    failures.push(`visual dependency is not approved yet: ${dependencyName}`);
  }
}

for (const genericColor of ["#4f46e5", "#6366f1", "#7c3aed"]) {
  if (css.toLowerCase().includes(genericColor)) {
    failures.push(`generic default accent color is not allowed: ${genericColor}`);
  }
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      checked: ["src/styles.css", "package.json"]
    },
    null,
    2
  )
);

function requireIncludes(text, required, label) {
  for (const phrase of required) {
    if (!text.includes(phrase)) {
      failures.push(`${label} missing required phrase: ${phrase}`);
    }
  }
}
