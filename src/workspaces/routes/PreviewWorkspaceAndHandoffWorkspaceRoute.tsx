import { useMemo } from "react";
import { createAgentClientHandoffPlan } from "../../core/agent-client-handoff.mjs";
import { createExternalRuntimeHandoff } from "../../core/external-runtime-adapter.mjs";
import { createHandoffDescriptor, sampleHandoffDescriptor } from "../../core/handoff-helper.mjs";
import { sampleLibraryState } from "../../core/library-store.mjs";
import { samplePreview } from "../../core/safe-preview.mjs";
import { sampleWorkflowIr } from "../../core/workflow-ir.mjs";
import type { NavigationKey } from "../../ui/navigation";
import { HandoffWorkspace, PreviewWorkspace } from "../PreviewHandoffWorkspaces";

const previewFiles = [
  { name: "resource.md", detail: "static text" },
  { name: "metadata.json", detail: "preview metadata" },
  { name: "warnings.log", detail: "safety notes" }
] as const;

type PreviewHandoffRouteProps = {
  activeNav: Extract<NavigationKey, "preview" | "handoff">;
};

export default function PreviewWorkspaceAndHandoffWorkspaceRoute({ activeNav }: PreviewHandoffRouteProps) {
  const primaryResource = sampleLibraryState.resources[0];
  const handoffMode = "mode" in sampleHandoffDescriptor ? sampleHandoffDescriptor.mode : "unsupported";
  const handoffActions =
    "userActions" in sampleHandoffDescriptor ? sampleHandoffDescriptor.userActions : sampleHandoffDescriptor.errors.map((error: { message: string }) => error.message);
  const unsupportedHandoffDescriptor = useMemo(() => createHandoffDescriptor(primaryResource, "unknown-client"), [primaryResource]);
  const unsupportedHandoffMessage = "errors" in unsupportedHandoffDescriptor ? unsupportedHandoffDescriptor.errors[0]?.message : "Unsupported target is blocked.";
  const externalRuntimeHandoff = useMemo(
    () =>
      createExternalRuntimeHandoff(sampleWorkflowIr, "n8n", {
        createdAt: "2026-06-11T00:20:00.000Z"
      }),
    []
  );
  const agentClientHandoff = useMemo(
    () =>
      createAgentClientHandoffPlan(primaryResource, "local-bridge", {
        createdAt: "2026-06-11T00:25:00.000Z"
      }),
    [primaryResource]
  );
  const previewMetadata = samplePreview.metadata as { files?: number | string };
  const previewFileCount = previewMetadata.files ?? 0;

  if (activeNav === "preview") {
    return <PreviewWorkspace preview={samplePreview} previewFileCount={previewFileCount} previewFiles={previewFiles} />;
  }

  return (
    <HandoffWorkspace
      agentClientHandoff={agentClientHandoff}
      externalRuntimeHandoff={externalRuntimeHandoff}
      handoffActions={handoffActions}
      handoffMode={handoffMode}
      sampleHandoffDescriptor={sampleHandoffDescriptor}
      unsupportedHandoffMessage={unsupportedHandoffMessage}
    />
  );
}
