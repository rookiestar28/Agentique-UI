#!/usr/bin/env node
import { readReleaseDocsInputs, validateReleaseDocsGate } from "../src/core/release-docs-gate.mjs";

const result = validateReleaseDocsGate(readReleaseDocsInputs());

if (!result.ok || !result.ready) {
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(result, null, 2));
