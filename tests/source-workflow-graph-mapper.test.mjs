import assert from "node:assert/strict";
import test from "node:test";
import { validateWorkflowIr } from "../src/core/workflow-ir.mjs";
import {
  createWorkflowGraphFromParserImport,
  createWorkflowGraphFromSourceGraph,
  sourceGraphContractVersion,
  sourceWorkflowGraphMapperVersion,
  workflowIrSchemaVersion
} from "../src/core/source-workflow-graph-mapper.mjs";

function sourceGraph() {
  return {
    contractVersion: sourceGraphContractVersion,
    title: "Source graph",
    sourceProvenance: {
      ecosystem: "autogen",
      sourceFormat: "json",
      parserId: "autogen-source"
    },
    nodes: [
      {
        id: "intent",
        kind: "input",
        label: "Import intent",
        riskFlags: []
      },
      {
        id: "verify",
        kind: "tool",
        label: "Verify package",
        riskFlags: ["unknown_vendor_node"]
      },
      {
        id: "provider-sync",
        kind: "http",
        label: "Provider sync",
        riskFlags: ["external_mutation", "credential_reference"]
      }
    ],
    edges: [
      {
        id: "edge-intent-verify",
        fromNodeId: "intent",
        toNodeId: "verify",
        label: "resource",
        kind: "data_flow"
      },
      {
        id: "edge-verify-provider",
        fromNodeId: "verify",
        toNodeId: "provider-sync",
        label: "verifiedResource",
        kind: "handoff"
      }
    ],
    variables: [
      {
        name: "PROVIDER_KEY",
        kind: "credential_name",
        publicValueAllowed: false,
        riskFlags: ["credential_reference"]
      }
    ],
    riskFlags: ["credential_reference", "external_mutation"],
    issues: [
      {
        code: "provider-review",
        category: "security",
        severity: "warning",
        message: "Provider sync needs review.",
        publicSafe: true
      }
    ],
    evidenceCompleteness: "PARTIAL",
    staticAnalysisConfidence: "MEDIUM",
    noExecutionBoundary: {
      importedModules: false,
      packageManagersExecuted: false,
      lifecycleHooksExecuted: false,
      workflowsExecuted: false,
      mcpServersExecuted: false,
      notebookOutputsExecuted: false,
      dockerBuildsExecuted: false,
      networkRequestsPerformed: false,
      filesystemTraversalOutsidePackage: false
    }
  };
}

test("maps source graph metadata into valid UI workflow IR", () => {
  const result = createWorkflowGraphFromSourceGraph(sourceGraph(), { workflowId: "source-demo" });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.projection.schemaVersion, sourceWorkflowGraphMapperVersion);
  assert.equal(result.projection.workflowIr.schemaVersion, workflowIrSchemaVersion);
  assert.deepEqual(
    result.projection.workflowIr.nodes.map((node) => [node.id, node.type, node.risk]),
    [
      ["intent", "input", "low"],
      ["verify", "transform", "medium"],
      ["provider-sync", "viewer", "high"]
    ]
  );
  assert.deepEqual(result.projection.workflowIr.edges, [
    { from: "intent", to: "verify", label: "resource" },
    { from: "verify", to: "provider-sync", label: "verifiedResource" }
  ]);
  assert.equal(validateWorkflowIr(result.projection.workflowIr).ok, true);
});

test("retains unsupported execution-risk nodes as non-executing sidecar metadata", () => {
  const result = createWorkflowGraphFromSourceGraph(sourceGraph());
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.deepEqual(result.projection.unsupportedNodes, [
    {
      id: "provider-sync",
      label: "Provider sync",
      sourceKind: "http",
      projectedType: "viewer",
      riskFlags: ["external_mutation", "credential_reference"],
      reason: "execution_risk_flag"
    }
  ]);
  assert.equal(result.projection.riskSummary.level, "high");
  assert.equal(result.projection.riskSummary.reviewRequired, true);
  assert.ok(result.projection.riskSummary.reasons.includes("execution_risk_flags_present"));
  assert.deepEqual(result.projection.credentialReferences, [
    {
      nodeId: "provider-sync",
      nodeLabel: "Provider sync",
      references: ["credential:provider_key"],
      valuesIncluded: false
    }
  ]);
});

test("parser import projection follows the same no-execution boundary", () => {
  const result = createWorkflowGraphFromParserImport(
    {
      resourceId: "parser.demo",
      title: "Parser demo",
      nodes: [
        { id: "start", type: "input", label: "Start", risk: "low" },
        { id: "review", type: "viewer", label: "Review output", risk: "low" }
      ],
      edges: [{ from: "start", to: "review", label: "artifact" }]
    },
    { workflowId: "parser-demo" }
  );
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.projection.workflowIr.workflowId, "parser-demo");
  assert.equal(result.projection.workflowIr.nodes.length, 2);
  assert.equal(result.projection.noExecution.workflowsExecuted, false);
  assert.equal(result.projection.noOverclaim.localRunnerAvailable, false);
});

test("rejects private issues, local paths, inline credentials, and raw command labels", () => {
  const privateIssue = sourceGraph();
  privateIssue.issues[0].publicSafe = false;
  assert.equal(createWorkflowGraphFromSourceGraph(privateIssue).ok, false);

  const localPath = sourceGraph();
  localPath.nodes[0].label = ["C", ":", "\\", "Users", "\\", "local", "\\", "workflow.json"].join("");
  assert.equal(createWorkflowGraphFromSourceGraph(localPath).ok, false);

  const tokenValue = sourceGraph();
  tokenValue.nodes[0].label = ["bearer", "sampleSensitiveValue"].join(" ");
  assert.equal(createWorkflowGraphFromSourceGraph(tokenValue).ok, false);

  const commandLabel = sourceGraph();
  commandLabel.nodes[0].label = "npm install package";
  const commandResult = createWorkflowGraphFromSourceGraph(commandLabel);
  assert.equal(commandResult.ok, false);
  assert.equal(commandResult.errors[0].code, "graph.unsafe-text");
});

test("output keeps no-execution and no-overclaim posture explicit", () => {
  const result = createWorkflowGraphFromSourceGraph(sourceGraph());
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.deepEqual(result.projection.noExecution, {
    importedModules: false,
    packageManagersExecuted: false,
    lifecycleHooksExecuted: false,
    workflowsExecuted: false,
    mcpServersExecuted: false,
    notebookOutputsExecuted: false,
    dockerBuildsExecuted: false,
    networkRequestsPerformed: false,
    filesystemTraversalOutsidePackage: false
  });
  assert.deepEqual(result.projection.noOverclaim, {
    editableWorkflow: false,
    localRunnerAvailable: false,
    credentialValuesAvailable: false,
    filePermissionGranted: false,
    networkPermissionGranted: false,
    shellPermissionGranted: false
  });
});
