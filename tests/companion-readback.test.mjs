import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createAjv, readJson, validateExample } from "../scripts/validate-contracts.mjs";

const schemaPath = "schemas/ui-companion-readback.schema.json";
const examplePath = "examples/companion-readback.valid.json";

test("companion readback example validates", () => {
  const result = validateExample(schemaPath, examplePath);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test("companion readback rejects private moderation evidence", () => {
  const ajv = createAjv();
  const validate = ajv.compile(readJson(schemaPath));
  const example = readJson(examplePath);
  example.privateModerationNotes = "not public";
  assert.equal(validate(example), false);
});

test("companion readback rejects raw token field", () => {
  const ajv = createAjv();
  const validate = ajv.compile(readJson(schemaPath));
  const example = readJson(examplePath);
  example.download.token = "raw-token";
  assert.equal(validate(example), false);
});

test("companion readback requires HTTPS endpoints", () => {
  const ajv = createAjv();
  const validate = ajv.compile(readJson(schemaPath));
  const example = readJson(examplePath);
  example.download.ticketEndpoint = "http://www.agentique.io/ticket";
  assert.equal(validate(example), false);
});

test("companion alignment docs exclude private fields and avoid production overclaim", () => {
  const text = fs.readFileSync("docs/contracts/companion-alignment.md", "utf8");
  assert.match(text, /Excluded Private Fields/i);
  assert.match(text, /credentials, tokens, cookies, private keys/i);
  assert.match(text, /does not claim that production endpoints already provide every field/i);
});
