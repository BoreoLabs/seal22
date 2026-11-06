import assert from "node:assert/strict";
import test from "node:test";
import { applyPrompt } from "../src/lib/generate.js";
import { CATALOG } from "../src/server/catalog.js";
import { assertSafeRelative, filesForProject } from "../src/server/files.js";

test("el catálogo cubre diez prompts y genera un proyecto Vite", async () => {
  assert.equal(CATALOG.length, 10);
  const bakery = CATALOG.find((entry) => entry.id === "bakery");
  const created = applyPrompt(null, bakery.prompt);
  assert.equal(created.project.kind, bakery.kind);
  assert.equal(created.project.accent, bakery.accent);

  const files = await filesForProject(created.project);
  const paths = files.map((file) => file.path).sort();
  assert.deepEqual(paths, [
    "index.html",
    "package.json",
    "src/App.jsx",
    "src/index.css",
    "src/main.jsx",
    "vite.config.js",
  ]);
  const source = files.find((file) => file.path === "src/App.jsx").contents;
  assert.match(source, /Panadería/);
  for (const file of files) assertSafeRelative(file.path);
});

test("rechaza rutas que salen del proyecto", () => {
  assert.throws(() => assertSafeRelative("../etc/passwd"));
  assert.throws(() => assertSafeRelative("/etc/passwd"));
  assert.throws(() => assertSafeRelative("src/../../secret"));
  assert.equal(assertSafeRelative("src/App.jsx"), "src/App.jsx");
});
