import { reviewNativeWasmSandbox, sampleNativeWasmSandbox } from "../src/core/native-wasm-sandbox.mjs";

const review = reviewNativeWasmSandbox(sampleNativeWasmSandbox);
if (!review.ok) {
  console.error(JSON.stringify(review, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ status: "passed", ...review.summary }, null, 2));
}
