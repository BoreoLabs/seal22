import assert from "node:assert/strict";
import test from "node:test";
import { safePreviewSrc } from "../app/components/api.js";

const ID = "11111111-1111-4111-8111-111111111111";

test("la preview del iframe solo acepta la ruta del sandbox", () => {
  assert.equal(safePreviewSrc(`/api/sandbox/preview/${ID}/index.html`), `/api/sandbox/preview/${ID}/index.html`);
  assert.equal(safePreviewSrc("https://evil.example/index.html"), "");
  assert.equal(safePreviewSrc("//evil.example/index.html"), "");
  assert.equal(safePreviewSrc("javascript:alert(1)"), "");
  assert.equal(safePreviewSrc(`/api/sandbox/preview/${ID}/assets/app.js`), "");
  assert.equal(safePreviewSrc(""), "");
});
