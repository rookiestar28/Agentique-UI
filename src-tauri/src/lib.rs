use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

const RUNNER_PENDING_APPROVAL_REASON: &str =
    "native-owned pending run record created for the fixed local Python adapter lane";
const RUNNER_NATIVE_EXECUTION_REASON: &str =
    "approved fixed adapter lane executed through the native-controlled Python helper";
const APPROVED_ADAPTER_ID: &str = "adapter.local-python";
const REVOKED_ADAPTER_ID: &str = "adapter.local-python.revoked";
const APPROVED_ADAPTER_MANIFEST_ID: &str = "manifest.local-python.v1";
const APPROVED_ADAPTER_VERSION: &str = "0.1.0";
const APPROVED_ADAPTER_RUNTIME: &str = "python";
const APPROVED_ADAPTER_SUPPORT_MODE: &str = "locally-runnable";
const APPROVED_ADAPTER_DIGEST: &str =
    "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
const APPROVED_ADAPTER_SIGNATURE_STATUS: &str = "verified";
const APPROVED_ADAPTER_SIGNER_ID: &str = "agentique-native-adapter-release";
const APPROVED_ADAPTER_EXECUTABLE_REF: &str = "native-bundled-local-python-adapter";
const APPROVED_PERMISSION_PROFILE_ID: &str = "permission.local-python.minimal";
const RUNNER_PENDING_APPROVAL_STATE: &str = "pending-approval";
const RUNNER_NATIVE_SUCCEEDED_STATE: &str = "succeeded";
const RUNNER_NATIVE_FAILED_STATE: &str = "failed";
const RUNNER_NATIVE_CANCELED_STATE: &str = "canceled";
const RUNNER_NATIVE_TIMED_OUT_STATE: &str = "timed-out";
const RUNNER_NATIVE_CLEANUP_REQUIRED_STATE: &str = "cleanup-required";
const RUNNER_NATIVE_CLEANED_UP_STATE: &str = "cleaned-up";
const RUNNER_TRANSITION_GATE: &str = "fixed-lane-transition";
const MAX_NATIVE_LOG_BYTES: usize = 262_144;
const MAX_NATIVE_EVENT_COUNT: usize = 64;
const NATIVE_RUNNER_EVENT_NAME: &str = "agentique://native-runner-event";
const NATIVE_EVENT_REPLAY_SCHEMA: &str = "agentique.nativeRunnerEventReplay.v1";
const NATIVE_PERMISSION_GRANT_SCHEMA: &str = "agentique.nativeRunnerPermissionGrantReceipt.v1";
const NATIVE_PERMISSION_PREFLIGHT_SCHEMA: &str =
    "agentique.nativeRunnerPermissionPreflightReceipt.v1";
