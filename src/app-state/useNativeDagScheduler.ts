import { useCallback, useMemo, useState } from "react";
import { createTauriNativeDagSchedulerClient, type NativeDagResumeInput, type NativeDagWorkflow, type NativeDagWorkflowReceipt } from "../core/tauri-native-dag-scheduler-client";
import { isTauriRuntimeAvailable } from "../core/tauri-native-async-run-client";

type NativeDagState = {
  transport: "browser-preview" | "native" | "error";
  status: string;
  message: string;
  receipt: NativeDagWorkflowReceipt | null;
};

export function useNativeDagScheduler(workflow: NativeDagWorkflow | null) {
  const available = isTauriRuntimeAvailable();
  const client = useMemo(() => (available && workflow ? createTauriNativeDagSchedulerClient(workflow) : null), [available, workflow]);
  const [state, setState] = useState<NativeDagState>({
    transport: available ? "native" : "browser-preview",
    status: "idle",
    message: available ? "Enter exact pre-approved run identities to admit a workflow." : "Native DAG execution is available only in the desktop runtime.",
    receipt: null
  });

  const perform = useCallback(
    async (action: "start" | "status" | "cancel" | "resume", resumeInput?: NativeDagResumeInput) => {
      if (!client) return;
      setState((current) => ({ ...current, transport: "native", message: `${action} requested` }));
      try {
        const receipt = action === "resume" ? await client.resume(resumeInput as NativeDagResumeInput) : await client[action]();
        setState({ transport: "native", status: receipt.state, message: receipt.reason, receipt });
      } catch (error) {
        setState((current) => ({
          ...current,
          transport: "error",
          status: current.receipt?.state ?? "blocked",
          message: safeError(error)
        }));
      }
    },
    [client]
  );

  return {
    available,
    state,
    actions: {
      start: () => perform("start"),
      status: () => perform("status"),
      cancel: () => perform("cancel"),
      resume: (input: NativeDagResumeInput) => perform("resume", input)
    }
  };
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "Native DAG operation failed.");
  return message.replace(/(?<![A-Za-z])[A-Za-z]:[\\/]|bearer\s+\S+|sk-[A-Za-z0-9]{20,}/giu, "redacted:sensitive").slice(0, 240);
}
