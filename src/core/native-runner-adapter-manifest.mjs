import fs from "node:fs";
import path from "node:path";

const approvedManifest = Object.freeze({
  manifestId: "manifest.local-python.v1",
  adapterId: "adapter.local-python",
  runtime: "python",
  supportMode: "locally-runnable",
  version: "0.1.0",
  digestPrefix: "cccccccccccc",
  signatureStatus: "verified",
  executableRef: "native-bundled-local-python-adapter"
});

const requestOverridePattern =
  /\b(?:manifest|digest|signature|runtime|support_mode|supportMode|executable|executable_path|path|cwd|args|env|environment|shell|script|command_line)\s*:/iu;
const unsafeExecutableRefPattern = /(^[A-Za-z]:[\\/]|^\/|\\|\/|(?:^|[\\/])\.\.(?:[\\/]|$)|~|\$|\s)/u;

export function readNativeRunnerAdapterManifestInputs(root = process.cwd()) {
  return {
    root,
    rustSource: fs.readFileSync(path.join(root, "src-tauri", "src", "lib.rs"), "utf8"),
    packageJson: fs.readFileSync(path.join(root, "package.json"), "utf8"),
    contractDoc: fs.readFileSync(path.join(root, "docs", "contracts", "native-runner-boundary.md"), "utf8")
  };
}

export function reviewNativeRunnerAdapterManifest(input = readNativeRunnerAdapterManifestInputs()) {
  const rustSource = String(input.rustSource ?? "");
  const packageJson = String(input.packageJson ?? "");
  const contractDoc = String(input.contractDoc ?? "");
  const requestBody = parseRunnerRequestBody(rustSource);
  const errors = [];

  const manifest = {
    ...approvedManifest,
    nativeOwned: /\bNativeAdapterManifest\b/u.test(rustSource) && /\bfixed_python_adapter_manifest\s*\(/u.test(rustSource) && /\bresolve_adapter_manifest\s*\(/u.test(rustSource),
    redactedReceipt: /\bNativeAdapterManifestReceipt\b/u.test(rustSource) && /\bdigest_prefix\b/u.test(rustSource) && /\bredacted:\s*true\b/u.test(rustSource),
    pathNeutralExecutableRef: /native-bundled-local-python-adapter/u.test(rustSource) && !unsafeExecutableRefPattern.test(approvedManifest.executableRef),
    prepareStoresManifest:
      /\badapter_manifest_id\b/u.test(rustSource) &&
      /\badapter_manifest_digest\b/u.test(rustSource) &&
      /\bagentique_runner_prepare[\s\S]*?review_adapter_manifest/u.test(rustSource),
    startRevalidatesManifest: /\bagentique_runner_start[\s\S]*?review_adapter_manifest/u.test(rustSource)
  };

  const failClosed = {
    missing: /adapter manifest is missing/u.test(rustSource),
    unsigned: /signature status is not trusted/u.test(rustSource),
    tampered: /digest is missing or tampered/u.test(rustSource),
    revoked: /adapter manifest is revoked/u.test(rustSource),
    incompatiblePlatform: /platform compatibility is incomplete/u.test(rustSource),
    wrongRuntime: /wrong runtime/u.test(rustSource),
    wrongSupportMode: /wrong support mode/u.test(rustSource),
    unsafeExecutableRef: /executableRef[\s\S]*path or command ref/u.test(rustSource) || /executable reference is not allowlisted/u.test(rustSource)
  };

  if (!manifest.nativeOwned || !manifest.redactedReceipt || !manifest.pathNeutralExecutableRef || !manifest.prepareStoresManifest || !manifest.startRevalidatesManifest) {
    errors.push(issue("manifest.native-owned", "Native runner must own, review, store, and redact the fixed adapter manifest."));
  }
  if (requestOverridePattern.test(requestBody)) {
    errors.push(issue("manifest.request-override", "RunnerCommandRequest must not accept manifest overrides, executable paths, args, env, shell, or command text."));
  }
  for (const [name, ok] of Object.entries(failClosed)) {
    if (ok !== true) {
      errors.push(issue(`manifest.fail-closed.${name}`, `Native adapter manifest gate must fail closed for ${name}.`));
    }
  }
  if (!packageJson.includes('"validate:native-runner-adapter-manifest"') || !packageJson.includes("scripts/check-native-runner-adapter-manifest.mjs")) {
    errors.push(issue("manifest.validation-wiring", "Package validation must expose validate:native-runner-adapter-manifest."));
  }
  if (!contractDoc.includes("native-resolved fixed adapter manifest") || !contractDoc.includes("digest prefix")) {
    errors.push(issue("manifest.contract", "Native runner contract must document native manifest resolution and redacted digest receipt."));
  }
  return {
    schemaVersion: "agentique.nativeRunnerAdapterManifestGate.v1",
    ok: errors.length === 0,
    manifest,
    failClosed,
    errors
  };
}

function parseRunnerRequestBody(rustSource) {
  const match = String(rustSource ?? "").match(/struct\s+RunnerCommandRequest\s*\{([\s\S]*?)\n\}/u);
  return match?.[1] ?? "";
}

function issue(code, message) {
  return { code, message };
}
