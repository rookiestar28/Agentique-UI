import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { evidenceRedactionSchemaVersion, inspectEvidenceText, visualEvidenceManifest } from "./evidence-redaction-boundary.mjs";

const MAX_INSPECTION_BYTES = 256 * 1024;

export function validateVisualEvidenceInventory({ root, manifest = visualEvidenceManifest }) {
  const artifactRoot = path.join(root, "docs", "validation", "artifacts");
  const findings = [];
  const expected = new Map(manifest.map((record) => [record.path, record]));
  const actualPaths = fs.existsSync(artifactRoot) ? listPngFiles(artifactRoot).map((filePath) => path.relative(root, filePath).replaceAll(path.sep, "/")) : [];
  for (const rel of actualPaths) {
    if (!expected.has(rel)) findings.push({ code: "visual.inventory-unexpected", path: rel });
  }
  for (const record of manifest) {
    const filePath = path.join(root, ...record.path.split("/"));
    if (!fs.existsSync(filePath)) {
      findings.push({ code: "visual.inventory-missing", path: record.path });
      continue;
    }
    const bytes = fs.readFileSync(filePath);
    const digest = crypto.createHash("sha256").update(bytes).digest("hex");
    if (bytes.length !== record.bytes) findings.push({ code: "visual.byte-count-drift", path: record.path });
    if (digest !== record.sha256) findings.push({ code: "visual.hash-drift", path: record.path });
    findings.push(...inspectPngMetadata(bytes, record.path));
  }
  return {
    ok: findings.length === 0,
    schemaVersion: evidenceRedactionSchemaVersion,
    files: actualPaths.sort(),
    findings,
    pixelContentInspected: false,
    ocrClaimed: false
  };
}

function inspectPngMetadata(bytes, rel) {
  const findings = [];
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (bytes.length < 20 || !bytes.subarray(0, 8).equals(signature)) return [{ code: "visual.png-malformed", path: rel }];
  let offset = 8;
  let sawEnd = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (length > MAX_INSPECTION_BYTES || end > bytes.length) return [{ code: "visual.png-malformed", path: rel }];
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    try {
      const metadata = decodePngText(type, data);
      if (metadata && inspectEvidenceText(metadata).findings.length > 0) findings.push({ code: "visual.unsafe-text-metadata", path: rel, chunk: type });
    } catch {
      findings.push({ code: "visual.png-text-metadata-malformed", path: rel, chunk: type });
    }
    offset = end;
    if (type === "IEND") {
      sawEnd = true;
      break;
    }
  }
  if (!sawEnd || offset !== bytes.length) findings.push({ code: "visual.png-malformed", path: rel });
  return findings;
}

function decodePngText(type, data) {
  if (type === "tEXt") return data.toString("latin1");
  if (type === "zTXt") {
    const separator = data.indexOf(0);
    if (separator < 0 || data[separator + 1] !== 0) throw new Error("invalid zTXt");
    return `${data.subarray(0, separator).toString("latin1")} ${zlib.inflateSync(data.subarray(separator + 2), { maxOutputLength: MAX_INSPECTION_BYTES }).toString("latin1")}`;
  }
  if (type === "iTXt") {
    const separator = data.indexOf(0);
    if (separator < 0 || separator + 3 > data.length) throw new Error("invalid iTXt");
    const compressed = data[separator + 1] === 1;
    let cursor = separator + 3;
    for (let count = 0; count < 2; count += 1) {
      const next = data.indexOf(0, cursor);
      if (next < 0) throw new Error("invalid iTXt fields");
      cursor = next + 1;
    }
    const body = compressed ? zlib.inflateSync(data.subarray(cursor), { maxOutputLength: MAX_INSPECTION_BYTES }) : data.subarray(cursor);
    return `${data.subarray(0, separator).toString("latin1")} ${body.toString("utf8")}`;
  }
  return "";
}

function listPngFiles(dir) {
  const result = [];
  for (const entryValue of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entryValue.name);
    if (entryValue.isDirectory()) result.push(...listPngFiles(full));
    else if (entryValue.isFile() && entryValue.name.toLowerCase().endsWith(".png")) result.push(full);
  }
  return result;
}
