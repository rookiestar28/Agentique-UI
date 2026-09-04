import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRunFolderManifest, sampleRunFolderInput, validateRunFolderManifest } from "./run-folder.mjs";
import { redactText } from "./secret-vault.mjs";

const fixedNow = "2026-06-12T00:00:00.000Z";
const defaultRootDir = ".tmp/agentique-runs";
const maxLogBytes = 262144;
const maxArtifactBytes = 104857600;
const maxRunBytes = 220 * 1024 * 1024;
const unsafeRelativePathPattern = /(^[A-Za-z]:[\\/]|^\/|(^|[\\/])\.\.([\\/]|$)|\\)/u;
const unsafeEvidencePattern =
  /(vault:[a-z][a-zA-Z0-9._-]{2,80}|bearer\s+[A-Za-z0-9._-]{12,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|cookie=|browser[\\/]cookies|\.[p]lanning(?:[\\/]|\b)|(?:^|[\\/])reference(?:[\\/]|\b)|(?<![A-Za-z])[A-Za-z]:[\\/])/iu;
const writeReceiptName = "write-receipt.json";
const cleanupReceiptName = "cleanup-receipt.json";

export function writeRunFolder(manifest = createRunFolderManifest(sampleRunFolderInput), options = {}) {
  const now = isoNow(options);
  const rootDir = normalizeRootDir(options.rootDir ?? defaultRootDir);
  const validation = validateWritableManifest(manifest);
  if (!validation.ok) {
    return { ok: false, files: [], errors: validation.errors };
  }

  const runJson = manifest.runJson;
  const runId = safeRunId(runJson.runId);
  const runRoot = `runs/${runId}`;
  if (runJson.paths?.root !== runRoot) {
    return { ok: false, files: [], errors: [issue("run-writer.run-root", "Run folder root must match the exact run id.")] };
  }
  const rootAbs = path.resolve(process.cwd(), rootDir);
  const runsAbs = path.resolve(rootAbs, "runs");
  const finalAbs = path.resolve(rootAbs, runRoot);
  const writes = [
    jsonWrite(runJson.paths.runJson, runJson),
    jsonWrite(`${runJson.paths.root}/viewer-metadata.json`, runJson.viewerMetadata),
    jsonWrite(`${runJson.paths.root}/failure.json`, runJson.failureState),
    ...runJson.logs.map((log) => textWrite(`${runJson.paths.logs}/${log.name}`, log.text)),
    ...runJson.outputs.map((output) => jsonWrite(materializeRunPath(runJson.paths.outputs, "outputs", output.path), output)),
    ...runJson.artifacts.map((artifact) => jsonWrite(materializeRunPath(runJson.paths.artifacts, "artifacts", artifact.path), artifact)),
    jsonWrite(`${runRoot}/${cleanupReceiptName}`, {
      schemaVersion: "agentique.runFolderCleanupReceipt.v2",
      runId,
      status: "pending",
      idempotent: true,
      removed: []
    })
  ];

  const errors = [];
  const candidates = [];
  for (const write of writes) {
    const relativePath = safeRelativePath(write.relativePath, errors);
    if (!relativePath) continue;
    if (!relativePath.startsWith(`${runRoot}/`)) {
      errors.push(issue("run-writer.run-root", "Every run file must stay inside the exact run folder."));
      continue;
    }
    const absolutePath = path.resolve(rootAbs, relativePath);
    if (!isInside(finalAbs, absolutePath)) {
      errors.push(issue("run-writer.outside-root", "Run folder write target must stay inside writer root."));
      continue;
    }
    const serialized = typeof write.content === "string" ? write.content : `${JSON.stringify(write.content, null, 2)}\n`;
    if (unsafeEvidencePattern.test(serialized)) {
      errors.push(issue("run-writer.redaction", "Run folder content contains unredacted secret or local path material."));
      continue;
    }
    candidates.push({ relativePath, bytes: Buffer.from(serialized, "utf8") });
  }

  const immutableCandidates = candidates.filter((candidate) => !candidate.relativePath.endsWith(`/${cleanupReceiptName}`));
  const totalBytes = immutableCandidates.reduce((total, candidate) => total + candidate.bytes.length, 0);
  if (totalBytes > maxRunBytes) {
    errors.push(issue("run-writer.total-size", "Run folder exceeds the bounded total byte limit."));
  }
  const uniquePaths = new Set(candidates.map((candidate) => candidate.relativePath));
  if (uniquePaths.size !== candidates.length) {
    errors.push(issue("run-writer.duplicate-path", "Run folder file paths must be unique."));
  }
  if (errors.length > 0) {
    return { ok: false, files: [], errors };
  }

  const receiptPath = `${runRoot}/${writeReceiptName}`;
  const receipt = {
    schemaVersion: "agentique.runFolderWriteReceipt.v2",
    runId,
    writtenAt: now,
    rootRef: "agentique-runs",
    committed: true,
    redacted: true,
    digestAlgorithm: "sha256",
    entries: immutableCandidates
      .map((candidate) => ({
        path: candidate.relativePath,
        bytes: candidate.bytes.length,
        contentDigest: sha256(candidate.bytes)
      }))
      .sort((left, right) => left.path.localeCompare(right.path)),
    mutableRefs: [`${runRoot}/${cleanupReceiptName}`],
    fileCount: immutableCandidates.length,
    totalBytes,
    reproducibilityDigest: runJson.reproducibility.inputDigest,
    receiptRef: receiptPath
  };
  const receiptBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, "utf8");

  if (fs.existsSync(finalAbs)) {
    const existing = validateCommittedRunFolder({ runId }, { rootDir });
    if (existing.ok && existing.receipt.reproducibilityDigest === receipt.reproducibilityDigest) {
      return {
        ok: true,
        idempotent: true,
        receipt: { ...existing.receipt, files: [...existing.receipt.entries.map((entry) => entry.path), ...existing.receipt.mutableRefs, receiptPath] },
        files: [...existing.receipt.entries.map((entry) => entry.path), ...existing.receipt.mutableRefs, receiptPath],
        errors: []
      };
    }
    return { ok: false, files: [], errors: [issue("run-writer.conflict", "A different or invalid committed run folder already exists.")] };
  }

  fs.mkdirSync(runsAbs, { recursive: true });
  const stagingAbs = path.join(runsAbs, `.staging-${runId}-${process.pid}-${randomUUID()}`);
  try {
    fs.mkdirSync(stagingAbs);
    for (const candidate of candidates) {
      const insideRun = candidate.relativePath.slice(runRoot.length + 1);
      writeSyncedFile(path.join(stagingAbs, ...insideRun.split("/")), candidate.bytes);
    }
    writeSyncedFile(path.join(stagingAbs, writeReceiptName), receiptBytes);
    validateCommittedRunFolderAt(stagingAbs, runId, receipt);
    if (options.injectFailureAt === "before-commit") {
      throw new Error("injected failure before run-folder commit");
    }
    // CRITICAL: the complete verified staging directory must be the only source of final authority.
    fs.renameSync(stagingAbs, finalAbs);
  } catch (error) {
    if (fs.existsSync(stagingAbs)) fs.rmSync(stagingAbs, { recursive: true, force: true });
    return { ok: false, files: [], errors: [issue("run-writer.atomic-commit", String(error?.message ?? error))] };
  }

  return {
    ok: true,
    idempotent: false,
    receipt: { ...receipt, files: [...receipt.entries.map((entry) => entry.path), ...receipt.mutableRefs, receiptPath] },
    files: [...receipt.entries.map((entry) => entry.path), ...receipt.mutableRefs, receiptPath],
    errors: []
  };
}

