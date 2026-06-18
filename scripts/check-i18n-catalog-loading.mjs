#!/usr/bin/env node
import { reviewI18nCatalogLoading } from "../src/core/i18n-catalog-loading.mjs";
import { getCatalogParityReport } from "../src/i18n/index.mjs";

const { validation } = reviewI18nCatalogLoading();
const parity = await getCatalogParityReport();
const failures = [...validation.failures, ...(parity.ok ? [] : [{ code: "catalog-parity", message: "Loaded locale catalogs must match English key parity." }])];

const output = {
  status: failures.length === 0 ? "passed" : "failed",
  summary: validation.summary,
  parity: {
    ok: parity.ok,
    expectedKeyCount: parity.expectedKeyCount,
    locales: parity.locales.map((locale) => ({
      code: locale.code,
      keyCount: locale.keyCount,
      missing: locale.missing.length,
      extra: locale.extra.length
    }))
  },
  failures
};

console.log(JSON.stringify(output, null, 2));

if (failures.length > 0) {
  process.exit(1);
}
