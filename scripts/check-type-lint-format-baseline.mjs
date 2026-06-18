import { reviewTypeLintFormatBaseline } from "../src/core/type-lint-format-baseline.mjs";

const { report, validation } = reviewTypeLintFormatBaseline();
const output = {
  status: validation.status,
  summary: validation.summary,
  node: report.node,
  failures: validation.failures
};

console.log(JSON.stringify(output, null, 2));

if (!validation.ok) {
  process.exit(1);
}