export function validateCommittedRunFolder(input = {}, options = {}) {
  const rootDir = normalizeRootDir(options.rootDir ?? input.rootDir ?? defaultRootDir);
  const runId = safeRunId(input.runId ?? "run-local-001");
  const runAbs = path.resolve(process.cwd(), rootDir, "runs", runId);
  try {
    const receiptPath = path.join(runAbs, writeReceiptName);
    const receiptBytes = readBoundedRegularFile(receiptPath, 65536);
    const receipt = JSON.parse(receiptBytes.toString("utf8"));
    validateCommittedRunFolderAt(runAbs, runId, receipt);
    return { ok: true, receipt, errors: [] };
  } catch (error) {
    return { ok: false, errors: [issue("run-writer.integrity", String(error?.message ?? error))] };
  }
}

export function cleanupRunFolder(input = {}, options = {}) {
  const now = isoNow(options);
  const rootDir = normalizeRootDir(options.rootDir ?? input.rootDir ?? defaultRootDir);
  const runId = safeRunId(input.runId ?? "run-local-001");
  const rootAbs = path.resolve(process.cwd(), rootDir);
  const runRoot = `runs/${runId}`;
  const runAbs = path.resolve(rootAbs, runRoot);
  const targets = [`${runRoot}/logs`, `${runRoot}/outputs`, `${runRoot}/artifacts`];
  const removed = [];
  const errors = [];

  const existingCleanup = readCleanupReceiptIfPresent(runAbs, runId);
  if (existingCleanup?.status === "cleaned" && targets.every((target) => !fs.existsSync(path.resolve(rootAbs, target)))) {
    return { ok: true, receipt: { ...existingCleanup, path: `${runRoot}/${cleanupReceiptName}` }, errors: [] };
  }
  const committed = validateCommittedRunFolder({ runId }, { rootDir });
  if (!committed.ok) {
    return { ok: false, errors: committed.errors };
  }

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
    schemaVersion: "agentique.runFolderCleanupReceipt.v2",
    runId,
    cleanedAt: now,
    status: errors.length === 0 ? "cleaned" : "failed",
    idempotent: true,
    removed
  };
  const receiptPath = `${runRoot}/${cleanupReceiptName}`;
  const absoluteReceipt = path.resolve(rootAbs, receiptPath);
  if (!isInside(rootAbs, absoluteReceipt)) {
    errors.push(issue("run-writer.cleanup-root", "Cleanup receipt must stay inside writer root."));
  } else {
    writeAtomicSyncedFile(absoluteReceipt, Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, "utf8"));
  }

  return {
    ok: errors.length === 0,
    receipt: { ...receipt, path: receiptPath },
    errors
  };
}

