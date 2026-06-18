import { reviewNativeRunnerAdapterManifest } from "../src/core/native-runner-adapter-manifest.mjs";

const review = reviewNativeRunnerAdapterManifest();

if (!review.ok) {
  console.error(JSON.stringify(review, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      schemaVersion: review.schemaVersion,
      manifest: {
        ...review.manifest,
        willSpawnProcess: false
      },
      failClosed: review.failClosed
    },
    null,
    2
  )
);
