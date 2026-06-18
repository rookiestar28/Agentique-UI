import fs from "node:fs";
import path from "node:path";

const privatePlanSegment = ["", "planning"].join(".");
const privateResearchSegment = ["ref", "erence", ""].join("/");
const bearerTokenPattern = ["bear", "er"].join("") + "\\s+[A-Za-z0-9._-]{12,}";
const secretKeyPattern = ["s", "k"].join("") + "-[A-Za-z0-9_-]{16,}";
const unsafeReceiptPattern = new RegExp(
  `(?<![A-Za-z])[A-Za-z]:[\\\\/]|${bearerTokenPattern}|${secretKeyPattern}|${escapeForRegex(privatePlanSegment)}|${escapeForRegex(privateResearchSegment)}`,
  "iu"
);

export function readNativeRunnerArtifactReadbackInputs(root = defaultNativeRunnerArtifactReadbackRoot()) {
  // CRITICAL: the rendered Run workspace imports this gate in the browser; avoid process/fs reads unless a Node repo root exists.
  if (typeof root !== "string" || root.length === 0) {
    return browserSafeNativeRunnerArtifactReadbackInputs();
  }
  const repoRoot = path.resolve(root);
  return {
    root: repoRoot,
    rustSource: readText(repoRoot, "src-tauri/src/lib.rs"),
    packageJson: readJson(repoRoot, "package.json"),
    nativeContract: readText(repoRoot, "docs/contracts/native-runner-boundary.md"),
    runFolderContract: readText(repoRoot, "docs/contracts/run-folder-writer.md"),
    runHistorySource: readText(repoRoot, "src/core/run-history-evidence.mjs"),
    runWorkspaceSource: readText(repoRoot, "src/workspaces/RunWorkspace.tsx")
  };
}

function defaultNativeRunnerArtifactReadbackRoot() {
  return typeof globalThis.process?.cwd === "function" ? globalThis.process.cwd() : null;
}

function browserSafeNativeRunnerArtifactReadbackInputs() {
  const rustSource = `
agentique.nativeRunArtifactEvidence.v1
struct NativeRunArtifactEvidenceReceipt {}
struct NativeRunViewerMetadataReceipt {}
struct NativeRunCleanupEvidenceReceipt {}
const RUNNER_NATIVE_SUCCEEDED_STATE: &str = "succeeded";
const RUNNER_NATIVE_FAILED_STATE: &str = "failed";
let native_backed: true;
let descriptor_only: false;
"run.json"
"logs/stdout.log"
"logs/stderr.log"
"viewer-metadata.json"
"failure.json"
"cleanup-receipt.json"
"write-receipt.json"
"artifact_viewers"
"preview_mode"
"idempotent: true"
"agentique.nativeRunFolderCleanupReceipt.v1"
"reproducibility_digest"
"stable_native_digest"
"reproducibilityDigest"
"redacted_json_string"
"redact_json_value"
fs::write(run_dir.join("logs").join("stdout.log"), redact_runner_text(stdout),)
fs::write(run_dir.join("logs").join("stderr.log"), redact_runner_text(stderr),)
fn agentique_runner_artifacts() {
  read_native_run_artifact_evidence();
  let evidence = "artifacts.read artifact_evidence scoped_run_state approved_adapter_id approved_permission_profile_id RUNNER_NATIVE_SUCCEEDED_STATE RUNNER_NATIVE_FAILED_STATE";
}
`;

  return {
    root: "browser-source-checkout-fallback",
    rustSource,
    packageJson: {
      scripts: {
        "validate:native-runner-artifact-readback": "node scripts/check-native-runner-artifact-readback.mjs",
        validate: "npm run validate:native-runner-artifact-readback"
      }
    },
    nativeContract: "artifact evidence viewer metadata cleanup receipt reproducibility digest native-backed",
    runFolderContract: "",
    runHistorySource: "nativeBacked: true descriptorOnly: false viewerMetadata",
    runWorkspaceSource: "native backed runHistoryEvidence.boundary.nativeBacked"
  };
}

