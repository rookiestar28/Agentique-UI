import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { buildRuntimeFoundationManifest, reviewRuntimeFoundationAcceptance, runtimeFoundationContractVersions } from "../src/core/runtime-foundation-acceptance.mjs";

const checked = [
  "src/core/runtime-foundation-acceptance.mjs",
  "tests/runtime-foundation-acceptance.test.mjs",
  "docs/validation/runtime-foundation-acceptance.md",
  "docs/validation/runtime-foundation-rollback.md",
  "docs/contracts/run-protocol.md",
  "docs/contracts/native-approval-consent.md",
  "docs/contracts/native-async-run-lifecycle.md",
  "docs/contracts/product-result-projection.md",
  "docs/contracts/working-set-checkpoint.md",
  "docs/contracts/agent-evaluation-pipeline.md"
];
const digest = createHash("sha256");
for (const path of checked) digest.update(path).update("\0").update(readFileSync(path)).update("\0");
const manifest = buildRuntimeFoundationManifest({ candidateDigest: `sha256:${digest.digest("hex")}` });
const review = reviewRuntimeFoundationAcceptance(manifest);
if (!review.ok) throw new Error(JSON.stringify(review.failures));

console.log(
  JSON.stringify(
    {
      status: "passed",
      checked,
      summary: {
        predecessors: manifest.predecessors.length,
        contractVersions: Object.keys(runtimeFoundationContractVersions).length,
        packageDisposition: review.packageDisposition,
        acceptedCapabilities: review.acceptedCapabilities.length,
        blockedClaims: review.blockedClaims.length,
        rollbackReady: review.rollbackReady,
        downstreamResidualsOpen: review.downstreamResidualsOpen,
        disposition: review.disposition
      }
    },
    null,
    2
  )
);
