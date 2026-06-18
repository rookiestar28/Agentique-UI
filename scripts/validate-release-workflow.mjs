#!/usr/bin/env node
import { readGithubReleaseWorkflowInputs, validateGithubReleaseWorkflowGate } from "../src/core/github-release-workflow-gate.mjs";

const result = validateGithubReleaseWorkflowGate(readGithubReleaseWorkflowInputs());

if (!result.ok) {
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(result, null, 2));
