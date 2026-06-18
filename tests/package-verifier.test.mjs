import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { sha256Hex, verificationChecklist, verifyScopedPackage } from "../src/core/package-verifier.mjs";

const now = "2026-06-11T00:05:00.000Z";
const bytes = "agentique-package-bytes";

async function validInput() {
  const ticket = JSON.parse(fs.readFileSync("examples/scoped-download-ticket.valid.json", "utf8"));
  const bundle = JSON.parse(fs.readFileSync("examples/resource-bundle.valid.json", "utf8"));
  ticket.integrity.sha256 = await sha256Hex(bytes);
  ticket.integrity.sizeBytes = new TextEncoder().encode(bytes).byteLength;
  ticket.expiresAt = "2026-06-11T00:10:00.000Z";
  return { ticket, bundle, bytes, now };
}

test("verification checklist includes required gates", () => {
  assert.deepEqual(verificationChecklist.map((item) => item.label), [
    "Ticket audience and scope",
    "Ticket expiry and replay",
    "Byte count and digest",
    "Bundle support mode",
    "Import side effects"
  ]);
});

test("valid scoped package verifies and creates import record", async () => {
  const result = await verifyScopedPackage(await validInput());
  assert.equal(result.ok, true);
  assert.equal(result.imported, true);
  assert.equal(result.record.resourceId, "example.visual-guide");
});

test("digest mismatch fails without import and requests cleanup", async () => {
  const input = await validInput();
  input.ticket.integrity.sha256 = "0".repeat(64);
  const result = await verifyScopedPackage(input);
  assert.equal(result.ok, false);
  assert.equal(result.imported, false);
  assert.equal(result.cleanup.required, true);
  assert.ok(result.errors.some((error) => error.code === "integrity.digest-mismatch"));
});

test("expired or replayed ticket fails closed", async () => {
  const input = await validInput();
  input.ticket.expiresAt = "2026-06-10T00:00:00.000Z";
  input.replayedTickets = [input.ticket.ticketId];
  const result = await verifyScopedPackage(input);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.code === "ticket.expired"));
  assert.ok(result.errors.some((error) => error.code === "ticket.replayed"));
});

test("bundle without support mode cannot import", async () => {
  const input = await validInput();
  input.bundle.support.modes = [];
  const result = await verifyScopedPackage(input);
  assert.equal(result.ok, false);
  assert.equal(result.imported, false);
  assert.ok(result.errors.some((error) => error.code === "bundle.missing-support"));
});
