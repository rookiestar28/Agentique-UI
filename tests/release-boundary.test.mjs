import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { validatePublicReleaseName, validateReleasePublicationPolicy, validateReleaseTag } from "../src/core/release-boundary.mjs";

test("release publication policy keeps public repo separate from package publication", () => {
  const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
  const result = validateReleasePublicationPolicy({ packageJson });

  assert.equal(result.ok, true);
  assert.equal(result.policy.repositoryVisibility, "public-source");
  assert.equal(result.policy.separateSystemsBoundary, "excluded-from-public-source");
  assert.equal(result.policy.npmPackagePublication, "disabled-by-private-package-flag");
  assert.equal(result.policy.licensePosture, "apache-2.0-source-license");
});

test("public release names reject private markers and unsupported claims", () => {
  assert.equal(validatePublicReleaseName("Agentique UI v0.1.0").ok, true);
  assert.equal(validatePublicReleaseName(`Agentique UI ${"R"}1234`).ok, false);
  assert.equal(validatePublicReleaseName("Agentique UI released installer").ok, false);
  assert.equal(validatePublicReleaseName("Agentique UI signed updater is available").ok, false);
});

test("release tags use semantic version format with v prefix", () => {
  assert.equal(validateReleaseTag("v0.1.0").ok, true);
  assert.equal(validateReleaseTag("v0.1.0-rc.1").ok, true);
  assert.equal(validateReleaseTag("0.1.0").ok, false);
  assert.equal(validateReleaseTag("release-v0.1.0").ok, false);
});

test("publication policy document records license and review boundary", () => {
  const text = fs.readFileSync("docs/governance/release-publication-policy.md", "utf8");

  assert.match(text, /public source repository/u);
  assert.match(text, /npm package is intentionally marked private/u);
  assert.match(text, /Apache-2.0 source license/u);
  assert.match(text, /stable public release requires maintainer review/u);
});
