import assert from "node:assert/strict";
import test from "node:test";
import { applyPrompt } from "../src/lib/generate.js";
import { renderSource } from "../src/lib/source.js";

test("el App.jsx generado nombra la panadería y el color ámbar", () => {
  const { project } = applyPrompt(null, "Lista de tareas para la panadería: amasar, hornear y cerrar caja. Color ámbar.");
  const source = renderSource(project);
  assert.match(source, /export default function App/);
  assert.match(source, /Panadería/);
  assert.match(source, /amasar/);
  assert.match(source, /bg-amber-50/);
  assert.match(source, /Sin backend/);
});

test("sin proyecto no hay código", () => {
  assert.equal(renderSource(null), "");
});