function validateCommittedRunFolderAt(runAbs, runId, receipt) {
  const runRoot = `runs/${runId}`;
  const expectedReceiptRef = `${runRoot}/${writeReceiptName}`;
  if (
    receipt?.schemaVersion !== "agentique.runFolderWriteReceipt.v2" ||
    receipt.runId !== runId ||
    receipt.rootRef !== "agentique-runs" ||
    receipt.committed !== true ||
    receipt.redacted !== true ||
    receipt.digestAlgorithm !== "sha256" ||
    receipt.receiptRef !== expectedReceiptRef ||
    !Array.isArray(receipt.entries) ||
    !Array.isArray(receipt.mutableRefs) ||
    receipt.mutableRefs.length !== 1 ||
    receipt.mutableRefs[0] !== `${runRoot}/${cleanupReceiptName}`
  ) {
    throw new Error("run-folder write receipt identity or schema is invalid");
  }
  const sorted = [...receipt.entries].sort((left, right) => String(left.path).localeCompare(String(right.path)));
  if (JSON.stringify(sorted) !== JSON.stringify(receipt.entries)) throw new Error("run-folder receipt entries are not sorted");
  const seen = new Set();
  let totalBytes = 0;
  for (const entry of receipt.entries) {
    const relativePath = strictRunEntryPath(entry?.path, runRoot);
    if (seen.has(relativePath)) throw new Error("run-folder receipt contains duplicate entries");
    seen.add(relativePath);
    const bytes = readBoundedRegularFile(path.join(runAbs, ...relativePath.split("/")), maxArtifactBytes);
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes !== bytes.length) throw new Error("run-folder entry byte count does not match");
    if (!/^[a-f0-9]{64}$/u.test(String(entry.contentDigest ?? "")) || sha256(bytes) !== entry.contentDigest) {
      throw new Error("run-folder entry integrity check failed");
    }
    if (unsafeEvidencePattern.test(bytes.toString("utf8"))) throw new Error("run-folder entry contains unsafe persisted material");
    totalBytes += bytes.length;
  }
  if (receipt.fileCount !== receipt.entries.length || receipt.totalBytes !== totalBytes || totalBytes > maxRunBytes) {
    throw new Error("run-folder receipt totals do not match");
  }
  for (const required of ["run.json", "logs/stdout.log", "logs/stderr.log", "viewer-metadata.json", "failure.json"]) {
    if (!seen.has(required)) throw new Error(`run-folder receipt is missing ${required}`);
  }
  const cleanup = readCleanupReceiptIfPresent(runAbs, runId);
  if (!cleanup) throw new Error("run-folder cleanup receipt is missing or invalid");
  const actual = collectRegularRelativeFiles(runAbs);
  const allowed = new Set([...seen, cleanupReceiptName, writeReceiptName]);
  if (actual.some((relativePath) => !allowed.has(relativePath)) || [...allowed].some((relativePath) => !actual.includes(relativePath))) {
    throw new Error("run-folder file inventory does not match the committed receipt");
  }
  return receipt;
}

