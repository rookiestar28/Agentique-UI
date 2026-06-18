import { useI18n } from "../i18n/I18nProvider";

type PreviewFile = {
  name: string;
  detail: string;
};

type AnyRecord = Record<string, any>;

export function PreviewWorkspace({ preview, previewFileCount, previewFiles }: { preview: AnyRecord; previewFileCount: number | string; previewFiles: readonly PreviewFile[] }) {
  const { t } = useI18n();

  return (
    <div className="workspace-stack" data-page="preview">
      <section className="workspace-section preview-workspace-section" aria-labelledby="preview-heading">
        <div className="section-heading">
          <p className="caption">{t("workspace.preview.caption")}</p>
          <h2 id="preview-heading">{preview.title}</h2>
        </div>
        <div className="safe-preview-note">{t("workspace.preview.note")}</div>
        <div className="preview-workspace">
          <aside className="file-tree" aria-label={t("workspace.preview.staticFileTree")}>
            <strong>{t("workspace.preview.staticFileTree")}</strong>
            {previewFiles.map((file) => (
              <button className="file-tree-item" key={file.name} type="button">
                <span>{file.name}</span>
                <small>{file.detail}</small>
              </button>
            ))}
          </aside>
          <div className="preview-reader">
            <div className="preview-meta" aria-label={t("workspace.preview.previewMode")}>
              <span>{preview.label}</span>
              <span>{preview.renderMode}</span>
              <span>{previewFileCount} file</span>
            </div>
            <pre>{preview.text}</pre>
          </div>
        </div>
        {preview.warnings.length > 0 ? (
          <ul className="warning-list">
            {preview.warnings.map((warning: string) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}

export function HandoffWorkspace({
  agentClientHandoff,
  externalRuntimeHandoff,
  handoffActions,
  handoffMode,
  sampleHandoffDescriptor,
  unsupportedHandoffMessage
}: {
  agentClientHandoff: AnyRecord;
  externalRuntimeHandoff: AnyRecord;
  handoffActions: string[];
  handoffMode: string;
  sampleHandoffDescriptor: AnyRecord;
  unsupportedHandoffMessage: string;
}) {
  const { t } = useI18n();

  return (
    <div className="workspace-stack" data-page="handoff">
      <section className="workspace-section handoff-workspace" aria-labelledby="handoff-heading">
        <div className="section-heading">
          <p className="caption">{t("workspace.handoff.caption")}</p>
          <h2 id="handoff-heading">
            {sampleHandoffDescriptor.label} {t("workspace.handoff.title")}
          </h2>
        </div>
        <div className="descriptor-grid">
          <span>Target</span>
          <strong>{sampleHandoffDescriptor.target}</strong>
          <span>Mode</span>
          <strong>{handoffMode}</strong>
          <span>Execution</span>
          <strong>{sampleHandoffDescriptor.execution.willExecute ? "Enabled" : "Not executed"}</strong>
        </div>
        {"output" in sampleHandoffDescriptor ? (
          <div className="descriptor-review" aria-label={t("workspace.handoff.descriptorReview")}>
            <span>{t("workspace.handoff.descriptorReview")}</span>
            <strong>{sampleHandoffDescriptor.output.fileName}</strong>
            <pre>{sampleHandoffDescriptor.output.copyText}</pre>
          </div>
        ) : null}
        <div className="field-list" aria-label={t("workspace.handoff.safetyFlags")}>
          <div>
            <span>Starts bridge</span>
            <strong>{sampleHandoffDescriptor.execution.startsBridge ? "Enabled" : "Disabled"}</strong>
          </div>
          <div>
            <span>Writes outside selection</span>
            <strong>{sampleHandoffDescriptor.execution.writesOutsideUserSelectedDestination ? "Allowed" : "Blocked"}</strong>
          </div>
          <div>
            <span>Reversible cleanup</span>
            <strong>{sampleHandoffDescriptor.cleanup.reversible ? "Available" : "Unavailable"}</strong>
          </div>
        </div>
        <ol className="handoff-steps">
          {handoffActions.map((action: string) => (
            <li key={action}>{action}</li>
          ))}
        </ol>
        <div className="section-heading">
          <p className="caption">{t("workspace.handoff.agentClientCaption")}</p>
          <h2>{t("workspace.handoff.agentClientTitle")}</h2>
        </div>
        <div className="field-list" aria-label="Agent client handoff summary">
          <div>
            <span>Target</span>
            <strong>{agentClientHandoff.label}</strong>
          </div>
          <div>
            <span>Actions</span>
            <strong>{agentClientHandoff.actions.length}</strong>
          </div>
          <div>
            <span>Bridge</span>
            <strong>{agentClientHandoff.bridge.startsBridge ? "starts" : "descriptor only"}</strong>
          </div>
          <div>
            <span>Rollback</span>
            <strong>{agentClientHandoff.cleanup.reversible ? "reversible" : "blocked"}</strong>
          </div>
        </div>
        <div className="descriptor-review" aria-label="Agent client action plan">
          <span>Action plan</span>
          <strong>{agentClientHandoff.mode}</strong>
          <pre>
            {JSON.stringify(
              {
                actions: agentClientHandoff.actions.map((action: { id: string }) => action.id),
                willExecute: agentClientHandoff.execution.willExecute,
                startsBridge: agentClientHandoff.bridge.startsBridge,
                writesFiles: agentClientHandoff.execution.writesFiles
              },
              null,
              2
            )}
          </pre>
        </div>
        <div className="fail-closed" role="status">
          <strong>Local bridge stays disabled</strong>
          <span>
            Agent-client handoff copies review instructions and descriptors only; folder export and bridge registration require explicit user action outside this surface.
          </span>
        </div>
        <div className="section-heading">
          <p className="caption">{t("workspace.handoff.externalRuntimeCaption")}</p>
          <h2>{t("workspace.handoff.externalRuntimeTitle")}</h2>
        </div>
        <div className="field-list" aria-label="External runtime handoff summary">
          <div>
            <span>Target</span>
            <strong>{externalRuntimeHandoff.label}</strong>
          </div>
          <div>
            <span>Mode</span>
            <strong>{externalRuntimeHandoff.mode}</strong>
          </div>
          <div>
            <span>Execution</span>
            <strong>{externalRuntimeHandoff.execution.willExecute ? "Enabled" : "Not executed"}</strong>
          </div>
          <div>
            <span>Unsupported nodes</span>
            <strong>{externalRuntimeHandoff.compatibility.unsupportedNodes.length}</strong>
          </div>
        </div>
        <div className="descriptor-review" aria-label="External runtime compatibility report">
          <span>Compatibility report</span>
          <strong>{externalRuntimeHandoff.compatibility.status}</strong>
          <pre>
            {JSON.stringify(
              {
                target: externalRuntimeHandoff.target,
                universalRuntimeClaim: externalRuntimeHandoff.compatibility.universalRuntimeClaim,
                writesFiles: externalRuntimeHandoff.artifacts.writesFiles,
                errors: externalRuntimeHandoff.errors.map((error: { code: string }) => error.code)
              },
              null,
              2
            )}
          </pre>
        </div>
        <div className="fail-closed" role="status">
          <strong>No external runtime execution</strong>
          <span>External runtime handoff creates a descriptor and compatibility report only; unsupported nodes are reported before export.</span>
        </div>
        <div className="fail-closed" role="status">
          <strong>Unsupported target: fail closed</strong>
          <span>{unsupportedHandoffMessage}</span>
          <span>No shell commands are generated by this surface.</span>
        </div>
      </section>
    </div>
  );
}
