import { reviewCapabilityManifest, sampleCapabilityManifest } from "./capability-policy.mjs";
import { sampleLibraryState } from "./library-store.mjs";
import { samplePreview } from "./safe-preview.mjs";
import { redactText, sampleVaultState, sanitizeForExport } from "./secret-vault.mjs";
import { sampleSession } from "./session-store.mjs";
import { sampleConfigDraft, sampleUiSchema, validateConfigDraft } from "./ui-schema-config.mjs";
import { sampleWorkflowIr, validateWorkflowIr } from "./workflow-ir.mjs";

export const dryRunCheckFamilies = Object.freeze([
  "schema",
  "capability",
  "compatibility",
  "dependency",
  "missing-secret",
  "unsupported-node",
  "artifact-contract"
]);

export const sampleDryRunInput = Object.freeze({
  schemaVersion: "agentique.validateOnlyInput.v1",
  generatedAt: "2026-06-11T00:35:00.000Z",
  uiSchema: sampleUiSchema,
  configDraft: sampleConfigDraft,
  capabilityManifest: sampleCapabilityManifest,
  libraryState: sampleLibraryState,
  vaultState: sampleVaultState,
  workflowIr: sampleWorkflowIr,
  session: sampleSession,
  preview: samplePreview,
  target: {
    platform: "windows",
    requiredSupportMode: "visualizable"
  },
  dependencyManifest: {
    required: ["adapter:provider-sync"],
    available: []
  },
  requiredVaultRefs: ["vault:providerCredential", "vault:webhookCredential"]
});

export function createValidateOnlyDryRun(input = sampleDryRunInput) {
  const checks = [
    validateSchema(input.uiSchema, input.configDraft),
    validateCapability(input.capabilityManifest),
    validateCompatibility(input.libraryState, input.target),
    validateDependencies(input.dependencyManifest),
    validateMissingSecrets(input.vaultState, input.requiredVaultRefs),
    validateUnsupportedNodes(input.workflowIr),
    validateArtifactContract(input.session, input.preview)
  ];
  const failures = checks.flatMap((check) => check.issues.map((item) => ({
    family: check.family,
    code: item.code,
    severity: item.severity,
    message: redactText(item.message)
  })));

  return sanitizeForExport({
    schemaVersion: "agentique.validateOnlyReport.v1",
    operationMode: "validate-only",
    generatedAt: input.generatedAt ?? "2026-06-11T00:35:00.000Z",
    ok: failures.length === 0,
    summary: {
      checks: checks.length,
      passed: checks.filter((check) => check.status === "pass").length,
      failed: checks.filter((check) => check.status === "fail").length,
      blockingFailures: failures.filter((failure) => failure.severity === "error").length
    },
    checks,
    failures,
    sideEffects: [],
    localArtifacts: [
      {
        kind: "dry-run-report",
        persistence: "local-session-only",
        redacted: true
      }
    ]
  });
}

function validateSchema(uiSchema, configDraft) {
  const result = validateConfigDraft(uiSchema, configDraft);
  return check("schema", result.ok ? "pass" : "fail", result.errors.map(toErrorIssue), {
    fields: Object.keys(result.values ?? {}).length
  });
}

function validateCapability(capabilityManifest) {
  const result = reviewCapabilityManifest(capabilityManifest);
  return check("capability", result.ok ? "pass" : "fail", (result.errors ?? []).map(toErrorIssue), result.summary);
}

function validateCompatibility(libraryState, target = {}) {
  const resource = libraryState?.resources?.[0];
  const issues = [];
  if (!resource) {
    issues.push(issue("compatibility.missing-resource", "No verified resource exists for validation."));
  } else {
    if (target.platform && !resource.compatibility.platforms.includes(target.platform)) {
      issues.push(issue("compatibility.platform", `Target platform ${target.platform} is not supported.`));
    }
    if (target.requiredSupportMode && resource.supportMode !== target.requiredSupportMode) {
      issues.push(issue("compatibility.support-mode", `Resource support mode ${resource.supportMode} does not satisfy ${target.requiredSupportMode}.`));
    }
  }
  return check("compatibility", issues.length === 0 ? "pass" : "fail", issues, {
    platform: target.platform ?? "unknown",
    supportMode: resource?.supportMode ?? "missing"
  });
}

function validateDependencies(dependencyManifest = {}) {
  const required = Array.isArray(dependencyManifest.required) ? dependencyManifest.required : [];
  const available = new Set(Array.isArray(dependencyManifest.available) ? dependencyManifest.available : []);
  const missing = required.filter((dependency) => !available.has(dependency));
  const issues = missing.map((dependency) => issue(
    "dependency.missing",
    `Missing dependency ${redactText(dependency)}; dry-run will not start adapters.`
  ));
  return check("dependency", issues.length === 0 ? "pass" : "fail", issues, {
    required: required.length,
    missing: missing.length
  });
}

function validateMissingSecrets(vaultState = {}, requiredVaultRefs = []) {
  const records = new Map((vaultState.records ?? []).map((record) => [record.ref, record]));
  const issues = [];
  for (const ref of requiredVaultRefs) {
    const record = records.get(ref);
    if (!record || record.status === "missing") {
      issues.push(issue("secret.missing", `Missing vault reference ${redactText(ref)}.`));
    }
  }
  return check("missing-secret", issues.length === 0 ? "pass" : "fail", issues, {
    required: requiredVaultRefs.length,
    missing: issues.length
  });
}

function validateUnsupportedNodes(workflowIr) {
  const result = validateWorkflowIr(workflowIr);
  const issues = result.errors
    .filter((error) => error.code === "workflow.unsupported-node")
    .map(toErrorIssue);
  return check("unsupported-node", issues.length === 0 ? "pass" : "fail", issues, result.summary);
}

function validateArtifactContract(session, preview) {
  const events = Array.isArray(session?.events) ? session.events : [];
  const artifactEvents = events.filter((event) => event.type === "artifact");
  const issues = [];
  if (session?.cloudSessionRequired === true) {
    issues.push(issue("artifact.cloud-session", "Artifact validation must not require cloud session persistence."));
  }
  if (artifactEvents.length === 0) {
    issues.push(issue("artifact.missing-event", "At least one local artifact event is required."));
  }
  if (!preview?.ok || preview.renderMode === "blocked") {
    issues.push(issue("artifact.preview-blocked", "Static preview artifact contract is blocked."));
  }
  return check("artifact-contract", issues.length === 0 ? "pass" : "fail", issues, {
    artifactEvents: artifactEvents.length,
    previewMode: preview?.renderMode ?? "missing"
  });
}

function check(family, status, issues = [], details = {}) {
  return {
    family,
    status,
    issueCount: issues.length,
    issues,
    details
  };
}

function toErrorIssue(error) {
  return issue(error.code ?? "dry-run.error", error.message ?? "Validation failed.");
}

function issue(code, message, severity = "error") {
  return { code, message: redactText(message), severity };
}
