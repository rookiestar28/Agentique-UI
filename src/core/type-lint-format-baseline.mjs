import fs from "node:fs";
import path from "node:path";
import { hasValidationCommand } from "./validation-stage-reporting.mjs";

export const typeLintFormatBaselineSchemaVersion = "agentique.typeLintFormatBaseline.v1";

export const requiredNodeEngine = "^20.19.0 || ^22.13.0 || >=24";

export const requiredToolVersions = Object.freeze({
  "@eslint/js": "10.0.1",
  "@types/node": "25.9.3",
  eslint: "10.5.0",
  globals: "17.6.0",
  prettier: "3.8.4",
  "typescript-eslint": "8.61.0"
});

export const controlledCheckJsFiles = Object.freeze([
  "src/core/active-native-event-transport.mjs",
  "src/core/artifact-receipt-binding.mjs",
  "src/core/runtime-prerequisite-readiness.mjs",
  "src/core/multi-lane-execution-readiness.mjs",
  "src/core/adapter-registry.mjs",
  "src/core/python-node-adapter-pack-expansion.mjs",
  "src/core/repo-local-task-runner-lane.mjs",
  "src/core/external-agent-client-pack-expansion.mjs",
  "src/core/mcp-bridge-readiness-descriptor.mjs",
  "src/core/wasm-wasi-sandbox-gate.mjs",
  "src/core/rootless-container-preflight-gate.mjs",
  "src/core/browser-automation-consent-gate.mjs",
  "src/core/local-vault-secrets-ux.mjs",
  "src/core/diagnostics-support-bundle.mjs",
  "src/core/function-expansion-closeout.mjs",
  "src/core/executable-capability-closeout-pack.mjs",
  "src/core/build-payload-budget.mjs",
  "src/core/durable-run-ledger.mjs",
  "src/core/watchdog-heartbeat-supervisor.mjs",
  "src/core/i18n-catalog-loading.mjs",
  "src/core/permission-center-policy-diff.mjs",
  "src/core/run-dashboard-queue-monitor.mjs",
  "src/core/logs-artifact-workbench.mjs",
  "src/core/workflow-template-run-plan-builder.mjs",
  "src/core/human-approval-resume-rerun-ux.mjs",
  "src/core/library-update-lifecycle.mjs",
  "src/core/live-data-boundary.mjs",
  "src/core/native-runner-boundary.mjs",
  "src/core/native-runner-adapter-manifest.mjs",
  "src/core/native-runner-python-execution.mjs",
  "src/core/native-runner-event-replay.mjs",
  "src/core/native-runner-permission-enforcement.mjs",
  "src/core/native-runner-artifact-readback.mjs",
  "src/core/native-runner-cleanup-recovery.mjs",
  "src/core/native-runner-sidecar-gate.mjs",
  "src/core/release-docs-gate.mjs",
  "src/core/release-packaging-preflight.mjs",
  "src/core/runner-revocation-cancel-controls.mjs",
  "src/core/source-first-executable-capability.mjs",
  "src/core/style-source-boundary.mjs",
  "src/core/type-lint-format-baseline.mjs",
  "src/core/validation-stage-reporting.mjs",
  "src/core/workspace-file-budgets.mjs",
  "scripts/check-active-native-event-transport.mjs",
  "scripts/check-artifact-receipt-binding.mjs",
  "scripts/check-runtime-prerequisite-readiness.mjs",
  "scripts/check-multi-lane-execution-readiness.mjs",
  "scripts/check-adapter-registry-manifest-trust-policy.mjs",
  "scripts/check-python-node-adapter-pack-expansion.mjs",
  "scripts/check-repo-local-task-runner-lane.mjs",
  "scripts/check-external-agent-client-pack-expansion.mjs",
  "scripts/check-mcp-bridge-readiness-descriptor.mjs",
  "scripts/check-wasm-wasi-sandbox-gate.mjs",
  "scripts/check-rootless-container-preflight-gate.mjs",
  "scripts/check-browser-automation-consent-gate.mjs",
  "scripts/check-local-vault-secrets-ux.mjs",
  "scripts/check-diagnostics-support-bundle.mjs",
  "scripts/check-function-expansion-closeout.mjs",
  "scripts/check-executable-capability-closeout-pack.mjs",
  "scripts/check-build-payload-budget.mjs",
  "scripts/check-durable-run-ledger.mjs",
  "scripts/check-watchdog-heartbeat-supervisor.mjs",
  "scripts/check-i18n-catalog-loading.mjs",
  "scripts/check-permission-center-policy-diff.mjs",
  "scripts/check-run-dashboard-queue-monitor.mjs",
  "scripts/check-logs-artifact-workbench.mjs",
  "scripts/check-workflow-template-run-plan-builder.mjs",
  "scripts/check-human-approval-resume-rerun-ux.mjs",
  "scripts/check-library-update-lifecycle.mjs",
  "scripts/check-live-data-boundary.mjs",
  "scripts/check-native-runner-boundary.mjs",
  "scripts/check-native-runner-adapter-manifest.mjs",
  "scripts/check-native-runner-python-execution.mjs",
  "scripts/check-native-runner-event-replay.mjs",
  "scripts/check-native-runner-permission-enforcement.mjs",
  "scripts/check-native-runner-artifact-readback.mjs",
  "scripts/check-native-runner-cleanup-recovery.mjs",
  "scripts/check-native-runner-sidecar-gate.mjs",
  "scripts/check-runner-revocation-cancel-controls.mjs",
  "scripts/check-source-first-executable-capability.mjs",
  "scripts/validate-release-docs.mjs",
  "scripts/check-release-packaging-preflight.mjs",
  "scripts/check-style-source-boundary.mjs",
  "scripts/check-type-lint-format-baseline.mjs",
  "scripts/check-validation-stage-reporting.mjs",
  "scripts/run-validate-staged.mjs",
  "scripts/check-workspace-file-budgets.mjs"
]);

