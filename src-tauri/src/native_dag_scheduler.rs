use super::{
    agentique_runner_cancel, agentique_runner_status, capture_native_working_set,
    contains_unsafe_projection_material, native_adapter_mode_for_host, native_epoch_millis,
    native_run_root, preflight_native_interrupt_decision, preflight_native_interrupt_pending,
    preflight_native_run_for_scheduler, redact_runner_text, reject_native_link, start_native_run,
    validate_opaque_id, write_synced_file, NativeAdapterTestMode, RunnerCommandRequest,
    NATIVE_RUN_POLL_INTERVAL, NATIVE_RUN_TIMEOUT,
};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeSet, HashMap, HashSet};
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;

const NATIVE_DAG_SCHEMA: &str = "agentique.nativeDagWorkflowReceipt.v1";
const MAX_NATIVE_DAG_NODES: usize = 32;
const MAX_NATIVE_DAG_EDGES: usize = 64;
const MAX_NATIVE_DAG_ATTEMPTS_PER_NODE: usize = 3;
const MAX_NATIVE_DAG_SNAPSHOT_BYTES: usize = 262_144;
const MAX_NATIVE_DAG_SNAPSHOTS: usize = 256;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct NativeDagStartRequest {
    workflow_id: String,
    resource_id: String,
    session_id: String,
    command_id: Option<String>,
    nodes: Vec<NativeDagNodeRequest>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NativeDagNodeRequest {
    node_id: String,
    node_type: String,
    interrupt_id: Option<String>,
    depends_on: Vec<String>,
    max_retries: usize,
    attempts: Vec<NativeDagAttemptRequest>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NativeDagAttemptRequest {
    run_id: String,
    command_id: String,
    adapter_id: String,
    approval_id: String,
    permission_profile_id: String,
    permission_grant_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct NativeDagCommandRequest {
    workflow_id: String,
    resource_id: String,
    session_id: String,
    command_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct NativeDagResumeRequest {
    workflow_id: String,
    resource_id: String,
    session_id: String,
    command_id: Option<String>,
    node_id: String,
    run_id: String,
    interrupt_id: String,
    checkpoint_generation_digest: String,
    proposal_id: String,
    proposal_digest: String,
    decision_id: String,
    decision: String,
    permission_grant_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct NativeDagWorkflowReceipt {
    schema_version: String,
    sequence: usize,
    workflow_id: String,
    resource_id: String,
    session_id: String,
    state: String,
    active_node_id: Option<String>,
    terminal_state: Option<String>,
    topological_order: Vec<String>,
    nodes: Vec<NativeDagNodeReceipt>,
    reason: String,
    redacted: bool,
    replays_external_effects: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NativeDagNodeReceipt {
    node_id: String,
    state: String,
    depends_on: Vec<String>,
    retry_count: usize,
    active_attempt_index: Option<usize>,
    terminal_run_id: Option<String>,
    attempts: Vec<NativeDagAttemptReceipt>,
    interrupt: Option<NativeDagInterruptReceipt>,
    reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NativeDagInterruptReceipt {
    interrupt_id: String,
    run_id: String,
    proposal_id: String,
    proposal_digest: String,
    checkpoint_generation_digest: String,
    state: String,
    expires_at_epoch_seconds: u64,
    reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NativeDagAttemptReceipt {
    attempt_index: usize,
    run_id: String,
    state: String,
    cleanup_verified: bool,
    reason: String,
}

struct NativeDagRuntimeRecord {
    request: Mutex<NativeDagStartRequest>,
    receipt: Mutex<NativeDagWorkflowReceipt>,
    cancel_requested: AtomicBool,
    worker_active: AtomicBool,
    active_request: Mutex<Option<RunnerCommandRequest>>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum NativeDagAttemptOutcome {
    Succeeded,
    Failed { cleanup_verified: bool },
    Canceled,
    CleanupRequired,
    SchedulerFailure,
}

type NativeDagModeSelector = fn(&str) -> NativeAdapterTestMode;

fn production_mode_selector(_: &str) -> NativeAdapterTestMode {
    native_adapter_mode_for_host()
}

pub(crate) fn agentique_scheduler_start(
    request: NativeDagStartRequest,
) -> Result<NativeDagWorkflowReceipt, String> {
    start_native_dag(request, production_mode_selector)
}

fn start_native_dag(
    request: NativeDagStartRequest,
    mode_selector: NativeDagModeSelector,
) -> Result<NativeDagWorkflowReceipt, String> {
    let topological_order = validate_native_dag_request(&request)?;
    if read_native_dag_snapshots(&request.workflow_id)?.is_empty() {
        // The workflow id is new and may be admitted below.
    } else {
        return Err("workflowId already has durable native scheduler state.".to_string());
    }
    if native_dag_records()
        .lock()
        .map_err(|_| "native DAG record store is unavailable.".to_string())?
        .contains_key(&request.workflow_id)
    {
        return Err("workflowId already has an in-process native scheduler.".to_string());
    }

    // CRITICAL: preflight every attempt before persisting admission or launching the first node.
    // Moving this check into the worker permits a bad later grant to create partial graph effects.
    for node in &request.nodes {
        for attempt in &node.attempts {
            let runner = runner_request(&request, attempt);
            if node.node_type == "approval-interrupt" {
                preflight_native_interrupt_pending(&runner)?;
            } else {
                preflight_native_run_for_scheduler(&runner)?;
            }
        }
    }

    let receipt = initial_receipt(&request, topological_order);
    write_native_dag_snapshot(&receipt)?;
    let runtime = Arc::new(NativeDagRuntimeRecord {
        request: Mutex::new(request.clone()),
        receipt: Mutex::new(receipt.clone()),
        cancel_requested: AtomicBool::new(false),
        worker_active: AtomicBool::new(true),
        active_request: Mutex::new(None),
    });
    native_dag_records()
        .lock()
        .map_err(|_| "native DAG record store is unavailable.".to_string())?
        .insert(request.workflow_id.clone(), runtime.clone());
    let worker_runtime = runtime.clone();
    if thread::Builder::new()
        .name(format!("native-dag-{}", request.workflow_id))
        .spawn(move || run_native_dag_worker(worker_runtime, mode_selector))
        .is_err()
    {
        finish_workflow(&runtime, "failed", "native DAG worker could not be created");
        return Err("native DAG worker could not be created.".to_string());
    }
    Ok(receipt)
}

pub(crate) fn agentique_scheduler_status(
    request: NativeDagCommandRequest,
) -> Result<NativeDagWorkflowReceipt, String> {
    validate_native_dag_command(&request)?;
    if let Some(runtime) = native_dag_records()
        .lock()
        .map_err(|_| "native DAG record store is unavailable.".to_string())?
        .get(&request.workflow_id)
        .cloned()
    {
        let receipt = runtime
            .receipt
            .lock()
            .map_err(|_| "native DAG receipt is unavailable.".to_string())?
            .clone();
        ensure_workflow_scope(&receipt, &request)?;
        return Ok(receipt);
    }
    recover_interrupted_native_dag(request)
}

pub(crate) fn agentique_scheduler_cancel(
    request: NativeDagCommandRequest,
) -> Result<NativeDagWorkflowReceipt, String> {
    validate_native_dag_command(&request)?;
    let runtime = native_dag_records()
        .lock()
        .map_err(|_| "native DAG record store is unavailable.".to_string())?
        .get(&request.workflow_id)
        .cloned();
    let Some(runtime) = runtime else {
        let receipt = recover_interrupted_native_dag(request)?;
        if is_workflow_terminal(&receipt.state) {
            return Ok(receipt);
        }
        return Err("native DAG coordinator is unavailable for cancellation.".to_string());
    };
    {
        let receipt = runtime
            .receipt
            .lock()
            .map_err(|_| "native DAG receipt is unavailable.".to_string())?;
        ensure_workflow_scope(&receipt, &request)?;
        if is_workflow_terminal(&receipt.state) {
            return Ok(receipt.clone());
        }
    }
    runtime.cancel_requested.store(true, Ordering::SeqCst);
    persist_transition(&runtime, |receipt| {
        receipt.state = "canceling".to_string();
        receipt.reason = "native scheduler cancellation was requested".to_string();
    })?;

    let active = runtime
        .active_request
        .lock()
        .map_err(|_| "native DAG active run handle is unavailable.".to_string())?
        .clone();
    if active.is_none() && !runtime.worker_active.load(Ordering::SeqCst) {
        cancel_remaining_nodes(&runtime)?;
        finish_workflow(
            &runtime,
            "canceled",
            "paused native approval interrupt was canceled before resume",
        );
        return runtime
            .receipt
            .lock()
            .map_err(|_| "native DAG receipt is unavailable.".to_string())
            .map(|receipt| receipt.clone());
    }
    if let Some(mut active) = active {
        active.command_id = request.command_id;
        let _ = agentique_runner_cancel(active);
    }
    runtime
        .receipt
        .lock()
        .map_err(|_| "native DAG receipt is unavailable.".to_string())
        .map(|receipt| receipt.clone())
}

pub(crate) fn agentique_scheduler_resume(
    request: NativeDagResumeRequest,
) -> Result<NativeDagWorkflowReceipt, String> {
    resume_native_dag(request, production_mode_selector)
}

fn resume_native_dag(
    request: NativeDagResumeRequest,
    mode_selector: NativeDagModeSelector,
) -> Result<NativeDagWorkflowReceipt, String> {
    validate_native_dag_resume(&request)?;
    let runtime = native_dag_records()
        .lock()
        .map_err(|_| "native DAG record store is unavailable.".to_string())?
        .get(&request.workflow_id)
        .cloned()
        .ok_or_else(|| {
            "native DAG coordinator is unavailable; persisted interrupts cannot resume after restart."
                .to_string()
        })?;
    {
        let receipt = runtime
            .receipt
            .lock()
            .map_err(|_| "native DAG receipt is unavailable.".to_string())?;
        if receipt.workflow_id != request.workflow_id
            || receipt.resource_id != request.resource_id
            || receipt.session_id != request.session_id
            || receipt.state != "paused-approval"
        {
            return Err("native DAG is not at a resumable approval interrupt.".to_string());
        }
    }
    if runtime
        .worker_active
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err(
            "native approval interrupt already has an active or claimed worker.".to_string(),
        );
    }

    let outcome = resume_native_dag_interrupt(&runtime, &request);
    if let Err(error) = outcome {
        finish_workflow(
            &runtime,
            "failed",
            &format!(
                "native approval interrupt failed closed: {}",
                redact_runner_text(&error)
            ),
        );
        return Err(error);
    }
    if request.decision == "denied" {
        if persist_transition(&runtime, |receipt| {
            if let Some(node) = receipt
                .nodes
                .iter_mut()
                .find(|node| node.node_id == request.node_id)
            {
                node.state = "denied".to_string();
                node.reason = "explicit human denial blocked the risky step".to_string();
                if let Some(interrupt) = node.interrupt.as_mut() {
                    interrupt.state = "denied".to_string();
                    interrupt.reason = "explicit human denial was recorded".to_string();
                }
            }
        })
        .is_err()
        {
            fail_in_memory_after_persistence_error(&runtime);
            return Err("native approval denial could not be persisted safely.".to_string());
        }
        finish_workflow(
            &runtime,
            "denied",
            "explicit human denial terminated the native DAG",
        );
        return runtime
            .receipt
            .lock()
            .map_err(|_| "native DAG receipt is unavailable.".to_string())
            .map(|receipt| receipt.clone());
    }

    if persist_transition(&runtime, |receipt| {
        receipt.state = "running".to_string();
        receipt.reason =
            "approved interrupt is resuming through the fixed native runner".to_string();
        if let Some(node) = receipt
            .nodes
            .iter_mut()
            .find(|node| node.node_id == request.node_id)
        {
            node.state = "queued".to_string();
            node.reason = "exact approval interrupt authority was accepted for resume".to_string();
            if let Some(interrupt) = node.interrupt.as_mut() {
                interrupt.state = "approved".to_string();
                interrupt.reason = "exact decision and one-use grant were accepted".to_string();
            }
        }
    })
    .is_err()
    {
        fail_in_memory_after_persistence_error(&runtime);
        return Err("native approval resume could not be persisted safely.".to_string());
    }
    let worker_runtime = runtime.clone();
    if thread::Builder::new()
        .name(format!("native-dag-resume-{}", request.workflow_id))
        .spawn(move || run_native_dag_worker(worker_runtime, mode_selector))
        .is_err()
    {
        finish_workflow(
            &runtime,
            "failed",
            "native DAG resume worker could not be created",
        );
        return Err("native DAG resume worker could not be created.".to_string());
    }
    runtime
        .receipt
        .lock()
        .map_err(|_| "native DAG receipt is unavailable.".to_string())
        .map(|receipt| receipt.clone())
}

fn validate_native_dag_resume(request: &NativeDagResumeRequest) -> Result<(), String> {
    for (name, value) in [
        ("workflowId", &request.workflow_id),
        ("resourceId", &request.resource_id),
        ("sessionId", &request.session_id),
        ("nodeId", &request.node_id),
        ("runId", &request.run_id),
        ("interruptId", &request.interrupt_id),
        ("proposalId", &request.proposal_id),
        ("decisionId", &request.decision_id),
    ] {
        validate_opaque_id(name, value)?;
    }
    if let Some(command_id) = &request.command_id {
        validate_opaque_id("commandId", command_id)?;
    }
    if request.checkpoint_generation_digest.len() != 64
        || request.proposal_digest.len() != 64
        || !request
            .checkpoint_generation_digest
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit())
        || !request
            .proposal_digest
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit())
    {
        return Err("native approval resume digest is not canonical SHA-256.".to_string());
    }
    if request.decision != "approved" && request.decision != "denied" {
        return Err("native approval resume decision must be approved or denied.".to_string());
    }
    if request.decision == "approved" {
        validate_opaque_id(
            "permissionGrantId",
            request.permission_grant_id.as_deref().ok_or_else(|| {
                "approved native approval resume requires permissionGrantId.".to_string()
            })?,
        )?;
    } else if request.permission_grant_id.is_some() {
        return Err(
            "denied native approval resume must not include permissionGrantId.".to_string(),
        );
    }
    Ok(())
}

fn validate_native_dag_request(request: &NativeDagStartRequest) -> Result<Vec<String>, String> {
    validate_opaque_id("workflowId", &request.workflow_id)?;
    validate_opaque_id("resourceId", &request.resource_id)?;
    validate_opaque_id("sessionId", &request.session_id)?;
    if let Some(command_id) = &request.command_id {
        validate_opaque_id("commandId", command_id)?;
    }
    if request.nodes.is_empty() || request.nodes.len() > MAX_NATIVE_DAG_NODES {
        return Err("native DAG must contain between 1 and 32 nodes.".to_string());
    }
    let mut node_ids = HashSet::new();
    let mut run_ids = HashSet::new();
    let mut grant_ids = HashSet::new();
    let mut interrupt_ids = HashSet::new();
    let mut edge_count = 0usize;
    for node in &request.nodes {
        validate_opaque_id("nodeId", &node.node_id)?;
        if !node_ids.insert(node.node_id.clone()) {
            return Err("native DAG contains a duplicate node id.".to_string());
        }
        if node.node_type == "handoff-only" {
            return Err(
                "handoff-only nodes remain blocked from native scheduler execution.".to_string(),
            );
        }
        if node.node_type != "fixed-adapter" && node.node_type != "approval-interrupt" {
            return Err("native DAG contains an unsupported node type.".to_string());
        }
        if node.node_type == "approval-interrupt" {
            let interrupt_id = node.interrupt_id.as_deref().ok_or_else(|| {
                "approval-interrupt node requires one native interrupt identity.".to_string()
            })?;
            validate_opaque_id("interruptId", interrupt_id)?;
            if !interrupt_ids.insert(interrupt_id.to_string()) {
                return Err("native DAG contains a duplicate interrupt identity.".to_string());
            }
            if node.max_retries != 0 || node.attempts.len() != 1 {
                return Err(
                    "approval-interrupt node requires exactly one non-retry attempt.".to_string(),
                );
            }
        } else if node.interrupt_id.is_some() {
            return Err("fixed-adapter node must not contain interruptId.".to_string());
        }
        if node.max_retries >= MAX_NATIVE_DAG_ATTEMPTS_PER_NODE
            || node.attempts.len() != node.max_retries + 1
        {
            return Err(
                "native DAG retries require one distinct attempt per initial run and retry."
                    .to_string(),
            );
        }
        edge_count = edge_count.saturating_add(node.depends_on.len());
        if edge_count > MAX_NATIVE_DAG_EDGES {
            return Err("native DAG exceeds its bounded dependency count.".to_string());
        }
        let mut local_dependencies = HashSet::new();
        for dependency in &node.depends_on {
            validate_opaque_id("dependencyId", dependency)?;
            if dependency == &node.node_id || !local_dependencies.insert(dependency.clone()) {
                return Err("native DAG contains a self or duplicate dependency.".to_string());
            }
        }
        for attempt in &node.attempts {
            for (name, value) in [
                ("runId", &attempt.run_id),
                ("commandId", &attempt.command_id),
                ("adapterId", &attempt.adapter_id),
                ("approvalId", &attempt.approval_id),
                ("permissionProfileId", &attempt.permission_profile_id),
            ] {
                validate_opaque_id(name, value)?;
            }
            if !run_ids.insert(attempt.run_id.clone()) {
                return Err("native DAG contains a duplicate run identity.".to_string());
            }
            if let Some(permission_grant_id) = &attempt.permission_grant_id {
                validate_opaque_id("permissionGrantId", permission_grant_id)?;
                if !grant_ids.insert(permission_grant_id.clone()) {
                    return Err(
                        "native DAG contains a duplicate permission grant identity.".to_string()
                    );
                }
            }
            if node.node_type == "approval-interrupt" && attempt.permission_grant_id.is_some() {
                return Err(
                    "approval-interrupt admission must not contain a permission grant.".to_string(),
                );
            }
            if node.node_type == "fixed-adapter" && attempt.permission_grant_id.is_none() {
                return Err(
                    "fixed-adapter attempt requires a pre-approved permission grant.".to_string(),
                );
            }
        }
    }
    for node in &request.nodes {
        if node
            .depends_on
            .iter()
            .any(|dependency| !node_ids.contains(dependency))
        {
            return Err("native DAG contains a missing dependency.".to_string());
        }
    }
    stable_topological_order(&request.nodes)
}

fn validate_native_dag_command(request: &NativeDagCommandRequest) -> Result<(), String> {
    validate_opaque_id("workflowId", &request.workflow_id)?;
    validate_opaque_id("resourceId", &request.resource_id)?;
    validate_opaque_id("sessionId", &request.session_id)?;
    if let Some(command_id) = &request.command_id {
        validate_opaque_id("commandId", command_id)?;
    }
    Ok(())
}

fn resume_native_dag_interrupt(
    runtime: &Arc<NativeDagRuntimeRecord>,
    request: &NativeDagResumeRequest,
) -> Result<(), String> {
    let (expected_interrupt, attempt) = {
        let receipt = runtime
            .receipt
            .lock()
            .map_err(|_| "native DAG receipt is unavailable.".to_string())?;
        if receipt.workflow_id != request.workflow_id
            || receipt.resource_id != request.resource_id
            || receipt.session_id != request.session_id
            || receipt.state != "paused-approval"
            || receipt.active_node_id.is_some()
        {
            return Err("native DAG is not at the exact paused approval interrupt.".to_string());
        }
        let node_receipt = receipt
            .nodes
            .iter()
            .find(|node| node.node_id == request.node_id)
            .ok_or_else(|| {
                "native approval resume node is outside the frozen graph.".to_string()
            })?;
        if node_receipt.state != "pending-approval" {
            return Err("native approval resume node is not pending a decision.".to_string());
        }
        let interrupt = node_receipt
            .interrupt
            .clone()
            .ok_or_else(|| "native approval interrupt receipt is missing.".to_string())?;
        let frozen = runtime
            .request
            .lock()
            .map_err(|_| "native DAG frozen request is unavailable.".to_string())?;
        let node = frozen
            .nodes
            .iter()
            .find(|node| node.node_id == request.node_id)
            .ok_or_else(|| {
                "native approval resume node is outside the frozen request.".to_string()
            })?;
        if node.node_type != "approval-interrupt" || node.attempts.len() != 1 {
            return Err(
                "native approval resume target is not a bounded interrupt node.".to_string(),
            );
        }
        (interrupt, node.attempts[0].clone())
    };
    if expected_interrupt.interrupt_id != request.interrupt_id
        || expected_interrupt.run_id != request.run_id
        || expected_interrupt.proposal_id != request.proposal_id
        || expected_interrupt.proposal_digest != request.proposal_digest
        || expected_interrupt.checkpoint_generation_digest != request.checkpoint_generation_digest
        || expected_interrupt.state != "pending"
        || expected_interrupt.expires_at_epoch_seconds <= super::current_epoch_seconds()
        || attempt.run_id != request.run_id
        || attempt.approval_id != request.proposal_id
    {
        return Err(
            "native approval resume identities are stale, expired, or mismatched.".to_string(),
        );
    }

    // CRITICAL: approval of one working-set generation must never authorize edited input. The
    // recapture may advance the native pointer, but any digest change terminalizes before spawn.
    let checkpoint =
        capture_native_working_set(&request.run_id, Some(&request.checkpoint_generation_digest))?;
    if checkpoint.generation_digest != request.checkpoint_generation_digest {
        return Err(
            "native approval interrupt detected edited input after checkpoint.".to_string(),
        );
    }
    let runner = RunnerCommandRequest {
        resource_id: request.resource_id.clone(),
        session_id: request.session_id.clone(),
        run_id: request.run_id.clone(),
        command_id: Some(attempt.command_id.clone()),
        adapter_id: Some(attempt.adapter_id.clone()),
        approval_id: Some(request.proposal_id.clone()),
        permission_profile_id: Some(attempt.permission_profile_id.clone()),
        permission_grant_id: request.permission_grant_id.clone(),
    };
    preflight_native_interrupt_decision(
        &runner,
        &request.proposal_digest,
        &request.decision_id,
        &request.decision,
    )?;
    if request.decision == "approved" {
        let mut frozen = runtime
            .request
            .lock()
            .map_err(|_| "native DAG frozen request is unavailable.".to_string())?;
        let node = frozen
            .nodes
            .iter_mut()
            .find(|node| node.node_id == request.node_id)
            .ok_or_else(|| {
                "native approval resume node is outside the frozen request.".to_string()
            })?;
        node.attempts[0].permission_grant_id = request.permission_grant_id.clone();
    }
    Ok(())
}

fn stable_topological_order(nodes: &[NativeDagNodeRequest]) -> Result<Vec<String>, String> {
    let mut dependencies = nodes
        .iter()
        .map(|node| {
            (
                node.node_id.clone(),
                node.depends_on.iter().cloned().collect::<HashSet<_>>(),
            )
        })
        .collect::<HashMap<_, _>>();
    let mut ready = dependencies
        .iter()
        .filter_map(|(node_id, remaining)| remaining.is_empty().then_some(node_id.clone()))
        .collect::<BTreeSet<_>>();
    let mut order = Vec::with_capacity(nodes.len());
    while let Some(node_id) = ready.pop_first() {
        order.push(node_id.clone());
        for (candidate, remaining) in &mut dependencies {
            if remaining.remove(&node_id) && remaining.is_empty() && !order.contains(candidate) {
                ready.insert(candidate.clone());
            }
        }
    }
    if order.len() != nodes.len() {
        return Err("native DAG contains a dependency cycle.".to_string());
    }
    Ok(order)
}

fn initial_receipt(
    request: &NativeDagStartRequest,
    topological_order: Vec<String>,
) -> NativeDagWorkflowReceipt {
    NativeDagWorkflowReceipt {
        schema_version: NATIVE_DAG_SCHEMA.to_string(),
        sequence: 1,
        workflow_id: request.workflow_id.clone(),
        resource_id: request.resource_id.clone(),
        session_id: request.session_id.clone(),
        state: "queued".to_string(),
        active_node_id: None,
        terminal_state: None,
        topological_order,
        nodes: request
            .nodes
            .iter()
            .map(|node| NativeDagNodeReceipt {
                node_id: node.node_id.clone(),
                state: "queued".to_string(),
                depends_on: node.depends_on.clone(),
                retry_count: 0,
                active_attempt_index: None,
                terminal_run_id: None,
                attempts: node
                    .attempts
                    .iter()
                    .enumerate()
                    .map(|(attempt_index, attempt)| NativeDagAttemptReceipt {
                        attempt_index,
                        run_id: attempt.run_id.clone(),
                        state: "queued".to_string(),
                        cleanup_verified: false,
                        reason: "attempt is preflight-approved and queued".to_string(),
                    })
                    .collect(),
                interrupt: None,
                reason: "node is waiting for dependencies".to_string(),
            })
            .collect(),
        reason: "native DAG passed whole-graph admission".to_string(),
        redacted: true,
        replays_external_effects: false,
    }
}

fn runner_request(
    workflow: &NativeDagStartRequest,
    attempt: &NativeDagAttemptRequest,
) -> RunnerCommandRequest {
    RunnerCommandRequest {
        resource_id: workflow.resource_id.clone(),
        session_id: workflow.session_id.clone(),
        run_id: attempt.run_id.clone(),
        command_id: Some(attempt.command_id.clone()),
        adapter_id: Some(attempt.adapter_id.clone()),
        approval_id: Some(attempt.approval_id.clone()),
        permission_profile_id: Some(attempt.permission_profile_id.clone()),
        permission_grant_id: attempt.permission_grant_id.clone(),
    }
}

fn pause_native_dag_interrupt(
    runtime: &Arc<NativeDagRuntimeRecord>,
    node: &NativeDagNodeRequest,
) -> Result<(), String> {
    let attempt = node
        .attempts
        .first()
        .ok_or_else(|| "native approval interrupt attempt is missing.".to_string())?;
    let workflow = runtime
        .request
        .lock()
        .map_err(|_| "native DAG frozen request is unavailable.".to_string())?
        .clone();
    let runner = runner_request(&workflow, attempt);
    let (proposal_digest, expires_at_epoch_seconds) = preflight_native_interrupt_pending(&runner)?;
    let checkpoint = capture_native_working_set(&attempt.run_id, None)?;
    let interrupt_id = node
        .interrupt_id
        .clone()
        .ok_or_else(|| "native approval interrupt identity is missing.".to_string())?;
    // CRITICAL: the pause snapshot must be durable before human approval is actionable. Starting
    // the process first would turn a presentation state into post-effect evidence.
    persist_transition(runtime, |receipt| {
        receipt.state = "paused-approval".to_string();
        receipt.active_node_id = None;
        receipt.reason = "native DAG is paused for explicit human approval".to_string();
        if let Some(node_receipt) = receipt
            .nodes
            .iter_mut()
            .find(|candidate| candidate.node_id == node.node_id)
        {
            node_receipt.state = "pending-approval".to_string();
            node_receipt.reason =
                "risky fixed-adapter step is waiting at a durable checkpoint".to_string();
            node_receipt.interrupt = Some(NativeDagInterruptReceipt {
                interrupt_id,
                run_id: attempt.run_id.clone(),
                proposal_id: attempt.approval_id.clone(),
                proposal_digest,
                checkpoint_generation_digest: checkpoint.generation_digest,
                state: "pending".to_string(),
                expires_at_epoch_seconds,
                reason: "explicit human decision is required before native execution".to_string(),
            });
        }
    })
}

fn run_native_dag_worker(
    runtime: Arc<NativeDagRuntimeRecord>,
    mode_selector: NativeDagModeSelector,
) {
    if persist_transition(&runtime, |receipt| {
        receipt.state = "running".to_string();
        receipt.reason = "native DAG worker is active".to_string();
    })
    .is_err()
    {
        fail_in_memory_after_persistence_error(&runtime);
        return;
    }
    let order = runtime
        .receipt
        .lock()
        .map(|receipt| receipt.topological_order.clone())
        .unwrap_or_default();
    for node_id in order {
        if runtime.cancel_requested.load(Ordering::SeqCst) {
            if cancel_remaining_nodes(&runtime).is_err() {
                fail_in_memory_after_persistence_error(&runtime);
                return;
            }
            finish_workflow(
                &runtime,
                "canceled",
                "native scheduler cancellation completed",
            );
            return;
        }
        let already_succeeded = runtime
            .receipt
            .lock()
            .map(|receipt| {
                receipt
                    .nodes
                    .iter()
                    .find(|node| node.node_id == node_id)
                    .is_some_and(|node| node.state == "succeeded")
            })
            .unwrap_or(false);
        if already_succeeded {
            continue;
        }
        let dependency_failed = runtime
            .receipt
            .lock()
            .map(|receipt| {
                receipt
                    .nodes
                    .iter()
                    .find(|node| node.node_id == node_id)
                    .map(|node| {
                        node.depends_on.iter().any(|dependency| {
                            receipt
                                .nodes
                                .iter()
                                .find(|candidate| candidate.node_id == *dependency)
                                .is_none_or(|candidate| candidate.state != "succeeded")
                        })
                    })
                    .unwrap_or(true)
            })
            .unwrap_or(true);
        if dependency_failed {
            if persist_transition(&runtime, |receipt| {
                if let Some(node) = receipt
                    .nodes
                    .iter_mut()
                    .find(|node| node.node_id == node_id)
                {
                    node.state = "skipped".to_string();
                    node.reason = "dependency did not succeed".to_string();
                }
            })
            .is_err()
            {
                fail_in_memory_after_persistence_error(&runtime);
                return;
            }
            continue;
        }

        let request_node = match runtime.request.lock().ok().and_then(|request| {
            request
                .nodes
                .iter()
                .find(|node| node.node_id == node_id)
                .cloned()
        }) {
            Some(node) => node,
            None => {
                fail_scheduler_invariant(&runtime, "frozen node request is unavailable");
                return;
            }
        };
        if request_node.node_type == "approval-interrupt"
            && request_node.attempts[0].permission_grant_id.is_none()
        {
            if let Err(error) = pause_native_dag_interrupt(&runtime, &request_node) {
                finish_workflow(
                    &runtime,
                    "failed",
                    &format!(
                        "native approval interrupt failed closed: {}",
                        redact_runner_text(&error)
                    ),
                );
            } else {
                runtime.worker_active.store(false, Ordering::SeqCst);
            }
            return;
        }
        let mut succeeded = false;
        for (attempt_index, attempt) in request_node.attempts.iter().enumerate() {
            if runtime.cancel_requested.load(Ordering::SeqCst) {
                break;
            }
            match execute_native_dag_attempt(
                &runtime,
                &node_id,
                attempt_index,
                attempt,
                mode_selector,
            ) {
                NativeDagAttemptOutcome::Succeeded => {
                    succeeded = true;
                    break;
                }
                NativeDagAttemptOutcome::Failed { cleanup_verified }
                    if cleanup_verified && attempt_index + 1 < request_node.attempts.len() =>
                {
                    if persist_transition(&runtime, |receipt| {
                        if let Some(node) = receipt.nodes.iter_mut().find(|node| node.node_id == node_id) {
                            node.state = "retrying".to_string();
                            node.retry_count = attempt_index + 1;
                            node.reason = "prior attempt failed with verified cleanup; next distinct pre-approved attempt is eligible".to_string();
                        }
                    })
                    .is_err()
                    {
                        fail_in_memory_after_persistence_error(&runtime);
                        return;
                    }
                }
                NativeDagAttemptOutcome::CleanupRequired => {
                    finish_workflow(
                        &runtime,
                        "cleanup-required",
                        "node cleanup is uncertain; automatic replay is forbidden",
                    );
                    return;
                }
                NativeDagAttemptOutcome::Canceled => {
                    if cancel_remaining_nodes(&runtime).is_err() {
                        fail_in_memory_after_persistence_error(&runtime);
                        return;
                    }
                    finish_workflow(&runtime, "canceled", "native scheduler node was canceled");
                    return;
                }
                NativeDagAttemptOutcome::SchedulerFailure => {
                    finish_workflow(&runtime, "failed", "native scheduler invariant failed");
                    return;
                }
                NativeDagAttemptOutcome::Failed { .. } => break,
            }
        }
        if !succeeded {
            if runtime.cancel_requested.load(Ordering::SeqCst) {
                if cancel_remaining_nodes(&runtime).is_err() {
                    fail_in_memory_after_persistence_error(&runtime);
                    return;
                }
                finish_workflow(
                    &runtime,
                    "canceled",
                    "native scheduler cancellation completed",
                );
                return;
            }
            if persist_transition(&runtime, |receipt| {
                if let Some(node) = receipt
                    .nodes
                    .iter_mut()
                    .find(|node| node.node_id == node_id)
                {
                    node.state = "failed".to_string();
                    node.reason = "all eligible attempts failed".to_string();
                }
            })
            .is_err()
            {
                fail_in_memory_after_persistence_error(&runtime);
                return;
            }
        }
    }
    let failed = runtime
        .receipt
        .lock()
        .map(|receipt| receipt.nodes.iter().any(|node| node.state != "succeeded"))
        .unwrap_or(true);
    if failed {
        finish_workflow(
            &runtime,
            "failed",
            "one or more native DAG nodes failed or were skipped",
        );
    } else {
        finish_workflow(&runtime, "succeeded", "all native DAG nodes succeeded");
    }
}

fn execute_native_dag_attempt(
    runtime: &Arc<NativeDagRuntimeRecord>,
    node_id: &str,
    attempt_index: usize,
    attempt: &NativeDagAttemptRequest,
    mode_selector: NativeDagModeSelector,
) -> NativeDagAttemptOutcome {
    let request = match runtime
        .request
        .lock()
        .map(|workflow| runner_request(&workflow, attempt))
    {
        Ok(request) => request,
        Err(_) => {
            fail_scheduler_invariant(runtime, "frozen native DAG request is unavailable");
            return NativeDagAttemptOutcome::SchedulerFailure;
        }
    };
    if persist_transition(runtime, |receipt| {
        receipt.active_node_id = Some(node_id.to_string());
        if let Some(node) = receipt
            .nodes
            .iter_mut()
            .find(|node| node.node_id == node_id)
        {
            node.state = "running".to_string();
            node.active_attempt_index = Some(attempt_index);
            node.reason = "native runner owns the active attempt".to_string();
            if let Some(item) = node.attempts.get_mut(attempt_index) {
                item.state = "running".to_string();
                item.reason =
                    "one-use permission grant is being consumed by native start".to_string();
            }
        }
    })
    .is_err()
    {
        fail_in_memory_after_persistence_error(runtime);
        return NativeDagAttemptOutcome::SchedulerFailure;
    }
    if let Ok(mut active) = runtime.active_request.lock() {
        *active = Some(request.clone());
    } else {
        fail_scheduler_invariant(runtime, "active run handle is unavailable");
        return NativeDagAttemptOutcome::SchedulerFailure;
    }
    if runtime.cancel_requested.load(Ordering::SeqCst) {
        clear_active_request(runtime);
        return NativeDagAttemptOutcome::Canceled;
    }

    let start = start_native_run(
        request.clone(),
        mode_selector(&attempt.run_id),
        NATIVE_RUN_TIMEOUT,
    );
    let start = match start {
        Ok(receipt) => receipt,
        Err(error) => {
            clear_active_request(runtime);
            let reason = format!(
                "native start rejected after admission: {}",
                redact_runner_text(&error)
            );
            if settle_attempt_receipt(runtime, node_id, attempt_index, "failed", false, &reason)
                .is_err()
            {
                fail_in_memory_after_persistence_error(runtime);
            }
            return NativeDagAttemptOutcome::SchedulerFailure;
        }
    };
    if start.state != "running" {
        clear_active_request(runtime);
        let cleanup_verified = verified_cleanup(&start);
        let state = if start.state == "cleanup-required" {
            "cleanup-required"
        } else {
            "failed"
        };
        if settle_attempt_receipt(
            runtime,
            node_id,
            attempt_index,
            state,
            cleanup_verified,
            "native start returned a terminal result",
        )
        .is_err()
        {
            fail_in_memory_after_persistence_error(runtime);
            return NativeDagAttemptOutcome::SchedulerFailure;
        }
        return if state == "cleanup-required" || !cleanup_verified {
            NativeDagAttemptOutcome::CleanupRequired
        } else {
            NativeDagAttemptOutcome::Failed { cleanup_verified }
        };
    }

    loop {
        if runtime.cancel_requested.load(Ordering::SeqCst) {
            let _ = agentique_runner_cancel(request.clone());
        }
        match agentique_runner_status(request.clone()) {
            Ok(status) if status.state == "running" || status.state == "canceling" => {
                thread::sleep(NATIVE_RUN_POLL_INTERVAL);
            }
            Ok(status) => {
                clear_active_request(runtime);
                let cleanup_verified = verified_cleanup(&status);
                let state = status.state.as_str();
                let reason = match state {
                    "succeeded" => "native run succeeded with terminal evidence",
                    "canceled" => "native run was canceled",
                    "cleanup-required" => "native run requires manual cleanup",
                    _ => "native run reached a non-success terminal",
                };
                if settle_attempt_receipt(
                    runtime,
                    node_id,
                    attempt_index,
                    state,
                    cleanup_verified,
                    reason,
                )
                .is_err()
                {
                    fail_in_memory_after_persistence_error(runtime);
                    return NativeDagAttemptOutcome::SchedulerFailure;
                }
                return match state {
                    "succeeded" if cleanup_verified => NativeDagAttemptOutcome::Succeeded,
                    "canceled" => NativeDagAttemptOutcome::Canceled,
                    "cleanup-required" => NativeDagAttemptOutcome::CleanupRequired,
                    "failed" | "timed-out" if cleanup_verified => {
                        NativeDagAttemptOutcome::Failed { cleanup_verified }
                    }
                    _ => NativeDagAttemptOutcome::CleanupRequired,
                };
            }
            Err(error) => {
                clear_active_request(runtime);
                let reason = format!("native status failed: {}", redact_runner_text(&error));
                if settle_attempt_receipt(
                    runtime,
                    node_id,
                    attempt_index,
                    "cleanup-required",
                    false,
                    &reason,
                )
                .is_err()
                {
                    fail_in_memory_after_persistence_error(runtime);
                    return NativeDagAttemptOutcome::SchedulerFailure;
                }
                return NativeDagAttemptOutcome::CleanupRequired;
            }
        }
    }
}

fn verified_cleanup(receipt: &super::RunnerCommandReceipt) -> bool {
    receipt.cleanup_recovery.as_ref().is_some_and(|cleanup| {
        cleanup.process_tree_cleanup && cleanup.orphan_count == Some(0) && !cleanup.cleanup_required
    })
}

fn settle_attempt_receipt(
    runtime: &Arc<NativeDagRuntimeRecord>,
    node_id: &str,
    attempt_index: usize,
    state: &str,
    cleanup_verified: bool,
    reason: &str,
) -> Result<(), String> {
    persist_transition(runtime, |receipt| {
        receipt.active_node_id = None;
        if let Some(node) = receipt
            .nodes
            .iter_mut()
            .find(|node| node.node_id == node_id)
        {
            node.active_attempt_index = None;
            node.terminal_run_id = node
                .attempts
                .get(attempt_index)
                .map(|item| item.run_id.clone());
            if let Some(item) = node.attempts.get_mut(attempt_index) {
                item.state = state.to_string();
                item.cleanup_verified = cleanup_verified;
                item.reason = reason.to_string();
            }
            if state == "succeeded" {
                node.state = "succeeded".to_string();
                node.reason = "node completed through the fixed native runner".to_string();
            } else if state == "cleanup-required" {
                node.state = "cleanup-required".to_string();
                node.reason = "node cleanup is unverified".to_string();
            }
        }
    })
}

fn clear_active_request(runtime: &Arc<NativeDagRuntimeRecord>) {
    if let Ok(mut active) = runtime.active_request.lock() {
        *active = None;
    }
}

fn cancel_remaining_nodes(runtime: &Arc<NativeDagRuntimeRecord>) -> Result<(), String> {
    persist_transition(runtime, |receipt| {
        receipt.active_node_id = None;
        for node in &mut receipt.nodes {
            if !matches!(
                node.state.as_str(),
                "succeeded" | "failed" | "skipped" | "cleanup-required"
            ) {
                node.state = "canceled".to_string();
                node.active_attempt_index = None;
                node.reason = "scheduler cancellation prevented further launch".to_string();
            }
        }
    })
}

fn finish_workflow(runtime: &Arc<NativeDagRuntimeRecord>, state: &str, reason: &str) {
    if persist_transition(runtime, |receipt| {
        receipt.state = state.to_string();
        receipt.terminal_state = Some(state.to_string());
        receipt.active_node_id = None;
        receipt.reason = reason.to_string();
    })
    .is_err()
    {
        fail_in_memory_after_persistence_error(runtime);
        return;
    }
    runtime.worker_active.store(false, Ordering::SeqCst);
}

fn fail_scheduler_invariant(runtime: &Arc<NativeDagRuntimeRecord>, reason: &str) {
    finish_workflow(runtime, "failed", reason);
}

fn fail_in_memory_after_persistence_error(runtime: &Arc<NativeDagRuntimeRecord>) {
    // CRITICAL: a failed snapshot commit can never leave in-memory success observable. After a
    // restart, the last non-terminal durable snapshot is recovered as cleanup-required.
    if let Ok(mut receipt) = runtime.receipt.lock() {
        receipt.state = "failed".to_string();
        receipt.terminal_state = Some("failed".to_string());
        receipt.active_node_id = None;
        receipt.reason = "native DAG persistence failed; success is forbidden".to_string();
    }
    runtime.cancel_requested.store(true, Ordering::SeqCst);
    runtime.worker_active.store(false, Ordering::SeqCst);
}

fn persist_transition<F>(runtime: &Arc<NativeDagRuntimeRecord>, mutate: F) -> Result<(), String>
where
    F: FnOnce(&mut NativeDagWorkflowReceipt),
{
    let mut receipt = runtime
        .receipt
        .lock()
        .map_err(|_| "native DAG receipt is unavailable.".to_string())?;
    mutate(&mut receipt);
    receipt.sequence = receipt.sequence.saturating_add(1);
    write_native_dag_snapshot(&receipt)
}

fn native_dag_snapshot_dir(workflow_id: &str) -> Result<PathBuf, String> {
    validate_opaque_id("workflowId", workflow_id)?;
    Ok(native_run_root()?
        .join("workflows")
        .join(workflow_id)
        .join("snapshots"))
}

fn write_native_dag_snapshot(receipt: &NativeDagWorkflowReceipt) -> Result<(), String> {
    validate_native_dag_receipt(receipt)?;
    let snapshot_dir = native_dag_snapshot_dir(&receipt.workflow_id)?;
    if snapshot_dir.exists() {
        reject_native_link(&snapshot_dir)?;
    } else {
        fs::create_dir_all(&snapshot_dir)
            .map_err(|error| format!("failed to create native DAG snapshot root: {error}"))?;
    }
    if receipt.sequence == 0 || receipt.sequence > MAX_NATIVE_DAG_SNAPSHOTS {
        return Err("native DAG exceeds its bounded snapshot count.".to_string());
    }
    let bytes = serde_json::to_vec_pretty(receipt)
        .map_err(|_| "native DAG snapshot could not be serialized safely.".to_string())?;
    if bytes.is_empty()
        || bytes.len() > MAX_NATIVE_DAG_SNAPSHOT_BYTES
        || contains_unsafe_projection_material(&bytes)
    {
        return Err("native DAG snapshot exceeds its safety boundary.".to_string());
    }
    let final_path = snapshot_dir.join(format!("{:04}.json", receipt.sequence));
    if final_path.exists() {
        return Err("native DAG snapshot sequence already exists.".to_string());
    }
    let temporary = snapshot_dir.join(format!(
        ".{:04}.tmp-{}-{}",
        receipt.sequence,
        std::process::id(),
        native_epoch_millis()
    ));
    write_synced_file(&temporary, &bytes)?;
    fs::rename(&temporary, &final_path).map_err(|error| {
        let _ = fs::remove_file(&temporary);
        format!("failed to atomically commit native DAG snapshot: {error}")
    })
}

fn read_native_dag_snapshots(workflow_id: &str) -> Result<Vec<NativeDagWorkflowReceipt>, String> {
    let snapshot_dir = native_dag_snapshot_dir(workflow_id)?;
    if !snapshot_dir.exists() {
        return Ok(Vec::new());
    }
    reject_native_link(&snapshot_dir)?;
    let mut paths = fs::read_dir(&snapshot_dir)
        .map_err(|error| format!("failed to read native DAG snapshots: {error}"))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.extension().and_then(|value| value.to_str()) == Some("json"))
        .collect::<Vec<_>>();
    paths.sort();
    if paths.len() > MAX_NATIVE_DAG_SNAPSHOTS {
        return Err("native DAG durable history exceeds its bounded snapshot count.".to_string());
    }
    let mut receipts = Vec::with_capacity(paths.len());
    for (index, path) in paths.into_iter().enumerate() {
        reject_native_link(&path)?;
        let metadata = fs::metadata(&path)
            .map_err(|error| format!("failed to inspect native DAG snapshot: {error}"))?;
        if !metadata.is_file() || metadata.len() as usize > MAX_NATIVE_DAG_SNAPSHOT_BYTES {
            return Err("native DAG snapshot is not a bounded regular file.".to_string());
        }
        let bytes = fs::read(&path)
            .map_err(|error| format!("failed to read native DAG snapshot: {error}"))?;
        if contains_unsafe_projection_material(&bytes) {
            return Err("native DAG snapshot contains unsafe material.".to_string());
        }
        let receipt: NativeDagWorkflowReceipt = serde_json::from_slice(&bytes)
            .map_err(|_| "native DAG snapshot is malformed.".to_string())?;
        validate_native_dag_receipt(&receipt)?;
        if receipt.workflow_id != workflow_id || receipt.sequence != index + 1 {
            return Err("native DAG snapshot scope or sequence is invalid.".to_string());
        }
        receipts.push(receipt);
    }
    Ok(receipts)
}

fn validate_native_dag_receipt(receipt: &NativeDagWorkflowReceipt) -> Result<(), String> {
    if receipt.schema_version != NATIVE_DAG_SCHEMA
        || !receipt.redacted
        || receipt.replays_external_effects
        || receipt.nodes.is_empty()
        || receipt.nodes.len() > MAX_NATIVE_DAG_NODES
        || receipt.topological_order.len() != receipt.nodes.len()
    {
        return Err("native DAG receipt violates its fixed schema boundary.".to_string());
    }
    for (name, value) in [
        ("workflowId", &receipt.workflow_id),
        ("resourceId", &receipt.resource_id),
        ("sessionId", &receipt.session_id),
    ] {
        validate_opaque_id(name, value)?;
    }
    let allowed_workflow_states = [
        "queued",
        "running",
        "canceling",
        "paused-approval",
        "succeeded",
        "failed",
        "denied",
        "canceled",
        "cleanup-required",
    ];
    if !allowed_workflow_states.contains(&receipt.state.as_str()) {
        return Err("native DAG receipt contains an unknown workflow state.".to_string());
    }
    if is_workflow_terminal(&receipt.state)
        != receipt
            .terminal_state
            .as_deref()
            .is_some_and(|state| state == receipt.state)
    {
        return Err("native DAG terminal state is contradictory.".to_string());
    }
    let mut nodes = HashSet::new();
    let allowed_node_states = [
        "queued",
        "running",
        "retrying",
        "pending-approval",
        "succeeded",
        "failed",
        "denied",
        "skipped",
        "canceled",
        "cleanup-required",
    ];
    let allowed_attempt_states = [
        "queued",
        "running",
        "succeeded",
        "failed",
        "timed-out",
        "canceled",
        "cleanup-required",
    ];
    for node in &receipt.nodes {
        validate_opaque_id("nodeId", &node.node_id)?;
        if !nodes.insert(node.node_id.clone())
            || node.attempts.is_empty()
            || node.attempts.len() > MAX_NATIVE_DAG_ATTEMPTS_PER_NODE
            || !allowed_node_states.contains(&node.state.as_str())
        {
            return Err("native DAG receipt contains duplicate or unbounded nodes.".to_string());
        }
        for attempt in &node.attempts {
            validate_opaque_id("runId", &attempt.run_id)?;
            if !allowed_attempt_states.contains(&attempt.state.as_str()) {
                return Err("native DAG receipt contains an unknown attempt state.".to_string());
            }
        }
        if let Some(interrupt) = &node.interrupt {
            validate_opaque_id("interruptId", &interrupt.interrupt_id)?;
            validate_opaque_id("runId", &interrupt.run_id)?;
            validate_opaque_id("proposalId", &interrupt.proposal_id)?;
            if interrupt.proposal_digest.len() != 64
                || interrupt.checkpoint_generation_digest.len() != 64
                || !interrupt
                    .proposal_digest
                    .bytes()
                    .all(|byte| byte.is_ascii_hexdigit())
                || !interrupt
                    .checkpoint_generation_digest
                    .bytes()
                    .all(|byte| byte.is_ascii_hexdigit())
                || ![
                    "pending",
                    "approved",
                    "denied",
                    "canceled",
                    "cleanup-required",
                ]
                .contains(&interrupt.state.as_str())
            {
                return Err("native DAG interrupt receipt violates its bounded schema.".to_string());
            }
        }
    }
    let ordered = receipt
        .topological_order
        .iter()
        .cloned()
        .collect::<HashSet<_>>();
    if ordered != nodes
        || (receipt.state == "succeeded"
            && receipt.nodes.iter().any(|node| node.state != "succeeded"))
    {
        return Err("native DAG receipt ordering or success truth is invalid.".to_string());
    }
    Ok(())
}

fn recover_interrupted_native_dag(
    request: NativeDagCommandRequest,
) -> Result<NativeDagWorkflowReceipt, String> {
    let mut receipts = read_native_dag_snapshots(&request.workflow_id)?;
    let mut receipt = receipts
        .pop()
        .ok_or_else(|| "workflowId does not have durable native scheduler state.".to_string())?;
    ensure_workflow_scope(&receipt, &request)?;
    if is_workflow_terminal(&receipt.state) {
        return Ok(receipt);
    }
    // CRITICAL: native scheduler state cannot prove a live process after coordinator loss.
    // Never resume or retry this graph; persist cleanup-required for manual reconciliation.
    receipt.sequence = receipt.sequence.saturating_add(1);
    receipt.state = "cleanup-required".to_string();
    receipt.terminal_state = Some("cleanup-required".to_string());
    receipt.reason = "native scheduler coordinator is unavailable after restart".to_string();
    if let Some(active_node_id) = receipt.active_node_id.clone() {
        if let Some(node) = receipt
            .nodes
            .iter_mut()
            .find(|node| node.node_id == active_node_id)
        {
            node.state = "cleanup-required".to_string();
            node.reason = "active node effect is uncertain after restart".to_string();
        }
    }
    for node in &mut receipt.nodes {
        if node.state == "pending-approval" {
            node.state = "cleanup-required".to_string();
            node.reason = "approval interrupt coordinator is unavailable after restart".to_string();
            if let Some(interrupt) = node.interrupt.as_mut() {
                interrupt.state = "cleanup-required".to_string();
                interrupt.reason = "persisted interrupt is not replay authority".to_string();
            }
        }
    }
    receipt.active_node_id = None;
    write_native_dag_snapshot(&receipt)?;
    Ok(receipt)
}

fn ensure_workflow_scope(
    receipt: &NativeDagWorkflowReceipt,
    request: &NativeDagCommandRequest,
) -> Result<(), String> {
    if receipt.workflow_id != request.workflow_id
        || receipt.resource_id != request.resource_id
        || receipt.session_id != request.session_id
    {
        return Err(
            "workflowId is not scoped to the supplied resourceId and sessionId.".to_string(),
        );
    }
    Ok(())
}

fn is_workflow_terminal(state: &str) -> bool {
    matches!(
        state,
        "succeeded" | "failed" | "denied" | "canceled" | "cleanup-required"
    )
}

fn native_dag_records() -> &'static Mutex<HashMap<String, Arc<NativeDagRuntimeRecord>>> {
    static RECORDS: OnceLock<Mutex<HashMap<String, Arc<NativeDagRuntimeRecord>>>> = OnceLock::new();
    RECORDS.get_or_init(|| Mutex::new(HashMap::new()))
}

#[cfg(test)]
fn reset_native_dag_records_for_tests() {
    native_dag_records()
        .lock()
        .expect("native DAG record lock")
        .clear();
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        agentique_runner_decide_approval, agentique_runner_prepare,
        expire_native_permission_grant_for_tests, native_approval_proposal_records,
        native_test_lock, native_working_set_scope_dir, reset_runner_records_for_tests,
        revoke_native_permission_grant_for_tests, NativeApprovalDecisionReceipt,
        NativeApprovalDecisionRequest, APPROVED_ADAPTER_ID, APPROVED_PERMISSION_PROFILE_ID,
        NODE_ADAPTER_ID, NODE_ADAPTER_PERMISSION_PROFILE_ID,
    };
    use std::time::{Duration, Instant};

    fn test_mode_selector(run_id: &str) -> NativeAdapterTestMode {
        if run_id.contains(".fail") {
            NativeAdapterTestMode::ExitFailure
        } else if run_id.contains(".sleep") {
            NativeAdapterTestMode::Sleep
        } else {
            NativeAdapterTestMode::Success
        }
    }

    fn prepare_attempt(
        run_id: &str,
        adapter_id: &str,
        profile_id: &str,
    ) -> NativeDagAttemptRequest {
        let resource_id = "resource.native-dag";
        let session_id = "session.native-dag";
        let prepare = agentique_runner_prepare(RunnerCommandRequest {
            resource_id: resource_id.to_string(),
            session_id: session_id.to_string(),
            run_id: run_id.to_string(),
            command_id: Some(format!("command.prepare-{run_id}")),
            adapter_id: Some(adapter_id.to_string()),
            approval_id: None,
            permission_profile_id: Some(profile_id.to_string()),
            permission_grant_id: None,
        })
        .expect("scheduler attempt should prepare");
        let proposal_id = prepare.approval_id.expect("native proposal id");
        let proposal_digest = native_approval_proposal_records()
            .lock()
            .expect("proposal store lock")
            .get(&proposal_id)
            .expect("native proposal")
            .proposal_digest
            .clone();
        let decision = agentique_runner_decide_approval(NativeApprovalDecisionRequest {
            resource_id: resource_id.to_string(),
            session_id: session_id.to_string(),
            run_id: run_id.to_string(),
            proposal_id: proposal_id.clone(),
            proposal_digest,
            decision: "approved".to_string(),
            actor_id: "actor.local-user".to_string(),
        })
        .expect("scheduler attempt should receive explicit approval");
        NativeDagAttemptRequest {
            run_id: run_id.to_string(),
            command_id: format!("command.start-{run_id}"),
            adapter_id: adapter_id.to_string(),
            approval_id: proposal_id,
            permission_profile_id: profile_id.to_string(),
            permission_grant_id: Some(
                decision
                    .permission_grant
                    .expect("one-use scheduler grant")
                    .grant_id,
            ),
        }
    }

    fn prepare_pending_attempt(
        run_id: &str,
        adapter_id: &str,
        profile_id: &str,
    ) -> NativeDagAttemptRequest {
        let prepare = agentique_runner_prepare(RunnerCommandRequest {
            resource_id: "resource.native-dag".to_string(),
            session_id: "session.native-dag".to_string(),
            run_id: run_id.to_string(),
            command_id: Some(format!("command.prepare-{run_id}")),
            adapter_id: Some(adapter_id.to_string()),
            approval_id: None,
            permission_profile_id: Some(profile_id.to_string()),
            permission_grant_id: None,
        })
        .expect("interrupt attempt should prepare");
        NativeDagAttemptRequest {
            run_id: run_id.to_string(),
            command_id: format!("command.start-{run_id}"),
            adapter_id: adapter_id.to_string(),
            approval_id: prepare.approval_id.expect("native interrupt proposal id"),
            permission_profile_id: profile_id.to_string(),
            permission_grant_id: None,
        }
    }

    fn interrupt_node(
        node_id: &str,
        depends_on: &[&str],
        attempt: NativeDagAttemptRequest,
    ) -> NativeDagNodeRequest {
        NativeDagNodeRequest {
            node_id: node_id.to_string(),
            node_type: "approval-interrupt".to_string(),
            interrupt_id: Some(format!("interrupt.{node_id}")),
            depends_on: depends_on.iter().map(|value| value.to_string()).collect(),
            max_retries: 0,
            attempts: vec![attempt],
        }
    }

    fn decide_interrupt(
        receipt: &NativeDagWorkflowReceipt,
        decision: &str,
    ) -> NativeApprovalDecisionReceipt {
        let interrupt = receipt
            .nodes
            .iter()
            .find_map(|node| node.interrupt.as_ref())
            .expect("pending interrupt receipt");
        agentique_runner_decide_approval(NativeApprovalDecisionRequest {
            resource_id: receipt.resource_id.clone(),
            session_id: receipt.session_id.clone(),
            run_id: interrupt.run_id.clone(),
            proposal_id: interrupt.proposal_id.clone(),
            proposal_digest: interrupt.proposal_digest.clone(),
            decision: decision.to_string(),
            actor_id: "actor.local-user".to_string(),
        })
        .expect("explicit interrupt decision")
    }

    fn resume_request(
        receipt: &NativeDagWorkflowReceipt,
        decision: &NativeApprovalDecisionReceipt,
    ) -> NativeDagResumeRequest {
        let node = receipt
            .nodes
            .iter()
            .find(|node| node.interrupt.is_some())
            .expect("interrupt node");
        let interrupt = node.interrupt.as_ref().expect("interrupt receipt");
        NativeDagResumeRequest {
            workflow_id: receipt.workflow_id.clone(),
            resource_id: receipt.resource_id.clone(),
            session_id: receipt.session_id.clone(),
            command_id: Some(format!("command.resume-{}", receipt.workflow_id)),
            node_id: node.node_id.clone(),
            run_id: interrupt.run_id.clone(),
            interrupt_id: interrupt.interrupt_id.clone(),
            checkpoint_generation_digest: interrupt.checkpoint_generation_digest.clone(),
            proposal_id: interrupt.proposal_id.clone(),
            proposal_digest: interrupt.proposal_digest.clone(),
            decision_id: decision.decision_id.clone(),
            decision: decision.decision.clone(),
            permission_grant_id: decision
                .permission_grant
                .as_ref()
                .map(|grant| grant.grant_id.clone()),
        }
    }

    fn node(
        node_id: &str,
        depends_on: &[&str],
        attempts: Vec<NativeDagAttemptRequest>,
    ) -> NativeDagNodeRequest {
        NativeDagNodeRequest {
            node_id: node_id.to_string(),
            node_type: "fixed-adapter".to_string(),
            interrupt_id: None,
            depends_on: depends_on.iter().map(|value| value.to_string()).collect(),
            max_retries: attempts.len() - 1,
            attempts,
        }
    }

    fn workflow(workflow_id: &str, nodes: Vec<NativeDagNodeRequest>) -> NativeDagStartRequest {
        NativeDagStartRequest {
            workflow_id: workflow_id.to_string(),
            resource_id: "resource.native-dag".to_string(),
            session_id: "session.native-dag".to_string(),
            command_id: Some(format!("command.start-{workflow_id}")),
            nodes,
        }
    }

    fn command(workflow_id: &str, action: &str) -> NativeDagCommandRequest {
        NativeDagCommandRequest {
            workflow_id: workflow_id.to_string(),
            resource_id: "resource.native-dag".to_string(),
            session_id: "session.native-dag".to_string(),
            command_id: Some(format!("command.{action}-{workflow_id}")),
        }
    }

    fn wait_for_workflow(workflow_id: &str, states: &[&str]) -> NativeDagWorkflowReceipt {
        let started = Instant::now();
        loop {
            let receipt = agentique_scheduler_status(command(workflow_id, "status"))
                .expect("scheduler status should be readable");
            if states.contains(&receipt.state.as_str()) {
                let inactive = native_dag_records()
                    .lock()
                    .expect("scheduler record lock")
                    .get(workflow_id)
                    .is_none_or(|runtime| !runtime.worker_active.load(Ordering::SeqCst));
                if inactive {
                    return receipt;
                }
            }
            assert!(
                started.elapsed() < Duration::from_secs(15),
                "workflow {workflow_id} did not reach {states:?}"
            );
            thread::sleep(Duration::from_millis(10));
        }
    }

    fn begin_test() {
        reset_runner_records_for_tests();
        reset_native_dag_records_for_tests();
    }

    #[test]
    fn native_dag_executes_branch_merge_in_stable_order_and_persists_success() {
        let _guard = native_test_lock().lock().expect("native test lock");
        begin_test();
        let workflow_id = "workflow.native-dag-success";
        let request = workflow(
            workflow_id,
            vec![
                node(
                    "node.a",
                    &[],
                    vec![prepare_attempt(
                        "run.native-dag-success-a",
                        APPROVED_ADAPTER_ID,
                        APPROVED_PERMISSION_PROFILE_ID,
                    )],
                ),
                node(
                    "node.c",
                    &["node.a"],
                    vec![prepare_attempt(
                        "run.native-dag-success-c",
                        NODE_ADAPTER_ID,
                        NODE_ADAPTER_PERMISSION_PROFILE_ID,
                    )],
                ),
                node(
                    "node.b",
                    &["node.a"],
                    vec![prepare_attempt(
                        "run.native-dag-success-b",
                        APPROVED_ADAPTER_ID,
                        APPROVED_PERMISSION_PROFILE_ID,
                    )],
                ),
                node(
                    "node.d",
                    &["node.b", "node.c"],
                    vec![prepare_attempt(
                        "run.native-dag-success-d",
                        NODE_ADAPTER_ID,
                        NODE_ADAPTER_PERMISSION_PROFILE_ID,
                    )],
                ),
            ],
        );
        let admitted = start_native_dag(request, test_mode_selector).expect("DAG admission");
        assert_eq!(
            admitted.topological_order,
            ["node.a", "node.b", "node.c", "node.d"]
        );
        let terminal = wait_for_workflow(workflow_id, &["succeeded"]);
        assert_eq!(terminal.terminal_state.as_deref(), Some("succeeded"));
        assert!(terminal.nodes.iter().all(|node| node.state == "succeeded"));
        assert!(terminal
            .nodes
            .iter()
            .all(|node| node.attempts[0].cleanup_verified));
        let durable = read_native_dag_snapshots(workflow_id).expect("durable DAG snapshots");
        assert_eq!(
            durable.last().map(|item| item.state.as_str()),
            Some("succeeded")
        );
        assert_eq!(
            durable.last().map(|item| item.sequence),
            Some(durable.len())
        );
    }

    #[test]
    fn native_dag_retries_only_with_a_distinct_preapproved_attempt() {
        let _guard = native_test_lock().lock().expect("native test lock");
        begin_test();
        let workflow_id = "workflow.native-dag-retry";
        let request = workflow(
            workflow_id,
            vec![node(
                "node.retry",
                &[],
                vec![
                    prepare_attempt(
                        "run.native-dag-retry.fail",
                        NODE_ADAPTER_ID,
                        NODE_ADAPTER_PERMISSION_PROFILE_ID,
                    ),
                    prepare_attempt(
                        "run.native-dag-retry.success",
                        NODE_ADAPTER_ID,
                        NODE_ADAPTER_PERMISSION_PROFILE_ID,
                    ),
                ],
            )],
        );
        start_native_dag(request, test_mode_selector).expect("retry DAG admission");
        let terminal = wait_for_workflow(workflow_id, &["succeeded"]);
        let node = &terminal.nodes[0];
        assert_eq!(node.retry_count, 1);
        assert_eq!(node.attempts[0].state, "failed");
        assert!(node.attempts[0].cleanup_verified);
        assert_eq!(node.attempts[1].state, "succeeded");
        assert_ne!(node.attempts[0].run_id, node.attempts[1].run_id);
    }

    #[test]
    fn native_dag_skips_failed_dependencies_but_runs_independent_nodes() {
        let _guard = native_test_lock().lock().expect("native test lock");
        begin_test();
        let workflow_id = "workflow.native-dag-failure";
        let request = workflow(
            workflow_id,
            vec![
                node(
                    "node.a",
                    &[],
                    vec![prepare_attempt(
                        "run.native-dag-failure.fail",
                        APPROVED_ADAPTER_ID,
                        APPROVED_PERMISSION_PROFILE_ID,
                    )],
                ),
                node(
                    "node.b",
                    &["node.a"],
                    vec![prepare_attempt(
                        "run.native-dag-failure-skipped",
                        APPROVED_ADAPTER_ID,
                        APPROVED_PERMISSION_PROFILE_ID,
                    )],
                ),
                node(
                    "node.c",
                    &[],
                    vec![prepare_attempt(
                        "run.native-dag-failure-independent",
                        NODE_ADAPTER_ID,
                        NODE_ADAPTER_PERMISSION_PROFILE_ID,
                    )],
                ),
            ],
        );
        start_native_dag(request, test_mode_selector).expect("failure DAG admission");
        let terminal = wait_for_workflow(workflow_id, &["failed"]);
        let states = terminal
            .nodes
            .iter()
            .map(|node| (node.node_id.as_str(), node.state.as_str()))
            .collect::<HashMap<_, _>>();
        assert_eq!(states.get("node.a"), Some(&"failed"));
        assert_eq!(states.get("node.b"), Some(&"skipped"));
        assert_eq!(states.get("node.c"), Some(&"succeeded"));
        assert_ne!(terminal.terminal_state.as_deref(), Some("succeeded"));
    }

    #[test]
    fn native_dag_cancel_stops_the_active_run_and_prevents_later_launch() {
        let _guard = native_test_lock().lock().expect("native test lock");
        begin_test();
        let workflow_id = "workflow.native-dag-cancel";
        let request = workflow(
            workflow_id,
            vec![
                node(
                    "node.a",
                    &[],
                    vec![prepare_attempt(
                        "run.native-dag-cancel.sleep",
                        NODE_ADAPTER_ID,
                        NODE_ADAPTER_PERMISSION_PROFILE_ID,
                    )],
                ),
                node(
                    "node.b",
                    &["node.a"],
                    vec![prepare_attempt(
                        "run.native-dag-cancel-never",
                        APPROVED_ADAPTER_ID,
                        APPROVED_PERMISSION_PROFILE_ID,
                    )],
                ),
            ],
        );
        start_native_dag(request, test_mode_selector).expect("cancel DAG admission");
        let started = Instant::now();
        loop {
            let status = agentique_scheduler_status(command(workflow_id, "status"))
                .expect("active DAG status");
            if status.active_node_id.as_deref() == Some("node.a") {
                break;
            }
            assert!(started.elapsed() < Duration::from_secs(5));
            thread::sleep(Duration::from_millis(10));
        }
        agentique_scheduler_cancel(command(workflow_id, "cancel")).expect("DAG cancel");
        let terminal = wait_for_workflow(workflow_id, &["canceled"]);
        assert_eq!(terminal.nodes[0].state, "canceled");
        assert_eq!(terminal.nodes[1].state, "canceled");
        let never = crate::runner_records()
            .lock()
            .expect("runner records")
            .get("run.native-dag-cancel-never")
            .expect("prepared later run")
            .state
            .as_str()
            .to_string();
        assert_eq!(never, "pending-approval");
    }

    #[test]
    fn native_dag_rejects_unsupported_cycles_and_duplicate_attempt_authority() {
        let fake_attempt = NativeDagAttemptRequest {
            run_id: "run.native-dag-invalid-a".to_string(),
            command_id: "command.native-dag-invalid-a".to_string(),
            adapter_id: APPROVED_ADAPTER_ID.to_string(),
            approval_id: "approval.native-dag-invalid-a".to_string(),
            permission_profile_id: APPROVED_PERMISSION_PROFILE_ID.to_string(),
            permission_grant_id: Some("grant.native-dag-invalid-a".to_string()),
        };
        let mut handoff = workflow(
            "workflow.native-dag-handoff",
            vec![node("node.a", &[], vec![fake_attempt.clone()])],
        );
        handoff.nodes[0].node_type = "handoff-only".to_string();
        assert!(validate_native_dag_request(&handoff)
            .expect_err("handoff must block")
            .contains("handoff-only"));

        let cycle = workflow(
            "workflow.native-dag-cycle",
            vec![
                node("node.a", &["node.b"], vec![fake_attempt.clone()]),
                node(
                    "node.b",
                    &["node.a"],
                    vec![NativeDagAttemptRequest {
                        run_id: "run.native-dag-invalid-b".to_string(),
                        permission_grant_id: Some("grant.native-dag-invalid-b".to_string()),
                        ..fake_attempt.clone()
                    }],
                ),
            ],
        );
        assert!(validate_native_dag_request(&cycle)
            .expect_err("cycle must block")
            .contains("cycle"));

        let duplicate = workflow(
            "workflow.native-dag-duplicate",
            vec![node(
                "node.a",
                &[],
                vec![fake_attempt.clone(), fake_attempt],
            )],
        );
        assert!(validate_native_dag_request(&duplicate)
            .expect_err("duplicate run/grant must block")
            .contains("duplicate"));
    }

    #[test]
    fn native_dag_restart_recovery_is_cleanup_required_and_never_replays() {
        let _guard = native_test_lock().lock().expect("native test lock");
        begin_test();
        let workflow_id = "workflow.native-dag-recovery";
        let request = workflow(
            workflow_id,
            vec![node(
                "node.a",
                &[],
                vec![NativeDagAttemptRequest {
                    run_id: "run.native-dag-recovery".to_string(),
                    command_id: "command.native-dag-recovery".to_string(),
                    adapter_id: APPROVED_ADAPTER_ID.to_string(),
                    approval_id: "approval.native-dag-recovery".to_string(),
                    permission_profile_id: APPROVED_PERMISSION_PROFILE_ID.to_string(),
                    permission_grant_id: Some("grant.native-dag-recovery".to_string()),
                }],
            )],
        );
        let mut receipt = initial_receipt(&request, vec!["node.a".to_string()]);
        receipt.state = "running".to_string();
        receipt.active_node_id = Some("node.a".to_string());
        receipt.nodes[0].state = "running".to_string();
        write_native_dag_snapshot(&receipt).expect("persist interrupted DAG");
        let recovered = agentique_scheduler_status(command(workflow_id, "status"))
            .expect("recover interrupted DAG");
        assert_eq!(recovered.state, "cleanup-required");
        assert_eq!(
            recovered.terminal_state.as_deref(),
            Some("cleanup-required")
        );
        assert_eq!(recovered.nodes[0].state, "cleanup-required");
        assert!(!recovered.replays_external_effects);
    }

    #[test]
    fn native_approval_interrupt_pauses_before_spawn_and_approved_resume_continues_once() {
        let _guard = native_test_lock().lock().expect("native test lock");
        begin_test();
        let workflow_id = "workflow.native-approval-interrupt-success";
        let request = workflow(
            workflow_id,
            vec![
                node(
                    "node.safe",
                    &[],
                    vec![prepare_attempt(
                        "run.native-approval-interrupt-safe",
                        APPROVED_ADAPTER_ID,
                        APPROVED_PERMISSION_PROFILE_ID,
                    )],
                ),
                interrupt_node(
                    "node.risky",
                    &["node.safe"],
                    prepare_pending_attempt(
                        "run.native-approval-interrupt-risky",
                        NODE_ADAPTER_ID,
                        NODE_ADAPTER_PERMISSION_PROFILE_ID,
                    ),
                ),
            ],
        );
        start_native_dag(request, test_mode_selector).expect("interrupt DAG admission");
        let paused = wait_for_workflow(workflow_id, &["paused-approval"]);
        assert_eq!(paused.nodes[0].state, "succeeded");
        assert_eq!(paused.nodes[1].state, "pending-approval");
        assert_eq!(
            crate::runner_records()
                .lock()
                .expect("runner records")
                .get("run.native-approval-interrupt-risky")
                .expect("risky pending run")
                .state
                .as_str(),
            "pending-approval"
        );
        let decision = decide_interrupt(&paused, "approved");
        let resume = resume_request(&paused, &decision);
        resume_native_dag(resume.clone(), test_mode_selector).expect("approved resume");
        let terminal = wait_for_workflow(workflow_id, &["succeeded"]);
        assert!(terminal.nodes.iter().all(|node| node.state == "succeeded"));
        assert_eq!(
            terminal.nodes[1]
                .interrupt
                .as_ref()
                .map(|interrupt| interrupt.state.as_str()),
            Some("approved")
        );
        assert!(resume_native_dag(resume, test_mode_selector)
            .expect_err("resume replay must fail")
            .contains("not at a resumable"));
        assert_eq!(
            agentique_scheduler_status(command(workflow_id, "status"))
                .expect("terminal status")
                .state,
            "succeeded"
        );
    }

    #[test]
    fn native_approval_interrupt_denial_and_edited_input_launch_nothing() {
        let _guard = native_test_lock().lock().expect("native test lock");
        begin_test();
        let denied_id = "workflow.native-approval-interrupt-denied";
        start_native_dag(
            workflow(
                denied_id,
                vec![interrupt_node(
                    "node.risky",
                    &[],
                    prepare_pending_attempt(
                        "run.native-approval-interrupt-denied",
                        APPROVED_ADAPTER_ID,
                        APPROVED_PERMISSION_PROFILE_ID,
                    ),
                )],
            ),
            test_mode_selector,
        )
        .expect("denial DAG admission");
        let paused = wait_for_workflow(denied_id, &["paused-approval"]);
        let decision = decide_interrupt(&paused, "denied");
        let denied = resume_native_dag(resume_request(&paused, &decision), test_mode_selector)
            .expect("denial should settle");
        assert_eq!(denied.state, "denied");
        assert_eq!(denied.nodes[0].state, "denied");

        begin_test();
        let edited_id = "workflow.native-approval-interrupt-edited";
        let run_id = "run.native-approval-interrupt-edited";
        start_native_dag(
            workflow(
                edited_id,
                vec![interrupt_node(
                    "node.risky",
                    &[],
                    prepare_pending_attempt(
                        run_id,
                        APPROVED_ADAPTER_ID,
                        APPROVED_PERMISSION_PROFILE_ID,
                    ),
                )],
            ),
            test_mode_selector,
        )
        .expect("edited-input DAG admission");
        let paused = wait_for_workflow(edited_id, &["paused-approval"]);
        let decision = decide_interrupt(&paused, "approved");
        fs::write(
            native_working_set_scope_dir(run_id)
                .expect("working-set scope")
                .join("active")
                .join("edited.txt"),
            "changed after approval presentation",
        )
        .expect("edit working input");
        assert!(
            resume_native_dag(resume_request(&paused, &decision), test_mode_selector)
                .expect_err("edited input must fail")
                .contains("edited input")
        );
        assert_eq!(
            agentique_scheduler_status(command(edited_id, "status"))
                .expect("failed edited status")
                .state,
            "failed"
        );
    }

    #[test]
    fn native_approval_interrupt_revoked_grant_and_restart_fail_closed() {
        let _guard = native_test_lock().lock().expect("native test lock");
        begin_test();
        let workflow_id = "workflow.native-approval-interrupt-revoked";
        start_native_dag(
            workflow(
                workflow_id,
                vec![interrupt_node(
                    "node.risky",
                    &[],
                    prepare_pending_attempt(
                        "run.native-approval-interrupt-revoked",
                        APPROVED_ADAPTER_ID,
                        APPROVED_PERMISSION_PROFILE_ID,
                    ),
                )],
            ),
            test_mode_selector,
        )
        .expect("revoked DAG admission");
        let paused = wait_for_workflow(workflow_id, &["paused-approval"]);
        let decision = decide_interrupt(&paused, "approved");
        let grant_id = decision
            .permission_grant
            .as_ref()
            .expect("approved grant")
            .grant_id
            .clone();
        revoke_native_permission_grant_for_tests(&grant_id);
        assert!(
            resume_native_dag(resume_request(&paused, &decision), test_mode_selector)
                .expect_err("revoked grant must fail")
                .contains("revoked")
        );

        begin_test();
        let expired_id = "workflow.native-approval-interrupt-expired";
        start_native_dag(
            workflow(
                expired_id,
                vec![interrupt_node(
                    "node.risky",
                    &[],
                    prepare_pending_attempt(
                        "run.native-approval-interrupt-expired",
                        APPROVED_ADAPTER_ID,
                        APPROVED_PERMISSION_PROFILE_ID,
                    ),
                )],
            ),
            test_mode_selector,
        )
        .expect("expired DAG admission");
        let paused = wait_for_workflow(expired_id, &["paused-approval"]);
        let decision = decide_interrupt(&paused, "approved");
        let grant_id = decision
            .permission_grant
            .as_ref()
            .expect("approved grant")
            .grant_id
            .clone();
        expire_native_permission_grant_for_tests(&grant_id);
        assert!(
            resume_native_dag(resume_request(&paused, &decision), test_mode_selector)
                .expect_err("expired grant must fail")
                .contains("expired")
        );

        begin_test();
        let restart_id = "workflow.native-approval-interrupt-restart";
        start_native_dag(
            workflow(
                restart_id,
                vec![interrupt_node(
                    "node.risky",
                    &[],
                    prepare_pending_attempt(
                        "run.native-approval-interrupt-restart",
                        APPROVED_ADAPTER_ID,
                        APPROVED_PERMISSION_PROFILE_ID,
                    ),
                )],
            ),
            test_mode_selector,
        )
        .expect("restart DAG admission");
        let _paused = wait_for_workflow(restart_id, &["paused-approval"]);
        reset_native_dag_records_for_tests();
        let recovered =
            agentique_scheduler_status(command(restart_id, "status")).expect("restart recovery");
        assert_eq!(recovered.state, "cleanup-required");
        assert_eq!(recovered.nodes[0].state, "cleanup-required");
        assert_eq!(
            recovered.nodes[0]
                .interrupt
                .as_ref()
                .map(|interrupt| interrupt.state.as_str()),
            Some("cleanup-required")
        );
    }
}
