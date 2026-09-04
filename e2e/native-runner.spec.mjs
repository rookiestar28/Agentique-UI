import path from "node:path";
import { expect, test } from "@playwright/test";
import { connectNativeWebView } from "../playwright.native.config.mjs";

const scenario = process.env.AGENTIQUE_E2E_SCENARIO ?? "success";
const outputRoot = process.env.AGENTIQUE_E2E_PLAYWRIGHT_OUTPUT ?? ".tmp/uirun011-e2e/playwright";
const productOrigin = process.env.AGENTIQUE_E2E_PRODUCT_ORIGIN ?? "http://127.0.0.1:4173";

test(`native runner lifecycle through the real Tauri bridge (${scenario})`, async () => {
  const browser = await connectNativeWebView();
  const context = browser.contexts()[0];
  const page = context?.pages().find((candidate) => candidate.url().startsWith(productOrigin));
  expect(page, "the attached CDP target must be the Tauri product page").toBeTruthy();
  if (!page) return;

  const rendererErrors = [];
  page.on("pageerror", (error) => rendererErrors.push(error.stack ?? error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) rendererErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400 && !response.url().endsWith("/favicon.ico")) rendererErrors.push(`${response.status()} ${response.url()}`);
  });

  await expect.poll(() => page.evaluate(() => "__TAURI_INTERNALS__" in window)).toBe(true);
  await page.getByRole("button", { name: "Run", exact: true }).first().click();

  const lifecycle = page.locator("[data-native-transport]");
  await expect
    .poll(
      async () => {
        if (rendererErrors.length > 0) throw new Error(`Renderer failed while loading the Run workspace: ${rendererErrors.join(" | ")}`);
        return lifecycle.count();
      },
      { timeout: 20_000 }
    )
    .toBe(1);
  await expect(lifecycle).toHaveAttribute("data-native-transport", "connected");
  const prepare = lifecycle.getByRole("button", { name: "Prepare native run" });
  const approve = lifecycle.getByRole("button", { name: "Approve exact effect" });
  const deny = lifecycle.getByRole("button", { name: "Deny", exact: true });
  const start = lifecycle.getByRole("button", { name: "Start asynchronously" });
  const cancel = lifecycle.getByRole("button", { name: "Cancel retained handle" });
  const resync = lifecycle.getByRole("button", { name: "Resync bounded replay" });
  const logs = lifecycle.getByRole("button", { name: "Read native logs" });
  const artifacts = lifecycle.getByRole("button", { name: "Read native artifacts" });
  const cleanup = lifecycle.getByRole("button", { name: "Clean up native run" });

  await expect(prepare).toBeEnabled();
  await expect(start).toBeDisabled();
  await prepare.click();
  await expect(lifecycle).toHaveAttribute("data-native-status", "pending-approval");

  if (scenario === "deny") {
    await expect(deny).toBeEnabled();
    await deny.click();
    await expect(lifecycle).toHaveAttribute("data-native-status", "denied");
    await expect(start).toBeDisabled();
    await capture(page);
    return;
  }

  await expect(approve).toBeEnabled();
  await approve.click();
  await expect(start).toBeEnabled();
  await start.click();

  if (scenario === "sleep") {
    await expect(lifecycle).toHaveAttribute("data-native-status", "running");
    await expect(cancel).toBeEnabled();
    await cancel.click();
    await expect(lifecycle).toHaveAttribute("data-native-status", "canceled", { timeout: 30_000 });
    await capture(page);
    await cleanup.click();
    await expect(lifecycle).toHaveAttribute("data-native-status", "cleaned-up");
    await expect(lifecycle.locator('[aria-label="Native receipt evidence"]')).toHaveAttribute("data-native-process-cleanup", "true");
    await expect(lifecycle.locator('[aria-label="Native receipt evidence"]')).toHaveAttribute("data-native-orphan-count", "0");
    return;
  }

  const terminal = scenario === "exit-failure" ? "failed" : "succeeded";
  await expect(lifecycle).toHaveAttribute("data-native-status", terminal, { timeout: 30_000 });
  await expect(logs).toBeEnabled();
  await logs.click();
  await expect(lifecycle.locator('[aria-label="Native receipt evidence"]')).toHaveAttribute("data-native-receipt-kind", "logs");
  await expect(artifacts).toBeEnabled();
  await artifacts.click();
  await expect(lifecycle.locator('[aria-label="Native receipt evidence"]')).toHaveAttribute("data-native-receipt-kind", "artifacts");
  await capture(page);

  if (scenario === "success") {
    await page.reload();
    await page.getByRole("button", { name: "Run", exact: true }).first().click();
    const restored = page.locator("[data-native-transport]");
    await expect(restored).toHaveAttribute("data-native-transport", "connected");
    await restored.getByRole("button", { name: "Resync bounded replay" }).click();
    await expect(restored).toHaveAttribute("data-native-status", "succeeded");
    await expect(restored.getByRole("button", { name: "Clean up native run" })).toBeEnabled();
    await restored.getByRole("button", { name: "Clean up native run" }).click();
    await expect(restored).toHaveAttribute("data-native-status", "cleaned-up");
  } else {
    await expect(cleanup).toBeEnabled();
    await cleanup.click();
    await expect(lifecycle).toHaveAttribute("data-native-status", "cleaned-up");
  }

  await expect(resync).toBeEnabled();
});

async function capture(page) {
  await page.screenshot({ path: path.join(outputRoot, `${scenario}.png`), fullPage: true });
}
