#!/usr/bin/env node
import { readReleaseSmokeInputs, validateReleaseSmokeGate } from "../src/core/release-smoke-gate.mjs";

const requireReady = process.argv.includes("--require-ready");
const result = validateReleaseSmokeGate(readReleaseSmokeInputs());

if (!result.ok || (requireReady && !result.ready)) {
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(result, null, 2));
