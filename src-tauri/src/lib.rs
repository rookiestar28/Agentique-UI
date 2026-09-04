use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Output, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Manager};

mod native_dag_scheduler;
mod native_rootless_container;
mod native_wasm_sandbox;

#[cfg(target_os = "windows")]
use std::ffi::c_void;
#[cfg(target_os = "windows")]
use std::mem::size_of;
#[cfg(unix)]
use std::os::unix::process::CommandExt;
#[cfg(target_os = "windows")]
use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
#[cfg(unix)]
use std::sync::atomic::AtomicI32;
#[cfg(target_os = "windows")]
use windows_sys::Win32::Foundation::HANDLE;
#[cfg(target_os = "windows")]
use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, JobObjectBasicAccountingInformation,
    JobObjectExtendedLimitInformation, QueryInformationJobObject, SetInformationJobObject,
    TerminateJobObject, JOBOBJECT_BASIC_ACCOUNTING_INFORMATION,
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
};

const RUNNER_PENDING_APPROVAL_REASON: &str =
    "native-owned pending run record created for the fixed local adapter lane";
const RUNNER_NATIVE_EXECUTION_REASON: &str =
    "approved fixed adapter lane executed through its native-controlled helper";
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
const APPROVED_ADAPTER_PERMISSION_CEILING: [&str; 3] = [
    "files:workspace-runs",
    "subprocess:fixed-adapter-only",
    "artifact-retention:7d",
];
const APPROVED_ADAPTER_CLEANUP_POLICY: &str = "native-process-tree-required";
const APPROVED_PERMISSION_PROFILE_ID: &str = "permission.local-python.minimal";
const NODE_ADAPTER_ID: &str = "adapter.local-node";
const REVOKED_NODE_ADAPTER_ID: &str = "adapter.local-node.revoked";
const NODE_ADAPTER_MANIFEST_ID: &str = "manifest.local-node.v1";
const NODE_ADAPTER_RUNTIME: &str = "node";
const NODE_ADAPTER_DIGEST: &str =
    "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const NODE_ADAPTER_EXECUTABLE_REF: &str = "native-bundled-local-node-adapter";
const NODE_ADAPTER_PERMISSION_PROFILE_ID: &str = "permission.local-node.minimal";
const WASM_ADAPTER_RUNTIME: &str = "wasm";
const WASM_ADAPTER_EXECUTABLE_REF: &str = "native-embedded-local-wasm-module";
const WASM_ADAPTER_CLEANUP_POLICY: &str = "in-process-zero-handles-required";
const WASM_ADAPTER_PERMISSION_CEILING: [&str; 1] = ["artifact-retention:7d"];
const CONTAINER_ADAPTER_RUNTIME: &str = "container";
const CONTAINER_ADAPTER_EXECUTABLE_REF: &str = "native-fixed-rootless-container-runtime";
const CONTAINER_ADAPTER_CLEANUP_POLICY: &str = "rootless-container-zero-residuals-required";
const CONTAINER_ADAPTER_PERMISSION_CEILING: [&str; 2] =
    ["subprocess:fixed-adapter-only", "artifact-retention:7d"];
const RUNNER_PENDING_APPROVAL_STATE: &str = "pending-approval";
const RUNNER_NATIVE_SUCCEEDED_STATE: &str = "succeeded";
const RUNNER_NATIVE_FAILED_STATE: &str = "failed";
const RUNNER_NATIVE_CANCELED_STATE: &str = "canceled";
const RUNNER_NATIVE_TIMED_OUT_STATE: &str = "timed-out";
const RUNNER_NATIVE_CLEANUP_REQUIRED_STATE: &str = "cleanup-required";
const RUNNER_NATIVE_CLEANED_UP_STATE: &str = "cleaned-up";
const RUNNER_TRANSITION_GATE: &str = "fixed-lane-transition";
const MAX_NATIVE_LOG_BYTES: usize = 262_144;
const MAX_NATIVE_RUN_FILE_BYTES: u64 = 1_048_576;
const MAX_NATIVE_RUN_TOTAL_BYTES: u64 = 4_194_304;
const MAX_NATIVE_RUN_RECEIPT_BYTES: u64 = 65_536;
const MAX_NATIVE_EVENT_COUNT: usize = 64;
const MAX_NATIVE_DURABLE_EVENT_BYTES: u64 = 8_192;
const NATIVE_RUN_REGISTRY_SCHEMA: &str = "agentique.nativeRunRegistryRecord.v1";
const MAX_NATIVE_RUN_REGISTRY_RECORDS: usize = 64;
const MAX_NATIVE_RUN_REGISTRY_RECORD_BYTES: u64 = 8_192;
const NATIVE_RUNNER_EVENT_NAME: &str = "agentique://native-runner-event";
const NATIVE_EVENT_REPLAY_SCHEMA: &str = "agentique.nativeRunnerEventReplay.v1";
const NATIVE_DURABLE_EVENT_SCHEMA: &str = "agentique.nativeRunnerDurableEvent.v1";
const NATIVE_PERMISSION_GRANT_SCHEMA: &str = "agentique.nativeRunnerPermissionGrantReceipt.v1";
const NATIVE_PERMISSION_PREFLIGHT_SCHEMA: &str =
    "agentique.nativeRunnerPermissionPreflightReceipt.v1";
const NATIVE_APPROVAL_PROPOSAL_SCHEMA: &str = "agentique.nativeApprovalProposal.v1";
const NATIVE_APPROVAL_DECISION_SCHEMA: &str = "agentique.nativeApprovalDecision.v1";
const NATIVE_ARTIFACT_EVIDENCE_SCHEMA: &str = "agentique.nativeRunArtifactEvidence.v1";
const NATIVE_CLEANUP_RECOVERY_SCHEMA: &str = "agentique.nativeRunnerCleanupRecovery.v2";
const NATIVE_PERMISSION_GRANT_TTL_SECONDS: u64 = 3_600;
const NATIVE_APPROVAL_PROPOSAL_TTL_SECONDS: u64 = 900;
const NATIVE_RUN_TIMEOUT: Duration = Duration::from_secs(30);
const NATIVE_RUN_POLL_INTERVAL: Duration = Duration::from_millis(10);
const NATIVE_PRODUCT_PROJECTION_SCHEMA: &str = "agentique.nativeProductResultProjection.v1";
const NATIVE_PRODUCT_PROJECTION_RECEIPT_SCHEMA: &str =
    "agentique.nativeProductResultProjectionReceipt.v1";
const MAX_NATIVE_PRODUCT_PROJECTION_BYTES: u64 = 2_097_152;
const MAX_NATIVE_PRODUCT_PROJECTION_RUNS: usize = 25;
const NATIVE_WORKING_SET_SCHEMA: &str = "agentique.nativeWorkingSetCheckpoint.v1";
const NATIVE_WORKING_SET_RECEIPT_SCHEMA: &str = "agentique.nativeWorkingSetCheckpointReceipt.v1";
const NATIVE_CHECKPOINT_HISTORY_SCHEMA: &str = "agentique.nativeCheckpointHistory.v1";
const NATIVE_TIME_TRAVEL_REQUEST_SCHEMA: &str = "agentique.nativeTimeTravelPrepareRequest.v1";
const NATIVE_TIME_TRAVEL_RECEIPT_SCHEMA: &str = "agentique.nativeTimeTravelPrepareReceipt.v1";
const NATIVE_TIME_TRAVEL_LINEAGE_SCHEMA: &str = "agentique.nativeTimeTravelLineage.v1";
const NATIVE_TIME_TRAVEL_CLEANUP_SCHEMA: &str = "agentique.nativeTimeTravelCleanupRequired.v1";
const MAX_NATIVE_WORKING_SET_FILES: usize = 64;
const MAX_NATIVE_WORKING_SET_FILE_BYTES: u64 = 262_144;
const MAX_NATIVE_WORKING_SET_TOTAL_BYTES: u64 = 2_097_152;
const MAX_NATIVE_WORKING_SET_DEPTH: usize = 8;
const MAX_NATIVE_WORKING_SET_PATH_CHARS: usize = 180;
const MAX_NATIVE_WORKING_SET_MANIFEST_BYTES: usize = 65_536;
const MAX_NATIVE_WORKING_SET_GENERATIONS: usize = 8;

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

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NativeTimeTravelPrepareRequest {
    schema_version: String,
    source_resource_id: String,
    source_session_id: String,
    source_run_id: String,
    target_resource_id: String,
    target_session_id: String,
    target_run_id: String,
    generation_digest: String,
    mode: String,
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
    product_projection: Option<NativeProductProjectionReceipt>,
    working_set_checkpoint: Option<NativeWorkingSetCheckpointReceipt>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum NativeRunState {
    PendingApproval,
    Running,
    Canceling,
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
            NativeRunState::Canceling => "canceling",
            NativeRunState::Succeeded => RUNNER_NATIVE_SUCCEEDED_STATE,
            NativeRunState::Failed => RUNNER_NATIVE_FAILED_STATE,
            NativeRunState::Canceled => RUNNER_NATIVE_CANCELED_STATE,
            NativeRunState::TimedOut => RUNNER_NATIVE_TIMED_OUT_STATE,
            NativeRunState::CleanupRequired => RUNNER_NATIVE_CLEANUP_REQUIRED_STATE,
            NativeRunState::CleanedUp => RUNNER_NATIVE_CLEANED_UP_STATE,
        }
    }

    fn from_registry(value: &str) -> Option<Self> {
        match value {
            RUNNER_PENDING_APPROVAL_STATE => Some(Self::PendingApproval),
            "running" => Some(Self::Running),
            "canceling" => Some(Self::Canceling),
            RUNNER_NATIVE_SUCCEEDED_STATE => Some(Self::Succeeded),
            RUNNER_NATIVE_FAILED_STATE => Some(Self::Failed),
            RUNNER_NATIVE_CANCELED_STATE => Some(Self::Canceled),
            RUNNER_NATIVE_TIMED_OUT_STATE => Some(Self::TimedOut),
            RUNNER_NATIVE_CLEANUP_REQUIRED_STATE => Some(Self::CleanupRequired),
            RUNNER_NATIVE_CLEANED_UP_STATE => Some(Self::CleanedUp),
            _ => None,
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
    permission_grant_id: Option<String>,
    state: NativeRunState,
    approval_consumed: bool,
    execution: Option<NativeAdapterExecutionReceipt>,
    cleanup_recovery: Option<NativeRunnerCleanupRecoveryReceipt>,
    product_projection: Option<NativeProductProjectionReceipt>,
    working_set_checkpoint: Option<NativeWorkingSetCheckpointReceipt>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NativeDurableRunRegistryRecord {
    schema_version: String,
    sequence: usize,
    resource_id: String,
    session_id: String,
    run_id: String,
    adapter_id: String,
    permission_profile_id: String,
    adapter_manifest_id: String,
    adapter_manifest_digest: String,
    state: String,
    redacted: bool,
    replays_external_effects: bool,
}

#[derive(Debug, Clone)]
struct NativeCoordinatorRecord {
    address_key: String,
    cancel_requested: Arc<AtomicBool>,
    worker_active: Arc<AtomicBool>,
    terminal_intent: Arc<Mutex<Option<NativeRunState>>>,
    process_tree_supervisor: Option<Arc<NativeProcessTreeSupervisor>>,
}

#[derive(Debug, Clone)]
struct NativeProcessCleanupObservation {
    process_tree_cleanup: bool,
    orphan_count: Option<usize>,
    cleanup_required: bool,
    evidence_code: String,
}

impl NativeProcessCleanupObservation {
    fn verified_zero(evidence_code: &str) -> Self {
        Self {
            process_tree_cleanup: true,
            orphan_count: Some(0),
            cleanup_required: false,
            evidence_code: safe_event_token(evidence_code),
        }
    }

    fn unverified(evidence_code: &str) -> Self {
        Self {
            process_tree_cleanup: false,
            orphan_count: None,
            cleanup_required: true,
            evidence_code: safe_event_token(evidence_code),
        }
    }
}

#[derive(Debug)]
struct NativeProcessTreeSupervisor {
    #[cfg(target_os = "windows")]
    job: OwnedHandle,
    #[cfg(unix)]
    process_group_id: AtomicI32,
}

impl NativeProcessTreeSupervisor {
    #[cfg(target_os = "windows")]
    fn new() -> Result<Self, String> {
        let raw_job = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
        if raw_job.is_null() {
            return Err(format!(
                "native process-tree supervisor creation failed: {}",
                std::io::Error::last_os_error()
            ));
        }
        let job = unsafe { OwnedHandle::from_raw_handle(raw_job as _) };
        let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        let configured = unsafe {
            SetInformationJobObject(
                job.as_raw_handle() as HANDLE,
                JobObjectExtendedLimitInformation,
                &limits as *const _ as *const c_void,
                size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            )
        };
        if configured == 0 {
            return Err(format!(
                "native process-tree supervisor configuration failed: {}",
                std::io::Error::last_os_error()
            ));
        }
        Ok(Self { job })
    }

    #[cfg(unix)]
    fn new() -> Result<Self, String> {
        Ok(Self {
            process_group_id: AtomicI32::new(0),
        })
    }

    #[cfg(not(any(target_os = "windows", unix)))]
    fn new() -> Result<Self, String> {
        Err("native process-tree supervision is not implemented for this platform.".to_string())
    }

    #[cfg(target_os = "windows")]
    fn assign_child(&self, child: &Child) -> Result<(), String> {
        let assigned = unsafe {
            AssignProcessToJobObject(
                self.job.as_raw_handle() as HANDLE,
                child.as_raw_handle() as HANDLE,
            )
        };
        if assigned == 0 {
            return Err(format!(
                "fixed adapter process-tree assignment failed: {}",
                std::io::Error::last_os_error()
            ));
        }
        Ok(())
    }

    #[cfg(unix)]
    fn assign_child(&self, child: &Child) -> Result<(), String> {
        let child_id = i32::try_from(child.id()).map_err(|_| {
            "fixed adapter process id exceeds the native process-group range.".to_string()
        })?;
        if child_id <= 0 {
            return Err("fixed adapter process-group identity must be positive.".to_string());
        }
        let observed_group = unsafe { libc::getpgid(child_id) };
        if observed_group != child_id {
            return Err(
                "fixed adapter did not enter its dedicated native process group.".to_string(),
            );
        }
        self.process_group_id
            .compare_exchange(0, child_id, Ordering::AcqRel, Ordering::Acquire)
            .map_err(|_| {
                "fixed adapter process-group ownership was already assigned.".to_string()
            })?;
        Ok(())
    }

    #[cfg(not(any(target_os = "windows", unix)))]
    fn assign_child(&self, _child: &Child) -> Result<(), String> {
        Err("native process-tree assignment is not implemented for this platform.".to_string())
    }

    #[cfg(target_os = "windows")]
    fn active_process_count(&self) -> Result<usize, String> {
        let mut accounting = JOBOBJECT_BASIC_ACCOUNTING_INFORMATION::default();
        let queried = unsafe {
            QueryInformationJobObject(
                self.job.as_raw_handle() as HANDLE,
                JobObjectBasicAccountingInformation,
                &mut accounting as *mut _ as *mut c_void,
                size_of::<JOBOBJECT_BASIC_ACCOUNTING_INFORMATION>() as u32,
                std::ptr::null_mut(),
            )
        };
        if queried == 0 {
            return Err(format!(
                "native process-tree accounting query failed: {}",
                std::io::Error::last_os_error()
            ));
        }
        Ok(accounting.ActiveProcesses as usize)
    }

    #[cfg(unix)]
    fn active_process_count(&self) -> Result<usize, String> {
        let process_group_id = self.owned_process_group_id()?;
        let probed = unsafe { libc::killpg(process_group_id, 0) };
        if probed == 0 {
            return Ok(1);
        }
        match std::io::Error::last_os_error().raw_os_error() {
            Some(libc::ESRCH) => Ok(0),
            _ => Err("native Unix process-group probe failed.".to_string()),
        }
    }

    #[cfg(not(any(target_os = "windows", unix)))]
    fn active_process_count(&self) -> Result<usize, String> {
        Err("native process-tree accounting is not implemented for this platform.".to_string())
    }

    #[cfg(target_os = "windows")]
    fn terminate_and_observe(&self, child: &mut Child) -> NativeProcessCleanupObservation {
        match self.active_process_count() {
            Ok(0) => return NativeProcessCleanupObservation::verified_zero("windows-job-empty"),
            Ok(_) => {}
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                return NativeProcessCleanupObservation::unverified("windows-job-query-failed");
            }
        }
        let terminated = unsafe { TerminateJobObject(self.job.as_raw_handle() as HANDLE, 1) };
        let _ = child.wait();
        if terminated == 0 {
            return NativeProcessCleanupObservation::unverified("windows-job-terminate-failed");
        }
        self.observe_zero_after_drain("windows-job-terminated")
    }

    #[cfg(unix)]
    fn terminate_and_observe(&self, child: &mut Child) -> NativeProcessCleanupObservation {
        match self.active_process_count() {
            Ok(0) => {
                let _ = child.wait();
                self.clear_process_group_identity();
                return NativeProcessCleanupObservation::verified_zero("unix-process-group-empty");
            }
            Ok(_) => {}
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                return NativeProcessCleanupObservation::unverified(
                    "unix-process-group-probe-failed",
                );
            }
        }
        let process_group_id = match self.owned_process_group_id() {
            Ok(value) => value,
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                return NativeProcessCleanupObservation::unverified(
                    "unix-process-group-identity-missing",
                );
            }
        };
        let terminated = unsafe { libc::killpg(process_group_id, libc::SIGKILL) };
        let _ = child.wait();
        if terminated != 0 && std::io::Error::last_os_error().raw_os_error() != Some(libc::ESRCH) {
            return NativeProcessCleanupObservation::unverified(
                "unix-process-group-terminate-failed",
            );
        }
        self.observe_zero_after_drain("unix-process-group-terminated")
    }

    #[cfg(not(any(target_os = "windows", unix)))]
    fn terminate_and_observe(&self, child: &mut Child) -> NativeProcessCleanupObservation {
        let _ = child.kill();
        let _ = child.wait();
        NativeProcessCleanupObservation::unverified("platform-process-tree-unsupported")
    }

    #[cfg(target_os = "windows")]
    fn observe_after_parent_exit(&self) -> NativeProcessCleanupObservation {
        match self.active_process_count() {
            Ok(0) => NativeProcessCleanupObservation::verified_zero("windows-job-natural-exit"),
            Ok(_) => {
                let terminated =
                    unsafe { TerminateJobObject(self.job.as_raw_handle() as HANDLE, 1) };
                if terminated == 0 {
                    NativeProcessCleanupObservation::unverified("windows-job-terminate-failed")
                } else {
                    self.observe_zero_after_drain("windows-job-descendant-drained")
                }
            }
            Err(_) => NativeProcessCleanupObservation::unverified("windows-job-query-failed"),
        }
    }

    #[cfg(unix)]
    fn observe_after_parent_exit(&self) -> NativeProcessCleanupObservation {
        match self.active_process_count() {
            Ok(0) => {
                self.clear_process_group_identity();
                NativeProcessCleanupObservation::verified_zero("unix-process-group-natural-exit")
            }
            Ok(_) => {
                let process_group_id = match self.owned_process_group_id() {
                    Ok(value) => value,
                    Err(_) => {
                        return NativeProcessCleanupObservation::unverified(
                            "unix-process-group-identity-missing",
                        )
                    }
                };
                let terminated = unsafe { libc::killpg(process_group_id, libc::SIGKILL) };
                if terminated != 0
                    && std::io::Error::last_os_error().raw_os_error() != Some(libc::ESRCH)
                {
                    NativeProcessCleanupObservation::unverified(
                        "unix-process-group-terminate-failed",
                    )
                } else {
                    self.observe_zero_after_drain("unix-process-group-descendant-drained")
                }
            }
            Err(_) => {
                NativeProcessCleanupObservation::unverified("unix-process-group-probe-failed")
            }
        }
    }

    #[cfg(not(any(target_os = "windows", unix)))]
    fn observe_after_parent_exit(&self) -> NativeProcessCleanupObservation {
        NativeProcessCleanupObservation::unverified("platform-process-tree-unsupported")
    }

    #[cfg(target_os = "windows")]
    fn observe_zero_after_drain(&self, evidence_code: &str) -> NativeProcessCleanupObservation {
        let deadline = Instant::now() + Duration::from_secs(2);
        loop {
            match self.active_process_count() {
                Ok(0) => return NativeProcessCleanupObservation::verified_zero(evidence_code),
                Ok(_) if Instant::now() < deadline => thread::sleep(NATIVE_RUN_POLL_INTERVAL),
                Ok(_) => {
                    return NativeProcessCleanupObservation::unverified("windows-job-drain-timeout")
                }
                Err(_) => {
                    return NativeProcessCleanupObservation::unverified("windows-job-query-failed")
                }
            }
        }
    }

    #[cfg(unix)]
    fn observe_zero_after_drain(&self, evidence_code: &str) -> NativeProcessCleanupObservation {
        let deadline = Instant::now() + Duration::from_secs(2);
        loop {
            match self.active_process_count() {
                Ok(0) => {
                    self.clear_process_group_identity();
                    return NativeProcessCleanupObservation::verified_zero(evidence_code);
                }
                Ok(_) if Instant::now() < deadline => thread::sleep(NATIVE_RUN_POLL_INTERVAL),
                Ok(_) => {
                    return NativeProcessCleanupObservation::unverified(
                        "unix-process-group-drain-timeout",
                    )
                }
                Err(_) => {
                    return NativeProcessCleanupObservation::unverified(
                        "unix-process-group-probe-failed",
                    )
                }
            }
        }
    }

    #[cfg(unix)]
    fn owned_process_group_id(&self) -> Result<libc::pid_t, String> {
        let process_group_id = self.process_group_id.load(Ordering::Acquire);
        if process_group_id <= 0 {
            return Err("native Unix process-group identity is unavailable.".to_string());
        }
        Ok(process_group_id)
    }

    #[cfg(unix)]
    fn clear_process_group_identity(&self) {
        self.process_group_id.store(0, Ordering::Release);
    }
}

#[cfg(unix)]
impl Drop for NativeProcessTreeSupervisor {
    fn drop(&mut self) {
        let process_group_id = self.process_group_id.swap(0, Ordering::AcqRel);
        if process_group_id > 0 {
            // CRITICAL: the dedicated group is native-owned. Dropping live supervision must kill
            // the group; signaling zero or a caller-controlled id could affect the host process.
            let _ = unsafe { libc::killpg(process_group_id, libc::SIGKILL) };
        }
    }
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
    proposal_id: String,
    proposal_digest: String,
    decision_id: String,
    actor_id: String,
    grant_id: String,
    revoked: bool,
    consumed: bool,
    expires_at_epoch_seconds: u64,
}

#[derive(Debug, Clone)]
struct NativeApprovalProposalRecord {
    resource_id: String,
    session_id: String,
    run_id: String,
    adapter_id: String,
    runtime_id: String,
    permission_profile_id: String,
    adapter_manifest_id: String,
    adapter_manifest_digest: String,
    proposal_id: String,
    proposal_digest: String,
    action_id: String,
    target_refs: Vec<String>,
    risk: String,
    capability_ceiling: Vec<String>,
    distribution_mode: String,
    abort_path: String,
    time_travel_lineage: Option<NativeApprovalTimeTravelLineage>,
    status: String,
    actor_id: Option<String>,
    decision_id: Option<String>,
    created_at_epoch_seconds: u64,
    expires_at_epoch_seconds: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NativeApprovalDecisionRequest {
    resource_id: String,
    session_id: String,
    run_id: String,
    proposal_id: String,
    proposal_digest: String,
    decision: String,
    actor_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeApprovalProposalReceipt {
    schema_version: String,
    proposal_id: String,
    proposal_digest: String,
    status: String,
    policy_owner: String,
    presentation_owner: String,
    resource_id: String,
    session_id: String,
    run_id: String,
    adapter_id: String,
    runtime_id: String,
    manifest_digest_prefix: String,
    action_id: String,
    target_refs: Vec<String>,
    risk: String,
    capability_ceiling: Vec<String>,
    distribution_mode: String,
    abort_path: String,
    time_travel_lineage: Option<NativeApprovalTimeTravelLineage>,
    created_at_epoch_seconds: u64,
    expires_at_epoch_seconds: u64,
    redacted: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeApprovalDecisionReceipt {
    schema_version: String,
    decision_id: String,
    proposal_id: String,
    proposal_digest: String,
    decision: String,
    actor_id: String,
    explicit_user_action: bool,
    permission_grant: Option<NativePermissionGrantReceipt>,
    redacted: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativePermissionGrantReceipt {
    schema_version: String,
    grant_id: String,
    proposal_id: String,
    proposal_digest_prefix: String,
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

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NativeRunnerEventReceipt {
    schema_version: String,
    id: String,
    sequence: usize,
    resource_id: String,
    session_id: String,
    run_id: String,
    event_type: String,
    phase: String,
    occurred_at_epoch_ms: u128,
    label: String,
    details: NativeRunnerEventDetails,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
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

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NativeDurableEventRecord {
    schema_version: String,
    resource_id: String,
    session_id: String,
    run_id: String,
    redacted: bool,
    replays_external_effects: bool,
    event: NativeRunnerEventReceipt,
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
    permission_profile_id: String,
    permission_ceiling: Vec<String>,
    timeout_seconds: u64,
    cleanup_policy: String,
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
    permission_profile_id: String,
    permission_ceiling: Vec<String>,
    timeout_seconds: u64,
    cleanup_policy: String,
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

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct NativeRunFolderIntegrityEntry {
    path: String,
    bytes: u64,
    content_digest: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct NativeRunFolderWriteReceipt {
    schema_version: String,
    run_id: String,
    root_ref: String,
    committed: bool,
    redacted: bool,
    digest_algorithm: String,
    entries: Vec<NativeRunFolderIntegrityEntry>,
    mutable_refs: Vec<String>,
    file_count: usize,
    total_bytes: u64,
    reproducibility_digest: String,
    receipt_ref: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeProductProjectionReceipt {
    schema_version: String,
    resource_id: String,
    session_id: String,
    run_id: String,
    candidate_digest: String,
    state: String,
    committed: bool,
    idempotent: bool,
    generation_ref: String,
    pointer_ref: String,
    artifact_refs: Vec<String>,
    recovery_classification: String,
    redacted: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeWorkingSetManifestEntry {
    path: String,
    bytes: u64,
    digest: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeWorkingSetManifest {
    schema_version: String,
    scope_id: String,
    file_count: usize,
    total_bytes: u64,
    entries: Vec<NativeWorkingSetManifestEntry>,
    encrypted_at_rest: bool,
    replays_external_effects: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeWorkingSetCheckpointReceipt {
    schema_version: String,
    scope_id: String,
    generation_digest: String,
    committed: bool,
    idempotent: bool,
    restored: bool,
    file_count: usize,
    total_bytes: u64,
    generation_ref: String,
    pointer_ref: String,
    root_ref: String,
    encrypted_at_rest: bool,
    replays_external_effects: bool,
    redacted: bool,
}

#[derive(Debug, Clone)]
struct NativeValidatedWorkingSetGeneration {
    generation_digest: String,
    manifest: NativeWorkingSetManifest,
    files: Vec<(String, Vec<u8>)>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NativeTimeTravelLineage {
    schema_version: String,
    resource_id: String,
    session_id: String,
    source_run_id: String,
    target_run_id: String,
    mode: String,
    source_generation_digest: String,
    replays_external_effects: bool,
    redacted: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeApprovalTimeTravelLineage {
    mode: String,
    source_run_id: String,
    source_generation_digest: String,
    target_generation_digest: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeCheckpointGenerationSummary {
    generation_digest: String,
    current: bool,
    file_count: usize,
    total_bytes: u64,
    generation_ref: String,
    valid: bool,
    eligible: bool,
    redacted: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeCheckpointHistoryReceipt {
    schema_version: String,
    resource_id: String,
    session_id: String,
    run_id: String,
    generation_count: usize,
    generations: Vec<NativeCheckpointGenerationSummary>,
    includes_content: bool,
    encrypted_at_rest: bool,
    redacted: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeTimeTravelPrepareReceipt {
    schema_version: String,
    resource_id: String,
    session_id: String,
    source_run_id: String,
    target_run_id: String,
    mode: String,
    selected_generation_digest: String,
    source_generation_digest: String,
    source_generation_ref: String,
    target_root_ref: String,
    lineage_ref: String,
    state: String,
    prepared: bool,
    source_immutable: bool,
    requires_fresh_approval: bool,
    will_spawn_process: bool,
    replays_external_effects: bool,
    file_count: usize,
    total_bytes: u64,
    redacted: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeTimeTravelCleanupRequiredEvidence {
    schema_version: String,
    resource_id: String,
    session_id: String,
    source_run_id: String,
    target_run_id: String,
    source_generation_digest: String,
    state: String,
    reason_code: String,
    requires_manual_cleanup: bool,
    will_spawn_process: bool,
    replays_external_effects: bool,
    redacted: bool,
}

#[cfg_attr(not(test), allow(dead_code))]
#[derive(Clone, Copy, PartialEq, Eq)]
enum NativeTimeTravelFault {
    None,
    AfterStaging,
    CleanupFailure,
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

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
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
    orphan_count: Option<usize>,
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
    module_digest: Option<String>,
    module_bytes: Option<usize>,
    import_count: Option<usize>,
    result: Option<i32>,
    fuel_budget: Option<u64>,
    fuel_consumed: Option<u64>,
    memory_limit_bytes: Option<usize>,
    stack_limit_bytes: Option<usize>,
    container_runtime: Option<String>,
    container_rootless: Option<bool>,
    container_image_digest: Option<String>,
    container_image_id: Option<String>,
    container_cleanup_verified: Option<bool>,
    container_residual_count: Option<usize>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum NativeAdapterTestMode {
    Success,
    Secret,
    InvalidJson,
    ExitFailure,
    Sleep,
    DescendantSleep,
    DescendantExit,
}

fn native_adapter_mode_for_host() -> NativeAdapterTestMode {
    #[cfg(debug_assertions)]
    {
        // CRITICAL: only the debug host may select these fixed test adapters. Accepting a
        // renderer-provided mode would expose process-selection authority to web content.
        return debug_native_adapter_mode(
            std::env::var("AGENTIQUE_E2E_ADAPTER_MODE").ok().as_deref(),
        );
    }
    #[cfg(not(debug_assertions))]
    {
        NativeAdapterTestMode::Success
    }
}

#[cfg(debug_assertions)]
fn debug_native_adapter_mode(value: Option<&str>) -> NativeAdapterTestMode {
    match value {
        Some("sleep") => NativeAdapterTestMode::Sleep,
        Some("exit-failure") => NativeAdapterTestMode::ExitFailure,
        _ => NativeAdapterTestMode::Success,
    }
}

fn native_storage_root_for_host(default_root: PathBuf) -> PathBuf {
    #[cfg(debug_assertions)]
    {
        // CRITICAL: this host-only override confines E2E durable state to an isolated root.
        // Keep release builds on the OS app-data directory and never accept a renderer path.
        if let Some(candidate) = std::env::var_os("AGENTIQUE_E2E_APP_DATA_ROOT").map(PathBuf::from)
        {
            if candidate.is_absolute()
                && !candidate
                    .components()
                    .any(|component| matches!(component, std::path::Component::ParentDir))
            {
                return candidate;
            }
        }
    }
    default_root
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let _ = native_app_handle().set(app.handle().clone());
            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|error| format!("failed to resolve native app data directory: {error}"))?;
            let _ = native_storage_root().set(native_storage_root_for_host(app_data_dir));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            agentique_runner_prepare,
            agentique_runner_approval_proposal,
            agentique_runner_decide_approval,
            agentique_runner_start,
            agentique_runner_revoke_permission,
            agentique_runner_cancel,
            agentique_runner_status,
            agentique_runner_logs,
            agentique_runner_artifacts,
            agentique_runner_cleanup,
            agentique_runner_checkpoint_history,
            agentique_runner_time_travel_prepare,
            agentique_scheduler_start,
            agentique_scheduler_status,
            agentique_scheduler_cancel,
            agentique_scheduler_resume
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Agentique UI");
}

#[tauri::command]
fn agentique_scheduler_start(
    request: native_dag_scheduler::NativeDagStartRequest,
) -> Result<native_dag_scheduler::NativeDagWorkflowReceipt, String> {
    native_dag_scheduler::agentique_scheduler_start(request)
}

#[tauri::command]
fn agentique_scheduler_status(
    request: native_dag_scheduler::NativeDagCommandRequest,
) -> Result<native_dag_scheduler::NativeDagWorkflowReceipt, String> {
    native_dag_scheduler::agentique_scheduler_status(request)
}

#[tauri::command]
fn agentique_scheduler_cancel(
    request: native_dag_scheduler::NativeDagCommandRequest,
) -> Result<native_dag_scheduler::NativeDagWorkflowReceipt, String> {
    native_dag_scheduler::agentique_scheduler_cancel(request)
}

#[tauri::command]
fn agentique_scheduler_resume(
    request: native_dag_scheduler::NativeDagResumeRequest,
) -> Result<native_dag_scheduler::NativeDagWorkflowReceipt, String> {
    native_dag_scheduler::agentique_scheduler_resume(request)
}

#[tauri::command]
fn agentique_runner_checkpoint_history(
    request: RunnerCommandRequest,
) -> Result<NativeCheckpointHistoryReceipt, String> {
    validate_runner_request(&request)?;
    review_native_time_travel_source(&request)?;
    let scope_dir = native_working_set_scope_dir(&request.run_id)?;
    let checkpoint_root = scope_dir.join("checkpoints");
    let current_digest = read_native_working_set_pointer(&checkpoint_root.join("current.json"))?
        .ok_or_else(|| "native checkpoint history has no authoritative generation.".to_string())?;
    let generations_root = checkpoint_root.join("generations");
    reject_native_link(&generations_root)?;
    let mut digests = fs::read_dir(&generations_root)
        .map_err(|error| format!("failed to enumerate native checkpoint history: {error}"))?
        .map(|entry| {
            entry
                .map_err(|error| format!("failed to enumerate native checkpoint history: {error}"))
                .and_then(|entry| {
                    let file_type = entry.file_type().map_err(|error| {
                        format!("failed to inspect native checkpoint history entry: {error}")
                    })?;
                    if !file_type.is_dir() {
                        return Err(
                            "native checkpoint history accepts generation directories only."
                                .to_string(),
                        );
                    }
                    entry.file_name().into_string().map_err(|_| {
                        "native checkpoint history generation id is not UTF-8.".to_string()
                    })
                })
        })
        .collect::<Result<Vec<_>, _>>()?;
    digests.sort();
    if digests.is_empty() || digests.len() > MAX_NATIVE_WORKING_SET_GENERATIONS {
        return Err("native checkpoint history count is outside policy.".to_string());
    }
    let mut generations = Vec::with_capacity(digests.len());
    for digest in digests {
        let validated = load_validated_native_working_set_generation(&request.run_id, &digest)?;
        generations.push(NativeCheckpointGenerationSummary {
            generation_digest: validated.generation_digest.clone(),
            current: digest == current_digest,
            file_count: validated.manifest.file_count,
            total_bytes: validated.manifest.total_bytes,
            generation_ref: format!(
                "working-sets/{}/checkpoints/generations/{digest}",
                request.run_id
            ),
            valid: true,
            eligible: true,
            redacted: true,
        });
    }
    if generations.iter().filter(|entry| entry.current).count() != 1 {
        return Err(
            "native checkpoint history current authority is missing or ambiguous.".to_string(),
        );
    }
    Ok(NativeCheckpointHistoryReceipt {
        schema_version: NATIVE_CHECKPOINT_HISTORY_SCHEMA.to_string(),
        resource_id: request.resource_id,
        session_id: request.session_id,
        run_id: request.run_id,
        generation_count: generations.len(),
        generations,
        includes_content: false,
        encrypted_at_rest: false,
        redacted: true,
    })
}

#[tauri::command]
fn agentique_runner_time_travel_prepare(
    request: NativeTimeTravelPrepareRequest,
) -> Result<NativeTimeTravelPrepareReceipt, String> {
    prepare_native_time_travel_with_fault(request, NativeTimeTravelFault::None)
}

fn prepare_native_time_travel_with_fault(
    request: NativeTimeTravelPrepareRequest,
    fault: NativeTimeTravelFault,
) -> Result<NativeTimeTravelPrepareReceipt, String> {
    validate_native_time_travel_request(&request)?;
    let source_request = native_time_travel_source_request(&request)?;
    review_native_time_travel_source(&source_request)?;
    let validated = load_validated_native_working_set_generation(
        &request.source_run_id,
        &request.generation_digest,
    )?;
    let target_scope = native_working_set_scope_dir(&request.target_run_id)?;
    if target_scope.exists()
        || native_run_registry_dir(&request.target_run_id)?.exists()
        || runner_records()
            .lock()
            .map_err(|_| "native runner record store is unavailable.".to_string())?
            .contains_key(&request.target_run_id)
    {
        return Err("time-travel target run already has native authority.".to_string());
    }
    let working_root = target_scope
        .parent()
        .ok_or_else(|| "time-travel working-set parent is unavailable.".to_string())?;
    fs::create_dir_all(working_root)
        .map_err(|error| format!("failed to create time-travel working-set parent: {error}"))?;
    reject_native_link(working_root)?;
    let staging_root = working_root.join(format!(
        ".time-travel-{}-{}-{}",
        request.target_run_id,
        std::process::id(),
        native_epoch_millis()
    ));
    if staging_root.exists() {
        return Err("time-travel staging target already exists.".to_string());
    }
    let active_root = staging_root.join("active");
    fs::create_dir_all(&active_root)
        .map_err(|error| format!("failed to create time-travel staging root: {error}"))?;
    let result = (|| -> Result<(), String> {
        for (relative, bytes) in &validated.files {
            let destination =
                active_root.join(relative.replace('/', std::path::MAIN_SEPARATOR_STR));
            if let Some(parent) = destination.parent() {
                fs::create_dir_all(parent).map_err(|error| {
                    format!("failed to create time-travel content parent: {error}")
                })?;
            }
            write_synced_file(&destination, bytes)?;
        }
        let lineage = NativeTimeTravelLineage {
            schema_version: NATIVE_TIME_TRAVEL_LINEAGE_SCHEMA.to_string(),
            resource_id: request.source_resource_id.clone(),
            session_id: request.source_session_id.clone(),
            source_run_id: request.source_run_id.clone(),
            target_run_id: request.target_run_id.clone(),
            mode: request.mode.clone(),
            source_generation_digest: request.generation_digest.clone(),
            replays_external_effects: false,
            redacted: true,
        };
        let lineage_bytes = serde_json::to_vec_pretty(&lineage)
            .map_err(|_| "native time-travel lineage could not be serialized.".to_string())?;
        write_synced_file(
            &staging_root.join("time-travel-lineage.json"),
            &lineage_bytes,
        )?;
        if matches!(
            fault,
            NativeTimeTravelFault::AfterStaging | NativeTimeTravelFault::CleanupFailure
        ) {
            return Err("injected time-travel fault after complete staging.".to_string());
        }
        // CRITICAL: source validation and complete target staging must remain before this rename;
        // publishing a partial branch could later bind approval to incomplete restored state.
        fs::rename(&staging_root, &target_scope)
            .map_err(|error| format!("failed to atomically publish time-travel branch: {error}"))?;
        Ok(())
    })();
    if let Err(error) = result {
        if staging_root.exists() {
            let cleanup_failed = fault == NativeTimeTravelFault::CleanupFailure
                || fs::remove_dir_all(&staging_root).is_err();
            if cleanup_failed {
                persist_native_time_travel_cleanup_required(
                    &request,
                    &staging_root,
                    &target_scope,
                )?;
                return Err(format!("{error} Target cleanup is required."));
            }
        }
        return Err(error);
    }
    Ok(NativeTimeTravelPrepareReceipt {
        schema_version: NATIVE_TIME_TRAVEL_RECEIPT_SCHEMA.to_string(),
        resource_id: request.source_resource_id,
        session_id: request.source_session_id,
        source_run_id: request.source_run_id.clone(),
        target_run_id: request.target_run_id.clone(),
        mode: request.mode,
        selected_generation_digest: request.generation_digest.clone(),
        source_generation_digest: request.generation_digest.clone(),
        source_generation_ref: format!(
            "working-sets/{}/checkpoints/generations/{}",
            request.source_run_id, request.generation_digest
        ),
        target_root_ref: format!("working-sets/{}/active", request.target_run_id),
        lineage_ref: format!(
            "working-sets/{}/time-travel-lineage.json",
            request.target_run_id
        ),
        state: "branch-ready".to_string(),
        prepared: true,
        source_immutable: true,
        requires_fresh_approval: true,
        will_spawn_process: false,
        replays_external_effects: false,
        file_count: validated.manifest.file_count,
        total_bytes: validated.manifest.total_bytes,
        redacted: true,
    })
}

fn persist_native_time_travel_cleanup_required(
    request: &NativeTimeTravelPrepareRequest,
    staging_root: &Path,
    target_scope: &Path,
) -> Result<(), String> {
    let evidence = NativeTimeTravelCleanupRequiredEvidence {
        schema_version: NATIVE_TIME_TRAVEL_CLEANUP_SCHEMA.to_string(),
        resource_id: request.target_resource_id.clone(),
        session_id: request.target_session_id.clone(),
        source_run_id: request.source_run_id.clone(),
        target_run_id: request.target_run_id.clone(),
        source_generation_digest: request.generation_digest.clone(),
        state: RUNNER_NATIVE_CLEANUP_REQUIRED_STATE.to_string(),
        reason_code: "time-travel-staging-cleanup-failed".to_string(),
        requires_manual_cleanup: true,
        will_spawn_process: false,
        replays_external_effects: false,
        redacted: true,
    };
    let bytes = serde_json::to_vec_pretty(&evidence)
        .map_err(|_| "time-travel cleanup evidence could not be serialized.".to_string())?;
    write_synced_file(&staging_root.join("cleanup-required.json"), &bytes)?;
    if !target_scope.exists() {
        // CRITICAL: a failed staging cleanup must publish only non-authorizing recovery evidence;
        // ordinary prepare rejects this marker so incomplete state can never become executable.
        fs::rename(staging_root, target_scope).map_err(|_| {
            "time-travel target cleanup is required; recovery evidence remains in staging."
                .to_string()
        })?;
    }
    Ok(())
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
    let cleanup_marker =
        native_working_set_scope_dir(&request.run_id)?.join("cleanup-required.json");
    if cleanup_marker.exists() {
        reject_native_link(&cleanup_marker)?;
        return Err(
            "time-travel target is cleanup-required and cannot enter approval preparation."
                .to_string(),
        );
    }
    let adapter_id = approved_adapter_id(&request)?;
    let permission_profile_id = approved_permission_profile_id(&request)?;
    let adapter_manifest = resolve_adapter_manifest(&adapter_id)?;
    let adapter_manifest_receipt = review_adapter_manifest(&adapter_manifest)?;
    let approval_id = issue_approval_id(&request);
    initialize_native_working_set(&request)?;
    let time_travel_lineage = prepare_native_time_travel_lineage_for_approval(&request)?;
    let approval_proposal = create_native_approval_proposal_record(
        &request,
        &adapter_id,
        &permission_profile_id,
        &adapter_manifest,
        &approval_id,
        time_travel_lineage,
    );
    initialize_native_run_registry(&request)?;
    store_native_approval_proposal(approval_proposal)?;
    let record = NativeRunRecord {
        resource_id: request.resource_id.clone(),
        session_id: request.session_id.clone(),
        run_id: request.run_id.clone(),
        adapter_id: adapter_id.clone(),
        approval_id: approval_id.clone(),
        permission_profile_id: permission_profile_id.clone(),
        adapter_manifest_id: adapter_manifest.manifest_id.clone(),
        adapter_manifest_digest: adapter_manifest.digest.clone(),
        permission_grant_id: None,
        state: NativeRunState::PendingApproval,
        approval_consumed: false,
        execution: None,
        cleanup_recovery: None,
        product_projection: None,
        working_set_checkpoint: None,
    };
    reset_native_events(&request)?;
    runner_records()
        .lock()
        .map_err(|_| "native runner record store is unavailable.".to_string())?
        .insert(request.run_id.clone(), record);
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
        "permission.proposal-pending",
        "pending",
        "Native permission proposal is pending an explicit user decision.",
        NativeRunnerEventDetails {
            adapter_id: Some(adapter_id.clone()),
            permission_grant_id: None,
            permission_status: Some("pending-decision".to_string()),
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
        None,
        None,
        None,
        Some(event_replay),
    )
}

#[tauri::command]
fn agentique_runner_approval_proposal(
    request: RunnerCommandRequest,
) -> Result<NativeApprovalProposalReceipt, String> {
    validate_runner_request(&request)?;
    let proposal_id = request
        .approval_id
        .as_deref()
        .ok_or_else(|| "approvalId is required to read the pending proposal.".to_string())?;
    let proposals = native_approval_proposal_records()
        .lock()
        .map_err(|_| "native approval proposal store is unavailable.".to_string())?;
    let proposal = proposals
        .get(proposal_id)
        .ok_or_else(|| "approvalId does not identify a current native proposal.".to_string())?;
    ensure_native_approval_scope(proposal, &request)?;
    Ok(native_approval_proposal_receipt(proposal))
}

#[tauri::command]
fn agentique_runner_decide_approval(
    request: NativeApprovalDecisionRequest,
) -> Result<NativeApprovalDecisionReceipt, String> {
    validate_opaque_id("resourceId", &request.resource_id)?;
    validate_opaque_id("sessionId", &request.session_id)?;
    validate_opaque_id("runId", &request.run_id)?;
    validate_opaque_id("proposalId", &request.proposal_id)?;
    validate_opaque_id("actorId", &request.actor_id)?;
    if request.decision != "approved" && request.decision != "denied" {
        return Err("decision must be an explicit approved or denied user action.".to_string());
    }

    let (proposal, decision_id) = {
        let mut proposals = native_approval_proposal_records()
            .lock()
            .map_err(|_| "native approval proposal store is unavailable.".to_string())?;
        let proposal = proposals.get_mut(&request.proposal_id).ok_or_else(|| {
            "proposalId does not identify a current pending proposal.".to_string()
        })?;
        if proposal.resource_id != request.resource_id
            || proposal.session_id != request.session_id
            || proposal.run_id != request.run_id
        {
            return Err("proposalId is not scoped to the supplied run address.".to_string());
        }
        if proposal.status != "pending" {
            return Err("proposal already has a decision and cannot be replayed.".to_string());
        }
        if proposal.expires_at_epoch_seconds <= current_epoch_seconds() {
            return Err("proposal expired before the explicit user decision.".to_string());
        }
        if request.proposal_digest != proposal.proposal_digest
            || canonical_native_approval_digest(proposal) != proposal.proposal_digest
        {
            return Err("proposal digest changed after presentation.".to_string());
        }
        let decision_id = format!(
            "decision.{:016x}",
            stable_hash(&format!(
                "{}:{}:{}:{}",
                proposal.proposal_id, request.actor_id, request.decision, proposal.proposal_digest
            ))
        );
        proposal.status = request.decision.clone();
        proposal.actor_id = Some(request.actor_id.clone());
        proposal.decision_id = Some(decision_id.clone());
        (proposal.clone(), decision_id)
    };

    let permission_grant = if request.decision == "approved" {
        let grant_id = issue_permission_grant_id(&proposal);
        let grant = create_native_permission_grant_record(
            &proposal,
            &decision_id,
            &request.actor_id,
            &grant_id,
        );
        let receipt = store_native_permission_grant(grant)?;
        let mut records = runner_records()
            .lock()
            .map_err(|_| "native runner record store is unavailable.".to_string())?;
        let record = records
            .get_mut(&request.run_id)
            .ok_or_else(|| "runId does not have a native-owned pending run record.".to_string())?;
        if record.approval_id != request.proposal_id
            || record.state != NativeRunState::PendingApproval
        {
            return Err("pending run does not match the approved proposal.".to_string());
        }
        record.permission_grant_id = Some(grant_id);
        Some(receipt)
    } else {
        None
    };

    Ok(NativeApprovalDecisionReceipt {
        schema_version: NATIVE_APPROVAL_DECISION_SCHEMA.to_string(),
        decision_id,
        proposal_id: proposal.proposal_id,
        proposal_digest: proposal.proposal_digest,
        decision: request.decision,
        actor_id: request.actor_id,
        explicit_user_action: true,
        permission_grant,
        redacted: true,
    })
}

#[tauri::command]
fn agentique_runner_start(request: RunnerCommandRequest) -> Result<RunnerCommandReceipt, String> {
    start_native_run(request, native_adapter_mode_for_host(), NATIVE_RUN_TIMEOUT)
}

fn start_native_run(
    request: RunnerCommandRequest,
    mode: NativeAdapterTestMode,
    timeout: Duration,
) -> Result<RunnerCommandReceipt, String> {
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
    let address_key = native_run_address_key(&request);
    if native_coordinator_records()
        .lock()
        .map_err(|_| "native coordinator store is unavailable.".to_string())?
        .values()
        .any(|record| {
            record.address_key == address_key && record.worker_active.load(Ordering::SeqCst)
        })
    {
        return Err(
            "the complete run address already has an active native coordinator.".to_string(),
        );
    }
    {
        let mut records = runner_records()
            .lock()
            .map_err(|_| "native runner record store is unavailable.".to_string())?;
        let record = records
            .get_mut(&request.run_id)
            .ok_or_else(|| "runId does not have a native-owned pending run record.".to_string())?;
        ensure_scoped_run_record(record, &request, &adapter_id, &permission_profile_id)?;
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
            return Err(
                "approvalId is missing, stale, or not valid for this pending run.".to_string(),
            );
        }
        // CRITICAL: identifiers are evidence only; the exact native-owned explicit decision must
        // remain current and digest-matched before any effect or legacy echo could reach launch.
        validate_native_approval_for_start(
            &request,
            record,
            &adapter_manifest,
            &approval_id,
            &permission_grant_id,
        )?;
        // CRITICAL: a time-travel approval is bound to the restored target generation. Recheck it
        // before consuming the one-use grant; otherwise edited local state could inherit consent.
        revalidate_native_time_travel_target(&request, &approval_id)?;
        let permission_grant_receipt = consume_native_permission_grant(
            &request,
            record,
            &adapter_manifest,
            &permission_grant_id,
        )?;
        persist_native_run_registry(&request, &NativeRunState::Running)?;
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

        // CRITICAL: persist the exact active address before launch becomes externally observable;
        // restart recovery must classify an unknown effect as interrupted, never replay it.
        write_native_active_projection_marker(&request)?;

        if adapter_id == native_rootless_container::ADAPTER_ID {
            return start_native_container_worker(
                request,
                adapter_manifest,
                adapter_manifest_receipt,
                approval_id,
                permission_profile_id,
                permission_grant_receipt,
                address_key,
                timeout,
            );
        }

        if adapter_id == native_wasm_sandbox::ADAPTER_ID {
            return start_native_wasm_worker(
                request,
                adapter_manifest,
                adapter_manifest_receipt,
                approval_id,
                permission_profile_id,
                permission_grant_receipt,
                address_key,
                timeout,
            );
        }

        match spawn_fixed_native_adapter(
            &adapter_manifest,
            &request.run_id,
            &request.resource_id,
            mode,
        )? {
            NativeSpawnResult::Blocked(execution) => {
                commit_native_run_terminal(
                    &request,
                    &adapter_id,
                    NativeRunState::Failed,
                    "run.failed",
                    Some(&execution),
                    Some(NativeProcessCleanupObservation::verified_zero(
                        "fixed-adapter-not-launched",
                    )),
                )?;
                let event_replay = event_replay_for(&request)?;
                return runner_transition_receipt(
                    "agentique_runner_start",
                    RUNNER_NATIVE_FAILED_STATE,
                    RUNNER_NATIVE_EXECUTION_REASON,
                    request,
                    false,
                    Some(adapter_id),
                    Some(approval_id),
                    Some(permission_profile_id),
                    Some(adapter_manifest_receipt),
                    Some(execution),
                    Some(permission_grant_receipt),
                    None,
                    None,
                    Some(event_replay),
                );
            }
            NativeSpawnResult::Spawned {
                child,
                process_tree_supervisor,
            } => {
                let cancel_requested = Arc::new(AtomicBool::new(false));
                let worker_active = Arc::new(AtomicBool::new(true));
                let terminal_intent = Arc::new(Mutex::new(None));
                native_coordinator_records()
                    .lock()
                    .map_err(|_| "native coordinator store is unavailable.".to_string())?
                    .insert(
                        request.run_id.clone(),
                        NativeCoordinatorRecord {
                            address_key,
                            cancel_requested: cancel_requested.clone(),
                            worker_active: worker_active.clone(),
                            terminal_intent: terminal_intent.clone(),
                            process_tree_supervisor: Some(process_tree_supervisor.clone()),
                        },
                    );
                record_native_event(
                    &request,
                    "start.accepted",
                    "running",
                    "Native start returned while the fixed adapter handle remained supervised.",
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
                    "Fixed native adapter launch started asynchronously.",
                    NativeRunnerEventDetails {
                        adapter_id: Some(adapter_id.clone()),
                        status: Some("running".to_string()),
                        ..NativeRunnerEventDetails::default()
                    },
                )?;
                let worker_request = request.clone();
                let worker_manifest = adapter_manifest.clone();
                thread::spawn(move || {
                    supervise_native_run(
                        worker_request,
                        worker_manifest,
                        child,
                        timeout,
                        cancel_requested,
                        worker_active,
                        terminal_intent,
                        process_tree_supervisor,
                    );
                });
                let event_replay = event_replay_for(&request)?;
                return runner_transition_receipt(
                    "agentique_runner_start",
                    "running",
                    "Native coordinator retained the fixed adapter handle and returned before completion.",
                    request,
                    true,
                    Some(adapter_id),
                    Some(approval_id),
                    Some(permission_profile_id),
                    Some(adapter_manifest_receipt),
                    None,
                    Some(permission_grant_receipt),
                    None,
                    None,
                    Some(event_replay),
                );
            }
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn start_native_container_worker(
    request: RunnerCommandRequest,
    adapter_manifest: NativeAdapterManifest,
    adapter_manifest_receipt: NativeAdapterManifestReceipt,
    approval_id: String,
    permission_profile_id: String,
    permission_grant_receipt: NativePermissionGrantReceipt,
    address_key: String,
    timeout: Duration,
) -> Result<RunnerCommandReceipt, String> {
    let cancel_requested = Arc::new(AtomicBool::new(false));
    let worker_active = Arc::new(AtomicBool::new(true));
    let terminal_intent = Arc::new(Mutex::new(None));
    native_coordinator_records()
        .lock()
        .map_err(|_| "native coordinator store is unavailable.".to_string())?
        .insert(
            request.run_id.clone(),
            NativeCoordinatorRecord {
                address_key,
                cancel_requested: cancel_requested.clone(),
                worker_active: worker_active.clone(),
                terminal_intent: terminal_intent.clone(),
                process_tree_supervisor: None,
            },
        );
    record_native_event(
        &request,
        "start.accepted",
        "running",
        "Native start returned while the fixed rootless container worker remained supervised.",
        NativeRunnerEventDetails {
            adapter_id: Some(adapter_manifest.adapter_id.clone()),
            status: Some("running".to_string()),
            ..NativeRunnerEventDetails::default()
        },
    )?;
    record_native_event(
        &request,
        "adapter.launching",
        "running",
        "Fixed container preflight started; no create occurs until rootless and image identity pass.",
        NativeRunnerEventDetails {
            adapter_id: Some(adapter_manifest.adapter_id.clone()),
            status: Some("running".to_string()),
            ..NativeRunnerEventDetails::default()
        },
    )?;
    let worker_request = request.clone();
    let worker_manifest = adapter_manifest.clone();
    thread::spawn(move || {
        supervise_native_container_run(
            worker_request,
            worker_manifest,
            timeout,
            cancel_requested,
            worker_active,
            terminal_intent,
        );
    });
    let event_replay = event_replay_for(&request)?;
    runner_transition_receipt(
        "agentique_runner_start",
        "running",
        "Native coordinator retained the fixed rootless container worker and returned before completion.",
        request,
        cfg!(target_os = "linux"),
        Some(adapter_manifest.adapter_id),
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

fn supervise_native_container_run(
    request: RunnerCommandRequest,
    adapter_manifest: NativeAdapterManifest,
    timeout: Duration,
    cancel_requested: Arc<AtomicBool>,
    worker_active: Arc<AtomicBool>,
    terminal_intent: Arc<Mutex<Option<NativeRunState>>>,
) {
    let completion = complete_fixed_container_adapter(
        &adapter_manifest,
        &request.run_id,
        &cancel_requested,
        timeout,
    );
    let intended = terminal_intent
        .lock()
        .ok()
        .and_then(|intent| intent.clone());
    let (execution, cleanup, observed_state) = match completion {
        Ok(value) => value,
        Err(error) => {
            let failure = native_failure(
                "failed",
                error.split(':').next().unwrap_or("native-container.failed"),
                &error,
            );
            let execution = native_execution_receipt_for_manifest(
                false,
                RUNNER_NATIVE_FAILED_STATE,
                None,
                "",
                "",
                None,
                failure,
                &request.run_id,
                &adapter_manifest,
            )
            .ok();
            (
                execution,
                NativeProcessCleanupObservation::verified_zero(
                    "rootless-container-blocked-before-create",
                ),
                NativeRunState::Failed,
            )
        }
    };
    // CRITICAL: a user cancel/revocation wins over a late CLI result, while unverified container
    // cleanup wins over every other terminal outcome and can never be published as success.
    let state = if !cleanup.process_tree_cleanup {
        NativeRunState::CleanupRequired
    } else {
        intended.unwrap_or(observed_state)
    };
    let event_type = match state {
        NativeRunState::Succeeded => "run.succeeded",
        NativeRunState::Canceled => "run.canceled",
        NativeRunState::TimedOut => "run.timed-out",
        NativeRunState::CleanupRequired => "cleanup.required",
        _ => "run.failed",
    };
    let _ = commit_native_run_terminal(
        &request,
        &adapter_manifest.adapter_id,
        state,
        event_type,
        execution.as_ref(),
        Some(cleanup),
    );
    finish_native_coordinator(&request.run_id, &worker_active);
}

#[allow(clippy::too_many_arguments)]
fn start_native_wasm_worker(
    request: RunnerCommandRequest,
    adapter_manifest: NativeAdapterManifest,
    adapter_manifest_receipt: NativeAdapterManifestReceipt,
    approval_id: String,
    permission_profile_id: String,
    permission_grant_receipt: NativePermissionGrantReceipt,
    address_key: String,
    timeout: Duration,
) -> Result<RunnerCommandReceipt, String> {
    let cancel_requested = Arc::new(AtomicBool::new(false));
    let worker_active = Arc::new(AtomicBool::new(true));
    let terminal_intent = Arc::new(Mutex::new(None));
    native_coordinator_records()
        .lock()
        .map_err(|_| "native coordinator store is unavailable.".to_string())?
        .insert(
            request.run_id.clone(),
            NativeCoordinatorRecord {
                address_key,
                cancel_requested: cancel_requested.clone(),
                worker_active: worker_active.clone(),
                terminal_intent: terminal_intent.clone(),
                process_tree_supervisor: None,
            },
        );
    record_native_event(
        &request,
        "start.accepted",
        "running",
        "Native start returned while the fixed in-process WASM worker remained supervised.",
        NativeRunnerEventDetails {
            adapter_id: Some(adapter_manifest.adapter_id.clone()),
            status: Some("running".to_string()),
            ..NativeRunnerEventDetails::default()
        },
    )?;
    record_native_event(
        &request,
        "adapter.launching",
        "running",
        "Fixed native WASM adapter started asynchronously with fuel metering.",
        NativeRunnerEventDetails {
            adapter_id: Some(adapter_manifest.adapter_id.clone()),
            status: Some("running".to_string()),
            ..NativeRunnerEventDetails::default()
        },
    )?;
    let worker_request = request.clone();
    let worker_manifest = adapter_manifest.clone();
    thread::spawn(move || {
        supervise_native_wasm_run(
            worker_request,
            worker_manifest,
            timeout,
            cancel_requested,
            worker_active,
            terminal_intent,
        );
    });
    let event_replay = event_replay_for(&request)?;
    runner_transition_receipt(
        "agentique_runner_start",
        "running",
        "Native coordinator retained the fixed in-process WASM worker and returned before completion.",
        request,
        false,
        Some(adapter_manifest.adapter_id),
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

fn supervise_native_wasm_run(
    request: RunnerCommandRequest,
    adapter_manifest: NativeAdapterManifest,
    timeout: Duration,
    cancel_requested: Arc<AtomicBool>,
    worker_active: Arc<AtomicBool>,
    terminal_intent: Arc<Mutex<Option<NativeRunState>>>,
) {
    let started = Instant::now();
    let cleanup = NativeProcessCleanupObservation::verified_zero("in-process-wasm-zero-handles");
    let completion = if cancel_requested.load(Ordering::SeqCst) {
        None
    } else {
        Some(complete_fixed_wasm_adapter(
            &adapter_manifest,
            &request.run_id,
        ))
    };
    if started.elapsed() >= timeout {
        if let Ok(mut intent) = terminal_intent.lock() {
            if intent.is_none() {
                *intent = Some(NativeRunState::TimedOut);
            }
        }
    }
    let intended = terminal_intent
        .lock()
        .ok()
        .and_then(|intent| intent.clone());
    if let Some(terminal) = intended {
        let event_type = if terminal == NativeRunState::TimedOut {
            "run.timed-out"
        } else {
            "run.canceled"
        };
        let _ = commit_native_run_terminal(
            &request,
            &adapter_manifest.adapter_id,
            terminal,
            event_type,
            None,
            Some(cleanup),
        );
    } else if let Some(completion) = completion {
        let _ = settle_native_adapter_completion(
            &request,
            &adapter_manifest.adapter_id,
            &terminal_intent,
            completion,
            cleanup,
        );
    } else {
        let _ = commit_native_run_terminal(
            &request,
            &adapter_manifest.adapter_id,
            NativeRunState::Canceled,
            "run.canceled",
            None,
            Some(cleanup),
        );
    }
    finish_native_coordinator(&request.run_id, &worker_active);
}

fn supervise_native_run(
    request: RunnerCommandRequest,
    adapter_manifest: NativeAdapterManifest,
    mut child: Child,
    timeout: Duration,
    cancel_requested: Arc<AtomicBool>,
    worker_active: Arc<AtomicBool>,
    terminal_intent: Arc<Mutex<Option<NativeRunState>>>,
    process_tree_supervisor: Arc<NativeProcessTreeSupervisor>,
) {
    let adapter_id = adapter_manifest.adapter_id.clone();
    let started = Instant::now();
    loop {
        if started.elapsed() >= timeout {
            if let Ok(mut intent) = terminal_intent.lock() {
                if intent.is_none() {
                    *intent = Some(NativeRunState::TimedOut);
                }
            }
            cancel_requested.store(true, Ordering::SeqCst);
        }
        if cancel_requested.load(Ordering::SeqCst) {
            let cleanup = process_tree_supervisor.terminate_and_observe(&mut child);
            let terminal = terminal_intent
                .lock()
                .ok()
                .and_then(|intent| intent.clone())
                .unwrap_or(NativeRunState::Canceled);
            let event_type = if terminal == NativeRunState::TimedOut {
                "run.timed-out"
            } else {
                "run.canceled"
            };
            let _ = commit_native_run_terminal(
                &request,
                &adapter_id,
                terminal,
                event_type,
                None,
                Some(cleanup),
            );
            finish_native_coordinator(&request.run_id, &worker_active);
            return;
        }
        match child.try_wait() {
            Ok(Some(_)) => {
                let output = child.wait_with_output();
                let cleanup = process_tree_supervisor.observe_after_parent_exit();
                let intended = terminal_intent
                    .lock()
                    .ok()
                    .and_then(|intent| intent.clone());
                if let Some(terminal) = intended {
                    let event_type = if terminal == NativeRunState::TimedOut {
                        "run.timed-out"
                    } else {
                        "run.canceled"
                    };
                    let _ = commit_native_run_terminal(
                        &request,
                        &adapter_id,
                        terminal,
                        event_type,
                        None,
                        Some(cleanup),
                    );
                } else if let Ok(output) = output {
                    let completion =
                        complete_fixed_native_adapter(&adapter_manifest, &request.run_id, output);
                    let _ = settle_native_adapter_completion(
                        &request,
                        &adapter_id,
                        &terminal_intent,
                        completion,
                        cleanup,
                    );
                } else {
                    let _ = commit_native_run_terminal(
                        &request,
                        &adapter_id,
                        NativeRunState::Failed,
                        "run.failed",
                        None,
                        Some(cleanup),
                    );
                }
                finish_native_coordinator(&request.run_id, &worker_active);
                return;
            }
            Ok(None) => thread::sleep(NATIVE_RUN_POLL_INTERVAL),
            Err(_) => {
                let cleanup = process_tree_supervisor.terminate_and_observe(&mut child);
                let _ = commit_native_run_terminal(
                    &request,
                    &adapter_id,
                    NativeRunState::Failed,
                    "run.failed",
                    None,
                    Some(cleanup),
                );
                finish_native_coordinator(&request.run_id, &worker_active);
                return;
            }
        }
    }
}

fn settle_native_adapter_completion(
    request: &RunnerCommandRequest,
    adapter_id: &str,
    terminal_intent: &Arc<Mutex<Option<NativeRunState>>>,
    completion: Result<NativeAdapterExecutionReceipt, String>,
    cleanup: NativeProcessCleanupObservation,
) -> Result<bool, String> {
    let (next_state, execution) = match completion {
        Ok(execution) => {
            let state = if execution.status == RUNNER_NATIVE_SUCCEEDED_STATE {
                NativeRunState::Succeeded
            } else {
                NativeRunState::Failed
            };
            (state, Some(execution))
        }
        // CRITICAL: completion/materialization errors must still claim and commit failure;
        // dropping this Err leaves the native record permanently running after its child exits.
        Err(_) => (NativeRunState::Failed, None),
    };
    // CRITICAL: natural exit, cancel, and timeout must claim the shared terminal intent before
    // committing; otherwise a late completion result or error can overwrite cancel or timeout.
    let next_state = if cleanup.process_tree_cleanup {
        next_state
    } else {
        NativeRunState::Failed
    };
    let claimed_state = terminal_intent
        .lock()
        .ok()
        .map(|mut intent| {
            if intent.is_none() {
                *intent = Some(next_state.clone());
            }
            intent.clone().unwrap_or(next_state)
        })
        .unwrap_or(NativeRunState::Failed);
    let event_type = match claimed_state {
        NativeRunState::Succeeded => "run.succeeded",
        NativeRunState::Canceled => "run.canceled",
        NativeRunState::TimedOut => "run.timed-out",
        _ => "run.failed",
    };
    commit_native_run_terminal(
        request,
        adapter_id,
        claimed_state,
        event_type,
        execution.as_ref(),
        Some(cleanup),
    )
}

#[tauri::command]
fn agentique_runner_revoke_permission(
    request: RunnerCommandRequest,
) -> Result<RunnerCommandReceipt, String> {
    validate_runner_request(&request)?;
    let adapter_id = approved_adapter_id(&request)?;
    let permission_profile_id = approved_permission_profile_id(&request)?;
    let adapter_manifest = resolve_adapter_manifest(&adapter_id)?;
    let adapter_manifest_receipt = review_adapter_manifest(&adapter_manifest)?;
    let permission_grant_id = request
        .permission_grant_id
        .clone()
        .ok_or_else(|| "permissionGrantId is required for exact native revocation.".to_string())?;
    let run_record = runner_records()
        .lock()
        .map_err(|_| "native runner record store is unavailable.".to_string())?
        .get(&request.run_id)
        .cloned()
        .ok_or_else(|| "runId does not have a native-owned run record.".to_string())?;
    ensure_scoped_run_record(&run_record, &request, &adapter_id, &permission_profile_id)?;
    if run_record.adapter_manifest_id != adapter_manifest.manifest_id
        || run_record.adapter_manifest_digest != adapter_manifest.digest
    {
        return Err("adapter manifest does not match the native-owned run record.".to_string());
    }
    if run_record.permission_grant_id.as_deref() != Some(permission_grant_id.as_str()) {
        return Err("permissionGrantId is not bound to this native-owned run.".to_string());
    }
    if !matches!(
        run_record.state,
        NativeRunState::PendingApproval | NativeRunState::Running | NativeRunState::Canceling
    ) {
        return Err(format!(
            "permission revocation cannot transition a run from {}.",
            run_record.state.as_str()
        ));
    }

    let grant = validate_native_permission_grant_for_revocation(
        &request,
        &run_record,
        &adapter_manifest,
        &permission_grant_id,
    )?;
    let active = matches!(
        run_record.state,
        NativeRunState::Running | NativeRunState::Canceling
    );
    let coordinator = if active {
        let coordinator = native_coordinator_records()
            .lock()
            .map_err(|_| "native coordinator store is unavailable.".to_string())?
            .get(&request.run_id)
            .cloned()
            .ok_or_else(|| "active native coordinator handle is unavailable.".to_string())?;
        if coordinator.address_key != native_run_address_key(&request)
            || !coordinator.worker_active.load(Ordering::SeqCst)
        {
            return Err(
                "active native coordinator does not match the complete run address.".to_string(),
            );
        }
        Some(coordinator)
    } else {
        None
    };

    let mut terminal_intent = if let Some(coordinator) = coordinator.as_ref() {
        let intent = coordinator
            .terminal_intent
            .lock()
            .map_err(|_| "native coordinator terminal intent is unavailable.".to_string())?;
        match intent.as_ref() {
            None | Some(NativeRunState::Canceled) => {}
            Some(existing) => {
                return Err(format!(
                    "native coordinator terminal state is already claimed as {}.",
                    existing.as_str()
                ));
            }
        }
        Some(intent)
    } else {
        None
    };
    let state = if active {
        "canceling"
    } else {
        "permission-revoked"
    };
    let revocation_result = (|| -> Result<NativePermissionGrantReceipt, String> {
        let permission_grant_receipt = mark_native_permission_grant_revoked(&grant)?;
        if active {
            persist_native_run_registry(&request, &NativeRunState::Canceling)?;
            let mut records = runner_records()
                .lock()
                .map_err(|_| "native runner record store is unavailable.".to_string())?;
            let record = records
                .get_mut(&request.run_id)
                .ok_or_else(|| "runId does not have a native-owned run record.".to_string())?;
            ensure_scoped_run_record(record, &request, &adapter_id, &permission_profile_id)?;
            if record.state == NativeRunState::Running {
                record.state = NativeRunState::Canceling;
            }
        }
        record_native_event(
            &request,
            "permission.revoked",
            if active { "running" } else { "pending" },
            if active {
                "Native permission revocation claimed cancellation and signaled the exact retained handle."
            } else {
                "Native permission grant was revoked before start."
            },
            NativeRunnerEventDetails {
                adapter_id: Some(adapter_id.clone()),
                permission_grant_id: Some(permission_grant_id),
                permission_status: Some("revoked".to_string()),
                status: Some(state.to_string()),
                ..NativeRunnerEventDetails::default()
            },
        )?;
        Ok(permission_grant_receipt)
    })();
    if let (Some(intent), Some(coordinator)) = (terminal_intent.as_mut(), coordinator.as_ref()) {
        // CRITICAL: authorization withdrawal must serialize its durable revocation event before
        // releasing terminal ownership, then signal the validated exact handle even if that write
        // failed; reversing either edge permits post-terminal evidence or an unauthorized process.
        **intent = Some(NativeRunState::Canceled);
        coordinator.cancel_requested.store(true, Ordering::SeqCst);
    }
    drop(terminal_intent);
    let permission_grant_receipt = revocation_result?;
    let event_replay = event_replay_for(&request)?;
    runner_transition_receipt(
        "agentique_runner_revoke_permission",
        state,
        if active {
            "Exact native permission revocation is terminating the retained adapter handle."
        } else {
            "Exact native permission grant is revoked and start remains blocked."
        },
        request,
        false,
        Some(adapter_id),
        None,
        Some(permission_profile_id),
        Some(adapter_manifest_receipt),
        None,
        Some(permission_grant_receipt),
        None,
        None,
        Some(event_replay),
    )
}

fn commit_native_run_terminal(
    request: &RunnerCommandRequest,
    adapter_id: &str,
    next_state: NativeRunState,
    event_type: &str,
    execution: Option<&NativeAdapterExecutionReceipt>,
    cleanup_observation: Option<NativeProcessCleanupObservation>,
) -> Result<bool, String> {
    let cleanup_observation = cleanup_observation.unwrap_or_else(|| {
        NativeProcessCleanupObservation::unverified("live-supervisor-evidence-unavailable")
    });
    let working_set_checkpoint = finalize_native_working_set(request, &next_state).ok();
    let checkpoint_committed = working_set_checkpoint.is_some();
    let checkpoint_state = if checkpoint_committed {
        next_state
    } else {
        NativeRunState::Failed
    };
    let checkpoint_event_type = if checkpoint_committed {
        event_type
    } else {
        "run.failed"
    };
    let next_state = checkpoint_state;
    // CRITICAL: the durable product pointer must commit before the in-memory state or WebView
    // terminal changes; reversing this order can publish false success after a partial write.
    let projection = project_native_terminal(request, &next_state, execution);
    let (committed_state, committed_event_type, product_projection) = match projection {
        Ok(receipt) => (next_state, checkpoint_event_type, Some(receipt)),
        Err(_) => (NativeRunState::Failed, "run.failed", None),
    };
    let cleanup_transition = if committed_state == NativeRunState::TimedOut {
        "timeout-cleanup"
    } else if committed_state == NativeRunState::Canceled {
        "cancel-cleanup"
    } else {
        "terminal-cleanup"
    };
    let cleanup_status = if cleanup_observation.process_tree_cleanup {
        "cleaned-up"
    } else {
        "cleanup-required"
    };
    let cleanup = native_cleanup_recovery_receipt(
        "native-coordinator",
        cleanup_transition,
        &request.run_id,
        committed_state.as_str(),
        cleanup_status,
        None,
        &cleanup_observation,
    );
    write_native_cleanup_recovery(&request.run_id, &cleanup)?;
    persist_native_run_registry(&request, &committed_state)?;
    {
        let mut records = runner_records()
            .lock()
            .map_err(|_| "native runner record store is unavailable.".to_string())?;
        let record = records
            .get_mut(&request.run_id)
            .ok_or_else(|| "runId does not have a native-owned run record.".to_string())?;
        if !matches!(
            record.state,
            NativeRunState::Running | NativeRunState::Canceling
        ) {
            return Ok(false);
        }
        record.state = committed_state.clone();
        record.execution = execution.cloned();
        record.product_projection = product_projection.clone();
        record.working_set_checkpoint = working_set_checkpoint.clone();
        record.cleanup_recovery = Some(cleanup.clone());
    }
    record_native_event(
        request,
        if cleanup.process_tree_cleanup {
            "cleanup.completed"
        } else {
            "cleanup.required"
        },
        "cleanup",
        if cleanup.process_tree_cleanup {
            "Native process-tree cleanup was verified before terminal settlement."
        } else {
            "Native process-tree cleanup could not be verified; follow-up cleanup remains required."
        },
        NativeRunnerEventDetails {
            adapter_id: Some(adapter_id.to_string()),
            status: Some(cleanup.status.clone()),
            run_folder_files: cleanup.receipt_refs.clone(),
            ..NativeRunnerEventDetails::default()
        },
    )?;
    if let Some(execution) = execution {
        record_native_event(
            request,
            "adapter.stdout",
            "running",
            "Fixed adapter stdout captured as a bounded redacted preview.",
            NativeRunnerEventDetails {
                adapter_id: Some(adapter_id.to_string()),
                status: Some(execution.status.clone()),
                stdout_preview: Some(execution.stdout_preview.clone()),
                ..NativeRunnerEventDetails::default()
            },
        )?;
        record_native_event(
            request,
            "run-folder.written",
            "running",
            "Native run folder evidence was written with relative file refs.",
            NativeRunnerEventDetails {
                adapter_id: Some(adapter_id.to_string()),
                status: Some(execution.status.clone()),
                run_folder_files: execution.run_folder.files.clone(),
                ..NativeRunnerEventDetails::default()
            },
        )?;
    }
    record_native_event(
        request,
        committed_event_type,
        "terminal",
        "Native coordinator committed the only authoritative terminal state.",
        NativeRunnerEventDetails {
            adapter_id: Some(adapter_id.to_string()),
            status: Some(committed_state.as_str().to_string()),
            exit_code: execution.and_then(|value| value.exit.code),
            ..NativeRunnerEventDetails::default()
        },
    )?;
    Ok(true)
}

fn native_run_address_key(request: &RunnerCommandRequest) -> String {
    format!(
        "{}::{}::{}",
        request.resource_id, request.session_id, request.run_id
    )
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum NativeProjectionFault {
    None,
    BeforeContent,
    AfterContent,
    AfterManifest,
    AfterPointer,
}

fn project_native_terminal(
    request: &RunnerCommandRequest,
    state: &NativeRunState,
    execution: Option<&NativeAdapterExecutionReceipt>,
) -> Result<NativeProductProjectionReceipt, String> {
    project_native_terminal_with_fault(request, state, execution, NativeProjectionFault::None)
}

fn project_native_terminal_with_fault(
    request: &RunnerCommandRequest,
    state: &NativeRunState,
    execution: Option<&NativeAdapterExecutionReceipt>,
    fault: NativeProjectionFault,
) -> Result<NativeProductProjectionReceipt, String> {
    let candidate_material = serde_json::to_string(&serde_json::json!({
        "resourceId": request.resource_id,
        "sessionId": request.session_id,
        "runId": request.run_id,
        "state": state.as_str(),
        "execution": execution,
    }))
    .map_err(|_| "product projection candidate could not be serialized safely.".to_string())?;
    let candidate_digest = stable_native_digest(&candidate_material);
    if let Some(mut existing) = read_committed_native_projection(request)? {
        if existing.candidate_digest != candidate_digest || existing.state != state.as_str() {
            return Err(
                "a different terminal candidate is already authoritative for this run.".to_string(),
            );
        }
        existing.idempotent = true;
        return Ok(existing);
    }
    if fault == NativeProjectionFault::BeforeContent {
        return Err("injected product projection fault before content.".to_string());
    }

    let projection_dir = native_projection_run_dir(&request.run_id)?;
    let generations_dir = projection_dir.join("generations");
    fs::create_dir_all(&generations_dir)
        .map_err(|error| format!("failed to create native projection generation root: {error}"))?;
    let stage_name = format!(".staging-{}-{}", std::process::id(), native_epoch_millis());
    let stage_dir = projection_dir.join(&stage_name);
    fs::create_dir(&stage_dir).map_err(|error| {
        format!("failed to create native projection staging generation: {error}")
    })?;

    let mut artifact_refs = Vec::new();
    let mut artifact_entries = Vec::new();
    if execution.is_some() {
        for relative in [
            "run.json",
            "viewer-metadata.json",
            "failure.json",
            "write-receipt.json",
            "outputs/python-result.json",
            "artifacts/python-result.json",
            "outputs/node-result.json",
            "artifacts/node-result.json",
            "outputs/wasm-result.json",
            "artifacts/wasm-result.json",
            "outputs/container-result.json",
            "artifacts/container-result.json",
        ] {
            if let Some((content_digest, bytes)) =
                copy_native_projection_file(&request.run_id, relative, &stage_dir)?
            {
                let artifact_ref = format!(
                    "projections/{}/generations/{}/product/{relative}",
                    request.run_id, candidate_digest
                );
                artifact_refs.push(artifact_ref.clone());
                artifact_entries.push(serde_json::json!({
                    "ref": artifact_ref,
                    "contentDigest": content_digest,
                    "bytes": bytes,
                }));
            }
        }
    }
    if fault == NativeProjectionFault::AfterContent {
        return Err("injected product projection fault after content.".to_string());
    }

    let manifest = serde_json::json!({
        "schemaVersion": NATIVE_PRODUCT_PROJECTION_SCHEMA,
        "resourceId": request.resource_id,
        "sessionId": request.session_id,
        "runId": request.run_id,
        "candidateDigest": candidate_digest,
        "state": state.as_str(),
        "artifactRefs": artifact_refs,
        "artifacts": artifact_entries,
        "committed": true,
        "redacted": true,
        "boundary": {
            "replaysUnknownEffects": false,
            "rendererSuppliesStoragePath": false,
            "processHandleDurable": false,
        }
    });
    write_synced_json(&stage_dir.join("manifest.json"), &manifest)?;
    if fault == NativeProjectionFault::AfterManifest {
        return Err("injected product projection fault after manifest.".to_string());
    }

    let generation_dir = generations_dir.join(&candidate_digest);
    if generation_dir.exists() {
        let existing_manifest = fs::read_to_string(generation_dir.join("manifest.json"))
            .map_err(|_| "existing native projection generation is incomplete.".to_string())?;
        if !existing_manifest.contains(&candidate_digest) {
            return Err(
                "existing native projection generation conflicts with candidate.".to_string(),
            );
        }
        fs::remove_dir_all(&stage_dir).map_err(|error| {
            format!("failed to remove redundant projection staging generation: {error}")
        })?;
    } else {
        fs::rename(&stage_dir, &generation_dir).map_err(|error| {
            format!("failed to atomically commit native projection generation: {error}")
        })?;
    }

    let pointer = serde_json::json!({
        "schemaVersion": "agentique.nativeProductResultProjectionPointer.v1",
        "runId": request.run_id,
        "candidateDigest": candidate_digest,
        "manifestRef": format!("projections/{}/generations/{}/manifest.json", request.run_id, candidate_digest),
    });
    let pointer_temp = projection_dir.join(format!("current.json.tmp-{}", native_epoch_millis()));
    write_synced_json(&pointer_temp, &pointer)?;
    let pointer_path = projection_dir.join("current.json");
    if pointer_path.exists() {
        fs::remove_file(&pointer_path)
            .map_err(|error| format!("failed to replace native projection pointer: {error}"))?;
    }
    fs::rename(&pointer_temp, &pointer_path).map_err(|error| {
        format!("failed to atomically commit native projection pointer: {error}")
    })?;
    let active_path = projection_dir.join("active.json");
    if active_path.exists() {
        fs::remove_file(active_path).map_err(|error| {
            format!("failed to settle native projection active marker: {error}")
        })?;
    }
    prune_native_projection_runs()?;

    let receipt = NativeProductProjectionReceipt {
        schema_version: NATIVE_PRODUCT_PROJECTION_RECEIPT_SCHEMA.to_string(),
        resource_id: request.resource_id.clone(),
        session_id: request.session_id.clone(),
        run_id: request.run_id.clone(),
        candidate_digest: candidate_digest.clone(),
        state: state.as_str().to_string(),
        committed: true,
        idempotent: false,
        generation_ref: format!(
            "projections/{}/generations/{candidate_digest}",
            request.run_id
        ),
        pointer_ref: format!("projections/{}/current.json", request.run_id),
        artifact_refs,
        recovery_classification: "completed".to_string(),
        redacted: true,
    };
    if fault == NativeProjectionFault::AfterPointer {
        return Err("injected product projection fault after authoritative pointer.".to_string());
    }
    Ok(receipt)
}

fn write_native_active_projection_marker(request: &RunnerCommandRequest) -> Result<(), String> {
    let projection_dir = native_projection_run_dir(&request.run_id)?;
    fs::create_dir_all(&projection_dir)
        .map_err(|error| format!("failed to create native projection run root: {error}"))?;
    let marker = serde_json::json!({
        "schemaVersion": "agentique.nativeProductResultActive.v1",
        "resourceId": request.resource_id,
        "sessionId": request.session_id,
        "runId": request.run_id,
        "state": "running",
        "replayUnknownEffect": false,
    });
    let temporary = projection_dir.join(format!("active.json.tmp-{}", native_epoch_millis()));
    write_synced_json(&temporary, &marker)?;
    let active = projection_dir.join("active.json");
    if active.exists() {
        fs::remove_file(&active).map_err(|error| {
            format!("failed to replace native projection active marker: {error}")
        })?;
    }
    fs::rename(temporary, active)
        .map_err(|error| format!("failed to commit native projection active marker: {error}"))
}

fn copy_native_projection_file(
    run_id: &str,
    relative: &str,
    stage_dir: &Path,
) -> Result<Option<(String, u64)>, String> {
    let source_root = native_run_root()?.join("runs").join(run_id);
    let source = source_root.join(relative);
    if !source.exists() {
        return Ok(None);
    }
    reject_native_link(&source)?;
    let metadata = fs::metadata(&source)
        .map_err(|error| format!("failed to inspect native projection input: {error}"))?;
    if !metadata.is_file() || metadata.len() > MAX_NATIVE_PRODUCT_PROJECTION_BYTES {
        return Err("native projection input is not a bounded regular file.".to_string());
    }
    let bytes = fs::read(&source)
        .map_err(|error| format!("failed to read native projection input: {error}"))?;
    if contains_unsafe_projection_material(&bytes) {
        return Err("native projection input contains forbidden private material.".to_string());
    }
    let destination = stage_dir.join("product").join(relative);
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!("failed to create native projection product folder: {error}")
        })?;
    }
    write_synced_file(&destination, &bytes)?;
    Ok(Some((
        stable_native_digest(&String::from_utf8_lossy(&bytes)),
        bytes.len() as u64,
    )))
}

fn read_committed_native_projection(
    request: &RunnerCommandRequest,
) -> Result<Option<NativeProductProjectionReceipt>, String> {
    let projection_dir = native_projection_run_dir(&request.run_id)?;
    let pointer_path = projection_dir.join("current.json");
    if !pointer_path.exists() {
        return Ok(None);
    }
    reject_native_link(&pointer_path)?;
    let pointer: serde_json::Value = serde_json::from_slice(
        &fs::read(&pointer_path)
            .map_err(|error| format!("failed to read native projection pointer: {error}"))?,
    )
    .map_err(|_| "native projection pointer is corrupt.".to_string())?;
    if pointer
        .get("schemaVersion")
        .and_then(|value| value.as_str())
        != Some("agentique.nativeProductResultProjectionPointer.v1")
    {
        return Err("native projection pointer schema is unsupported.".to_string());
    }
    if pointer.get("runId").and_then(|value| value.as_str()) != Some(request.run_id.as_str()) {
        return Err("native projection pointer run address does not match.".to_string());
    }
    let candidate_digest = pointer
        .get("candidateDigest")
        .and_then(|value| value.as_str())
        .filter(|value| {
            value.len() == 64 && value.chars().all(|character| character.is_ascii_hexdigit())
        })
        .ok_or_else(|| "native projection pointer digest is invalid.".to_string())?;
    let manifest_path = projection_dir
        .join("generations")
        .join(candidate_digest)
        .join("manifest.json");
    let expected_manifest_ref = format!(
        "projections/{}/generations/{candidate_digest}/manifest.json",
        request.run_id
    );
    if pointer.get("manifestRef").and_then(|value| value.as_str())
        != Some(expected_manifest_ref.as_str())
    {
        return Err("native projection pointer manifest reference is invalid.".to_string());
    }
    reject_native_link(&manifest_path)?;
    let manifest: serde_json::Value = serde_json::from_slice(
        &fs::read(&manifest_path)
            .map_err(|_| "native projection manifest is missing.".to_string())?,
    )
    .map_err(|_| "native projection manifest is corrupt.".to_string())?;
    if manifest
        .get("schemaVersion")
        .and_then(|value| value.as_str())
        != Some(NATIVE_PRODUCT_PROJECTION_SCHEMA)
    {
        return Err("native projection manifest schema is unsupported.".to_string());
    }
    if manifest.get("committed").and_then(|value| value.as_bool()) != Some(true)
        || manifest.get("redacted").and_then(|value| value.as_bool()) != Some(true)
    {
        return Err("native projection manifest authority flags are invalid.".to_string());
    }
    for (field, expected) in [
        ("resourceId", request.resource_id.as_str()),
        ("sessionId", request.session_id.as_str()),
        ("runId", request.run_id.as_str()),
        ("candidateDigest", candidate_digest),
    ] {
        if manifest.get(field).and_then(|value| value.as_str()) != Some(expected) {
            return Err("native projection manifest address or digest does not match.".to_string());
        }
    }
    let state = manifest
        .get("state")
        .and_then(|value| value.as_str())
        .and_then(native_terminal_state)
        .ok_or_else(|| "native projection terminal state is invalid.".to_string())?;
    let artifact_refs = manifest
        .get("artifactRefs")
        .and_then(|value| value.as_array())
        .ok_or_else(|| "native projection artifact references are invalid.".to_string())?
        .iter()
        .map(|value| safe_native_relative_ref(value.as_str().unwrap_or_default()))
        .collect::<Vec<_>>();
    if artifact_refs.iter().any(|value| value == "redacted-path") {
        return Err("native projection artifact reference escaped confinement.".to_string());
    }
    let artifact_entries = manifest
        .get("artifacts")
        .and_then(|value| value.as_array())
        .ok_or_else(|| "native projection artifact integrity entries are missing.".to_string())?;
    if artifact_entries.len() != artifact_refs.len() || artifact_entries.len() > 6 {
        return Err("native projection artifact integrity entries are invalid.".to_string());
    }
    let expected_ref_prefix = format!(
        "projections/{}/generations/{candidate_digest}/product/",
        request.run_id
    );
    let allowed_relatives = [
        "run.json",
        "viewer-metadata.json",
        "failure.json",
        "write-receipt.json",
        "outputs/python-result.json",
        "artifacts/python-result.json",
        "outputs/node-result.json",
        "artifacts/node-result.json",
        "outputs/wasm-result.json",
        "artifacts/wasm-result.json",
        "outputs/container-result.json",
        "artifacts/container-result.json",
    ];
    for (index, entry) in artifact_entries.iter().enumerate() {
        let artifact_ref = entry
            .get("ref")
            .and_then(|value| value.as_str())
            .ok_or_else(|| {
                "native projection artifact integrity reference is invalid.".to_string()
            })?;
        if artifact_refs.get(index).map(String::as_str) != Some(artifact_ref) {
            return Err(
                "native projection artifact references do not match integrity entries.".to_string(),
            );
        }
        let relative = artifact_ref
            .strip_prefix(&expected_ref_prefix)
            .filter(|value| allowed_relatives.contains(value))
            .ok_or_else(|| {
                "native projection artifact reference is not allowlisted.".to_string()
            })?;
        let artifact_path = projection_dir
            .join("generations")
            .join(candidate_digest)
            .join("product")
            .join(relative);
        reject_native_link(&artifact_path)?;
        let metadata = fs::metadata(&artifact_path)
            .map_err(|_| "native projection artifact is missing.".to_string())?;
        let expected_bytes = entry
            .get("bytes")
            .and_then(|value| value.as_u64())
            .ok_or_else(|| "native projection artifact byte count is invalid.".to_string())?;
        if !metadata.is_file()
            || metadata.len() != expected_bytes
            || metadata.len() > MAX_NATIVE_PRODUCT_PROJECTION_BYTES
        {
            return Err("native projection artifact byte count does not match.".to_string());
        }
        let bytes = fs::read(&artifact_path)
            .map_err(|_| "native projection artifact could not be read.".to_string())?;
        let expected_digest = entry
            .get("contentDigest")
            .and_then(|value| value.as_str())
            .filter(|value| {
                value.len() == 64 && value.chars().all(|character| character.is_ascii_hexdigit())
            })
            .ok_or_else(|| "native projection artifact digest is invalid.".to_string())?;
        if contains_unsafe_projection_material(&bytes)
            || stable_native_digest(&String::from_utf8_lossy(&bytes)) != expected_digest
        {
            return Err("native projection artifact integrity check failed.".to_string());
        }
    }
    Ok(Some(NativeProductProjectionReceipt {
        schema_version: NATIVE_PRODUCT_PROJECTION_RECEIPT_SCHEMA.to_string(),
        resource_id: request.resource_id.clone(),
        session_id: request.session_id.clone(),
        run_id: request.run_id.clone(),
        candidate_digest: candidate_digest.to_string(),
        state: state.as_str().to_string(),
        committed: true,
        idempotent: false,
        generation_ref: format!(
            "projections/{}/generations/{candidate_digest}",
            request.run_id
        ),
        pointer_ref: format!("projections/{}/current.json", request.run_id),
        artifact_refs,
        recovery_classification: "completed".to_string(),
        redacted: true,
    }))
}

fn native_terminal_state(value: &str) -> Option<NativeRunState> {
    match value {
        RUNNER_NATIVE_SUCCEEDED_STATE => Some(NativeRunState::Succeeded),
        RUNNER_NATIVE_FAILED_STATE => Some(NativeRunState::Failed),
        RUNNER_NATIVE_CANCELED_STATE => Some(NativeRunState::Canceled),
        RUNNER_NATIVE_TIMED_OUT_STATE => Some(NativeRunState::TimedOut),
        RUNNER_NATIVE_CLEANUP_REQUIRED_STATE => Some(NativeRunState::CleanupRequired),
        RUNNER_NATIVE_CLEANED_UP_STATE => Some(NativeRunState::CleanedUp),
        _ => None,
    }
}

fn native_projection_run_dir(run_id: &str) -> Result<PathBuf, String> {
    Ok(native_run_root()?.join("projections").join(run_id))
}

fn write_synced_json(path: &Path, value: &serde_json::Value) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(value)
        .map_err(|_| "native projection metadata could not be serialized.".to_string())?;
    write_synced_file(path, &bytes)
}

fn write_synced_file(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut file = fs::File::create(path)
        .map_err(|error| format!("failed to create native projection file: {error}"))?;
    file.write_all(bytes)
        .map_err(|error| format!("failed to write native projection file: {error}"))?;
    file.sync_all()
        .map_err(|error| format!("failed to sync native projection file: {error}"))
}

fn reject_native_link(path: &Path) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path)
        .map_err(|error| format!("failed to inspect native projection path: {error}"))?;
    if metadata.file_type().is_symlink() {
        return Err("native projection paths must not contain symbolic links.".to_string());
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if metadata.file_attributes() & 0x400 != 0 {
            return Err("native projection paths must not contain reparse points.".to_string());
        }
    }
    Ok(())
}

fn native_run_registry_dir(run_id: &str) -> Result<PathBuf, String> {
    validate_opaque_id("runId", run_id)?;
    Ok(native_projection_run_dir(run_id)?.join("registry"))
}

fn native_run_registry_write_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

fn read_durable_native_run_registry(
    request: &RunnerCommandRequest,
) -> Result<Vec<NativeDurableRunRegistryRecord>, String> {
    let registry_dir = native_run_registry_dir(&request.run_id)?;
    if !registry_dir.exists() {
        return Ok(Vec::new());
    }
    reject_native_link(&registry_dir)?;
    let metadata = fs::metadata(&registry_dir)
        .map_err(|error| format!("failed to inspect durable native run registry: {error}"))?;
    if !metadata.is_dir() {
        return Err("durable native run registry root is not a directory.".to_string());
    }
    let mut paths = fs::read_dir(&registry_dir)
        .map_err(|error| format!("failed to enumerate durable native run registry: {error}"))?
        .map(|entry| {
            entry.map(|value| value.path()).map_err(|error| {
                format!("failed to enumerate durable native run registry: {error}")
            })
        })
        .collect::<Result<Vec<_>, _>>()?;
    paths.sort();
    if paths.len() > MAX_NATIVE_RUN_REGISTRY_RECORDS {
        return Err("durable native run registry exceeds its bounded record count.".to_string());
    }

    let mut records = Vec::with_capacity(paths.len());
    for (index, path) in paths.into_iter().enumerate() {
        let expected_sequence = index + 1;
        let expected_name = format!("{expected_sequence:04}.json");
        if path.file_name().and_then(|name| name.to_str()) != Some(expected_name.as_str()) {
            return Err("durable native run registry sequence is not contiguous.".to_string());
        }
        let bytes = read_bounded_native_run_file(&path, MAX_NATIVE_RUN_REGISTRY_RECORD_BYTES)?;
        if contains_unsafe_projection_material(&bytes) {
            return Err("durable native run registry contains unsafe material.".to_string());
        }
        let record: NativeDurableRunRegistryRecord = serde_json::from_slice(&bytes)
            .map_err(|_| "durable native run registry record is corrupt.".to_string())?;
        validate_native_run_registry_record(request, &record, expected_sequence, records.last())?;
        records.push(record);
    }
    Ok(records)
}

fn validate_native_run_registry_record(
    request: &RunnerCommandRequest,
    record: &NativeDurableRunRegistryRecord,
    expected_sequence: usize,
    previous: Option<&NativeDurableRunRegistryRecord>,
) -> Result<(), String> {
    if record.schema_version != NATIVE_RUN_REGISTRY_SCHEMA
        || record.sequence != expected_sequence
        || !record.redacted
        || record.replays_external_effects
    {
        return Err("durable native run registry schema or safety marker is invalid.".to_string());
    }
    if record.resource_id != request.resource_id
        || record.session_id != request.session_id
        || record.run_id != request.run_id
    {
        return Err("durable native run registry address mismatch.".to_string());
    }
    let request_adapter_id = approved_adapter_id(request)?;
    let manifest = resolve_adapter_manifest(&request_adapter_id)?;
    if record.adapter_id != request_adapter_id
        || record.permission_profile_id != manifest.permission_profile_id
        || record.adapter_manifest_id != manifest.manifest_id
        || record.adapter_manifest_digest != manifest.digest
    {
        return Err("durable native run registry manifest mismatch.".to_string());
    }
    let state = NativeRunState::from_registry(&record.state)
        .ok_or_else(|| "durable native run registry state is unknown.".to_string())?;
    if let Some(previous) = previous {
        let previous_state = NativeRunState::from_registry(&previous.state)
            .ok_or_else(|| "durable native run registry state is unknown.".to_string())?;
        if !valid_native_run_registry_transition(&previous_state, &state) {
            return Err("durable native run registry transition is invalid.".to_string());
        }
    } else if state != NativeRunState::PendingApproval {
        return Err("durable native run registry must begin pending approval.".to_string());
    }
    Ok(())
}

fn valid_native_run_registry_transition(previous: &NativeRunState, next: &NativeRunState) -> bool {
    use NativeRunState::*;
    matches!(
        (previous, next),
        (PendingApproval, Running | Canceled | CleanupRequired)
            | (
                Running,
                Canceling | Succeeded | Failed | Canceled | TimedOut | CleanupRequired
            )
            | (Canceling, Canceled | TimedOut | Failed | CleanupRequired)
            | (
                Succeeded | Failed | Canceled | TimedOut,
                CleanedUp | CleanupRequired
            )
            | (CleanupRequired, CleanedUp)
            | (CleanedUp, CleanupRequired)
    )
}

fn persist_native_run_registry(
    request: &RunnerCommandRequest,
    state: &NativeRunState,
) -> Result<NativeDurableRunRegistryRecord, String> {
    let _guard = native_run_registry_write_lock()
        .lock()
        .map_err(|_| "durable native run registry write lock is unavailable.".to_string())?;
    persist_native_run_registry_locked(request, state)
}

fn initialize_native_run_registry(
    request: &RunnerCommandRequest,
) -> Result<NativeDurableRunRegistryRecord, String> {
    let _guard = native_run_registry_write_lock()
        .lock()
        .map_err(|_| "durable native run registry write lock is unavailable.".to_string())?;
    let projection_dir = native_projection_run_dir(&request.run_id)?;
    if projection_dir.exists() {
        return Err(
            "runId already has durable native evidence; recover it or prepare a new runId."
                .to_string(),
        );
    }
    persist_native_run_registry_locked(request, &NativeRunState::PendingApproval)
}

fn persist_native_run_registry_locked(
    request: &RunnerCommandRequest,
    state: &NativeRunState,
) -> Result<NativeDurableRunRegistryRecord, String> {
    let adapter_id = approved_adapter_id(request)?;
    let manifest = resolve_adapter_manifest(&adapter_id)?;
    let existing = read_durable_native_run_registry(request)?;
    if let Some(last) = existing.last() {
        if last.state == state.as_str() {
            return Ok(last.clone());
        }
        let previous_state = NativeRunState::from_registry(&last.state)
            .ok_or_else(|| "durable native run registry state is unknown.".to_string())?;
        if !valid_native_run_registry_transition(&previous_state, state) {
            return Err("durable native run registry transition is invalid.".to_string());
        }
    } else if *state != NativeRunState::PendingApproval {
        return Err("durable native run registry must begin pending approval.".to_string());
    }
    if existing.len() >= MAX_NATIVE_RUN_REGISTRY_RECORDS {
        return Err("durable native run registry exceeds its bounded record count.".to_string());
    }

    let projection_dir = native_projection_run_dir(&request.run_id)?;
    if projection_dir.exists() {
        reject_native_link(&projection_dir)?;
    } else {
        fs::create_dir_all(&projection_dir).map_err(|error| {
            format!("failed to create durable native run registry parent: {error}")
        })?;
    }
    let registry_dir = native_run_registry_dir(&request.run_id)?;
    if registry_dir.exists() {
        reject_native_link(&registry_dir)?;
    } else {
        fs::create_dir(&registry_dir)
            .map_err(|error| format!("failed to create durable native run registry: {error}"))?;
    }

    let sequence = existing.len() + 1;
    let record = NativeDurableRunRegistryRecord {
        schema_version: NATIVE_RUN_REGISTRY_SCHEMA.to_string(),
        sequence,
        resource_id: request.resource_id.clone(),
        session_id: request.session_id.clone(),
        run_id: request.run_id.clone(),
        adapter_id,
        permission_profile_id: manifest.permission_profile_id,
        adapter_manifest_id: manifest.manifest_id,
        adapter_manifest_digest: manifest.digest,
        state: state.as_str().to_string(),
        redacted: true,
        replays_external_effects: false,
    };
    validate_native_run_registry_record(request, &record, sequence, existing.last())?;
    let bytes = serde_json::to_vec_pretty(&record)
        .map_err(|_| "durable native run registry could not be serialized safely.".to_string())?;
    if bytes.is_empty()
        || bytes.len() as u64 > MAX_NATIVE_RUN_REGISTRY_RECORD_BYTES
        || contains_unsafe_projection_material(&bytes)
    {
        return Err("durable native run registry record exceeds its safety boundary.".to_string());
    }
    let final_path = registry_dir.join(format!("{sequence:04}.json"));
    if final_path.exists() {
        return Err("durable native run registry sequence already exists.".to_string());
    }
    let temporary = registry_dir.join(format!(
        ".{sequence:04}.tmp-{}-{}",
        std::process::id(),
        native_epoch_millis()
    ));
    // CRITICAL: each transition must become one immutable same-directory record before public
    // acknowledgement; direct writes or pointer replacement permit partial or reordered recovery.
    write_synced_file(&temporary, &bytes)?;
    fs::rename(&temporary, &final_path).map_err(|error| {
        let _ = fs::remove_file(&temporary);
        format!("failed to atomically commit durable native run registry: {error}")
    })?;
    Ok(record)
}

fn recover_native_registry_record_if_needed(
    request: &RunnerCommandRequest,
    adapter_id: &str,
    permission_profile_id: &str,
) -> Result<bool, String> {
    if runner_records()
        .lock()
        .map_err(|_| "native runner record store is unavailable.".to_string())?
        .contains_key(&request.run_id)
    {
        return Ok(true);
    }

    let records = match read_durable_native_run_registry(request) {
        Ok(records) if records.is_empty() => return Ok(false),
        Ok(records) => records,
        Err(_) => {
            let cleanup = native_cleanup_recovery_receipt(
                "agentique_runner_status",
                "registry-recovery",
                &request.run_id,
                RUNNER_NATIVE_CLEANUP_REQUIRED_STATE,
                "cleanup-required",
                Some("corrupt-registry".to_string()),
                &NativeProcessCleanupObservation::unverified("restart-supervisor-unavailable"),
            );
            write_native_cleanup_recovery(&request.run_id, &cleanup)?;
            runner_records()
                .lock()
                .map_err(|_| "native runner record store is unavailable.".to_string())?
                .insert(
                    request.run_id.clone(),
                    recovered_native_run_record(
                        request,
                        adapter_id,
                        permission_profile_id,
                        NativeRunState::CleanupRequired,
                        Some(cleanup),
                        Some(interrupted_projection_receipt(request, "corrupt")),
                    )?,
                );
            return Ok(true);
        }
    };
    let last = records
        .last()
        .ok_or_else(|| "durable native run registry is unexpectedly empty.".to_string())?;
    let stored_state = NativeRunState::from_registry(&last.state)
        .ok_or_else(|| "durable native run registry state is unknown.".to_string())?;

    let registry_terminal_state = records.iter().rev().find_map(|record| {
        let state = NativeRunState::from_registry(&record.state)?;
        matches!(
            state,
            NativeRunState::Succeeded
                | NativeRunState::Failed
                | NativeRunState::Canceled
                | NativeRunState::TimedOut
        )
        .then_some((state, record.state.as_str()))
    });
    let committed_projection = read_committed_native_projection(request);
    let projection_recovery_classification = match &committed_projection {
        Err(error) if error.contains("unsupported") => "unsupported",
        Err(_) => "corrupt",
        Ok(None) => "cleanup-required",
        Ok(Some(_)) => "mismatch",
    };
    let matching_terminal = match committed_projection {
        Ok(Some(receipt))
            if native_terminal_state(&receipt.state).is_some()
                && (receipt.state == last.state
                    || matches!(
                        stored_state,
                        NativeRunState::Running | NativeRunState::Canceling
                    )
                    || (stored_state == NativeRunState::CleanedUp
                        && registry_terminal_state
                            .as_ref()
                            .is_some_and(|(_, state)| *state == receipt.state))) =>
        {
            Some(receipt)
        }
        _ => None,
    };

    let (state, cleanup, projection) = if stored_state == NativeRunState::PendingApproval {
        (NativeRunState::PendingApproval, None, None)
    } else if let Some(receipt) = matching_terminal {
        let terminal = native_terminal_state(&receipt.state)
            .ok_or_else(|| "native projection recovery terminal is invalid.".to_string())?;
        if matches!(
            stored_state,
            NativeRunState::Running | NativeRunState::Canceling
        ) && last.state != terminal.as_str()
        {
            persist_native_run_registry(request, &terminal)?;
        }
        let cleanup = read_native_cleanup_recovery(&request.run_id)?;
        if stored_state == NativeRunState::CleanedUp
            && !cleanup.as_ref().is_some_and(|evidence| {
                evidence.process_tree_cleanup
                    && evidence.orphan_count == Some(0)
                    && !evidence.cleanup_required
            })
        {
            return Err(
                "cleaned durable native run registry lacks verified cleanup evidence.".to_string(),
            );
        }
        let recovered_state = if stored_state == NativeRunState::CleanedUp {
            NativeRunState::CleanedUp
        } else {
            terminal
        };
        (recovered_state, cleanup, Some(receipt))
    } else {
        let cleanup = native_cleanup_recovery_receipt(
            "agentique_runner_status",
            "registry-recovery",
            &request.run_id,
            RUNNER_NATIVE_CLEANUP_REQUIRED_STATE,
            "cleanup-required",
            Some(
                if matches!(
                    stored_state,
                    NativeRunState::Running | NativeRunState::Canceling
                ) {
                    "stale-incomplete-run".to_string()
                } else {
                    "registry-terminal-evidence-mismatch".to_string()
                },
            ),
            &NativeProcessCleanupObservation::unverified("restart-supervisor-unavailable"),
        );
        write_native_cleanup_recovery(&request.run_id, &cleanup)?;
        persist_native_run_registry(request, &NativeRunState::CleanupRequired)?;
        (
            NativeRunState::CleanupRequired,
            Some(cleanup),
            Some(interrupted_projection_receipt(
                request,
                projection_recovery_classification,
            )),
        )
    };

    runner_records()
        .lock()
        .map_err(|_| "native runner record store is unavailable.".to_string())?
        .insert(
            request.run_id.clone(),
            recovered_native_run_record(
                request,
                adapter_id,
                permission_profile_id,
                state,
                cleanup,
                projection,
            )?,
        );
    Ok(true)
}

fn recovered_native_run_record(
    request: &RunnerCommandRequest,
    adapter_id: &str,
    permission_profile_id: &str,
    state: NativeRunState,
    cleanup_recovery: Option<NativeRunnerCleanupRecoveryReceipt>,
    product_projection: Option<NativeProductProjectionReceipt>,
) -> Result<NativeRunRecord, String> {
    let manifest = resolve_adapter_manifest(adapter_id)?;
    Ok(NativeRunRecord {
        resource_id: request.resource_id.clone(),
        session_id: request.session_id.clone(),
        run_id: request.run_id.clone(),
        adapter_id: adapter_id.to_string(),
        approval_id: "restart-reauthorization-required".to_string(),
        permission_profile_id: permission_profile_id.to_string(),
        adapter_manifest_id: manifest.manifest_id,
        adapter_manifest_digest: manifest.digest,
        permission_grant_id: None,
        state,
        approval_consumed: true,
        execution: None,
        cleanup_recovery,
        product_projection,
        working_set_checkpoint: None,
    })
}

fn contains_unsafe_projection_material(bytes: &[u8]) -> bool {
    let text = String::from_utf8_lossy(bytes);
    if contains_unsafe_plain_material(&text) {
        return true;
    }
    if let Some(decoded) = percent_decode_bounded(&text) {
        if contains_unsafe_plain_material(&decoded) {
            return true;
        }
    }
    base64_candidates(&text)
        .into_iter()
        .filter_map(|candidate| decode_base64_bounded(candidate))
        .any(|decoded| contains_unsafe_plain_material(&decoded))
}

fn contains_unsafe_plain_material(value: &str) -> bool {
    let text = value.to_ascii_lowercase();
    let forbidden_markers = [
        ["bear", "er "].concat(),
        ["s", "k-"].concat(),
        ["gh", "p_"].concat(),
        ["github", "_pat_"].concat(),
        ["ya", "29."].concat(),
        "cookie=".to_string(),
        "cookie:".to_string(),
        ["va", "ult:"].concat(),
        ["storage", "state="].concat(),
        ["local", "storage="].concat(),
        ["session", "storage="].concat(),
        ["raw", "command="].concat(),
        ["encoded", "command="].concat(),
        [".", "planning"].concat(),
        ["ref", "erence/"].concat(),
        ["ref", "erence\\"].concat(),
        ["ui", "run-"].concat(),
        ["ui", "hed-"].concat(),
        ["/ho", "me/"].concat(),
        ["/us", "ers/"].concat(),
        "\\\\".to_string(),
    ];
    if forbidden_markers.iter().any(|marker| text.contains(marker)) {
        return true;
    }
    (b'a'..=b'z').any(|drive| {
        text.contains(&format!("{}:\\", drive as char))
            || text.contains(&format!("{}:/", drive as char))
    }) || contains_internal_r_code(&text)
}

fn contains_internal_r_code(text: &str) -> bool {
    let bytes = text.as_bytes();
    bytes.windows(5).any(|window| {
        window[0] == b'r'
            && window[1..]
                .iter()
                .all(|character| character.is_ascii_digit())
    })
}

fn percent_decode_bounded(text: &str) -> Option<String> {
    if text.len() > MAX_NATIVE_LOG_BYTES * 4 || !text.as_bytes().contains(&b'%') {
        return None;
    }
    let bytes = text.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    let mut changed = false;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            let high = hex_value(bytes[index + 1])?;
            let low = hex_value(bytes[index + 2])?;
            decoded.push((high << 4) | low);
            index += 3;
            changed = true;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }
    changed.then(|| String::from_utf8_lossy(&decoded).into_owned())
}

fn hex_value(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        b'A'..=b'F' => Some(value - b'A' + 10),
        _ => None,
    }
}

fn base64_candidates(text: &str) -> Vec<&str> {
    text.split(|character: char| {
        !(character.is_ascii_alphanumeric() || matches!(character, '+' | '/' | '='))
    })
    .filter(|candidate| candidate.len() >= 16 && candidate.len() <= MAX_NATIVE_LOG_BYTES * 2)
    .take(32)
    .collect()
}

fn decode_base64_bounded(value: &str) -> Option<String> {
    if value.len() % 4 != 0 {
        return None;
    }
    let mut output = Vec::with_capacity(value.len() / 4 * 3);
    for chunk in value.as_bytes().chunks_exact(4) {
        let a = base64_value(chunk[0])?;
        let b = base64_value(chunk[1])?;
        let c = if chunk[2] == b'=' {
            0
        } else {
            base64_value(chunk[2])?
        };
        let d = if chunk[3] == b'=' {
            0
        } else {
            base64_value(chunk[3])?
        };
        output.push((a << 2) | (b >> 4));
        if chunk[2] != b'=' {
            output.push((b << 4) | (c >> 2));
        }
        if chunk[3] != b'=' {
            output.push((c << 6) | d);
        }
    }
    if output.len() > MAX_NATIVE_LOG_BYTES * 2
        || !output
            .iter()
            .all(|byte| matches!(byte, b'\t' | b'\n' | b'\r' | 0x20..=0x7e))
    {
        return None;
    }
    String::from_utf8(output).ok()
}

fn base64_value(value: u8) -> Option<u8> {
    match value {
        b'A'..=b'Z' => Some(value - b'A'),
        b'a'..=b'z' => Some(value - b'a' + 26),
        b'0'..=b'9' => Some(value - b'0' + 52),
        b'+' => Some(62),
        b'/' => Some(63),
        _ => None,
    }
}

fn prune_native_projection_runs() -> Result<(), String> {
    let root = native_run_root()?.join("projections");
    let mut entries = fs::read_dir(&root)
        .map_err(|error| format!("failed to read native projection retention root: {error}"))?
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false))
        .collect::<Vec<_>>();
    entries.sort_by_key(|entry| {
        entry
            .metadata()
            .and_then(|metadata| metadata.modified())
            .unwrap_or(UNIX_EPOCH)
    });
    let remove_count = entries
        .len()
        .saturating_sub(MAX_NATIVE_PRODUCT_PROJECTION_RUNS);
    for entry in entries.into_iter().take(remove_count) {
        reject_native_link(&entry.path())?;
        fs::remove_dir_all(entry.path())
            .map_err(|error| format!("failed to enforce native projection retention: {error}"))?;
    }
    Ok(())
}

fn validate_native_time_travel_request(
    request: &NativeTimeTravelPrepareRequest,
) -> Result<(), String> {
    if request.schema_version != NATIVE_TIME_TRAVEL_REQUEST_SCHEMA {
        return Err("time-travel prepare request schema is unsupported.".to_string());
    }
    for (label, value) in [
        ("sourceResourceId", request.source_resource_id.as_str()),
        ("sourceSessionId", request.source_session_id.as_str()),
        ("sourceRunId", request.source_run_id.as_str()),
        ("targetResourceId", request.target_resource_id.as_str()),
        ("targetSessionId", request.target_session_id.as_str()),
        ("targetRunId", request.target_run_id.as_str()),
    ] {
        validate_opaque_id(label, value)?;
    }
    if request.source_resource_id != request.target_resource_id
        || request.source_session_id != request.target_session_id
        || request.source_run_id == request.target_run_id
    {
        return Err(
            "time-travel target must be a distinct run in the same resource and session."
                .to_string(),
        );
    }
    if !is_sha256_hex(&request.generation_digest) {
        return Err("time-travel generation digest is invalid.".to_string());
    }
    if !["retry", "resume", "replay"].contains(&request.mode.as_str()) {
        return Err("time-travel mode must be retry, resume, or replay.".to_string());
    }
    Ok(())
}

fn native_time_travel_source_request(
    request: &NativeTimeTravelPrepareRequest,
) -> Result<RunnerCommandRequest, String> {
    let first_path = native_run_registry_dir(&request.source_run_id)?.join("0001.json");
    let first: NativeDurableRunRegistryRecord = serde_json::from_slice(
        &read_bounded_native_run_file(&first_path, MAX_NATIVE_RUN_REGISTRY_RECORD_BYTES)?,
    )
    .map_err(|_| "time-travel source registry is corrupt.".to_string())?;
    if first.schema_version != NATIVE_RUN_REGISTRY_SCHEMA
        || first.resource_id != request.source_resource_id
        || first.session_id != request.source_session_id
        || first.run_id != request.source_run_id
        || !first.redacted
        || first.replays_external_effects
    {
        return Err(
            "time-travel source registry address or safety boundary is invalid.".to_string(),
        );
    }
    Ok(RunnerCommandRequest {
        resource_id: request.source_resource_id.clone(),
        session_id: request.source_session_id.clone(),
        run_id: request.source_run_id.clone(),
        command_id: None,
        adapter_id: Some(first.adapter_id),
        approval_id: None,
        permission_profile_id: Some(first.permission_profile_id),
        permission_grant_id: None,
    })
}

fn review_native_time_travel_source(request: &RunnerCommandRequest) -> Result<(), String> {
    let adapter_id = approved_adapter_id(request)?;
    let permission_profile_id = approved_permission_profile_id(request)?;
    if !recover_native_registry_record_if_needed(request, &adapter_id, &permission_profile_id)? {
        return Err("time-travel source has no durable native run registry.".to_string());
    }
    let record = runner_records()
        .lock()
        .map_err(|_| "native runner record store is unavailable.".to_string())?
        .get(&request.run_id)
        .cloned()
        .ok_or_else(|| "time-travel source run is unavailable.".to_string())?;
    ensure_scoped_run_record(&record, request, &adapter_id, &permission_profile_id)?;
    let durable = read_durable_native_run_registry(request)?;
    let durable_state = durable
        .last()
        .ok_or_else(|| "time-travel source durable registry is empty.".to_string())?;
    if durable_state.state != record.state.as_str() {
        return Err("time-travel source durable state contradicts native memory.".to_string());
    }
    if !matches!(
        record.state,
        NativeRunState::Succeeded
            | NativeRunState::Failed
            | NativeRunState::Canceled
            | NativeRunState::TimedOut
            | NativeRunState::CleanedUp
    ) {
        return Err("time-travel source must have durable terminal state.".to_string());
    }
    if !record.cleanup_recovery.as_ref().is_some_and(|cleanup| {
        cleanup.process_tree_cleanup && cleanup.orphan_count == Some(0) && !cleanup.cleanup_required
    }) {
        return Err("time-travel source cleanup is not verified zero.".to_string());
    }
    let cleanup = read_native_cleanup_recovery(&request.run_id)?
        .ok_or_else(|| "time-travel source durable cleanup evidence is missing.".to_string())?;
    if !cleanup.process_tree_cleanup || cleanup.orphan_count != Some(0) || cleanup.cleanup_required
    {
        return Err("time-travel source durable cleanup is not verified zero.".to_string());
    }
    let projection = read_committed_native_projection(request)?
        .ok_or_else(|| "time-travel source durable terminal projection is missing.".to_string())?;
    if native_terminal_state(&projection.state).is_none()
        || (record.state != NativeRunState::CleanedUp && projection.state != record.state.as_str())
    {
        return Err("time-travel source durable terminal projection is contradictory.".to_string());
    }
    Ok(())
}

fn load_validated_native_working_set_generation(
    scope_id: &str,
    generation_digest: &str,
) -> Result<NativeValidatedWorkingSetGeneration, String> {
    validate_opaque_id("scopeId", scope_id)?;
    if !is_sha256_hex(generation_digest) {
        return Err("native working-set generation digest is invalid.".to_string());
    }
    let generation_root = native_working_set_scope_dir(scope_id)?
        .join("checkpoints")
        .join("generations")
        .join(generation_digest);
    reject_native_link(&generation_root)?;
    let manifest_path = generation_root.join("manifest.json");
    reject_native_link(&manifest_path)?;
    let manifest_bytes = fs::read(&manifest_path)
        .map_err(|_| "native working-set checkpoint manifest is missing.".to_string())?;
    if manifest_bytes.len() > MAX_NATIVE_WORKING_SET_MANIFEST_BYTES {
        return Err("native working-set manifest exceeds the bounded byte limit.".to_string());
    }
    if stable_native_bytes_digest(&manifest_bytes) != generation_digest {
        return Err(
            "native working-set manifest integrity check failed before target mutation."
                .to_string(),
        );
    }
    let manifest: NativeWorkingSetManifest = serde_json::from_slice(&manifest_bytes)
        .map_err(|_| "native working-set manifest is corrupt.".to_string())?;
    if manifest.schema_version != NATIVE_WORKING_SET_SCHEMA
        || manifest.scope_id != scope_id
        || manifest.encrypted_at_rest
        || manifest.replays_external_effects
        || manifest.file_count > MAX_NATIVE_WORKING_SET_FILES
        || manifest.total_bytes > MAX_NATIVE_WORKING_SET_TOTAL_BYTES
    {
        return Err(
            "native working-set manifest version, scope, or boundary is unsupported.".to_string(),
        );
    }
    let files = collect_native_working_files(&generation_root.join("content"))?;
    if files.len() != manifest.file_count
        || files.len() != manifest.entries.len()
        || files
            .iter()
            .map(|(_, bytes)| bytes.len() as u64)
            .sum::<u64>()
            != manifest.total_bytes
    {
        return Err("native working-set bundle is incomplete before target mutation.".to_string());
    }
    for ((path, bytes), entry) in files.iter().zip(manifest.entries.iter()) {
        if path != &entry.path
            || bytes.len() as u64 != entry.bytes
            || stable_native_bytes_digest(bytes) != entry.digest
        {
            return Err(
                "native working-set content integrity failed before target mutation.".to_string(),
            );
        }
    }
    Ok(NativeValidatedWorkingSetGeneration {
        generation_digest: generation_digest.to_string(),
        manifest,
        files,
    })
}

fn read_native_time_travel_lineage(
    target_request: &RunnerCommandRequest,
) -> Result<Option<NativeTimeTravelLineage>, String> {
    let path =
        native_working_set_scope_dir(&target_request.run_id)?.join("time-travel-lineage.json");
    if !path.exists() {
        return Ok(None);
    }
    reject_native_link(&path)?;
    let lineage: NativeTimeTravelLineage = serde_json::from_slice(&read_bounded_native_run_file(
        &path,
        MAX_NATIVE_RUN_REGISTRY_RECORD_BYTES,
    )?)
    .map_err(|_| "native time-travel lineage is corrupt.".to_string())?;
    if lineage.schema_version != NATIVE_TIME_TRAVEL_LINEAGE_SCHEMA
        || lineage.resource_id != target_request.resource_id
        || lineage.session_id != target_request.session_id
        || lineage.target_run_id != target_request.run_id
        || lineage.source_run_id == lineage.target_run_id
        || !is_sha256_hex(&lineage.source_generation_digest)
        || !["retry", "resume", "replay"].contains(&lineage.mode.as_str())
        || lineage.replays_external_effects
        || !lineage.redacted
    {
        return Err("native time-travel lineage boundary is invalid.".to_string());
    }
    Ok(Some(lineage))
}

fn prepare_native_time_travel_lineage_for_approval(
    request: &RunnerCommandRequest,
) -> Result<Option<NativeApprovalTimeTravelLineage>, String> {
    let Some(lineage) = read_native_time_travel_lineage(request)? else {
        return Ok(None);
    };
    let checkpoint = capture_native_working_set(&request.run_id, None)?;
    Ok(Some(NativeApprovalTimeTravelLineage {
        mode: lineage.mode,
        source_run_id: lineage.source_run_id,
        source_generation_digest: lineage.source_generation_digest,
        target_generation_digest: checkpoint.generation_digest,
    }))
}

fn current_native_working_set_digest(scope_id: &str) -> Result<String, String> {
    let active_root = native_working_set_scope_dir(scope_id)?.join("active");
    reject_native_link(&active_root)?;
    let captured = collect_native_working_files(&active_root)?;
    let manifest = NativeWorkingSetManifest {
        schema_version: NATIVE_WORKING_SET_SCHEMA.to_string(),
        scope_id: scope_id.to_string(),
        file_count: captured.len(),
        total_bytes: captured.iter().map(|(_, bytes)| bytes.len() as u64).sum(),
        entries: captured
            .iter()
            .map(|(path, bytes)| NativeWorkingSetManifestEntry {
                path: path.clone(),
                bytes: bytes.len() as u64,
                digest: stable_native_bytes_digest(bytes),
            })
            .collect(),
        encrypted_at_rest: false,
        replays_external_effects: false,
    };
    let bytes = serde_json::to_vec_pretty(&manifest)
        .map_err(|_| "native working-set manifest could not be serialized.".to_string())?;
    if bytes.len() > MAX_NATIVE_WORKING_SET_MANIFEST_BYTES {
        return Err("native working-set manifest exceeds the bounded byte limit.".to_string());
    }
    Ok(stable_native_bytes_digest(&bytes))
}

fn revalidate_native_time_travel_target(
    request: &RunnerCommandRequest,
    proposal_id: &str,
) -> Result<(), String> {
    let proposal = native_approval_proposal_records()
        .lock()
        .map_err(|_| "native approval proposal store is unavailable.".to_string())?
        .get(proposal_id)
        .cloned()
        .ok_or_else(|| "native approval proposal is unavailable.".to_string())?;
    let Some(approved) = proposal.time_travel_lineage else {
        return Ok(());
    };
    let current = read_native_time_travel_lineage(request)?
        .ok_or_else(|| "approved time-travel lineage is missing.".to_string())?;
    if current.mode != approved.mode
        || current.source_run_id != approved.source_run_id
        || current.source_generation_digest != approved.source_generation_digest
        || current_native_working_set_digest(&request.run_id)? != approved.target_generation_digest
        || read_native_working_set_pointer(
            &native_working_set_scope_dir(&request.run_id)?
                .join("checkpoints")
                .join("current.json"),
        )?
        .as_deref()
            != Some(approved.target_generation_digest.as_str())
    {
        return Err("time-travel target changed after explicit approval presentation.".to_string());
    }
    Ok(())
}

fn native_working_set_scope_dir(scope_id: &str) -> Result<PathBuf, String> {
    validate_opaque_id("scopeId", scope_id)?;
    Ok(native_run_root()?.join("working-sets").join(scope_id))
}

fn initialize_native_working_set(request: &RunnerCommandRequest) -> Result<(), String> {
    let adapter_id = approved_adapter_id(request)?;
    let active_root = native_working_set_scope_dir(&request.run_id)?.join("active");
    fs::create_dir_all(&active_root)
        .map_err(|error| format!("failed to create native working-set root: {error}"))?;
    reject_native_link(&active_root)?;
    write_synced_json(
        &active_root.join("context.json"),
        &serde_json::json!({
            "schemaVersion": "agentique.nativeWorkingSetContext.v1",
            "resourceId": request.resource_id,
            "sessionId": request.session_id,
            "runId": request.run_id,
            "adapterId": adapter_id,
            "state": "prepared"
        }),
    )
}

fn finalize_native_working_set(
    request: &RunnerCommandRequest,
    state: &NativeRunState,
) -> Result<NativeWorkingSetCheckpointReceipt, String> {
    let scope_dir = native_working_set_scope_dir(&request.run_id)?;
    let active_root = scope_dir.join("active");
    reject_native_link(&active_root)?;
    write_synced_json(
        &active_root.join("terminal.json"),
        &serde_json::json!({
            "schemaVersion": "agentique.nativeWorkingSetTerminal.v1",
            "runId": request.run_id,
            "state": state.as_str(),
            "replaysExternalEffects": false
        }),
    )?;
    let pointer_path = scope_dir.join("checkpoints").join("current.json");
    let expected_pointer_digest = read_native_working_set_pointer(&pointer_path)?;
    // CRITICAL: an approval interrupt may already own the current immutable generation. Terminal
    // capture must CAS from that exact pointer; assuming no predecessor breaks safe pause/resume.
    capture_native_working_set(&request.run_id, expected_pointer_digest.as_deref())
}

fn capture_native_working_set(
    scope_id: &str,
    expected_pointer_digest: Option<&str>,
) -> Result<NativeWorkingSetCheckpointReceipt, String> {
    let scope_dir = native_working_set_scope_dir(scope_id)?;
    let active_root = scope_dir.join("active");
    reject_native_link(&active_root)?;
    if !fs::metadata(&active_root)
        .map_err(|_| "native working-set root is missing.".to_string())?
        .is_dir()
    {
        return Err("native working-set root must be a dedicated directory.".to_string());
    }
    let captured = collect_native_working_files(&active_root)?;
    let entries = captured
        .iter()
        .map(|(path, bytes)| NativeWorkingSetManifestEntry {
            path: path.clone(),
            bytes: bytes.len() as u64,
            digest: stable_native_bytes_digest(bytes),
        })
        .collect::<Vec<_>>();
    let manifest = NativeWorkingSetManifest {
        schema_version: NATIVE_WORKING_SET_SCHEMA.to_string(),
        scope_id: scope_id.to_string(),
        file_count: entries.len(),
        total_bytes: entries.iter().map(|entry| entry.bytes).sum(),
        entries,
        encrypted_at_rest: false,
        replays_external_effects: false,
    };
    let manifest_bytes = serde_json::to_vec_pretty(&manifest)
        .map_err(|_| "native working-set manifest could not be serialized.".to_string())?;
    if manifest_bytes.len() > MAX_NATIVE_WORKING_SET_MANIFEST_BYTES {
        return Err("native working-set manifest exceeds the bounded byte limit.".to_string());
    }
    let generation_digest = stable_native_bytes_digest(&manifest_bytes);
    let checkpoint_root = scope_dir.join("checkpoints");
    let generation_root = checkpoint_root.join("generations").join(&generation_digest);
    let pointer_path = checkpoint_root.join("current.json");
    let current_digest = read_native_working_set_pointer(&pointer_path)?;
    if current_digest.as_deref() == Some(&generation_digest) {
        return Ok(native_working_set_receipt(
            scope_id,
            &generation_digest,
            &manifest,
            true,
            false,
        ));
    }
    if current_digest.as_deref() != expected_pointer_digest {
        return Err("native working-set checkpoint CAS conflict.".to_string());
    }

    fs::create_dir_all(checkpoint_root.join("generations"))
        .map_err(|error| format!("failed to create native working-set store: {error}"))?;
    let staging_root = checkpoint_root.join(format!(".staging-{generation_digest}"));
    if staging_root.exists() {
        reject_native_link(&staging_root)?;
        fs::remove_dir_all(&staging_root)
            .map_err(|error| format!("failed to clear native working-set staging: {error}"))?;
    }
    let content_root = staging_root.join("content");
    fs::create_dir_all(&content_root)
        .map_err(|error| format!("failed to create native working-set staging: {error}"))?;
    for (relative, bytes) in &captured {
        let destination = content_root.join(relative.replace('/', std::path::MAIN_SEPARATOR_STR));
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                format!("failed to create native working-set content parent: {error}")
            })?;
        }
        write_synced_file(&destination, bytes)?;
    }
    write_synced_file(&staging_root.join("manifest.json"), &manifest_bytes)?;
    if generation_root.exists() {
        reject_native_link(&generation_root)?;
        fs::remove_dir_all(&staging_root)
            .map_err(|error| format!("failed to discard duplicate checkpoint staging: {error}"))?;
    } else {
        fs::rename(&staging_root, &generation_root)
            .map_err(|error| format!("failed to commit native working-set generation: {error}"))?;
    }
    let pointer_temp = checkpoint_root.join("current.json.tmp");
    write_synced_json(
        &pointer_temp,
        &serde_json::json!({
            "schemaVersion": NATIVE_WORKING_SET_SCHEMA,
            "scopeId": scope_id,
            "generationDigest": generation_digest,
        }),
    )?;
    // CRITICAL: content and manifest must be immutable before this pointer rename grants authority.
    fs::rename(&pointer_temp, &pointer_path)
        .map_err(|error| format!("failed to commit native working-set pointer: {error}"))?;
    prune_native_working_set_generations(&checkpoint_root, &generation_digest)?;
    Ok(native_working_set_receipt(
        scope_id,
        &generation_digest,
        &manifest,
        false,
        false,
    ))
}

fn restore_native_working_set(scope_id: &str) -> Result<NativeWorkingSetCheckpointReceipt, String> {
    let scope_dir = native_working_set_scope_dir(scope_id)?;
    let checkpoint_root = scope_dir.join("checkpoints");
    let pointer_path = checkpoint_root.join("current.json");
    let generation_digest = read_native_working_set_pointer(&pointer_path)?
        .ok_or_else(|| "native working-set checkpoint pointer is missing.".to_string())?;
    let generation_root = checkpoint_root.join("generations").join(&generation_digest);
    reject_native_link(&generation_root)?;
    let manifest_path = generation_root.join("manifest.json");
    reject_native_link(&manifest_path)?;
    let manifest_bytes = fs::read(&manifest_path)
        .map_err(|_| "native working-set checkpoint manifest is missing.".to_string())?;
    if manifest_bytes.len() > MAX_NATIVE_WORKING_SET_MANIFEST_BYTES {
        return Err("native working-set manifest exceeds the bounded byte limit.".to_string());
    }
    if stable_native_bytes_digest(&manifest_bytes) != generation_digest {
        return Err("native working-set manifest integrity check failed before reset.".to_string());
    }
    let manifest: NativeWorkingSetManifest = serde_json::from_slice(&manifest_bytes)
        .map_err(|_| "native working-set manifest is corrupt.".to_string())?;
    if manifest.schema_version != NATIVE_WORKING_SET_SCHEMA || manifest.scope_id != scope_id {
        return Err("native working-set manifest version or scope is unsupported.".to_string());
    }
    let validated = collect_native_working_files(&generation_root.join("content"))?;
    if validated.len() != manifest.entries.len() {
        return Err("native working-set bundle is incomplete before reset.".to_string());
    }
    for ((path, bytes), entry) in validated.iter().zip(manifest.entries.iter()) {
        if path != &entry.path
            || bytes.len() as u64 != entry.bytes
            || stable_native_bytes_digest(bytes) != entry.digest
        {
            return Err("native working-set content integrity failed before reset.".to_string());
        }
    }

    let active_root = scope_dir.join("active");
    let backup_root = scope_dir.join(".restore-backup");
    let staging_root = scope_dir.join(".restore-staging");
    for path in [&backup_root, &staging_root] {
        if path.exists() {
            reject_native_link(path)?;
            fs::remove_dir_all(path)
                .map_err(|error| format!("failed to clear native restore staging: {error}"))?;
        }
    }
    if active_root.exists() {
        reject_native_link(&active_root)?;
        fs::rename(&active_root, &backup_root)
            .map_err(|error| format!("native working-set privileged reset failed: {error}"))?;
    }
    // CRITICAL: validation above must stay before reset; otherwise corrupt content can destroy the live disposable root.
    fs::create_dir_all(&staging_root)
        .map_err(|error| format!("native working-set restore needs cleanup: {error}"))?;
    for (relative, bytes) in &validated {
        let destination = staging_root.join(relative.replace('/', std::path::MAIN_SEPARATOR_STR));
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("native working-set restore needs cleanup: {error}"))?;
        }
        write_synced_file(&destination, bytes)
            .map_err(|error| format!("native working-set restore needs cleanup: {error}"))?;
    }
    fs::rename(&staging_root, &active_root)
        .map_err(|error| format!("native working-set restore needs cleanup: {error}"))?;
    if backup_root.exists() {
        fs::remove_dir_all(&backup_root)
            .map_err(|error| format!("native working-set restore needs cleanup: {error}"))?;
    }
    Ok(native_working_set_receipt(
        scope_id,
        &generation_digest,
        &manifest,
        false,
        true,
    ))
}

fn collect_native_working_files(root: &Path) -> Result<Vec<(String, Vec<u8>)>, String> {
    let mut output = Vec::new();
    collect_native_working_files_at(root, root, 0, &mut output)?;
    output.sort_by(|left, right| left.0.cmp(&right.0));
    if output.len() > MAX_NATIVE_WORKING_SET_FILES {
        return Err("native working-set file count exceeds policy.".to_string());
    }
    let total = output
        .iter()
        .map(|(_, bytes)| bytes.len() as u64)
        .sum::<u64>();
    if total > MAX_NATIVE_WORKING_SET_TOTAL_BYTES {
        return Err("native working-set total bytes exceed policy.".to_string());
    }
    let mut collision_keys = std::collections::HashSet::new();
    for (relative, _) in &output {
        validate_native_working_relative(relative, &mut collision_keys)?;
    }
    Ok(output)
}

fn collect_native_working_files_at(
    root: &Path,
    current: &Path,
    depth: usize,
    output: &mut Vec<(String, Vec<u8>)>,
) -> Result<(), String> {
    if depth > MAX_NATIVE_WORKING_SET_DEPTH {
        return Err("native working-set path exceeds depth policy.".to_string());
    }
    reject_native_link(current)?;
    let metadata = fs::metadata(current)
        .map_err(|error| format!("failed to inspect native working-set entry: {error}"))?;
    if metadata.is_file() {
        if native_file_link_count(current, &metadata)? > 1 {
            return Err("native working-set hard links are forbidden.".to_string());
        }
        if metadata.len() > MAX_NATIVE_WORKING_SET_FILE_BYTES {
            return Err("native working-set file exceeds policy.".to_string());
        }
        let relative = current
            .strip_prefix(root)
            .map_err(|_| "native working-set entry escaped its root.".to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        let identity_before = (metadata.len(), metadata.modified().ok());
        let bytes = fs::read(current)
            .map_err(|error| format!("failed to read native working-set entry: {error}"))?;
        let identity_after_metadata = fs::metadata(current)
            .map_err(|error| format!("failed to recheck native working-set entry: {error}"))?;
        if identity_before
            != (
                identity_after_metadata.len(),
                identity_after_metadata.modified().ok(),
            )
        {
            return Err("native working-set entry identity changed during capture.".to_string());
        }
        if contains_unsafe_projection_material(&bytes) {
            return Err(
                "native working-set entry contains private or sensitive material.".to_string(),
            );
        }
        output.push((relative, bytes));
        return Ok(());
    }
    if !metadata.is_dir() {
        return Err("native working-set accepts regular files and directories only.".to_string());
    }
    let mut entries = fs::read_dir(current)
        .map_err(|error| format!("failed to enumerate native working-set root: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("failed to enumerate native working-set entry: {error}"))?;
    entries.sort_by_key(|entry| entry.file_name());
    for entry in entries {
        collect_native_working_files_at(root, &entry.path(), depth + 1, output)?;
    }
    Ok(())
}

fn validate_native_working_relative(
    relative: &str,
    collision_keys: &mut std::collections::HashSet<String>,
) -> Result<(), String> {
    if relative.is_empty()
        || relative.starts_with('/')
        || relative.contains('\\')
        || relative.contains(':')
        || relative.chars().count() > MAX_NATIVE_WORKING_SET_PATH_CHARS
    {
        return Err("native working-set path is not a bounded portable relative path.".to_string());
    }
    let segments = relative.split('/').collect::<Vec<_>>();
    if segments.len() > MAX_NATIVE_WORKING_SET_DEPTH
        || segments
            .iter()
            .any(|segment| segment.is_empty() || *segment == "." || *segment == "..")
    {
        return Err(
            "native working-set path contains traversal or exceeds depth policy.".to_string(),
        );
    }
    for segment in &segments {
        let lower = segment.to_lowercase();
        let stem = lower.split('.').next().unwrap_or("");
        if ["con", "prn", "aux", "nul"].contains(&stem)
            || (stem.len() == 4
                && (stem.starts_with("com") || stem.starts_with("lpt"))
                && stem
                    .chars()
                    .last()
                    .is_some_and(|value| ('1'..='9').contains(&value)))
        {
            return Err("native working-set path uses a reserved device name.".to_string());
        }
        if [
            ".env", ".ssh", ".aws", ".azure", ".config", "cookies", "browser", "vault",
        ]
        .contains(&lower.as_str())
            || lower == [".", "planning"].concat()
            || lower == ["ref", "erence"].concat()
        {
            return Err("native working-set path targets private material.".to_string());
        }
        if segment
            .chars()
            .any(|value| ('\u{0300}'..='\u{036f}').contains(&value))
        {
            return Err(
                "native working-set Unicode path is not in portable composed form.".to_string(),
            );
        }
    }
    if !collision_keys.insert(relative.to_lowercase()) {
        return Err("native working-set path collides after portable case folding.".to_string());
    }
    Ok(())
}

fn read_native_working_set_pointer(path: &Path) -> Result<Option<String>, String> {
    if !path.exists() {
        return Ok(None);
    }
    reject_native_link(path)?;
    let value: serde_json::Value = serde_json::from_slice(
        &fs::read(path).map_err(|_| "native working-set pointer could not be read.".to_string())?,
    )
    .map_err(|_| "native working-set pointer is corrupt.".to_string())?;
    if value.get("schemaVersion").and_then(|item| item.as_str()) != Some(NATIVE_WORKING_SET_SCHEMA)
    {
        return Err("native working-set pointer schema is unsupported.".to_string());
    }
    let digest = value
        .get("generationDigest")
        .and_then(|item| item.as_str())
        .filter(|item| is_sha256_hex(item))
        .ok_or_else(|| "native working-set pointer digest is invalid.".to_string())?;
    Ok(Some(digest.to_ascii_lowercase()))
}

fn native_working_set_receipt(
    scope_id: &str,
    generation_digest: &str,
    manifest: &NativeWorkingSetManifest,
    idempotent: bool,
    restored: bool,
) -> NativeWorkingSetCheckpointReceipt {
    NativeWorkingSetCheckpointReceipt {
        schema_version: NATIVE_WORKING_SET_RECEIPT_SCHEMA.to_string(),
        scope_id: scope_id.to_string(),
        generation_digest: generation_digest.to_string(),
        committed: true,
        idempotent,
        restored,
        file_count: manifest.file_count,
        total_bytes: manifest.total_bytes,
        generation_ref: format!(
            "working-sets/{scope_id}/checkpoints/generations/{generation_digest}"
        ),
        pointer_ref: format!("working-sets/{scope_id}/checkpoints/current.json"),
        root_ref: format!("working-sets/{scope_id}/active"),
        encrypted_at_rest: false,
        replays_external_effects: false,
        redacted: true,
    }
}

fn prune_native_working_set_generations(
    checkpoint_root: &Path,
    current_digest: &str,
) -> Result<(), String> {
    let root = checkpoint_root.join("generations");
    let mut entries = fs::read_dir(&root)
        .map_err(|error| format!("failed to read native working-set generations: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("failed to read native working-set generation: {error}"))?;
    entries.sort_by_key(|entry| {
        entry
            .metadata()
            .and_then(|item| item.modified())
            .unwrap_or(UNIX_EPOCH)
    });
    while entries.len() > MAX_NATIVE_WORKING_SET_GENERATIONS {
        let index = entries
            .iter()
            .position(|entry| entry.file_name().to_string_lossy() != current_digest)
            .ok_or_else(|| {
                "native working-set retention could not preserve authority.".to_string()
            })?;
        let entry = entries.remove(index);
        reject_native_link(&entry.path())?;
        fs::remove_dir_all(entry.path())
            .map_err(|error| format!("failed to prune native working-set generation: {error}"))?;
    }
    Ok(())
}

fn stable_native_bytes_digest(bytes: &[u8]) -> String {
    let mut hash = 2_166_136_261_u32;
    for byte in bytes {
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

#[cfg(unix)]
fn native_file_link_count(_path: &Path, metadata: &fs::Metadata) -> Result<u64, String> {
    use std::os::unix::fs::MetadataExt;
    Ok(metadata.nlink())
}

#[cfg(windows)]
fn native_file_link_count(path: &Path, _metadata: &fs::Metadata) -> Result<u64, String> {
    use std::ffi::c_void;
    use std::os::windows::io::AsRawHandle;

    #[repr(C)]
    struct FileTime {
        low: u32,
        high: u32,
    }
    #[repr(C)]
    struct ByHandleFileInformation {
        attributes: u32,
        creation_time: FileTime,
        last_access_time: FileTime,
        last_write_time: FileTime,
        volume_serial_number: u32,
        file_size_high: u32,
        file_size_low: u32,
        number_of_links: u32,
        file_index_high: u32,
        file_index_low: u32,
    }
    #[link(name = "Kernel32")]
    extern "system" {
        fn GetFileInformationByHandle(
            file: *mut c_void,
            information: *mut ByHandleFileInformation,
        ) -> i32;
    }

    let file = fs::File::open(path)
        .map_err(|error| format!("failed to open native working-set identity handle: {error}"))?;
    let mut information = std::mem::MaybeUninit::<ByHandleFileInformation>::uninit();
    // CRITICAL: Windows stable Rust does not expose link count; fail closed if the handle query fails.
    let ok = unsafe {
        GetFileInformationByHandle(file.as_raw_handle().cast(), information.as_mut_ptr())
    };
    if ok == 0 {
        return Err("native working-set hard-link identity query failed.".to_string());
    }
    Ok(unsafe { information.assume_init() }.number_of_links as u64)
}

#[cfg(not(any(unix, windows)))]
fn native_file_link_count(_path: &Path, _metadata: &fs::Metadata) -> Result<u64, String> {
    Err("native working-set hard-link identity is unsupported on this platform.".to_string())
}

fn finish_native_coordinator(run_id: &str, worker_active: &Arc<AtomicBool>) {
    worker_active.store(false, Ordering::SeqCst);
    if let Ok(mut records) = native_coordinator_records().lock() {
        records.remove(run_id);
    }
}

#[allow(dead_code)]
fn agentique_runner_start_legacy(
    request: RunnerCommandRequest,
) -> Result<RunnerCommandReceipt, String> {
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
    // CRITICAL: identifiers are evidence only; the exact native-owned explicit decision must
    // remain current and digest-matched before any effect or legacy echo could reach launch.
    validate_native_approval_for_start(
        &request,
        record,
        &adapter_manifest,
        &approval_id,
        &permission_grant_id,
    )?;
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
    validate_runner_request(&request)?;
    let adapter_id = approved_adapter_id(&request)?;
    let permission_profile_id = approved_permission_profile_id(&request)?;
    let adapter_manifest = resolve_adapter_manifest(&adapter_id)?;
    let adapter_manifest_receipt = review_adapter_manifest(&adapter_manifest)?;
    let state = scoped_run_state(&request, &adapter_id, &permission_profile_id)?;
    if state == RUNNER_PENDING_APPROVAL_STATE {
        return cleanup_recovery_transition(
            "agentique_runner_cancel",
            "cancel-cleanup",
            request,
            &[NativeRunState::PendingApproval],
            NativeRunState::Canceled,
            None,
        );
    }
    if !matches!(state.as_str(), "running" | "canceling") {
        return Err(format!(
            "agentique_runner_cancel cannot transition a run from {state}."
        ));
    }
    let coordinator = native_coordinator_records()
        .lock()
        .map_err(|_| "native coordinator store is unavailable.".to_string())?
        .get(&request.run_id)
        .cloned()
        .ok_or_else(|| "active native coordinator handle is unavailable.".to_string())?;
    if coordinator.address_key != native_run_address_key(&request)
        || !coordinator.worker_active.load(Ordering::SeqCst)
    {
        return Err(
            "active native coordinator does not match the complete run address.".to_string(),
        );
    }
    {
        let mut intent = coordinator
            .terminal_intent
            .lock()
            .map_err(|_| "native coordinator terminal intent is unavailable.".to_string())?;
        match intent.as_ref() {
            None | Some(NativeRunState::Canceled) => {
                *intent = Some(NativeRunState::Canceled);
            }
            Some(existing) => {
                return Err(format!(
                    "native coordinator terminal state is already claimed as {}.",
                    existing.as_str()
                ));
            }
        }
    }
    {
        persist_native_run_registry(&request, &NativeRunState::Canceling)?;
        let mut records = runner_records()
            .lock()
            .map_err(|_| "native runner record store is unavailable.".to_string())?;
        let record = records
            .get_mut(&request.run_id)
            .ok_or_else(|| "runId does not have a native-owned run record.".to_string())?;
        ensure_scoped_run_record(record, &request, &adapter_id, &permission_profile_id)?;
        if record.state == NativeRunState::Running {
            record.state = NativeRunState::Canceling;
        }
    }
    coordinator.cancel_requested.store(true, Ordering::SeqCst);
    let cancel_label = if coordinator.process_tree_supervisor.is_some() {
        "Native cancel claimed terminal intent and signaled the retained process handle."
    } else {
        "Native cancel claimed terminal intent for the bounded in-process worker."
    };
    record_native_event(
        &request,
        "cancel.requested",
        "running",
        cancel_label,
        NativeRunnerEventDetails {
            adapter_id: Some(adapter_id.clone()),
            status: Some("canceling".to_string()),
            ..NativeRunnerEventDetails::default()
        },
    )?;
    let event_replay = event_replay_for(&request)?;
    runner_transition_receipt(
        "agentique_runner_cancel",
        "canceling",
        if coordinator.process_tree_supervisor.is_some() {
            "Native coordinator is terminating the exact retained process handle."
        } else {
            "Native coordinator will discard any late in-process result at the terminal fence."
        },
        request,
        false,
        Some(adapter_id),
        None,
        Some(permission_profile_id),
        Some(adapter_manifest_receipt),
        None,
        None,
        None,
        None,
        Some(event_replay),
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
    let product_projection = runner_records().lock().ok().and_then(|records| {
        records
            .get(&request.run_id)
            .and_then(|record| record.product_projection.clone())
    });
    let working_set_checkpoint = runner_records().lock().ok().and_then(|records| {
        records
            .get(&request.run_id)
            .and_then(|record| record.working_set_checkpoint.clone())
    });
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
        product_projection,
        working_set_checkpoint,
    })
}

fn cleanup_recovery_transition(
    command: &str,
    transition: &str,
    request: RunnerCommandRequest,
    allowed_states: &[NativeRunState],
    next_state: NativeRunState,
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
        let cleanup = if record.state == NativeRunState::PendingApproval {
            NativeProcessCleanupObservation::verified_zero("fixed-adapter-not-launched")
        } else if record
            .cleanup_recovery
            .as_ref()
            .is_some_and(|value| value.process_tree_cleanup && value.orphan_count == Some(0))
        {
            NativeProcessCleanupObservation::verified_zero("previous-live-cleanup-verified")
        } else {
            // CRITICAL: process death discards the live Job Object owner. Without a durable
            // run registry, retry must stay cleanup-required rather than fabricate zero orphans.
            NativeProcessCleanupObservation::unverified("restart-supervisor-unavailable")
        };
        let effective_state = if cleanup.process_tree_cleanup {
            next_state
        } else {
            NativeRunState::CleanupRequired
        };
        let cleanup_status = if cleanup.process_tree_cleanup {
            "cleaned-up"
        } else {
            "cleanup-required"
        };
        let receipt = native_cleanup_recovery_receipt(
            command,
            transition,
            &request.run_id,
            effective_state.as_str(),
            cleanup_status,
            recovery_reason.clone(),
            &cleanup,
        );
        write_native_cleanup_recovery(&request.run_id, &receipt)?;
        persist_native_run_registry(&request, &effective_state)?;
        record.state = effective_state;
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
        if receipt.process_tree_cleanup {
            "cleanup.completed"
        } else {
            "cleanup.required"
        },
        "cleanup",
        if receipt.process_tree_cleanup {
            "Native process-tree cleanup receipt recorded with zero tested-platform orphans."
        } else {
            "Native process-tree cleanup remains unverified and requires durable recovery evidence."
        },
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
    if !recover_native_registry_record_if_needed(&request, &adapter_id, &permission_profile_id)? {
        recover_native_projection_record_if_needed(&request, &adapter_id, &permission_profile_id)?;
    }
    let cleanup_recovery =
        recover_stale_native_run_if_needed(&request, &adapter_id, &permission_profile_id)?;
    let state = scoped_run_state(&request, &adapter_id, &permission_profile_id)?;
    let execution = runner_records()
        .lock()
        .map_err(|_| "native runner record store is unavailable.".to_string())?
        .get(&request.run_id)
        .and_then(|record| record.execution.clone());
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
        execution,
        None,
        None,
        cleanup_recovery,
        Some(event_replay),
    )
}

fn recover_native_projection_record_if_needed(
    request: &RunnerCommandRequest,
    adapter_id: &str,
    permission_profile_id: &str,
) -> Result<(), String> {
    if runner_records()
        .lock()
        .map_err(|_| "native runner record store is unavailable.".to_string())?
        .contains_key(&request.run_id)
    {
        return Ok(());
    }

    let projection_dir = native_projection_run_dir(&request.run_id)?;
    let committed = read_committed_native_projection(request);
    let (state, projection, cleanup_recovery) = match committed {
        Ok(Some(receipt)) => {
            let state = native_terminal_state(&receipt.state)
                .ok_or_else(|| "native projection recovery terminal is invalid.".to_string())?;
            (state, receipt, None)
        }
        Ok(None) => {
            let active = projection_dir.join("active.json").exists();
            let partial = projection_dir
                .read_dir()
                .ok()
                .into_iter()
                .flatten()
                .filter_map(Result::ok)
                .any(|entry| entry.file_name().to_string_lossy().starts_with(".staging-"));
            if !active && !partial {
                return Ok(());
            }
            let classification = if partial {
                "partial"
            } else {
                "cleanup-required"
            };
            let receipt = interrupted_projection_receipt(request, classification);
            let cleanup = native_cleanup_recovery_receipt(
                "agentique_runner_status",
                "restart-recovery",
                &request.run_id,
                RUNNER_NATIVE_CLEANUP_REQUIRED_STATE,
                "cleanup-required",
                Some(format!("{classification}-projection")),
                &NativeProcessCleanupObservation::unverified("restart-supervisor-unavailable"),
            );
            write_native_cleanup_recovery(&request.run_id, &cleanup)?;
            (NativeRunState::CleanupRequired, receipt, Some(cleanup))
        }
        Err(error) => {
            let classification = if error.contains("unsupported") {
                "unsupported"
            } else {
                "corrupt"
            };
            let receipt = interrupted_projection_receipt(request, classification);
            let cleanup = native_cleanup_recovery_receipt(
                "agentique_runner_status",
                "restart-recovery",
                &request.run_id,
                RUNNER_NATIVE_CLEANUP_REQUIRED_STATE,
                "cleanup-required",
                Some(format!("{classification}-projection")),
                &NativeProcessCleanupObservation::unverified("restart-supervisor-unavailable"),
            );
            write_native_cleanup_recovery(&request.run_id, &cleanup)?;
            (NativeRunState::CleanupRequired, receipt, Some(cleanup))
        }
    };

    let manifest = resolve_adapter_manifest(adapter_id)?;
    runner_records()
        .lock()
        .map_err(|_| "native runner record store is unavailable.".to_string())?
        .insert(
            request.run_id.clone(),
            NativeRunRecord {
                resource_id: request.resource_id.clone(),
                session_id: request.session_id.clone(),
                run_id: request.run_id.clone(),
                adapter_id: adapter_id.to_string(),
                approval_id: "recovered-evidence-only".to_string(),
                permission_profile_id: permission_profile_id.to_string(),
                adapter_manifest_id: manifest.manifest_id,
                adapter_manifest_digest: manifest.digest,
                permission_grant_id: None,
                state,
                approval_consumed: true,
                execution: None,
                cleanup_recovery,
                product_projection: Some(projection),
                working_set_checkpoint: None,
            },
        );
    Ok(())
}

fn interrupted_projection_receipt(
    request: &RunnerCommandRequest,
    classification: &str,
) -> NativeProductProjectionReceipt {
    NativeProductProjectionReceipt {
        schema_version: NATIVE_PRODUCT_PROJECTION_RECEIPT_SCHEMA.to_string(),
        resource_id: request.resource_id.clone(),
        session_id: request.session_id.clone(),
        run_id: request.run_id.clone(),
        candidate_digest: stable_native_digest(&native_run_address_key(request)),
        state: RUNNER_NATIVE_CLEANUP_REQUIRED_STATE.to_string(),
        committed: false,
        idempotent: false,
        generation_ref: "uncommitted-generation".to_string(),
        pointer_ref: format!("projections/{}/current.json", request.run_id),
        artifact_refs: Vec::new(),
        recovery_classification: classification.to_string(),
        redacted: true,
    }
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
        if !matches!(
            record.state,
            NativeRunState::Running | NativeRunState::Canceling
        ) {
            return Ok(record.cleanup_recovery.clone());
        }
        // IMPORTANT: replay must not reinterpret a process-local active coordinator as a
        // restart orphan; doing so races the retained child and fabricates cleanup state.
        if native_coordinator_records()
            .lock()
            .map_err(|_| "native coordinator store is unavailable.".to_string())?
            .get(&request.run_id)
            .is_some_and(|coordinator| coordinator.worker_active.load(Ordering::SeqCst))
        {
            return Ok(record.cleanup_recovery.clone());
        }
        let receipt = native_cleanup_recovery_receipt(
            "agentique_runner_status",
            "restart-recovery",
            &request.run_id,
            RUNNER_NATIVE_CLEANUP_REQUIRED_STATE,
            "cleanup-required",
            Some("stale-incomplete-run".to_string()),
            &NativeProcessCleanupObservation::unverified("restart-supervisor-unavailable"),
        );
        write_native_cleanup_recovery(&request.run_id, &receipt)?;
        persist_native_run_registry(request, &NativeRunState::CleanupRequired)?;
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

fn create_native_approval_proposal_record(
    request: &RunnerCommandRequest,
    adapter_id: &str,
    permission_profile_id: &str,
    adapter_manifest: &NativeAdapterManifest,
    proposal_id: &str,
    time_travel_lineage: Option<NativeApprovalTimeTravelLineage>,
) -> NativeApprovalProposalRecord {
    let now = current_epoch_seconds();
    let mut record = NativeApprovalProposalRecord {
        resource_id: request.resource_id.clone(),
        session_id: request.session_id.clone(),
        run_id: request.run_id.clone(),
        adapter_id: adapter_id.to_string(),
        runtime_id: "agentique-fixed-engine".to_string(),
        permission_profile_id: permission_profile_id.to_string(),
        adapter_manifest_id: adapter_manifest.manifest_id.clone(),
        adapter_manifest_digest: adapter_manifest.digest.clone(),
        proposal_id: proposal_id.to_string(),
        proposal_digest: String::new(),
        action_id: "adapter.run".to_string(),
        target_refs: vec!["workspace:inputs".to_string(), "workspace:runs".to_string()],
        risk: "medium".to_string(),
        capability_ceiling: vec![
            "files".to_string(),
            "subprocess".to_string(),
            "artifactRetention".to_string(),
        ],
        distribution_mode: "bundled-fixed".to_string(),
        abort_path: "agentique-runner-cancel".to_string(),
        time_travel_lineage,
        status: "pending".to_string(),
        actor_id: None,
        decision_id: None,
        created_at_epoch_seconds: now,
        expires_at_epoch_seconds: now + NATIVE_APPROVAL_PROPOSAL_TTL_SECONDS,
    };
    record.proposal_digest = canonical_native_approval_digest(&record);
    record
}

fn canonical_native_approval_digest(record: &NativeApprovalProposalRecord) -> String {
    let lineage = record
        .time_travel_lineage
        .as_ref()
        .map(|value| {
            format!(
                "{}:{}:{}:{}",
                value.mode,
                value.source_run_id,
                value.source_generation_digest,
                value.target_generation_digest
            )
        })
        .unwrap_or_else(|| "none".to_string());
    stable_native_digest(&format!(
        "{}:{}:{}:{}:{}:{}:{}:{}:{}:{}:{}:{}:{}:{}:{}:{}",
        record.resource_id,
        record.session_id,
        record.run_id,
        record.adapter_id,
        record.runtime_id,
        record.permission_profile_id,
        record.adapter_manifest_id,
        record.adapter_manifest_digest,
        record.proposal_id,
        record.action_id,
        record.target_refs.join(","),
        record.risk,
        record.capability_ceiling.join(","),
        record.distribution_mode,
        record.abort_path,
        lineage
    ))
}

fn store_native_approval_proposal(record: NativeApprovalProposalRecord) -> Result<(), String> {
    native_approval_proposal_records()
        .lock()
        .map_err(|_| "native approval proposal store is unavailable.".to_string())?
        .insert(record.proposal_id.clone(), record);
    Ok(())
}

fn native_approval_proposal_receipt(
    record: &NativeApprovalProposalRecord,
) -> NativeApprovalProposalReceipt {
    NativeApprovalProposalReceipt {
        schema_version: NATIVE_APPROVAL_PROPOSAL_SCHEMA.to_string(),
        proposal_id: record.proposal_id.clone(),
        proposal_digest: record.proposal_digest.clone(),
        status: record.status.clone(),
        policy_owner: "agentique-native-host".to_string(),
        presentation_owner: "agentique-ui".to_string(),
        resource_id: record.resource_id.clone(),
        session_id: record.session_id.clone(),
        run_id: record.run_id.clone(),
        adapter_id: record.adapter_id.clone(),
        runtime_id: record.runtime_id.clone(),
        manifest_digest_prefix: record.adapter_manifest_digest.chars().take(12).collect(),
        action_id: record.action_id.clone(),
        target_refs: record.target_refs.clone(),
        risk: record.risk.clone(),
        capability_ceiling: record.capability_ceiling.clone(),
        distribution_mode: record.distribution_mode.clone(),
        abort_path: record.abort_path.clone(),
        time_travel_lineage: record.time_travel_lineage.clone(),
        created_at_epoch_seconds: record.created_at_epoch_seconds,
        expires_at_epoch_seconds: record.expires_at_epoch_seconds,
        redacted: true,
    }
}

fn ensure_native_approval_scope(
    proposal: &NativeApprovalProposalRecord,
    request: &RunnerCommandRequest,
) -> Result<(), String> {
    if proposal.resource_id != request.resource_id
        || proposal.session_id != request.session_id
        || proposal.run_id != request.run_id
        || request.approval_id.as_deref() != Some(proposal.proposal_id.as_str())
    {
        return Err("approval proposal is not scoped to the supplied run address.".to_string());
    }
    Ok(())
}

fn validate_native_approval_for_start(
    request: &RunnerCommandRequest,
    run_record: &NativeRunRecord,
    adapter_manifest: &NativeAdapterManifest,
    proposal_id: &str,
    permission_grant_id: &str,
) -> Result<(), String> {
    let proposals = native_approval_proposal_records()
        .lock()
        .map_err(|_| "native approval proposal store is unavailable.".to_string())?;
    let proposal = proposals.get(proposal_id).ok_or_else(|| {
        "legacy approvalId is non-authorizing without an explicit decision record.".to_string()
    })?;
    ensure_native_approval_scope(proposal, request)?;
    if proposal.status != "approved"
        || proposal.actor_id.is_none()
        || proposal.decision_id.is_none()
        || proposal.expires_at_epoch_seconds <= current_epoch_seconds()
    {
        return Err("approval proposal is missing an active explicit user decision.".to_string());
    }
    if canonical_native_approval_digest(proposal) != proposal.proposal_digest
        || proposal.adapter_id != run_record.adapter_id
        || proposal.permission_profile_id != run_record.permission_profile_id
        || proposal.adapter_manifest_id != adapter_manifest.manifest_id
        || proposal.adapter_manifest_digest != adapter_manifest.digest
        || proposal.action_id != "adapter.run"
        || proposal.distribution_mode != "bundled-fixed"
        || proposal.abort_path != "agentique-runner-cancel"
        || run_record.permission_grant_id.as_deref() != Some(permission_grant_id)
    {
        return Err(
            "approval proposal changed or exceeded its exact capability scope.".to_string(),
        );
    }
    Ok(())
}

fn create_native_permission_grant_record(
    proposal: &NativeApprovalProposalRecord,
    decision_id: &str,
    actor_id: &str,
    grant_id: &str,
) -> NativePermissionGrantRecord {
    NativePermissionGrantRecord {
        resource_id: proposal.resource_id.clone(),
        session_id: proposal.session_id.clone(),
        run_id: proposal.run_id.clone(),
        adapter_id: proposal.adapter_id.clone(),
        permission_profile_id: proposal.permission_profile_id.clone(),
        adapter_manifest_id: proposal.adapter_manifest_id.clone(),
        adapter_manifest_digest: proposal.adapter_manifest_digest.clone(),
        proposal_id: proposal.proposal_id.clone(),
        proposal_digest: proposal.proposal_digest.clone(),
        decision_id: decision_id.to_string(),
        actor_id: actor_id.to_string(),
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
    let consent_scoped = native_approval_proposal_records()
        .lock()
        .map_err(|_| "native approval proposal store is unavailable.".to_string())?
        .get(&grant.proposal_id)
        .map(|proposal| {
            proposal.decision_id.as_deref() == Some(grant.decision_id.as_str())
                && proposal.actor_id.as_deref() == Some(grant.actor_id.as_str())
                && proposal.status == "approved"
                && proposal.proposal_digest == grant.proposal_digest
        })
        .unwrap_or(false);
    let now = current_epoch_seconds();
    let scoped = grant.resource_id == request.resource_id
        && grant.session_id == request.session_id
        && grant.run_id == request.run_id
        && grant.adapter_id == run_record.adapter_id
        && grant.permission_profile_id == run_record.permission_profile_id
        && grant.adapter_manifest_id == adapter_manifest.manifest_id
        && grant.adapter_manifest_digest == adapter_manifest.digest
        && consent_scoped
        && grant.proposal_id == run_record.approval_id
        && run_record.permission_grant_id.as_deref() == Some(grant.grant_id.as_str());
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

fn preflight_native_run_for_scheduler(request: &RunnerCommandRequest) -> Result<(), String> {
    validate_runner_request(request)?;
    let adapter_id = approved_adapter_id(request)?;
    let permission_profile_id = approved_permission_profile_id(request)?;
    let adapter_manifest = resolve_adapter_manifest(&adapter_id)?;
    review_adapter_manifest(&adapter_manifest)?;
    let approval_id = request.approval_id.as_deref().ok_or_else(|| {
        "approvalId is required for scheduler admission of a fixed run attempt.".to_string()
    })?;
    let permission_grant_id = request.permission_grant_id.as_deref().ok_or_else(|| {
        "permissionGrantId is required for scheduler admission of a fixed run attempt.".to_string()
    })?;
    let run_record = runner_records()
        .lock()
        .map_err(|_| "native runner record store is unavailable.".to_string())?
        .get(&request.run_id)
        .cloned()
        .ok_or_else(|| "scheduler attempt does not have a native-owned pending run.".to_string())?;
    ensure_scoped_run_record(&run_record, request, &adapter_id, &permission_profile_id)?;
    if run_record.state != NativeRunState::PendingApproval || run_record.approval_consumed {
        return Err("scheduler attempt is not an unconsumed pending native run.".to_string());
    }
    if run_record.adapter_manifest_id != adapter_manifest.manifest_id
        || run_record.adapter_manifest_digest != adapter_manifest.digest
        || run_record.approval_id != approval_id
        || run_record.permission_grant_id.as_deref() != Some(permission_grant_id)
    {
        return Err("scheduler attempt identity does not match its native run record.".to_string());
    }
    validate_native_approval_for_start(
        request,
        &run_record,
        &adapter_manifest,
        approval_id,
        permission_grant_id,
    )?;

    let grant = native_permission_grant_records()
        .lock()
        .map_err(|_| "native permission grant store is unavailable.".to_string())?
        .get(permission_grant_id)
        .cloned()
        .ok_or_else(|| "scheduler attempt permission grant is unavailable.".to_string())?;
    let consent_scoped = native_approval_proposal_records()
        .lock()
        .map_err(|_| "native approval proposal store is unavailable.".to_string())?
        .get(&grant.proposal_id)
        .map(|proposal| {
            proposal.decision_id.as_deref() == Some(grant.decision_id.as_str())
                && proposal.actor_id.as_deref() == Some(grant.actor_id.as_str())
                && proposal.status == "approved"
                && proposal.proposal_digest == grant.proposal_digest
        })
        .unwrap_or(false);
    let scoped = grant.resource_id == request.resource_id
        && grant.session_id == request.session_id
        && grant.run_id == request.run_id
        && grant.adapter_id == adapter_id
        && grant.permission_profile_id == permission_profile_id
        && grant.adapter_manifest_id == adapter_manifest.manifest_id
        && grant.adapter_manifest_digest == adapter_manifest.digest
        && grant.proposal_id == approval_id
        && consent_scoped;
    if !scoped || grant.revoked || grant.consumed {
        return Err(
            "scheduler attempt grant is stale, revoked, consumed, or cross-scoped.".to_string(),
        );
    }
    if grant.expires_at_epoch_seconds <= current_epoch_seconds() {
        return Err("scheduler attempt grant expired before admission.".to_string());
    }
    Ok(())
}

fn preflight_native_interrupt_pending(
    request: &RunnerCommandRequest,
) -> Result<(String, u64), String> {
    validate_runner_request(request)?;
    if request.permission_grant_id.is_some() {
        return Err(
            "pending native approval interrupt must not contain permissionGrantId.".to_string(),
        );
    }
    let adapter_id = approved_adapter_id(request)?;
    let permission_profile_id = approved_permission_profile_id(request)?;
    let adapter_manifest = resolve_adapter_manifest(&adapter_id)?;
    review_adapter_manifest(&adapter_manifest)?;
    let approval_id = request.approval_id.as_deref().ok_or_else(|| {
        "approvalId is required for native approval interrupt admission.".to_string()
    })?;
    let run_record = runner_records()
        .lock()
        .map_err(|_| "native runner record store is unavailable.".to_string())?
        .get(&request.run_id)
        .cloned()
        .ok_or_else(|| {
            "approval interrupt does not have a native-owned pending run.".to_string()
        })?;
    ensure_scoped_run_record(&run_record, request, &adapter_id, &permission_profile_id)?;
    if run_record.state != NativeRunState::PendingApproval
        || run_record.approval_consumed
        || run_record.permission_grant_id.is_some()
        || run_record.approval_id != approval_id
        || run_record.adapter_manifest_id != adapter_manifest.manifest_id
        || run_record.adapter_manifest_digest != adapter_manifest.digest
    {
        return Err("approval interrupt pending run identity is stale or mismatched.".to_string());
    }
    let proposal = native_approval_proposal_records()
        .lock()
        .map_err(|_| "native approval proposal store is unavailable.".to_string())?
        .get(approval_id)
        .cloned()
        .ok_or_else(|| "approval interrupt proposal is unavailable.".to_string())?;
    ensure_native_approval_scope(&proposal, request)?;
    if proposal.status != "pending"
        || proposal.expires_at_epoch_seconds <= current_epoch_seconds()
        || proposal.proposal_digest != canonical_native_approval_digest(&proposal)
        || proposal.adapter_manifest_id != adapter_manifest.manifest_id
        || proposal.adapter_manifest_digest != adapter_manifest.digest
    {
        return Err("approval interrupt proposal is expired, decided, or drifted.".to_string());
    }
    Ok((proposal.proposal_digest, proposal.expires_at_epoch_seconds))
}

fn preflight_native_interrupt_decision(
    request: &RunnerCommandRequest,
    proposal_digest: &str,
    decision_id: &str,
    decision: &str,
) -> Result<(), String> {
    validate_runner_request(request)?;
    validate_opaque_id("decisionId", decision_id)?;
    let proposal_id = request.approval_id.as_deref().ok_or_else(|| {
        "proposalId is required for native approval interrupt resume.".to_string()
    })?;
    let proposal = native_approval_proposal_records()
        .lock()
        .map_err(|_| "native approval proposal store is unavailable.".to_string())?
        .get(proposal_id)
        .cloned()
        .ok_or_else(|| "native approval interrupt decision proposal is unavailable.".to_string())?;
    ensure_native_approval_scope(&proposal, request)?;
    if proposal.proposal_digest != proposal_digest
        || proposal.proposal_digest != canonical_native_approval_digest(&proposal)
        || proposal.decision_id.as_deref() != Some(decision_id)
        || proposal.status != decision
    {
        return Err(
            "native approval interrupt decision is stale, drifted, or mismatched.".to_string(),
        );
    }
    if decision == "denied" {
        if request.permission_grant_id.is_some() {
            return Err("denied native approval interrupt must not include a grant.".to_string());
        }
        return Ok(());
    }
    if decision != "approved" {
        return Err("native approval interrupt decision is unsupported.".to_string());
    }
    preflight_native_run_for_scheduler(request)?;
    let grant_id = request.permission_grant_id.as_deref().ok_or_else(|| {
        "approved native approval interrupt requires permissionGrantId.".to_string()
    })?;
    let grant = native_permission_grant_records()
        .lock()
        .map_err(|_| "native permission grant store is unavailable.".to_string())?
        .get(grant_id)
        .cloned()
        .ok_or_else(|| "native approval interrupt permission grant is unavailable.".to_string())?;
    if grant.decision_id != decision_id || grant.proposal_digest != proposal_digest {
        return Err(
            "native approval interrupt decision and permission grant do not match.".to_string(),
        );
    }
    Ok(())
}

fn validate_native_permission_grant_for_revocation(
    request: &RunnerCommandRequest,
    run_record: &NativeRunRecord,
    adapter_manifest: &NativeAdapterManifest,
    permission_grant_id: &str,
) -> Result<NativePermissionGrantRecord, String> {
    validate_opaque_id("permissionGrantId", permission_grant_id)?;
    let grant = native_permission_grant_records()
        .lock()
        .map_err(|_| "native permission grant store is unavailable.".to_string())?
        .get(permission_grant_id)
        .cloned()
        .ok_or_else(|| {
            "permissionGrantId is missing, stale, or not scoped to this run.".to_string()
        })?;
    let consent_scoped = native_approval_proposal_records()
        .lock()
        .map_err(|_| "native approval proposal store is unavailable.".to_string())?
        .get(&grant.proposal_id)
        .map(|proposal| {
            proposal.decision_id.as_deref() == Some(grant.decision_id.as_str())
                && proposal.actor_id.as_deref() == Some(grant.actor_id.as_str())
                && proposal.status == "approved"
                && proposal.proposal_digest == grant.proposal_digest
        })
        .unwrap_or(false);
    let scoped = grant.resource_id == request.resource_id
        && grant.session_id == request.session_id
        && grant.run_id == request.run_id
        && grant.adapter_id == run_record.adapter_id
        && grant.permission_profile_id == run_record.permission_profile_id
        && grant.adapter_manifest_id == adapter_manifest.manifest_id
        && grant.adapter_manifest_digest == adapter_manifest.digest
        && consent_scoped
        && grant.proposal_id == run_record.approval_id
        && run_record.permission_grant_id.as_deref() == Some(grant.grant_id.as_str());
    if !scoped {
        return Err(
            "permissionGrantId is not scoped to the supplied run, adapter, manifest, proposal, and permission profile."
                .to_string(),
        );
    }
    if grant.expires_at_epoch_seconds <= current_epoch_seconds() {
        return Err("permissionGrantId expired before native revocation.".to_string());
    }
    if run_record.state == NativeRunState::PendingApproval && grant.consumed {
        return Err("consumed permissionGrantId cannot revoke a pending run.".to_string());
    }
    if matches!(
        run_record.state,
        NativeRunState::Running | NativeRunState::Canceling
    ) && !grant.consumed
    {
        return Err("active native run does not own a consumed permissionGrantId.".to_string());
    }
    Ok(grant)
}

fn mark_native_permission_grant_revoked(
    validated: &NativePermissionGrantRecord,
) -> Result<NativePermissionGrantReceipt, String> {
    let mut grants = native_permission_grant_records()
        .lock()
        .map_err(|_| "native permission grant store is unavailable.".to_string())?;
    let grant = grants
        .get_mut(&validated.grant_id)
        .ok_or_else(|| "permissionGrantId disappeared before native revocation.".to_string())?;
    if grant.resource_id != validated.resource_id
        || grant.session_id != validated.session_id
        || grant.run_id != validated.run_id
        || grant.proposal_digest != validated.proposal_digest
        || grant.adapter_manifest_digest != validated.adapter_manifest_digest
    {
        return Err("permissionGrantId changed before native revocation.".to_string());
    }
    grant.revoked = true;
    Ok(native_permission_grant_receipt(grant, "revoked"))
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
        proposal_id: record.proposal_id.clone(),
        proposal_digest_prefix: record.proposal_digest.chars().take(12).collect(),
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
    let ledger_dir = native_event_ledger_dir(&request.run_id)?;
    if ledger_dir.exists() {
        reject_native_link(&ledger_dir)?;
        fs::remove_dir_all(&ledger_dir)
            .map_err(|error| format!("failed to reset durable native event ledger: {error}"))?;
    }
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
    if !records.contains_key(&request.run_id) {
        let restored = read_durable_native_events(request)?;
        records.insert(request.run_id.clone(), restored);
    }
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
        occurred_at_epoch_ms: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis(),
        label: safe_event_text(label),
        details: sanitize_event_details(details),
    };
    // CRITICAL: durable evidence must commit before memory/WebView publication; moving this after
    // push or emit can acknowledge an event that status replay loses after process death.
    persist_native_event_record(request, &event)?;
    events.push(event.clone());
    drop(records);
    if matches!(phase, "pending" | "running" | "terminal") {
        if let Some(app) = native_app_handle().get() {
            app.emit(NATIVE_RUNNER_EVENT_NAME, event)
                .map_err(|_| "native runner event emission failed.".to_string())?;
        }
    }
    Ok(())
}

fn event_replay_for(
    request: &RunnerCommandRequest,
) -> Result<NativeRunnerEventReplayReceipt, String> {
    let mut records = native_event_records()
        .lock()
        .map_err(|_| "native runner event store is unavailable.".to_string())?;
    if !records.contains_key(&request.run_id) {
        let restored = read_durable_native_events(request)?;
        records.insert(request.run_id.clone(), restored);
    }
    let events = records.get(&request.run_id).cloned().unwrap_or_default();
    Ok(NativeRunnerEventReplayReceipt {
        schema_version: NATIVE_EVENT_REPLAY_SCHEMA.to_string(),
        source: "native-event-ledger".to_string(),
        native_backed: true,
        descriptor_only: false,
        live_transport: true,
        replayable: true,
        event_name: NATIVE_RUNNER_EVENT_NAME.to_string(),
        run_id: request.run_id.clone(),
        truncated: events.len() >= MAX_NATIVE_EVENT_COUNT,
        events,
    })
}

fn native_event_ledger_dir(run_id: &str) -> Result<PathBuf, String> {
    validate_opaque_id("runId", run_id)?;
    Ok(native_projection_run_dir(run_id)?.join("events"))
}

fn persist_native_event_record(
    request: &RunnerCommandRequest,
    event: &NativeRunnerEventReceipt,
) -> Result<(), String> {
    validate_durable_native_event(request, event, event.sequence)?;
    let projection_dir = native_projection_run_dir(&request.run_id)?;
    if projection_dir.exists() {
        reject_native_link(&projection_dir)?;
    } else {
        fs::create_dir_all(&projection_dir).map_err(|error| {
            format!("failed to create durable native event projection root: {error}")
        })?;
    }
    let ledger_dir = native_event_ledger_dir(&request.run_id)?;
    if ledger_dir.exists() {
        reject_native_link(&ledger_dir)?;
    } else {
        fs::create_dir(&ledger_dir)
            .map_err(|error| format!("failed to create durable native event ledger: {error}"))?;
    }
    let record = NativeDurableEventRecord {
        schema_version: NATIVE_DURABLE_EVENT_SCHEMA.to_string(),
        resource_id: request.resource_id.clone(),
        session_id: request.session_id.clone(),
        run_id: request.run_id.clone(),
        redacted: true,
        replays_external_effects: false,
        event: event.clone(),
    };
    let bytes = serde_json::to_vec_pretty(&record)
        .map_err(|_| "durable native event could not be serialized safely.".to_string())?;
    if bytes.is_empty() || bytes.len() as u64 > MAX_NATIVE_DURABLE_EVENT_BYTES {
        return Err("durable native event exceeds its bounded file size.".to_string());
    }
    let final_path = ledger_dir.join(format!("{:04}.json", event.sequence));
    if final_path.exists() {
        return Err("durable native event sequence already exists.".to_string());
    }
    let temporary = ledger_dir.join(format!(
        ".{:04}.tmp-{}-{}",
        event.sequence,
        std::process::id(),
        native_epoch_millis()
    ));
    write_synced_file(&temporary, &bytes)?;
    fs::rename(&temporary, &final_path)
        .map_err(|error| format!("failed to commit durable native event: {error}"))?;
    Ok(())
}

fn read_durable_native_events(
    request: &RunnerCommandRequest,
) -> Result<Vec<NativeRunnerEventReceipt>, String> {
    let ledger_dir = native_event_ledger_dir(&request.run_id)?;
    if !ledger_dir.exists() {
        return Ok(Vec::new());
    }
    reject_native_link(&ledger_dir)?;
    let mut entries = fs::read_dir(&ledger_dir)
        .map_err(|error| format!("failed to read durable native event ledger: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("failed to inspect durable native event ledger: {error}"))?;
    entries.sort_by_key(|entry| entry.file_name());
    if entries.len() > MAX_NATIVE_EVENT_COUNT {
        return Err("durable native event ledger exceeds its event bound.".to_string());
    }

    let mut events = Vec::with_capacity(entries.len());
    for (index, entry) in entries.into_iter().enumerate() {
        let sequence = index + 1;
        let expected_name = format!("{sequence:04}.json");
        if entry.file_name().to_string_lossy() != expected_name {
            return Err(
                "durable native event ledger contains a partial or unexpected entry.".to_string(),
            );
        }
        let path = entry.path();
        reject_native_link(&path)?;
        let metadata = fs::metadata(&path)
            .map_err(|error| format!("failed to inspect durable native event file: {error}"))?;
        if !metadata.is_file()
            || metadata.len() == 0
            || metadata.len() > MAX_NATIVE_DURABLE_EVENT_BYTES
        {
            return Err("durable native event file is not a bounded regular file.".to_string());
        }
        let record: NativeDurableEventRecord = serde_json::from_slice(
            &fs::read(&path)
                .map_err(|error| format!("failed to read durable native event file: {error}"))?,
        )
        .map_err(|_| "durable native event record is corrupt or unsupported.".to_string())?;
        if record.schema_version != NATIVE_DURABLE_EVENT_SCHEMA
            || record.resource_id != request.resource_id
            || record.session_id != request.session_id
            || record.run_id != request.run_id
            || !record.redacted
            || record.replays_external_effects
        {
            return Err(
                "durable native event record address or boundary does not match.".to_string(),
            );
        }
        validate_durable_native_event(request, &record.event, sequence)?;
        events.push(record.event);
    }
    Ok(events)
}

fn validate_durable_native_event(
    request: &RunnerCommandRequest,
    event: &NativeRunnerEventReceipt,
    expected_sequence: usize,
) -> Result<(), String> {
    let expected_id = format!(
        "evt-{expected_sequence:04}-{}-{}",
        safe_event_token(&request.run_id),
        safe_event_token(&event.event_type)
    );
    if event.schema_version != "agentique.nativeRunnerEvent.v1"
        || event.resource_id != request.resource_id
        || event.session_id != request.session_id
        || event.run_id != request.run_id
        || event.sequence != expected_sequence
        || event.id != expected_id
        || event.occurred_at_epoch_ms == 0
        || event.event_type != safe_event_token(&event.event_type)
        || event.phase != safe_event_token(&event.phase)
        || event.label != safe_event_text(&event.label)
        || event.details.run_folder_files.len() > 16
        || serde_json::to_value(&event.details).ok()
            != serde_json::to_value(sanitize_event_details(event.details.clone())).ok()
    {
        return Err(
            "durable native event record failed identity or payload validation.".to_string(),
        );
    }
    Ok(())
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
        .take(16)
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
    if adapter_id == REVOKED_ADAPTER_ID || adapter_id == REVOKED_NODE_ADAPTER_ID {
        return Err("adapterId is revoked and cannot enter the native runner lane.".to_string());
    }
    if adapter_id != APPROVED_ADAPTER_ID
        && adapter_id != NODE_ADAPTER_ID
        && adapter_id != native_wasm_sandbox::ADAPTER_ID
        && adapter_id != native_rootless_container::ADAPTER_ID
    {
        return Err("adapterId is not in the native runner allowlist.".to_string());
    }
    Ok(adapter_id)
}

fn approved_permission_profile_id(request: &RunnerCommandRequest) -> Result<String, String> {
    let permission_profile_id = request.permission_profile_id.clone().ok_or_else(|| {
        "permissionProfileId is required for the fixed native runner lane.".to_string()
    })?;
    let adapter_id = request
        .adapter_id
        .as_deref()
        .ok_or_else(|| "adapterId is required for the fixed native runner lane.".to_string())?;
    let manifest = resolve_adapter_manifest(adapter_id)?;
    if permission_profile_id != manifest.permission_profile_id {
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
        platforms: vec!["windows".to_string(), "linux".to_string()],
        executable_ref: APPROVED_ADAPTER_EXECUTABLE_REF.to_string(),
        permission_profile_id: APPROVED_PERMISSION_PROFILE_ID.to_string(),
        permission_ceiling: approved_adapter_permission_ceiling(),
        timeout_seconds: NATIVE_RUN_TIMEOUT.as_secs(),
        cleanup_policy: APPROVED_ADAPTER_CLEANUP_POLICY.to_string(),
    }
}

fn fixed_node_adapter_manifest() -> NativeAdapterManifest {
    NativeAdapterManifest {
        manifest_id: NODE_ADAPTER_MANIFEST_ID.to_string(),
        adapter_id: NODE_ADAPTER_ID.to_string(),
        runtime: NODE_ADAPTER_RUNTIME.to_string(),
        support_mode: APPROVED_ADAPTER_SUPPORT_MODE.to_string(),
        version: APPROVED_ADAPTER_VERSION.to_string(),
        digest: NODE_ADAPTER_DIGEST.to_string(),
        signature_status: APPROVED_ADAPTER_SIGNATURE_STATUS.to_string(),
        signer_id: APPROVED_ADAPTER_SIGNER_ID.to_string(),
        revoked: false,
        platforms: vec!["windows".to_string(), "linux".to_string()],
        executable_ref: NODE_ADAPTER_EXECUTABLE_REF.to_string(),
        permission_profile_id: NODE_ADAPTER_PERMISSION_PROFILE_ID.to_string(),
        permission_ceiling: approved_adapter_permission_ceiling(),
        timeout_seconds: NATIVE_RUN_TIMEOUT.as_secs(),
        cleanup_policy: APPROVED_ADAPTER_CLEANUP_POLICY.to_string(),
    }
}

fn fixed_wasm_adapter_manifest() -> NativeAdapterManifest {
    NativeAdapterManifest {
        manifest_id: native_wasm_sandbox::MANIFEST_ID.to_string(),
        adapter_id: native_wasm_sandbox::ADAPTER_ID.to_string(),
        runtime: WASM_ADAPTER_RUNTIME.to_string(),
        support_mode: APPROVED_ADAPTER_SUPPORT_MODE.to_string(),
        version: APPROVED_ADAPTER_VERSION.to_string(),
        digest: native_wasm_sandbox::MODULE_DIGEST.to_string(),
        signature_status: APPROVED_ADAPTER_SIGNATURE_STATUS.to_string(),
        signer_id: APPROVED_ADAPTER_SIGNER_ID.to_string(),
        revoked: false,
        platforms: vec!["windows".to_string()],
        executable_ref: WASM_ADAPTER_EXECUTABLE_REF.to_string(),
        permission_profile_id: native_wasm_sandbox::PERMISSION_PROFILE_ID.to_string(),
        permission_ceiling: wasm_adapter_permission_ceiling(),
        timeout_seconds: NATIVE_RUN_TIMEOUT.as_secs(),
        cleanup_policy: WASM_ADAPTER_CLEANUP_POLICY.to_string(),
    }
}

fn fixed_container_adapter_manifest() -> NativeAdapterManifest {
    NativeAdapterManifest {
        manifest_id: native_rootless_container::MANIFEST_ID.to_string(),
        adapter_id: native_rootless_container::ADAPTER_ID.to_string(),
        runtime: CONTAINER_ADAPTER_RUNTIME.to_string(),
        support_mode: "optional-linux-rootless".to_string(),
        version: APPROVED_ADAPTER_VERSION.to_string(),
        digest: native_rootless_container::IMAGE_DIGEST_HEX.to_string(),
        signature_status: APPROVED_ADAPTER_SIGNATURE_STATUS.to_string(),
        signer_id: APPROVED_ADAPTER_SIGNER_ID.to_string(),
        revoked: false,
        // Windows is listed only so the shared lifecycle can return deterministic no-effect
        // unavailability evidence; native_rootless_container rejects execution off Linux.
        platforms: vec!["windows".to_string(), "linux".to_string()],
        executable_ref: CONTAINER_ADAPTER_EXECUTABLE_REF.to_string(),
        permission_profile_id: native_rootless_container::PERMISSION_PROFILE_ID.to_string(),
        permission_ceiling: container_adapter_permission_ceiling(),
        timeout_seconds: NATIVE_RUN_TIMEOUT.as_secs(),
        cleanup_policy: CONTAINER_ADAPTER_CLEANUP_POLICY.to_string(),
    }
}

fn approved_adapter_permission_ceiling() -> Vec<String> {
    APPROVED_ADAPTER_PERMISSION_CEILING
        .iter()
        .map(|item| (*item).to_string())
        .collect()
}

fn wasm_adapter_permission_ceiling() -> Vec<String> {
    WASM_ADAPTER_PERMISSION_CEILING
        .iter()
        .map(|item| (*item).to_string())
        .collect()
}

fn container_adapter_permission_ceiling() -> Vec<String> {
    CONTAINER_ADAPTER_PERMISSION_CEILING
        .iter()
        .map(|item| (*item).to_string())
        .collect()
}

fn resolve_adapter_manifest(adapter_id: &str) -> Result<NativeAdapterManifest, String> {
    match adapter_id {
        APPROVED_ADAPTER_ID => Ok(fixed_python_adapter_manifest()),
        NODE_ADAPTER_ID => Ok(fixed_node_adapter_manifest()),
        native_wasm_sandbox::ADAPTER_ID => Ok(fixed_wasm_adapter_manifest()),
        native_rootless_container::ADAPTER_ID => Ok(fixed_container_adapter_manifest()),
        _ => Err("native runner adapter manifest is missing for adapterId.".to_string()),
    }
}

fn review_adapter_manifest(
    manifest: &NativeAdapterManifest,
) -> Result<NativeAdapterManifestReceipt, String> {
    let expected = resolve_adapter_manifest(&manifest.adapter_id)?;
    if manifest.manifest_id != expected.manifest_id {
        return Err("native runner adapter manifest id is not allowlisted.".to_string());
    }
    if manifest.adapter_id != expected.adapter_id {
        return Err("native runner adapter manifest adapterId is not allowlisted.".to_string());
    }
    if manifest.runtime != expected.runtime {
        return Err("native runner adapter manifest has the wrong runtime.".to_string());
    }
    if manifest.support_mode != expected.support_mode {
        return Err("native runner adapter manifest has the wrong support mode.".to_string());
    }
    if manifest.version != expected.version {
        return Err("native runner adapter manifest version is not allowlisted.".to_string());
    }
    if manifest.digest != expected.digest || !is_sha256_hex(&manifest.digest) {
        return Err("native runner adapter manifest digest is missing or tampered.".to_string());
    }
    if manifest.signature_status != expected.signature_status
        || manifest.signer_id != expected.signer_id
    {
        return Err("native runner adapter manifest signature status is not trusted.".to_string());
    }
    if manifest.revoked {
        return Err("native runner adapter manifest is revoked.".to_string());
    }
    if manifest.platforms != expected.platforms
        || !manifest
            .platforms
            .iter()
            .any(|item| item == tested_platform_label())
    {
        return Err(
            "native runner adapter manifest platform compatibility is incomplete.".to_string(),
        );
    }
    validate_manifest_token("executableRef", &manifest.executable_ref)?;
    if manifest.executable_ref != expected.executable_ref {
        return Err(
            "native runner adapter manifest executable reference is not allowlisted.".to_string(),
        );
    }
    // CRITICAL: keep containment fields equal to native enforcement constants; looser manifest
    // values would widen the trusted adapter lane without changing its signed identity.
    if manifest.permission_profile_id != expected.permission_profile_id {
        return Err(
            "native runner adapter manifest permission profile is not allowlisted.".to_string(),
        );
    }
    if manifest.permission_ceiling != expected.permission_ceiling {
        return Err(
            "native runner adapter manifest permission ceiling is broader or mismatched."
                .to_string(),
        );
    }
    if manifest.timeout_seconds != expected.timeout_seconds {
        return Err(
            "native runner adapter manifest timeout does not match native enforcement.".to_string(),
        );
    }
    if manifest.cleanup_policy != expected.cleanup_policy {
        return Err(
            "native runner adapter manifest cleanup policy does not match native enforcement."
                .to_string(),
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
        permission_profile_id: manifest.permission_profile_id.clone(),
        permission_ceiling: manifest.permission_ceiling.clone(),
        timeout_seconds: manifest.timeout_seconds,
        cleanup_policy: manifest.cleanup_policy.clone(),
        redacted: true,
    })
}

fn execute_fixed_python_adapter(
    run_id: &str,
    resource_id: &str,
    mode: NativeAdapterTestMode,
) -> Result<NativeAdapterExecutionReceipt, String> {
    execute_fixed_native_adapter(&fixed_python_adapter_manifest(), run_id, resource_id, mode)
}

fn execute_fixed_native_adapter(
    manifest: &NativeAdapterManifest,
    run_id: &str,
    resource_id: &str,
    mode: NativeAdapterTestMode,
) -> Result<NativeAdapterExecutionReceipt, String> {
    match spawn_fixed_native_adapter(manifest, run_id, resource_id, mode)? {
        NativeSpawnResult::Spawned {
            child,
            process_tree_supervisor,
        } => {
            let output = child.wait_with_output().map_err(|error| {
                format!(
                    "fixed {} adapter failed while waiting for output: {error}",
                    manifest.runtime
                )
            })?;
            let cleanup = process_tree_supervisor.observe_after_parent_exit();
            if !cleanup.process_tree_cleanup {
                return Err(format!(
                    "fixed {} adapter process-tree cleanup is unverified: {}",
                    manifest.runtime, cleanup.evidence_code
                ));
            }
            complete_fixed_native_adapter(manifest, run_id, output)
        }
        NativeSpawnResult::Blocked(receipt) => Ok(receipt),
    }
}

enum NativeSpawnResult {
    Spawned {
        child: Child,
        process_tree_supervisor: Arc<NativeProcessTreeSupervisor>,
    },
    Blocked(NativeAdapterExecutionReceipt),
}

fn spawn_fixed_native_adapter(
    manifest: &NativeAdapterManifest,
    run_id: &str,
    resource_id: &str,
    mode: NativeAdapterTestMode,
) -> Result<NativeSpawnResult, String> {
    let script_path = fixed_adapter_script_path(manifest)?;
    let executable = match resolve_fixed_adapter_executable(manifest) {
        Ok(path) => path,
        Err(message) => {
            return Ok(NativeSpawnResult::Blocked(
                native_execution_receipt_for_manifest(
                    false,
                    "blocked",
                    None,
                    "",
                    "",
                    None,
                    native_failure(
                        "blocked",
                        &format!("native-{}.runtime-missing", manifest.runtime),
                        &message,
                    ),
                    run_id,
                    manifest,
                )?,
            ));
        }
    };
    let process_tree_supervisor = match NativeProcessTreeSupervisor::new() {
        Ok(supervisor) => Arc::new(supervisor),
        Err(message) => {
            return Ok(NativeSpawnResult::Blocked(
                native_execution_receipt_for_manifest(
                    false,
                    "blocked",
                    None,
                    "",
                    "",
                    None,
                    native_failure(
                        "blocked",
                        &format!("native-{}.supervisor-unavailable", manifest.runtime),
                        &message,
                    ),
                    run_id,
                    manifest,
                )?,
            ));
        }
    };
    let mut command = Command::new(&executable);
    command
        .arg(&script_path)
        .current_dir(repo_root()?)
        .env_clear()
        .envs(build_minimal_adapter_env(manifest, run_id, mode))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(unix)]
    {
        // CRITICAL: create the dedicated group in the child before exec. Moving group creation
        // after spawn lets adapter code create descendants outside native supervision.
        command.process_group(0);
    }
    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) => {
            return Ok(NativeSpawnResult::Blocked(
                native_execution_receipt_for_manifest(
                    false,
                    "blocked",
                    None,
                    "",
                    "",
                    None,
                    native_failure(
                        "blocked",
                        &format!("native-{}.launch-failed", manifest.runtime),
                        &format!(
                            "fixed {} adapter failed to launch: {error}",
                            manifest.runtime
                        ),
                    ),
                    run_id,
                    manifest,
                )?,
            ));
        }
    };
    // CRITICAL: assign the fixed child before writing its framed request. The adapter blocks on
    // stdin until this point; reversing this order lets workload code create an uncontained child.
    if let Err(error) = process_tree_supervisor.assign_child(&child) {
        let _ = child.kill();
        let _ = child.wait();
        return Ok(NativeSpawnResult::Blocked(
            native_execution_receipt_for_manifest(
                false,
                "blocked",
                None,
                "",
                "",
                None,
                native_failure(
                    "blocked",
                    &format!("native-{}.supervisor-assignment", manifest.runtime),
                    &error,
                ),
                run_id,
                manifest,
            )?,
        ));
    }
    if let Err(error) = write_fixed_adapter_request(&mut child, manifest, run_id, resource_id, mode)
    {
        let cleanup = process_tree_supervisor.terminate_and_observe(&mut child);
        let message = format!(
            "{error}; process-tree cleanup evidence: {}",
            cleanup.evidence_code
        );
        return Ok(NativeSpawnResult::Blocked(
            native_execution_receipt_for_manifest(
                false,
                "blocked",
                None,
                "",
                "",
                None,
                native_failure(
                    "blocked",
                    &format!("native-{}.stdin-framing", manifest.runtime),
                    &message,
                ),
                run_id,
                manifest,
            )?,
        ));
    }
    Ok(NativeSpawnResult::Spawned {
        child,
        process_tree_supervisor,
    })
}

fn write_fixed_adapter_request(
    child: &mut Child,
    manifest: &NativeAdapterManifest,
    run_id: &str,
    resource_id: &str,
    mode: NativeAdapterTestMode,
) -> Result<(), String> {
    // CRITICAL: take and drop stdin after the one framed request; the adapter reads to EOF,
    // so retaining this pipe makes asynchronous supervision wait forever.
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(build_adapter_request(manifest, run_id, resource_id, mode).as_bytes())
            .map_err(|error| format!("failed to write adapter stdin: {error}"))?;
    }
    Ok(())
}

fn complete_fixed_container_adapter(
    manifest: &NativeAdapterManifest,
    run_id: &str,
    cancel_requested: &AtomicBool,
    timeout: Duration,
) -> Result<
    (
        Option<NativeAdapterExecutionReceipt>,
        NativeProcessCleanupObservation,
        NativeRunState,
    ),
    String,
> {
    let container =
        native_rootless_container::execute_fixed_container(run_id, cancel_requested, timeout)?;
    let state = match container.outcome {
        native_rootless_container::ContainerOutcome::Succeeded => NativeRunState::Succeeded,
        native_rootless_container::ContainerOutcome::Failed => NativeRunState::Failed,
        native_rootless_container::ContainerOutcome::Canceled => NativeRunState::Canceled,
        native_rootless_container::ContainerOutcome::TimedOut => NativeRunState::TimedOut,
        native_rootless_container::ContainerOutcome::CleanupRequired => {
            NativeRunState::CleanupRequired
        }
    };
    let status = state.as_str();
    let payload = PythonAdapterPayload {
        run_id: Some(run_id.to_string()),
        resource_id: None,
        mode: Some("fixed-rootless-container".to_string()),
        message: Some(container.stdout.clone()),
        env_keys: container.environment_keys.clone(),
        ambient_env_non_empty: Vec::new(),
        module_digest: None,
        module_bytes: None,
        import_count: None,
        result: None,
        fuel_budget: None,
        fuel_consumed: None,
        memory_limit_bytes: Some(67_108_864),
        stack_limit_bytes: None,
        container_runtime: Some(container.runtime.clone()),
        container_rootless: Some(container.rootless),
        container_image_digest: Some(container.image_digest.clone()),
        container_image_id: Some(container.image_id.clone()),
        container_cleanup_verified: Some(container.cleanup_verified),
        container_residual_count: container.residual_count,
    };
    let payload_bytes = serde_json::to_vec(&payload)
        .map_err(|_| "native-container.output: result serialization failed.".to_string())?;
    if payload_bytes.len() > native_rootless_container::MAX_OUTPUT_BYTES {
        return Err("native-container.output: result exceeded its fixed bound.".to_string());
    }
    let succeeded = state == NativeRunState::Succeeded;
    let parsed = PythonAdapterResult {
        schema_version: adapter_result_schema(manifest).to_string(),
        ok: succeeded,
        ready: succeeded,
        outputs: vec![PythonAdapterOutput {
            path: adapter_output_relative_path(manifest).to_string(),
            media_type: "application/json".to_string(),
            bytes: payload_bytes.len(),
        }],
        artifacts: vec![PythonAdapterArtifact {
            id: "artifact-container-result-json".to_string(),
            path: adapter_artifact_relative_path(manifest).to_string(),
            viewer: "json".to_string(),
            redacted: true,
        }],
        payload,
    };
    let stdout = serde_json::to_string(&parsed)
        .map_err(|_| "native-container.output: receipt serialization failed.".to_string())?;
    let failure = if succeeded {
        native_failure("none", "", "")
    } else {
        native_failure(
            "failed",
            container
                .failure_code
                .as_deref()
                .unwrap_or("native-container.failed"),
            "Fixed rootless container execution did not reach a verified clean success.",
        )
    };
    let receipt = native_execution_receipt_for_manifest(
        container.launched,
        status,
        Some(NativeAdapterExitReceipt {
            code: container.exit_code,
            signal: None,
        }),
        &stdout,
        &container.stderr,
        Some(parsed),
        failure,
        run_id,
        manifest,
    )?;
    let cleanup = NativeProcessCleanupObservation {
        process_tree_cleanup: container.cleanup_verified,
        orphan_count: container.residual_count,
        cleanup_required: !container.cleanup_verified,
        evidence_code: if container.cleanup_verified {
            "rootless-container-zero-residuals".to_string()
        } else {
            "rootless-container-residual-unverified".to_string()
        },
    };
    Ok((Some(receipt), cleanup, state))
}

fn complete_fixed_wasm_adapter(
    manifest: &NativeAdapterManifest,
    run_id: &str,
) -> Result<NativeAdapterExecutionReceipt, String> {
    match native_wasm_sandbox::execute_fixed_module() {
        Ok(wasm) => {
            let payload = PythonAdapterPayload {
                run_id: Some(run_id.to_string()),
                resource_id: None,
                mode: Some("fixed-zero-ambient".to_string()),
                message: Some("wasm-sandbox-result".to_string()),
                env_keys: Vec::new(),
                ambient_env_non_empty: Vec::new(),
                module_digest: Some(wasm.module_digest),
                module_bytes: Some(wasm.module_bytes),
                import_count: Some(wasm.import_count),
                result: Some(wasm.result),
                fuel_budget: Some(wasm.fuel_budget),
                fuel_consumed: Some(wasm.fuel_consumed),
                memory_limit_bytes: Some(wasm.memory_limit_bytes),
                stack_limit_bytes: Some(wasm.stack_limit_bytes),
                container_runtime: None,
                container_rootless: None,
                container_image_digest: None,
                container_image_id: None,
                container_cleanup_verified: None,
                container_residual_count: None,
            };
            let payload_bytes = serde_json::to_vec(&payload)
                .map_err(|_| "native-wasm.output: result serialization failed.".to_string())?;
            if payload_bytes.len() > native_wasm_sandbox::MAX_OUTPUT_BYTES {
                return Err("native-wasm.output: result exceeded its fixed bound.".to_string());
            }
            let parsed = PythonAdapterResult {
                schema_version: adapter_result_schema(manifest).to_string(),
                ok: true,
                ready: true,
                outputs: vec![PythonAdapterOutput {
                    path: adapter_output_relative_path(manifest).to_string(),
                    media_type: "application/json".to_string(),
                    bytes: payload_bytes.len(),
                }],
                artifacts: vec![PythonAdapterArtifact {
                    id: "artifact-wasm-result-json".to_string(),
                    path: adapter_artifact_relative_path(manifest).to_string(),
                    viewer: "json".to_string(),
                    redacted: true,
                }],
                payload,
            };
            let stdout = serde_json::to_string(&parsed)
                .map_err(|_| "native-wasm.output: receipt serialization failed.".to_string())?;
            native_execution_receipt_for_manifest(
                true,
                RUNNER_NATIVE_SUCCEEDED_STATE,
                Some(NativeAdapterExitReceipt {
                    code: Some(0),
                    signal: None,
                }),
                &stdout,
                "",
                Some(parsed),
                native_failure("none", "", ""),
                run_id,
                manifest,
            )
        }
        Err(error) => {
            let code = error.split(':').next().unwrap_or("native-wasm.failed");
            native_execution_receipt_for_manifest(
                true,
                RUNNER_NATIVE_FAILED_STATE,
                None,
                "",
                "",
                None,
                native_failure("failed", code, &error),
                run_id,
                manifest,
            )
        }
    }
}

fn complete_fixed_native_adapter(
    manifest: &NativeAdapterManifest,
    run_id: &str,
    output: Output,
) -> Result<NativeAdapterExecutionReceipt, String> {
    let stdout = redact_runner_text(&String::from_utf8_lossy(&output.stdout));
    let stderr = redact_runner_text(&String::from_utf8_lossy(&output.stderr));
    let exit = NativeAdapterExitReceipt {
        code: output.status.code(),
        signal: None,
    };
    let parsed = parse_adapter_stdout(manifest, &stdout);
    let failure = if !output.status.success() {
        native_failure(
            "failed",
            &format!("native-{}.exit", manifest.runtime),
            &format!(
                "Fixed {} adapter exited with code {:?}.",
                manifest.runtime,
                output.status.code()
            ),
        )
    } else if let Err(error) = &parsed {
        native_failure(
            "failed",
            &format!("native-{}.invalid-json", manifest.runtime),
            error,
        )
    } else {
        native_failure("none", "", "")
    };
    let status = if failure.status == "none" {
        RUNNER_NATIVE_SUCCEEDED_STATE
    } else {
        RUNNER_NATIVE_FAILED_STATE
    };
    native_execution_receipt_for_manifest(
        true,
        status,
        Some(exit),
        &stdout,
        &stderr,
        parsed.ok(),
        failure,
        run_id,
        manifest,
    )
}

fn parse_adapter_stdout(
    manifest: &NativeAdapterManifest,
    stdout: &str,
) -> Result<PythonAdapterResult, String> {
    let parsed: PythonAdapterResult = serde_json::from_str(stdout.trim())
        .map_err(|_| format!("{} adapter stdout must be valid JSON.", manifest.runtime))?;
    if parsed.schema_version != adapter_result_schema(manifest) || !parsed.ok {
        return Err(format!(
            "{} adapter stdout did not match the result contract.",
            manifest.runtime
        ));
    }
    Ok(parsed)
}

fn native_execution_receipt_for_manifest(
    launched: bool,
    status: &str,
    exit: Option<NativeAdapterExitReceipt>,
    stdout: &str,
    stderr: &str,
    parsed: Option<PythonAdapterResult>,
    failure: NativeAdapterFailureReceipt,
    run_id: &str,
    manifest: &NativeAdapterManifest,
) -> Result<NativeAdapterExecutionReceipt, String> {
    let health = NativeAdapterHealthReceipt {
        ready: status == RUNNER_NATIVE_SUCCEEDED_STATE
            && parsed
                .as_ref()
                .map(|result| {
                    result.ready && result.payload.mode.as_deref() != Some("exit-failure")
                })
                .unwrap_or(false),
        adapter_runtime: manifest.runtime.clone(),
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
    let run_folder = write_native_run_folder_for_manifest(
        manifest,
        run_id,
        status,
        stdout,
        stderr,
        parsed.as_ref(),
        &failure,
    )?;
    Ok(NativeAdapterExecutionReceipt {
        schema_version: "agentique.nativeAdapterExecutionReceipt.v1".to_string(),
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
    write_native_run_folder_for_manifest(
        &fixed_python_adapter_manifest(),
        run_id,
        status,
        stdout,
        stderr,
        parsed,
        failure,
    )
}

fn write_native_run_folder_for_manifest(
    manifest: &NativeAdapterManifest,
    run_id: &str,
    status: &str,
    stdout: &str,
    stderr: &str,
    parsed: Option<&PythonAdapterResult>,
    failure: &NativeAdapterFailureReceipt,
) -> Result<NativeRunFolderReceipt, String> {
    write_native_run_folder_with_fault_for_manifest(
        manifest,
        run_id,
        status,
        stdout,
        stderr,
        parsed,
        failure,
        NativeRunFolderFault::None,
    )
}

fn write_native_run_folder_with_fault(
    run_id: &str,
    status: &str,
    stdout: &str,
    stderr: &str,
    parsed: Option<&PythonAdapterResult>,
    failure: &NativeAdapterFailureReceipt,
    fault: NativeRunFolderFault,
) -> Result<NativeRunFolderReceipt, String> {
    write_native_run_folder_with_fault_for_manifest(
        &fixed_python_adapter_manifest(),
        run_id,
        status,
        stdout,
        stderr,
        parsed,
        failure,
        fault,
    )
}

fn write_native_run_folder_with_fault_for_manifest(
    manifest: &NativeAdapterManifest,
    run_id: &str,
    status: &str,
    stdout: &str,
    stderr: &str,
    parsed: Option<&PythonAdapterResult>,
    failure: &NativeAdapterFailureReceipt,
    fault: NativeRunFolderFault,
) -> Result<NativeRunFolderReceipt, String> {
    write_native_run_folder_with_fault_implementation(
        manifest, run_id, status, stdout, stderr, parsed, failure, fault,
    )
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum NativeRunFolderFault {
    None,
    BeforeCommit,
}

fn write_native_run_folder_with_fault_implementation(
    manifest: &NativeAdapterManifest,
    run_id: &str,
    status: &str,
    stdout: &str,
    stderr: &str,
    parsed: Option<&PythonAdapterResult>,
    failure: &NativeAdapterFailureReceipt,
    fault: NativeRunFolderFault,
) -> Result<NativeRunFolderReceipt, String> {
    validate_opaque_id("runId", run_id)?;
    let output_relative = adapter_output_relative_path(manifest);
    let artifact_relative = adapter_artifact_relative_path(manifest);
    let root_ref = adapter_root_ref(manifest);
    let run_rel = format!("runs/{run_id}");
    let runs_root = native_run_root()?.join("runs");
    fs::create_dir_all(&runs_root)
        .map_err(|error| format!("failed to create native run root: {error}"))?;
    reject_native_link(&runs_root)?;
    if contains_unsafe_run_material(stdout.as_bytes())
        || contains_unsafe_run_material(stderr.as_bytes())
        || contains_unsafe_run_material(
            &serde_json::to_vec(&parsed)
                .map_err(|_| "native run result could not be security-scanned.".to_string())?,
        )
        || contains_unsafe_run_material(
            &serde_json::to_vec(failure)
                .map_err(|_| "native run failure could not be security-scanned.".to_string())?,
        )
    {
        return Err("native run candidate contains unsafe persistence material.".to_string());
    }

    let mut files = vec![
        format!("{run_rel}/run.json"),
        format!("{run_rel}/logs/stdout.log"),
        format!("{run_rel}/logs/stderr.log"),
        format!("{run_rel}/viewer-metadata.json"),
        format!("{run_rel}/failure.json"),
        format!("{run_rel}/cleanup-receipt.json"),
        format!("{run_rel}/write-receipt.json"),
    ];
    let mut outputs = Vec::new();
    let mut artifacts = Vec::new();
    let mut payloads: Vec<(String, Vec<u8>)> = Vec::new();
    if let Some(result) = parsed {
        for output in &result.outputs {
            if output.path == output_relative {
                let output_content = redacted_json_string(&result.payload)?;
                let path = format!("{run_rel}/{output_relative}");
                outputs.push(NativeRunOutputEvidenceReceipt {
                    path: path.clone(),
                    media_type: output.media_type.clone(),
                    bytes: output_content.len(),
                    digest: stable_native_digest(&output_content),
                });
                files.push(path);
                payloads.push((output_relative.to_string(), output_content.into_bytes()));
            }
        }
        for artifact in &result.artifacts {
            if artifact.path == artifact_relative {
                let artifact_content = redacted_json_string(result)?;
                let path = format!("{run_rel}/{artifact_relative}");
                artifacts.push(NativeRunArtifactEvidenceItem {
                    id: safe_event_token(&artifact.id),
                    path: path.clone(),
                    viewer: safe_event_token(&artifact.viewer),
                    redacted: artifact.redacted,
                    bytes: artifact_content.len(),
                    digest: stable_native_digest(&artifact_content),
                });
                files.push(path);
                payloads.push((artifact_relative.to_string(), artifact_content.into_bytes()));
            }
        }
    }
    let viewer_metadata = NativeRunViewerMetadataReceipt {
        source: root_ref.to_string(),
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
        manifest.adapter_id,
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
    let run_json_bytes = serde_json::to_vec_pretty(&serde_json::json!({
        "schemaVersion": adapter_run_schema(manifest),
        "runId": run_id,
        "adapterId": manifest.adapter_id,
        "manifestId": manifest.manifest_id,
        "status": status,
        "runtime": manifest.runtime,
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
    .map_err(|error| format!("failed to serialize native run metadata: {error}"))?;
    payloads.extend([
        (
            "logs/stdout.log".to_string(),
            bounded_redacted_run_text(stdout).into_bytes(),
        ),
        (
            "logs/stderr.log".to_string(),
            bounded_redacted_run_text(stderr).into_bytes(),
        ),
        ("run.json".to_string(), run_json_bytes),
        (
            "viewer-metadata.json".to_string(),
            serde_json::to_vec_pretty(&viewer_metadata)
                .map_err(|error| format!("failed to serialize native viewer metadata: {error}"))?,
        ),
        (
            "failure.json".to_string(),
            redacted_json_string(failure)?.into_bytes(),
        ),
    ]);
    payloads.sort_by(|left, right| left.0.cmp(&right.0));
    let mut entries = Vec::new();
    let mut total_bytes = 0_u64;
    for (relative, bytes) in &payloads {
        validate_native_run_payload_path(relative)?;
        let byte_count = bytes.len() as u64;
        if byte_count > MAX_NATIVE_RUN_FILE_BYTES {
            return Err("native run payload exceeds the per-file byte limit.".to_string());
        }
        if contains_unsafe_run_material(bytes) {
            return Err("native run payload contains unsafe persistence material.".to_string());
        }
        total_bytes = total_bytes
            .checked_add(byte_count)
            .ok_or_else(|| "native run payload byte total overflowed.".to_string())?;
        entries.push(NativeRunFolderIntegrityEntry {
            path: format!("{run_rel}/{relative}"),
            bytes: byte_count,
            content_digest: sha256_bytes(bytes),
        });
    }
    if total_bytes > MAX_NATIVE_RUN_TOTAL_BYTES {
        return Err("native run payload exceeds the total byte limit.".to_string());
    }
    let receipt = NativeRunFolderWriteReceipt {
        schema_version: "agentique.nativeRunFolderWriteReceipt.v2".to_string(),
        run_id: run_id.to_string(),
        root_ref: root_ref.to_string(),
        committed: true,
        redacted: true,
        digest_algorithm: "sha256".to_string(),
        file_count: entries.len(),
        total_bytes,
        entries,
        mutable_refs: vec![
            format!("{run_rel}/cleanup-receipt.json"),
            format!("{run_rel}/cleanup-recovery-receipt.json"),
        ],
        reproducibility_digest: reproducibility_digest.clone(),
        receipt_ref: format!("{run_rel}/write-receipt.json"),
    };
    let cleanup_bytes = serde_json::to_vec_pretty(&cleanup)
        .map_err(|error| format!("failed to serialize native cleanup receipt: {error}"))?;
    let receipt_bytes = serde_json::to_vec_pretty(&receipt)
        .map_err(|error| format!("failed to serialize native write receipt: {error}"))?;
    if receipt_bytes.len() as u64 > MAX_NATIVE_RUN_RECEIPT_BYTES {
        return Err("native run write receipt exceeds the bounded byte limit.".to_string());
    }

    let final_dir = runs_root.join(run_id);
    if final_dir.exists() {
        let existing = validate_native_run_folder_at(&final_dir, run_id)?;
        if existing.entries == receipt.entries
            && existing.reproducibility_digest == receipt.reproducibility_digest
        {
            return Ok(NativeRunFolderReceipt {
                root_ref: root_ref.to_string(),
                files,
            });
        }
        return Err("a different or invalid native run folder already exists.".to_string());
    }
    let staging_dir = runs_root.join(format!(
        ".staging-{run_id}-{}-{}",
        std::process::id(),
        native_epoch_millis()
    ));
    let write_result = (|| -> Result<(), String> {
        fs::create_dir(&staging_dir)
            .map_err(|error| format!("failed to create native run staging folder: {error}"))?;
        for (relative, bytes) in &payloads {
            let target = staging_dir.join(relative.replace('/', std::path::MAIN_SEPARATOR_STR));
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(|error| {
                    format!("failed to create native run staging parent: {error}")
                })?;
            }
            write_synced_file(&target, bytes)?;
        }
        write_synced_file(&staging_dir.join("cleanup-receipt.json"), &cleanup_bytes)?;
        // CRITICAL: this receipt is the commit marker and must be written only after every payload.
        write_synced_file(&staging_dir.join("write-receipt.json"), &receipt_bytes)?;
        validate_native_run_folder_at(&staging_dir, run_id)?;
        if fault == NativeRunFolderFault::BeforeCommit {
            return Err("injected native run-folder fault before commit.".to_string());
        }
        // CRITICAL: never expose a partially written final run directory; authority begins at rename.
        fs::rename(&staging_dir, &final_dir)
            .map_err(|error| format!("failed to atomically commit native run folder: {error}"))?;
        Ok(())
    })();
    if let Err(error) = write_result {
        if staging_dir.exists() {
            reject_native_link(&staging_dir)?;
            fs::remove_dir_all(&staging_dir).map_err(|cleanup_error| {
                format!("{error}; failed to remove native run staging: {cleanup_error}")
            })?;
        }
        return Err(error);
    }
    Ok(NativeRunFolderReceipt {
        root_ref: root_ref.to_string(),
        files,
    })
}

fn sha256_bytes(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn bounded_redacted_run_text(value: &str) -> String {
    let redacted = redact_runner_text(value);
    if redacted.len() <= MAX_NATIVE_LOG_BYTES {
        return redacted;
    }
    let mut boundary = MAX_NATIVE_LOG_BYTES;
    while !redacted.is_char_boundary(boundary) {
        boundary -= 1;
    }
    redacted[..boundary].to_string()
}

fn contains_unsafe_run_material(bytes: &[u8]) -> bool {
    if contains_unsafe_projection_material(bytes) {
        return true;
    }
    let text = String::from_utf8_lossy(bytes).to_ascii_lowercase();
    [
        "vault:",
        "browser/cookies",
        "browser\\cookies",
        "browser-cookie",
        "github_pat_",
        "ghp_",
    ]
    .iter()
    .any(|marker| text.contains(marker))
}

fn validate_native_run_payload_path(relative: &str) -> Result<(), String> {
    let allowed = matches!(
        relative,
        "run.json"
            | "logs/stdout.log"
            | "logs/stderr.log"
            | "viewer-metadata.json"
            | "failure.json"
            | "outputs/python-result.json"
            | "artifacts/python-result.json"
            | "outputs/node-result.json"
            | "artifacts/node-result.json"
            | "outputs/wasm-result.json"
            | "artifacts/wasm-result.json"
            | "outputs/container-result.json"
            | "artifacts/container-result.json"
    );
    if !allowed
        || relative.contains('\\')
        || relative.contains("..")
        || relative.contains(':')
        || relative.starts_with('/')
    {
        return Err("native run payload path is not allowlisted.".to_string());
    }
    Ok(())
}

fn native_run_entry_relative(path: &str, run_id: &str) -> Result<String, String> {
    let prefix = format!("runs/{run_id}/");
    let relative = path
        .strip_prefix(&prefix)
        .ok_or_else(|| "native run receipt entry escaped its exact run root.".to_string())?;
    validate_native_run_payload_path(relative)?;
    Ok(relative.to_string())
}

fn read_bounded_native_run_file(path: &Path, max_bytes: u64) -> Result<Vec<u8>, String> {
    reject_native_link(path)?;
    let metadata = fs::metadata(path)
        .map_err(|error| format!("failed to inspect native run file: {error}"))?;
    if !metadata.is_file() || metadata.len() > max_bytes {
        return Err("native run evidence must be a bounded regular file.".to_string());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if metadata.nlink() != 1 {
            return Err("native run evidence must not use hard links.".to_string());
        }
    }
    fs::read(path).map_err(|error| format!("failed to read native run evidence: {error}"))
}

fn collect_native_run_files_at(
    root: &Path,
    current: &Path,
    depth: usize,
    output: &mut Vec<String>,
) -> Result<(), String> {
    if depth > 4 {
        return Err("native run folder exceeds the bounded depth.".to_string());
    }
    reject_native_link(current)?;
    let metadata = fs::metadata(current)
        .map_err(|error| format!("failed to inspect native run directory: {error}"))?;
    if !metadata.is_dir() {
        return Err("native run root must be a dedicated directory.".to_string());
    }
    for entry in fs::read_dir(current)
        .map_err(|error| format!("failed to enumerate native run directory: {error}"))?
    {
        let entry =
            entry.map_err(|error| format!("failed to inspect native run entry: {error}"))?;
        let path = entry.path();
        reject_native_link(&path)?;
        let kind = entry
            .file_type()
            .map_err(|error| format!("failed to inspect native run entry type: {error}"))?;
        if kind.is_dir() {
            collect_native_run_files_at(root, &path, depth + 1, output)?;
        } else if kind.is_file() {
            let relative = path
                .strip_prefix(root)
                .map_err(|_| "native run entry escaped its root.".to_string())?
                .to_string_lossy()
                .replace('\\', "/");
            output.push(relative);
        } else {
            return Err("native run entries must be regular files or directories.".to_string());
        }
    }
    Ok(())
}

fn validate_native_run_folder_at(
    run_dir: &Path,
    run_id: &str,
) -> Result<NativeRunFolderWriteReceipt, String> {
    reject_native_link(run_dir)?;
    if !fs::metadata(run_dir)
        .map_err(|error| format!("failed to inspect native run folder: {error}"))?
        .is_dir()
    {
        return Err("native run folder must be a dedicated directory.".to_string());
    }
    let receipt_bytes = read_bounded_native_run_file(
        &run_dir.join("write-receipt.json"),
        MAX_NATIVE_RUN_RECEIPT_BYTES,
    )?;
    if contains_unsafe_run_material(&receipt_bytes) {
        return Err("native run receipt contains unsafe persistence material.".to_string());
    }
    let receipt: NativeRunFolderWriteReceipt = serde_json::from_slice(&receipt_bytes)
        .map_err(|_| "native run write receipt is malformed.".to_string())?;
    let run_rel = format!("runs/{run_id}");
    if receipt.schema_version != "agentique.nativeRunFolderWriteReceipt.v2"
        || receipt.run_id != run_id
        || ![
            "native-python-runner",
            "native-node-runner",
            "native-wasm-runner",
            "native-rootless-container-runner",
        ]
        .contains(&receipt.root_ref.as_str())
        || !receipt.committed
        || !receipt.redacted
        || receipt.digest_algorithm != "sha256"
        || receipt.receipt_ref != format!("{run_rel}/write-receipt.json")
        || receipt.mutable_refs
            != vec![
                format!("{run_rel}/cleanup-receipt.json"),
                format!("{run_rel}/cleanup-recovery-receipt.json"),
            ]
    {
        return Err("native run write receipt identity or schema is invalid.".to_string());
    }
    if receipt.file_count != receipt.entries.len() {
        return Err("native run write receipt file count does not match.".to_string());
    }
    let mut sorted = receipt.entries.clone();
    sorted.sort_by(|left, right| left.path.cmp(&right.path));
    if sorted != receipt.entries {
        return Err("native run write receipt entries are not sorted.".to_string());
    }
    let mut seen = std::collections::HashSet::new();
    let mut total_bytes = 0_u64;
    for entry in &receipt.entries {
        let relative = native_run_entry_relative(&entry.path, run_id)?;
        if !seen.insert(relative.clone()) {
            return Err("native run write receipt contains duplicate paths.".to_string());
        }
        if entry.bytes > MAX_NATIVE_RUN_FILE_BYTES || !is_sha256_hex(&entry.content_digest) {
            return Err("native run write receipt entry is outside integrity bounds.".to_string());
        }
        let bytes = read_bounded_native_run_file(&run_dir.join(&relative), entry.bytes)?;
        if bytes.len() as u64 != entry.bytes
            || sha256_bytes(&bytes) != entry.content_digest
            || contains_unsafe_run_material(&bytes)
        {
            return Err("native run folder integrity check failed.".to_string());
        }
        total_bytes = total_bytes
            .checked_add(entry.bytes)
            .ok_or_else(|| "native run folder byte total overflowed.".to_string())?;
    }
    if total_bytes != receipt.total_bytes || total_bytes > MAX_NATIVE_RUN_TOTAL_BYTES {
        return Err("native run write receipt byte total does not match.".to_string());
    }
    for required in [
        "run.json",
        "logs/stdout.log",
        "logs/stderr.log",
        "viewer-metadata.json",
        "failure.json",
    ] {
        if !seen.contains(required) {
            return Err(format!(
                "native run folder is missing required payload: {required}"
            ));
        }
    }
    let cleanup_bytes = read_bounded_native_run_file(
        &run_dir.join("cleanup-receipt.json"),
        MAX_NATIVE_RUN_RECEIPT_BYTES,
    )?;
    if contains_unsafe_run_material(&cleanup_bytes) {
        return Err("native cleanup receipt contains unsafe persistence material.".to_string());
    }
    let cleanup: NativeRunCleanupEvidenceReceipt = serde_json::from_slice(&cleanup_bytes)
        .map_err(|_| "native cleanup receipt is malformed.".to_string())?;
    if cleanup.schema_version != "agentique.nativeRunFolderCleanupReceipt.v1"
        || cleanup.run_id != run_id
        || !cleanup.idempotent
        || cleanup.receipt_path != format!("{run_rel}/cleanup-receipt.json")
    {
        return Err("native cleanup receipt identity or schema is invalid.".to_string());
    }
    let mut actual = Vec::new();
    collect_native_run_files_at(run_dir, run_dir, 0, &mut actual)?;
    actual.sort();
    let mut allowed = seen.into_iter().collect::<Vec<_>>();
    allowed.extend([
        "cleanup-receipt.json".to_string(),
        "write-receipt.json".to_string(),
    ]);
    if run_dir.join("cleanup-recovery-receipt.json").exists() {
        read_bounded_native_run_file(
            &run_dir.join("cleanup-recovery-receipt.json"),
            MAX_NATIVE_RUN_RECEIPT_BYTES,
        )?;
        allowed.push("cleanup-recovery-receipt.json".to_string());
    }
    allowed.sort();
    if actual != allowed {
        return Err("native run folder file inventory does not match its receipt.".to_string());
    }
    Ok(receipt)
}

fn read_native_run_artifact_evidence(
    request: &RunnerCommandRequest,
    state: &str,
) -> Result<NativeRunArtifactEvidenceReceipt, String> {
    let adapter_id = approved_adapter_id(request)?;
    let manifest = resolve_adapter_manifest(&adapter_id)?;
    let run_rel = format!("runs/{}", request.run_id);
    let run_dir = native_run_root()?.join("runs").join(&request.run_id);
    if !run_dir.exists() {
        return Err("native run folder evidence is not available for this run.".to_string());
    }
    // CRITICAL: validate the commit marker and every immutable byte before parsing viewer evidence.
    let write_receipt = validate_native_run_folder_at(&run_dir, &request.run_id)?;
    if write_receipt.root_ref != adapter_root_ref(&manifest) {
        return Err("native run write receipt adapter root is mismatched.".to_string());
    }

    let run_json_text = read_native_run_file(&run_dir, "run.json")?;
    let viewer_metadata_text = read_native_run_file(&run_dir, "viewer-metadata.json")?;
    let cleanup_text = read_native_run_file(&run_dir, "cleanup-receipt.json")?;
    let failure_text = read_native_run_file(&run_dir, "failure.json")?;
    let stdout_text = read_native_run_file(&run_dir, "logs/stdout.log")?;
    let stderr_text = read_native_run_file(&run_dir, "logs/stderr.log")?;
    let run_json: serde_json::Value = serde_json::from_str(&run_json_text)
        .map_err(|error| format!("failed to parse native run metadata: {error}"))?;
    if run_json
        .get("schemaVersion")
        .and_then(|value| value.as_str())
        != Some(adapter_run_schema(&manifest))
        || run_json.get("runId").and_then(|value| value.as_str()) != Some(request.run_id.as_str())
        || run_json.get("adapterId").and_then(|value| value.as_str())
            != Some(manifest.adapter_id.as_str())
        || run_json.get("manifestId").and_then(|value| value.as_str())
            != Some(manifest.manifest_id.as_str())
        || run_json.get("runtime").and_then(|value| value.as_str())
            != Some(manifest.runtime.as_str())
        || run_json.get("status").and_then(|value| value.as_str()) != Some(state)
        || run_json
            .get("paths")
            .and_then(|value| value.get("root"))
            .and_then(|value| value.as_str())
            != Some(run_rel.as_str())
    {
        return Err("native run metadata identity or schema is invalid.".to_string());
    }
    let files = run_json
        .get("files")
        .and_then(|value| value.as_array())
        .ok_or_else(|| "native run metadata is missing file refs.".to_string())?
        .iter()
        .map(|value| {
            value
                .as_str()
                .ok_or_else(|| "native run metadata has a non-string file ref.".to_string())
                .and_then(|path| validate_native_run_public_ref(path, &request.run_id))
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
        output.path = validate_native_run_public_ref(&output.path, &request.run_id)?;
        if !output
            .path
            .ends_with(&format!("/{}", adapter_output_relative_path(&manifest)))
            || !is_sha256_hex(&output.digest)
        {
            return Err("native output metadata is invalid.".to_string());
        }
        output.digest = output.digest.to_ascii_lowercase();
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
        artifact.path = validate_native_run_public_ref(&artifact.path, &request.run_id)?;
        artifact.viewer = safe_event_token(&artifact.viewer);
        if !artifact
            .path
            .ends_with(&format!("/{}", adapter_artifact_relative_path(&manifest)))
            || !is_sha256_hex(&artifact.digest)
        {
            return Err("native artifact metadata is invalid.".to_string());
        }
        artifact.digest = artifact.digest.to_ascii_lowercase();
        artifact.redacted = true;
    }
    let mut viewer_metadata: NativeRunViewerMetadataReceipt =
        serde_json::from_str(&viewer_metadata_text)
            .map_err(|error| format!("failed to parse native viewer metadata: {error}"))?;
    viewer_metadata.source = adapter_root_ref(&manifest).to_string();
    viewer_metadata.preview_mode = safe_event_token(&viewer_metadata.preview_mode);
    viewer_metadata.artifact_viewers = viewer_metadata
        .artifact_viewers
        .into_iter()
        .map(|viewer| safe_event_token(&viewer))
        .collect();
    let mut cleanup: NativeRunCleanupEvidenceReceipt = serde_json::from_str(&cleanup_text)
        .map_err(|error| format!("failed to parse native cleanup receipt: {error}"))?;
    if cleanup.run_id != request.run_id
        || cleanup.schema_version != "agentique.nativeRunFolderCleanupReceipt.v1"
        || !cleanup.idempotent
    {
        return Err("native cleanup receipt identity or schema is invalid.".to_string());
    }
    cleanup.receipt_path = validate_native_run_public_ref(&cleanup.receipt_path, &request.run_id)?;
    cleanup.removed = cleanup
        .removed
        .into_iter()
        .map(|removed| validate_native_run_public_ref(&removed, &request.run_id))
        .collect::<Result<Vec<_>, _>>()?;
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
        root_ref: adapter_root_ref(&manifest).to_string(),
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

fn validate_native_run_public_ref(value: &str, run_id: &str) -> Result<String, String> {
    let prefix = format!("runs/{run_id}/");
    let relative = value
        .strip_prefix(&prefix)
        .ok_or_else(|| "native run reference escaped its exact run root.".to_string())?;
    let allowed = matches!(
        relative,
        "run.json"
            | "logs"
            | "logs/stdout.log"
            | "logs/stderr.log"
            | "outputs"
            | "outputs/python-result.json"
            | "outputs/node-result.json"
            | "outputs/wasm-result.json"
            | "outputs/container-result.json"
            | "artifacts"
            | "artifacts/python-result.json"
            | "artifacts/node-result.json"
            | "artifacts/wasm-result.json"
            | "artifacts/container-result.json"
            | "viewer-metadata.json"
            | "failure.json"
            | "cleanup-receipt.json"
            | "cleanup-recovery-receipt.json"
            | "write-receipt.json"
            | "transient-native-process-record"
    );
    if !allowed
        || value.contains('\\')
        || value.contains("..")
        || value.contains(':')
        || value.starts_with('/')
    {
        return Err("native run reference is not allowlisted.".to_string());
    }
    Ok(value.to_string())
}

fn native_cleanup_recovery_receipt(
    command: &str,
    transition: &str,
    run_id: &str,
    state: &str,
    cleanup_status: &str,
    recovery_reason: Option<String>,
    cleanup: &NativeProcessCleanupObservation,
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
        process_tree_cleanup: cleanup.process_tree_cleanup,
        tested_platform: tested_platform_label().to_string(),
        orphan_count: cleanup.orphan_count,
        cleanup_required: cleanup.cleanup_required,
        idempotent: true,
        recovery_reason: recovery_reason.map(|reason| safe_event_token(&reason)),
        receipt_refs,
        removed: vec![format!("{run_rel}/transient-native-process-record")],
        redacted: true,
        notes: if cleanup.process_tree_cleanup {
            vec![
                "fixed-lane-cleanup-only".to_string(),
                "no-generic-process-manager".to_string(),
                "no-tested-platform-orphans".to_string(),
                cleanup.evidence_code.clone(),
            ]
        } else {
            vec![
                "fixed-lane-cleanup-only".to_string(),
                "no-generic-process-manager".to_string(),
                "process-tree-cleanup-unverified".to_string(),
                cleanup.evidence_code.clone(),
            ]
        },
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

fn read_native_cleanup_recovery(
    run_id: &str,
) -> Result<Option<NativeRunnerCleanupRecoveryReceipt>, String> {
    validate_opaque_id("runId", run_id)?;
    let run_dir = native_run_root()?.join("runs").join(run_id);
    if !run_dir.exists() {
        return Ok(None);
    }
    reject_native_link(&run_dir)?;
    let path = run_dir.join("cleanup-recovery-receipt.json");
    if !path.exists() {
        return Ok(None);
    }
    let bytes = read_bounded_native_run_file(&path, 8_192)?;
    if contains_unsafe_projection_material(&bytes) {
        return Err("native cleanup recovery evidence contains unsafe material.".to_string());
    }
    let receipt: NativeRunnerCleanupRecoveryReceipt = serde_json::from_slice(&bytes)
        .map_err(|_| "native cleanup recovery evidence is corrupt.".to_string())?;
    if receipt.schema_version != NATIVE_CLEANUP_RECOVERY_SCHEMA
        || receipt.run_id != run_id
        || !receipt.native_backed
        || receipt.descriptor_only
        || !receipt.idempotent
        || !receipt.redacted
        || receipt
            .receipt_refs
            .iter()
            .any(|reference| reference.contains("..") || Path::new(reference).is_absolute())
    {
        return Err("native cleanup recovery evidence boundary is invalid.".to_string());
    }
    Ok(Some(receipt))
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
    let bytes = read_bounded_native_run_file(&target, MAX_NATIVE_RUN_FILE_BYTES)?;
    if contains_unsafe_run_material(&bytes) {
        return Err("native run folder evidence contains unsafe persisted material.".to_string());
    }
    String::from_utf8(bytes)
        .map(|text| redact_runner_text(&text))
        .map_err(|_| "native run folder evidence must be UTF-8 text.".to_string())
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

fn fixed_node_adapter_script_path() -> Result<PathBuf, String> {
    let repo = repo_root()?;
    let adapter_root = repo.join("adapters").join("node");
    let script = adapter_root.join("echo-adapter.mjs");
    if !script.starts_with(&adapter_root)
        || script.file_name().and_then(|name| name.to_str()) != Some("echo-adapter.mjs")
    {
        return Err("fixed Node adapter script path is not allowlisted.".to_string());
    }
    if !script.exists() {
        return Err("fixed Node adapter script is missing.".to_string());
    }
    Ok(script)
}

fn fixed_node_runtime_probe_script_path() -> Result<PathBuf, String> {
    let repo = repo_root()?;
    let adapter_root = repo.join("adapters").join("node");
    let script = adapter_root.join("runtime-probe.mjs");
    if !script.starts_with(&adapter_root)
        || script.file_name().and_then(|name| name.to_str()) != Some("runtime-probe.mjs")
        || !script.exists()
    {
        return Err("fixed Node runtime probe is missing or not allowlisted.".to_string());
    }
    Ok(script)
}

fn fixed_adapter_script_path(manifest: &NativeAdapterManifest) -> Result<PathBuf, String> {
    match manifest.adapter_id.as_str() {
        APPROVED_ADAPTER_ID => fixed_python_adapter_script_path(),
        NODE_ADAPTER_ID => fixed_node_adapter_script_path(),
        _ => Err("fixed adapter script is unavailable for adapterId.".to_string()),
    }
}

fn resolve_fixed_python_executable() -> Result<PathBuf, String> {
    resolve_fixed_python_executable_from(&["python", "python3"])
}

fn resolve_fixed_python_executable_from(candidates: &[&str]) -> Result<PathBuf, String> {
    for candidate in candidates {
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

fn resolve_fixed_node_executable() -> Result<PathBuf, String> {
    resolve_fixed_node_executable_from(&["node"])
}

fn resolve_fixed_node_executable_from(candidates: &[&str]) -> Result<PathBuf, String> {
    let probe = fixed_node_runtime_probe_script_path()?;
    for candidate in candidates {
        let output = Command::new(candidate)
            .arg(&probe)
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
    Err("Node runtime was not available for the fixed native adapter.".to_string())
}

fn resolve_fixed_adapter_executable(manifest: &NativeAdapterManifest) -> Result<PathBuf, String> {
    match manifest.adapter_id.as_str() {
        APPROVED_ADAPTER_ID => resolve_fixed_python_executable(),
        NODE_ADAPTER_ID => resolve_fixed_node_executable(),
        _ => Err("fixed adapter runtime is unavailable for adapterId.".to_string()),
    }
}

fn build_minimal_adapter_env(
    manifest: &NativeAdapterManifest,
    run_id: &str,
    mode: NativeAdapterTestMode,
) -> Vec<(String, String)> {
    let mut env = vec![
        ("AGENTIQUE_RUN_ID".to_string(), run_id.to_string()),
        (
            "AGENTIQUE_ADAPTER_RUNTIME".to_string(),
            manifest.runtime.clone(),
        ),
        (
            "AGENTIQUE_ADAPTER_MODE".to_string(),
            mode.as_str().to_string(),
        ),
    ];
    if manifest.adapter_id == APPROVED_ADAPTER_ID {
        env.push(("PYTHONNOUSERSITE".to_string(), "1".to_string()));
    } else if manifest.adapter_id == NODE_ADAPTER_ID {
        env.push(("NODE_NO_WARNINGS".to_string(), "1".to_string()));
    }
    for key in ["SystemRoot", "WINDIR"] {
        if let Ok(value) = std::env::var(key) {
            env.push((key.to_string(), value));
        }
    }
    env
}

fn build_adapter_request(
    manifest: &NativeAdapterManifest,
    run_id: &str,
    resource_id: &str,
    mode: NativeAdapterTestMode,
) -> String {
    let sleep_ms = if matches!(
        mode,
        NativeAdapterTestMode::Sleep | NativeAdapterTestMode::DescendantSleep
    ) {
        2_000
    } else {
        0
    };
    format!(
        "{}\n",
        serde_json::json!({
            "schemaVersion": adapter_request_schema(manifest),
            "runId": run_id,
            "mode": mode.as_str(),
            "sleepMs": sleep_ms,
            "resource": {
                "id": resource_id,
                "version": manifest.version,
                "digest": manifest.digest,
                "supportMode": manifest.support_mode
            },
            "payload": {
                "message": if manifest.adapter_id == NODE_ADAPTER_ID {
                    "node-adapter-ready"
                } else {
                    "adapter-ready"
                }
            }
        })
    )
}

fn adapter_request_schema(manifest: &NativeAdapterManifest) -> &'static str {
    if manifest.adapter_id == NODE_ADAPTER_ID {
        "agentique.nodeAdapterRun.v1"
    } else {
        "agentique.pythonAdapterRun.v1"
    }
}

fn adapter_result_schema(manifest: &NativeAdapterManifest) -> &'static str {
    match manifest.adapter_id.as_str() {
        NODE_ADAPTER_ID => "agentique.nodeAdapterResult.v1",
        native_wasm_sandbox::ADAPTER_ID => "agentique.wasmAdapterResult.v1",
        native_rootless_container::ADAPTER_ID => "agentique.containerAdapterResult.v1",
        _ => "agentique.pythonAdapterResult.v1",
    }
}

fn adapter_run_schema(manifest: &NativeAdapterManifest) -> &'static str {
    match manifest.adapter_id.as_str() {
        NODE_ADAPTER_ID => "agentique.nativeNodeRun.v1",
        native_wasm_sandbox::ADAPTER_ID => "agentique.nativeWasmRun.v1",
        native_rootless_container::ADAPTER_ID => "agentique.nativeContainerRun.v1",
        _ => "agentique.nativePythonRun.v1",
    }
}

fn adapter_output_relative_path(manifest: &NativeAdapterManifest) -> &'static str {
    match manifest.adapter_id.as_str() {
        NODE_ADAPTER_ID => "outputs/node-result.json",
        native_wasm_sandbox::ADAPTER_ID => "outputs/wasm-result.json",
        native_rootless_container::ADAPTER_ID => "outputs/container-result.json",
        _ => "outputs/python-result.json",
    }
}

fn adapter_artifact_relative_path(manifest: &NativeAdapterManifest) -> &'static str {
    match manifest.adapter_id.as_str() {
        NODE_ADAPTER_ID => "artifacts/node-result.json",
        native_wasm_sandbox::ADAPTER_ID => "artifacts/wasm-result.json",
        native_rootless_container::ADAPTER_ID => "artifacts/container-result.json",
        _ => "artifacts/python-result.json",
    }
}

fn adapter_root_ref(manifest: &NativeAdapterManifest) -> &'static str {
    match manifest.adapter_id.as_str() {
        NODE_ADAPTER_ID => "native-node-runner",
        native_wasm_sandbox::ADAPTER_ID => "native-wasm-runner",
        native_rootless_container::ADAPTER_ID => "native-rootless-container-runner",
        _ => "native-python-runner",
    }
}

impl NativeAdapterTestMode {
    fn as_str(self) -> &'static str {
        match self {
            NativeAdapterTestMode::Success => "success",
            NativeAdapterTestMode::Secret => "secret",
            NativeAdapterTestMode::InvalidJson => "invalid-json",
            NativeAdapterTestMode::ExitFailure => "exit-failure",
            NativeAdapterTestMode::Sleep => "sleep",
            NativeAdapterTestMode::DescendantSleep => "descendant-sleep",
            NativeAdapterTestMode::DescendantExit => "descendant-exit",
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
    let storage_root = native_storage_root()
        .get()
        .cloned()
        .unwrap_or(repo_root()?.join(".tmp"));
    #[cfg(test)]
    let namespace = format!("native-python-runner-test-{}", std::process::id());
    #[cfg(not(test))]
    let namespace = "native-python-runner".to_string();
    Ok(storage_root.join(namespace))
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
    // CRITICAL: redact the complete bounded input before truncation; truncating first can split a
    // secret marker and persist its unrecognized prefix at the evidence boundary.
    let mut text = redact_bearer_tokens(value.to_string());
    text = redact_prefixed_ascii_token(text, "sk-", 20);
    text = redact_prefixed_ascii_token(text, "ghp_", 20);
    text = redact_prefixed_ascii_token(text, "github_pat_", 20);
    text = redact_prefixed_ascii_token(text, "ya29.", 10);
    for marker in [
        "cookie=",
        "cookie:",
        "Cookie=",
        "Cookie:",
        "set-cookie=",
        "Set-Cookie=",
    ] {
        text = redact_span_after_marker(text, marker, "redacted:browser-material");
    }
    for marker in ["storageState=", "localStorage=", "sessionStorage="] {
        text = redact_span_after_marker(text, marker, "redacted:browser-material");
    }
    for marker in ["vault:", "Vault:"] {
        text = redact_span_after_marker(text, marker, "redacted:vault-reference");
    }
    for marker in ["rawCommand=", "processCommand=", "encodedCommand="] {
        text = redact_span_after_marker(text, marker, "redacted:process-authority");
    }
    for marker in ["/home/", "/Users/", "\\\\"] {
        text = redact_span_after_marker(text, marker, "redacted:local-path");
    }
    let internal_markers = [
        [".", "planning"].concat(),
        ["ref", "erence/"].concat(),
        ["ref", "erence\\"].concat(),
        ["UI", "RUN-"].concat(),
        ["UI", "HED-"].concat(),
    ];
    for marker in &internal_markers {
        text = redact_span_after_marker(text, marker, "redacted:internal-reference");
    }
    // CRITICAL: keep path redaction generic; public receipts must not leak local roots.
    for drive in (b'A'..=b'Z').chain(b'a'..=b'z') {
        for separator in ['\\', '/'] {
            let marker = format!("{}:{}", drive as char, separator);
            text = redact_span_after_marker(text, &marker, "redacted:local-path");
        }
    }
    bounded_text(&text)
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

fn redact_span_after_marker(mut text: String, marker: &str, replacement: &str) -> String {
    let mut search_start = 0;
    while let Some(relative_start) = text[search_start..].find(marker) {
        let start = search_start + relative_start;
        let mut end = start + marker.len();
        for character in text[end..].chars() {
            if character.is_whitespace() || matches!(character, '|' | ',' | ';' | '"' | '\'') {
                break;
            }
            end += character.len_utf8();
        }
        text.replace_range(start..end, replacement);
        search_start = start + replacement.len();
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

fn native_coordinator_records() -> &'static Mutex<HashMap<String, NativeCoordinatorRecord>> {
    static RECORDS: OnceLock<Mutex<HashMap<String, NativeCoordinatorRecord>>> = OnceLock::new();
    RECORDS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn native_app_handle() -> &'static OnceLock<tauri::AppHandle> {
    static APP_HANDLE: OnceLock<tauri::AppHandle> = OnceLock::new();
    &APP_HANDLE
}

fn native_storage_root() -> &'static OnceLock<PathBuf> {
    static ROOT: OnceLock<PathBuf> = OnceLock::new();
    &ROOT
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

fn native_approval_proposal_records(
) -> &'static Mutex<HashMap<String, NativeApprovalProposalRecord>> {
    static RECORDS: OnceLock<Mutex<HashMap<String, NativeApprovalProposalRecord>>> =
        OnceLock::new();
    RECORDS.get_or_init(|| Mutex::new(HashMap::new()))
}

#[cfg(test)]
fn native_test_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
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

fn issue_permission_grant_id(proposal: &NativeApprovalProposalRecord) -> String {
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
            proposal.resource_id,
            proposal.session_id,
            proposal.run_id,
            proposal.adapter_id,
            proposal.permission_profile_id,
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

fn native_epoch_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
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
    native_approval_proposal_records()
        .lock()
        .expect("native approval proposal store lock")
        .clear();
    native_coordinator_records()
        .lock()
        .expect("native coordinator store lock")
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
        permission_grant_id: request.permission_grant_id.clone(),
        state: NativeRunState::Running,
        approval_consumed: true,
        execution: None,
        cleanup_recovery: None,
        product_projection: None,
        working_set_checkpoint: None,
    };
    reset_native_events(&request).expect("stale run event reset");
    persist_native_run_registry(&request, &NativeRunState::PendingApproval)
        .expect("stale run pending registry state");
    persist_native_run_registry(&request, &NativeRunState::Running)
        .expect("stale run active registry state");
    runner_records()
        .lock()
        .expect("runner record store lock")
        .insert(run_id.to_string(), record);
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
    #[test]
    fn true_runner_ui_e2e_fixture_modes_are_fixed_and_fail_closed() {
        assert_eq!(
            super::debug_native_adapter_mode(Some("sleep")),
            super::NativeAdapterTestMode::Sleep
        );
        assert_eq!(
            super::debug_native_adapter_mode(Some("exit-failure")),
            super::NativeAdapterTestMode::ExitFailure
        );
        for rejected in [None, Some("success"), Some("secret"), Some("../../tool")] {
            assert_eq!(
                super::debug_native_adapter_mode(rejected),
                super::NativeAdapterTestMode::Success
            );
        }
    }

    use super::{
        agentique_runner_approval_proposal, agentique_runner_artifacts, agentique_runner_cancel,
        agentique_runner_checkpoint_history, agentique_runner_cleanup,
        agentique_runner_decide_approval, agentique_runner_logs, agentique_runner_prepare,
        agentique_runner_revoke_permission, agentique_runner_start, agentique_runner_status,
        agentique_runner_time_travel_prepare, capture_native_working_set,
        contains_unsafe_projection_material, create_stale_native_run_for_tests,
        execute_fixed_python_adapter_for_tests, expire_native_permission_grant_for_tests,
        fixed_python_adapter_manifest, native_working_set_scope_dir,
        prepare_native_time_travel_with_fault, project_native_terminal_with_fault,
        read_committed_native_projection, redact_runner_text, reset_runner_records_for_tests,
        resolve_fixed_python_executable_from, restore_native_working_set, review_adapter_manifest,
        revoke_native_permission_grant_for_tests, runner_records, settle_native_adapter_completion,
        start_native_run, validate_native_working_relative, validate_opaque_id,
        validate_runner_request, NativeAdapterManifest, NativeAdapterTestMode,
        NativeApprovalDecisionReceipt, NativeApprovalDecisionRequest,
        NativeProcessCleanupObservation, NativeProjectionFault, NativeRunRecord, NativeRunState,
        NativeTimeTravelFault, NativeTimeTravelPrepareRequest, RunnerCommandRequest,
        APPROVED_ADAPTER_ID, APPROVED_PERMISSION_PROFILE_ID, MAX_NATIVE_RUN_REGISTRY_RECORDS,
        MAX_NATIVE_RUN_REGISTRY_RECORD_BYTES, NATIVE_TIME_TRAVEL_REQUEST_SCHEMA,
        RUNNER_NATIVE_CLEANUP_REQUIRED_STATE,
    };
    use std::fs;
    use std::path::Path;
    use std::sync::{Arc, Mutex};
    use std::thread;
    use std::time::{Duration, Instant};

    fn test_lock() -> &'static Mutex<()> {
        super::native_test_lock()
    }

    fn snapshot_test_tree(root: &Path) -> Vec<(String, Vec<u8>)> {
        fn visit(base: &Path, current: &Path, output: &mut Vec<(String, Vec<u8>)>) {
            if !current.exists() {
                return;
            }
            let mut entries = fs::read_dir(current)
                .expect("read snapshot directory")
                .collect::<Result<Vec<_>, _>>()
                .expect("collect snapshot entries");
            entries.sort_by_key(|entry| entry.file_name());
            for entry in entries {
                let path = entry.path();
                if entry.file_type().expect("snapshot file type").is_dir() {
                    visit(base, &path, output);
                } else {
                    let relative = path
                        .strip_prefix(base)
                        .expect("snapshot relative path")
                        .to_string_lossy()
                        .replace('\\', "/");
                    output.push((relative, fs::read(path).expect("snapshot file bytes")));
                }
            }
        }

        let mut output = Vec::new();
        visit(root, root, &mut output);
        output
    }

    fn snapshot_source_memory(run_id: &str) -> (String, Vec<String>, Vec<String>, String) {
        let run = format!(
            "{:?}",
            runner_records()
                .lock()
                .expect("snapshot runner records")
                .get(run_id)
        );
        let mut proposals = super::native_approval_proposal_records()
            .lock()
            .expect("snapshot proposals")
            .values()
            .filter(|record| record.run_id == run_id)
            .map(|record| format!("{}:{record:?}", record.proposal_id))
            .collect::<Vec<_>>();
        proposals.sort();
        let mut grants = super::native_permission_grant_records()
            .lock()
            .expect("snapshot grants")
            .values()
            .filter(|record| record.run_id == run_id)
            .map(|record| format!("{}:{record:?}", record.grant_id))
            .collect::<Vec<_>>();
        grants.sort();
        let events = format!(
            "{:?}",
            super::native_event_records()
                .lock()
                .expect("snapshot events")
                .get(run_id)
        );
        (run, proposals, grants, events)
    }

    #[test]
    fn native_evidence_redaction_covers_seeded_corpus_before_persistence() {
        let bearer = ["Bear", "er abcdefghijklmnop"].concat();
        let github = ["gh", "p_12345678901234567890"].concat();
        let google = ["ya", "29.1234567890abcdef"].concat();
        let cookie = ["cook", "ie=session-sensitive"].concat();
        let vault = ["va", "ult:providerCredential"].concat();
        let unix_path = ["/ho", "me/example/private.txt"].concat();
        let internal = [".", "planning/private-record.md"].concat();
        let raw = ["raw", "Command=powershell unsafe"].concat();
        let seeded = [
            bearer.as_str(),
            github.as_str(),
            google.as_str(),
            cookie.as_str(),
            vault.as_str(),
            unix_path.as_str(),
            internal.as_str(),
            raw.as_str(),
        ]
        .join(" | ");

        let redacted = redact_runner_text(&seeded);
        for marker in [
            &bearer, &github, &google, &cookie, &vault, &unix_path, &internal, &raw,
        ] {
            assert!(
                !redacted.contains(marker),
                "seeded marker survived: {marker}"
            );
        }
        assert!(redacted.contains("redacted:inline-sensitive-material"));
        assert!(redacted.contains("redacted:local-path"));
        assert!(redacted.contains("redacted:internal-reference"));
        assert!(redacted.contains("redacted:process-authority"));

        let percent = internal.replace('.', "%2E").replace('/', "%2F");
        let encoded = "QmVhcmVyIGFiY2RlZmdoaWprbG1ub3A=";
        assert!(contains_unsafe_projection_material(percent.as_bytes()));
        assert!(contains_unsafe_projection_material(encoded.as_bytes()));

        let boundary_seed = format!("{}{}", "x".repeat(super::MAX_NATIVE_LOG_BYTES - 3), bearer);
        let bounded = redact_runner_text(&boundary_seed);
        assert!(!bounded.contains("Bearer"));
        assert!(bounded.chars().count() <= super::MAX_NATIVE_LOG_BYTES);
    }

    fn approve_pending_run(
        resource_id: &str,
        session_id: &str,
        run_id: &str,
        proposal_id: &str,
    ) -> NativeApprovalDecisionReceipt {
        let proposal_digest = super::native_approval_proposal_records()
            .lock()
            .expect("native approval proposal store lock")
            .get(proposal_id)
            .expect("pending proposal")
            .proposal_digest
            .clone();
        agentique_runner_decide_approval(NativeApprovalDecisionRequest {
            resource_id: resource_id.to_string(),
            session_id: session_id.to_string(),
            run_id: run_id.to_string(),
            proposal_id: proposal_id.to_string(),
            proposal_digest,
            decision: "approved".to_string(),
            actor_id: "actor.local-user".to_string(),
        })
        .expect("explicit approval decision")
    }

    fn wait_for_run_state(run_id: &str, expected: &[&str]) -> NativeRunRecord {
        let mut observed = "missing".to_string();
        for _ in 0..500 {
            if let Some(record) = super::runner_records()
                .lock()
                .expect("runner record store lock")
                .get(run_id)
                .cloned()
            {
                observed = record.state.as_str().to_string();
                if expected.contains(&record.state.as_str()) {
                    // IMPORTANT: terminal state is published just before the async worker removes
                    // its coordinator record. Returning inside that window makes the next
                    // single-threaded test clear a still-finishing worker and causes false
                    // coordinator leaks or poisoned shared test state.
                    let coordinator_finished = !matches!(
                        record.state,
                        NativeRunState::Succeeded
                            | NativeRunState::Failed
                            | NativeRunState::Canceled
                            | NativeRunState::TimedOut
                    ) || !super::native_coordinator_records()
                        .lock()
                        .expect("native coordinator store lock")
                        .contains_key(run_id);
                    if coordinator_finished {
                        return record;
                    }
                }
            }
            thread::sleep(Duration::from_millis(10));
        }
        panic!("run {run_id} did not reach one of {expected:?}; observed {observed}");
    }

    #[cfg(target_os = "windows")]
    fn wait_for_process_tree_count(run_id: &str, minimum: usize) -> usize {
        let mut observed = 0;
        for _ in 0..500 {
            if let Some(supervisor) = super::native_coordinator_records()
                .lock()
                .expect("native coordinator store lock")
                .get(run_id)
                .and_then(|record| record.process_tree_supervisor.clone())
            {
                observed = supervisor
                    .active_process_count()
                    .expect("Windows Job Object accounting query");
                if observed >= minimum {
                    return observed;
                }
            }
            thread::sleep(Duration::from_millis(10));
        }
        panic!("run {run_id} did not reach {minimum} contained processes; observed {observed}");
    }

    #[cfg(unix)]
    fn wait_for_unix_process_tree_active(run_id: &str) {
        for _ in 0..500 {
            if let Some(supervisor) = super::native_coordinator_records()
                .lock()
                .expect("native coordinator store lock")
                .get(run_id)
                .and_then(|record| record.process_tree_supervisor.clone())
            {
                if supervisor
                    .active_process_count()
                    .expect("Unix process-group activity probe")
                    > 0
                {
                    // The fixed adapter spawns its descendant immediately after reading stdin.
                    // Retaining a short guard interval makes cancel/timeout exercise that real tree.
                    thread::sleep(Duration::from_millis(250));
                    return;
                }
            }
            thread::sleep(Duration::from_millis(10));
        }
        panic!("run {run_id} did not enter an active native Unix process group");
    }

    fn approved_start_request(
        resource_id: &str,
        session_id: &str,
        run_id: &str,
    ) -> RunnerCommandRequest {
        approved_start_request_for(
            resource_id,
            session_id,
            run_id,
            APPROVED_ADAPTER_ID,
            APPROVED_PERMISSION_PROFILE_ID,
        )
    }

    fn approved_start_request_for(
        resource_id: &str,
        session_id: &str,
        run_id: &str,
        adapter_id: &str,
        permission_profile_id: &str,
    ) -> RunnerCommandRequest {
        let prepare = agentique_runner_prepare(RunnerCommandRequest {
            resource_id: resource_id.to_string(),
            session_id: session_id.to_string(),
            run_id: run_id.to_string(),
            command_id: Some(format!("command.prepare-{run_id}")),
            adapter_id: Some(adapter_id.to_string()),
            approval_id: None,
            permission_profile_id: Some(permission_profile_id.to_string()),
            permission_grant_id: None,
        })
        .expect("prepare approved async request");
        let decision = approve_pending_run(
            resource_id,
            session_id,
            run_id,
            prepare.approval_id.as_deref().expect("proposal id"),
        );
        RunnerCommandRequest {
            resource_id: resource_id.to_string(),
            session_id: session_id.to_string(),
            run_id: run_id.to_string(),
            command_id: Some(format!("command.start-{run_id}")),
            adapter_id: Some(adapter_id.to_string()),
            approval_id: prepare.approval_id,
            permission_profile_id: Some(permission_profile_id.to_string()),
            permission_grant_id: decision.permission_grant.map(|grant| grant.grant_id),
        }
    }

    fn prepared_registry_fixture(suffix: &str) -> RunnerCommandRequest {
        let request = RunnerCommandRequest {
            resource_id: format!("resource.registry-{suffix}"),
            session_id: format!("session.registry-{suffix}"),
            run_id: format!("run.registry-{suffix}"),
            command_id: Some(format!("command.registry-{suffix}-prepare")),
            adapter_id: Some(APPROVED_ADAPTER_ID.to_string()),
            approval_id: None,
            permission_profile_id: Some(APPROVED_PERMISSION_PROFILE_ID.to_string()),
            permission_grant_id: None,
        };
        agentique_runner_prepare(request.clone()).expect("registry fixture should prepare");
        request
    }

    fn assert_registry_recovery_requires_cleanup(request: RunnerCommandRequest) {
        reset_runner_records_for_tests();
        let recovered = agentique_runner_status(RunnerCommandRequest {
            command_id: Some(format!("command.{}-status", request.run_id)),
            ..request
        })
        .expect("invalid registry evidence must recover only as cleanup-required");
        assert_eq!(recovered.state, RUNNER_NATIVE_CLEANUP_REQUIRED_STATE);
        assert!(recovered
            .product_projection
            .map_or(true, |receipt| !receipt.committed));
    }

    #[test]
    fn durable_product_projection_commits_before_success_and_recovers_after_restart() {
        let _guard = test_lock().lock().expect("runner test lock");
        reset_runner_records_for_tests();
        let request = approved_start_request(
            "resource.projection-recovery",
            "session.projection-recovery",
            "run.projection-recovery",
        );
        start_native_run(
            request.clone(),
            NativeAdapterTestMode::Success,
            Duration::from_secs(5),
        )
        .expect("native projection run should start");
        let terminal = wait_for_run_state("run.projection-recovery", &["succeeded"]);
        let projection = terminal
            .product_projection
            .expect("success must own a durable product projection");
        assert!(projection.committed);
        assert_eq!(projection.recovery_classification, "completed");
        let events = super::event_replay_for(&request).expect("projection event replay");
        assert_eq!(
            events.events.last().map(|event| event.event_type.as_str()),
            Some("run.succeeded")
        );

        reset_runner_records_for_tests();
        let recovered = agentique_runner_status(RunnerCommandRequest {
            command_id: Some("command.projection-recovery-status".to_string()),
            approval_id: None,
            permission_grant_id: None,
            ..request
        })
        .expect("durable projection should recover after process-local state loss");
        assert_eq!(recovered.state, "succeeded");
        assert!(recovered.product_projection.is_some_and(
            |receipt| receipt.committed && receipt.recovery_classification == "completed"
        ));
    }

    #[test]
    fn durable_native_run_registry_recovers_pending_active_and_terminal_states() {
        let _guard = test_lock().lock().expect("runner test lock");
        reset_runner_records_for_tests();

        let pending_request = RunnerCommandRequest {
            resource_id: "resource.registry-pending".to_string(),
            session_id: "session.registry-pending".to_string(),
            run_id: "run.registry-pending".to_string(),
            command_id: Some("command.registry-pending-prepare".to_string()),
            adapter_id: Some(APPROVED_ADAPTER_ID.to_string()),
            approval_id: None,
            permission_profile_id: Some(APPROVED_PERMISSION_PROFILE_ID.to_string()),
            permission_grant_id: None,
        };
        agentique_runner_prepare(pending_request.clone())
            .expect("pending registry fixture should prepare");
        reset_runner_records_for_tests();
        assert!(agentique_runner_prepare(pending_request.clone())
            .expect_err("restart must not re-prepare an existing durable run address")
            .contains("already has durable native evidence"));
        assert!(super::native_approval_proposal_records()
            .lock()
            .expect("native approval proposal store lock")
            .is_empty());
        let pending = agentique_runner_status(RunnerCommandRequest {
            command_id: Some("command.registry-pending-status".to_string()),
            ..pending_request.clone()
        })
        .expect("pending registry state should recover after process-local loss");
        assert_eq!(pending.state, "pending-approval");
        assert!(!pending.will_spawn_process);
        assert!(agentique_runner_start(RunnerCommandRequest {
            command_id: Some("command.registry-pending-forged-start".to_string()),
            approval_id: Some("restart-reauthorization-required".to_string()),
            permission_grant_id: Some("grant.registry-forged".to_string()),
            ..pending_request
        })
        .is_err());

        create_stale_native_run_for_tests(
            "resource.registry-active",
            "session.registry-active",
            "run.registry-active",
        );
        reset_runner_records_for_tests();
        let active_request = RunnerCommandRequest {
            resource_id: "resource.registry-active".to_string(),
            session_id: "session.registry-active".to_string(),
            run_id: "run.registry-active".to_string(),
            command_id: Some("command.registry-active-status".to_string()),
            adapter_id: Some(APPROVED_ADAPTER_ID.to_string()),
            approval_id: None,
            permission_profile_id: Some(APPROVED_PERMISSION_PROFILE_ID.to_string()),
            permission_grant_id: None,
        };
        let active = agentique_runner_status(active_request.clone())
            .expect("interrupted active registry state should recover fail closed");
        assert_eq!(active.state, RUNNER_NATIVE_CLEANUP_REQUIRED_STATE);
        assert!(active
            .cleanup_recovery
            .as_ref()
            .is_some_and(|receipt| receipt.cleanup_required && receipt.orphan_count.is_none()));
        assert!(!super::native_coordinator_records()
            .lock()
            .expect("native coordinator store lock")
            .contains_key(&active_request.run_id));
        let active_registry = super::read_durable_native_run_registry(&active_request)
            .expect("active registry should remain readable");
        assert_eq!(
            active_registry
                .iter()
                .map(|record| record.state.as_str())
                .collect::<Vec<_>>(),
            vec!["pending-approval", "running", "cleanup-required"]
        );
        assert!(active_registry
            .iter()
            .all(|record| record.redacted && !record.replays_external_effects));

        create_stale_native_run_for_tests(
            "resource.registry-canceling",
            "session.registry-canceling",
            "run.registry-canceling",
        );
        let canceling_request = RunnerCommandRequest {
            resource_id: "resource.registry-canceling".to_string(),
            session_id: "session.registry-canceling".to_string(),
            run_id: "run.registry-canceling".to_string(),
            command_id: Some("command.registry-canceling-status".to_string()),
            adapter_id: Some(APPROVED_ADAPTER_ID.to_string()),
            approval_id: None,
            permission_profile_id: Some(APPROVED_PERMISSION_PROFILE_ID.to_string()),
            permission_grant_id: None,
        };
        super::persist_native_run_registry(&canceling_request, &NativeRunState::Canceling)
            .expect("canceling registry transition");
        reset_runner_records_for_tests();
        assert_eq!(
            agentique_runner_status(canceling_request)
                .expect("interrupted canceling registry state should recover fail closed")
                .state,
            RUNNER_NATIVE_CLEANUP_REQUIRED_STATE
        );

        let terminal_request = RunnerCommandRequest {
            resource_id: "resource.registry-terminal".to_string(),
            session_id: "session.registry-terminal".to_string(),
            run_id: "run.registry-terminal".to_string(),
            command_id: Some("command.registry-terminal".to_string()),
            adapter_id: Some(APPROVED_ADAPTER_ID.to_string()),
            approval_id: None,
            permission_profile_id: Some(APPROVED_PERMISSION_PROFILE_ID.to_string()),
            permission_grant_id: None,
        };
        create_stale_native_run_for_tests(
            &terminal_request.resource_id,
            &terminal_request.session_id,
            &terminal_request.run_id,
        );
        settle_native_adapter_completion(
            &terminal_request,
            APPROVED_ADAPTER_ID,
            &Arc::new(Mutex::new(None)),
            Err("injected deterministic terminal fixture".to_string()),
            NativeProcessCleanupObservation::verified_zero("test-no-process"),
        )
        .expect("terminal registry fixture should commit");
        assert_eq!(
            wait_for_run_state("run.registry-terminal", &["failed"]).state,
            NativeRunState::Failed
        );
        reset_runner_records_for_tests();
        let terminal = agentique_runner_status(RunnerCommandRequest {
            command_id: Some("command.registry-terminal-status".to_string()),
            approval_id: None,
            permission_grant_id: None,
            ..terminal_request.clone()
        })
        .expect("terminal registry plus committed projection should recover failure evidence");
        assert_eq!(terminal.state, "failed");
        assert!(terminal
            .product_projection
            .is_some_and(|receipt| receipt.committed && receipt.state == "failed"));
        let terminal_registry = super::read_durable_native_run_registry(&terminal_request)
            .expect("terminal registry should remain readable");
        assert_eq!(
            terminal_registry.last().map(|record| record.state.as_str()),
            Some("failed")
        );
        let cleaned = agentique_runner_cleanup(RunnerCommandRequest {
            command_id: Some("command.registry-terminal-cleanup".to_string()),
            approval_id: None,
            permission_grant_id: None,
            ..terminal_request.clone()
        })
        .expect("verified terminal cleanup should persist cleaned state");
        assert_eq!(cleaned.state, "cleaned-up");
        reset_runner_records_for_tests();
        let recovered_cleaned = agentique_runner_status(RunnerCommandRequest {
            command_id: Some("command.registry-cleaned-status".to_string()),
            approval_id: None,
            permission_grant_id: None,
            ..terminal_request.clone()
        })
        .expect("cleaned registry state should recover with durable cleanup evidence");
        assert_eq!(recovered_cleaned.state, "cleaned-up");
        assert!(recovered_cleaned.cleanup_recovery.is_some_and(|evidence| {
            evidence.process_tree_cleanup
                && evidence.orphan_count == Some(0)
                && !evidence.cleanup_required
        }));
        let persisted = fs::read_to_string(
            super::native_run_registry_dir(&terminal_request.run_id)
                .expect("registry path")
                .join("0001.json"),
        )
        .expect("persisted registry entry");
        assert!(!persisted.contains("approvalId"));
        assert!(!persisted.contains("permissionGrantId"));
    }

    #[test]
    fn durable_native_run_registry_rejects_corruption_gap_and_scope_tamper() {
        let _guard = test_lock().lock().expect("runner test lock");
        reset_runner_records_for_tests();

        let tamper_request = RunnerCommandRequest {
            resource_id: "resource.registry-tamper".to_string(),
            session_id: "session.registry-tamper".to_string(),
            run_id: "run.registry-tamper".to_string(),
            command_id: Some("command.registry-tamper-prepare".to_string()),
            adapter_id: Some(APPROVED_ADAPTER_ID.to_string()),
            approval_id: None,
            permission_profile_id: Some(APPROVED_PERMISSION_PROFILE_ID.to_string()),
            permission_grant_id: None,
        };
        agentique_runner_prepare(tamper_request.clone()).expect("tamper fixture should prepare");
        let tamper_path = super::native_run_registry_dir(&tamper_request.run_id)
            .expect("tamper registry path")
            .join("0001.json");
        let mut tampered: serde_json::Value =
            serde_json::from_slice(&fs::read(&tamper_path).expect("tamper registry fixture"))
                .expect("tamper registry JSON");
        tampered["resourceId"] = serde_json::Value::String("resource.cross-address".to_string());
        fs::write(
            &tamper_path,
            serde_json::to_vec_pretty(&tampered).expect("serialize tampered registry"),
        )
        .expect("write cross-address registry fixture");
        reset_runner_records_for_tests();
        let tampered_status = agentique_runner_status(RunnerCommandRequest {
            command_id: Some("command.registry-tamper-status".to_string()),
            ..tamper_request
        })
        .expect("cross-address registry must recover only as cleanup-required");
        assert_eq!(tampered_status.state, RUNNER_NATIVE_CLEANUP_REQUIRED_STATE);

        let gap_request = RunnerCommandRequest {
            resource_id: "resource.registry-gap".to_string(),
            session_id: "session.registry-gap".to_string(),
            run_id: "run.registry-gap".to_string(),
            command_id: Some("command.registry-gap-prepare".to_string()),
            adapter_id: Some(APPROVED_ADAPTER_ID.to_string()),
            approval_id: None,
            permission_profile_id: Some(APPROVED_PERMISSION_PROFILE_ID.to_string()),
            permission_grant_id: None,
        };
        agentique_runner_prepare(gap_request.clone()).expect("gap fixture should prepare");
        super::persist_native_run_registry(&gap_request, &NativeRunState::Running)
            .expect("gap fixture running transition");
        let gap_dir =
            super::native_run_registry_dir(&gap_request.run_id).expect("gap registry path");
        fs::rename(gap_dir.join("0002.json"), gap_dir.join("0003.json"))
            .expect("create registry sequence gap");
        reset_runner_records_for_tests();
        let gap_status = agentique_runner_status(RunnerCommandRequest {
            command_id: Some("command.registry-gap-status".to_string()),
            ..gap_request
        })
        .expect("gapped registry must recover only as cleanup-required");
        assert_eq!(gap_status.state, RUNNER_NATIVE_CLEANUP_REQUIRED_STATE);

        let partial_request = RunnerCommandRequest {
            resource_id: "resource.registry-partial".to_string(),
            session_id: "session.registry-partial".to_string(),
            run_id: "run.registry-partial".to_string(),
            command_id: Some("command.registry-partial-prepare".to_string()),
            adapter_id: Some(APPROVED_ADAPTER_ID.to_string()),
            approval_id: None,
            permission_profile_id: Some(APPROVED_PERMISSION_PROFILE_ID.to_string()),
            permission_grant_id: None,
        };
        agentique_runner_prepare(partial_request.clone()).expect("partial fixture should prepare");
        fs::write(
            super::native_run_registry_dir(&partial_request.run_id)
                .expect("partial registry path")
                .join(".0002.tmp-injected"),
            b"partial",
        )
        .expect("write partial registry fixture");
        reset_runner_records_for_tests();
        let partial_status = agentique_runner_status(RunnerCommandRequest {
            command_id: Some("command.registry-partial-status".to_string()),
            ..partial_request
        })
        .expect("partial registry must recover only as cleanup-required");
        assert_eq!(partial_status.state, RUNNER_NATIVE_CLEANUP_REQUIRED_STATE);

        let unknown_request = prepared_registry_fixture("unknown-state");
        let unknown_path = super::native_run_registry_dir(&unknown_request.run_id)
            .expect("unknown-state registry path")
            .join("0001.json");
        let mut unknown: serde_json::Value = serde_json::from_slice(
            &fs::read(&unknown_path).expect("unknown-state registry fixture"),
        )
        .expect("unknown-state registry JSON");
        unknown["state"] = serde_json::Value::String("unknown".to_string());
        fs::write(
            unknown_path,
            serde_json::to_vec_pretty(&unknown).expect("serialize unknown-state registry"),
        )
        .expect("write unknown-state registry fixture");
        assert_registry_recovery_requires_cleanup(unknown_request);

        let manifest_request = prepared_registry_fixture("manifest-drift");
        let manifest_path = super::native_run_registry_dir(&manifest_request.run_id)
            .expect("manifest registry path")
            .join("0001.json");
        let mut manifest: serde_json::Value =
            serde_json::from_slice(&fs::read(&manifest_path).expect("manifest registry fixture"))
                .expect("manifest registry JSON");
        manifest["adapterManifestDigest"] = serde_json::Value::String("d".repeat(64));
        fs::write(
            manifest_path,
            serde_json::to_vec_pretty(&manifest).expect("serialize manifest registry"),
        )
        .expect("write manifest-drift registry fixture");
        assert_registry_recovery_requires_cleanup(manifest_request);

        let oversized_request = prepared_registry_fixture("oversized");
        fs::write(
            super::native_run_registry_dir(&oversized_request.run_id)
                .expect("oversized registry path")
                .join("0001.json"),
            vec![b'x'; MAX_NATIVE_RUN_REGISTRY_RECORD_BYTES as usize + 1],
        )
        .expect("write oversized registry fixture");
        assert_registry_recovery_requires_cleanup(oversized_request);

        let count_request = prepared_registry_fixture("record-count");
        let count_dir = super::native_run_registry_dir(&count_request.run_id)
            .expect("record-count registry path");
        for index in 2..=MAX_NATIVE_RUN_REGISTRY_RECORDS + 1 {
            fs::write(count_dir.join(format!("{index:04}.json")), b"{}")
                .expect("write excessive registry fixture");
        }
        assert_registry_recovery_requires_cleanup(count_request);

        let duplicate_request = prepared_registry_fixture("duplicate");
        let duplicate_dir = super::native_run_registry_dir(&duplicate_request.run_id)
            .expect("duplicate registry path");
        fs::copy(
            duplicate_dir.join("0001.json"),
            duplicate_dir.join("0001-duplicate.json"),
        )
        .expect("write duplicate registry fixture");
        assert_registry_recovery_requires_cleanup(duplicate_request);

        let linked_request = prepared_registry_fixture("linked");
        let linked_dir =
            super::native_run_registry_dir(&linked_request.run_id).expect("linked registry path");
        let linked_record = linked_dir.join("0001.json");
        let linked_target = super::native_run_root()
            .expect("native root")
            .join("linked-registry-target.json");
        let original = fs::read(&linked_record).expect("linked registry fixture");
        fs::write(&linked_target, &original).expect("write linked registry target");
        fs::remove_file(&linked_record).expect("replace registry record with link");
        #[cfg(unix)]
        let link_created = std::os::unix::fs::symlink(&linked_target, &linked_record).is_ok();
        #[cfg(target_os = "windows")]
        let link_created =
            std::os::windows::fs::symlink_file(&linked_target, &linked_record).is_ok();
        if link_created {
            assert_registry_recovery_requires_cleanup(linked_request);
        } else {
            fs::write(linked_record, original).expect("restore unsupported link fixture");
        }
    }

    #[test]
    fn native_projection_faults_before_pointer_never_become_authoritative() {
        let _guard = test_lock().lock().expect("runner test lock");
        for (suffix, fault) in [
            ("before", NativeProjectionFault::BeforeContent),
            ("content", NativeProjectionFault::AfterContent),
            ("manifest", NativeProjectionFault::AfterManifest),
        ] {
            let request = RunnerCommandRequest {
                resource_id: format!("resource.projection-{suffix}"),
                session_id: format!("session.projection-{suffix}"),
                run_id: format!("run.projection-{suffix}"),
                command_id: Some(format!("command.projection-{suffix}")),
                adapter_id: Some("adapter.local-python".to_string()),
                approval_id: None,
                permission_profile_id: Some("permission.local-python.minimal".to_string()),
                permission_grant_id: None,
            };
            let result = project_native_terminal_with_fault(
                &request,
                &NativeRunState::Canceled,
                None,
                fault,
            );
            assert!(result.is_err());
            assert!(read_committed_native_projection(&request)
                .expect("fault readback should remain parseable")
                .is_none());
        }
    }

    #[test]
    fn native_projection_pointer_is_idempotent_and_rejects_conflicting_terminal() {
        let _guard = test_lock().lock().expect("runner test lock");
        let request = RunnerCommandRequest {
            resource_id: "resource.projection-idempotent".to_string(),
            session_id: "session.projection-idempotent".to_string(),
            run_id: "run.projection-idempotent".to_string(),
            command_id: Some("command.projection-idempotent".to_string()),
            adapter_id: Some("adapter.local-python".to_string()),
            approval_id: None,
            permission_profile_id: Some("permission.local-python.minimal".to_string()),
            permission_grant_id: None,
        };
        let first = project_native_terminal_with_fault(
            &request,
            &NativeRunState::Canceled,
            None,
            NativeProjectionFault::None,
        )
        .expect("first projection");
        let repeat = project_native_terminal_with_fault(
            &request,
            &NativeRunState::Canceled,
            None,
            NativeProjectionFault::None,
        )
        .expect("idempotent projection");
        assert!(first.committed);
        assert!(repeat.idempotent);
        assert!(project_native_terminal_with_fault(
            &request,
            &NativeRunState::Failed,
            None,
            NativeProjectionFault::None,
        )
        .is_err());
    }

    #[test]
    fn restart_active_marker_is_cleanup_required_without_effect_replay() {
        let _guard = test_lock().lock().expect("runner test lock");
        reset_runner_records_for_tests();
        let request = RunnerCommandRequest {
            resource_id: "resource.projection-interrupted".to_string(),
            session_id: "session.projection-interrupted".to_string(),
            run_id: "run.projection-interrupted".to_string(),
            command_id: Some("command.projection-interrupted".to_string()),
            adapter_id: Some("adapter.local-python".to_string()),
            approval_id: None,
            permission_profile_id: Some("permission.local-python.minimal".to_string()),
            permission_grant_id: None,
        };
        super::write_native_active_projection_marker(&request).expect("active marker");
        let recovered = agentique_runner_status(request).expect("interrupted projection recovery");
        assert_eq!(recovered.state, "cleanup-required");
        let projection = recovered
            .product_projection
            .expect("interrupted projection receipt");
        assert!(!projection.committed);
        assert_eq!(projection.recovery_classification, "cleanup-required");
        assert!(recovered
            .cleanup_recovery
            .is_some_and(|receipt| receipt.cleanup_required));
    }

    #[test]
    fn restart_rejects_a_tampered_product_artifact_as_corrupt() {
        let _guard = test_lock().lock().expect("runner test lock");
        reset_runner_records_for_tests();
        let projection_dir = super::native_projection_run_dir("run.projection-tamper")
            .expect("projection test directory");
        if projection_dir.exists() {
            fs::remove_dir_all(&projection_dir).expect("clear exact projection test directory");
        }
        // IMPORTANT: clear the exact fixture before prepare; removing the projection root after
        // prepare would deliberately delete durable event sequences 1-3 and create a false gap.
        let request = approved_start_request(
            "resource.projection-tamper",
            "session.projection-tamper",
            "run.projection-tamper",
        );
        agentique_runner_start(request.clone()).expect("tamper projection run should start");
        let terminal = wait_for_run_state("run.projection-tamper", &["succeeded"]);
        let projection = terminal.product_projection.expect("committed projection");
        let projected_run = super::native_run_root()
            .expect("native root")
            .join(&projection.artifact_refs[0]);
        fs::write(projected_run, b"{\"tampered\":true}").expect("tamper projected artifact");

        reset_runner_records_for_tests();
        let recovered = agentique_runner_status(RunnerCommandRequest {
            command_id: Some("command.projection-tamper-status".to_string()),
            ..request
        })
        .expect("tampered projection should return safe recovery state");
        assert_eq!(recovered.state, "cleanup-required");
        assert!(recovered
            .product_projection
            .is_some_and(|receipt| receipt.recovery_classification == "corrupt"));
    }

    #[test]
    fn async_start_returns_before_completion_and_cancel_fences_late_success() {
        let _guard = test_lock().lock().expect("runner test lock");
        reset_runner_records_for_tests();
        let start_request = approved_start_request(
            "resource.async-cancel",
            "session.async-cancel",
            "run.async-cancel",
        );
        let started_at = Instant::now();
        let start = start_native_run(
            start_request.clone(),
            NativeAdapterTestMode::Sleep,
            Duration::from_secs(5),
        )
        .expect("async start should retain the sleeping adapter handle");
        assert_eq!(start.state, "running");
        assert!(start.execution.is_none());
        // IMPORTANT: durability fsync latency is materially higher on WSL-mounted volumes; keep
        // this bound well below the 5-second adapter workload so the test proves non-blocking start
        // without turning filesystem latency into a false lifecycle regression.
        assert!(started_at.elapsed() < Duration::from_secs(2));

        let status = agentique_runner_status(RunnerCommandRequest {
            command_id: Some("command.status-async-cancel".to_string()),
            approval_id: None,
            permission_grant_id: None,
            ..start_request.clone()
        })
        .expect("active coordinator status must not be treated as stale recovery");
        assert_eq!(status.state, "running");

        let cancel = agentique_runner_cancel(RunnerCommandRequest {
            command_id: Some("command.cancel-async-cancel".to_string()),
            approval_id: None,
            permission_grant_id: None,
            ..start_request.clone()
        })
        .expect("cancel should signal the retained adapter handle");
        assert_eq!(cancel.state, "canceling");
        let terminal = wait_for_run_state("run.async-cancel", &["canceled"]);
        assert_eq!(terminal.state.as_str(), "canceled");
        assert!(terminal.cleanup_recovery.is_some());
        let events = super::native_event_records()
            .lock()
            .expect("native event store lock")
            .get("run.async-cancel")
            .cloned()
            .expect("async cancel events");
        assert_eq!(
            events
                .iter()
                .filter(|event| event.phase == "terminal")
                .count(),
            1
        );
        assert!(events
            .iter()
            .any(|event| event.event_type == "run.canceled"));
        assert!(!events
            .iter()
            .any(|event| event.event_type == "run.succeeded"));
        assert!(!super::native_coordinator_records()
            .lock()
            .expect("native coordinator store lock")
            .contains_key("run.async-cancel"));
    }

    #[test]
    fn async_timeout_and_parallel_address_fencing_are_native_owned() {
        let _guard = test_lock().lock().expect("runner test lock");
        reset_runner_records_for_tests();
        let timeout_request = approved_start_request(
            "resource.async-timeout",
            "session.async-timeout",
            "run.async-timeout",
        );
        start_native_run(
            timeout_request,
            NativeAdapterTestMode::Sleep,
            Duration::from_millis(30),
        )
        .expect("timeout test start");
        let timed_out = wait_for_run_state("run.async-timeout", &["timed-out"]);
        assert_eq!(timed_out.state.as_str(), "timed-out");
        assert!(timed_out.cleanup_recovery.is_some());
        let timeout_events = super::native_event_records()
            .lock()
            .expect("native event store lock")
            .get("run.async-timeout")
            .cloned()
            .expect("timeout events");
        assert_eq!(
            timeout_events
                .iter()
                .filter(|event| event.phase == "terminal")
                .count(),
            1
        );
        assert!(timeout_events
            .iter()
            .any(|event| event.event_type == "run.timed-out"));

        let first =
            approved_start_request("resource.parallel", "session.parallel-a", "run.parallel-a");
        let second =
            approved_start_request("resource.parallel", "session.parallel-b", "run.parallel-b");
        start_native_run(
            first.clone(),
            NativeAdapterTestMode::Sleep,
            Duration::from_secs(5),
        )
        .expect("first distinct address should start");
        let duplicate = start_native_run(
            first.clone(),
            NativeAdapterTestMode::Sleep,
            Duration::from_secs(5),
        );
        assert!(duplicate
            .expect_err("duplicate exact address must be fenced")
            .contains("complete run address"));
        start_native_run(
            second.clone(),
            NativeAdapterTestMode::Sleep,
            Duration::from_secs(5),
        )
        .expect("distinct complete address should run in parallel");
        assert_eq!(
            super::native_coordinator_records()
                .lock()
                .expect("native coordinator store lock")
                .len(),
            2
        );
        for request in [first, second] {
            agentique_runner_cancel(RunnerCommandRequest {
                command_id: Some(format!("command.cancel-{}", request.run_id)),
                approval_id: None,
                permission_grant_id: None,
                ..request.clone()
            })
            .expect("parallel retained handle should cancel");
            wait_for_run_state(&request.run_id, &["canceled"]);
        }
        assert!(super::native_coordinator_records()
            .lock()
            .expect("native coordinator store lock")
            .is_empty());
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

        assert!(prepare.permission_grant.is_none());
        let approval_id = prepare.approval_id.clone();
        let decision = approve_pending_run(
            "resource.transition-01",
            "session.transition-01",
            "run.transition-01",
            approval_id.as_deref().expect("proposal id"),
        );
        let permission_grant_id = decision
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
        assert_eq!(start.state, "running");
        assert_eq!(
            start
                .adapter_manifest
                .as_ref()
                .map(|manifest| manifest.digest_prefix.as_str()),
            Some("cccccccccccc")
        );
        assert!(start.will_spawn_process);
        assert!(start.execution.is_none());
        assert_eq!(
            wait_for_run_state("run.transition-01", &["succeeded"])
                .state
                .as_str(),
            "succeeded"
        );
    }

    #[test]
    fn native_approval_requires_visible_explicit_decision_before_start() {
        let _guard = test_lock().lock().expect("runner test lock");
        reset_runner_records_for_tests();
        let prepare = agentique_runner_prepare(RunnerCommandRequest {
            resource_id: "resource.explicit-approval".to_string(),
            session_id: "session.explicit-approval".to_string(),
            run_id: "run.explicit-approval".to_string(),
            command_id: Some("command.prepare-explicit-approval".to_string()),
            adapter_id: Some("adapter.local-python".to_string()),
            approval_id: None,
            permission_profile_id: Some("permission.local-python.minimal".to_string()),
            permission_grant_id: None,
        })
        .expect("prepare pending proposal");
        assert!(prepare.permission_grant.is_none());
        let proposal_id = prepare.approval_id.clone().expect("proposal id");
        let proposal = agentique_runner_approval_proposal(RunnerCommandRequest {
            resource_id: "resource.explicit-approval".to_string(),
            session_id: "session.explicit-approval".to_string(),
            run_id: "run.explicit-approval".to_string(),
            command_id: Some("command.read-explicit-approval".to_string()),
            adapter_id: Some("adapter.local-python".to_string()),
            approval_id: Some(proposal_id.clone()),
            permission_profile_id: Some("permission.local-python.minimal".to_string()),
            permission_grant_id: None,
        })
        .expect("read visible proposal");
        assert_eq!(proposal.status, "pending");
        assert_eq!(proposal.policy_owner, "agentique-native-host");
        assert_eq!(proposal.presentation_owner, "agentique-ui");
        assert_eq!(proposal.action_id, "adapter.run");
        assert!(proposal.redacted);

        let legacy_echo = agentique_runner_start(RunnerCommandRequest {
            resource_id: "resource.explicit-approval".to_string(),
            session_id: "session.explicit-approval".to_string(),
            run_id: "run.explicit-approval".to_string(),
            command_id: Some("command.start-without-decision".to_string()),
            adapter_id: Some("adapter.local-python".to_string()),
            approval_id: Some(proposal_id.clone()),
            permission_profile_id: Some("permission.local-python.minimal".to_string()),
            permission_grant_id: Some("grant.legacy-echo".to_string()),
        });
        assert!(legacy_echo.is_err());

        let decision = approve_pending_run(
            "resource.explicit-approval",
            "session.explicit-approval",
            "run.explicit-approval",
            &proposal_id,
        );
        assert_eq!(decision.decision, "approved");
        assert!(decision.explicit_user_action);
        assert_eq!(decision.proposal_digest, proposal.proposal_digest);
        assert!(decision.permission_grant.is_some());
    }

    #[test]
    fn native_approval_denial_replay_mismatch_and_drift_fail_closed() {
        let _guard = test_lock().lock().expect("runner test lock");
        reset_runner_records_for_tests();
        let prepare = agentique_runner_prepare(RunnerCommandRequest {
            resource_id: "resource.approval-blocked".to_string(),
            session_id: "session.approval-blocked".to_string(),
            run_id: "run.approval-blocked".to_string(),
            command_id: Some("command.prepare-approval-blocked".to_string()),
            adapter_id: Some("adapter.local-python".to_string()),
            approval_id: None,
            permission_profile_id: Some("permission.local-python.minimal".to_string()),
            permission_grant_id: None,
        })
        .expect("prepare pending proposal");
        let proposal_id = prepare.approval_id.expect("proposal id");
        let proposal_digest = super::native_approval_proposal_records()
            .lock()
            .expect("proposal store")
            .get(&proposal_id)
            .expect("proposal")
            .proposal_digest
            .clone();

        let mismatch = agentique_runner_decide_approval(NativeApprovalDecisionRequest {
            resource_id: "resource.other".to_string(),
            session_id: "session.approval-blocked".to_string(),
            run_id: "run.approval-blocked".to_string(),
            proposal_id: proposal_id.clone(),
            proposal_digest: proposal_digest.clone(),
            decision: "approved".to_string(),
            actor_id: "actor.local-user".to_string(),
        });
        assert!(mismatch.is_err());

        let denied = agentique_runner_decide_approval(NativeApprovalDecisionRequest {
            resource_id: "resource.approval-blocked".to_string(),
            session_id: "session.approval-blocked".to_string(),
            run_id: "run.approval-blocked".to_string(),
            proposal_id: proposal_id.clone(),
            proposal_digest,
            decision: "denied".to_string(),
            actor_id: "actor.local-user".to_string(),
        })
        .expect("explicit denial");
        assert!(denied.permission_grant.is_none());
        let replay = agentique_runner_decide_approval(NativeApprovalDecisionRequest {
            resource_id: "resource.approval-blocked".to_string(),
            session_id: "session.approval-blocked".to_string(),
            run_id: "run.approval-blocked".to_string(),
            proposal_id: proposal_id.clone(),
            proposal_digest: denied.proposal_digest,
            decision: "approved".to_string(),
            actor_id: "actor.local-user".to_string(),
        });
        assert!(replay.is_err());

        reset_runner_records_for_tests();
        let drift_prepare = agentique_runner_prepare(RunnerCommandRequest {
            resource_id: "resource.approval-drift".to_string(),
            session_id: "session.approval-drift".to_string(),
            run_id: "run.approval-drift".to_string(),
            command_id: Some("command.prepare-approval-drift".to_string()),
            adapter_id: Some("adapter.local-python".to_string()),
            approval_id: None,
            permission_profile_id: Some("permission.local-python.minimal".to_string()),
            permission_grant_id: None,
        })
        .expect("prepare drift proposal");
        let drift_id = drift_prepare.approval_id.expect("drift proposal id");
        let drift_digest = {
            let mut proposals = super::native_approval_proposal_records()
                .lock()
                .expect("proposal store");
            let proposal = proposals.get_mut(&drift_id).expect("proposal");
            let digest = proposal.proposal_digest.clone();
            proposal.risk = "high".to_string();
            digest
        };
        let drift = agentique_runner_decide_approval(NativeApprovalDecisionRequest {
            resource_id: "resource.approval-drift".to_string(),
            session_id: "session.approval-drift".to_string(),
            run_id: "run.approval-drift".to_string(),
            proposal_id: drift_id,
            proposal_digest: drift_digest,
            decision: "approved".to_string(),
            actor_id: "actor.local-user".to_string(),
        });
        assert!(drift.is_err());
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
        .expect("prepare should create a pending native proposal");
        assert!(prepare.permission_grant.is_none());
        let decision = approve_pending_run(
            "resource.permission-01",
            "session.permission-01",
            "run.permission-01",
            prepare.approval_id.as_deref().expect("proposal id"),
        );
        let grant_id = decision
            .permission_grant
            .as_ref()
            .expect("explicit approval should include permission grant")
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
        assert_eq!(accepted.state, "running");
        assert_eq!(
            accepted
                .permission_grant
                .as_ref()
                .map(|grant| grant.status.as_str()),
            Some("consumed")
        );
        wait_for_run_state("run.permission-01", &["succeeded"]);

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
        .expect("prepare should create a pending proposal");
        let revoked_decision = approve_pending_run(
            "resource.permission-revoked",
            "session.permission-revoked",
            "run.permission-revoked",
            revoked_prepare.approval_id.as_deref().expect("proposal id"),
        );
        let revoked_grant_id = revoked_decision
            .permission_grant
            .as_ref()
            .expect("approved permission grant should exist")
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
        .expect("prepare should create a pending proposal");
        let expired_decision = approve_pending_run(
            "resource.permission-expired",
            "session.permission-expired",
            "run.permission-expired",
            expired_prepare.approval_id.as_deref().expect("proposal id"),
        );
        let expired_grant_id = expired_decision
            .permission_grant
            .as_ref()
            .expect("approved permission grant should exist")
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
    fn permission_revocation_before_start_is_native_owned_and_monotonic() {
        let _guard = test_lock().lock().expect("runner test lock");
        reset_runner_records_for_tests();
        let start_request = approved_start_request(
            "resource.permission-revoke-before-start",
            "session.permission-revoke-before-start",
            "run.permission-revoke-before-start",
        );
        let grant_id = start_request
            .permission_grant_id
            .clone()
            .expect("approved request owns a permission grant");
        let revoke = agentique_runner_revoke_permission(RunnerCommandRequest {
            command_id: Some("command.revoke-before-start".to_string()),
            approval_id: None,
            ..start_request.clone()
        })
        .expect("exact pending grant should be revocable");
        assert_eq!(revoke.state, "permission-revoked");
        assert_eq!(
            revoke
                .permission_grant
                .as_ref()
                .map(|receipt| receipt.status.as_str()),
            Some("revoked")
        );
        assert!(agentique_runner_start(start_request).is_err());
        assert!(!super::native_coordinator_records()
            .lock()
            .expect("native coordinator store lock")
            .contains_key("run.permission-revoke-before-start"));
        let events = super::native_event_records()
            .lock()
            .expect("native event store lock")
            .get("run.permission-revoke-before-start")
            .cloned()
            .expect("revocation event evidence");
        assert!(events.iter().any(|event| {
            event.event_type == "permission.revoked"
                && event.details.permission_grant_id.as_deref() == Some(grant_id.as_str())
                && event.details.permission_status.as_deref() == Some("revoked")
        }));
    }

    #[test]
    fn permission_revocation_during_run_stops_only_the_exact_handle() {
        let _guard = test_lock().lock().expect("runner test lock");
        reset_runner_records_for_tests();
        let start_request = approved_start_request(
            "resource.permission-live-revoke",
            "session.permission-live-revoke",
            "run.permission-live-revoke",
        );
        start_native_run(
            start_request.clone(),
            NativeAdapterTestMode::Sleep,
            Duration::from_secs(5),
        )
        .expect("sleeping adapter should start");

        let cross_address = agentique_runner_revoke_permission(RunnerCommandRequest {
            resource_id: "resource.permission-other".to_string(),
            command_id: Some("command.revoke-cross-address".to_string()),
            approval_id: None,
            ..start_request.clone()
        });
        assert!(cross_address.is_err());
        assert_eq!(
            runner_records()
                .lock()
                .expect("runner record store lock")
                .get("run.permission-live-revoke")
                .expect("active run")
                .state,
            NativeRunState::Running
        );

        let revoked = agentique_runner_revoke_permission(RunnerCommandRequest {
            command_id: Some("command.revoke-live-run".to_string()),
            approval_id: None,
            ..start_request
        })
        .expect("live grant revocation should signal the exact retained handle");
        assert_eq!(revoked.state, "canceling");
        assert_eq!(
            revoked
                .permission_grant
                .as_ref()
                .map(|receipt| receipt.status.as_str()),
            Some("revoked")
        );
        let terminal = wait_for_run_state("run.permission-live-revoke", &["canceled"]);
        assert_eq!(terminal.state, NativeRunState::Canceled);
        let events = super::native_event_records()
            .lock()
            .expect("native event store lock")
            .get("run.permission-live-revoke")
            .cloned()
            .expect("live revocation events");
        assert!(events
            .iter()
            .any(|event| event.event_type == "permission.revoked"));
        assert_eq!(
            events
                .iter()
                .filter(|event| event.phase == "terminal")
                .count(),
            1
        );
        assert!(events
            .iter()
            .any(|event| event.event_type == "run.canceled"));
        assert!(!events
            .iter()
            .any(|event| event.event_type == "run.succeeded"));
        let revoked_sequence = events
            .iter()
            .find(|event| event.event_type == "permission.revoked")
            .expect("permission revocation event")
            .sequence;
        let terminal_sequence = events
            .iter()
            .find(|event| event.event_type == "run.canceled")
            .expect("canceled terminal event")
            .sequence;
        assert!(revoked_sequence < terminal_sequence);
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
        let decision = approve_pending_run(
            "resource.native-python-01",
            "session.native-python-01",
            "run.native-python-01",
            prepare.approval_id.as_deref().expect("proposal id"),
        );

        let start = agentique_runner_start(RunnerCommandRequest {
            resource_id: "resource.native-python-01".to_string(),
            session_id: "session.native-python-01".to_string(),
            run_id: "run.native-python-01".to_string(),
            command_id: Some("command.start-native-python".to_string()),
            adapter_id: Some("adapter.local-python".to_string()),
            approval_id: prepare.approval_id,
            permission_profile_id: Some("permission.local-python.minimal".to_string()),
            permission_grant_id: decision
                .permission_grant
                .as_ref()
                .map(|grant| grant.grant_id.clone()),
        })
        .expect("start should launch the fixed native Python adapter");

        assert_eq!(start.state, "running");
        assert!(start.will_spawn_process);
        assert!(start.execution.is_none());
        let execution = wait_for_run_state("run.native-python-01", &["succeeded"])
            .execution
            .expect("terminal run record should include execution evidence");
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
        let native_root = super::native_run_root().expect("native root");
        for exact_fixture in [
            native_root.join("runs").join("run.native-artifacts-01"),
            native_root
                .join("working-sets")
                .join("run.native-artifacts-01"),
            native_root
                .join("projections")
                .join("run.native-artifacts-01"),
        ] {
            if exact_fixture.exists() {
                fs::remove_dir_all(&exact_fixture).expect("clear exact artifact fixture");
            }
        }
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
        let decision = approve_pending_run(
            "resource.native-artifacts-01",
            "session.native-artifacts-01",
            "run.native-artifacts-01",
            prepare.approval_id.as_deref().expect("proposal id"),
        );

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
            permission_grant_id: decision
                .permission_grant
                .as_ref()
                .map(|grant| grant.grant_id.clone()),
        })
        .expect("start should materialize the native run folder");
        wait_for_run_state("run.native-artifacts-01", &["succeeded"]);

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
    fn native_run_folder_atomic_commit_integrity_and_tamper_rejection() {
        let _guard = test_lock().lock().expect("runner test lock");
        let run_id = "run.atomic-integrity-01";
        let runs_root = super::native_run_root().expect("native root").join("runs");
        let final_dir = runs_root.join(run_id);
        if final_dir.exists() {
            fs::remove_dir_all(&final_dir).expect("clear exact atomic fixture");
        }
        let failure = super::native_failure("none", "", "");

        let fault = super::write_native_run_folder_with_fault(
            run_id,
            super::RUNNER_NATIVE_SUCCEEDED_STATE,
            "safe stdout",
            "",
            None,
            &failure,
            super::NativeRunFolderFault::BeforeCommit,
        );
        assert!(fault.is_err());
        assert!(!final_dir.exists());
        let staging_prefix = format!(".staging-{run_id}-");
        let remnants = fs::read_dir(&runs_root)
            .expect("read native runs root")
            .filter_map(Result::ok)
            .filter(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with(&staging_prefix)
            })
            .count();
        assert_eq!(remnants, 0);

        super::write_native_run_folder(
            run_id,
            super::RUNNER_NATIVE_SUCCEEDED_STATE,
            "safe stdout",
            "",
            None,
            &failure,
        )
        .expect("atomic native run folder should commit");
        let receipt: serde_json::Value = serde_json::from_str(
            &fs::read_to_string(final_dir.join("write-receipt.json"))
                .expect("read committed write receipt"),
        )
        .expect("parse committed write receipt");
        assert_eq!(
            receipt
                .get("schemaVersion")
                .and_then(|value| value.as_str()),
            Some("agentique.nativeRunFolderWriteReceipt.v2")
        );
        assert_eq!(
            receipt
                .get("digestAlgorithm")
                .and_then(|value| value.as_str()),
            Some("sha256")
        );
        assert!(receipt
            .get("entries")
            .and_then(|value| value.as_array())
            .is_some_and(|entries| !entries.is_empty()));

        let request = RunnerCommandRequest {
            resource_id: "resource.atomic-integrity-01".to_string(),
            session_id: "session.atomic-integrity-01".to_string(),
            run_id: run_id.to_string(),
            command_id: Some("command.atomic-integrity-01".to_string()),
            adapter_id: Some(super::APPROVED_ADAPTER_ID.to_string()),
            approval_id: None,
            permission_profile_id: Some(super::APPROVED_PERMISSION_PROFILE_ID.to_string()),
            permission_grant_id: None,
        };
        super::read_native_run_artifact_evidence(&request, super::RUNNER_NATIVE_SUCCEEDED_STATE)
            .expect("untampered committed run folder should validate");
        fs::write(final_dir.join("logs").join("stdout.log"), "tampered")
            .expect("tamper exact run fixture");
        assert!(super::read_native_run_artifact_evidence(
            &request,
            super::RUNNER_NATIVE_SUCCEEDED_STATE
        )
        .expect_err("tampered native evidence must fail closed")
        .contains("integrity"));
    }

    #[test]
    fn native_run_folder_redacts_plaintext_unsafe_material_before_publication() {
        let _guard = test_lock().lock().expect("runner test lock");
        let run_id = "run.atomic-unsafe-01";
        let final_dir = super::native_run_root()
            .expect("native root")
            .join("runs")
            .join(run_id);
        if final_dir.exists() {
            fs::remove_dir_all(&final_dir).expect("clear exact unsafe fixture");
        }
        let unsafe_marker = [".", "planning/private.md"].concat();
        let failure = super::native_failure("failed", "unsafe", &unsafe_marker);
        super::write_native_run_folder(
            run_id,
            super::RUNNER_NATIVE_FAILED_STATE,
            "safe stdout",
            "",
            None,
            &failure,
        )
        .expect("redacted failure evidence should commit safely");
        let persisted = fs::read_to_string(final_dir.join("failure.json"))
            .expect("read redacted failure evidence");
        assert!(!persisted.contains(&unsafe_marker));
        assert!(persisted.contains("redacted:internal-reference"));
        fs::remove_dir_all(&final_dir).expect("clear redacted fixture");
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
        let decision = approve_pending_run(
            "resource.native-event-01",
            "session.native-event-01",
            "run.native-event-01",
            prepare.approval_id.as_deref().expect("proposal id"),
        );

        let start = agentique_runner_start(RunnerCommandRequest {
            resource_id: "resource.native-event-01".to_string(),
            session_id: "session.native-event-01".to_string(),
            run_id: "run.native-event-01".to_string(),
            command_id: Some("command.start-native-event".to_string()),
            adapter_id: Some("adapter.local-python".to_string()),
            approval_id: prepare.approval_id.clone(),
            permission_profile_id: Some("permission.local-python.minimal".to_string()),
            permission_grant_id: decision
                .permission_grant
                .as_ref()
                .map(|grant| grant.grant_id.clone()),
        })
        .expect("start should record fixed native execution events");
        assert_eq!(start.state, "running");
        let start_replay = start
            .event_replay
            .expect("start receipt should include native event replay");
        assert!(!start_replay
            .events
            .iter()
            .any(|event| event.phase == "terminal"));
        wait_for_run_state("run.native-event-01", &["succeeded"]);
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
        .expect("status should replay terminal native events");
        let replay = status
            .event_replay
            .expect("terminal status should include native event replay");
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
    fn durable_event_replay_restores_the_complete_prefix_after_process_state_loss() {
        let _guard = test_lock().lock().expect("runner test lock");
        reset_runner_records_for_tests();
        let resource_id = "resource.durable-event-restart";
        let session_id = "session.durable-event-restart";
        let run_id = "run.durable-event-restart";
        let projection_dir = super::native_projection_run_dir(run_id)
            .expect("durable event projection test directory");
        if projection_dir.exists() {
            fs::remove_dir_all(&projection_dir).expect("clear durable event projection fixture");
        }
        let start_request = approved_start_request(resource_id, session_id, run_id);
        start_native_run(
            start_request.clone(),
            NativeAdapterTestMode::Success,
            Duration::from_secs(5),
        )
        .expect("durable event run should start");
        wait_for_run_state(run_id, &["succeeded"]);
        let before = super::event_replay_for(&start_request)
            .expect("terminal event prefix should exist before process-state loss");
        let before_ids = before
            .events
            .iter()
            .map(|event| event.id.clone())
            .collect::<Vec<_>>();
        assert!(before
            .events
            .iter()
            .any(|event| event.event_type == "run.succeeded"));

        super::runner_records()
            .lock()
            .expect("runner record store lock")
            .clear();
        super::native_event_records()
            .lock()
            .expect("native event store lock")
            .clear();

        let recovered = agentique_runner_status(RunnerCommandRequest {
            command_id: Some("command.durable-event-restart-status".to_string()),
            approval_id: None,
            permission_grant_id: None,
            ..start_request
        })
        .expect("status should restore durable terminal events without replaying execution");
        assert_eq!(recovered.state, "succeeded");
        let replay = recovered
            .event_replay
            .expect("recovered status should expose durable event replay");
        assert_eq!(
            replay
                .events
                .iter()
                .take(before_ids.len())
                .map(|event| event.id.clone())
                .collect::<Vec<_>>(),
            before_ids
        );
        assert_eq!(replay.events.len(), before_ids.len() + 1);
        assert_eq!(
            replay.events.last().map(|event| event.event_type.as_str()),
            Some("replay.status")
        );
        assert!(replay
            .events
            .iter()
            .enumerate()
            .all(|(index, event)| event.sequence == index + 1));
    }

    #[test]
    fn durable_event_replay_rejects_corrupt_sequence_evidence() {
        let _guard = test_lock().lock().expect("runner test lock");
        reset_runner_records_for_tests();
        let request = RunnerCommandRequest {
            resource_id: "resource.durable-event-corrupt".to_string(),
            session_id: "session.durable-event-corrupt".to_string(),
            run_id: "run.durable-event-corrupt".to_string(),
            command_id: Some("command.durable-event-corrupt".to_string()),
            adapter_id: Some("adapter.local-python".to_string()),
            approval_id: None,
            permission_profile_id: Some("permission.local-python.minimal".to_string()),
            permission_grant_id: None,
        };
        agentique_runner_prepare(request.clone()).expect("prepare should persist durable events");
        let event_path = super::native_event_ledger_dir(&request.run_id)
            .expect("durable event ledger directory")
            .join("0001.json");
        let original = fs::read(&event_path).expect("read original durable event fixture");
        fs::write(&event_path, b"{\"schemaVersion\":\"unsupported\"}")
            .expect("corrupt the exact durable event fixture");
        super::native_event_records()
            .lock()
            .expect("native event store lock")
            .clear();

        let error = super::event_replay_for(&request)
            .expect_err("corrupt durable event evidence must fail closed");
        assert!(error.contains("durable native event"));

        fs::write(&event_path, &original).expect("restore the durable event fixture");
        let mut cross_address: serde_json::Value =
            serde_json::from_slice(&original).expect("parse durable event fixture");
        cross_address["resourceId"] = serde_json::json!("resource.other");
        fs::write(
            &event_path,
            serde_json::to_vec(&cross_address).expect("serialize cross-address fixture"),
        )
        .expect("write cross-address durable event fixture");
        super::native_event_records()
            .lock()
            .expect("native event store lock")
            .clear();
        assert!(super::event_replay_for(&request)
            .expect_err("cross-address durable event evidence must fail closed")
            .contains("address or boundary"));

        fs::write(&event_path, &original).expect("restore the durable event fixture");
        fs::write(&event_path, vec![b'x'; 8_193]).expect("write oversized event fixture");
        super::native_event_records()
            .lock()
            .expect("native event store lock")
            .clear();
        assert!(super::event_replay_for(&request)
            .expect_err("oversized durable event evidence must fail closed")
            .contains("bounded regular file"));

        fs::write(&event_path, &original).expect("restore the durable event fixture");
        let second_path = event_path.with_file_name("0002.json");
        let gap_path = event_path.with_file_name("0004.json");
        fs::rename(&second_path, &gap_path).expect("create durable event sequence gap");
        super::native_event_records()
            .lock()
            .expect("native event store lock")
            .clear();
        assert!(super::event_replay_for(&request)
            .expect_err("gapped durable event evidence must fail closed")
            .contains("partial or unexpected"));
        fs::rename(gap_path, second_path).expect("restore contiguous durable event fixture");

        super::native_event_records()
            .lock()
            .expect("native event store lock")
            .clear();
        assert_eq!(
            super::event_replay_for(&request)
                .expect("restored durable event fixture should replay")
                .events
                .len(),
            3
        );
    }

    #[test]
    fn native_python_execution_reports_invalid_stdout_nonzero_exit_and_redacted_logs() {
        let _guard = test_lock().lock().expect("runner test lock");
        reset_runner_records_for_tests();
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
    fn completion_error_commits_failed_terminal_without_fabricated_execution() {
        let _guard = test_lock().lock().expect("runner test lock");
        reset_runner_records_for_tests();
        let request = RunnerCommandRequest {
            resource_id: "resource.native-completion-error".to_string(),
            session_id: "session.native-completion-error".to_string(),
            run_id: "run.native-completion-error".to_string(),
            command_id: Some("command.native-completion-error".to_string()),
            adapter_id: Some("adapter.local-python".to_string()),
            approval_id: None,
            permission_profile_id: Some("permission.local-python.minimal".to_string()),
            permission_grant_id: None,
        };
        create_stale_native_run_for_tests(
            &request.resource_id,
            &request.session_id,
            &request.run_id,
        );
        let terminal_intent = Arc::new(Mutex::new(None));

        let committed = settle_native_adapter_completion(
            &request,
            "adapter.local-python",
            &terminal_intent,
            Err("injected run-folder materialization failure".to_string()),
            NativeProcessCleanupObservation::verified_zero("test-no-process"),
        )
        .expect("completion error should settle through the failed terminal path");

        assert!(committed);
        let record = runner_records()
            .lock()
            .expect("runner record store lock")
            .get(&request.run_id)
            .cloned()
            .expect("native run record");
        assert_eq!(record.state, NativeRunState::Failed);
        assert!(record.execution.is_none());
        assert_eq!(
            terminal_intent
                .lock()
                .expect("terminal intent lock")
                .as_ref(),
            Some(&NativeRunState::Failed)
        );
        assert_eq!(
            record
                .product_projection
                .as_ref()
                .expect("failed completion should still commit durable evidence")
                .state,
            "failed"
        );
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
        let receipt_json =
            serde_json::to_value(&receipt).expect("manifest receipt should serialize");
        assert_eq!(
            receipt_json["permissionProfileId"],
            "permission.local-python.minimal"
        );
        assert_eq!(
            receipt_json["permissionCeiling"],
            serde_json::json!([
                "files:workspace-runs",
                "subprocess:fixed-adapter-only",
                "artifact-retention:7d"
            ])
        );
        assert_eq!(receipt_json["timeoutSeconds"], 30);
        assert_eq!(
            receipt_json["cleanupPolicy"],
            "native-process-tree-required"
        );
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
            (
                "wrong-permission-profile",
                NativeAdapterManifest {
                    permission_profile_id: "permission.local-python.broad".to_string(),
                    ..base.clone()
                },
            ),
            (
                "broad-permission-ceiling",
                NativeAdapterManifest {
                    permission_ceiling: vec!["shell:any".to_string()],
                    ..base.clone()
                },
            ),
            (
                "timeout-mismatch",
                NativeAdapterManifest {
                    timeout_seconds: 300,
                    ..base.clone()
                },
            ),
            (
                "cleanup-mismatch",
                NativeAdapterManifest {
                    cleanup_policy: "best-effort".to_string(),
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
        let decision = approve_pending_run(
            "resource.blocked-01",
            "session.blocked-01",
            "run.blocked-01",
            prepare.approval_id.as_deref().expect("proposal id"),
        );
        let permission_grant_id = decision
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
        assert_eq!(accepted.state, "running");
        wait_for_run_state("run.blocked-01", &["succeeded"]);

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

    #[cfg(any(target_os = "windows", unix))]
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
            permission_grant_id: None,
        })
        .expect("cancel should transition the fixed native lane");
        assert_eq!(cancel.state, "canceled");
        let cancel_cleanup = cancel
            .cleanup_recovery
            .expect("cancel should include cleanup recovery evidence");
        assert_eq!(
            cancel_cleanup.schema_version,
            "agentique.nativeRunnerCleanupRecovery.v2"
        );
        assert_eq!(cancel_cleanup.native_backed, true);
        assert_eq!(cancel_cleanup.descriptor_only, false);
        assert_eq!(cancel_cleanup.process_tree_cleanup, true);
        assert_eq!(cancel_cleanup.orphan_count, Some(0));
        assert_eq!(cancel_cleanup.cleanup_required, false);
        assert!(cancel
            .event_replay
            .as_ref()
            .expect("cancel should include event replay")
            .events
            .iter()
            .any(|event| event.event_type == "cleanup.completed"));

        let cancel_request = approved_start_request(
            "resource.tree-cancel",
            "session.tree-cancel",
            "run.tree-cancel",
        );
        start_native_run(
            cancel_request.clone(),
            NativeAdapterTestMode::DescendantSleep,
            Duration::from_secs(5),
        )
        .expect("descendant cancel run should start");
        #[cfg(target_os = "windows")]
        assert!(wait_for_process_tree_count("run.tree-cancel", 2) >= 2);
        #[cfg(unix)]
        wait_for_unix_process_tree_active("run.tree-cancel");
        let canceling = agentique_runner_cancel(RunnerCommandRequest {
            command_id: Some("command.tree-cancel".to_string()),
            ..cancel_request
        })
        .expect("real descendant cancel should signal the native coordinator");
        assert_eq!(canceling.state, "canceling");
        let canceled = wait_for_run_state("run.tree-cancel", &["canceled"]);
        let live_cancel_cleanup = canceled
            .cleanup_recovery
            .expect("live cancel should include process-tree cleanup evidence");
        assert!(live_cancel_cleanup.process_tree_cleanup);
        assert_eq!(live_cancel_cleanup.orphan_count, Some(0));
        assert!(!live_cancel_cleanup.cleanup_required);

        let timeout_request = approved_start_request(
            "resource.tree-timeout",
            "session.tree-timeout",
            "run.tree-timeout",
        );
        start_native_run(
            timeout_request,
            NativeAdapterTestMode::DescendantSleep,
            Duration::from_secs(1),
        )
        .expect("descendant timeout run should start");
        #[cfg(target_os = "windows")]
        assert!(wait_for_process_tree_count("run.tree-timeout", 2) >= 2);
        #[cfg(unix)]
        wait_for_unix_process_tree_active("run.tree-timeout");
        let timed_out = wait_for_run_state("run.tree-timeout", &["timed-out"]);
        let timeout_cleanup = timed_out
            .cleanup_recovery
            .expect("timeout should include process-tree cleanup evidence");
        assert_eq!(timeout_cleanup.transition, "timeout-cleanup");
        assert_eq!(timeout_cleanup.orphan_count, Some(0));
        assert!(timeout_cleanup.process_tree_cleanup);

        let natural = execute_fixed_python_adapter_for_tests(
            "run.tree-natural",
            NativeAdapterTestMode::DescendantExit,
        )
        .expect("natural parent exit should drain its remaining descendant");
        assert!(natural.launched);
        assert_eq!(natural.status, "succeeded");

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
        let recovered_cleanup = recovered_status
            .cleanup_recovery
            .as_ref()
            .expect("restart cleanup-required evidence");
        assert!(!recovered_cleanup.process_tree_cleanup);
        assert_eq!(recovered_cleanup.orphan_count, None);
        assert!(recovered_cleanup.cleanup_required);
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
        .expect("cleanup without a durable supervisor should remain fail closed");
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
        assert_eq!(cleanup_once.state, "cleanup-required");
        assert_eq!(cleanup_again.state, "cleanup-required");
        assert_eq!(first.status, "cleanup-required");
        assert_eq!(first.orphan_count, None);
        assert!(!first.process_tree_cleanup);
        assert!(first.cleanup_required);
        assert_eq!(first.idempotent, true);
        assert_eq!(second.status, first.status);
        assert_eq!(second.receipt_refs, first.receipt_refs);
        assert!(!cleanup_again
            .event_replay
            .as_ref()
            .expect("cleanup retry replay")
            .events
            .iter()
            .any(|event| event.event_type == "cleanup.completed"));
        let serialized =
            serde_json::to_string(&second).expect("cleanup recovery receipt should serialize");
        assert!(!serialized.contains(":\\"));
        assert!(!serialized.contains("/Users/"));
        assert!(!serialized.contains("/home/"));
        assert!(!serialized.contains("bearer "));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn native_container_windows_path_fails_closed_before_create() {
        let _guard = test_lock().lock().expect("runner test lock");
        reset_runner_records_for_tests();
        let manifest = super::fixed_container_adapter_manifest();
        let reviewed = super::review_adapter_manifest(&manifest).expect("fixed container manifest");
        assert_eq!(
            reviewed.adapter_id,
            super::native_rootless_container::ADAPTER_ID
        );
        assert_eq!(reviewed.runtime, "container");
        assert_eq!(reviewed.support_mode, "optional-linux-rootless");
        assert_eq!(
            reviewed.permission_ceiling,
            vec!["subprocess:fixed-adapter-only", "artifact-retention:7d"]
        );

        let request = approved_start_request_for(
            "resource.native-container-unavailable",
            "session.native-container-unavailable",
            "run.native-container-unavailable",
            super::native_rootless_container::ADAPTER_ID,
            super::native_rootless_container::PERMISSION_PROFILE_ID,
        );
        let started = super::start_native_run(
            request.clone(),
            NativeAdapterTestMode::Success,
            Duration::from_secs(5),
        )
        .expect("fixed container lifecycle should start its no-effect preflight");
        assert_eq!(started.state, "running");
        assert!(!started.will_spawn_process);

        let terminal = wait_for_run_state(&request.run_id, &["failed"]);
        let execution = terminal.execution.expect("container failure evidence");
        assert!(!execution.launched);
        assert!(!execution.health.ready);
        assert_eq!(execution.health.adapter_runtime, "container");
        assert_eq!(
            execution.run_folder.root_ref,
            "native-rootless-container-runner"
        );
        assert_eq!(
            execution.failure.code.as_deref(),
            Some("native-container.platform")
        );
        let cleanup = terminal
            .cleanup_recovery
            .expect("no-effect cleanup evidence");
        assert!(cleanup.process_tree_cleanup);
        assert_eq!(cleanup.orphan_count, Some(0));
        assert!(cleanup
            .notes
            .contains(&"rootless-container-blocked-before-create".to_string()));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn native_wasm_exact_lane_executes_and_projects_bounded_evidence() {
        let _guard = test_lock().lock().expect("runner test lock");
        reset_runner_records_for_tests();
        let manifest = super::fixed_wasm_adapter_manifest();
        let reviewed = super::review_adapter_manifest(&manifest).expect("fixed WASM manifest");
        assert_eq!(reviewed.adapter_id, super::native_wasm_sandbox::ADAPTER_ID);
        assert_eq!(reviewed.runtime, "wasm");
        assert_eq!(reviewed.permission_ceiling, vec!["artifact-retention:7d"]);
        assert_eq!(reviewed.cleanup_policy, "in-process-zero-handles-required");

        let request = approved_start_request_for(
            "resource.native-wasm-success",
            "session.native-wasm-success",
            "run.native-wasm-success",
            super::native_wasm_sandbox::ADAPTER_ID,
            super::native_wasm_sandbox::PERMISSION_PROFILE_ID,
        );
        let started = super::start_native_run(
            request.clone(),
            NativeAdapterTestMode::Success,
            Duration::from_secs(5),
        )
        .expect("fixed WASM run should start");
        assert_eq!(started.state, "running");
        assert!(!started.will_spawn_process);

        let terminal = wait_for_run_state(&request.run_id, &["succeeded"]);
        let execution = terminal.execution.expect("WASM execution evidence");
        assert!(execution.launched);
        assert!(execution.health.ready);
        assert_eq!(execution.health.adapter_runtime, "wasm");
        assert!(execution.environment.adapter_env_keys.is_empty());
        assert!(execution.environment.forwarded_ambient.is_empty());
        assert_eq!(execution.run_folder.root_ref, "native-wasm-runner");
        assert!(execution
            .stdout_preview
            .contains(super::native_wasm_sandbox::MODULE_DIGEST));
        let cleanup = terminal.cleanup_recovery.expect("WASM cleanup evidence");
        assert!(cleanup.process_tree_cleanup);
        assert_eq!(cleanup.orphan_count, Some(0));
        assert!(cleanup
            .notes
            .contains(&"in-process-wasm-zero-handles".to_string()));
        assert!(terminal
            .product_projection
            .expect("WASM product projection")
            .artifact_refs
            .iter()
            .any(|item| item.ends_with("/outputs/wasm-result.json")));

        let evidence = super::read_native_run_artifact_evidence(
            &request,
            super::RUNNER_NATIVE_SUCCEEDED_STATE,
        )
        .expect("fixed WASM evidence should read back");
        assert_eq!(evidence.root_ref, "native-wasm-runner");
        assert!(evidence
            .outputs
            .iter()
            .any(|output| output.path.ends_with("/outputs/wasm-result.json")));
        assert!(evidence
            .artifacts
            .iter()
            .any(|artifact| artifact.path.ends_with("/artifacts/wasm-result.json")));
    }

    #[cfg(any(target_os = "windows", unix))]
    #[test]
    fn native_node_success_failure_and_evidence_parity() {
        let _guard = test_lock().lock().expect("runner test lock");
        reset_runner_records_for_tests();
        let manifest = super::fixed_node_adapter_manifest();
        let reviewed = super::review_adapter_manifest(&manifest).expect("fixed Node manifest");
        assert_eq!(reviewed.adapter_id, super::NODE_ADAPTER_ID);
        assert_eq!(reviewed.runtime, "node");
        assert_eq!(
            reviewed.permission_profile_id,
            super::NODE_ADAPTER_PERMISSION_PROFILE_ID
        );

        let request = approved_start_request_for(
            "resource.native-node-success",
            "session.native-node-success",
            "run.native-node-success",
            super::NODE_ADAPTER_ID,
            super::NODE_ADAPTER_PERMISSION_PROFILE_ID,
        );
        let started = super::start_native_run(
            request.clone(),
            NativeAdapterTestMode::Success,
            Duration::from_secs(5),
        )
        .expect("fixed Node run should start");
        assert_eq!(started.state, "running");
        let completed = wait_for_run_state(&request.run_id, &["succeeded"]);
        let execution = completed.execution.expect("Node execution receipt");
        assert_eq!(
            execution.schema_version,
            "agentique.nativeAdapterExecutionReceipt.v1"
        );
        assert_eq!(execution.health.adapter_runtime, "node");
        assert!(execution.health.ready);
        assert!(execution.environment.forwarded_ambient.is_empty());
        assert_eq!(execution.run_folder.root_ref, "native-node-runner");

        let evidence = super::read_native_run_artifact_evidence(
            &request,
            super::RUNNER_NATIVE_SUCCEEDED_STATE,
        )
        .expect("fixed Node evidence should read back");
        assert_eq!(evidence.root_ref, "native-node-runner");
        assert!(evidence
            .outputs
            .iter()
            .any(|output| output.path.ends_with("/outputs/node-result.json")));
        assert!(evidence
            .artifacts
            .iter()
            .any(|artifact| artifact.path.ends_with("/artifacts/node-result.json")));

        for (suffix, mode) in [
            ("invalid", NativeAdapterTestMode::InvalidJson),
            ("exit", NativeAdapterTestMode::ExitFailure),
            ("secret", NativeAdapterTestMode::Secret),
        ] {
            let run_id = format!("run.native-node-{suffix}");
            let request = approved_start_request_for(
                &format!("resource.native-node-{suffix}"),
                &format!("session.native-node-{suffix}"),
                &run_id,
                super::NODE_ADAPTER_ID,
                super::NODE_ADAPTER_PERMISSION_PROFILE_ID,
            );
            super::start_native_run(request, mode, Duration::from_secs(5))
                .expect("fixed Node outcome should start");
            let expected = if suffix == "secret" {
                "succeeded"
            } else {
                "failed"
            };
            let record = wait_for_run_state(&run_id, &[expected]);
            let receipt = record.execution.expect("fixed Node terminal receipt");
            assert_eq!(receipt.health.adapter_runtime, "node");
            assert!(!receipt.stderr_preview.contains("abcdefghijklmnop"));
        }
    }

    #[cfg(any(target_os = "windows", unix))]
    #[test]
    fn native_node_cancel_timeout_descendant_cleanup_and_missing_runtime() {
        let _guard = test_lock().lock().expect("runner test lock");
        reset_runner_records_for_tests();
        let cancel_request = approved_start_request_for(
            "resource.native-node-cancel",
            "session.native-node-cancel",
            "run.native-node-cancel",
            super::NODE_ADAPTER_ID,
            super::NODE_ADAPTER_PERMISSION_PROFILE_ID,
        );
        super::start_native_run(
            cancel_request.clone(),
            NativeAdapterTestMode::DescendantSleep,
            Duration::from_secs(5),
        )
        .expect("fixed Node descendant run should start");
        #[cfg(target_os = "windows")]
        assert!(wait_for_process_tree_count(&cancel_request.run_id, 2) >= 2);
        #[cfg(unix)]
        wait_for_unix_process_tree_active(&cancel_request.run_id);
        let cancel = agentique_runner_cancel(RunnerCommandRequest {
            command_id: Some("command.native-node-cancel".to_string()),
            ..cancel_request.clone()
        })
        .expect("fixed Node run should accept cancel");
        assert_eq!(cancel.state, "canceling");
        let canceled = wait_for_run_state(&cancel_request.run_id, &["canceled"]);
        let cleanup = canceled
            .cleanup_recovery
            .expect("Node cancel cleanup evidence");
        assert!(cleanup.process_tree_cleanup);
        assert_eq!(cleanup.orphan_count, Some(0));

        let timeout_request = approved_start_request_for(
            "resource.native-node-timeout",
            "session.native-node-timeout",
            "run.native-node-timeout",
            super::NODE_ADAPTER_ID,
            super::NODE_ADAPTER_PERMISSION_PROFILE_ID,
        );
        super::start_native_run(
            timeout_request.clone(),
            NativeAdapterTestMode::DescendantSleep,
            Duration::from_secs(1),
        )
        .expect("fixed Node timeout run should start");
        let timed_out = wait_for_run_state(&timeout_request.run_id, &["timed-out"]);
        let cleanup = timed_out
            .cleanup_recovery
            .expect("Node timeout cleanup evidence");
        assert!(cleanup.process_tree_cleanup);
        assert_eq!(cleanup.orphan_count, Some(0));

        let natural = super::execute_fixed_native_adapter(
            &super::fixed_node_adapter_manifest(),
            "run.native-node-natural",
            "resource.native-node-natural",
            NativeAdapterTestMode::DescendantExit,
        )
        .expect("fixed Node natural exit should drain descendants");
        assert_eq!(natural.status, "succeeded");

        let error = super::resolve_fixed_node_executable_from(&[
            "agentique-intentionally-missing-node-runtime",
        ])
        .expect_err("missing fixed Node runtime must block without fallback");
        assert_eq!(
            error,
            "Node runtime was not available for the fixed native adapter."
        );
    }

    #[test]
    fn native_node_identity_rejects_cross_profile_and_revoked_adapter() {
        let _guard = test_lock().lock().expect("runner test lock");
        reset_runner_records_for_tests();
        for (suffix, adapter_id, profile_id) in [
            (
                "cross",
                super::NODE_ADAPTER_ID,
                super::APPROVED_PERMISSION_PROFILE_ID,
            ),
            (
                "revoked",
                super::REVOKED_NODE_ADAPTER_ID,
                super::NODE_ADAPTER_PERMISSION_PROFILE_ID,
            ),
        ] {
            let result = agentique_runner_prepare(RunnerCommandRequest {
                resource_id: format!("resource.native-node-{suffix}"),
                session_id: format!("session.native-node-{suffix}"),
                run_id: format!("run.native-node-{suffix}"),
                command_id: Some(format!("command.native-node-{suffix}")),
                adapter_id: Some(adapter_id.to_string()),
                approval_id: None,
                permission_profile_id: Some(profile_id.to_string()),
                permission_grant_id: None,
            });
            assert!(result.is_err());
        }
    }

    #[cfg(any(target_os = "windows", unix))]
    #[test]
    fn fixed_python_runtime_missing_is_deterministic_without_fallback() {
        let error = resolve_fixed_python_executable_from(&[
            "agentique-intentionally-missing-python-runtime",
        ])
        .expect_err("an unavailable fixed runtime candidate must block deterministically");
        assert_eq!(
            error,
            "Python interpreter was not available for the fixed native adapter."
        );
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
    fn native_working_set_checkpoint_roundtrip_is_atomic_bounded_and_path_safe() {
        let _guard = test_lock().lock().expect("runner test lock");
        let scope_id = "scope.native-checkpoint-roundtrip";
        let scope_dir = native_working_set_scope_dir(scope_id).expect("scope root");
        if scope_dir.exists() {
            fs::remove_dir_all(&scope_dir).expect("clear prior checkpoint fixture");
        }
        let active = scope_dir.join("active").join("state");
        fs::create_dir_all(&active).expect("create native-owned active root");
        fs::write(active.join("café.txt"), "portable state").expect("write checkpoint fixture");

        let first = capture_native_working_set(scope_id, None).expect("capture checkpoint");
        assert!(first.committed);
        assert!(!first.restored);
        assert_eq!(first.file_count, 1);
        assert_eq!(first.encrypted_at_rest, false);
        assert_eq!(first.replays_external_effects, false);
        let repeated = capture_native_working_set(scope_id, Some(&first.generation_digest))
            .expect("same immutable generation is idempotent");
        assert!(repeated.idempotent);

        fs::write(active.join("café.txt"), "mutated disposable state")
            .expect("mutate active fixture");
        let restored = restore_native_working_set(scope_id).expect("restore checkpoint");
        assert!(restored.restored);
        assert_eq!(
            fs::read_to_string(active.join("café.txt")).expect("read restored fixture"),
            "portable state"
        );
        let serialized = serde_json::to_string(&restored).expect("serialize safe receipt");
        assert!(!serialized.contains(":\\"));
        assert!(!serialized.contains("/Users/"));
        assert!(!serialized.contains("/home/"));
        fs::remove_dir_all(&scope_dir).expect("clear checkpoint fixture");
    }

    #[test]
    fn native_working_set_rejects_collisions_cas_and_corruption_before_reset() {
        let _guard = test_lock().lock().expect("runner test lock");
        let mut collisions = std::collections::HashSet::new();
        validate_native_working_relative("state/Value.txt", &mut collisions)
            .expect("first portable path");
        assert!(validate_native_working_relative("state/value.txt", &mut collisions).is_err());
        assert!(validate_native_working_relative(
            "state/cafe\u{0301}.txt",
            &mut std::collections::HashSet::new()
        )
        .is_err());
        assert!(
            validate_native_working_relative("CON.txt", &mut std::collections::HashSet::new())
                .is_err()
        );
        assert!(
            validate_native_working_relative(".env", &mut std::collections::HashSet::new())
                .is_err()
        );

        let scope_id = "scope.native-checkpoint-integrity";
        let scope_dir = native_working_set_scope_dir(scope_id).expect("scope root");
        if scope_dir.exists() {
            fs::remove_dir_all(&scope_dir).expect("clear prior integrity fixture");
        }
        let active = scope_dir.join("active");
        fs::create_dir_all(&active).expect("create integrity active root");
        fs::write(active.join("state.txt"), "accepted state").expect("write accepted state");
        let accepted = capture_native_working_set(scope_id, None).expect("capture accepted state");
        fs::write(active.join("state.txt"), "new candidate").expect("write CAS candidate");
        assert!(capture_native_working_set(scope_id, Some(&"f".repeat(64))).is_err());

        let generation_file = scope_dir
            .join("checkpoints")
            .join("generations")
            .join(&accepted.generation_digest)
            .join("content")
            .join("state.txt");
        fs::write(&generation_file, "tampered state").expect("tamper immutable fixture");
        assert!(restore_native_working_set(scope_id).is_err());
        assert_eq!(
            fs::read_to_string(active.join("state.txt")).expect("live root survives corruption"),
            "new candidate"
        );
        fs::remove_dir_all(&scope_dir).expect("clear integrity fixture");
    }

    #[test]
    fn checkpoint_time_travel_branches_immutable_terminal_state_and_rechecks_fresh_approval() {
        let _guard = test_lock().lock().expect("runner test lock");
        reset_runner_records_for_tests();
        let resource_id = "resource.checkpoint-time-travel";
        let session_id = "session.checkpoint-time-travel";
        let source_run_id = "run.checkpoint-time-travel-source";
        let target_run_id = "run.checkpoint-time-travel-target";
        let corrupt_target_run_id = "run.checkpoint-time-travel-corrupt-target";
        let cleaned_fault_target_run_id = "run.checkpoint-time-travel-cleaned-fault";
        let cleanup_required_target_run_id = "run.checkpoint-time-travel-cleanup-required";
        for run_id in [
            source_run_id,
            target_run_id,
            corrupt_target_run_id,
            cleaned_fault_target_run_id,
            cleanup_required_target_run_id,
        ] {
            let scope = native_working_set_scope_dir(run_id).expect("time-travel scope");
            if scope.exists() {
                fs::remove_dir_all(&scope).expect("clear time-travel scope");
            }
            let projection =
                super::native_projection_run_dir(run_id).expect("time-travel projection scope");
            if projection.exists() {
                fs::remove_dir_all(&projection).expect("clear time-travel projection");
            }
        }

        let approved_source = approved_start_request(resource_id, session_id, source_run_id);
        start_native_run(
            approved_source.clone(),
            NativeAdapterTestMode::Success,
            Duration::from_secs(5),
        )
        .expect("source should start");
        let terminal = wait_for_run_state(source_run_id, &["succeeded", "failed"]);
        assert!(matches!(
            terminal.state,
            NativeRunState::Succeeded | NativeRunState::Failed
        ));

        let source_request = RunnerCommandRequest {
            command_id: Some("command.checkpoint-time-travel-history".to_string()),
            approval_id: None,
            permission_grant_id: None,
            ..approved_source.clone()
        };
        let history = agentique_runner_checkpoint_history(source_request.clone())
            .expect("terminal source should expose bounded history");
        assert!(!history.generations.is_empty());
        assert!(history.generations.len() <= 8);
        assert_eq!(
            history
                .generations
                .iter()
                .filter(|entry| entry.current)
                .count(),
            1
        );
        let selected = history
            .generations
            .iter()
            .find(|entry| entry.current)
            .expect("current source generation")
            .generation_digest
            .clone();
        let source_scope = native_working_set_scope_dir(source_run_id).expect("source scope");
        let source_pointer_path = source_scope.join("checkpoints").join("current.json");
        let source_manifest_path = source_scope
            .join("checkpoints")
            .join("generations")
            .join(&selected)
            .join("manifest.json");
        let source_pointer_before = fs::read(&source_pointer_path).expect("source pointer bytes");
        let source_manifest_before =
            fs::read(&source_manifest_path).expect("source manifest bytes");
        let source_content_root = source_manifest_path
            .parent()
            .expect("source generation root")
            .join("content");
        let source_content_before = snapshot_test_tree(&source_content_root);
        assert!(!source_content_before.is_empty());

        let corrupt_path = source_content_root.join(&source_content_before[0].0);
        let corrupt_bytes = fs::read(&corrupt_path).expect("source content before corruption");
        fs::write(&corrupt_path, "corrupt selected source generation")
            .expect("inject selected generation corruption");
        let corrupt_rejection =
            agentique_runner_time_travel_prepare(NativeTimeTravelPrepareRequest {
                schema_version: NATIVE_TIME_TRAVEL_REQUEST_SCHEMA.to_string(),
                source_resource_id: resource_id.to_string(),
                source_session_id: session_id.to_string(),
                source_run_id: source_run_id.to_string(),
                target_resource_id: resource_id.to_string(),
                target_session_id: session_id.to_string(),
                target_run_id: corrupt_target_run_id.to_string(),
                generation_digest: selected.clone(),
                mode: "retry".to_string(),
            })
            .expect_err("corrupt selected generation must fail before target mutation");
        assert!(
            corrupt_rejection.contains("content integrity")
                || corrupt_rejection.contains("bundle is incomplete"),
            "unexpected corruption rejection: {corrupt_rejection}"
        );
        assert!(!native_working_set_scope_dir(corrupt_target_run_id)
            .expect("corrupt target scope")
            .exists());
        fs::write(&corrupt_path, corrupt_bytes).expect("restore selected generation fixture");

        let source_working_tree_before = snapshot_test_tree(&source_scope);
        let source_projection_root =
            super::native_projection_run_dir(source_run_id).expect("source projection root");
        let source_projection_tree_before = snapshot_test_tree(&source_projection_root);
        let source_memory_before = snapshot_source_memory(source_run_id);

        let branch = agentique_runner_time_travel_prepare(NativeTimeTravelPrepareRequest {
            schema_version: NATIVE_TIME_TRAVEL_REQUEST_SCHEMA.to_string(),
            source_resource_id: resource_id.to_string(),
            source_session_id: session_id.to_string(),
            source_run_id: source_run_id.to_string(),
            target_resource_id: resource_id.to_string(),
            target_session_id: session_id.to_string(),
            target_run_id: target_run_id.to_string(),
            generation_digest: selected.clone(),
            mode: "replay".to_string(),
        })
        .expect("validated source generation should prepare a branch");
        assert_eq!(branch.state, "branch-ready");
        assert!(branch.requires_fresh_approval);
        assert!(!branch.will_spawn_process);
        assert_eq!(
            fs::read(&source_pointer_path).expect("source pointer unchanged"),
            source_pointer_before
        );
        assert_eq!(
            fs::read(&source_manifest_path).expect("source manifest unchanged"),
            source_manifest_before
        );
        assert_eq!(
            snapshot_test_tree(&source_scope),
            source_working_tree_before
        );
        assert_eq!(
            snapshot_test_tree(&source_projection_root),
            source_projection_tree_before
        );
        assert_eq!(snapshot_source_memory(source_run_id), source_memory_before);
        assert!(!super::native_run_registry_dir(target_run_id)
            .expect("target registry scope")
            .exists());
        assert!(!runner_records()
            .lock()
            .expect("runner records")
            .contains_key(target_run_id));

        let reused_target = agentique_runner_time_travel_prepare(NativeTimeTravelPrepareRequest {
            schema_version: NATIVE_TIME_TRAVEL_REQUEST_SCHEMA.to_string(),
            source_resource_id: resource_id.to_string(),
            source_session_id: session_id.to_string(),
            source_run_id: source_run_id.to_string(),
            target_resource_id: resource_id.to_string(),
            target_session_id: session_id.to_string(),
            target_run_id: target_run_id.to_string(),
            generation_digest: selected.clone(),
            mode: "replay".to_string(),
        })
        .expect_err("reused target must fail before mutation");
        assert!(reused_target.contains("already has native authority"));

        let cleaned_fault = prepare_native_time_travel_with_fault(
            NativeTimeTravelPrepareRequest {
                schema_version: NATIVE_TIME_TRAVEL_REQUEST_SCHEMA.to_string(),
                source_resource_id: resource_id.to_string(),
                source_session_id: session_id.to_string(),
                source_run_id: source_run_id.to_string(),
                target_resource_id: resource_id.to_string(),
                target_session_id: session_id.to_string(),
                target_run_id: cleaned_fault_target_run_id.to_string(),
                generation_digest: selected.clone(),
                mode: "resume".to_string(),
            },
            NativeTimeTravelFault::AfterStaging,
        )
        .expect_err("staging fault should roll back an incomplete target");
        assert!(cleaned_fault.contains("injected time-travel fault"));
        assert!(!native_working_set_scope_dir(cleaned_fault_target_run_id)
            .expect("cleaned fault target scope")
            .exists());

        let cleanup_required = prepare_native_time_travel_with_fault(
            NativeTimeTravelPrepareRequest {
                schema_version: NATIVE_TIME_TRAVEL_REQUEST_SCHEMA.to_string(),
                source_resource_id: resource_id.to_string(),
                source_session_id: session_id.to_string(),
                source_run_id: source_run_id.to_string(),
                target_resource_id: resource_id.to_string(),
                target_session_id: session_id.to_string(),
                target_run_id: cleanup_required_target_run_id.to_string(),
                generation_digest: selected.clone(),
                mode: "retry".to_string(),
            },
            NativeTimeTravelFault::CleanupFailure,
        )
        .expect_err("failed staging cleanup must stay non-authorizing");
        assert!(cleanup_required.contains("cleanup is required"));
        let cleanup_marker = native_working_set_scope_dir(cleanup_required_target_run_id)
            .expect("cleanup-required target scope")
            .join("cleanup-required.json");
        let cleanup_evidence: serde_json::Value = serde_json::from_slice(
            &fs::read(&cleanup_marker).expect("durable cleanup-required evidence"),
        )
        .expect("parse cleanup-required evidence");
        assert_eq!(cleanup_evidence["state"], "cleanup-required");
        assert_eq!(cleanup_evidence["willSpawnProcess"], false);
        assert_eq!(cleanup_evidence["replaysExternalEffects"], false);
        assert!(agentique_runner_prepare(RunnerCommandRequest {
            resource_id: resource_id.to_string(),
            session_id: session_id.to_string(),
            run_id: cleanup_required_target_run_id.to_string(),
            command_id: Some("command.checkpoint-time-travel-cleanup-prepare".to_string()),
            adapter_id: Some(APPROVED_ADAPTER_ID.to_string()),
            approval_id: None,
            permission_profile_id: Some(APPROVED_PERMISSION_PROFILE_ID.to_string()),
            permission_grant_id: None,
        })
        .expect_err("cleanup-required target must not gain approval authority")
        .contains("cleanup-required"));

        // Simulate a desktop restart: only the durable branch survives, with no in-memory
        // proposal/grant/run authority carried across the boundary.
        reset_runner_records_for_tests();

        let target_prepare_request = RunnerCommandRequest {
            resource_id: resource_id.to_string(),
            session_id: session_id.to_string(),
            run_id: target_run_id.to_string(),
            command_id: Some("command.checkpoint-time-travel-target-prepare".to_string()),
            adapter_id: Some(APPROVED_ADAPTER_ID.to_string()),
            approval_id: None,
            permission_profile_id: Some(APPROVED_PERMISSION_PROFILE_ID.to_string()),
            permission_grant_id: None,
        };
        let prepared = agentique_runner_prepare(target_prepare_request.clone())
            .expect("ordinary prepare should bind the branch lineage");
        let proposal_id = prepared.approval_id.expect("fresh proposal id");
        let proposal = agentique_runner_approval_proposal(RunnerCommandRequest {
            command_id: Some("command.checkpoint-time-travel-proposal".to_string()),
            approval_id: Some(proposal_id.clone()),
            ..target_prepare_request.clone()
        })
        .expect("fresh lineage proposal");
        let lineage = proposal
            .time_travel_lineage
            .as_ref()
            .expect("proposal lineage");
        assert_eq!(lineage.mode, "replay");
        assert_eq!(lineage.source_run_id, source_run_id);
        assert_eq!(lineage.source_generation_digest, selected);

        let decision = agentique_runner_decide_approval(NativeApprovalDecisionRequest {
            resource_id: resource_id.to_string(),
            session_id: session_id.to_string(),
            run_id: target_run_id.to_string(),
            proposal_id: proposal_id.clone(),
            proposal_digest: proposal.proposal_digest,
            decision: "approved".to_string(),
            actor_id: "actor.checkpoint-time-travel".to_string(),
        })
        .expect("fresh explicit approval");
        let grant_id = decision.permission_grant.expect("fresh grant").grant_id;
        fs::write(
            native_working_set_scope_dir(target_run_id)
                .expect("target scope")
                .join("active")
                .join("post-approval-drift.txt"),
            "drift after approval",
        )
        .expect("mutate target after presentation");
        let rejected = start_native_run(
            RunnerCommandRequest {
                command_id: Some("command.checkpoint-time-travel-target-start".to_string()),
                approval_id: Some(proposal_id),
                permission_grant_id: Some(grant_id.clone()),
                ..target_prepare_request
            },
            NativeAdapterTestMode::Success,
            Duration::from_secs(5),
        )
        .expect_err("target drift must fail before launch");
        assert!(rejected.contains("changed after explicit approval"));
        assert!(
            !super::native_permission_grant_records()
                .lock()
                .expect("permission grants")
                .get(&grant_id)
                .expect("fresh grant remains")
                .consumed
        );

        reset_runner_records_for_tests();
        for run_id in [
            source_run_id,
            target_run_id,
            corrupt_target_run_id,
            cleaned_fault_target_run_id,
            cleanup_required_target_run_id,
        ] {
            let scope = native_working_set_scope_dir(run_id).expect("cleanup scope");
            if scope.exists() {
                fs::remove_dir_all(scope).expect("cleanup time-travel scope");
            }
            let projection = super::native_projection_run_dir(run_id).expect("cleanup projection");
            if projection.exists() {
                fs::remove_dir_all(projection).expect("cleanup time-travel projection");
            }
        }
    }

    #[test]
    fn checkpoint_time_travel_rejects_ineligible_and_cross_scope_sources_before_target_creation() {
        let _guard = test_lock().lock().expect("runner test lock");
        reset_runner_records_for_tests();
        let pending_run_id = "run.checkpoint-time-travel-pending";
        let target_run_id = "run.checkpoint-time-travel-rejected-target";
        for run_id in [pending_run_id, target_run_id] {
            let scope = native_working_set_scope_dir(run_id).expect("rejection scope");
            if scope.exists() {
                fs::remove_dir_all(&scope).expect("clear rejection scope");
            }
            let projection =
                super::native_projection_run_dir(run_id).expect("rejection projection");
            if projection.exists() {
                fs::remove_dir_all(&projection).expect("clear rejection projection");
            }
        }
        let pending = RunnerCommandRequest {
            resource_id: "resource.checkpoint-time-travel-rejected".to_string(),
            session_id: "session.checkpoint-time-travel-rejected".to_string(),
            run_id: pending_run_id.to_string(),
            command_id: Some("command.checkpoint-time-travel-pending".to_string()),
            adapter_id: Some(APPROVED_ADAPTER_ID.to_string()),
            approval_id: None,
            permission_profile_id: Some(APPROVED_PERMISSION_PROFILE_ID.to_string()),
            permission_grant_id: None,
        };
        agentique_runner_prepare(pending.clone()).expect("pending source fixture");
        let checkpoint = capture_native_working_set(pending_run_id, None)
            .expect("pending source checkpoint fixture");
        assert!(agentique_runner_checkpoint_history(RunnerCommandRequest {
            command_id: Some("command.checkpoint-time-travel-pending-history".to_string()),
            ..pending.clone()
        })
        .is_err());
        assert!(
            agentique_runner_time_travel_prepare(NativeTimeTravelPrepareRequest {
                schema_version: NATIVE_TIME_TRAVEL_REQUEST_SCHEMA.to_string(),
                source_resource_id: pending.resource_id.clone(),
                source_session_id: pending.session_id.clone(),
                source_run_id: pending.run_id.clone(),
                target_resource_id: "resource.cross-scope".to_string(),
                target_session_id: pending.session_id.clone(),
                target_run_id: target_run_id.to_string(),
                generation_digest: checkpoint.generation_digest,
                mode: "retry".to_string(),
            })
            .is_err()
        );
        assert!(!native_working_set_scope_dir(target_run_id)
            .expect("rejected target scope")
            .exists());

        reset_runner_records_for_tests();
        for run_id in [pending_run_id, target_run_id] {
            let scope = native_working_set_scope_dir(run_id).expect("cleanup rejection scope");
            if scope.exists() {
                fs::remove_dir_all(scope).expect("cleanup rejection scope");
            }
            let projection =
                super::native_projection_run_dir(run_id).expect("cleanup rejection projection");
            if projection.exists() {
                fs::remove_dir_all(projection).expect("cleanup rejection projection");
            }
        }
    }

    #[test]
    fn rejects_shell_like_ids() {
        for value in ["powershell", "cmd-run", "python-adapter", "docker-run"] {
            assert!(validate_opaque_id("commandId", value).is_err());
        }
    }
}
