#!/usr/bin/env node
import { readLinuxReleaseInputs, validateLinuxReleaseGate } from "../src/core/linux-release-gate.mjs";

const requireReady = process.argv.includes("--require-ready");
const result = validateLinuxReleaseGate(readLinuxReleaseInputs());

if (!result.ok || (requireReady && !result.ready)) {
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(result, null, 2));
