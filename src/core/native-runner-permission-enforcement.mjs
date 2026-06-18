import fs from "node:fs";
import path from "node:path";

const allowedRequestFields = new Set(["resource_id", "session_id", "run_id", "command_id", "adapter_id", "approval_id", "permission_profile_id", "permission_grant_id"]);
const forbiddenRequestFieldPattern =
  /\b(?:permissions?|permission_targets?|permission_requirements?|grants?|targets?|path|cwd|args|env|environment|script|shell|executable|command_line|browser_data)\s*:/iu;
const unsafeReceiptPattern = /(?<![A-Za-z])[A-Za-z]:[\\/]|bearer\s+[A-Za-z0-9._-]{12,}|sk-[A-Za-z0-9_-]{16,}/iu;

export function readNativeRunnerPermissionEnforcementInputs(root = process.cwd()) {
  const repoRoot = path.resolve(root);
  return {
    root: repoRoot,
    rustSource: readText(repoRoot, "src-tauri/src/lib.rs"),
    packageJson: readJson(repoRoot, "package.json"),
    nativeContract: readText(repoRoot, "docs/contracts/native-runner-boundary.md"),
    permissionContract: readText(repoRoot, "docs/contracts/permission-grants.md"),
    permissionGrantSource: readText(repoRoot, "src/core/permission-grants.mjs"),
    runnerPermissionSource: readText(repoRoot, "src/core/runner-permission-preflight.mjs")
  };
}

export function reviewNativeRunnerPermissionEnforcement(input = readNativeRunnerPermissionEnforcementInputs()) {
  const rustSource = String(input.rustSource ?? "");
  const packageJson = input.packageJson ?? {};
  const nativeContract = String(input.nativeContract ?? "");
  const permissionContract = String(input.permissionContract ?? "");
  const permissionGrantSource = String(input.permissionGrantSource ?? "");
  const runnerPermissionSource = String(input.runnerPermissionSource ?? "");
  const requestBody = parseRunnerRequestBody(rustSource);
  const requestFields = parseStructFields(requestBody);
  const errors = [];

  if (unsafeReceiptPattern.test(rustSource)) {
    errors.push(
      issue("native-permission.unsafe-receipt", "Native permission receipts must not expose raw local paths, secrets, interpreter paths, browser data, or native run roots.")
    );
  }

  for (const field of requestFields) {
    if (!allowedRequestFields.has(field.name)) {
      errors.push(
        issue(
          "native-permission.request-field-forbidden",
          "RunnerCommandRequest must not accept raw permission targets, grant JSON, paths, shell, args, cwd, browser data, or env fields."
        )
      );
    }
  }
  if (forbiddenRequestFieldPattern.test(requestBody)) {
    errors.push(
      issue(
        "native-permission.request-field-forbidden",
        "RunnerCommandRequest must not accept raw permission targets, grant JSON, paths, shell, args, cwd, browser data, or env fields."
      )
    );
  }

  const permission = {
    nativeBacked:
      rustSource.includes("agentique.nativeRunnerPermissionGrantReceipt.v1") &&
      rustSource.includes("NativePermissionGrantReceipt") &&
      rustSource.includes("NativePermissionGrantRecord") &&
      rustSource.includes("native_permission_grant_records") &&
      rustSource.includes("store_native_permission_grant") &&
      rustSource.includes("consume_native_permission_grant"),
    startRequiresGrantId:
      /permission_grant_id\s*:\s*Option\s*<\s*String\s*>/u.test(requestBody) && /permissionGrantId is required before the fixed adapter lane can start/u.test(rustSource),
    consumesGrant: /grant\.consumed\s*=\s*true/u.test(rustSource) && /permission\.preflight-allowed/u.test(rustSource),
    revokedBlocked: /permissionGrantId has been revoked before native start/u.test(rustSource) && /revoke_native_permission_grant_for_tests/u.test(rustSource),
    expiredBlocked: /permissionGrantId expired before native start/u.test(rustSource) && /expire_native_permission_grant_for_tests/u.test(rustSource),
    scopedToRun:
      /grant\.resource_id\s*==\s*request\.resource_id/u.test(rustSource) &&
      /grant\.session_id\s*==\s*request\.session_id/u.test(rustSource) &&
      /grant\.run_id\s*==\s*request\.run_id/u.test(rustSource) &&
      /grant\.grant_id\s*==\s*run_record\.permission_grant_id/u.test(rustSource),
    redactedAndPathNeutral:
      rustSource.includes("target_refs") &&
      rustSource.includes("redacted: true") &&
      rustSource.includes("workspace:runs") &&
      rustSource.includes("artifact-retention:7d") &&
      !unsafeReceiptPattern.test(rustSource),
    jsPreflightStillBlocks:
      permissionGrantSource.includes("permission-grant.hidden-file") &&
      permissionGrantSource.includes("permission-grant.hidden-network") &&
      permissionGrantSource.includes("permission-grant.ambient-env") &&
      permissionGrantSource.includes("permission-grant.generic-shell") &&
      permissionGrantSource.includes("permission-grant.revoked") &&
      runnerPermissionSource.includes("revokeRunnerPermissionGrant")
  };

  for (const [name, ok] of Object.entries(permission)) {
    if (ok !== true) {
      errors.push(issue(`native-permission.${kebab(name)}`, `Native permission enforcement gate is missing ${name}.`));
    }
  }

  if (!String(packageJson.scripts?.["validate:native-runner-permission-enforcement"] ?? "").includes("scripts/check-native-runner-permission-enforcement.mjs")) {
    errors.push(issue("native-permission.package-script", "package.json must expose validate:native-runner-permission-enforcement."));
  }
  if (!String(packageJson.scripts?.validate ?? "").includes("npm run validate:native-runner-permission-enforcement")) {
    errors.push(issue("native-permission.validate-chain", "npm run validate must include native runner permission enforcement validation."));
  }

  for (const phrase of ["permissionGrantId", "native-owned permission grant", "revoked", "expired", "browser data", "generic shell"]) {
    if (!nativeContract.includes(phrase) && !permissionContract.includes(phrase)) {
      errors.push(issue("native-permission.contract", `Contract docs must mention ${phrase}.`));
    }
  }

  return {
    schemaVersion: "agentique.nativeRunnerPermissionEnforcement.v1",
    ok: errors.length === 0,
    permission,
    requestFields: requestFields.map((field) => field.name),
    errors
  };
}

function parseRunnerRequestBody(rustSource) {
  const match = String(rustSource ?? "").match(/struct\s+RunnerCommandRequest\s*\{([\s\S]*?)\n\}/u);
  return match?.[1] ?? "";
}

function parseStructFields(body) {
  return [...String(body ?? "").matchAll(/^\s*([a-z_][a-z0-9_]*)\s*:\s*([^,\n]+),/gmu)].map((entry) => ({
    name: entry[1],
    type: entry[2].trim()
  }));
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

function issue(code, message) {
  return { code, message };
}
