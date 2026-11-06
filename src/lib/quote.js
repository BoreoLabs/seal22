export const SESSION_CAP_USD = 0.25;
export const BASE_USD = 0.06;
export const BLOCK_CHARS = 200;
export const BLOCK_USD = 0.01;

export function roundUsd(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function quotePrompt(prompt) {
  const chars = String(prompt ?? "").trim().length;
  const blocks = chars === 0 ? 0 : Math.ceil(chars / BLOCK_CHARS);
  const usd = roundUsd(BASE_USD + blocks * BLOCK_USD);
  return { chars, blocks, usd };
}

export function canAfford(spentUsd, quoteUsd) {
  return roundUsd(Number(spentUsd) + Number(quoteUsd)) <= SESSION_CAP_USD;
}

export function formatUsd(value) {
  const [whole, frac] = roundUsd(value).toFixed(2).split(".");
  return `${whole},${frac} USD`;
}
