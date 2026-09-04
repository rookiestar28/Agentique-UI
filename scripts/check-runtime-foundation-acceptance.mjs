import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { buildRuntimeFoundationManifest, reviewRuntimeFoundationAcceptance, runtimeFoundationContractVersions } from "../src/core/runtime-foundation-acceptance.mjs";

const checked = ["src/core/runtime-foundation-acceptance.mjs", "tests/runtime-foundation-acceptance.test.mjs"];
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
