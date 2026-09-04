import { useMemo, useState } from "react";
import { useNativeDagScheduler } from "../app-state/useNativeDagScheduler";
import type { FixedNativeDagAttempt, NativeDagResumeInput, NativeDagWorkflow } from "../core/tauri-native-dag-scheduler-client";

type AttemptInput = Pick<FixedNativeDagAttempt, "runId" | "approvalId" | "permissionGrantId"> & {
  adapterId: FixedNativeDagAttempt["adapterId"];
};

const emptyAttempt = (runId: string, adapterId: AttemptInput["adapterId"]): AttemptInput => ({ runId, approvalId: "", permissionGrantId: "", adapterId });

export function NativeDagSchedulerPanel() {
  const [workflowId, setWorkflowId] = useState("workflow.native-local-001");
  const [first, setFirst] = useState<AttemptInput>(() => emptyAttempt("run.native-dag-a", "adapter.local-python"));
  const [second, setSecond] = useState<AttemptInput>(() => emptyAttempt("run.native-dag-b", "adapter.local-node"));
  const [decisionId, setDecisionId] = useState("");
  const [resumeGrantId, setResumeGrantId] = useState("");
  const complete = [workflowId, first.runId, first.approvalId, first.permissionGrantId, second.runId, second.approvalId].every((value) => isOpaqueToken(String(value ?? "")));
  const workflow = useMemo<NativeDagWorkflow | null>(() => {
    if (!complete) return null;
    return {
      workflowId,
      resourceId: "resource.ui-workflow-001",
      sessionId: "session.ui-workflow-001",
      commandId: `command.scheduler-start-${workflowId}`,
      nodes: [fixedNode("node.prepare", [], first), interruptNode("node.transform", ["node.prepare"], second)]
    };
  }, [complete, first, second, workflowId]);
  const { available, state, actions } = useNativeDagScheduler(workflow);
  const active = state.status === "queued" || state.status === "running" || state.status === "canceling";
  const paused = state.status === "paused-approval";
  const locked = state.status !== "idle" && state.status !== "blocked";
  const interrupt = state.receipt?.nodes.find((item) => item.state === "pending-approval")?.interrupt ?? null;
  const resume = (decision: NativeDagResumeInput["decision"]) => {
    if (!interrupt || !isOpaqueToken(decisionId) || (decision === "approved" && !isOpaqueToken(resumeGrantId))) return;
    void actions.resume({
      nodeId: "node.transform",
      runId: interrupt.runId,
      interruptId: interrupt.interruptId,
      checkpointGenerationDigest: interrupt.checkpointGenerationDigest,
      proposalId: interrupt.proposalId,
      proposalDigest: interrupt.proposalDigest,
      decisionId,
      decision,
      permissionGrantId: decision === "approved" ? resumeGrantId : null
    });
  };

  return (
    <section className="evidence-panel" aria-labelledby="native-dag-heading" data-native-dag-state={state.status}>
      <div className="section-heading compact-heading">
        <p className="caption">Native orchestration</p>
        <h3 id="native-dag-heading">Native DAG scheduler</h3>
      </div>
      <p className="surface-note">
        Start one approved step, then pause the risky dependent step at a native checkpoint for an explicit human decision. Resume requires the exact decision and one-use grant;
        handoff-only nodes stay blocked.
      </p>
      <div className="runner-status-grid" aria-live="polite">
        <div>
          <span>Workflow</span>
          <strong>{workflowId}</strong>
        </div>
        <div>
          <span>State</span>
          <strong>{state.status}</strong>
        </div>
        <div>
          <span>Active node</span>
          <strong>{state.receipt?.activeNodeId ?? "none"}</strong>
        </div>
        <div>
          <span>Terminal</span>
          <strong>{state.receipt?.terminalState ?? "pending"}</strong>
        </div>
      </div>
      <label className="surface-note" htmlFor="native-dag-workflow-id">
        Workflow identity
      </label>
      <input id="native-dag-workflow-id" value={workflowId} disabled={locked} onChange={(event) => setWorkflowId(event.target.value)} />
      <AttemptFields label="First fixed run" value={first} disabled={locked} grantRequired onChange={setFirst} />
      <AttemptFields label="Approval interrupt run" value={second} disabled={locked} grantRequired={false} onChange={setSecond} />
      {paused && interrupt ? (
        <fieldset className="evidence-panel">
          <legend>Approval interrupt</legend>
          <p className="surface-note" aria-live="polite">
            Checkpoint {interrupt.checkpointGenerationDigest.slice(0, 12)}… is frozen. Complete the native approval prompt, then enter its exact decision identity and grant.
          </p>
          <label className="surface-note" htmlFor="native-dag-decision-id">
            Decision identity
          </label>
          <input id="native-dag-decision-id" value={decisionId} onChange={(event) => setDecisionId(event.target.value)} />
          <label className="surface-note" htmlFor="native-dag-resume-grant">
            One-use resume grant
          </label>
          <input id="native-dag-resume-grant" value={resumeGrantId} onChange={(event) => setResumeGrantId(event.target.value)} />
          <div className="runner-actions" aria-label="Approval interrupt controls">
            <button className="primary-action" type="button" disabled={!isOpaqueToken(decisionId) || !isOpaqueToken(resumeGrantId)} onClick={() => resume("approved")}>
              Resume approved step
            </button>
            <button className="secondary-action" type="button" disabled={!isOpaqueToken(decisionId)} onClick={() => resume("denied")}>
              Record denial
            </button>
          </div>
        </fieldset>
      ) : null}
      <div className="runner-actions" aria-label="Native DAG scheduler controls">
        <button className="primary-action" type="button" disabled={!available || !complete || locked} onClick={() => void actions.start()}>
          Start checkpointed workflow
        </button>
        <button className="secondary-action" type="button" disabled={!available || !complete} onClick={() => void actions.status()}>
          Read durable status
        </button>
        <button className="secondary-action" type="button" disabled={!available || (!active && !paused)} onClick={() => void actions.cancel()}>
          Cancel workflow
        </button>
      </div>
      <p className="surface-note">{state.message}</p>
      <ol className="permission-grant-list compact" aria-label="Native DAG node states">
        {(state.receipt?.nodes ?? []).map((item) => (
          <li className={item.state} key={item.nodeId}>
            <span>{item.nodeId}</span>
            <strong>{item.state}</strong>
            <small>
              Retry {item.retryCount}; Skipped {item.state === "skipped" ? "yes" : "no"}; {item.reason}
            </small>
          </li>
        ))}
      </ol>
      <p className="surface-note">
        The desktop owns topological order, process launch, persistence, and cleanup truth. This form accepts opaque run/approval/grant identities only; it cannot configure
        executables, paths, arguments, scripts, or environment.
      </p>
    </section>
  );
}

