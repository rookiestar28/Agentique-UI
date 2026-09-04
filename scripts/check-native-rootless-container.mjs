#!/usr/bin/env node
import { reviewNativeRootlessContainer, sampleNativeRootlessContainer } from "../src/core/native-rootless-container.mjs";

const result = reviewNativeRootlessContainer(sampleNativeRootlessContainer);
if (!result.ok) {
  console.error(JSON.stringify({ status: "failed", ...result }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ status: "passed", ...result }, null, 2));
