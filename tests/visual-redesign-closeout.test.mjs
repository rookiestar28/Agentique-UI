import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("visual redesign closeout maps public outcome and validation", () => {
  const text = fs.readFileSync("docs/validation/visual-redesign-closeout.md", "utf8");
  for (const phrase of [
    "design tokens",
    "workspace shell",
    "import and verification proof surfaces",
    "static safe preview workspace",
    "reduced-motion-aware interaction states",
    "npm run validate",
    "public-boundary scan"
  ]) {
    assert.match(text, new RegExp(phrase));
  }
});

test("visual redesign closeout does not claim runtime release capability", () => {
  const text = fs.readFileSync("docs/validation/visual-redesign-closeout.md", "utf8");
  assert.match(text, /No installer, updater, production desktop runtime/u);
  assert.match(text, /automatic arbitrary-resource execution/u);
  assert.doesNotMatch(text, /released desktop product/iu);
});
