import assert from "node:assert/strict";
import test from "node:test";
import { applyPrompt } from "../src/lib/generate.js";

const BAKERY = "Lista de tareas para la panadería: amasar, hornear y cerrar caja. Color ámbar.";

test("crea la lista de la panadería con precio de color y tareas", () => {
  const result = applyPrompt(null, BAKERY);
  assert.equal(result.ok, true);
  assert.equal(result.action, "create");
  assert.equal(result.project.kind, "todos");
  assert.equal(result.project.title, "Panadería");
  assert.equal(result.project.accent, "amber");
  assert.deepEqual(
    result.project.items.map((item) => item.name),
    ["amasar", "hornear", "cerrar caja"],
  );
});

test("un cambio de color y un alta no rehacen la app", () => {
  const created = applyPrompt(null, BAKERY);
  const edited = applyPrompt(created.project, "Cambia el color a verde y añade revisar el horno");
  assert.equal(edited.action, "edit");
  assert.equal(edited.project.kind, "todos");
  assert.equal(edited.project.accent, "green");
  assert.equal(edited.project.title, "Panadería");
  assert.ok(edited.project.items.some((item) => item.name === "revisar el horno"));
  assert.equal(created.project.accent, "amber");
  assert.equal(created.project.items.length, 3);
});

test("quitar, retitular y un cambio que no entiende", () => {
  const created = applyPrompt(null, BAKERY);
  const removed = applyPrompt(created.project, "Quita amasar");
  assert.ok(removed.project.items.every((item) => item.name !== "amasar"));

  const titled = applyPrompt(created.project, "Cambia el título a Turno de mañana");
  assert.equal(titled.project.title, "Turno de mañana");
  assert.equal(titled.project.kind, "todos");

  const unknown = applyPrompt(created.project, "haz que vuele");
  assert.equal(unknown.ok, false);
  assert.equal(unknown.code, "unknown");
  const missing = applyPrompt(created.project, "Quita unicornio");
  assert.equal(missing.ok, false);
});

test("un prompt vacío no crea proyecto", () => {
  assert.deepEqual(applyPrompt(null, "  "), { ok: false, code: "empty" });
});

test("sustituye la app cuando el prompt pide otro tipo", () => {
  const created = applyPrompt(null, BAKERY);
  const replaced = applyPrompt(created.project, "Ahora una calculadora de color azul");
  assert.equal(replaced.action, "replace");
  assert.equal(replaced.project.kind, "calc");
  assert.equal(replaced.project.accent, "blue");
  assert.equal(replaced.project.revision, 2);
});

test("landing, notas, carta y contador salen del prompt", () => {
  const landing = applyPrompt(null, "Landing de Seal22 para pymes europeas.");
  assert.equal(landing.project.kind, "landing");
  assert.equal(landing.project.title, "Seal22");
  assert.equal(landing.project.subtitle, "Para pymes europeas");

  const notes = applyPrompt(null, "Notas de la reunión de hoy.");
  assert.equal(notes.project.kind, "notes");
  assert.equal(notes.project.title, "Reunión de hoy");

  const menu = applyPrompt(null, "Carta del bar: café 1,80, tostada 2,40 y zumo 3");
  assert.equal(menu.project.kind, "menu");
  assert.deepEqual(menu.project.items, [
    { name: "café", price: "1,80" },
    { name: "tostada", price: "2,40" },
    { name: "zumo", price: "3,00" },
  ]);

  const counter = applyPrompt(null, "Contador de 8 vasos de agua");
  assert.equal(counter.project.kind, "counter");
  assert.equal(counter.project.target, 8);
});
