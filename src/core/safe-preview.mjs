const supportedTypes = new Set([
  "markdown",
  "text",
  "json",
  "csv",
  "image-metadata",
  "video-metadata",
  "pdf-metadata",
  "log",
  "diff",
  "graph-summary",
  "html",
  "mermaid"
]);

const localPathPattern = /(?:file:\/\/|(?:^|[\s"'(])(?:[A-Za-z]:[\\/]|\\\\)|(?:^|[\\/])\.\.(?:[\\/]|$)|\.\.[\\/])/iu;

export const previewTypeLabels = Object.freeze({
  markdown: "Markdown",
  text: "Text",
  json: "JSON",
  csv: "CSV",
  "image-metadata": "Image metadata",
  "video-metadata": "Video metadata",
  "pdf-metadata": "PDF metadata",
  log: "Log",
  diff: "Diff",
  "graph-summary": "Graph summary",
  html: "HTML source",
  mermaid: "Mermaid source"
});

export const samplePreview = createSafePreview({
  type: "markdown",
  title: "Example Visual Guide",
  content: "# Example Visual Guide\n\nPreview is escaped and resource code is never executed.",
  metadata: {
    files: 1,
    viewer: "static-text"
  }
});

export function createSafePreview(input) {
  if (!input || typeof input !== "object") {
    return rejectedPreview("preview.invalid-input", "Preview input must be an object.");
  }

  const type = String(input.type ?? "text");
  if (!supportedTypes.has(type)) {
    return rejectedPreview("preview.unsupported-type", "Preview type is not supported.");
  }

  try {
    assertPathNeutral(input.content, "content");
    assertPathNeutral(input.metadata, "metadata");
  } catch (error) {
    return rejectedPreview(error.code ?? "preview.unsafe-path", error.message);
  }

  const title = safeTitle(input.title ?? previewTypeLabels[type]);
  const renderMode = type === "html" || type === "mermaid" ? "escaped-code" : "static-text";
  const text = renderPreviewText(type, input.content, input.metadata);
  const warnings = [];

  if (type === "html" || type === "mermaid") {
    warnings.push("Rendered as escaped source only.");
  }
  if (type.endsWith("-metadata")) {
    warnings.push("Metadata preview only; media bytes are not loaded.");
  }

  return {
    ok: true,
    type,
    label: previewTypeLabels[type],
    title,
    renderMode,
    text,
    warnings,
    metadata: sanitizeMetadata(input.metadata ?? {})
  };
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderPreviewText(type, content, metadata) {
  switch (type) {
    case "json":
      return escapeHtml(typeof content === "string" ? content : JSON.stringify(content ?? {}, null, 2));
    case "image-metadata":
    case "video-metadata":
    case "pdf-metadata":
    case "graph-summary":
      return escapeHtml(formatMetadata({ ...(metadata ?? {}), ...(typeof content === "object" && content ? content : {}) }));
    default:
      return escapeHtml(content ?? "");
  }
}

function formatMetadata(value) {
  const entries = Object.entries(sanitizeMetadata(value));
  if (entries.length === 0) return "No metadata available.";
  return entries.map(([key, nested]) => `${key}: ${Array.isArray(nested) ? nested.join(", ") : String(nested)}`).join("\n");
}

function sanitizeMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result = {};
  for (const [key, nested] of Object.entries(value)) {
    if (nested == null) continue;
    if (Array.isArray(nested)) {
      result[key] = nested.map((item) => String(item));
    } else if (typeof nested === "object") {
      result[key] = JSON.stringify(nested);
    } else {
      result[key] = String(nested);
    }
  }
  return result;
}

function assertPathNeutral(value, path) {
  if (value == null) return;
  if (typeof value === "string") {
    if (localPathPattern.test(value)) {
      throw issue("preview.unsafe-path", `${path} contains a local path or traversal reference.`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertPathNeutral(item, `${path}[${index}]`));
    return;
  }
  if (typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      assertPathNeutral(key, `${path}.${key}`);
      assertPathNeutral(nested, `${path}.${key}`);
    }
  }
}

function safeTitle(value) {
  const text = String(value ?? "Preview").trim();
  return text.length > 0 ? text.slice(0, 80) : "Preview";
}

function rejectedPreview(code, message) {
  return {
    ok: false,
    type: "rejected",
    label: "Rejected",
    title: "Preview unavailable",
    renderMode: "blocked",
    text: "",
    warnings: [message],
    errors: [{ code, message }],
    metadata: {}
  };
}

function issue(code, message) {
  const error = /** @type {Error & {code?: string}} */ (new Error(message));
  error.code = code;
  return error;
}