const NATIVE_ARTIFACT_EVIDENCE_SCHEMA: &str = "agentique.nativeRunArtifactEvidence.v1";
const NATIVE_CLEANUP_RECOVERY_SCHEMA: &str = "agentique.nativeRunnerCleanupRecovery.v1";
const NATIVE_PERMISSION_GRANT_TTL_SECONDS: u64 = 3_600;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RunnerCommandRequest {
    resource_id: String,
    session_id: String,
    run_id: String,
    command_id: Option<String>,
    adapter_id: Option<String>,
    approval_id: Option<String>,
    permission_profile_id: Option<String>,
    permission_grant_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RunnerCommandReceipt {
    command: String,
    state: String,
    resource_id: String,
    session_id: String,
    run_id: String,
    reason: String,
    will_spawn_process: bool,
    adapter_id: Option<String>,
    approval_id: Option<String>,
    permission_profile_id: Option<String>,
    transition_gate: String,
    adapter_manifest: Option<NativeAdapterManifestReceipt>,
    execution: Option<NativeAdapterExecutionReceipt>,
    permission_grant: Option<NativePermissionGrantReceipt>,
    artifact_evidence: Option<NativeRunArtifactEvidenceReceipt>,
    cleanup_recovery: Option<NativeRunnerCleanupRecoveryReceipt>,
    event_replay: Option<NativeRunnerEventReplayReceipt>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum NativeRunState {
    PendingApproval,
    Running,
    Succeeded,
    Failed,
    Canceled,
    TimedOut,
    CleanupRequired,
    CleanedUp,
}

impl NativeRunState {
    fn as_str(&self) -> &'static str {
        match self {
            NativeRunState::PendingApproval => RUNNER_PENDING_APPROVAL_STATE,
            NativeRunState::Running => "running",
            NativeRunState::Succeeded => RUNNER_NATIVE_SUCCEEDED_STATE,
            NativeRunState::Failed => RUNNER_NATIVE_FAILED_STATE,
            NativeRunState::Canceled => RUNNER_NATIVE_CANCELED_STATE,
            NativeRunState::TimedOut => RUNNER_NATIVE_TIMED_OUT_STATE,
            NativeRunState::CleanupRequired => RUNNER_NATIVE_CLEANUP_REQUIRED_STATE,
            NativeRunState::CleanedUp => RUNNER_NATIVE_CLEANED_UP_STATE,
        }
    }
}

#[derive(Debug, Clone)]
struct NativeRunRecord {
    resource_id: String,
    session_id: String,
    run_id: String,
    adapter_id: String,
    approval_id: String,
    permission_profile_id: String,
    adapter_manifest_id: String,
    adapter_manifest_digest: String,
    permission_grant_id: String,
    state: NativeRunState,
    approval_consumed: bool,
    cleanup_recovery: Option<NativeRunnerCleanupRecoveryReceipt>,
}

#[derive(Debug, Clone)]
struct NativePermissionGrantRecord {
    resource_id: String,
    session_id: String,
    run_id: String,
    adapter_id: String,
    permission_profile_id: String,
    adapter_manifest_id: String,
    adapter_manifest_digest: String,
    grant_id: String,
    revoked: bool,
    consumed: bool,
    expires_at_epoch_seconds: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativePermissionGrantReceipt {
    schema_version: String,
    grant_id: String,
    run_id: String,
    permission_profile_id: String,
    status: String,
    active: bool,
    revoked: bool,
    consumed: bool,
    expired: bool,
    families: Vec<String>,
    target_refs: Vec<String>,
    redacted: bool,
    preflight: NativePermissionPreflightReceipt,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativePermissionPreflightReceipt {
    schema_version: String,
    status: String,
    code: String,
    message: String,
    required_count: usize,
    allowed_count: usize,
    blocked_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeRunnerEventReplayReceipt {
    schema_version: String,
    source: String,
    native_backed: bool,
    descriptor_only: bool,
    live_transport: bool,
    replayable: bool,
    event_name: String,
    run_id: String,
    events: Vec<NativeRunnerEventReceipt>,
    truncated: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeRunnerEventReceipt {
    schema_version: String,
    id: String,
    sequence: usize,
    resource_id: String,
    session_id: String,
    run_id: String,
    event_type: String,
    phase: String,
    label: String,
    details: NativeRunnerEventDetails,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeRunnerEventDetails {
    adapter_id: Option<String>,
    permission_grant_id: Option<String>,
    permission_status: Option<String>,
    status: Option<String>,
    exit_code: Option<i32>,
    run_folder_files: Vec<String>,
    stdout_preview: Option<String>,
    stderr_preview: Option<String>,
}

#[derive(Debug, Clone)]
struct NativeAdapterManifest {
    manifest_id: String,
    adapter_id: String,
    runtime: String,
    support_mode: String,
    version: String,
    digest: String,
    signature_status: String,
    signer_id: String,
    revoked: bool,
    platforms: Vec<String>,
    executable_ref: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeAdapterManifestReceipt {
    manifest_id: String,
    adapter_id: String,
    runtime: String,
    support_mode: String,
    version: String,
    digest_prefix: String,
    signature_status: String,
    executable_ref: String,
    redacted: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeAdapterExecutionReceipt {
    schema_version: String,
    launched: bool,
    status: String,
    health: NativeAdapterHealthReceipt,
    environment: NativeAdapterEnvironmentReceipt,
    exit: NativeAdapterExitReceipt,
    run_folder: NativeRunFolderReceipt,
    stdout_preview: String,
    stderr_preview: String,
    failure: NativeAdapterFailureReceipt,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeAdapterHealthReceipt {
    ready: bool,
    adapter_runtime: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeAdapterEnvironmentReceipt {
    adapter_env_keys: Vec<String>,
    forwarded_ambient: Vec<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct NativeAdapterExitReceipt {
    code: Option<i32>,
    signal: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeRunFolderReceipt {
    root_ref: String,
    files: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeRunArtifactEvidenceReceipt {
    schema_version: String,
    native_backed: bool,
    descriptor_only: bool,
    history_binding: bool,
    viewer_ready: bool,
    run_id: String,
    status: String,
    root_ref: String,
    run_json_ref: String,
    files: Vec<String>,
    logs: Vec<NativeRunLogEvidenceReceipt>,
    outputs: Vec<NativeRunOutputEvidenceReceipt>,
    artifacts: Vec<NativeRunArtifactEvidenceItem>,
    viewer_metadata: NativeRunViewerMetadataReceipt,
    cleanup: NativeRunCleanupEvidenceReceipt,
    failure: NativeAdapterFailureReceipt,
    reproducibility_digest: String,
    redacted: bool,
    truncated: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeRunLogEvidenceReceipt {
    path: String,
    preview: String,
    redacted: bool,
    max_bytes: usize,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeRunOutputEvidenceReceipt {
    path: String,
    media_type: String,
    bytes: usize,
    digest: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeRunArtifactEvidenceItem {
    id: String,
    path: String,
    viewer: String,
    redacted: bool,
    bytes: usize,
    digest: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeRunViewerMetadataReceipt {
    source: String,
    preview_mode: String,
    artifact_viewers: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeRunCleanupEvidenceReceipt {
    schema_version: String,
    run_id: String,
    status: String,
    idempotent: bool,
    removed: Vec<String>,
    receipt_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeRunnerCleanupRecoveryReceipt {
    schema_version: String,
    native_backed: bool,
    descriptor_only: bool,
    command: String,
    transition: String,
    run_id: String,
    state: String,
    status: String,
    process_tree_cleanup: bool,
    tested_platform: String,
    orphan_count: usize,
    cleanup_required: bool,
    idempotent: bool,
    recovery_reason: Option<String>,
    receipt_refs: Vec<String>,
    removed: Vec<String>,
    redacted: bool,
    notes: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeAdapterFailureReceipt {
    status: String,
    code: Option<String>,
    message: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PythonAdapterResult {
    schema_version: String,
    ok: bool,
    ready: bool,
    outputs: Vec<PythonAdapterOutput>,
    artifacts: Vec<PythonAdapterArtifact>,
    payload: PythonAdapterPayload,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PythonAdapterOutput {
    path: String,
    media_type: String,
    bytes: usize,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PythonAdapterArtifact {
    id: String,
    path: String,
    viewer: String,
    redacted: bool,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PythonAdapterPayload {
    run_id: Option<String>,
    resource_id: Option<String>,
    mode: Option<String>,
    message: Option<String>,
    env_keys: Vec<String>,
    ambient_env_non_empty: Vec<String>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum NativeAdapterTestMode {
    Success,
    Secret,
    InvalidJson,
    ExitFailure,
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            agentique_runner_prepare,
            agentique_runner_start,
            agentique_runner_cancel,
            agentique_runner_status,
            agentique_runner_logs,
            agentique_runner_artifacts,
            agentique_runner_cleanup
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Agentique UI");
}

#[tauri::command]
fn agentique_runner_prepare(request: RunnerCommandRequest) -> Result<RunnerCommandReceipt, String> {
    validate_runner_request(&request)?;
    if request.approval_id.is_some() {
        return Err("approvalId is native-issued by prepare and must not be supplied.".to_string());
    }
    if request.permission_grant_id.is_some() {
        return Err(
            "permissionGrantId is native-issued by prepare and must not be supplied.".to_string(),
        );
    }
    let adapter_id = approved_adapter_id(&request)?;
    let permission_profile_id = approved_permission_profile_id(&request)?;
    let adapter_manifest = resolve_adapter_manifest(&adapter_id)?;
    let adapter_manifest_receipt = review_adapter_manifest(&adapter_manifest)?;
    let approval_id = issue_approval_id(&request);
    let permission_grant_id = issue_permission_grant_id(&request);
    let permission_grant_receipt =
        store_native_permission_grant(create_native_permission_grant_record(
            &request,
            &adapter_id,
            &permission_profile_id,
            &adapter_manifest,
            &permission_grant_id,
        ))?;
    let record = NativeRunRecord {
        resource_id: request.resource_id.clone(),
        session_id: request.session_id.clone(),
        run_id: request.run_id.clone(),
        adapter_id: adapter_id.clone(),
        approval_id: approval_id.clone(),
        permission_profile_id: permission_profile_id.clone(),
        adapter_manifest_id: adapter_manifest.manifest_id.clone(),
        adapter_manifest_digest: adapter_manifest.digest.clone(),
        permission_grant_id: permission_grant_id.clone(),
        state: NativeRunState::PendingApproval,
        approval_consumed: false,
        cleanup_recovery: None,
    };
    runner_records()
        .lock()
        .map_err(|_| "native runner record store is unavailable.".to_string())?
        .insert(request.run_id.clone(), record);
    reset_native_events(&request)?;
    record_native_event(
        &request,
        "prepare.accepted",
        "pending",
        "Native prepare accepted fixed adapter lane.",
        NativeRunnerEventDetails {
            adapter_id: Some(adapter_id.clone()),
            status: Some(RUNNER_PENDING_APPROVAL_STATE.to_string()),
            ..NativeRunnerEventDetails::default()
        },
    )?;
    record_native_event(
        &request,
        "approval.pending",
        "pending",
        "Native approval is pending for the fixed adapter lane.",
        NativeRunnerEventDetails {
            adapter_id: Some(adapter_id.clone()),
            status: Some(RUNNER_PENDING_APPROVAL_STATE.to_string()),
            ..NativeRunnerEventDetails::default()
        },
    )?;
    record_native_event(
        &request,
        "permission.grant-issued",
        "pending",
        "Native permission grant issued for the fixed adapter lane.",
        NativeRunnerEventDetails {
            adapter_id: Some(adapter_id.clone()),
            permission_grant_id: Some(permission_grant_id.clone()),
            permission_status: Some("granted".to_string()),
            status: Some(RUNNER_PENDING_APPROVAL_STATE.to_string()),
            ..NativeRunnerEventDetails::default()
        },
    )?;
    let event_replay = event_replay_for(&request)?;
    runner_transition_receipt(
        "agentique_runner_prepare",
        RUNNER_PENDING_APPROVAL_STATE,
        RUNNER_PENDING_APPROVAL_REASON,
        request,
        false,
        Some(adapter_id),
        Some(approval_id),
        Some(permission_profile_id),
        Some(adapter_manifest_receipt),
        None,
        Some(permission_grant_receipt),
        None,
        None,
        Some(event_replay),
    )
}

#[tauri::command]
fn agentique_runner_start(request: RunnerCommandRequest) -> Result<RunnerCommandReceipt, String> {
    validate_runner_request(&request)?;
    let adapter_id = approved_adapter_id(&request)?;
    let permission_profile_id = approved_permission_profile_id(&request)?;
    let adapter_manifest = resolve_adapter_manifest(&adapter_id)?;
    let adapter_manifest_receipt = review_adapter_manifest(&adapter_manifest)?;
    let approval_id = request.approval_id.clone().ok_or_else(|| {
        "approvalId is required before the fixed adapter lane can start.".to_string()
    })?;
    let permission_grant_id = request.permission_grant_id.clone().ok_or_else(|| {
        "permissionGrantId is required before the fixed adapter lane can start.".to_string()
    })?;
    let mut records = runner_records()
        .lock()
        .map_err(|_| "native runner record store is unavailable.".to_string())?;
    let record = records
        .get_mut(&request.run_id)
        .ok_or_else(|| "runId does not have a native-owned pending run record.".to_string())?;
    if record.resource_id != request.resource_id || record.session_id != request.session_id {
        return Err("runId is not scoped to the supplied resourceId and sessionId.".to_string());
    }
    if record.run_id != request.run_id {
        return Err("pending run record mismatch.".to_string());
    }
    if record.adapter_id != adapter_id {
        return Err("adapterId does not match the native-owned pending run record.".to_string());
    }
    if record.permission_profile_id != permission_profile_id {
        return Err(
            "permissionProfileId does not match the native-owned pending run record.".to_string(),
        );
    }
    if record.adapter_manifest_id != adapter_manifest.manifest_id
        || record.adapter_manifest_digest != adapter_manifest.digest
    {
        return Err(
            "adapter manifest does not match the native-owned pending run record.".to_string(),
        );
    }
    if record.approval_id != approval_id
        || record.approval_consumed
        || record.state != NativeRunState::PendingApproval
    {
        return Err("approvalId is missing, stale, or not valid for this pending run.".to_string());
    }
    let permission_grant_receipt =
        consume_native_permission_grant(&request, record, &adapter_manifest, &permission_grant_id)?;
    record.approval_consumed = true;
    record.state = NativeRunState::Running;
    drop(records);
    record_native_event(
        &request,
        "permission.preflight-allowed",
        "running",
        "Native permission grant matched and was consumed before launch.",
        NativeRunnerEventDetails {
            adapter_id: Some(adapter_id.clone()),
            permission_grant_id: Some(permission_grant_id.clone()),
            permission_status: Some("consumed".to_string()),
            status: Some("running".to_string()),
            ..NativeRunnerEventDetails::default()
        },
    )?;
    record_native_event(
        &request,
        "start.accepted",
        "running",
        "Native start accepted approval and manifest re-review.",
        NativeRunnerEventDetails {
            adapter_id: Some(adapter_id.clone()),
            status: Some("running".to_string()),
            ..NativeRunnerEventDetails::default()
        },
    )?;
    record_native_event(
        &request,
        "adapter.launching",
        "running",
        "Fixed native Python adapter launch started.",
        NativeRunnerEventDetails {
            adapter_id: Some(adapter_id.clone()),
            status: Some("launching".to_string()),
            ..NativeRunnerEventDetails::default()
        },
    )?;
    let execution = execute_fixed_python_adapter(
        &request.run_id,
        &request.resource_id,
        NativeAdapterTestMode::Success,
    )?;
    record_native_event(
        &request,
        "adapter.stdout",
        "running",
        "Fixed adapter stdout captured as a bounded redacted preview.",
        NativeRunnerEventDetails {
            adapter_id: Some(adapter_id.clone()),
            status: Some(execution.status.clone()),
            stdout_preview: Some(execution.stdout_preview.clone()),
            ..NativeRunnerEventDetails::default()
        },
    )?;
    record_native_event(
        &request,
        "adapter.stderr",
        "running",
        "Fixed adapter stderr captured as a bounded redacted preview.",
        NativeRunnerEventDetails {
            adapter_id: Some(adapter_id.clone()),
            status: Some(execution.status.clone()),
            stderr_preview: Some(execution.stderr_preview.clone()),
            ..NativeRunnerEventDetails::default()
        },
    )?;
    record_native_event(
        &request,
        "run-folder.written",
        "running",
        "Native run folder evidence was written with relative file refs.",
        NativeRunnerEventDetails {
            adapter_id: Some(adapter_id.clone()),
            status: Some(execution.status.clone()),
            run_folder_files: execution.run_folder.files.clone(),
            ..NativeRunnerEventDetails::default()
        },
    )?;
    let receipt_state = if execution.status == RUNNER_NATIVE_SUCCEEDED_STATE {
        let mut records = runner_records()
            .lock()
            .map_err(|_| "native runner record store is unavailable.".to_string())?;
        let record = records
            .get_mut(&request.run_id)
            .ok_or_else(|| "runId does not have a native-owned pending run record.".to_string())?;
        record.state = NativeRunState::Succeeded;
        RUNNER_NATIVE_SUCCEEDED_STATE
    } else {
        let mut records = runner_records()
            .lock()
            .map_err(|_| "native runner record store is unavailable.".to_string())?;
        let record = records
            .get_mut(&request.run_id)
            .ok_or_else(|| "runId does not have a native-owned pending run record.".to_string())?;
        record.state = NativeRunState::Failed;
        RUNNER_NATIVE_FAILED_STATE
    };
    record_native_event(
        &request,
        if receipt_state == RUNNER_NATIVE_SUCCEEDED_STATE {
            "run.succeeded"
        } else {
            "run.failed"
        },
        "terminal",
        "Fixed native Python adapter run reached a terminal state.",
        NativeRunnerEventDetails {
            adapter_id: Some(adapter_id.clone()),
            status: Some(receipt_state.to_string()),
            exit_code: execution.exit.code,
            ..NativeRunnerEventDetails::default()
        },
    )?;
    let launched = execution.launched;
    let event_replay = event_replay_for(&request)?;
    runner_transition_receipt(
        "agentique_runner_start",
        receipt_state,
        RUNNER_NATIVE_EXECUTION_REASON,
        request,
        launched,
        Some(adapter_id),
        Some(approval_id),
        Some(permission_profile_id),
        Some(adapter_manifest_receipt),
        Some(execution),
        Some(permission_grant_receipt),
        None,
        None,
        Some(event_replay),
    )
}

#[tauri::command]
fn agentique_runner_cancel(request: RunnerCommandRequest) -> Result<RunnerCommandReceipt, String> {
    cleanup_recovery_transition(
        "agentique_runner_cancel",
        "cancel-cleanup",
        request,
        &[NativeRunState::PendingApproval, NativeRunState::Running],
        NativeRunState::Canceled,
        "cleaned-up",
        false,
        None,
    )
}

#[tauri::command]
fn agentique_runner_status(request: RunnerCommandRequest) -> Result<RunnerCommandReceipt, String> {
    native_replay_receipt(
        "agentique_runner_status",
        "replay.status",
        "Native runner status replay returned compact event history.",
        request,
    )
}

#[tauri::command]
fn agentique_runner_logs(request: RunnerCommandRequest) -> Result<RunnerCommandReceipt, String> {
    native_replay_receipt(
        "agentique_runner_logs",
        "replay.logs",
        "Native runner logs replay returned compact event history.",
        request,
    )
}

#[tauri::command]
fn agentique_runner_artifacts(
    request: RunnerCommandRequest,
) -> Result<RunnerCommandReceipt, String> {
    validate_runner_request(&request)?;
    let adapter_id = approved_adapter_id(&request)?;
    let permission_profile_id = approved_permission_profile_id(&request)?;
    let adapter_manifest = resolve_adapter_manifest(&adapter_id)?;
    let adapter_manifest_receipt = review_adapter_manifest(&adapter_manifest)?;
    let state = scoped_run_state(&request, &adapter_id, &permission_profile_id)?;
    if !matches!(
        state.as_str(),
        RUNNER_NATIVE_SUCCEEDED_STATE | RUNNER_NATIVE_FAILED_STATE
    ) {
        return Err(
            "native run folder evidence is not available until the fixed adapter lane starts."
                .to_string(),
        );
    }
    let artifact_evidence = read_native_run_artifact_evidence(&request, &state)?;
    record_native_event(
        &request,
        "artifacts.read",
        "artifacts",
        "Native run folder artifact evidence was read back for the product viewer.",
        NativeRunnerEventDetails {
            adapter_id: Some(adapter_id.clone()),
            status: Some(state.clone()),
            run_folder_files: artifact_evidence.files.clone(),
            ..NativeRunnerEventDetails::default()
        },
    )?;
    let event_replay = event_replay_for(&request)?;
    runner_transition_receipt(
        "agentique_runner_artifacts",
        &state,
        "Native run folder artifact evidence readback returned.",
        request,
        false,
        Some(adapter_id),
        None,
        Some(permission_profile_id),
        Some(adapter_manifest_receipt),
        None,
        None,
        Some(artifact_evidence),
        None,
        Some(event_replay),
    )
}

#[tauri::command]
fn agentique_runner_cleanup(request: RunnerCommandRequest) -> Result<RunnerCommandReceipt, String> {
    cleanup_recovery_transition(
        "agentique_runner_cleanup",
        "cleanup-retry",
        request,
        &[
            NativeRunState::Succeeded,
            NativeRunState::Failed,
            NativeRunState::Canceled,
            NativeRunState::TimedOut,
            NativeRunState::CleanupRequired,
            NativeRunState::CleanedUp,
        ],
        NativeRunState::CleanedUp,
        "cleaned-up",
        false,
        None,
    )
}

fn runner_transition_receipt(
    command: &str,
    state: &str,
    reason: &str,
    request: RunnerCommandRequest,
    will_spawn_process: bool,
    adapter_id: Option<String>,
    approval_id: Option<String>,
    permission_profile_id: Option<String>,
    adapter_manifest: Option<NativeAdapterManifestReceipt>,
    execution: Option<NativeAdapterExecutionReceipt>,
    permission_grant: Option<NativePermissionGrantReceipt>,
    artifact_evidence: Option<NativeRunArtifactEvidenceReceipt>,
    cleanup_recovery: Option<NativeRunnerCleanupRecoveryReceipt>,
    event_replay: Option<NativeRunnerEventReplayReceipt>,
) -> Result<RunnerCommandReceipt, String> {
    Ok(RunnerCommandReceipt {
        command: command.to_string(),
        state: state.to_string(),
        resource_id: request.resource_id,
        session_id: request.session_id,
        run_id: request.run_id,
        reason: reason.to_string(),
        will_spawn_process,
        adapter_id,
        approval_id,
        permission_profile_id,
        transition_gate: RUNNER_TRANSITION_GATE.to_string(),
        adapter_manifest,
        execution,
        permission_grant,
        artifact_evidence,
        cleanup_recovery,
        event_replay,
    })
}

fn cleanup_recovery_transition(
    command: &str,
    transition: &str,
    request: RunnerCommandRequest,
    allowed_states: &[NativeRunState],
    next_state: NativeRunState,
    cleanup_status: &str,
    cleanup_required: bool,
    recovery_reason: Option<String>,
) -> Result<RunnerCommandReceipt, String> {
    validate_runner_request(&request)?;
    let adapter_id = approved_adapter_id(&request)?;
    let permission_profile_id = approved_permission_profile_id(&request)?;
    let adapter_manifest = resolve_adapter_manifest(&adapter_id)?;
    let adapter_manifest_receipt = review_adapter_manifest(&adapter_manifest)?;
    let receipt = {
        let mut records = runner_records()
            .lock()
            .map_err(|_| "native runner record store is unavailable.".to_string())?;
        let record = records
            .get_mut(&request.run_id)
            .ok_or_else(|| "runId does not have a native-owned run record.".to_string())?;
        ensure_scoped_run_record(record, &request, &adapter_id, &permission_profile_id)?;
        if !allowed_states.contains(&record.state) {
            return Err(format!(
                "{command} cannot transition a run from {}.",
                record.state.as_str()
            ));
        }
        let receipt = native_cleanup_recovery_receipt(
            command,
            transition,
            &request.run_id,
            next_state.as_str(),
            cleanup_status,
            cleanup_required,
            recovery_reason.clone(),
        );
        write_native_cleanup_recovery(&request.run_id, &receipt)?;
        record.state = next_state;
        record.cleanup_recovery = Some(receipt.clone());
        receipt
    };
    record_native_event(
        &request,
        transition,
        "cleanup",
        "Native cleanup recovery transition recorded for the fixed lane.",
        NativeRunnerEventDetails {
            adapter_id: Some(adapter_id.clone()),
            status: Some(receipt.state.clone()),
            run_folder_files: receipt.receipt_refs.clone(),
            ..NativeRunnerEventDetails::default()
        },
    )?;
    record_native_event(
        &request,
        "cleanup.completed",
        "cleanup",
        "Native process-tree cleanup receipt recorded with zero tested-platform orphans.",
        NativeRunnerEventDetails {
            adapter_id: Some(adapter_id.clone()),
            status: Some(receipt.status.clone()),
            run_folder_files: receipt.receipt_refs.clone(),
            ..NativeRunnerEventDetails::default()
        },
    )?;
    let event_replay = event_replay_for(&request)?;
    let receipt_state = receipt.state.clone();
    runner_transition_receipt(
        command,
        &receipt_state,
        "Native cleanup recovery evidence returned.",
        request,
        false,
        Some(adapter_id),
        None,
        Some(permission_profile_id),
        Some(adapter_manifest_receipt),
        None,
        None,
        None,
        Some(receipt),
        Some(event_replay),
    )
}

fn native_replay_receipt(
    command: &str,
    replay_event_type: &str,
    label: &str,
    request: RunnerCommandRequest,
) -> Result<RunnerCommandReceipt, String> {
    validate_runner_request(&request)?;
    let adapter_id = approved_adapter_id(&request)?;
    let permission_profile_id = approved_permission_profile_id(&request)?;
    let adapter_manifest = resolve_adapter_manifest(&adapter_id)?;
    let adapter_manifest_receipt = review_adapter_manifest(&adapter_manifest)?;
    let cleanup_recovery =
        recover_stale_native_run_if_needed(&request, &adapter_id, &permission_profile_id)?;
    let state = scoped_run_state(&request, &adapter_id, &permission_profile_id)?;
    record_native_event(
        &request,
        replay_event_type,
        "replay",
        label,
        NativeRunnerEventDetails {
            adapter_id: Some(adapter_id.clone()),
            status: Some(state.clone()),
            ..NativeRunnerEventDetails::default()
        },
    )?;
    let event_replay = event_replay_for(&request)?;
    runner_transition_receipt(
        command,
        &state,
        label,
        request,
        false,
        Some(adapter_id),
        None,
        Some(permission_profile_id),
        Some(adapter_manifest_receipt),
        None,
        None,
        None,
        cleanup_recovery,
        Some(event_replay),
    )
}

fn recover_stale_native_run_if_needed(
    request: &RunnerCommandRequest,
    adapter_id: &str,
    permission_profile_id: &str,
) -> Result<Option<NativeRunnerCleanupRecoveryReceipt>, String> {
    let receipt = {
        let mut records = runner_records()
            .lock()
            .map_err(|_| "native runner record store is unavailable.".to_string())?;
        let record = records
            .get_mut(&request.run_id)
            .ok_or_else(|| "runId does not have a native-owned run record.".to_string())?;
        ensure_scoped_run_record(record, request, adapter_id, permission_profile_id)?;
        if record.state != NativeRunState::Running {
            return Ok(record.cleanup_recovery.clone());
        }
        let receipt = native_cleanup_recovery_receipt(
            "agentique_runner_status",
            "restart-recovery",
            &request.run_id,
            RUNNER_NATIVE_CLEANUP_REQUIRED_STATE,
            "cleanup-required",
            true,
            Some("stale-incomplete-run".to_string()),
        );
        write_native_cleanup_recovery(&request.run_id, &receipt)?;
        record.state = NativeRunState::CleanupRequired;
        record.cleanup_recovery = Some(receipt.clone());
        receipt
    };
    record_native_event(
        request,
        "recovery.cleanup-required",
        "recovery",
        "Restart recovery marked stale native run as cleanup-required.",
        NativeRunnerEventDetails {
            adapter_id: Some(adapter_id.to_string()),
            status: Some(RUNNER_NATIVE_CLEANUP_REQUIRED_STATE.to_string()),
            run_folder_files: receipt.receipt_refs.clone(),
            ..NativeRunnerEventDetails::default()
        },
    )?;
    Ok(Some(receipt))
}

fn ensure_scoped_run_record(
    record: &NativeRunRecord,
    request: &RunnerCommandRequest,
    adapter_id: &str,
    permission_profile_id: &str,
) -> Result<(), String> {
    if record.resource_id != request.resource_id || record.session_id != request.session_id {
        return Err("runId is not scoped to the supplied resourceId and sessionId.".to_string());
    }
    if record.adapter_id != adapter_id {
        return Err("adapterId does not match the native-owned run record.".to_string());
    }
    if record.permission_profile_id != permission_profile_id {
        return Err("permissionProfileId does not match the native-owned run record.".to_string());
    }
    Ok(())
}

fn scoped_run_state(
    request: &RunnerCommandRequest,
    adapter_id: &str,
    permission_profile_id: &str,
) -> Result<String, String> {
    let records = runner_records()
        .lock()
        .map_err(|_| "native runner record store is unavailable.".to_string())?;
    let record = records
        .get(&request.run_id)
        .ok_or_else(|| "runId does not have a native-owned run record.".to_string())?;
    if record.resource_id != request.resource_id || record.session_id != request.session_id {
        return Err("runId is not scoped to the supplied resourceId and sessionId.".to_string());
    }
    if record.adapter_id != adapter_id {
        return Err("adapterId does not match the native-owned run record.".to_string());
    }
    if record.permission_profile_id != permission_profile_id {
        return Err("permissionProfileId does not match the native-owned run record.".to_string());
    }
    Ok(record.state.as_str().to_string())
}

fn create_native_permission_grant_record(
    request: &RunnerCommandRequest,
    adapter_id: &str,
    permission_profile_id: &str,
    adapter_manifest: &NativeAdapterManifest,
    grant_id: &str,
) -> NativePermissionGrantRecord {
    NativePermissionGrantRecord {
        resource_id: request.resource_id.clone(),
        session_id: request.session_id.clone(),
        run_id: request.run_id.clone(),
        adapter_id: adapter_id.to_string(),
        permission_profile_id: permission_profile_id.to_string(),
        adapter_manifest_id: adapter_manifest.manifest_id.clone(),
        adapter_manifest_digest: adapter_manifest.digest.clone(),
        grant_id: grant_id.to_string(),
        revoked: false,
        consumed: false,
        expires_at_epoch_seconds: current_epoch_seconds() + NATIVE_PERMISSION_GRANT_TTL_SECONDS,
    }
}

fn store_native_permission_grant(
    record: NativePermissionGrantRecord,
) -> Result<NativePermissionGrantReceipt, String> {
    let receipt = native_permission_grant_receipt(&record, "granted");
    native_permission_grant_records()
        .lock()
        .map_err(|_| "native permission grant store is unavailable.".to_string())?
        .insert(record.grant_id.clone(), record);
    Ok(receipt)
}

fn consume_native_permission_grant(
    request: &RunnerCommandRequest,
    run_record: &NativeRunRecord,
    adapter_manifest: &NativeAdapterManifest,
    permission_grant_id: &str,
) -> Result<NativePermissionGrantReceipt, String> {
    validate_opaque_id("permissionGrantId", permission_grant_id)?;
    let mut grants = native_permission_grant_records()
        .lock()
        .map_err(|_| "native permission grant store is unavailable.".to_string())?;
    let grant = grants.get_mut(permission_grant_id).ok_or_else(|| {
        "permissionGrantId is missing, stale, revoked, expired, or not scoped to this run."
            .to_string()
    })?;
    let now = current_epoch_seconds();
    let scoped = grant.resource_id == request.resource_id
        && grant.session_id == request.session_id
        && grant.run_id == request.run_id
        && grant.adapter_id == run_record.adapter_id
        && grant.permission_profile_id == run_record.permission_profile_id
        && grant.adapter_manifest_id == adapter_manifest.manifest_id
        && grant.adapter_manifest_digest == adapter_manifest.digest
        && grant.grant_id == run_record.permission_grant_id;
    if !scoped {
        return Err(
            "permissionGrantId is not scoped to the supplied run, adapter, manifest, and permission profile."
                .to_string(),
        );
    }
    if grant.revoked {
        return Err("permissionGrantId has been revoked before native start.".to_string());
    }
    if grant.expires_at_epoch_seconds <= now {
        return Err("permissionGrantId expired before native start.".to_string());
    }
    if grant.consumed {
        return Err("permissionGrantId was already consumed by native start.".to_string());
    }
    grant.consumed = true;
    Ok(native_permission_grant_receipt(grant, "consumed"))
}

fn native_permission_grant_receipt(
    record: &NativePermissionGrantRecord,
    status_override: &str,
) -> NativePermissionGrantReceipt {
    let now = current_epoch_seconds();
    let expired = record.expires_at_epoch_seconds <= now;
    let status = if record.revoked {
        "revoked"
    } else if expired {
        "expired"
    } else if record.consumed || status_override == "consumed" {
        "consumed"
    } else {
        "granted"
    };
    let allowed = matches!(status, "granted" | "consumed");
    NativePermissionGrantReceipt {
        schema_version: NATIVE_PERMISSION_GRANT_SCHEMA.to_string(),
        grant_id: record.grant_id.clone(),
        run_id: record.run_id.clone(),
        permission_profile_id: record.permission_profile_id.clone(),
        status: status.to_string(),
        active: status == "granted",
        revoked: record.revoked,
        consumed: record.consumed || status_override == "consumed",
        expired,
        families: vec![
            "files".to_string(),
            "subprocess".to_string(),
            "artifactRetention".to_string(),
        ],
        target_refs: vec![
            "workspace:runs".to_string(),
            format!("adapter:{}", record.adapter_id),
            "artifact-retention:7d".to_string(),
        ],
        redacted: true,
        preflight: NativePermissionPreflightReceipt {
            schema_version: NATIVE_PERMISSION_PREFLIGHT_SCHEMA.to_string(),
            status: if allowed { "allowed" } else { "blocked" }.to_string(),
            code: if allowed {
                "permission-grant.allowed"
            } else {
                "permission-grant.blocked"
            }
            .to_string(),
            message: if allowed {
                "Native permission grant is active and scoped to the fixed adapter lane."
            } else {
                "Native permission grant blocked start before process launch."
            }
            .to_string(),
            required_count: 3,
            allowed_count: if allowed { 3 } else { 0 },
            blocked_count: if allowed { 0 } else { 1 },
        },
    }
}

fn reset_native_events(request: &RunnerCommandRequest) -> Result<(), String> {
    native_event_records()
        .lock()
        .map_err(|_| "native runner event store is unavailable.".to_string())?
        .insert(request.run_id.clone(), Vec::new());
    Ok(())
}

fn record_native_event(
    request: &RunnerCommandRequest,
    event_type: &str,
    phase: &str,
    label: &str,
    details: NativeRunnerEventDetails,
) -> Result<(), String> {
    let mut records = native_event_records()
        .lock()
        .map_err(|_| "native runner event store is unavailable.".to_string())?;
    let events = records.entry(request.run_id.clone()).or_default();
    if events.len() >= MAX_NATIVE_EVENT_COUNT {
        return Ok(());
    }
    let sequence = events.len() + 1;
    let safe_event_type = safe_event_token(event_type);
    let event = NativeRunnerEventReceipt {
        schema_version: "agentique.nativeRunnerEvent.v1".to_string(),
        id: format!(
            "evt-{sequence:04}-{}-{safe_event_type}",
            safe_event_token(&request.run_id)
        ),
        sequence,
        resource_id: request.resource_id.clone(),
        session_id: request.session_id.clone(),
        run_id: request.run_id.clone(),
        event_type: safe_event_type,
        phase: safe_event_token(phase),
        label: safe_event_text(label),
        details: sanitize_event_details(details),
    };
    events.push(event);
    Ok(())
}

fn event_replay_for(
    request: &RunnerCommandRequest,
) -> Result<NativeRunnerEventReplayReceipt, String> {
    let events = native_event_records()
        .lock()
        .map_err(|_| "native runner event store is unavailable.".to_string())?
        .get(&request.run_id)
        .cloned()
        .unwrap_or_default();
    Ok(NativeRunnerEventReplayReceipt {
        schema_version: NATIVE_EVENT_REPLAY_SCHEMA.to_string(),
        source: "native-event-ledger".to_string(),
        native_backed: true,
        descriptor_only: false,
        live_transport: false,
        replayable: true,
        event_name: NATIVE_RUNNER_EVENT_NAME.to_string(),
        run_id: request.run_id.clone(),
        truncated: events.len() >= MAX_NATIVE_EVENT_COUNT,
        events,
    })
}

fn sanitize_event_details(mut details: NativeRunnerEventDetails) -> NativeRunnerEventDetails {
    details.adapter_id = details.adapter_id.map(|value| safe_event_text(&value));
    details.permission_grant_id = details
        .permission_grant_id
        .map(|value| safe_event_text(&value));
    details.permission_status = details
        .permission_status
        .map(|value| safe_event_token(&value));
    details.status = details.status.map(|value| safe_event_token(&value));
    details.run_folder_files = details
        .run_folder_files
        .into_iter()
        .map(|value| safe_relative_event_ref(&value))
        .collect();
    details.stdout_preview = details.stdout_preview.map(|value| safe_event_text(&value));
    details.stderr_preview = details.stderr_preview.map(|value| safe_event_text(&value));
    details
}

fn safe_event_text(value: &str) -> String {
    redact_runner_text(value)
        .replace('\n', " ")
        .replace('\r', " ")
        .chars()
        .take(180)
        .collect()
}

fn safe_relative_event_ref(value: &str) -> String {
    let cleaned = safe_event_text(value).replace('\\', "/");
    if cleaned.contains("..") || cleaned.contains(':') || cleaned.starts_with('/') {
        "redacted:relative-ref".to_string()
    } else {
        cleaned
    }
}

fn safe_event_token(value: &str) -> String {
    let token: String = value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-') {
                character.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect();
    let collapsed = token
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    collapsed.chars().take(96).collect::<String>()
}

fn validate_runner_request(request: &RunnerCommandRequest) -> Result<(), String> {
    validate_opaque_id("resourceId", &request.resource_id)?;
    validate_opaque_id("sessionId", &request.session_id)?;
    validate_opaque_id("runId", &request.run_id)?;
    if let Some(command_id) = &request.command_id {
        validate_opaque_id("commandId", command_id)?;
    }
    if let Some(adapter_id) = &request.adapter_id {
        validate_opaque_id("adapterId", adapter_id)?;
    }
    if let Some(approval_id) = &request.approval_id {
        validate_opaque_id("approvalId", approval_id)?;
    }
    if let Some(permission_profile_id) = &request.permission_profile_id {
        validate_opaque_id("permissionProfileId", permission_profile_id)?;
    }
    if let Some(permission_grant_id) = &request.permission_grant_id {
        validate_opaque_id("permissionGrantId", permission_grant_id)?;
    }
    Ok(())
}

fn approved_adapter_id(request: &RunnerCommandRequest) -> Result<String, String> {
    let adapter_id = request
        .adapter_id
        .clone()
        .ok_or_else(|| "adapterId is required for the fixed native runner lane.".to_string())?;
    if adapter_id == REVOKED_ADAPTER_ID {
        return Err("adapterId is revoked and cannot enter the native runner lane.".to_string());
    }
    if adapter_id != APPROVED_ADAPTER_ID {
        return Err("adapterId is not in the native runner allowlist.".to_string());
    }
    Ok(adapter_id)
}

fn approved_permission_profile_id(request: &RunnerCommandRequest) -> Result<String, String> {
    let permission_profile_id = request.permission_profile_id.clone().ok_or_else(|| {
        "permissionProfileId is required for the fixed native runner lane.".to_string()
    })?;
    if permission_profile_id != APPROVED_PERMISSION_PROFILE_ID {
        return Err(
            "permissionProfileId is not the fixed minimal native runner profile.".to_string(),
        );
    }
    Ok(permission_profile_id)
}

fn fixed_python_adapter_manifest() -> NativeAdapterManifest {
    NativeAdapterManifest {
        manifest_id: APPROVED_ADAPTER_MANIFEST_ID.to_string(),
        adapter_id: APPROVED_ADAPTER_ID.to_string(),
        runtime: APPROVED_ADAPTER_RUNTIME.to_string(),
        support_mode: APPROVED_ADAPTER_SUPPORT_MODE.to_string(),
        version: APPROVED_ADAPTER_VERSION.to_string(),
        digest: APPROVED_ADAPTER_DIGEST.to_string(),
        signature_status: APPROVED_ADAPTER_SIGNATURE_STATUS.to_string(),
        signer_id: APPROVED_ADAPTER_SIGNER_ID.to_string(),
        revoked: false,
        platforms: vec![
            "windows".to_string(),
            "macos".to_string(),
            "linux".to_string(),
        ],
        executable_ref: APPROVED_ADAPTER_EXECUTABLE_REF.to_string(),
    }
}

fn resolve_adapter_manifest(adapter_id: &str) -> Result<NativeAdapterManifest, String> {
    if adapter_id != APPROVED_ADAPTER_ID {
        return Err("native runner adapter manifest is missing for adapterId.".to_string());
    }
    Ok(fixed_python_adapter_manifest())
}

fn review_adapter_manifest(
    manifest: &NativeAdapterManifest,
) -> Result<NativeAdapterManifestReceipt, String> {
    if manifest.manifest_id != APPROVED_ADAPTER_MANIFEST_ID {
        return Err("native runner adapter manifest id is not allowlisted.".to_string());
    }
    if manifest.adapter_id != APPROVED_ADAPTER_ID {
        return Err("native runner adapter manifest adapterId is not allowlisted.".to_string());
    }
    if manifest.runtime != APPROVED_ADAPTER_RUNTIME {
        return Err("native runner adapter manifest has the wrong runtime.".to_string());
    }
    if manifest.support_mode != APPROVED_ADAPTER_SUPPORT_MODE {
        return Err("native runner adapter manifest has the wrong support mode.".to_string());
    }
    if manifest.version != APPROVED_ADAPTER_VERSION {
        return Err("native runner adapter manifest version is not allowlisted.".to_string());
    }
    if manifest.digest != APPROVED_ADAPTER_DIGEST || !is_sha256_hex(&manifest.digest) {
        return Err("native runner adapter manifest digest is missing or tampered.".to_string());
    }
    if manifest.signature_status != APPROVED_ADAPTER_SIGNATURE_STATUS
        || manifest.signer_id != APPROVED_ADAPTER_SIGNER_ID
    {
        return Err("native runner adapter manifest signature status is not trusted.".to_string());
    }
    if manifest.revoked {
        return Err("native runner adapter manifest is revoked.".to_string());
    }
    if !["windows", "macos", "linux"]
        .iter()
        .all(|platform| manifest.platforms.iter().any(|item| item == platform))
    {
        return Err(
            "native runner adapter manifest platform compatibility is incomplete.".to_string(),
        );
    }
    validate_manifest_token("executableRef", &manifest.executable_ref)?;
    if manifest.executable_ref != APPROVED_ADAPTER_EXECUTABLE_REF {
        return Err(
            "native runner adapter manifest executable reference is not allowlisted.".to_string(),
        );
    }
    Ok(NativeAdapterManifestReceipt {
        manifest_id: manifest.manifest_id.clone(),
        adapter_id: manifest.adapter_id.clone(),
        runtime: manifest.runtime.clone(),
        support_mode: manifest.support_mode.clone(),
        version: manifest.version.clone(),
        digest_prefix: manifest.digest.chars().take(12).collect(),
        signature_status: manifest.signature_status.clone(),
        executable_ref: manifest.executable_ref.clone(),
        redacted: true,
    })
}

fn execute_fixed_python_adapter(
    run_id: &str,
    resource_id: &str,
    mode: NativeAdapterTestMode,
) -> Result<NativeAdapterExecutionReceipt, String> {
    let script_path = fixed_python_adapter_script_path()?;
    let python_executable = match resolve_fixed_python_executable() {
        Ok(path) => path,
        Err(message) => {
            return Ok(native_execution_receipt(
                false,
                "blocked",
                None,
                "",
                "",
                None,
                native_failure("blocked", "native-python.python-missing", &message),
                run_id,
            )?);
        }
    };
    let mut child = Command::new(&python_executable)
        .arg(&script_path)
        .current_dir(repo_root()?)
        .env_clear()
        .envs(build_minimal_adapter_env(run_id, mode))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("fixed Python adapter failed to launch: {error}"))?;
    if let Some(stdin) = child.stdin.as_mut() {
        stdin
            .write_all(build_adapter_request(run_id, resource_id, mode).as_bytes())
            .map_err(|error| format!("failed to write adapter stdin: {error}"))?;
    }
    let output = child.wait_with_output().map_err(|error| {
        format!("fixed Python adapter failed while waiting for output: {error}")
    })?;
    let stdout = redact_runner_text(&String::from_utf8_lossy(&output.stdout));
    let stderr = redact_runner_text(&String::from_utf8_lossy(&output.stderr));
    let exit = NativeAdapterExitReceipt {
        code: output.status.code(),
        signal: None,
    };
    let parsed = parse_adapter_stdout(&stdout);
    let failure = if !output.status.success() {
        native_failure(
            "failed",
            "native-python.exit",
            &format!(
                "Fixed Python adapter exited with code {:?}.",
                output.status.code()
            ),
        )
    } else if let Err(error) = &parsed {
        native_failure("failed", "native-python.invalid-json", error)
    } else {
        native_failure("none", "", "")
    };
    let status = if failure.status == "none" {
        RUNNER_NATIVE_SUCCEEDED_STATE
    } else {
        RUNNER_NATIVE_FAILED_STATE
    };
    native_execution_receipt(
        true,
        status,
        Some(exit),
        &stdout,
        &stderr,
        parsed.ok(),
        failure,
        run_id,
    )
}

fn parse_adapter_stdout(stdout: &str) -> Result<PythonAdapterResult, String> {
    let parsed: PythonAdapterResult = serde_json::from_str(stdout.trim())
        .map_err(|_| "Python adapter stdout must be valid JSON.".to_string())?;
    if parsed.schema_version != "agentique.pythonAdapterResult.v1" || !parsed.ok {
        return Err("Python adapter stdout did not match the result contract.".to_string());
    }
    Ok(parsed)
}

fn native_execution_receipt(
    launched: bool,
    status: &str,
    exit: Option<NativeAdapterExitReceipt>,
    stdout: &str,
    stderr: &str,
    parsed: Option<PythonAdapterResult>,
    failure: NativeAdapterFailureReceipt,
    run_id: &str,
) -> Result<NativeAdapterExecutionReceipt, String> {
    let health = NativeAdapterHealthReceipt {
        ready: status == RUNNER_NATIVE_SUCCEEDED_STATE
            && parsed
                .as_ref()
                .map(|result| {
                    result.ready && result.payload.mode.as_deref() != Some("exit-failure")
                })
                .unwrap_or(false),
        adapter_runtime: APPROVED_ADAPTER_RUNTIME.to_string(),
    };
    let environment = NativeAdapterEnvironmentReceipt {
        adapter_env_keys: parsed
            .as_ref()
            .map(|result| result.payload.env_keys.clone())
            .unwrap_or_default(),
        forwarded_ambient: parsed
            .as_ref()
            .map(|result| result.payload.ambient_env_non_empty.clone())
            .unwrap_or_default(),
    };
    let run_folder =
        write_native_run_folder(run_id, status, stdout, stderr, parsed.as_ref(), &failure)?;
    Ok(NativeAdapterExecutionReceipt {
        schema_version: "agentique.nativePythonExecutionReceipt.v1".to_string(),
        launched,
        status: status.to_string(),
        health,
        environment,
        exit: exit.unwrap_or(NativeAdapterExitReceipt {
            code: None,
            signal: None,
        }),
        run_folder,
        stdout_preview: bounded_text(stdout),
        stderr_preview: bounded_text(stderr),
        failure,
    })
}

fn write_native_run_folder(
    run_id: &str,
    status: &str,
    stdout: &str,
    stderr: &str,
    parsed: Option<&PythonAdapterResult>,
    failure: &NativeAdapterFailureReceipt,
) -> Result<NativeRunFolderReceipt, String> {
    let run_rel = format!("runs/{run_id}");
    let run_dir = native_run_root()?.join("runs").join(run_id);
    fs::create_dir_all(run_dir.join("logs"))
        .map_err(|error| format!("failed to create native run logs folder: {error}"))?;
    fs::create_dir_all(run_dir.join("outputs"))
        .map_err(|error| format!("failed to create native run outputs folder: {error}"))?;
    fs::create_dir_all(run_dir.join("artifacts"))
        .map_err(|error| format!("failed to create native run artifacts folder: {error}"))?;

    let mut files = vec![
        format!("{run_rel}/run.json"),
        format!("{run_rel}/logs/stdout.log"),
        format!("{run_rel}/logs/stderr.log"),
        format!("{run_rel}/viewer-metadata.json"),
        format!("{run_rel}/failure.json"),
        format!("{run_rel}/cleanup-receipt.json"),
        format!("{run_rel}/write-receipt.json"),
    ];
    fs::write(
        run_dir.join("logs").join("stdout.log"),
        redact_runner_text(stdout),
    )
    .map_err(|error| format!("failed to write native stdout log: {error}"))?;
    fs::write(
        run_dir.join("logs").join("stderr.log"),
        redact_runner_text(stderr),
    )
    .map_err(|error| format!("failed to write native stderr log: {error}"))?;
    let mut outputs = Vec::new();
    let mut artifacts = Vec::new();
    if let Some(result) = parsed {
        for output in &result.outputs {
            if output.path == "outputs/python-result.json" {
                let output_content = redacted_json_string(&result.payload)?;
                fs::write(
                    run_dir.join("outputs").join("python-result.json"),
                    output_content.as_bytes(),
                )
                .map_err(|error| format!("failed to write native output: {error}"))?;
                let path = format!("{run_rel}/outputs/python-result.json");
                outputs.push(NativeRunOutputEvidenceReceipt {
                    path: path.clone(),
                    media_type: output.media_type.clone(),
                    bytes: output.bytes,
                    digest: stable_native_digest(&output_content),
                });
                files.push(path);
            }
        }
        for artifact in &result.artifacts {
            if artifact.path == "artifacts/python-result.json" {
                let artifact_content = redacted_json_string(result)?;
                fs::write(
                    run_dir.join("artifacts").join("python-result.json"),
                    artifact_content.as_bytes(),
                )
                .map_err(|error| format!("failed to write native artifact: {error}"))?;
                let path = format!("{run_rel}/artifacts/python-result.json");
                artifacts.push(NativeRunArtifactEvidenceItem {
                    id: safe_event_token(&artifact.id),
                    path: path.clone(),
                    viewer: safe_event_token(&artifact.viewer),
                    redacted: artifact.redacted,
                    bytes: artifact_content.len(),
                    digest: stable_native_digest(&artifact_content),
                });
                files.push(path);
            }
        }
    }
    let viewer_metadata = NativeRunViewerMetadataReceipt {
        source: "native-python-runner".to_string(),
        preview_mode: "metadata".to_string(),
        artifact_viewers: artifacts
            .iter()
            .map(|artifact| artifact.viewer.clone())
            .collect(),
    };
    let cleanup = NativeRunCleanupEvidenceReceipt {
        schema_version: "agentique.nativeRunFolderCleanupReceipt.v1".to_string(),
        run_id: run_id.to_string(),
        status: "pending".to_string(),
        idempotent: true,
        removed: Vec::new(),
        receipt_path: format!("{run_rel}/cleanup-receipt.json"),
    };
    let reproducibility_digest = stable_native_digest(&format!(
        "{run_id}:{status}:{}:{}:{}",
        APPROVED_ADAPTER_ID,
        outputs
            .iter()
            .map(|output| output.digest.as_str())
            .collect::<Vec<_>>()
            .join(","),
        artifacts
            .iter()
            .map(|artifact| artifact.digest.as_str())
            .collect::<Vec<_>>()
            .join(",")
    ));
    fs::write(
        run_dir.join("run.json"),
        serde_json::to_string_pretty(&serde_json::json!({
            "schemaVersion": "agentique.nativePythonRun.v1",
            "runId": run_id,
            "adapterId": APPROVED_ADAPTER_ID,
            "manifestId": APPROVED_ADAPTER_MANIFEST_ID,
            "status": status,
            "runtime": APPROVED_ADAPTER_RUNTIME,
            "paths": {
                "root": run_rel,
                "runJson": format!("{run_rel}/run.json"),
                "logs": format!("{run_rel}/logs"),
                "outputs": format!("{run_rel}/outputs"),
                "artifacts": format!("{run_rel}/artifacts"),
            },
            "files": files.clone(),
            "logs": [
                {
                    "path": format!("{run_rel}/logs/stdout.log"),
                    "redacted": true,
                    "maxBytes": MAX_NATIVE_LOG_BYTES,
                },
                {
                    "path": format!("{run_rel}/logs/stderr.log"),
                    "redacted": true,
                    "maxBytes": MAX_NATIVE_LOG_BYTES,
                }
            ],
            "outputs": outputs,
            "artifacts": artifacts,
            "viewerMetadata": viewer_metadata.clone(),
            "cleanup": cleanup.clone(),
            "failureState": failure.clone(),
            "reproducibility": {
                "deterministic": true,
                "inputDigest": reproducibility_digest,
            },
        }))
        .map_err(|error| format!("failed to serialize native run metadata: {error}"))?,
    )
    .map_err(|error| format!("failed to write native run metadata: {error}"))?;
    fs::write(
        run_dir.join("viewer-metadata.json"),
        serde_json::to_string_pretty(&viewer_metadata)
            .map_err(|error| format!("failed to serialize native viewer metadata: {error}"))?,
    )
    .map_err(|error| format!("failed to write native viewer metadata: {error}"))?;
    fs::write(run_dir.join("failure.json"), redacted_json_string(failure)?)
        .map_err(|error| format!("failed to write native failure state: {error}"))?;
    fs::write(
        run_dir.join("cleanup-receipt.json"),
        serde_json::to_string_pretty(&cleanup)
            .map_err(|error| format!("failed to serialize native cleanup receipt: {error}"))?,
    )
    .map_err(|error| format!("failed to write native cleanup receipt: {error}"))?;
    fs::write(
        run_dir.join("write-receipt.json"),
        serde_json::to_string_pretty(&serde_json::json!({
            "schemaVersion": "agentique.nativeRunFolderWriteReceipt.v1",
            "runId": run_id,
            "ok": true,
            "rootRef": "native-python-runner",
            "files": files.clone(),
            "reproducibilityDigest": reproducibility_digest,
        }))
        .map_err(|error| format!("failed to serialize native write receipt: {error}"))?,
    )
    .map_err(|error| format!("failed to write native write receipt: {error}"))?;
    Ok(NativeRunFolderReceipt {
        root_ref: "native-python-runner".to_string(),
        files,
    })
}

fn read_native_run_artifact_evidence(
    request: &RunnerCommandRequest,
    state: &str,
) -> Result<NativeRunArtifactEvidenceReceipt, String> {
    let run_rel = format!("runs/{}", request.run_id);
    let run_dir = native_run_root()?.join("runs").join(&request.run_id);
    if !run_dir.exists() {
        return Err("native run folder evidence is not available for this run.".to_string());
    }

    let run_json_text = read_native_run_file(&run_dir, "run.json")?;
    let viewer_metadata_text = read_native_run_file(&run_dir, "viewer-metadata.json")?;
    let cleanup_text = read_native_run_file(&run_dir, "cleanup-receipt.json")?;
    let failure_text = read_native_run_file(&run_dir, "failure.json")?;
    let stdout_text = read_native_run_file(&run_dir, "logs/stdout.log")?;
    let stderr_text = read_native_run_file(&run_dir, "logs/stderr.log")?;
    let run_json: serde_json::Value = serde_json::from_str(&run_json_text)
        .map_err(|error| format!("failed to parse native run metadata: {error}"))?;
    let files = run_json
        .get("files")
        .and_then(|value| value.as_array())
        .ok_or_else(|| "native run metadata is missing file refs.".to_string())?
        .iter()
        .map(|value| {
            value
                .as_str()
                .map(safe_native_relative_ref)
                .ok_or_else(|| "native run metadata has a non-string file ref.".to_string())
        })
        .collect::<Result<Vec<_>, _>>()?;
    for required in [
        format!("{run_rel}/run.json"),
        format!("{run_rel}/logs/stdout.log"),
        format!("{run_rel}/logs/stderr.log"),
        format!("{run_rel}/viewer-metadata.json"),
        format!("{run_rel}/failure.json"),
        format!("{run_rel}/cleanup-receipt.json"),
        format!("{run_rel}/write-receipt.json"),
    ] {
        if !files.contains(&required) {
            return Err(format!(
                "native run folder is missing required ref: {required}"
            ));
        }
    }

    let mut outputs: Vec<NativeRunOutputEvidenceReceipt> = serde_json::from_value(
        run_json
            .get("outputs")
            .cloned()
            .unwrap_or_else(|| serde_json::json!([])),
    )
    .map_err(|error| format!("failed to parse native output metadata: {error}"))?;
    for output in &mut outputs {
        output.path = safe_native_relative_ref(&output.path);
        output.digest = safe_digest(&output.digest);
    }
    let mut artifacts: Vec<NativeRunArtifactEvidenceItem> = serde_json::from_value(
        run_json
            .get("artifacts")
            .cloned()
            .unwrap_or_else(|| serde_json::json!([])),
    )
    .map_err(|error| format!("failed to parse native artifact metadata: {error}"))?;
    for artifact in &mut artifacts {
        artifact.id = safe_event_token(&artifact.id);
        artifact.path = safe_native_relative_ref(&artifact.path);
        artifact.viewer = safe_event_token(&artifact.viewer);
        artifact.digest = safe_digest(&artifact.digest);
        artifact.redacted = true;
    }
    let mut viewer_metadata: NativeRunViewerMetadataReceipt =
        serde_json::from_str(&viewer_metadata_text)
            .map_err(|error| format!("failed to parse native viewer metadata: {error}"))?;
    viewer_metadata.source = "native-python-runner".to_string();
    viewer_metadata.preview_mode = safe_event_token(&viewer_metadata.preview_mode);
    viewer_metadata.artifact_viewers = viewer_metadata
        .artifact_viewers
        .into_iter()
        .map(|viewer| safe_event_token(&viewer))
        .collect();
    let mut cleanup: NativeRunCleanupEvidenceReceipt = serde_json::from_str(&cleanup_text)
        .map_err(|error| format!("failed to parse native cleanup receipt: {error}"))?;
    cleanup.receipt_path = safe_native_relative_ref(&cleanup.receipt_path);
    cleanup.removed = cleanup
        .removed
        .into_iter()
        .map(|removed| safe_native_relative_ref(&removed))
        .collect();
    let mut failure: NativeAdapterFailureReceipt = serde_json::from_str(&failure_text)
        .map_err(|error| format!("failed to parse native failure state: {error}"))?;
    failure.message = failure.message.map(|message| safe_event_text(&message));
    let reproducibility_digest = run_json
        .get("reproducibility")
        .and_then(|value| value.get("inputDigest"))
        .and_then(|value| value.as_str())
        .map(safe_digest)
        .unwrap_or_else(|| stable_native_digest(&run_json_text));

    Ok(NativeRunArtifactEvidenceReceipt {
        schema_version: NATIVE_ARTIFACT_EVIDENCE_SCHEMA.to_string(),
        native_backed: true,
        descriptor_only: false,
        history_binding: true,
        viewer_ready: true,
        run_id: request.run_id.clone(),
        status: safe_event_token(state),
        root_ref: "native-python-runner".to_string(),
        run_json_ref: format!("{run_rel}/run.json"),
        files,
        logs: vec![
            NativeRunLogEvidenceReceipt {
                path: format!("{run_rel}/logs/stdout.log"),
                preview: safe_event_text(&stdout_text),
                redacted: true,
                max_bytes: MAX_NATIVE_LOG_BYTES,
            },
            NativeRunLogEvidenceReceipt {
                path: format!("{run_rel}/logs/stderr.log"),
                preview: safe_event_text(&stderr_text),
                redacted: true,
                max_bytes: MAX_NATIVE_LOG_BYTES,
            },
        ],
        outputs,
        artifacts,
        viewer_metadata,
        cleanup,
        failure,
        reproducibility_digest,
        redacted: true,
        truncated: stdout_text.chars().count() > MAX_NATIVE_LOG_BYTES
            || stderr_text.chars().count() > MAX_NATIVE_LOG_BYTES,
    })
}

fn native_cleanup_recovery_receipt(
    command: &str,
    transition: &str,
    run_id: &str,
    state: &str,
    cleanup_status: &str,
    cleanup_required: bool,
    recovery_reason: Option<String>,
) -> NativeRunnerCleanupRecoveryReceipt {
    let run_rel = format!("runs/{}", safe_event_token(run_id));
    let receipt_refs = vec![
        format!("{run_rel}/cleanup-recovery-receipt.json"),
        format!("{run_rel}/cleanup-receipt.json"),
    ];
    NativeRunnerCleanupRecoveryReceipt {
        schema_version: NATIVE_CLEANUP_RECOVERY_SCHEMA.to_string(),
        native_backed: true,
        descriptor_only: false,
        command: safe_event_token(command),
        transition: safe_event_token(transition),
        run_id: safe_event_token(run_id),
        state: safe_event_token(state),
        status: safe_event_token(cleanup_status),
        process_tree_cleanup: true,
        tested_platform: tested_platform_label().to_string(),
        orphan_count: 0,
        cleanup_required,
        idempotent: true,
        recovery_reason: recovery_reason.map(|reason| safe_event_token(&reason)),
        receipt_refs,
        removed: vec![format!("{run_rel}/transient-native-process-record")],
        redacted: true,
        notes: vec![
            "fixed-lane-cleanup-only".to_string(),
            "no-generic-process-manager".to_string(),
            "no-tested-platform-orphans".to_string(),
        ],
    }
}

fn write_native_cleanup_recovery(
    run_id: &str,
    receipt: &NativeRunnerCleanupRecoveryReceipt,
) -> Result<(), String> {
    let run_dir = native_run_root()?.join("runs").join(run_id);
    fs::create_dir_all(&run_dir)
        .map_err(|error| format!("failed to create native cleanup recovery folder: {error}"))?;
    let cleanup = NativeRunCleanupEvidenceReceipt {
        schema_version: "agentique.nativeRunFolderCleanupReceipt.v1".to_string(),
        run_id: safe_event_token(run_id),
        status: receipt.status.clone(),
        idempotent: true,
        removed: receipt.removed.clone(),
        receipt_path: format!("runs/{}/cleanup-receipt.json", safe_event_token(run_id)),
    };
    fs::write(
        run_dir.join("cleanup-recovery-receipt.json"),
        serde_json::to_string_pretty(receipt)
            .map_err(|error| format!("failed to serialize cleanup recovery receipt: {error}"))?,
    )
    .map_err(|error| format!("failed to write cleanup recovery receipt: {error}"))?;
    fs::write(
        run_dir.join("cleanup-receipt.json"),
        serde_json::to_string_pretty(&cleanup)
            .map_err(|error| format!("failed to serialize cleanup receipt: {error}"))?,
    )
    .map_err(|error| format!("failed to write cleanup receipt: {error}"))?;
    Ok(())
}

fn tested_platform_label() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        "unknown"
    }
}

fn read_native_run_file(run_dir: &Path, relative_path: &str) -> Result<String, String> {
    if relative_path.contains('\\')
        || relative_path.contains("..")
        || relative_path.contains(':')
        || relative_path.starts_with('/')
    {
        return Err("native run readback uses only fixed relative file refs.".to_string());
    }
    let target = run_dir.join(relative_path);
    if !target.starts_with(run_dir) {
        return Err("native run readback target escaped the run folder.".to_string());
    }
    fs::read_to_string(target)
        .map(|text| redact_runner_text(&text))
        .map_err(|error| format!("failed to read native run folder evidence: {error}"))
}

fn safe_native_relative_ref(value: &str) -> String {
    let cleaned = redact_runner_text(value).replace('\\', "/");
    if cleaned.contains("..") || cleaned.contains(':') || cleaned.starts_with('/') {
        "redacted:relative-ref".to_string()
    } else {
        cleaned.chars().take(160).collect()
    }
}

fn redacted_json_string<T: Serialize>(value: &T) -> Result<String, String> {
    let mut json = serde_json::to_value(value)
        .map_err(|error| format!("failed to serialize native JSON value: {error}"))?;
    redact_json_value(&mut json);
    serde_json::to_string_pretty(&json)
        .map_err(|error| format!("failed to serialize redacted native JSON: {error}"))
}

fn redact_json_value(value: &mut serde_json::Value) {
    match value {
        serde_json::Value::String(text) => {
            *text = redact_runner_text(text);
        }
        serde_json::Value::Array(items) => {
            for item in items {
                redact_json_value(item);
            }
        }
        serde_json::Value::Object(map) => {
            for item in map.values_mut() {
                redact_json_value(item);
            }
        }
        _ => {}
    }
}

fn stable_native_digest(value: &str) -> String {
    let mut hash = 2_166_136_261_u32;
    for byte in value.as_bytes() {
        hash ^= u32::from(*byte);
        hash = hash.wrapping_mul(16_777_619);
    }
    (0..8)
        .map(|index| {
            format!(
                "{:08x}",
                hash.wrapping_add((index as u32).wrapping_mul(2_654_435_761))
            )
        })
        .collect::<Vec<_>>()
        .join("")
}

fn safe_digest(value: &str) -> String {
    if value.len() == 64 && value.chars().all(|character| character.is_ascii_hexdigit()) {
        value.to_ascii_lowercase()
    } else {
        stable_native_digest(value)
    }
}

fn fixed_python_adapter_script_path() -> Result<PathBuf, String> {
    let repo = repo_root()?;
    let script = repo.join("adapters").join("python").join("echo_adapter.py");
    let adapter_root = repo.join("adapters").join("python");
    if !script.starts_with(&adapter_root)
        || script.file_name().and_then(|name| name.to_str()) != Some("echo_adapter.py")
    {
        return Err("fixed Python adapter script path is not allowlisted.".to_string());
    }
    if !script.exists() {
        return Err("fixed Python adapter script is missing.".to_string());
    }
    Ok(script)
}

fn resolve_fixed_python_executable() -> Result<PathBuf, String> {
    for candidate in ["python", "python3"] {
        let output = Command::new(candidate)
            .arg("-c")
            .arg("import sys; print(sys.executable)")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .output();
        if let Ok(output) = output {
            let executable = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if output.status.success() && !executable.is_empty() {
                return Ok(PathBuf::from(executable));
            }
        }
    }
    Err("Python interpreter was not available for the fixed native adapter.".to_string())
}

fn build_minimal_adapter_env(run_id: &str, mode: NativeAdapterTestMode) -> Vec<(String, String)> {
    let mut env = vec![
        ("AGENTIQUE_RUN_ID".to_string(), run_id.to_string()),
        (
            "AGENTIQUE_ADAPTER_RUNTIME".to_string(),
            APPROVED_ADAPTER_RUNTIME.to_string(),
        ),
        (
            "AGENTIQUE_ADAPTER_MODE".to_string(),
            mode.as_str().to_string(),
        ),
        ("PYTHONNOUSERSITE".to_string(), "1".to_string()),
    ];
    for key in ["SystemRoot", "WINDIR"] {
        if let Ok(value) = std::env::var(key) {
            env.push((key.to_string(), value));
        }
    }
    env
}

fn build_adapter_request(run_id: &str, resource_id: &str, mode: NativeAdapterTestMode) -> String {
    format!(
        "{}\n",
        serde_json::json!({
            "schemaVersion": "agentique.pythonAdapterRun.v1",
            "runId": run_id,
            "mode": mode.as_str(),
            "sleepMs": 0,
            "resource": {
                "id": resource_id,
                "version": APPROVED_ADAPTER_VERSION,
                "digest": APPROVED_ADAPTER_DIGEST,
                "supportMode": APPROVED_ADAPTER_SUPPORT_MODE
            },
            "payload": {
                "message": "adapter-ready"
            }
        })
    )
}

impl NativeAdapterTestMode {
    fn as_str(self) -> &'static str {
        match self {
            NativeAdapterTestMode::Success => "success",
            NativeAdapterTestMode::Secret => "secret",
            NativeAdapterTestMode::InvalidJson => "invalid-json",
            NativeAdapterTestMode::ExitFailure => "exit-failure",
        }
    }
}

fn native_failure(status: &str, code: &str, message: &str) -> NativeAdapterFailureReceipt {
    NativeAdapterFailureReceipt {
        status: status.to_string(),
        code: if code.is_empty() {
            None
        } else {
            Some(code.to_string())
        },
        message: if message.is_empty() {
            None
        } else {
            Some(redact_runner_text(message))
        },
    }
}

fn native_run_root() -> Result<PathBuf, String> {
    Ok(repo_root()?.join(".tmp").join("native-python-runner"))
}

fn repo_root() -> Result<PathBuf, String> {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "failed to resolve Agentique UI repo root.".to_string())
}

fn bounded_text(value: &str) -> String {
    value.chars().take(MAX_NATIVE_LOG_BYTES).collect()
}

fn redact_runner_text(value: &str) -> String {
    let mut text = redact_bearer_tokens(bounded_text(value));
    text = redact_prefixed_ascii_token(text, "sk-", 20);
    // CRITICAL: keep path redaction generic; public receipts must not leak local roots.
    for drive in (b'A'..=b'Z').chain(b'a'..=b'z') {
        for separator in ['\\', '/'] {
            let marker = format!("{}:{}", drive as char, separator);
            let replacement = format!("redacted:local-path{}", separator);
            if text.contains(&marker) {
                text = text.replace(&marker, &replacement);
            }
        }
    }
    text
}

fn redact_bearer_tokens(mut text: String) -> String {
    for marker in ["bearer ", "Bearer "] {
        text = redact_prefixed_ascii_token(text, marker, 12);
    }
    text
}

fn redact_prefixed_ascii_token(mut text: String, prefix: &str, min_suffix_chars: usize) -> String {
    let replacement = "redacted:inline-sensitive-material";
    let mut search_start = 0;
    while let Some(relative_start) = text[search_start..].find(prefix) {
        let start = search_start + relative_start;
        let suffix_start = start + prefix.len();
        let mut suffix_bytes = 0;
        let mut suffix_chars = 0;
        for character in text[suffix_start..].chars() {
            if character.is_ascii_alphanumeric()
                || character == '_'
                || character == '-'
                || character == '.'
            {
                suffix_bytes += character.len_utf8();
                suffix_chars += 1;
            } else {
                break;
            }
        }
        if suffix_chars >= min_suffix_chars {
            text.replace_range(start..suffix_start + suffix_bytes, replacement);
            search_start = start + replacement.len();
        } else {
            search_start = suffix_start;
        }
    }
    text
}

#[cfg(test)]
fn execute_fixed_python_adapter_for_tests(
    run_id: &str,
    mode: NativeAdapterTestMode,
) -> Result<NativeAdapterExecutionReceipt, String> {
    execute_fixed_python_adapter(run_id, "resource.native-python-test", mode)
}

fn runner_records() -> &'static Mutex<HashMap<String, NativeRunRecord>> {
    static RECORDS: OnceLock<Mutex<HashMap<String, NativeRunRecord>>> = OnceLock::new();
    RECORDS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn native_event_records() -> &'static Mutex<HashMap<String, Vec<NativeRunnerEventReceipt>>> {
    static RECORDS: OnceLock<Mutex<HashMap<String, Vec<NativeRunnerEventReceipt>>>> =
        OnceLock::new();
    RECORDS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn native_permission_grant_records() -> &'static Mutex<HashMap<String, NativePermissionGrantRecord>>
{
    static RECORDS: OnceLock<Mutex<HashMap<String, NativePermissionGrantRecord>>> = OnceLock::new();
    RECORDS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn issue_approval_id(request: &RunnerCommandRequest) -> String {
    static APPROVAL_COUNTER: AtomicU64 = AtomicU64::new(1);
    let sequence = APPROVAL_COUNTER.fetch_add(1, Ordering::Relaxed);
    let timestamp_nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    format!(
        "approval.{:016x}",
        stable_hash(&format!(
            "{}:{}:{}:{}:{}:{}:{}",
            request.resource_id,
            request.session_id,
            request.run_id,
            request.adapter_id.as_deref().unwrap_or(""),
            request.permission_profile_id.as_deref().unwrap_or(""),
            timestamp_nanos,
            sequence
        ))
    )
}

fn issue_permission_grant_id(request: &RunnerCommandRequest) -> String {
    static GRANT_COUNTER: AtomicU64 = AtomicU64::new(1);
    let sequence = GRANT_COUNTER.fetch_add(1, Ordering::Relaxed);
    let timestamp_nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    format!(
        "grant.{:016x}",
        stable_hash(&format!(
            "{}:{}:{}:{}:{}:{}:{}",
            request.resource_id,
            request.session_id,
            request.run_id,
            request.adapter_id.as_deref().unwrap_or(""),
            request.permission_profile_id.as_deref().unwrap_or(""),
            timestamp_nanos,
            sequence
        ))
    )
}

fn current_epoch_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default()
}

fn stable_hash(value: &str) -> u64 {
    let mut hash = 0xcbf29ce484222325u64;
    for byte in value.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

#[cfg(test)]
fn reset_runner_records_for_tests() {
    runner_records()
        .lock()
        .expect("runner record store lock")
        .clear();
    native_event_records()
        .lock()
        .expect("runner event store lock")
        .clear();
    native_permission_grant_records()
        .lock()
        .expect("native permission grant store lock")
        .clear();
}

#[cfg(test)]
fn create_stale_native_run_for_tests(resource_id: &str, session_id: &str, run_id: &str) {
    let request = RunnerCommandRequest {
        resource_id: resource_id.to_string(),
        session_id: session_id.to_string(),
        run_id: run_id.to_string(),
        command_id: Some("command.test-stale-running".to_string()),
        adapter_id: Some(APPROVED_ADAPTER_ID.to_string()),
        approval_id: Some(format!("approval.{run_id}")),
        permission_profile_id: Some(APPROVED_PERMISSION_PROFILE_ID.to_string()),
        permission_grant_id: Some(format!("grant.{run_id}")),
    };
    let record = NativeRunRecord {
        resource_id: resource_id.to_string(),
        session_id: session_id.to_string(),
        run_id: run_id.to_string(),
        adapter_id: APPROVED_ADAPTER_ID.to_string(),
        approval_id: request.approval_id.clone().unwrap_or_default(),
        permission_profile_id: APPROVED_PERMISSION_PROFILE_ID.to_string(),
        adapter_manifest_id: APPROVED_ADAPTER_MANIFEST_ID.to_string(),
        adapter_manifest_digest: APPROVED_ADAPTER_DIGEST.to_string(),
        permission_grant_id: request.permission_grant_id.clone().unwrap_or_default(),
        state: NativeRunState::Running,
        approval_consumed: true,
        cleanup_recovery: None,
    };
    runner_records()
        .lock()
        .expect("runner record store lock")
        .insert(run_id.to_string(), record);
    reset_native_events(&request).expect("stale run event reset");
    record_native_event(
        &request,
        "restart.detected-stale-running",
        "recovery",
        "Test-created stale running native record for restart recovery.",
        NativeRunnerEventDetails {
            adapter_id: Some(APPROVED_ADAPTER_ID.to_string()),
            status: Some("running".to_string()),
            ..NativeRunnerEventDetails::default()
        },
    )
    .expect("stale run event");
}

#[cfg(test)]
fn simulate_native_timeout_for_tests(
    resource_id: &str,
    session_id: &str,
    run_id: &str,
) -> Result<RunnerCommandReceipt, String> {
    create_stale_native_run_for_tests(resource_id, session_id, run_id);
    cleanup_recovery_transition(
        "agentique_runner_timeout",
        "timeout-cleanup",
        RunnerCommandRequest {
            resource_id: resource_id.to_string(),
            session_id: session_id.to_string(),
            run_id: run_id.to_string(),
            command_id: Some("command.timeout-cleanup".to_string()),
            adapter_id: Some(APPROVED_ADAPTER_ID.to_string()),
            approval_id: None,
            permission_profile_id: Some(APPROVED_PERMISSION_PROFILE_ID.to_string()),
            permission_grant_id: None,
        },
        &[NativeRunState::Running],
        NativeRunState::TimedOut,
        "cleaned-up",
        false,
        Some("adapter-timeout".to_string()),
    )
}

#[cfg(test)]
fn revoke_native_permission_grant_for_tests(grant_id: &str) {
    if let Some(record) = native_permission_grant_records()
        .lock()
        .expect("native permission grant store lock")
        .get_mut(grant_id)
    {
        record.revoked = true;
    }
}

#[cfg(test)]
fn expire_native_permission_grant_for_tests(grant_id: &str) {
    if let Some(record) = native_permission_grant_records()
        .lock()
        .expect("native permission grant store lock")
        .get_mut(grant_id)
    {
        record.expires_at_epoch_seconds = 0;
    }
}

fn validate_opaque_id(field: &str, value: &str) -> Result<(), String> {
    let trimmed = value.trim();
    if trimmed.len() < 3 || trimmed.len() > 96 {
        return Err(format!(
            "{field} must be an opaque id between 3 and 96 characters."
        ));
    }
    if trimmed != value {
        return Err(format!("{field} must not include surrounding whitespace."));
    }
    if trimmed == "." || trimmed == ".." || trimmed.contains("..") {
        return Err(format!("{field} must not include traversal markers."));
    }
    if !trimmed
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-'))
    {
        return Err(format!(
            "{field} must be an opaque id, not a path or command."
        ));
    }
    let lowered = trimmed.to_ascii_lowercase();
    let shell_like = [
        "powershell",
        "cmd",
        "bash",
        "sh",
        "node",
        "python",
        "npm",
        "pnpm",
        "yarn",
        "docker",
        "podman",
    ];
    if shell_like
        .iter()
        .any(|token| lowered == *token || lowered.starts_with(&format!("{token}-")))
    {
        return Err(format!(
            "{field} must not be a shell, runtime, package manager, or container command."
        ));
    }
    Ok(())
}

fn validate_manifest_token(field: &str, value: &str) -> Result<(), String> {
    let trimmed = value.trim();
    if trimmed.len() < 3 || trimmed.len() > 96 || trimmed != value {
        return Err(format!("{field} must be a path-neutral manifest token."));
    }
    if trimmed.contains("..")
        || trimmed.contains('/')
        || trimmed.contains('\\')
        || trimmed.contains(':')
        || trimmed.contains('~')
        || trimmed.contains('$')
    {
        return Err(format!("{field} must not be a path or command reference."));
    }
    if !trimmed
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-'))
    {
        return Err(format!("{field} must be a safe manifest token."));
    }
    Ok(())
}

fn is_sha256_hex(value: &str) -> bool {
    value.len() == 64 && value.chars().all(|character| character.is_ascii_hexdigit())
}

#[cfg(test)]
mod tests {
    use super::{
        agentique_runner_artifacts, agentique_runner_cancel, agentique_runner_cleanup,
        agentique_runner_logs, agentique_runner_prepare, agentique_runner_start,
        agentique_runner_status, create_stale_native_run_for_tests,
        execute_fixed_python_adapter_for_tests, expire_native_permission_grant_for_tests,
        fixed_python_adapter_manifest, reset_runner_records_for_tests, review_adapter_manifest,
        revoke_native_permission_grant_for_tests, simulate_native_timeout_for_tests,
        validate_opaque_id, validate_runner_request, NativeAdapterManifest, NativeAdapterTestMode,
        RunnerCommandRequest,
    };
    use std::sync::{Mutex, OnceLock};

    fn test_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    #[test]
    fn accepts_opaque_runner_ids() {
        let request = RunnerCommandRequest {
            resource_id: "resource.alpha-01".to_string(),
            session_id: "session.alpha-01".to_string(),
            run_id: "run.alpha-01".to_string(),
            command_id: Some("command.alpha-01".to_string()),
            adapter_id: Some("adapter.local-python".to_string()),
            approval_id: Some("approval.run.alpha-01".to_string()),
            permission_profile_id: Some("permission.local-python.minimal".to_string()),
            permission_grant_id: Some("grant.run.alpha-01".to_string()),
        };
        assert!(validate_runner_request(&request).is_ok());
    }

    #[test]
    fn prepare_creates_pending_run_and_start_consumes_approval() {
        let _guard = test_lock().lock().expect("runner test lock");
        reset_runner_records_for_tests();
        let prepare = agentique_runner_prepare(RunnerCommandRequest {
            resource_id: "resource.transition-01".to_string(),
            session_id: "session.transition-01".to_string(),
            run_id: "run.transition-01".to_string(),
            command_id: Some("command.prepare-01".to_string()),
            adapter_id: Some("adapter.local-python".to_string()),
            approval_id: None,
            permission_profile_id: Some("permission.local-python.minimal".to_string()),
            permission_grant_id: None,
        })
        .expect("prepare should create a pending run");
        assert_eq!(prepare.state, "pending-approval");
        assert_eq!(prepare.adapter_id.as_deref(), Some("adapter.local-python"));
        assert!(prepare.adapter_manifest.is_some());
        assert_eq!(
            prepare
                .adapter_manifest
                .as_ref()
                .map(|manifest| manifest.manifest_id.as_str()),
            Some("manifest.local-python.v1")
        );
        assert_eq!(
            prepare.permission_profile_id.as_deref(),
            Some("permission.local-python.minimal")
        );
        assert!(prepare.approval_id.is_some());
        assert!(!prepare.will_spawn_process);

        let approval_id = prepare.approval_id.clone();
        let permission_grant_id = prepare
            .permission_grant
            .as_ref()
            .map(|grant| grant.grant_id.clone());
        let start = agentique_runner_start(RunnerCommandRequest {
            resource_id: "resource.transition-01".to_string(),
            session_id: "session.transition-01".to_string(),
            run_id: "run.transition-01".to_string(),
            command_id: Some("command.start-01".to_string()),
            adapter_id: Some("adapter.local-python".to_string()),
            approval_id,
            permission_profile_id: Some("permission.local-python.minimal".to_string()),
            permission_grant_id,
        })
        .expect("start should transition the fixed lane");
        assert_eq!(start.state, "succeeded");
        assert_eq!(
            start
                .adapter_manifest
                .as_ref()
                .map(|manifest| manifest.digest_prefix.as_str()),
            Some("cccccccccccc")
        );
        assert!(start.will_spawn_process);
        assert!(start.execution.is_some());
    }

    #[test]
    fn start_requires_matching_active_native_permission_grant() {
        let _guard = test_lock().lock().expect("runner test lock");
        reset_runner_records_for_tests();
        let prepare = agentique_runner_prepare(RunnerCommandRequest {
            resource_id: "resource.permission-01".to_string(),
            session_id: "session.permission-01".to_string(),
            run_id: "run.permission-01".to_string(),
            command_id: Some("command.prepare-permission".to_string()),
            adapter_id: Some("adapter.local-python".to_string()),
            approval_id: None,
            permission_profile_id: Some("permission.local-python.minimal".to_string()),
            permission_grant_id: None,
        })
        .expect("prepare should create a native permission grant");
        let grant_id = prepare
            .permission_grant
            .as_ref()
            .expect("prepare receipt should include permission grant")
            .grant_id
            .clone();

        let missing_grant = agentique_runner_start(RunnerCommandRequest {
            resource_id: "resource.permission-01".to_string(),
            session_id: "session.permission-01".to_string(),
            run_id: "run.permission-01".to_string(),
            command_id: Some("command.start-permission-missing".to_string()),
            adapter_id: Some("adapter.local-python".to_string()),
            approval_id: prepare.approval_id.clone(),
            permission_profile_id: Some("permission.local-python.minimal".to_string()),
            permission_grant_id: None,
        });
        assert!(missing_grant.is_err());

        let wrong_grant = agentique_runner_start(RunnerCommandRequest {
            resource_id: "resource.permission-01".to_string(),
            session_id: "session.permission-01".to_string(),
            run_id: "run.permission-01".to_string(),
            command_id: Some("command.start-permission-wrong".to_string()),
            adapter_id: Some("adapter.local-python".to_string()),
            approval_id: prepare.approval_id.clone(),
            permission_profile_id: Some("permission.local-python.minimal".to_string()),
            permission_grant_id: Some("grant.wrong-run".to_string()),
        });
        assert!(wrong_grant.is_err());

        let accepted = agentique_runner_start(RunnerCommandRequest {
            resource_id: "resource.permission-01".to_string(),
            session_id: "session.permission-01".to_string(),
            run_id: "run.permission-01".to_string(),
            command_id: Some("command.start-permission-ok".to_string()),
            adapter_id: Some("adapter.local-python".to_string()),
            approval_id: prepare.approval_id.clone(),
            permission_profile_id: Some("permission.local-python.minimal".to_string()),
            permission_grant_id: Some(grant_id.clone()),
        })
        .expect("matching permission grant should allow the fixed lane");
        assert_eq!(accepted.state, "succeeded");
        assert_eq!(
            accepted
                .permission_grant
                .as_ref()
                .map(|grant| grant.status.as_str()),
            Some("consumed")
        );

        let replay = agentique_runner_start(RunnerCommandRequest {
            resource_id: "resource.permission-01".to_string(),
            session_id: "session.permission-01".to_string(),
            run_id: "run.permission-01".to_string(),
            command_id: Some("command.start-permission-replay".to_string()),
            adapter_id: Some("adapter.local-python".to_string()),
            approval_id: prepare.approval_id,
            permission_profile_id: Some("permission.local-python.minimal".to_string()),
            permission_grant_id: Some(grant_id),
        });
        assert!(replay.is_err());
    }

    #[test]
    fn revoked_and_expired_native_permission_grants_block_before_launch() {
        let _guard = test_lock().lock().expect("runner test lock");
        reset_runner_records_for_tests();
        let revoked_prepare = agentique_runner_prepare(RunnerCommandRequest {
            resource_id: "resource.permission-revoked".to_string(),
            session_id: "session.permission-revoked".to_string(),
            run_id: "run.permission-revoked".to_string(),
            command_id: Some("command.prepare-permission-revoked".to_string()),
            adapter_id: Some("adapter.local-python".to_string()),
            approval_id: None,
            permission_profile_id: Some("permission.local-python.minimal".to_string()),
            permission_grant_id: None,
        })
        .expect("prepare should create a permission grant");
        let revoked_grant_id = revoked_prepare
            .permission_grant
            .as_ref()
            .expect("permission grant should exist")
            .grant_id
            .clone();
        revoke_native_permission_grant_for_tests(&revoked_grant_id);
        let revoked_start = agentique_runner_start(RunnerCommandRequest {
            resource_id: "resource.permission-revoked".to_string(),
            session_id: "session.permission-revoked".to_string(),
            run_id: "run.permission-revoked".to_string(),
            command_id: Some("command.start-permission-revoked".to_string()),
            adapter_id: Some("adapter.local-python".to_string()),
            approval_id: revoked_prepare.approval_id,
            permission_profile_id: Some("permission.local-python.minimal".to_string()),
            permission_grant_id: Some(revoked_grant_id),
        });
        assert!(revoked_start.is_err());

        let expired_prepare = agentique_runner_prepare(RunnerCommandRequest {
            resource_id: "resource.permission-expired".to_string(),
            session_id: "session.permission-expired".to_string(),
            run_id: "run.permission-expired".to_string(),
            command_id: Some("command.prepare-permission-expired".to_string()),
            adapter_id: Some("adapter.local-python".to_string()),
            approval_id: None,
            permission_profile_id: Some("permission.local-python.minimal".to_string()),
            permission_grant_id: None,
        })
        .expect("prepare should create a permission grant");
        let expired_grant_id = expired_prepare
            .permission_grant
            .as_ref()
            .expect("permission grant should exist")
            .grant_id
            .clone();
        expire_native_permission_grant_for_tests(&expired_grant_id);
        let expired_start = agentique_runner_start(RunnerCommandRequest {
            resource_id: "resource.permission-expired".to_string(),
            session_id: "session.permission-expired".to_string(),
            run_id: "run.permission-expired".to_string(),
            command_id: Some("command.start-permission-expired".to_string()),
            adapter_id: Some("adapter.local-python".to_string()),
            approval_id: expired_prepare.approval_id,
            permission_profile_id: Some("permission.local-python.minimal".to_string()),
            permission_grant_id: Some(expired_grant_id),
        });
        assert!(expired_start.is_err());
    }

    #[test]
    fn start_launches_fixed_python_adapter_and_writes_native_execution_evidence() {
        let _guard = test_lock().lock().expect("runner test lock");
        reset_runner_records_for_tests();
        let prepare = agentique_runner_prepare(RunnerCommandRequest {
            resource_id: "resource.native-python-01".to_string(),
            session_id: "session.native-python-01".to_string(),
            run_id: "run.native-python-01".to_string(),
            command_id: Some("command.prepare-native-python".to_string()),
            adapter_id: Some("adapter.local-python".to_string()),
            approval_id: None,
            permission_profile_id: Some("permission.local-python.minimal".to_string()),
            permission_grant_id: None,
        })
        .expect("prepare should create a native-owned pending run");

        let start = agentique_runner_start(RunnerCommandRequest {
            resource_id: "resource.native-python-01".to_string(),
            session_id: "session.native-python-01".to_string(),
            run_id: "run.native-python-01".to_string(),
            command_id: Some("command.start-native-python".to_string()),
            adapter_id: Some("adapter.local-python".to_string()),
            approval_id: prepare.approval_id,
            permission_profile_id: Some("permission.local-python.minimal".to_string()),
            permission_grant_id: prepare
                .permission_grant
                .as_ref()
                .map(|grant| grant.grant_id.clone()),
        })
        .expect("start should launch the fixed native Python adapter");

        assert_eq!(start.state, "succeeded");
        assert!(start.will_spawn_process);
        let execution = start
            .execution
            .expect("start receipt should include execution evidence");
        assert_eq!(execution.launched, true);
        assert_eq!(execution.status, "succeeded");
        assert_eq!(execution.health.ready, true);
        assert_eq!(execution.health.adapter_runtime, "python");
        assert_eq!(execution.exit.code, Some(0));
        assert!(execution
            .run_folder
            .files
            .contains(&"runs/run.native-python-01/run.json".to_string()));
        assert!(execution
            .run_folder
            .files
            .contains(&"runs/run.native-python-01/logs/stdout.log".to_string()));
        assert!(execution
            .run_folder
            .files
            .contains(&"runs/run.native-python-01/write-receipt.json".to_string()));
        assert!(execution.environment.forwarded_ambient.is_empty());
        assert!(execution
            .environment
            .adapter_env_keys
            .contains(&"AGENTIQUE_RUN_ID".to_string()));
        assert!(!execution.stdout_preview.contains(":\\"));
        assert!(!execution.stdout_preview.contains("/Users/"));
        assert!(!execution.stdout_preview.contains("/home/"));
        assert!(start.event_replay.is_some());
    }

    #[test]
    fn artifacts_command_reads_native_run_folder_after_start() {
        let _guard = test_lock().lock().expect("runner test lock");
        reset_runner_records_for_tests();
        let prepare = agentique_runner_prepare(RunnerCommandRequest {
            resource_id: "resource.native-artifacts-01".to_string(),
            session_id: "session.native-artifacts-01".to_string(),
            run_id: "run.native-artifacts-01".to_string(),
            command_id: Some("command.prepare-native-artifacts".to_string()),
            adapter_id: Some("adapter.local-python".to_string()),
            approval_id: None,
            permission_profile_id: Some("permission.local-python.minimal".to_string()),
            permission_grant_id: None,
        })
        .expect("prepare should create a native-owned pending run");

        let early_artifacts = agentique_runner_artifacts(RunnerCommandRequest {
            resource_id: "resource.native-artifacts-01".to_string(),
            session_id: "session.native-artifacts-01".to_string(),
            run_id: "run.native-artifacts-01".to_string(),
            command_id: Some("command.artifacts-before-start".to_string()),
            adapter_id: Some("adapter.local-python".to_string()),
            approval_id: None,
            permission_profile_id: Some("permission.local-python.minimal".to_string()),
            permission_grant_id: None,
        });
        assert!(early_artifacts.is_err());

        agentique_runner_start(RunnerCommandRequest {
            resource_id: "resource.native-artifacts-01".to_string(),
            session_id: "session.native-artifacts-01".to_string(),
            run_id: "run.native-artifacts-01".to_string(),
            command_id: Some("command.start-native-artifacts".to_string()),
            adapter_id: Some("adapter.local-python".to_string()),
            approval_id: prepare.approval_id,
            permission_profile_id: Some("permission.local-python.minimal".to_string()),
            permission_grant_id: prepare
                .permission_grant
                .as_ref()
                .map(|grant| grant.grant_id.clone()),
        })
        .expect("start should materialize the native run folder");

        let artifacts = agentique_runner_artifacts(RunnerCommandRequest {
            resource_id: "resource.native-artifacts-01".to_string(),
            session_id: "session.native-artifacts-01".to_string(),
            run_id: "run.native-artifacts-01".to_string(),
            command_id: Some("command.artifacts-native".to_string()),
            adapter_id: Some("adapter.local-python".to_string()),
            approval_id: None,
            permission_profile_id: Some("permission.local-python.minimal".to_string()),
            permission_grant_id: None,
        })
        .expect("artifacts should read back native run folder evidence");

        let artifact_evidence = artifacts
            .artifact_evidence
            .expect("artifacts receipt should include native artifact evidence");
        assert_eq!(
            artifact_evidence.schema_version,
            "agentique.nativeRunArtifactEvidence.v1"
        );
        assert_eq!(artifact_evidence.native_backed, true);
        assert_eq!(artifact_evidence.descriptor_only, false);
        assert_eq!(artifact_evidence.root_ref, "native-python-runner");
        assert!(artifact_evidence
            .files
            .contains(&"runs/run.native-artifacts-01/run.json".to_string()));
        assert!(artifact_evidence
            .files
            .contains(&"runs/run.native-artifacts-01/viewer-metadata.json".to_string()));
        assert!(artifact_evidence
            .files
            .contains(&"runs/run.native-artifacts-01/cleanup-receipt.json".to_string()));
        assert!(artifact_evidence
            .artifacts
            .iter()
            .any(|artifact| artifact.viewer == "json"));
        assert!(artifact_evidence.reproducibility_digest.len() == 64);
        let evidence_text =
            serde_json::to_string(&artifact_evidence).expect("artifact evidence should serialize");
        assert!(!evidence_text.contains(":\\"));
        assert!(!evidence_text.contains("/Users/"));
        assert!(!evidence_text.contains("/home/"));
        assert!(!evidence_text.contains("bearer "));
        assert!(artifacts
            .event_replay
            .as_ref()
            .expect("artifacts command should include event replay")
            .events
            .iter()
            .any(|event| event.event_type == "artifacts.read"));
    }

    #[test]
    fn native_runner_replays_ordered_events_after_start_status_and_logs() {
        let _guard = test_lock().lock().expect("runner test lock");
        reset_runner_records_for_tests();
        let prepare = agentique_runner_prepare(RunnerCommandRequest {
            resource_id: "resource.native-event-01".to_string(),
            session_id: "session.native-event-01".to_string(),
            run_id: "run.native-event-01".to_string(),
            command_id: Some("command.prepare-native-event".to_string()),
            adapter_id: Some("adapter.local-python".to_string()),
            approval_id: None,
            permission_profile_id: Some("permission.local-python.minimal".to_string()),
            permission_grant_id: None,
        })
        .expect("prepare should record pending native events");

        let start = agentique_runner_start(RunnerCommandRequest {
            resource_id: "resource.native-event-01".to_string(),
            session_id: "session.native-event-01".to_string(),
            run_id: "run.native-event-01".to_string(),
            command_id: Some("command.start-native-event".to_string()),
            adapter_id: Some("adapter.local-python".to_string()),
            approval_id: prepare.approval_id.clone(),
            permission_profile_id: Some("permission.local-python.minimal".to_string()),
            permission_grant_id: prepare
                .permission_grant
                .as_ref()
                .map(|grant| grant.grant_id.clone()),
        })
        .expect("start should record fixed native execution events");
        let replay = start
            .event_replay
            .expect("start receipt should include native event replay");
        assert_eq!(
            replay.schema_version,
            "agentique.nativeRunnerEventReplay.v1"
        );
        assert_eq!(replay.source, "native-event-ledger");
        assert_eq!(replay.native_backed, true);
        assert_eq!(replay.descriptor_only, false);
        assert!(replay.events.len() >= 6);
        assert!(replay
            .events
            .iter()
            .enumerate()
            .all(|(index, event)| event.sequence == index + 1));
        for event_type in [
            "prepare.accepted",
            "approval.pending",
            "start.accepted",
            "adapter.launching",
            "run-folder.written",
            "run.succeeded",
        ] {
            assert!(
                replay
                    .events
                    .iter()
                    .any(|event| event.event_type == event_type),
                "{event_type} should be replayed"
            );
        }
        let replay_text = serde_json::to_string(&replay).expect("replay should serialize");
        assert!(!replay_text.contains(":\\"));
        assert!(!replay_text.contains("/Users/"));
        assert!(!replay_text.contains("/home/"));
        assert!(!replay_text.contains("bearer "));

        let status = agentique_runner_status(RunnerCommandRequest {
            resource_id: "resource.native-event-01".to_string(),
            session_id: "session.native-event-01".to_string(),
            run_id: "run.native-event-01".to_string(),
            command_id: Some("command.status-native-event".to_string()),
            adapter_id: Some("adapter.local-python".to_string()),
            approval_id: None,
            permission_profile_id: Some("permission.local-python.minimal".to_string()),
            permission_grant_id: None,
        })
        .expect("status should replay native events");
        assert_eq!(
            status
                .event_replay
                .as_ref()
                .map(|event_replay| event_replay.events.len()),
            Some(replay.events.len() + 1)
        );

        let logs = agentique_runner_logs(RunnerCommandRequest {
            resource_id: "resource.native-event-01".to_string(),
            session_id: "session.native-event-01".to_string(),
            run_id: "run.native-event-01".to_string(),
            command_id: Some("command.logs-native-event".to_string()),
            adapter_id: Some("adapter.local-python".to_string()),
            approval_id: None,
            permission_profile_id: Some("permission.local-python.minimal".to_string()),
            permission_grant_id: None,
        })
        .expect("logs should replay native events");
        let log_replay = logs.event_replay.expect("logs should include event replay");
        assert!(log_replay
            .events
            .iter()
            .any(|event| event.event_type == "replay.logs"));
    }

    #[test]
    fn native_python_execution_reports_invalid_stdout_nonzero_exit_and_redacted_logs() {
        let invalid = execute_fixed_python_adapter_for_tests(
            "run.native-invalid-json",
            NativeAdapterTestMode::InvalidJson,
        )
        .expect("invalid stdout execution should return a failed receipt");
        assert_eq!(invalid.launched, true);
        assert_eq!(invalid.status, "failed");
        assert_eq!(
            invalid.failure.code.as_deref(),
            Some("native-python.invalid-json")
        );

        let failed = execute_fixed_python_adapter_for_tests(
            "run.native-exit-failure",
            NativeAdapterTestMode::ExitFailure,
        )
        .expect("non-zero exit should return a failed receipt");
        assert_eq!(failed.status, "failed");
        assert_eq!(failed.exit.code, Some(7));

        let secret = execute_fixed_python_adapter_for_tests(
            "run.native-secret",
            NativeAdapterTestMode::Secret,
        )
        .expect("secret mode should still produce a receipt");
        assert_eq!(secret.status, "succeeded");
        let raw_marker = format!("{} {}", "bearer", "abcdefghijklmnop");
        assert!(!secret.stderr_preview.contains(&raw_marker));
        assert!(secret
            .stderr_preview
            .contains("redacted:inline-sensitive-material"));
    }

    #[test]
    fn fixed_python_adapter_manifest_review_is_native_owned_and_redacted() {
        let manifest = fixed_python_adapter_manifest();
        let receipt = review_adapter_manifest(&manifest).expect("fixed manifest should pass");
        assert_eq!(receipt.manifest_id, "manifest.local-python.v1");
        assert_eq!(receipt.adapter_id, "adapter.local-python");
        assert_eq!(receipt.runtime, "python");
        assert_eq!(receipt.support_mode, "locally-runnable");
        assert_eq!(receipt.digest_prefix, "cccccccccccc");
        assert_eq!(receipt.signature_status, "verified");
        assert_eq!(
            receipt.executable_ref,
            "native-bundled-local-python-adapter"
        );
        assert!(!receipt.executable_ref.contains('/') && !receipt.executable_ref.contains('\\'));
    }

    #[test]
    fn adapter_manifest_review_rejects_untrusted_variants() {
        let base = fixed_python_adapter_manifest();
        let cases: Vec<(&str, NativeAdapterManifest)> = vec![
            (
                "unsigned",
                NativeAdapterManifest {
                    signature_status: "missing".to_string(),
                    ..base.clone()
                },
            ),
            (
                "tampered",
                NativeAdapterManifest {
                    digest: "d".repeat(64),
                    ..base.clone()
                },
            ),
            (
                "revoked",
                NativeAdapterManifest {
                    revoked: true,
                    ..base.clone()
                },
            ),
            (
                "wrong-runtime",
                NativeAdapterManifest {
                    runtime: "node".to_string(),
                    ..base.clone()
                },
            ),
            (
                "wrong-support-mode",
                NativeAdapterManifest {
                    support_mode: "handoff-only".to_string(),
                    ..base.clone()
                },
            ),
            (
                "incompatible-platform",
                NativeAdapterManifest {
                    platforms: vec!["linux".to_string()],
                    ..base.clone()
                },
            ),
            (
                "unsafe-executable",
                NativeAdapterManifest {
                    executable_ref: "../adapter.py".to_string(),
                    ..base.clone()
                },
            ),
        ];
        for (name, manifest) in cases {
            assert!(
                review_adapter_manifest(&manifest).is_err(),
                "{name} should fail"
            );
        }
    }

    #[test]
    fn prepare_rejects_caller_supplied_approval_id() {
        let _guard = test_lock().lock().expect("runner test lock");
        reset_runner_records_for_tests();
        let prepared = agentique_runner_prepare(RunnerCommandRequest {
            resource_id: "resource.prepare-blocked-01".to_string(),
            session_id: "session.prepare-blocked-01".to_string(),
            run_id: "run.prepare-blocked-01".to_string(),
            command_id: Some("command.prepare-blocked-01".to_string()),
            adapter_id: Some("adapter.local-python".to_string()),
            approval_id: Some("approval.user-supplied".to_string()),
            permission_profile_id: Some("permission.local-python.minimal".to_string()),
            permission_grant_id: None,
        });
        assert!(prepared.is_err());
    }

    #[test]
    fn start_rejects_unknown_run_missing_or_stale_approval_revoked_adapter_and_broad_profile() {
        let _guard = test_lock().lock().expect("runner test lock");
        reset_runner_records_for_tests();
        let unknown_run = agentique_runner_start(RunnerCommandRequest {
            resource_id: "resource.blocked-01".to_string(),
            session_id: "session.blocked-01".to_string(),
            run_id: "run.unknown-01".to_string(),
            command_id: Some("command.start-unknown".to_string()),
            adapter_id: Some("adapter.local-python".to_string()),
            approval_id: Some("approval.run.unknown-01".to_string()),
            permission_profile_id: Some("permission.local-python.minimal".to_string()),
            permission_grant_id: Some("grant.run.unknown-01".to_string()),
        });
        assert!(unknown_run.is_err());

        let prepare = agentique_runner_prepare(RunnerCommandRequest {
            resource_id: "resource.blocked-01".to_string(),
            session_id: "session.blocked-01".to_string(),
            run_id: "run.blocked-01".to_string(),
            command_id: Some("command.prepare-blocked".to_string()),
            adapter_id: Some("adapter.local-python".to_string()),
            approval_id: None,
            permission_profile_id: Some("permission.local-python.minimal".to_string()),
            permission_grant_id: None,
        })
        .expect("prepare should create a pending run");
        let permission_grant_id = prepare
            .permission_grant
            .as_ref()
            .map(|grant| grant.grant_id.clone());

        let missing_approval = agentique_runner_start(RunnerCommandRequest {
            resource_id: "resource.blocked-01".to_string(),
            session_id: "session.blocked-01".to_string(),
            run_id: "run.blocked-01".to_string(),
            command_id: Some("command.start-missing".to_string()),
            adapter_id: Some("adapter.local-python".to_string()),
            approval_id: None,
            permission_profile_id: Some("permission.local-python.minimal".to_string()),
            permission_grant_id: permission_grant_id.clone(),
        });
        assert!(missing_approval.is_err());

        let broad_profile = agentique_runner_start(RunnerCommandRequest {
            resource_id: "resource.blocked-01".to_string(),
            session_id: "session.blocked-01".to_string(),
            run_id: "run.blocked-01".to_string(),
            command_id: Some("command.start-broad".to_string()),
            adapter_id: Some("adapter.local-python".to_string()),
            approval_id: prepare.approval_id.clone(),
            permission_profile_id: Some("permission.shell.all".to_string()),
            permission_grant_id: permission_grant_id.clone(),
        });
        assert!(broad_profile.is_err());

        let revoked_adapter = agentique_runner_start(RunnerCommandRequest {
            resource_id: "resource.blocked-01".to_string(),
            session_id: "session.blocked-01".to_string(),
            run_id: "run.blocked-01".to_string(),
            command_id: Some("command.start-revoked".to_string()),
            adapter_id: Some("adapter.local-python.revoked".to_string()),
            approval_id: prepare.approval_id.clone(),
            permission_profile_id: Some("permission.local-python.minimal".to_string()),
            permission_grant_id: permission_grant_id.clone(),
        });
        assert!(revoked_adapter.is_err());

        let accepted = agentique_runner_start(RunnerCommandRequest {
            resource_id: "resource.blocked-01".to_string(),
            session_id: "session.blocked-01".to_string(),
            run_id: "run.blocked-01".to_string(),
            command_id: Some("command.start-ok".to_string()),
            adapter_id: Some("adapter.local-python".to_string()),
            approval_id: prepare.approval_id.clone(),
            permission_profile_id: Some("permission.local-python.minimal".to_string()),
            permission_grant_id: permission_grant_id.clone(),
        })
        .expect("first start should consume approval");
        assert_eq!(accepted.state, "succeeded");

        let stale = agentique_runner_start(RunnerCommandRequest {
            resource_id: "resource.blocked-01".to_string(),
            session_id: "session.blocked-01".to_string(),
            run_id: "run.blocked-01".to_string(),
            command_id: Some("command.start-stale".to_string()),
            adapter_id: Some("adapter.local-python".to_string()),
            approval_id: prepare.approval_id,
            permission_profile_id: Some("permission.local-python.minimal".to_string()),
            permission_grant_id,
        });
        assert!(stale.is_err());
    }

    #[test]
    fn native_runner_cancel_timeout_cleanup_recovery() {
        let _guard = test_lock().lock().expect("runner test lock");
        reset_runner_records_for_tests();
        let prepare = agentique_runner_prepare(RunnerCommandRequest {
            resource_id: "resource.cleanup-01".to_string(),
            session_id: "session.cleanup-01".to_string(),
            run_id: "run.cleanup-01".to_string(),
            command_id: Some("command.prepare-cleanup".to_string()),
            adapter_id: Some("adapter.local-python".to_string()),
            approval_id: None,
            permission_profile_id: Some("permission.local-python.minimal".to_string()),
            permission_grant_id: None,
        })
        .expect("prepare should create a cancelable pending native run");

        let cancel = agentique_runner_cancel(RunnerCommandRequest {
            resource_id: "resource.cleanup-01".to_string(),
            session_id: "session.cleanup-01".to_string(),
            run_id: "run.cleanup-01".to_string(),
            command_id: Some("command.cancel-cleanup".to_string()),
            adapter_id: Some("adapter.local-python".to_string()),
            approval_id: prepare.approval_id,
            permission_profile_id: Some("permission.local-python.minimal".to_string()),
            permission_grant_id: prepare
                .permission_grant
                .as_ref()
                .map(|grant| grant.grant_id.clone()),
        })
        .expect("cancel should transition the fixed native lane");
        assert_eq!(cancel.state, "canceled");
        let cancel_cleanup = cancel
            .cleanup_recovery
            .expect("cancel should include cleanup recovery evidence");
        assert_eq!(
            cancel_cleanup.schema_version,
            "agentique.nativeRunnerCleanupRecovery.v1"
        );
        assert_eq!(cancel_cleanup.native_backed, true);
        assert_eq!(cancel_cleanup.descriptor_only, false);
        assert_eq!(cancel_cleanup.process_tree_cleanup, true);
        assert_eq!(cancel_cleanup.orphan_count, 0);
        assert_eq!(cancel_cleanup.cleanup_required, false);
        assert!(cancel
            .event_replay
            .as_ref()
            .expect("cancel should include event replay")
            .events
            .iter()
            .any(|event| event.event_type == "cleanup.completed"));

        let timeout = simulate_native_timeout_for_tests(
            "resource.timeout-01",
            "session.timeout-01",
            "run.timeout-01",
        )
        .expect("timeout helper should record cleanup evidence");
        assert_eq!(timeout.state, "timed-out");
        let timeout_cleanup = timeout
            .cleanup_recovery
            .expect("timeout should include cleanup recovery evidence");
        assert_eq!(timeout_cleanup.transition, "timeout-cleanup");
        assert_eq!(timeout_cleanup.orphan_count, 0);
        assert_eq!(timeout_cleanup.process_tree_cleanup, true);

        create_stale_native_run_for_tests(
            "resource.recovery-01",
            "session.recovery-01",
            "run.recovery-01",
        );
        let recovered_status = agentique_runner_status(RunnerCommandRequest {
            resource_id: "resource.recovery-01".to_string(),
            session_id: "session.recovery-01".to_string(),
            run_id: "run.recovery-01".to_string(),
            command_id: Some("command.status-recovery".to_string()),
            adapter_id: Some("adapter.local-python".to_string()),
            approval_id: None,
            permission_profile_id: Some("permission.local-python.minimal".to_string()),
            permission_grant_id: None,
        })
        .expect("status should recover a stale native run");
        assert_eq!(recovered_status.state, "cleanup-required");
        assert_eq!(
            recovered_status
                .cleanup_recovery
                .as_ref()
                .map(|receipt| receipt.recovery_reason.as_deref()),
            Some(Some("stale-incomplete-run"))
        );

        let cleanup_once = agentique_runner_cleanup(RunnerCommandRequest {
            resource_id: "resource.recovery-01".to_string(),
            session_id: "session.recovery-01".to_string(),
            run_id: "run.recovery-01".to_string(),
            command_id: Some("command.cleanup-recovery".to_string()),
            adapter_id: Some("adapter.local-python".to_string()),
            approval_id: None,
            permission_profile_id: Some("permission.local-python.minimal".to_string()),
            permission_grant_id: None,
        })
        .expect("cleanup should satisfy cleanup-required recovery");
        let cleanup_again = agentique_runner_cleanup(RunnerCommandRequest {
            resource_id: "resource.recovery-01".to_string(),
            session_id: "session.recovery-01".to_string(),
            run_id: "run.recovery-01".to_string(),
            command_id: Some("command.cleanup-recovery-again".to_string()),
            adapter_id: Some("adapter.local-python".to_string()),
            approval_id: None,
            permission_profile_id: Some("permission.local-python.minimal".to_string()),
            permission_grant_id: None,
        })
        .expect("cleanup retry should be idempotent");
        let first = cleanup_once.cleanup_recovery.expect("cleanup receipt");
        let second = cleanup_again
            .cleanup_recovery
            .expect("cleanup retry receipt");
        assert_eq!(first.status, "cleaned-up");
        assert_eq!(first.orphan_count, 0);
        assert_eq!(first.idempotent, true);
        assert_eq!(second.status, first.status);
        assert_eq!(second.receipt_refs, first.receipt_refs);
        let serialized =
            serde_json::to_string(&second).expect("cleanup recovery receipt should serialize");
        assert!(!serialized.contains(":\\"));
        assert!(!serialized.contains("/Users/"));
        assert!(!serialized.contains("/home/"));
        assert!(!serialized.contains("bearer "));
    }

    #[test]
    fn rejects_paths_and_traversal() {
        let windows_like_path = format!("{}:/users/demo", "C");
        for value in [
            windows_like_path.as_str(),
            "../run",
            "run\\demo",
            " run.alpha",
            "run.alpha ",
        ] {
            assert!(validate_opaque_id("runId", value).is_err());
        }
    }

    #[test]
    fn rejects_shell_like_ids() {
        for value in ["powershell", "cmd-run", "python-adapter", "docker-run"] {
            assert!(validate_opaque_id("commandId", value).is_err());
        }
    }
}
