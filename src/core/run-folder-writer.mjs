import fs from "node:fs";
import path from "node:path";
import { createRunFolderManifest, sampleRunFolderInput, validateRunFolderManifest } from "./run-folder.mjs";
import { redactText } from "./secret-vault.mjs";

const fixedNow = "2026-06-12T00:00:00.000Z";
const defaultRootDir = ".tmp/agentique-runs";
const maxLogBytes = 262144;
const maxArtifactBytes = 104857600;
const unsafeRelativePathPattern = /(^[A-Za-z]:[\\/]|^\/|(^|[\\/])\.\.([\\/]|$)|\\)/u;
const unsafeEvidencePattern = /(vault:[a-z][a-zA-Z0-9._-]{2,80}|bearer\s+[A-Za-z0-9._-]{12,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|(?<![A-Za-z])[A-Za-z]:[\\/])/iu;

export function writeRunFolder(manifest = createRunFolderManifest(sampleRunFolderInput), options = {}) {
  const now = isoNow(options);
  const rootDir = normalizeRootDir(options.rootDir ?? defaultRootDir);
  const validation = validateWritableManifest(manifest);
  if (!validation.ok) {
    return { ok: false, files: [], errors: validation.errors };
  }

  const rootAbs = path.resolve(process.cwd(), rootDir);
  const runJson = manifest.runJson;
  const writes = [
    jsonWrite(runJson.paths.runJson, runJson),
    jsonWrite(`${runJson.paths.root}/viewer-metadata.json`, runJson.viewerMetadata),
    jsonWrite(`${runJson.paths.root}/failure.json`, runJson.failureState),
    ...runJson.logs.map((log) => textWrite(`${runJson.paths.logs}/${log.name}`, log.text)),
    ...runJson.outputs.map((output) => jsonWrite(materializeRunPath(runJson.paths.outputs, "outputs", output.path), output)),
    ...runJson.artifacts.map((artifact) => jsonWrite(materializeRunPath(runJson.paths.artifacts, "artifacts", artifact.path), artifact))
  ];

  const errors = [];
  for (const write of writes) {
    const relativePath = safeRelativePath(write.relativePath, errors);
    if (!relativePath) continue;
    const absolutePath = path.resolve(rootAbs, relativePath);
    if (!isInside(rootAbs, absolutePath)) {
      errors.push(issue("run-writer.outside-root", "Run folder write target must stay inside writer root."));
      continue;
    }
    const serialized = typeof write.content === "string" ? write.content : `${JSON.stringify(write.content, null, 2)}\n`;
    if (unsafeEvidencePattern.test(serialized)) {
      errors.push(issue("run-writer.redaction", "Run folder content contains unredacted secret or local path material."));
      continue;
    }
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, serialized, "utf8");
  }

  if (errors.length > 0) {
    return { ok: false, files: [], errors };
  }

  const receipt = {
    schemaVersion: "agentique.runFolderWriteReceipt.v1",
    runId: runJson.runId,
    writtenAt: now,
    root: rootDir,
    files: writes.map((write) => write.relativePath),
    reproducibilityDigest: runJson.reproducibility.inputDigest
  };
  const receiptPath = `${runJson.paths.root}/write-receipt.json`;
  fs.writeFileSync(path.resolve(rootAbs, receiptPath), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");

  return {
    ok: true,
    receipt: { ...receipt, files: [...receipt.files, receiptPath] },
    files: [...receipt.files, receiptPath],
    errors: []
  };
}

export function cleanupRunFolder(input = {}, options = {}) {
  const now = isoNow(options);
  const rootDir = normalizeRootDir(options.rootDir ?? input.rootDir ?? defaultRootDir);
  const runId = safeRunId(input.runId ?? "run-local-001");
  const rootAbs = path.resolve(process.cwd(), rootDir);
  const runRoot = `runs/${runId}`;
  const targets = [`${runRoot}/logs`, `${runRoot}/outputs`, `${runRoot}/artifacts`];
  const removed = [];
  const errors = [];

  for (const target of targets) {
    const safeTarget = safeRelativePath(target, errors);
    if (!safeTarget) continue;
    const absoluteTarget = path.resolve(rootAbs, safeTarget);
    if (!isInside(rootAbs, absoluteTarget)) {
      errors.push(issue("run-writer.cleanup-root", "Cleanup target must stay inside writer root."));
      continue;
    }
    if (fs.existsSync(absoluteTarget)) {
      fs.rmSync(absoluteTarget, { recursive: true, force: true });
      removed.push(safeTarget);
    }
  }

  const receipt = {
    schemaVersion: "agentique.runFolderCleanupReceipt.v1",
    runId,
    cleanedAt: now,
    status: errors.length === 0 ? "cleaned" : "failed",
    idempotent: true,
    removed
  };
  const receiptPath = `${runRoot}/cleanup-receipt.json`;
  const absoluteReceipt = path.resolve(rootAbs, receiptPath);
  if (!isInside(rootAbs, absoluteReceipt)) {
    errors.push(issue("run-writer.cleanup-root", "Cleanup receipt must stay inside writer root."));
  } else {
    fs.mkdirSync(path.dirname(absoluteReceipt), { recursive: true });
    fs.writeFileSync(absoluteReceipt, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  }

  return {
    ok: errors.length === 0,
    receipt: { ...receipt, path: receiptPath },
    errors
  };
}

export function reviewRunFolderWriter(options = {}) {
  const rootDir = options.rootDir ?? ".tmp/run-folder-writer-review";
  fs.rmSync(path.resolve(process.cwd(), rootDir), { recursive: true, force: true });
  const manifest = createRunFolderManifest(sampleRunFolderInput);
  const write = writeRunFolder(manifest, { rootDir, now: fixedNow });
  const cleanup = cleanupRunFolder({ runId: manifest.runJson.runId }, { rootDir, now: fixedNow });
  return {
    schemaVersion: "agentique.runFolderWriterReview.v1",
    ok: write.ok && cleanup.ok,
    write,
    cleanup,
    summary: {
      files: write.files?.length ?? 0,
      cleanupRemoved: cleanup.receipt?.removed?.length ?? 0,
      reproducibilityDigest: write.receipt?.reproducibilityDigest ?? ""
    },
    errors: [...(write.errors ?? []), ...(cleanup.errors ?? [])]
  };
}

function validateWritableManifest(manifest) {
  const errors = [];
  const validation = validateRunFolderManifest(manifest);
  errors.push(...validation.errors.map((error) => issue(error.code, error.message)));
  const runJson = manifest?.runJson ?? {};

  for (const value of Object.values(runJson.paths ?? {})) {
    safeRelativePath(value, errors);
  }
  for (const log of runJson.logs ?? []) {
    if (!safeRelativePath(log.name, errors)) continue;
    if (Buffer.byteLength(String(log.text ?? ""), "utf8") > Number(log.maxBytes ?? maxLogBytes)) {
      errors.push(issue("run-writer.log-size", "Log exceeds bounded byte limit."));
    }
  }
  for (const output of runJson.outputs ?? []) {
    safeRelativePath(output.path, errors);
    if (Number(output.bytes ?? 0) > maxArtifactBytes) {
      errors.push(issue("run-writer.output-size", "Output exceeds bounded byte limit."));
    }
  }
  for (const artifact of runJson.artifacts ?? []) {
    safeRelativePath(artifact.path, errors);
    if (Number(artifact.bytes ?? 0) > maxArtifactBytes) {
      errors.push(issue("run-writer.artifact-size", "Artifact exceeds bounded byte limit."));
    }
  }
  for (const value of [
    JSON.stringify(runJson.logs ?? []),
    JSON.stringify(runJson.outputs ?? []),
    JSON.stringify(runJson.artifacts ?? []),
    JSON.stringify(runJson.failureState ?? {})
  ]) {
    if (unsafeEvidencePattern.test(value)) {
      errors.push(issue("run-writer.redaction", "Writable manifest contains unredacted secret or local path material."));
    }
  }
  return { ok: errors.length === 0, errors };
}

function normalizeRootDir(value) {
  const text = String(value ?? "");
  if (!text.startsWith(".tmp/") || unsafeRelativePathPattern.test(text)) {
    throw new Error("Run folder writer root must be a safe relative .tmp path.");
  }
  return text;
}

function safeRunId(value) {
  const text = String(value ?? "");
  if (!/^[A-Za-z0-9:_-]{3,96}$/u.test(text)) {
    throw new Error("Run id must be a stable identifier.");
  }
  return text;
}

function safeRelativePath(value, errors) {
  const text = String(value ?? "");
  if (text.length === 0 || unsafeRelativePathPattern.test(text)) {
    errors.push(issue("run-writer.unsafe-path", "Run folder paths must be relative, traversal-free, and use forward separators."));
    return null;
  }
  return text;
}

function jsonWrite(relativePath, content) {
  return { relativePath, content };
}

function textWrite(relativePath, content) {
  return { relativePath, content: redactText(String(content ?? "")) };
}

function materializeRunPath(basePath, prefix, relativePath) {
  const text = String(relativePath ?? "");
  return text.startsWith(`${prefix}/`) ? `${basePath}/${text.slice(prefix.length + 1)}` : `${basePath}/${text}`;
}

function isInside(rootAbs, targetAbs) {
  const relative = path.relative(rootAbs, targetAbs);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function isoNow(options = {}) {
  const timestamp = Date.parse(options.now ?? fixedNow);
  if (!Number.isFinite(timestamp)) {
    throw new Error("Timestamp must be a valid ISO date.");
  }
  return new Date(timestamp).toISOString();
}

function issue(code, message) {
  return { code, message: redactText(message) };
}
