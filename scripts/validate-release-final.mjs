#!/usr/bin/env node
import { readFinalReleaseInputs, validateFinalReleaseGate } from "../src/core/final-release-gate.mjs";

const requireReady = process.argv.includes("--require-ready");
const result = validateFinalReleaseGate(readFinalReleaseInputs());

if (!result.ok || (requireReady && !result.ready)) {
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(result, null, 2));
