import assert from "node:assert/strict";
import test from "node:test";
import { BASE_USD, BLOCK_USD, canAfford, quotePrompt, roundUsd, SESSION_CAP_USD } from "../src/lib/quote.js";

test("un prompt vacío solo muestra la base y no suma bloques", () => {
  const quote = quotePrompt("   ");
  assert.equal(quote.chars, 0);
  assert.equal(quote.blocks, 0);
  assert.equal(quote.usd, BASE_USD);
});

test("cada 200 caracteres suma un bloque", () => {
  assert.equal(quotePrompt("a".repeat(1)).blocks, 1);
  assert.equal(quotePrompt("a".repeat(200)).usd, roundUsd(BASE_USD + BLOCK_USD));
  assert.equal(quotePrompt("a".repeat(201)).blocks, 2);
  assert.equal(quotePrompt("a".repeat(401)).usd, roundUsd(BASE_USD + 3 * BLOCK_USD));
});

test("el tope corta la cuarta petición corta", () => {
  let spent = 0;
  for (let index = 0; index < 3; index += 1) {
    const quote = quotePrompt("Cambia el color a verde");
    assert.equal(canAfford(spent, quote.usd), true);
    spent = roundUsd(spent + quote.usd);
  }
  const next = quotePrompt("Cambia el título a Turno de mañana");
  assert.equal(canAfford(spent, next.usd), false);
  assert.ok(roundUsd(spent + next.usd) > SESSION_CAP_USD);
});
