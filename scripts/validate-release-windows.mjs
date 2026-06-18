#!/usr/bin/env node
import { readWindowsReleaseInputs, validateWindowsReleaseGate } from "../src/core/windows-release-gate.mjs";

const requireReady = process.argv.includes("--require-ready");
const result = validateWindowsReleaseGate(readWindowsReleaseInputs());

if (!result.ok || (requireReady && !result.ready)) {
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(result, null, 2));
