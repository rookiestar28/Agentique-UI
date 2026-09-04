use serde_json::Value;
use sha2::{Digest, Sha256};
#[cfg(target_os = "linux")]
use std::io::Read;
#[cfg(target_os = "linux")]
use std::path::Path;
#[cfg(target_os = "linux")]
use std::process::{Command, Stdio};
use std::sync::atomic::AtomicBool;
#[cfg(target_os = "linux")]
use std::sync::atomic::Ordering;
use std::time::Duration;
#[cfg(target_os = "linux")]
use std::time::Instant;

pub(crate) const ADAPTER_ID: &str = "adapter.local-container";
pub(crate) const PERMISSION_PROFILE_ID: &str = "permission.local-container.rootless";
pub(crate) const MANIFEST_ID: &str = "manifest.local-container.v1";
pub(crate) const IMAGE_DIGEST_HEX: &str =
    "b18992999dbe963a45a8a4da40ac2b1975be1a776d939d098c647482bcad5cba";
pub(crate) const IMAGE_REFERENCE: &str = "docker.io/library/python@sha256:b18992999dbe963a45a8a4da40ac2b1975be1a776d939d098c647482bcad5cba";
pub(crate) const IMAGE_ID: &str =
    "sha256:7e666cfcc7bd4c47b26b7a5ec0116d80e9bc5415ea06c0dc0bd117a50e9fa6c6";
pub(crate) const EXPECTED_STDOUT: &str = "Python 3.11.15";
pub(crate) const MAX_OUTPUT_BYTES: usize = 65_536;
const IMAGE_CONFIGURED_ENVIRONMENT: [&str; 5] = [
    "PATH=/usr/local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    "LANG=C.UTF-8",
    "GPG_KEY=A035C8C19219BA821ECEA86B64E628F8D684696D",
    "PYTHON_VERSION=3.11.15",
    "PYTHON_SHA256=272179ddd9a2e41a0fc8e42e33dfbdca0b3711aa5abf372d3f2d51543d09b625",
];

