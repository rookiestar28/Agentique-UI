import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createAjv, readJson, validateExample } from "../scripts/validate-contracts.mjs";

const intentSchema = "schemas/deep-link-intent.schema.json";
const intentExample = "examples/deep-link-intent.valid.json";
const ticketSchema = "schemas/scoped-download-ticket.schema.json";
const ticketExample = "examples/scoped-download-ticket.valid.json";

test("deep-link intent example validates", () => {
  const result = validateExample(intentSchema, intentExample);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test("scoped download ticket example validates", () => {
  const result = validateExample(ticketSchema, ticketExample);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test("deep-link intent rejects non-HTTPS origin", () => {
  const ajv = createAjv();
  const validate = ajv.compile(readJson(intentSchema));
  const example = readJson(intentExample);
  example.origin.site = "http://www.agentique.io";
  assert.equal(validate(example), false);
});

test("deep-link intent requires no-authority security posture", () => {
  const ajv = createAjv();
  const validate = ajv.compile(readJson(intentSchema));
  const example = readJson(intentExample);
  example.security.grantsAuthorization = true;
  assert.equal(validate(example), false);
});

test("download ticket rejects wrong audience and replay policy", () => {
  const ajv = createAjv();
  const validate = ajv.compile(readJson(ticketSchema));
  const example = readJson(ticketExample);
  example.audience = "browser";
  example.replayPolicy.singleUse = false;
  assert.equal(validate(example), false);
});

test("download ticket rejects non-HTTPS URL", () => {
  const ajv = createAjv();
  const validate = ajv.compile(readJson(ticketSchema));
  const example = readJson(ticketExample);
  example.download.url = "http://www.agentique.io/download";
  assert.equal(validate(example), false);
});

test("deep-link docs state untrusted intent and no authorization", () => {
  const text = fs.readFileSync("docs/contracts/deep-link-and-download.md", "utf8");
  assert.match(text, /never authorization/i);
  assert.match(text, /versioned `agentique:\/\/import/i);
  assert.match(text, /legacy `agentique:\/\/resources\/\{resourceId\}`/i);
  assert.match(text, /Reject expired, replayed, wrong-audience, wrong-scope/i);
  assert.match(text, /do not register an operating-system URL handler/i);
});
