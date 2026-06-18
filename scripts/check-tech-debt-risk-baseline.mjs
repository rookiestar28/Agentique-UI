#!/usr/bin/env node
import {
  collectTechDebtRiskBaseline,
  formatTechDebtRiskBaselineReport,
  validateTechDebtRiskBaseline
} from "../src/core/tech-debt-risk-baseline.mjs";

const baseline = collectTechDebtRiskBaseline();
const validation = validateTechDebtRiskBaseline(baseline);
const report = formatTechDebtRiskBaselineReport(baseline, validation);

if (!validation.ok) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(report, null, 2));
