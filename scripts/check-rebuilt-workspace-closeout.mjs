#!/usr/bin/env node
import fs from "node:fs";

const failures = [];
const packageJson = JSON.parse(readText("package.json"));

if (!String(packageJson.scripts?.["validate:rebuilt-workspace-closeout"] ?? "").includes("check-rebuilt-workspace-closeout.mjs")) {
  failures.push("package scripts must define validate:rebuilt-workspace-closeout");
}

if (!String(packageJson.scripts?.validate ?? "").includes("validate:rebuilt-workspace-closeout")) {
  failures.push("validate script must include validate:rebuilt-workspace-closeout");
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      checked: ["package.json"]
    },
    null,
    2
  )
);

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}
