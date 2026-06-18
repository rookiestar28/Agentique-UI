import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createAjv, readJson, validateExample } from "../scripts/validate-contracts.mjs";

const schemaPath = "schemas/agentique-resource-bundle.schema.json";
const examplePath = "examples/resource-bundle.valid.json";

test("resource bundle example validates", () => {
  const result = validateExample(schemaPath, examplePath);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test("resource bundle rejects missing support modes", () => {
  const ajv = createAjv();
  const validate = ajv.compile(readJson(schemaPath));
  const example = readJson(examplePath);
  delete example.support.modes;
  assert.equal(validate(example), false);
  assert.ok(validate.errors.some((error) => error.instancePath === "/support"));
});

test("resource bundle rejects unknown fields", () => {
  const ajv = createAjv();
  const validate = ajv.compile(readJson(schemaPath));
  const example = readJson(examplePath);
  example.internalNote = "not allowed";
  assert.equal(validate(example), false);
});

test("resource bundle rejects inline secret values", () => {
  const ajv = createAjv();
  const validate = ajv.compile(readJson(schemaPath));
  const example = readJson(examplePath);
  example.secretRefs = ["sk-this-is-not-a-reference-value"];
  assert.equal(validate(example), false);
});

test("resource bundle accepts canonical public resource id and version text", () => {
  const ajv = createAjv();
  const validate = ajv.compile(readJson(schemaPath));
  const example = readJson(examplePath);
  example.resource.id = "agent:alpha.preview";
  example.resource.version = "2026.06+alpha";
  assert.equal(validate(example), true, JSON.stringify(validate.errors));
});

test("resource bundle docs include no-dead-end and secret boundaries", () => {
  const text = fs.readFileSync("docs/contracts/resource-bundle.md", "utf8");
  assert.match(text, /No Dead-End Rule/i);
  assert.match(text, /must not contain secret values/i);
  assert.match(text, /does not create a downloader/i);
  assert.match(text, /Source Metadata Mapping/i);
  assert.match(text, /does not embed a final byte URL/i);
});