const PODMAN_EXECUTABLE: &str = "/usr/bin/podman";
const DOCKER_EXECUTABLE: &str = "/usr/bin/docker";
const PRODUCT_LABEL: &str = "com.agentique.fixed-rootless=true";
const PROBE_TIMEOUT: Duration = Duration::from_secs(5);
const CLEANUP_TIMEOUT: Duration = Duration::from_secs(10);
const POLL_INTERVAL: Duration = Duration::from_millis(10);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ContainerOutcome {
    Succeeded,
    Failed,
    Canceled,
    TimedOut,
    CleanupRequired,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ContainerExecution {
    pub(crate) launched: bool,
    pub(crate) outcome: ContainerOutcome,
    pub(crate) runtime: String,
    pub(crate) stdout: String,
    pub(crate) stderr: String,
    pub(crate) exit_code: Option<i32>,
    pub(crate) rootless: bool,
    pub(crate) image_digest: String,
    pub(crate) image_id: String,
    pub(crate) cleanup_verified: bool,
    pub(crate) residual_count: Option<usize>,
    pub(crate) environment_keys: Vec<String>,
    pub(crate) failure_code: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct RootlessRuntime {
    kind: &'static str,
    executable: &'static str,
    socket_path: String,
    uid: u32,
}

pub(crate) fn build_fixed_run_args(
    runtime: &str,
    container_name: &str,
) -> Result<Vec<String>, String> {
    if runtime != "docker" && runtime != "podman" {
        return Err("native-container.runtime: runtime is not allowlisted.".to_string());
    }
    if !valid_container_name(container_name) {
        return Err("native-container.name: product-owned container name is invalid.".to_string());
    }
    let mut args = vec![
        "run".to_string(),
        "--rm".to_string(),
        "--pull=never".to_string(),
        format!("--name={container_name}"),
        format!("--label={PRODUCT_LABEL}"),
        "--network=none".to_string(),
        "--read-only".to_string(),
        "--cap-drop=ALL".to_string(),
        "--security-opt=no-new-privileges".to_string(),
        "--user=65532:65532".to_string(),
    ];
    // CRITICAL: Docker's private PID namespace is the no-flag default;
    // --pid=private is Podman-only and makes Docker fail before creation.
    if runtime == "podman" {
        args.push("--pid=private".to_string());
    }
    args.extend([
        "--ipc=private".to_string(),
        "--cgroupns=private".to_string(),
        "--memory=64m".to_string(),
        "--memory-swap=64m".to_string(),
        "--cpus=0.5".to_string(),
        "--pids-limit=32".to_string(),
        "--workdir=/workspace".to_string(),
        IMAGE_ID.to_string(),
        "python".to_string(),
        "--version".to_string(),
    ]);
    Ok(args)
}

pub(crate) fn review_runtime_probe(
    runtime: &str,
    executable: &str,
    uid: u32,
    socket_path: &str,
    json: &str,
) -> Result<(), String> {
    if uid == 0 {
        return Err("native-container.probe-uid: rootless uid must be positive.".to_string());
    }
    let expected_executable = match runtime {
        "podman" => PODMAN_EXECUTABLE,
        "docker" => DOCKER_EXECUTABLE,
        _ => return Err("native-container.probe-runtime: runtime is not allowlisted.".to_string()),
    };
    if executable != expected_executable {
        return Err("native-container.probe-executable: executable path is not fixed.".to_string());
    }
    let expected_socket = socket_path_for(runtime, uid)?;
    if socket_path != expected_socket {
        return Err("native-container.probe-socket: socket is not user-scoped.".to_string());
    }
    let info: Value = serde_json::from_str(json)
        .map_err(|_| "native-container.probe-json: runtime info is malformed.".to_string())?;
    match runtime {
        "docker" => review_docker_info(&info),
        "podman" => review_podman_info(&info, &expected_socket),
        _ => unreachable!(),
    }
}

pub(crate) fn execute_fixed_container(
    run_id: &str,
    cancel_requested: &AtomicBool,
    timeout: Duration,
) -> Result<ContainerExecution, String> {
    #[cfg(not(target_os = "linux"))]
    {
        let _ = (run_id, cancel_requested, timeout);
        return Err(
            "native-container.platform: fixed rootless execution is Linux-native only.".to_string(),
        );
    }
    #[cfg(target_os = "linux")]
    execute_fixed_container_linux(run_id, cancel_requested, timeout)
}

#[cfg(target_os = "linux")]
fn execute_fixed_container_linux(
    run_id: &str,
    cancel_requested: &AtomicBool,
    timeout: Duration,
) -> Result<ContainerExecution, String> {
    let runtime = resolve_rootless_runtime()?;
    inspect_fixed_image(&runtime)?;
    let container_name = container_name_for(run_id);
    let args = build_fixed_run_args(runtime.kind, &container_name)?;
    let run_result = run_bounded_command(&runtime, &args, timeout, cancel_requested);
    let cleanup = cleanup_exact_container(&runtime, &container_name)?;
    let run = match run_result {
        Ok(run) => run,
        Err(error) => {
            let launched = !error.starts_with("native-container.cli-spawn:");
            let outcome = if cleanup.verified {
                ContainerOutcome::Failed
            } else {
                ContainerOutcome::CleanupRequired
            };
            return Ok(ContainerExecution {
                launched,
                outcome,
                runtime: runtime.kind.to_string(),
                stdout: String::new(),
                stderr: String::new(),
                exit_code: None,
                rootless: true,
                image_digest: format!("sha256:{IMAGE_DIGEST_HEX}"),
                image_id: IMAGE_ID.to_string(),
                cleanup_verified: cleanup.verified,
                residual_count: cleanup.residual_count,
                environment_keys: minimal_environment(&runtime)
                    .into_iter()
                    .map(|(key, _)| key)
                    .collect(),
                failure_code: Some(
                    error
                        .split(':')
                        .next()
                        .unwrap_or("native-container.cli")
                        .to_string(),
                ),
            });
        }
    };
    let stdout = String::from_utf8(run.stdout)
        .map_err(|_| "native-container.stdout: output was not UTF-8.".to_string())?
        .trim()
        .to_string();
    let stderr = String::from_utf8(run.stderr)
        .map_err(|_| "native-container.stderr: output was not UTF-8.".to_string())?
        .trim()
        .to_string();
    let mut outcome = if run.canceled {
        ContainerOutcome::Canceled
    } else if run.timed_out {
        ContainerOutcome::TimedOut
    } else if run.code == Some(0) && stdout == EXPECTED_STDOUT {
        ContainerOutcome::Succeeded
    } else {
        ContainerOutcome::Failed
    };
    if !cleanup.verified {
        outcome = ContainerOutcome::CleanupRequired;
    }
    Ok(ContainerExecution {
        launched: true,
        outcome,
        runtime: runtime.kind.to_string(),
        stdout,
        stderr,
        exit_code: run.code,
        rootless: true,
        image_digest: format!("sha256:{IMAGE_DIGEST_HEX}"),
        image_id: IMAGE_ID.to_string(),
        cleanup_verified: cleanup.verified,
        residual_count: cleanup.residual_count,
        environment_keys: minimal_environment(&runtime)
            .into_iter()
            .map(|(key, _)| key)
            .collect(),
        failure_code: match outcome {
            ContainerOutcome::Succeeded => None,
            ContainerOutcome::Canceled => Some("native-container.canceled".to_string()),
            ContainerOutcome::TimedOut => Some("native-container.timeout".to_string()),
            ContainerOutcome::CleanupRequired => {
                Some("native-container.cleanup-required".to_string())
            }
            ContainerOutcome::Failed => Some("native-container.result".to_string()),
        },
    })
}

#[cfg(target_os = "linux")]
fn resolve_rootless_runtime() -> Result<RootlessRuntime, String> {
    let uid = unsafe { libc::geteuid() };
    if uid == 0 {
        return Err("native-container.probe-uid: rootless execution rejects uid 0.".to_string());
    }
    for (kind, executable) in [("podman", PODMAN_EXECUTABLE), ("docker", DOCKER_EXECUTABLE)] {
        if !Path::new(executable).is_file() {
            continue;
        }
        let socket_path = socket_path_for(kind, uid)?;
        if !Path::new(&socket_path).exists() {
            continue;
        }
        let runtime = RootlessRuntime {
            kind,
            executable,
            socket_path,
            uid,
        };
        let args = info_args(&runtime);
        let output = run_bounded_command(&runtime, &args, PROBE_TIMEOUT, &AtomicBool::new(false))?;
        if output.code != Some(0) {
            continue;
        }
        let json = String::from_utf8(output.stdout)
            .map_err(|_| "native-container.probe-json: runtime info was not UTF-8.".to_string())?;
        if review_runtime_probe(kind, executable, uid, &runtime.socket_path, json.trim()).is_ok() {
            return Ok(runtime);
        }
    }
    Err(
        "native-container.unavailable: no accepted rootless Docker or Podman engine is active."
            .to_string(),
    )
}

#[cfg(target_os = "linux")]
fn inspect_fixed_image(runtime: &RootlessRuntime) -> Result<(), String> {
    let args = runtime_prefix(runtime)
        .into_iter()
        .chain([
            "image".to_string(),
            "inspect".to_string(),
            IMAGE_ID.to_string(),
        ])
        .collect::<Vec<_>>();
    let output = run_bounded_command(runtime, &args, PROBE_TIMEOUT, &AtomicBool::new(false))?;
    if output.code != Some(0) {
        return Err(
            "native-container.image-missing: exact pre-provisioned image is unavailable."
                .to_string(),
        );
    }
    review_fixed_image_metadata(&output.stdout)
}

fn review_fixed_image_metadata(bytes: &[u8]) -> Result<(), String> {
    let value: Value = serde_json::from_slice(bytes)
        .map_err(|_| "native-container.image-json: image metadata is malformed.".to_string())?;
    let image = value
        .as_array()
        .and_then(|items| items.first())
        .unwrap_or(&value);
    let observed_id = image
        .get("Id")
        .or_else(|| image.get("ID"))
        .and_then(Value::as_str);
    let digests = image
        .get("RepoDigests")
        .or_else(|| image.get("RepoDigests"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .collect::<Vec<_>>();
    let configured_environment = image
        .pointer("/Config/Env")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .collect::<Vec<_>>();
    // CRITICAL: offline image loading preserves the content-addressed ID but
    // not a RepoDigest alias. Accept only the fixed ID and exact immutable image
    // environment; if an engine reports source digests, one must match too.
    if observed_id != Some(IMAGE_ID)
        || (!digests.is_empty() && !digests.iter().any(|digest| *digest == IMAGE_REFERENCE))
        || configured_environment != IMAGE_CONFIGURED_ENVIRONMENT
    {
        return Err(
            "native-container.image-identity: image digest, ID, or configured environment does not match."
                .to_string(),
        );
    }
    Ok(())
}

#[cfg(target_os = "linux")]
fn cleanup_exact_container(
    runtime: &RootlessRuntime,
    container_name: &str,
) -> Result<CleanupResult, String> {
    let inspect_args = runtime_prefix(runtime)
        .into_iter()
        .chain([
            "container".to_string(),
            "inspect".to_string(),
            container_name.to_string(),
        ])
        .collect::<Vec<_>>();
    // CRITICAL: cancellation must stop the workload, not the exact-name cleanup pass;
    // reusing the canceled token here can strand the container and violate zero-residual evidence.
    let inspect = run_bounded_command(
        runtime,
        &inspect_args,
        CLEANUP_TIMEOUT,
        &AtomicBool::new(false),
    );
    if matches!(inspect, Ok(ref output) if output.code == Some(0)) {
        let remove_args = runtime_prefix(runtime)
            .into_iter()
            .chain([
                "rm".to_string(),
                "--force".to_string(),
                "--volumes".to_string(),
                container_name.to_string(),
            ])
            .collect::<Vec<_>>();
        let _remove = run_bounded_command(
            runtime,
            &remove_args,
            CLEANUP_TIMEOUT,
            &AtomicBool::new(false),
        );
    }
    let residual_args = runtime_prefix(runtime)
        .into_iter()
        .chain([
            "container".to_string(),
            "ps".to_string(),
            "--all".to_string(),
            "--quiet".to_string(),
            "--filter".to_string(),
            format!("name=^/{container_name}$"),
            "--filter".to_string(),
            format!("label={PRODUCT_LABEL}"),
        ])
        .collect::<Vec<_>>();
    let residual = match run_bounded_command(
        runtime,
        &residual_args,
        CLEANUP_TIMEOUT,
        &AtomicBool::new(false),
    ) {
        Ok(output) => output,
        Err(_) => {
            return Ok(CleanupResult {
                verified: false,
                residual_count: None,
            });
        }
    };
    if residual.code != Some(0) {
        return Ok(CleanupResult {
            verified: false,
            residual_count: None,
        });
    }
    let count = String::from_utf8_lossy(&residual.stdout)
        .lines()
        .filter(|line| !line.trim().is_empty())
        .count();
    Ok(CleanupResult {
        verified: count == 0,
        residual_count: Some(count),
    })
}

#[cfg(target_os = "linux")]
fn run_bounded_command(
    runtime: &RootlessRuntime,
    args: &[String],
    timeout: Duration,
    cancel_requested: &AtomicBool,
) -> Result<BoundedOutput, String> {
    let mut command = Command::new(runtime.executable);
    // CRITICAL: runtime CLIs must not inherit credentials, proxies, HOME, PATH, or caller
    // configuration; widening this environment can redirect the daemon or expose secrets.
    command.env_clear();
    for (key, value) in minimal_environment(runtime) {
        command.env(key, value);
    }
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command.spawn().map_err(|_| {
        "native-container.cli-spawn: fixed runtime CLI could not start.".to_string()
    })?;
    // CRITICAL: drain each pipe on its own thread and retain at most MAX_OUTPUT_BYTES + 1;
    // wait_with_output can grow without bound when the digest-pinned image is compromised.
    let stdout = match child.stdout.take() {
        Some(pipe) => pipe,
        None => {
            let _ = child.kill();
            let _ = child.wait();
            return Err("native-container.cli-output: stdout pipe is unavailable.".to_string());
        }
    };
    let stderr = match child.stderr.take() {
        Some(pipe) => pipe,
        None => {
            let _ = child.kill();
            let _ = child.wait();
            return Err("native-container.cli-output: stderr pipe is unavailable.".to_string());
        }
    };
    let stdout_reader = std::thread::spawn(move || read_bounded_pipe(stdout));
    let stderr_reader = std::thread::spawn(move || read_bounded_pipe(stderr));
    let started = Instant::now();
    let mut timed_out = false;
    let mut canceled = false;
    let status;
    loop {
        if cancel_requested.load(Ordering::SeqCst) {
            canceled = true;
            let _ = child.kill();
            status = child.wait().map_err(|_| {
                "native-container.cli-wait: canceled runtime CLI could not be reaped.".to_string()
            })?;
            break;
        }
        if started.elapsed() >= timeout {
            timed_out = true;
            let _ = child.kill();
            status = child.wait().map_err(|_| {
                "native-container.cli-wait: timed-out runtime CLI could not be reaped.".to_string()
            })?;
            break;
        }
        match child.try_wait() {
            Ok(Some(observed)) => {
                status = observed;
                break;
            }
            Ok(None) => std::thread::sleep(POLL_INTERVAL),
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = stdout_reader.join();
                let _ = stderr_reader.join();
                return Err(
                    "native-container.cli-wait: runtime CLI supervision failed.".to_string()
                );
            }
        }
    }
    let stdout = stdout_reader
        .join()
        .map_err(|_| "native-container.cli-output: stdout reader failed.".to_string())??;
    let stderr = stderr_reader
        .join()
        .map_err(|_| "native-container.cli-output: stderr reader failed.".to_string())??;
    if stdout.len() > MAX_OUTPUT_BYTES || stderr.len() > MAX_OUTPUT_BYTES {
        return Err(
            "native-container.output-limit: runtime output exceeded the fixed bound.".to_string(),
        );
    }
    Ok(BoundedOutput {
        code: status.code(),
        stdout,
        stderr,
        timed_out,
        canceled,
    })
}

#[cfg(target_os = "linux")]
fn read_bounded_pipe<R: Read>(reader: R) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::with_capacity(MAX_OUTPUT_BYTES.min(8_192));
    reader
        .take((MAX_OUTPUT_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| "native-container.cli-output: bounded pipe read failed.".to_string())?;
    Ok(bytes)
}

#[cfg(target_os = "linux")]
fn info_args(runtime: &RootlessRuntime) -> Vec<String> {
    runtime_prefix(runtime)
        .into_iter()
        .chain(if runtime.kind == "docker" {
            vec!["info".to_string(), "--format={{json .}}".to_string()]
        } else {
            vec!["info".to_string(), "--format=json".to_string()]
        })
        .collect()
}

#[cfg(target_os = "linux")]
fn runtime_prefix(runtime: &RootlessRuntime) -> Vec<String> {
    if runtime.kind == "docker" {
        vec![format!("--host=unix://{}", runtime.socket_path)]
    } else {
        vec![format!("--url=unix://{}", runtime.socket_path)]
    }
}

#[cfg(target_os = "linux")]
fn minimal_environment(runtime: &RootlessRuntime) -> Vec<(String, String)> {
    let runtime_dir = format!("/run/user/{}", runtime.uid);
    let mut env = vec![("XDG_RUNTIME_DIR".to_string(), runtime_dir)];
    if runtime.kind == "docker" {
        env.push((
            "DOCKER_HOST".to_string(),
            format!("unix://{}", runtime.socket_path),
        ));
    } else {
        env.push((
            "CONTAINER_HOST".to_string(),
            format!("unix://{}", runtime.socket_path),
        ));
    }
    env
}

fn review_docker_info(info: &Value) -> Result<(), String> {
    if info.get("OSType").and_then(Value::as_str) != Some("linux")
        || info.get("CgroupVersion").and_then(Value::as_str) != Some("2")
    {
        return Err(
            "native-container.probe-docker-platform: Linux cgroup v2 is required.".to_string(),
        );
    }
    let security = info
        .get("SecurityOptions")
        .and_then(Value::as_array)
        .ok_or_else(|| {
            "native-container.probe-docker-security: security options are missing.".to_string()
        })?;
    let has_rootless = security
        .iter()
        .filter_map(Value::as_str)
        .any(|value| value == "name=rootless" || value == "rootless");
    let has_seccomp = security
        .iter()
        .filter_map(Value::as_str)
        .any(|value| value.contains("seccomp"));
    let storage = info
        .get("DockerRootDir")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if !has_rootless || !has_seccomp || !user_scoped_storage(storage, "/.local/share/docker") {
        return Err("native-container.probe-docker-rootless: explicit rootless seccomp and user storage are required.".to_string());
    }
    Ok(())
}

fn review_podman_info(info: &Value, expected_socket: &str) -> Result<(), String> {
    let host = info
        .get("host")
        .ok_or_else(|| "native-container.probe-podman-host: host info is missing.".to_string())?;
    let security = host.get("security").ok_or_else(|| {
        "native-container.probe-podman-security: security info is missing.".to_string()
    })?;
    let socket = host.pointer("/remoteSocket/path").and_then(Value::as_str);
    let storage = info
        .pointer("/store/graphRoot")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if security.get("rootless").and_then(Value::as_bool) != Some(true)
        || security.get("seccompEnabled").and_then(Value::as_bool) != Some(true)
        || host.get("cgroupVersion").and_then(Value::as_str) != Some("v2")
        || socket != Some(expected_socket)
        || !user_scoped_storage(storage, "/.local/share/containers/storage")
    {
        return Err("native-container.probe-podman-rootless: explicit rootless containment evidence is required.".to_string());
    }
    Ok(())
}

fn socket_path_for(runtime: &str, uid: u32) -> Result<String, String> {
    match runtime {
        "docker" => Ok(format!("/run/user/{uid}/docker.sock")),
        "podman" => Ok(format!("/run/user/{uid}/podman/podman.sock")),
        _ => Err("native-container.probe-runtime: runtime is not allowlisted.".to_string()),
    }
}

fn user_scoped_storage(value: &str, suffix: &str) -> bool {
    value.starts_with("/home/") && value.ends_with(suffix) && !value.contains("..")
}

fn valid_container_name(value: &str) -> bool {
    value.len() == 26
        && value.starts_with("agentique-")
        && value[10..]
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

fn container_name_for(run_id: &str) -> String {
    let digest = format!("{:x}", Sha256::digest(run_id.as_bytes()));
    format!("agentique-{}", &digest[..16])
}

#[cfg(target_os = "linux")]
struct BoundedOutput {
    code: Option<i32>,
    stdout: Vec<u8>,
    stderr: Vec<u8>,
    timed_out: bool,
    canceled: bool,
}

#[cfg(target_os = "linux")]
struct CleanupResult {
    verified: bool,
    residual_count: Option<usize>,
}

#[cfg(test)]
mod tests {
    use super::*;

    const DOCKER_INFO: &str = r#"{"OSType":"linux","CgroupVersion":"2","SecurityOptions":["name=seccomp,profile=builtin","name=cgroupns","name=rootless"],"DockerRootDir":"/home/runner/.local/share/docker"}"#;
    const PODMAN_INFO: &str = r#"{"host":{"cgroupVersion":"v2","remoteSocket":{"path":"/run/user/1000/podman/podman.sock"},"security":{"rootless":true,"seccompEnabled":true}},"store":{"graphRoot":"/home/runner/.local/share/containers/storage"}}"#;

    #[test]
    fn native_container_exact_runtime_probes_pass() {
        review_runtime_probe(
            "docker",
            DOCKER_EXECUTABLE,
            1000,
            "/run/user/1000/docker.sock",
            DOCKER_INFO,
        )
        .expect("rootless Docker probe");
        review_runtime_probe(
            "podman",
            PODMAN_EXECUTABLE,
            1000,
            "/run/user/1000/podman/podman.sock",
            PODMAN_INFO,
        )
        .expect("rootless Podman probe");
    }

    #[test]
    fn native_container_rootful_remote_and_mutated_probes_fail_closed() {
        for json in [
            DOCKER_INFO.replace(",\"name=rootless\"", ""),
            DOCKER_INFO.replace("\"2\"", "\"1\""),
            DOCKER_INFO.replace("/home/runner/.local/share/docker", "/var/lib/docker"),
        ] {
            assert!(review_runtime_probe(
                "docker",
                DOCKER_EXECUTABLE,
                1000,
                "/run/user/1000/docker.sock",
                &json
            )
            .is_err());
        }
        assert!(review_runtime_probe(
            "docker",
            DOCKER_EXECUTABLE,
            1000,
            "tcp://127.0.0.1:2375",
            DOCKER_INFO
        )
        .is_err());
        assert!(review_runtime_probe(
            "docker",
            "/usr/local/bin/docker",
            1000,
            "/run/user/1000/docker.sock",
            DOCKER_INFO
        )
        .is_err());
        assert!(review_runtime_probe(
            "docker",
            DOCKER_EXECUTABLE,
            0,
            "/run/user/0/docker.sock",
            DOCKER_INFO
        )
        .is_err());
    }

    #[test]
    fn native_container_launch_vector_is_fixed_and_mount_free() {
        let docker_args =
            build_fixed_run_args("docker", "agentique-0123456789abcdef").expect("fixed args");
        let podman_args =
            build_fixed_run_args("podman", "agentique-0123456789abcdef").expect("fixed args");
        assert!(docker_args.contains(&"--pull=never".to_string()));
        assert!(docker_args.contains(&"--network=none".to_string()));
        assert!(docker_args.contains(&"--read-only".to_string()));
        assert!(docker_args.contains(&"--cap-drop=ALL".to_string()));
        assert_eq!(
            docker_args[docker_args.len() - 3..],
            [IMAGE_ID, "python", "--version"]
        );
        assert!(!docker_args.contains(&"--pid=private".to_string()));
        assert!(podman_args.contains(&"--pid=private".to_string()));
        assert!(!docker_args.iter().any(|arg| arg.contains("mount")
            || arg.contains("volume")
            || arg.contains("publish")
            || arg.contains("device")
            || arg.contains("privileged")
            || arg.starts_with("--env")));
        assert!(build_fixed_run_args("docker", "unsafe/name").is_err());
        assert!(build_fixed_run_args("nerdctl", "agentique-0123456789abcdef").is_err());
    }

    #[test]
    fn native_container_offline_image_metadata_is_content_addressed_and_fail_closed() {
        let fixed_environment = r#"["PATH=/usr/local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin","LANG=C.UTF-8","GPG_KEY=A035C8C19219BA821ECEA86B64E628F8D684696D","PYTHON_VERSION=3.11.15","PYTHON_SHA256=272179ddd9a2e41a0fc8e42e33dfbdca0b3711aa5abf372d3f2d51543d09b625"]"#;
        let offline = format!(
            r#"[{{"Id":"{IMAGE_ID}","RepoDigests":[],"Config":{{"Env":{fixed_environment}}}}}]"#
        );
        review_fixed_image_metadata(offline.as_bytes()).expect("offline exact image ID");

        let fully_named = format!(
            r#"[{{"Id":"{IMAGE_ID}","RepoDigests":["{IMAGE_REFERENCE}"],"Config":{{"Env":{fixed_environment}}}}}]"#
        );
        review_fixed_image_metadata(fully_named.as_bytes()).expect("exact ID and source digest");

        let wrong_id = offline.replace(
            IMAGE_ID,
            "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        );
        assert!(review_fixed_image_metadata(wrong_id.as_bytes()).is_err());
        let conflicting_digest = format!(
            r#"[{{"Id":"{IMAGE_ID}","RepoDigests":["docker.io/library/python@sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"],"Config":{{"Env":{fixed_environment}}}}}]"#
        );
        assert!(review_fixed_image_metadata(conflicting_digest.as_bytes()).is_err());
        assert!(
            review_fixed_image_metadata(offline.replace("LANG=C.UTF-8", "LANG=C").as_bytes())
                .is_err()
        );
        let mut extra_environment: Value =
            serde_json::from_str(&offline).expect("valid image metadata fixture");
        extra_environment[0]["Config"]["Env"]
            .as_array_mut()
            .expect("environment array")
            .push(Value::String("UNEXPECTED=1".to_string()));
        assert!(review_fixed_image_metadata(extra_environment.to_string().as_bytes()).is_err());
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn native_container_live_rootless_smoke_when_enabled() {
        if std::env::var("AGENTIQUE_ROOTLESS_SMOKE").as_deref() != Ok("1") {
            return;
        }
        let success = execute_fixed_container(
            "run.rootless-smoke-success",
            &AtomicBool::new(false),
            Duration::from_secs(20),
        )
        .expect("fixed rootless success execution");
        assert_eq!(success.outcome, ContainerOutcome::Succeeded);
        assert_eq!(success.stdout, EXPECTED_STDOUT);
        assert!(success.cleanup_verified);
        assert_eq!(success.residual_count, Some(0));

        let canceled = execute_fixed_container(
            "run.rootless-smoke-cancel",
            &AtomicBool::new(true),
            Duration::from_secs(20),
        )
        .expect("fixed rootless canceled execution");
        assert_eq!(canceled.outcome, ContainerOutcome::Canceled);
        assert!(canceled.cleanup_verified);
        assert_eq!(canceled.residual_count, Some(0));

        let runtime = resolve_rootless_runtime().expect("accepted rootless runtime");
        inspect_fixed_image(&runtime).expect("fixed image admission");

        let timeout_name = container_name_for("run.rootless-smoke-timeout");
        let mut timeout_args = build_fixed_run_args(runtime.kind, &timeout_name)
            .expect("fixed timeout harness containment");
        timeout_args.truncate(timeout_args.len() - 2);
        timeout_args.extend([
            "python".to_string(),
            "-c".to_string(),
            "import time; time.sleep(30)".to_string(),
        ]);
        let timed_out = run_bounded_command(
            &runtime,
            &timeout_args,
            Duration::from_millis(250),
            &AtomicBool::new(false),
        )
        .expect("bounded timeout harness result");
        assert!(timed_out.timed_out);
        let timeout_cleanup =
            cleanup_exact_container(&runtime, &timeout_name).expect("forced timeout cleanup");
        assert!(timeout_cleanup.verified);
        assert_eq!(timeout_cleanup.residual_count, Some(0));
        let duplicate_cleanup =
            cleanup_exact_container(&runtime, &timeout_name).expect("duplicate cleanup");
        assert!(duplicate_cleanup.verified);
        assert_eq!(duplicate_cleanup.residual_count, Some(0));

        let cancel_name = container_name_for("run.rootless-smoke-inflight-cancel");
        let mut cancel_args = build_fixed_run_args(runtime.kind, &cancel_name)
            .expect("fixed cancellation harness containment");
        cancel_args.truncate(cancel_args.len() - 2);
        cancel_args.extend([
            "python".to_string(),
            "-c".to_string(),
            "import time; time.sleep(30)".to_string(),
        ]);
        let cancel_signal = AtomicBool::new(false);
        let canceled_in_flight = std::thread::scope(|scope| {
            scope.spawn(|| {
                std::thread::sleep(Duration::from_millis(250));
                cancel_signal.store(true, Ordering::SeqCst);
            });
            run_bounded_command(
                &runtime,
                &cancel_args,
                Duration::from_secs(20),
                &cancel_signal,
            )
        })
        .expect("bounded in-flight cancellation result");
        assert!(canceled_in_flight.canceled);
        let cancel_cleanup =
            cleanup_exact_container(&runtime, &cancel_name).expect("forced cancel cleanup");
        assert!(cancel_cleanup.verified);
        assert_eq!(cancel_cleanup.residual_count, Some(0));
    }

    #[test]
    fn native_container_name_is_opaque_and_stable() {
        let first = container_name_for("run.native-container-01");
        assert_eq!(first, container_name_for("run.native-container-01"));
        assert_ne!(first, container_name_for("run.native-container-02"));
        assert!(valid_container_name(&first));
        assert!(!first.contains("native-container"));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn native_container_pipe_capture_is_strictly_bounded() {
        use std::io::Cursor;

        let exact = read_bounded_pipe(Cursor::new(vec![b'x'; MAX_OUTPUT_BYTES]))
            .expect("exactly bounded output");
        let oversized = read_bounded_pipe(Cursor::new(vec![b'x'; MAX_OUTPUT_BYTES + 10]))
            .expect("oversized output sentinel");
        assert_eq!(exact.len(), MAX_OUTPUT_BYTES);
        assert_eq!(oversized.len(), MAX_OUTPUT_BYTES + 1);
    }

    #[cfg(not(target_os = "linux"))]
    #[test]
    fn native_container_non_linux_execution_fails_before_launch() {
        let error = execute_fixed_container(
            "run.non-linux",
            &AtomicBool::new(false),
            Duration::from_secs(1),
        )
        .expect_err("non-Linux execution must be unavailable");
        assert!(error.contains("Linux-native only"));
    }
}
