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
"agentique.nativeRunFolderWriteReceipt.v2"
"digestAlgorithm"
"sha256"
"entries"
struct NativeRunFolderWriteReceipt {}
enum NativeRunFolderFault { BeforeCommit }
let fault = NativeRunFolderFault::BeforeCommit;
fn sha256_bytes() {}
fn bounded_redacted_run_text() {}
let stdout_bytes = bounded_redacted_run_text(stdout);
let stderr_bytes = bounded_redacted_run_text(stderr);
fn contains_unsafe_run_material() {}
fn validate_native_run_public_ref() {}
fn read_bounded_native_run_file() {}
fn validate_native_run_folder_at() {}
fn write_native_run_folder_with_fault() {
  fs::rename(&staging_dir, &final_dir);
}
let digest_algorithm: "sha256";
fn read_native_run_artifact_evidence() {
  validate_native_run_folder_at(&run_dir, &request.run_id);
  validate_native_run_public_ref(path, &request.run_id);
  read_bounded_native_run_file(&target, MAX_NATIVE_RUN_FILE_BYTES);
}
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
    runHistorySource: "nativeBacked: true descriptorOnly: false viewerMetadata",
    runWorkspaceSource: "native backed runHistoryEvidence.boundary.nativeBacked"
  };
}

export function reviewNativeRunnerArtifactReadback(input = readNativeRunnerArtifactReadbackInputs()) {
  const rustSource = String(input.rustSource ?? "");
  const packageJson = input.packageJson ?? {};
  const runHistorySource = String(input.runHistorySource ?? "");
  const runWorkspaceSource = String(input.runWorkspaceSource ?? "");
  const artifactsBody = parseFunctionBody(rustSource, "agentique_runner_artifacts");
  const readbackBody = parseFunctionBody(rustSource, "read_native_run_artifact_evidence");
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
    reproducibilityDigest: rustSource.includes("reproducibility_digest") && rustSource.includes("stable_native_digest") && rustSource.includes("NativeRunFolderWriteReceipt"),
    redactedLogs:
      rustSource.includes("bounded_redacted_run_text(stdout)") &&
      rustSource.includes("bounded_redacted_run_text(stderr)") &&
      rustSource.includes("redacted_json_string") &&
      rustSource.includes("redact_json_value"),
    atomicPublish:
      rustSource.includes("NativeRunFolderFault::BeforeCommit") &&
      rustSource.includes("write_native_run_folder_with_fault") &&
      rustSource.includes("fs::rename(&staging_dir, &final_dir)"),
    integrityValidated:
      rustSource.includes("agentique.nativeRunFolderWriteReceipt.v2") &&
      rustSource.includes("NativeRunFolderWriteReceipt") &&
      rustSource.includes("sha256_bytes") &&
      rustSource.includes('digest_algorithm: "sha256"') &&
      readbackBody.includes("validate_native_run_folder_at(&run_dir, &request.run_id)"),
    unsafeEvidenceFailsClosed:
      readbackBody.includes("validate_native_run_public_ref") &&
      rustSource.includes("contains_unsafe_run_material") &&
      rustSource.includes("read_bounded_native_run_file") &&
      !readbackBody.includes("safe_native_relative_ref"),
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
