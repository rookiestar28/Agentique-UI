import assert from "node:assert/strict";
import test from "node:test";
import {
  exportDraft,
  resetDraft,
  sampleConfigDraft,
  sampleUiSchema,
  validateConfigDraft,
  validateUiSchema
} from "../src/core/ui-schema-config.mjs";

test("sample UI schema validates and renders typed fields", () => {
  const result = validateUiSchema(sampleUiSchema);
  assert.equal(result.ok, true);
  assert.deepEqual(result.fields.map((field) => field.type), ["enum", "number", "boolean", "secret-ref", "text"]);
});

test("config draft validates, redacts secret references, and creates diffs", () => {
  const result = validateConfigDraft(sampleUiSchema, sampleConfigDraft);
  assert.equal(result.ok, true);
  assert.equal(result.values.theme, "dark");
  assert.equal(result.redactedValues.providerCredential, "redacted:vault-reference");
  assert.ok(result.diff.some((entry) => entry.field === "theme"));
});

test("invalid schemas and unknown draft fields fail closed", () => {
  const schema = {
    ...sampleUiSchema,
    fields: [
      ...sampleUiSchema.fields,
      { name: "passwordText", label: "Password text", type: "text", defaultValue: "not allowed" }
    ]
  };
  const schemaResult = validateUiSchema(schema);
  assert.equal(schemaResult.ok, false);
  assert.ok(schemaResult.errors.some((error) => error.code === "ui-schema.sensitive-field"));

  const draftResult = validateConfigDraft(sampleUiSchema, { ...sampleConfigDraft, extra: true });
  assert.equal(draftResult.ok, false);
  assert.ok(draftResult.errors.some((error) => error.code === "config.unknown-field"));
});

test("reset and export keep values deterministic and redacted", () => {
  assert.deepEqual(resetDraft(sampleUiSchema), {
    theme: "system",
    maxSteps: 6,
    includePreview: true,
    providerCredential: "vault:providerCredential",
    notes: "Review before handoff"
  });
  const exported = exportDraft(sampleUiSchema, sampleConfigDraft);
  assert.equal(exported.ok, true);
  assert.equal(exported.values.providerCredential, "redacted:vault-reference");
  assert.equal(exported.schemaVersion, "agentique.configDraft.v1");
});

