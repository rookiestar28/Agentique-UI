#!/usr/bin/env node
import { readReleaseMetadata, validateReleaseMetadata } from "../src/core/release-metadata.mjs";

const result = validateReleaseMetadata(readReleaseMetadata());

if (!result.ok) {
  console.error(JSON.stringify({ status: "failed", findings: result.findings }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "passed",
  version: result.version,
  bundleActive: result.bundleActive,
  targets: result.targets
}, null, 2));

