import { collectLiveDataBoundaryReport, formatLiveDataBoundaryReport, validateLiveDataBoundaryReport } from "../src/core/live-data-boundary.mjs";

const report = collectLiveDataBoundaryReport();
const validation = validateLiveDataBoundaryReport(report);

console.log(JSON.stringify(formatLiveDataBoundaryReport(report, validation), null, 2));

if (!validation.ok) {
  process.exitCode = 1;
}
