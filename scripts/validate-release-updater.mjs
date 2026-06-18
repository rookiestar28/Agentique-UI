#!/usr/bin/env node
import { readUpdaterReleaseInputs, validateUpdaterReleaseGate } from "../src/core/updater-release-gate.mjs";

const requireReady = process.argv.includes("--require-ready");
const result = validateUpdaterReleaseGate(readUpdaterReleaseInputs());

if (!result.ok || (requireReady && !result.ready)) {
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(result, null, 2));
