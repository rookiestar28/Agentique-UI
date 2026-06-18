import { reviewLibraryUpdateLifecycle } from "../src/core/library-update-lifecycle.mjs";

const result = reviewLibraryUpdateLifecycle();
const output = JSON.stringify(
  {
    status: result.validation.ok ? "passed" : "failed",
    summary: result.validation.summary,
    failures: result.validation.failures
  },
  null,
  2
);

if (!result.validation.ok) {
  console.error(output);
  process.exit(1);
}

console.log(output);
