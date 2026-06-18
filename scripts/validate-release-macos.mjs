#!/usr/bin/env node
import { readMacosReleaseInputs, validateMacosReleaseGate } from "../src/core/macos-release-gate.mjs";

const requireReady = process.argv.includes("--require-ready");
const result = validateMacosReleaseGate(readMacosReleaseInputs());

if (!result.ok || (requireReady && !result.ready)) {
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(result, null, 2));
