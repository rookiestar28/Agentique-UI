import assert from "node:assert/strict";
import test from "node:test";
import { createSafePreview, escapeHtml, previewTypeLabels } from "../src/core/safe-preview.mjs";

test("supported preview labels cover static viewer families", () => {
  assert.deepEqual(Object.keys(previewTypeLabels), [
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
});

test("markdown and json previews are escaped static text", () => {
  const markdown = createSafePreview({
    type: "markdown",
    title: "Guide",
    content: "# Guide\n<script>alert(1)</script>"
  });
  const json = createSafePreview({
    type: "json",
    content: { name: "Guide", html: "<img src=x>" }
  });

  assert.equal(markdown.ok, true);
  assert.equal(markdown.renderMode, "static-text");
  assert.ok(markdown.text.includes("&lt;script&gt;"));
  assert.equal(markdown.text.includes("<script>"), false);
  assert.ok(json.text.includes("&lt;img src=x&gt;"));
});

test("html and mermaid previews are escaped source only", () => {
  const html = createSafePreview({
    type: "html",
    content: "<img src=x onerror=alert(1)>"
  });
  const mermaid = createSafePreview({
    type: "mermaid",
    content: "graph TD\nA-->B"
  });

  assert.equal(html.ok, true);
  assert.equal(html.renderMode, "escaped-code");
  assert.ok(html.warnings.includes("Rendered as escaped source only."));
  assert.equal(html.text.includes("<img"), false);
  assert.equal(mermaid.renderMode, "escaped-code");
});

test("media and graph metadata render without loading bytes", () => {
  const preview = createSafePreview({
    type: "image-metadata",
    metadata: {
      role: "cover",
      path: "artifacts/cover.png",
      dimensions: "1200x630"
    }
  });

  assert.equal(preview.ok, true);
  assert.ok(preview.text.includes("role: cover"));
  assert.ok(preview.text.includes("path: artifacts/cover.png"));
  assert.ok(preview.warnings.includes("Metadata preview only; media bytes are not loaded."));
});

test("local file references and traversal fail closed", () => {
  const windowsPath = ["C", ":\\private\\asset.png"].join("");
  const fileUrl = ["file", ":///private/asset.png"].join("");

  for (const content of [windowsPath, fileUrl, "../private/asset.png"]) {
    const preview = createSafePreview({ type: "text", content });
    assert.equal(preview.ok, false);
    assert.equal(preview.errors[0].code, "preview.unsafe-path");
    assert.equal(preview.renderMode, "blocked");
  }
});

test("escapeHtml covers common markup characters", () => {
  assert.equal(escapeHtml(`<tag attr="one">'two'&</tag>`), "&lt;tag attr=&quot;one&quot;&gt;&#39;two&#39;&amp;&lt;/tag&gt;");
});
