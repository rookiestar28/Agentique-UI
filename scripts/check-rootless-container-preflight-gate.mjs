#!/usr/bin/env node
import fs from "node:fs";
import { reviewRootlessContainerPreflightGate } from "../src/core/rootless-container-preflight-gate.mjs";

const failures = [];
const moduleText = readText("src/core/rootless-container-preflight-gate.mjs");
const tests = readText("tests/rootless-container-preflight-gate.test.mjs");
const surfaceTests = readText("tests/rootless-container-preflight-surface.test.mjs");
const docs = readText("docs/contracts/rootless-container-preflight-gate.md");
const panel = readText("src/workspaces/RootlessContainerPreflightGatePanel.tsx");
const runWorkspace = readText("src/workspaces/RunWorkspace.tsx");
const route = readText("src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx");
const types = readText("src/workspaces/TrustRunSettingsTypes.ts");
const packageJson = JSON.parse(readText("package.json"));
const review = reviewRootlessContainerPreflightGate();

requireIncludes(
  moduleText,
  [
    "agentique.rootlessContainerPreflightGate.v1",
    "startsContainer: false",
    "preflight-only-no-container-start",
    "rootless",
    "userNamespace",
    "readOnlyRootFilesystem",
    "daemonSocketMounted",
    "evaluateRunStartGrants",
    "assertContainerPolicySafe"
  ],
  "rootless container preflight module"
);

requireIncludes(
  tests,
  [
    "complete rootless container contract is preflight-ready without starting a container",
    "rootful daemon and missing platform smoke evidence fail closed",
    "image trust requires digest signature provenance sbom and active status",
    "privileged mode daemon socket and broad host volumes are rejected",
    "host networking and public port publishing are rejected",
    "permission preflight must pass before container preflight readiness",
    "container execution production and privileged host claims are rejected"
  ],
  "rootless container preflight tests"
);

requireIncludes(
  surfaceTests,
  [
    "run page exposes rootless container preflight evidence",
    "rootless container preflight surface stays review-only without runtime effects",
    "Rootless container preflight gate",
    "No-start receipt",
    "No-pull receipt",
    "No-build receipt",
    "Blocked unsafe container samples",
    "node:child_process",
    "docker|podman"
  ],
  "rootless container preflight surface tests"
);

requireIncludes(
  docs,
  [
    "Rootless Container Preflight Gate Contract",
    "guarded preflight only",
    "does not start Docker or Podman containers",
    "rootless mode, user namespace, user-scoped runtime socket",
    "immutable image digest",
    "read-only root filesystem",
    "startsContainer: false",
    "does not provide a production desktop runtime"
  ],
  "rootless container preflight docs"
);

requireIncludes(
  panel,
  [
    "Rootless container preflight gate",
    "Preflight status",
    "Execution decision",
    "Runtime mode",
    "Rootless evidence",
    "Platform limitations",
    "Image trust",
    "Filesystem boundary",
    "Network policy",
    "Resource limits",
    "Cleanup receipts",
    "Permission preflight",
    "No-start receipt",
    "No-pull receipt",
    "No-build receipt",
    "Blocked unsafe container samples",
    "No universal runtime claim"
  ],
  "rootless container preflight panel"
);

requireIncludes(runWorkspace, ["RootlessContainerPreflightGatePanel", "rootlessContainerPreflightGate"], "Run workspace rootless container wiring");

requireIncludes(
  route,
  ["createRootlessContainerPreflightReview", "rootlessContainerPreflightGate", "rootlessContainerPreflightGate={rootlessContainerPreflightGate}"],
  "Run route rootless container wiring"
);

requireIncludes(types, ["rootlessContainerPreflightGate: AnyRecord"], "Run workspace props");

const browserSurface = [panel, runWorkspace, route].join("\n");
const forbiddenBrowserRuntime =
  /node:child_process|child_process|node:fs|writeFile|appendFile|createWriteStream|spawn\(|execFile\(|exec\(|fetch\(|WebSocket\(|invoke\(|Command\.create|new\s+Command|\b(?:docker|podman)\s+(?:run|pull|build|compose|start|create|exec)|docker-compose|compose\.ya?ml|containerd|nerdctl|npm install|postinstall|preinstall/u;
if (forbiddenBrowserRuntime.test(browserSurface)) {
  failures.push("rootless container preflight browser surface must stay review-only and avoid runtime-effect APIs");
}

if (!review.ok || review.approvedStatus !== "preflight-ready" || review.startsContainer !== false) {
  failures.push("rootless container preflight review must prove preflight readiness without starting containers");
}

if (!review.rootfulBlocked || !review.untrustedImageBlocked || !review.broadVolumeBlocked || !review.hostNetworkBlocked) {
  failures.push("rootless container preflight review must prove unsafe rootful, image, volume, and network paths are blocked");
}

if (!String(packageJson.scripts?.["validate:rootless-container-preflight-gate"] ?? "").includes("check-rootless-container-preflight-gate.mjs")) {
  failures.push("package scripts must define validate:rootless-container-preflight-gate");
}

if (!String(packageJson.scripts?.validate ?? "").includes("validate:rootless-container-preflight-gate")) {
  failures.push("validate script must include validate:rootless-container-preflight-gate");
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      checked: [
        "src/core/rootless-container-preflight-gate.mjs",
        "tests/rootless-container-preflight-gate.test.mjs",
        "tests/rootless-container-preflight-surface.test.mjs",
        "src/workspaces/RootlessContainerPreflightGatePanel.tsx",
        "src/workspaces/RunWorkspace.tsx",
        "src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx",
        "src/workspaces/TrustRunSettingsTypes.ts",
        "docs/contracts/rootless-container-preflight-gate.md"
      ],
      summary: review.summary
    },
    null,
    2
  )
);

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function requireIncludes(text, required, label) {
  for (const phrase of required) {
    if (!text.includes(phrase)) {
      failures.push(`${label} missing required phrase: ${phrase}`);
    }
  }
}
