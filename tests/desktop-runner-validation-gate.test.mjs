import assert from "node:assert/strict";
import test from "node:test";
import {
  reviewDesktopRunnerValidationGate,
  sampleDesktopRunnerEvidence,
  validateDesktopRunnerEvidence
} from "../src/core/desktop-runner-validation-gate.mjs";

test("complete desktop runner evidence is accepted across all platforms", () => {
  const review = validateDesktopRunnerEvidence(sampleDesktopRunnerEvidence);

  assert.equal(review.ok, true);
  assert.equal(review.status, "accepted");
  assert.deepEqual(Object.keys(review.platforms), ["windows", "macos", "linux"]);
  assert.equal(review.platforms.windows.processCleanup.orphanProcesses, 0);
  assert.equal(review.platforms.macos.crashRecovery.status, "passed");
  assert.equal(review.platforms.linux.artifactRedaction.noSecrets, true);
  assert.equal(review.summary.productionClaimsBlocked, true);
});

test("missing platform evidence fails closed", () => {
  const review = validateDesktopRunnerEvidence({
    ...sampleDesktopRunnerEvidence,
    supportedPlatforms: ["windows", "macos"],
    platforms: {
      windows: sampleDesktopRunnerEvidence.platforms.windows,
      macos: sampleDesktopRunnerEvidence.platforms.macos
    }
  });

  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "desktop-runner.platform-missing"));
});

test("process cleanup and crash recovery evidence are mandatory", () => {
  const review = validateDesktopRunnerEvidence({
    ...sampleDesktopRunnerEvidence,
    platforms: {
      ...sampleDesktopRunnerEvidence.platforms,
      windows: {
        ...sampleDesktopRunnerEvidence.platforms.windows,
        processCleanup: { status: "failed", receipt: false, orphanProcesses: 2 },
        crashRecovery: { status: "missing", recoveredState: "unknown" }
      }
    }
  });

  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "desktop-runner.cleanup"));
  assert.ok(review.errors.some((error) => error.code === "desktop-runner.crash-recovery"));
});

test("artifact redaction and public scans are mandatory", () => {
  const review = validateDesktopRunnerEvidence({
    ...sampleDesktopRunnerEvidence,
    platforms: {
      ...sampleDesktopRunnerEvidence.platforms,
      macos: {
        ...sampleDesktopRunnerEvidence.platforms.macos,
        artifactRedaction: { status: "failed", noSecrets: false, noLocalPaths: false },
        scans: { noSecrets: "failed", publicBoundary: "missing" }
      }
    }
  });

  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "desktop-runner.artifact-redaction"));
  assert.ok(review.errors.some((error) => error.code === "desktop-runner.scans"));
});

test("Playwright runner workflows must cover approve start cancel status logs and artifacts", () => {
  const review = validateDesktopRunnerEvidence({
    ...sampleDesktopRunnerEvidence,
    platforms: {
      ...sampleDesktopRunnerEvidence.platforms,
      linux: {
        ...sampleDesktopRunnerEvidence.platforms.linux,
        playwright: {
          status: "passed",
          workflows: ["approve-permissions", "start-run"],
          traceRef: "evidence/linux-runner-playwright-trace.zip"
        }
      }
    }
  });

  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "desktop-runner.playwright"));
});

test("adapter signature and preflight evidence are required", () => {
  const review = validateDesktopRunnerEvidence({
    ...sampleDesktopRunnerEvidence,
    adapterEvidence: {
      python: { status: "missing" },
      node: { status: "verified", signer: "unknown", digest: "bad" },
      wasm: { status: "verified" },
      containers: { status: "missing" }
    }
  });

  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "desktop-runner.adapter-signature"));
  assert.ok(review.errors.some((error) => error.code === "desktop-runner.adapter-preflight"));
});

test("unsafe evidence references and missing SOP references fail closed", () => {
  const review = validateDesktopRunnerEvidence({
    ...sampleDesktopRunnerEvidence,
    sopReferences: [],
    platforms: {
      ...sampleDesktopRunnerEvidence.platforms,
      windows: {
        ...sampleDesktopRunnerEvidence.platforms.windows,
        commandLogRef: ["C", ":\\private\\runner.log"].join("")
      }
    }
  });

  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "desktop-runner.sop-reference"));
  assert.ok(review.errors.some((error) => error.code === "desktop-runner.evidence-reference"));
});

test("release claims stay blocked without separate release gates", () => {
  const review = validateDesktopRunnerEvidence({
    ...sampleDesktopRunnerEvidence,
    releaseClaims: {
      localRunnerScope: "universal",
      productionDesktopRuntime: true,
      installerUpdater: true,
      hostedRuntime: true,
      universalRuntime: true,
      automaticExecution: true
    }
  });

  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "desktop-runner.release-scope"));
  assert.ok(review.errors.some((error) => error.code === "desktop-runner.release-claim"));
});

test("desktop runner validation gate summary proves accepted and blocked evidence paths", () => {
  const summary = reviewDesktopRunnerValidationGate();

  assert.equal(summary.ok, true);
  assert.equal(summary.acceptedStatus, "accepted");
  assert.equal(summary.missingPlatformBlocked, true);
  assert.equal(summary.unsafeReferenceBlocked, true);
  assert.equal(summary.overclaimBlocked, true);
  assert.equal(summary.summary.supportedPlatforms, 3);
});
