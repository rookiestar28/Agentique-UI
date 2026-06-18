#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { createCoreContractFixtureSet, validateCoreContractFixtureSet } from "../src/core/core-contract-drift-gate.mjs";

export function createAjv() {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true
  });
  addFormats(ajv);
  return ajv;
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}

export function validateExample(schemaPath, examplePath) {
  const ajv = createAjv();
  const schema = readJson(schemaPath);
  const validate = ajv.compile(schema);
  const example = readJson(examplePath);
  const ok = validate(example);
  return {
    ok,
    errors: validate.errors ?? []
  };
}

export function validateCoreContractDriftGate() {
  const fixture = createCoreContractFixtureSet();
  return validateCoreContractFixtureSet(fixture);
}

const contractPairs = [
  ["schemas/agentique-resource-bundle.schema.json", "examples/resource-bundle.valid.json"],
  ["schemas/deep-link-intent.schema.json", "examples/deep-link-intent.valid.json"],
  ["schemas/scoped-download-ticket.schema.json", "examples/scoped-download-ticket.valid.json"],
  ["schemas/ui-companion-readback.schema.json", "examples/companion-readback.valid.json"],
  ["schemas/runner-capability.schema.json", "examples/runner-capability.valid.json"]
].filter(([schemaPath, examplePath]) => fs.existsSync(schemaPath) && fs.existsSync(examplePath));

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const results = contractPairs.map(([schemaPath, examplePath]) => ({
    schemaPath,
    examplePath,
    ...validateExample(schemaPath, examplePath)
  }));
  const driftGate = validateCoreContractDriftGate();
  const failed = results.filter((result) => !result.ok);
  if (failed.length > 0 || !driftGate.ok) {
    console.error(JSON.stringify({ status: "failed", failed, driftGate }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({ status: "passed", validated: results.length, driftGate: "passed" }, null, 2));
}
