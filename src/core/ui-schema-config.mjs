const supportedFieldTypes = new Set(["text", "number", "boolean", "enum", "secret-ref"]);
const sensitiveKeyPattern = /(secret|token|password|credential|key)/iu;

export const sampleUiSchema = Object.freeze({
  schemaVersion: "agentique.uiSchema.v1",
  title: "Visual guide settings",
  fields: [
    { name: "theme", label: "Theme", type: "enum", options: ["system", "dark", "light"], defaultValue: "system" },
    { name: "maxSteps", label: "Maximum steps", type: "number", min: 1, max: 12, defaultValue: 6 },
    { name: "includePreview", label: "Include preview", type: "boolean", defaultValue: true },
    { name: "providerCredential", label: "Provider credential", type: "secret-ref", defaultValue: "vault:providerCredential" },
    { name: "notes", label: "Notes", type: "text", defaultValue: "Review before handoff" }
  ]
});

export const sampleConfigDraft = Object.freeze({
  theme: "dark",
  maxSteps: 8,
  includePreview: true,
  providerCredential: "vault:providerCredential",
  notes: "Validate-only draft"
});

export function validateUiSchema(schema) {
  const errors = [];
  if (!schema || typeof schema !== "object") {
    return failed("ui-schema.invalid", "UI schema must be an object.");
  }
  if (schema.schemaVersion !== "agentique.uiSchema.v1") {
    errors.push(issue("ui-schema.invalid-version", "UI schema version is unsupported."));
  }
  if (!Array.isArray(schema.fields) || schema.fields.length === 0) {
    errors.push(issue("ui-schema.missing-fields", "UI schema requires fields."));
  }

  const seen = new Set();
  for (const field of schema.fields ?? []) {
    if (!field || typeof field !== "object") {
      errors.push(issue("ui-schema.invalid-field", "Field must be an object."));
      continue;
    }
    const name = String(field.name ?? "");
    if (!/^[a-z][a-z0-9A-Z]{1,63}$/u.test(name)) {
      errors.push(issue("ui-schema.invalid-name", "Field name is malformed."));
    }
    if (seen.has(name)) {
      errors.push(issue("ui-schema.duplicate-name", `Duplicate field: ${name}`));
    }
    seen.add(name);
    if (!supportedFieldTypes.has(field.type)) {
      errors.push(issue("ui-schema.unsupported-type", `Unsupported field type: ${field.type}`));
    }
    if (field.type === "enum" && (!Array.isArray(field.options) || field.options.length === 0)) {
      errors.push(issue("ui-schema.invalid-options", `${name} requires enum options.`));
    }
    if (field.type === "secret-ref" && !String(field.defaultValue ?? "").startsWith("vault:")) {
      errors.push(issue("ui-schema.invalid-secret-ref", `${name} must use a vault reference.`));
    }
    if (sensitiveKeyPattern.test(name) && field.type !== "secret-ref") {
      errors.push(issue("ui-schema.sensitive-field", `${name} must be a secret-ref field.`));
    }
  }

  if (errors.length > 0) return { ok: false, errors, fields: [] };
  return { ok: true, errors: [], fields: schema.fields.map((field) => ({ ...field })) };
}

export function validateConfigDraft(schema, draft) {
  const schemaResult = validateUiSchema(schema);
  if (!schemaResult.ok) return { ok: false, errors: schemaResult.errors, values: {} };
  const errors = [];
  const values = {};

  for (const field of schemaResult.fields) {
    const value = Object.prototype.hasOwnProperty.call(draft ?? {}, field.name)
      ? draft[field.name]
      : field.defaultValue;
    const normalized = normalizeValue(field, value, errors);
    values[field.name] = normalized;
  }

  for (const key of Object.keys(draft ?? {})) {
    if (!schemaResult.fields.some((field) => field.name === key)) {
      errors.push(issue("config.unknown-field", `Unknown draft field: ${key}`));
    }
  }

  if (errors.length > 0) return { ok: false, errors, values };
  return {
    ok: true,
    errors: [],
    values,
    redactedValues: redactDraft(schemaResult.fields, values),
    diff: diffDraft(schemaResult.fields, values)
  };
}

export function resetDraft(schema) {
  const schemaResult = validateUiSchema(schema);
  if (!schemaResult.ok) return {};
  return Object.fromEntries(schemaResult.fields.map((field) => [field.name, field.defaultValue]));
}

export function exportDraft(schema, draft) {
  const result = validateConfigDraft(schema, draft);
  if (!result.ok) return result;
  return {
    ok: true,
    schemaVersion: "agentique.configDraft.v1",
    exportedAt: "2026-06-11T00:25:00.000Z",
    values: result.redactedValues,
    diff: result.diff
  };
}

function normalizeValue(field, value, errors) {
  switch (field.type) {
    case "number": {
      const next = Number(value);
      if (!Number.isFinite(next)) {
        errors.push(issue("config.invalid-number", `${field.name} must be a number.`));
        return field.defaultValue;
      }
      if (field.min != null && next < field.min) {
        errors.push(issue("config.number-too-small", `${field.name} is below the minimum.`));
      }
      if (field.max != null && next > field.max) {
        errors.push(issue("config.number-too-large", `${field.name} is above the maximum.`));
      }
      return next;
    }
    case "boolean":
      if (typeof value !== "boolean") {
        errors.push(issue("config.invalid-boolean", `${field.name} must be a boolean.`));
        return Boolean(field.defaultValue);
      }
      return value;
    case "enum":
      if (!field.options.includes(value)) {
        errors.push(issue("config.invalid-enum", `${field.name} is not an allowed option.`));
        return field.defaultValue;
      }
      return value;
    case "secret-ref":
      if (!String(value ?? "").startsWith("vault:")) {
        errors.push(issue("config.invalid-secret-ref", `${field.name} must use a vault reference.`));
        return field.defaultValue;
      }
      return String(value);
    default:
      return String(value ?? "");
  }
}

function redactDraft(fields, values) {
  return Object.fromEntries(fields.map((field) => [
    field.name,
    field.type === "secret-ref" ? "redacted:vault-reference" : values[field.name]
  ]));
}

function diffDraft(fields, values) {
  return fields
    .filter((field) => values[field.name] !== field.defaultValue)
    .map((field) => ({
      field: field.name,
      from: field.type === "secret-ref" ? "redacted:vault-reference" : field.defaultValue,
      to: field.type === "secret-ref" ? "redacted:vault-reference" : values[field.name]
    }));
}

function failed(code, message) {
  return { ok: false, errors: [issue(code, message)], fields: [] };
}

function issue(code, message) {
  return { code, message };
}