const generatedIgnorePatterns = Object.freeze(["coverage/", "dist/", "node_modules/", ".tmp/", "src-tauri/target/", "*.log"]);

export function reviewTypeLintFormatBaseline({ root = process.cwd() } = {}) {
  const report = collectTypeLintFormatBaselineReport({ root });
  return {
    report,
    validation: validateTypeLintFormatBaseline(report)
  };
}

export function collectTypeLintFormatBaselineReport({ root = process.cwd() } = {}) {
  const repoRoot = path.resolve(root);
  const packageJson = readJsonIfExists(repoRoot, "package.json") ?? {};
  const packageLock = readJsonIfExists(repoRoot, "package-lock.json") ?? {};
  const tsconfigCheckJs = readJsonIfExists(repoRoot, "tsconfig.checkjs.json") ?? {};
  const eslintSource = readTextIfExists(repoRoot, "eslint.config.mjs");
  const prettierSource = readTextIfExists(repoRoot, "prettier.config.mjs");
  const prettierIgnoreSource = readTextIfExists(repoRoot, ".prettierignore");
  const scripts = packageJson.scripts ?? {};
  const devDependencies = packageJson.devDependencies ?? {};

  return {
    schemaVersion: typeLintFormatBaselineSchemaVersion,
    node: {
      engine: packageJson.engines?.node ?? "",
      required: requiredNodeEngine,
      matchesTooling: packageJson.engines?.node === requiredNodeEngine
    },
    tools: Object.fromEntries(
      Object.entries(requiredToolVersions).map(([name, version]) => [
        name,
        {
          packageSpec: devDependencies[name] ?? null,
          lockedVersion: packageLock.packages?.[`node_modules/${name}`]?.version ?? null,
          expectedVersion: version
        }
      ])
    ),
    scripts: {
      lint: scripts.lint ?? "",
      formatCheck: scripts["format:check"] ?? "",
      typecheckJs: scripts["typecheck:js"] ?? "",
      validateTypeLintFormat: scripts["validate:type-lint-format"] ?? "",
      validate: scripts.validate ?? ""
    },
    configs: {
      eslint: {
        exists: eslintSource.length > 0,
        usesFlatConfig: /typescript-eslint/u.test(eslintSource) && /@eslint\/js/u.test(eslintSource),
        usesGlobals: /globals/u.test(eslintSource),
        generatedIgnores: generatedIgnorePatterns.map((pattern) => pattern.replace(/\/$/u, "/**")).filter((pattern) => eslintSource.includes(pattern))
      },
      prettier: {
        exists: prettierSource.length > 0,
        ignoreExists: prettierIgnoreSource.length > 0,
        generatedIgnores: generatedIgnorePatterns.filter((pattern) => prettierIgnoreSource.includes(pattern))
      },
      checkJs: {
        exists: Object.keys(tsconfigCheckJs).length > 0,
        checkJs: tsconfigCheckJs.compilerOptions?.checkJs === true,
        noEmit: tsconfigCheckJs.compilerOptions?.noEmit === true,
        nodeTypes: Array.isArray(tsconfigCheckJs.compilerOptions?.types) && tsconfigCheckJs.compilerOptions.types.includes("node"),
        include: Array.isArray(tsconfigCheckJs.include) ? tsconfigCheckJs.include : [],
        controlledFiles: controlledCheckJsFiles
      }
    },
    legacyConfigs: {
      eslintIgnore: fs.existsSync(path.join(repoRoot, ".eslintignore")),
      eslintrcJson: fs.existsSync(path.join(repoRoot, ".eslintrc.json")),
      eslintrcJs: fs.existsSync(path.join(repoRoot, ".eslintrc.js")),
      eslintrcCjs: fs.existsSync(path.join(repoRoot, ".eslintrc.cjs"))
    }
  };
}

