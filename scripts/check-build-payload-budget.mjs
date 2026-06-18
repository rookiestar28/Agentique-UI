#!/usr/bin/env node
import { collectBuildPayloadReport, formatBuildPayloadBudgetReport, validateBuildPayloadReport } from "../src/core/build-payload-budget.mjs";

const report = collectBuildPayloadReport();
const validation = validateBuildPayloadReport(report);
const formatted = formatBuildPayloadBudgetReport(report, validation);

if (!validation.ok) {
  console.error(JSON.stringify(formatted, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(formatted, null, 2));
