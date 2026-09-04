#!/usr/bin/env node
import fs from "node:fs";
import { evaluateHeddlePackageFeasibility, validateHeddlePackageFeasibilityReceipt } from "../src/core/heddle-package-feasibility.mjs";

const receiptPath = "examples/heddle-package-feasibility-receipt.valid.json";
const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
const validation = validateHeddlePackageFeasibilityReceipt(receipt);
const failures = validation.errors.map((error) => error.message);
let evaluation;

if (validation.ok) evaluation = evaluateHeddlePackageFeasibility(receipt);

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const packageLock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
for (const section of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
  for (const dependency of Object.keys(packageJson[section] ?? {})) {
    if (dependency.startsWith("@heddleagent/")) failures.push(`Product package section ${section} retains ${dependency}.`);
  }
}
for (const packagePath of Object.keys(packageLock.packages ?? {})) {
  if (packagePath.includes("node_modules/@heddleagent/")) failures.push(`Product lockfile retains ${packagePath}.`);
}

for (const file of fs.readdirSync("src/core").filter((name) => name.endsWith(".mjs"))) {
  const source = fs.readFileSync(`src/core/${file}`, "utf8");
  if (/(?:from\s+|import\s*\()\s*["']@heddleagent\//u.test(source)) {
    failures.push(`Product source imports a Heddle package: src/core/${file}.`);
  }
}

if (evaluation?.disposition !== "NO_ADOPT") failures.push("Feasibility receipt must record the accepted no-adoption disposition.");
if (evaluation?.eligibleDispositions?.length !== 1) failures.push("No package adoption disposition may remain eligible.");

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      disposition: evaluation.disposition,
      exactPackages: [`${receipt.candidates.runtime.name}@${receipt.candidates.runtime.version}`, `${receipt.candidates.runClient.name}@${receipt.candidates.runClient.version}`],
      productDependencyAdded: false,
      productContractOwner: receipt.productRequirements.protocolOwner,
      prohibitedDefaultEffects: 0
    },
    null,
    2
  )
);
