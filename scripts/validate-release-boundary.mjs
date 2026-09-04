#!/usr/bin/env node
import fs from "node:fs";
import { validatePublicReleaseName, validateReleasePublicationPolicy, validateReleaseTag } from "../src/core/release-boundary.mjs";

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));

const failures = [];
const policy = validateReleasePublicationPolicy({ packageJson });
if (!policy.ok) failures.push(...policy.findings.map((finding) => `${finding.code}: ${finding.message}`));

for (const sample of ["Agentique UI v0.1.0", "Agentique UI v0.1.0 release candidate"]) {
  const result = validatePublicReleaseName(sample);
  if (!result.ok) failures.push(`safe release name rejected: ${sample}`);
}

for (const tag of ["v0.1.0", "v0.1.0-rc.1"]) {
  const result = validateReleaseTag(tag);
  if (!result.ok) failures.push(`safe release tag rejected: ${tag}`);
}

for (const sample of [`Agentique UI ${"R"}1234`, "Agentique UI released installer", "Agentique UI signed updater is available"]) {
  const result = validatePublicReleaseName(sample);
  if (result.ok) failures.push(`unsafe release name accepted: ${sample}`);
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      checked: ["package.json", "release name/tag rules"]
    },
    null,
    2
  )
);
