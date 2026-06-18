import { validateReleasePackagingPreflight } from "../src/core/release-packaging-preflight.mjs";

const result = validateReleasePackagingPreflight();
const output = JSON.stringify(result, null, 2);

if (!result.ok || (process.argv.includes("--require-ready") && !result.ready)) {
  console.error(output);
  process.exit(1);
}

console.log(output);