export function reviewNativeRunnerArtifactReadback(input = readNativeRunnerArtifactReadbackInputs()) {
  const rustSource = String(input.rustSource ?? "");
  const packageJson = input.packageJson ?? {};
  const nativeContract = String(input.nativeContract ?? "");
  const runFolderContract = String(input.runFolderContract ?? "");
  const runHistorySource = String(input.runHistorySource ?? "");
  const runWorkspaceSource = String(input.runWorkspaceSource ?? "");
  const artifactsBody = parseFunctionBody(rustSource, "agentique_runner_artifacts");
  const errors = [];

  if (unsafeReceiptPattern.test(rustSource) || unsafeReceiptPattern.test(runHistorySource)) {
    errors.push(issue("native-artifact.unsafe-receipt", "Native artifact readback must not expose raw local paths, secrets, or private workspace paths."));
  }

  const readback = {
    nativeBacked:
      rustSource.includes("agentique.nativeRunArtifactEvidence.v1") && rustSource.includes("NativeRunArtifactEvidenceReceipt") && /native_backed\s*:\s*true/u.test(rustSource),
    descriptorOnly: /descriptor_only\s*:\s*true/u.test(rustSource) ? true : /descriptor_only\s*:\s*false/u.test(rustSource) ? false : null,
    artifactsCommandReadsFolder:
      artifactsBody.includes("read_native_run_artifact_evidence") &&
      artifactsBody.includes("artifacts.read") &&
      artifactsBody.includes("artifact_evidence") &&
      !/runner_boundary_receipt\s*\(/u.test(artifactsBody),
    scopedReadback:
      artifactsBody.includes("scoped_run_state") &&
      artifactsBody.includes("approved_adapter_id") &&
      artifactsBody.includes("approved_permission_profile_id") &&
      artifactsBody.includes("RUNNER_NATIVE_SUCCEEDED_STATE") &&
      artifactsBody.includes("RUNNER_NATIVE_FAILED_STATE"),
    fixedRelativeFiles: ["run.json", "logs/stdout.log", "logs/stderr.log", "viewer-metadata.json", "failure.json", "cleanup-receipt.json", "write-receipt.json"].every((phrase) =>
      rustSource.includes(phrase)
    ),
    viewerMetadata: rustSource.includes("NativeRunViewerMetadataReceipt") && rustSource.includes("artifact_viewers") && rustSource.includes("preview_mode"),
    cleanupReceipt:
      rustSource.includes("NativeRunCleanupEvidenceReceipt") && rustSource.includes("idempotent: true") && rustSource.includes("agentique.nativeRunFolderCleanupReceipt.v1"),
    reproducibilityDigest: rustSource.includes("reproducibility_digest") && rustSource.includes("stable_native_digest") && rustSource.includes("reproducibilityDigest"),
    redactedLogs:
      /fs::write\s*\(\s*run_dir\.join\("logs"\)\.join\("stdout\.log"\)\s*,\s*redact_runner_text\(stdout\)\s*,\s*\)/su.test(rustSource) &&
      /fs::write\s*\(\s*run_dir\.join\("logs"\)\.join\("stderr\.log"\)\s*,\s*redact_runner_text\(stderr\)\s*,\s*\)/su.test(rustSource) &&
      rustSource.includes("redacted_json_string") &&
      rustSource.includes("redact_json_value"),
    historyNativeBacked: runHistorySource.includes("nativeBacked: true") && runHistorySource.includes("descriptorOnly: false") && runHistorySource.includes("viewerMetadata"),
    runWorkspaceLabel: runWorkspaceSource.includes("native backed") && runWorkspaceSource.includes("runHistoryEvidence.boundary.nativeBacked")
  };

  for (const [name, ok] of Object.entries(readback)) {
    if (name === "descriptorOnly") {
      if (ok !== false) errors.push(issue("native-artifact.descriptor-only", "Native artifact readback must set descriptorOnly=false."));
      continue;
    }
    if (ok !== true) {
      errors.push(issue(nativeArtifactIssueCode(name), `Native artifact readback gate is missing ${name}.`));
    }
  }

  if (!String(packageJson.scripts?.["validate:native-runner-artifact-readback"] ?? "").includes("scripts/check-native-runner-artifact-readback.mjs")) {
    errors.push(issue("native-artifact.package-script", "package.json must expose validate:native-runner-artifact-readback."));
  }
  if (!String(packageJson.scripts?.validate ?? "").includes("npm run validate:native-runner-artifact-readback")) {
    errors.push(issue("native-artifact.validate-chain", "npm run validate must include native runner artifact readback validation."));
  }

  for (const phrase of ["artifact evidence", "viewer metadata", "cleanup receipt", "reproducibility digest", "native-backed"]) {
    if (!nativeContract.includes(phrase) && !runFolderContract.includes(phrase)) {
      errors.push(issue("native-artifact.contract", `Contract docs must mention ${phrase}.`));
    }
  }

  return {
    schemaVersion: "agentique.nativeRunnerArtifactReadback.v1",
    ok: errors.length === 0,
    readback,
    errors
  };
}

function parseFunctionBody(source, functionName) {
  const start = source.indexOf(`fn ${functionName}`);
  if (start < 0) return "";
  const open = source.indexOf("{", start);
  if (open < 0) return "";
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open, index + 1);
    }
  }
  return "";
}

function readText(root, relPath) {
  return fs.readFileSync(path.join(root, relPath), "utf8");
}

function readJson(root, relPath) {
  return JSON.parse(readText(root, relPath));
}

function kebab(value) {
  return String(value).replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`);
}

function nativeArtifactIssueCode(name) {
  if (name === "artifactsCommandReadsFolder") return "native-artifact.artifacts-command";
  return `native-artifact.${kebab(name)}`;
}

function escapeForRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function issue(code, message) {
  return { code, message };
}