function AttemptFields({
  label,
  value,
  disabled,
  grantRequired,
  onChange
}: {
  label: string;
  value: AttemptInput;
  disabled: boolean;
  grantRequired: boolean;
  onChange: (value: AttemptInput) => void;
}) {
  const prefix = label.toLowerCase().replaceAll(" ", "-");
  return (
    <fieldset className="evidence-panel" disabled={disabled}>
      <legend>{label}</legend>
      <label className="surface-note" htmlFor={`${prefix}-adapter`}>
        Fixed adapter
      </label>
      <select id={`${prefix}-adapter`} value={value.adapterId} onChange={(event) => onChange({ ...value, adapterId: event.target.value as AttemptInput["adapterId"] })}>
        <option value="adapter.local-python">Python (fixed native)</option>
        <option value="adapter.local-node">Node (fixed native)</option>
      </select>
      <label className="surface-note" htmlFor={`${prefix}-run`}>
        Run identity
      </label>
      <input id={`${prefix}-run`} value={value.runId} onChange={(event) => onChange({ ...value, runId: event.target.value })} />
      <label className="surface-note" htmlFor={`${prefix}-approval`}>
        Approval identity
      </label>
      <input id={`${prefix}-approval`} value={value.approvalId} onChange={(event) => onChange({ ...value, approvalId: event.target.value })} />
      {grantRequired ? (
        <>
          <label className="surface-note" htmlFor={`${prefix}-grant`}>
            One-use grant identity
          </label>
          <input id={`${prefix}-grant`} value={value.permissionGrantId ?? ""} onChange={(event) => onChange({ ...value, permissionGrantId: event.target.value })} />
        </>
      ) : (
        <p className="surface-note">No grant is accepted until the checkpointed interrupt receives an explicit decision.</p>
      )}
    </fieldset>
  );
}

function fixedNode(nodeId: string, dependsOn: string[], input: AttemptInput): NativeDagWorkflow["nodes"][number] {
  const permissionProfileId = input.adapterId === "adapter.local-node" ? "permission.local-node.minimal" : "permission.local-python.minimal";
  return {
    nodeId,
    nodeType: "fixed-adapter",
    dependsOn,
    maxRetries: 0,
    attempts: [
      {
        ...input,
        commandId: `command.scheduler-attempt-${input.runId}`,
        permissionProfileId
      }
    ]
  };
}

function interruptNode(nodeId: string, dependsOn: string[], input: AttemptInput): NativeDagWorkflow["nodes"][number] {
  const permissionProfileId = input.adapterId === "adapter.local-node" ? "permission.local-node.minimal" : "permission.local-python.minimal";
  return {
    nodeId,
    nodeType: "approval-interrupt",
    interruptId: `interrupt.${input.runId}`,
    dependsOn,
    maxRetries: 0,
    attempts: [
      {
        runId: input.runId,
        commandId: `command.scheduler-attempt-${input.runId}`,
        adapterId: input.adapterId,
        approvalId: input.approvalId,
        permissionProfileId,
        permissionGrantId: null
      }
    ]
  };
}

function isOpaqueToken(value: string) {
  return /^[a-z0-9][a-z0-9._-]{2,95}$/u.test(value);
}
