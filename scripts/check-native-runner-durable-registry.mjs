#!/usr/bin/env node
import { reviewNativeRunRegistry } from "../src/core/native-runner-durable-registry.mjs";

const review = reviewNativeRunRegistry();
if (!review.ok) {
  console.error(JSON.stringify(review, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ status: "passed", schemaVersion: review.schemaVersion, checks: review.checks }, null, 2));
