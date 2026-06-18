#!/usr/bin/env node
import { readNativeRunnerSidecarGateInputs, reviewNativeRunnerSidecarGate } from "../src/core/native-runner-sidecar-gate.mjs";

const { report, validation } = reviewNativeRunnerSidecarGate(readNativeRunnerSidecarGateInputs());

if (!validation.ok) {
  console.error(JSON.stringify({ status: "failed", failures: validation.failures }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      schemaVersion: report.schemaVersion,
      checked: ["src-tauri/tauri.conf.json", "src-tauri/capabilities/*.json", "src-tauri/src/lib.rs", "src-tauri/Cargo.toml", "runner prerequisite gates"],
      summary: validation.summary,
      currentTauriState: {
        externalBinCount: report.currentTauriState.externalBinCount,
        shellPermissionGrants: report.currentTauriState.shellPermissionGrants.length,
        shellPluginPresent: report.currentTauriState.shellPluginPresent
      },
      nativeStart: {
        transitionGateReady: report.nativeStart.transitionGateReady,
        approvedAdapterId: report.nativeStart.approvedAdapterId,
        fixedPythonExecution: report.nativeStart.fixedPythonExecution
      },
      sidecars: report.sidecarReadiness.sidecars.map((sidecar) => ({
        id: sidecar.id,
        runtime: sidecar.runtime,
        configured: sidecar.configured,
        permissionGranted: sidecar.permissionGranted
      }))
    },
    null,
    2
  )
);
