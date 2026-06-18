import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { readStyleSourceBundle } from "../src/core/style-source-boundary.mjs";

test("motion layer is reduced-motion aware", () => {
  const css = readStyleSourceBundle();
  assert.match(css, /prefers-reduced-motion: no-preference/u);
  assert.match(css, /prefers-reduced-motion: reduce/u);
  assert.match(css, /transition-duration: 0\.001ms !important/u);
  assert.match(css, /transform: none/u);
});

test("interaction feedback uses focus-visible and restrained transforms", () => {
  const css = readStyleSourceBundle();
  assert.match(css, /focus-visible/u);
  assert.match(css, /--agent-focus-ring/u);
  assert.match(css, /transform: translateY\(-1px\)/u);
  assert.doesNotMatch(css, /@keyframes/u);
});

test("no animation dependency was added", () => {
  const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
  const dependencyNames = Object.keys({
    ...packageJson.dependencies,
    ...packageJson.devDependencies
  });
  assert.equal(dependencyNames.includes("framer-motion"), false);
  assert.equal(dependencyNames.includes("motion"), false);
});