export function validateTypeLintFormatBaseline(report) {
  const failures = [];

  if (report?.schemaVersion !== typeLintFormatBaselineSchemaVersion) {
    failures.push(issue("schema-version", "Unsupported type/lint/format baseline schema version."));
  }
  if (report?.node?.matchesTooling !== true) {
    failures.push(issue("node-engine", `Node engine must be ${requiredNodeEngine}.`));
  }

  for (const [name, expectedVersion] of Object.entries(requiredToolVersions)) {
    const tool = report?.tools?.[name];
    if (!tool?.packageSpec) {
      failures.push(issue("missing-tool-dependency", `${name} must be present in devDependencies.`));
    }
    if (tool?.lockedVersion !== expectedVersion) {
      failures.push(issue("tool-lock-version", `${name} must be locked at ${expectedVersion}.`));
    }
  }

  requireScript(report, "lint", "eslint ", failures);
  requireScript(report, "formatCheck", "prettier --check", failures);
  if (/--write/u.test(report?.scripts?.formatCheck ?? "")) {
    failures.push(issue("format-write", "format:check must not use --write."));
  }
  requireScript(report, "typecheckJs", "tsc -p tsconfig.checkjs.json", failures);
  requireScript(report, "validateTypeLintFormat", "scripts/check-type-lint-format-baseline.mjs", failures);

  for (const requiredStage of ["npm run lint", "npm run format:check", "npm run typecheck:js", "npm run validate:type-lint-format"]) {
    if (!hasValidationCommand(requiredStage)) {
      failures.push(issue("validate-stage-missing", `Validation stage manifest must include ${requiredStage}.`));
    }
  }

  if (report?.configs?.eslint?.exists !== true || report.configs.eslint.usesFlatConfig !== true) {
    failures.push(issue("eslint-flat-config", "eslint.config.mjs must use flat config with ESLint and typescript-eslint."));
  }
  if (report?.configs?.eslint?.usesGlobals !== true) {
    failures.push(issue("eslint-globals", "eslint.config.mjs must define runtime globals explicitly."));
  }
  for (const pattern of generatedIgnorePatterns) {
    const eslintPattern = pattern.replace(/\/$/u, "/**");
    if (!report?.configs?.eslint?.generatedIgnores?.includes(eslintPattern)) {
      failures.push(issue("eslint-ignore", `eslint.config.mjs must ignore ${eslintPattern}.`));
    }
    if (!report?.configs?.prettier?.generatedIgnores?.includes(pattern)) {
      failures.push(issue("prettier-ignore", `.prettierignore must ignore ${pattern}.`));
    }
  }

  if (report?.configs?.prettier?.exists !== true || report.configs.prettier.ignoreExists !== true) {
    failures.push(issue("prettier-config", "Prettier config and ignore file must exist."));
  }

  if (report?.configs?.checkJs?.exists !== true || report.configs.checkJs.checkJs !== true || report.configs.checkJs.noEmit !== true) {
    failures.push(issue("checkjs-config", "tsconfig.checkjs.json must enable checkJs and noEmit."));
  }
  if (report?.configs?.checkJs?.nodeTypes !== true) {
    failures.push(issue("checkjs-node-types", "tsconfig.checkjs.json must include Node types."));
  }
  const included = new Set(report?.configs?.checkJs?.include ?? []);
  for (const file of controlledCheckJsFiles) {
    if (!included.has(file)) {
      failures.push(issue("checkjs-controlled-file", `tsconfig.checkjs.json must include ${file}.`));
    }
  }

  if (Object.values(report?.legacyConfigs ?? {}).some(Boolean)) {
    failures.push(issue("legacy-eslint-config", "Legacy ESLint config files must not be introduced."));
  }

  return {
    ok: failures.length === 0,
    status: failures.length === 0 ? "passed" : "failed",
    failures,
    summary: {
      tools: Object.keys(requiredToolVersions).length,
      controlledCheckJsFiles: controlledCheckJsFiles.length,
      generatedIgnores: generatedIgnorePatterns.length
    }
  };
}

function requireScript(report, key, expectedSnippet, failures) {
  if (!String(report?.scripts?.[key] ?? "").includes(expectedSnippet)) {
    failures.push(issue("script-missing", `${key} must include ${expectedSnippet}.`));
  }
}

function issue(code, message) {
  return { code, message };
}

function readJsonIfExists(repoRoot, relPath) {
  const fullPath = path.join(repoRoot, relPath);
  if (!fs.existsSync(fullPath)) return null;
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

function readTextIfExists(repoRoot, relPath) {
  const fullPath = path.join(repoRoot, relPath);
  if (!fs.existsSync(fullPath)) return "";
  return fs.readFileSync(fullPath, "utf8");
}
