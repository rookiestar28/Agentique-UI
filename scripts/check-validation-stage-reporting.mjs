import { collectValidationStageReport, formatValidationStageReport, validateValidationStageReport } from "../src/core/validation-stage-reporting.mjs";

const report = collectValidationStageReport();
const validation = validateValidationStageReport(report);

console.log(JSON.stringify(formatValidationStageReport(report, validation), null, 2));

if (!validation.ok) {
  process.exitCode = 1;
}
