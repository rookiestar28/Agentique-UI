import { chromium, defineConfig } from "@playwright/test";

export function connectNativeWebView() {
  const endpoint = process.env.AGENTIQUE_E2E_CDP_ENDPOINT;
  if (!endpoint?.startsWith("http://127.0.0.1:")) throw new Error("A loopback WebView2 CDP endpoint is required.");
  return chromium.connectOverCDP(endpoint);
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: "line",
  outputDir: process.env.AGENTIQUE_E2E_PLAYWRIGHT_OUTPUT ?? ".tmp/uirun011-e2e/playwright"
});