function strictRunEntryPath(value, runRoot) {
  const text = String(value ?? "");
  if (!text.startsWith(`${runRoot}/`)) throw new Error("run-folder entry escaped its exact run root");
  const inside = text.slice(runRoot.length + 1);
  if (!inside || unsafeRelativePathPattern.test(inside) || inside === cleanupReceiptName || inside === writeReceiptName) {
    throw new Error("run-folder entry path is unsafe or reserved");
  }
  return inside;
}

function collectRegularRelativeFiles(root, current = root, output = []) {
  const rootStats = fs.lstatSync(current);
  if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) throw new Error("run-folder root must be a regular directory");
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name);
    const stats = fs.lstatSync(absolute);
    if (stats.isSymbolicLink()) throw new Error("run-folder links are forbidden");
    if (stats.isDirectory()) collectRegularRelativeFiles(root, absolute, output);
    else if (stats.isFile() && stats.nlink === 1) output.push(path.relative(root, absolute).split(path.sep).join("/"));
    else throw new Error("run-folder entries must be single-link regular files");
  }
  return output.sort();
}

function readBoundedRegularFile(filePath, maxBytes) {
  const stats = fs.lstatSync(filePath);
  if (stats.isSymbolicLink() || !stats.isFile() || stats.nlink !== 1 || stats.size > maxBytes) {
    throw new Error("run-folder file type or byte bound is invalid");
  }
  return fs.readFileSync(filePath);
}

function readCleanupReceiptIfPresent(runAbs, runId) {
  const receiptPath = path.join(runAbs, cleanupReceiptName);
  if (!fs.existsSync(receiptPath)) return null;
  const receipt = JSON.parse(readBoundedRegularFile(receiptPath, 65536).toString("utf8"));
  if (
    receipt?.schemaVersion !== "agentique.runFolderCleanupReceipt.v2" ||
    receipt.runId !== runId ||
    receipt.idempotent !== true ||
    !["pending", "cleaned"].includes(receipt.status) ||
    !Array.isArray(receipt.removed)
  ) {
    throw new Error("run-folder cleanup receipt identity or schema is invalid");
  }
  return receipt;
}

function writeSyncedFile(filePath, bytes) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const handle = fs.openSync(filePath, "wx");
  try {
    fs.writeFileSync(handle, bytes);
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }
}

function writeAtomicSyncedFile(filePath, bytes) {
  const temporary = `${filePath}.tmp-${process.pid}-${randomUUID()}`;
  writeSyncedFile(temporary, bytes);
  fs.renameSync(temporary, filePath);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function reviewRunFolderWriter(options = {}) {
  const rootDir = options.rootDir ?? ".tmp/run-folder-writer-review";
  fs.rmSync(path.resolve(process.cwd(), rootDir), { recursive: true, force: true });
  const manifest = createRunFolderManifest(sampleRunFolderInput);
  const write = writeRunFolder(manifest, { rootDir, now: fixedNow });
  const integrity = validateCommittedRunFolder({ runId: manifest.runJson.runId }, { rootDir });
  const cleanup = cleanupRunFolder({ runId: manifest.runJson.runId }, { rootDir, now: fixedNow });
  return {
    schemaVersion: "agentique.runFolderWriterReview.v1",
    ok: write.ok && cleanup.ok,
    write,
    cleanup,
    summary: {
      files: write.files?.length ?? 0,
      cleanupRemoved: cleanup.receipt?.removed?.length ?? 0,
      reproducibilityDigest: write.receipt?.reproducibilityDigest ?? "",
      atomicPublished: write.receipt?.committed === true && write.receipt?.schemaVersion === "agentique.runFolderWriteReceipt.v2",
      integrityValidated: write.receipt?.digestAlgorithm === "sha256" && integrity.ok
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
