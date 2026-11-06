import { BASE_USD, BLOCK_USD, canAfford, formatUsd, quotePrompt, roundUsd } from "../../src/lib/quote.js";

export const EMPTY_PROMPT = "Escribe qué app quieres antes de generar.";

function money(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function assessPrompt(draft, spentUsd, capUsd) {
  const quote = quotePrompt(draft);
  const hasDraft = String(draft ?? "").trim().length > 0;
  const spent = money(spentUsd);
  const cap = money(capUsd);
  const remaining = roundUsd(cap - spent);
  const nextSpent = roundUsd(spent + (hasDraft ? quote.usd : 0));
  const fits = !hasDraft || (canAfford(spent, quote.usd) && nextSpent <= roundUsd(cap));
  return { quote, hasDraft, spent, cap, remaining, nextSpent, fits };
}

export function overCapMessage(view) {
  return `Esa petición son ${formatUsd(view.quote.usd)} y quedan ${formatUsd(view.remaining)}. El tope es ${formatUsd(view.cap)} y no se supera.`;
}

export function promptAllowed(draft, spentUsd, capUsd) {
  const view = assessPrompt(draft, spentUsd, capUsd);
  const prompt = String(draft ?? "").trim();
  if (!prompt) return { ok: false, message: EMPTY_PROMPT, view };
  if (!view.fits) return { ok: false, message: overCapMessage(view), view };
  return { ok: true, prompt, view };
}

export function PriceBox({ draft, spentUsd, capUsd }) {
  const view = assessPrompt(draft, spentUsd, capUsd);
  const after = roundUsd(view.remaining - (view.hasDraft ? view.quote.usd : 0));
  return (
    <div
      className={`rounded-xl border px-3 py-3 text-sm ${view.fits ? "border-line bg-card" : "border-red-300 bg-red-50"}`}
      aria-live="polite"
    >
      {view.hasDraft ? (
        <>
          <p>
            Precio de esta petición: <strong>{formatUsd(view.quote.usd)}</strong>
          </p>
          <p className="mt-1 text-ink/70">
            {formatUsd(BASE_USD)} de base + {formatUsd(BLOCK_USD)} × {view.quote.blocks}{" "}
            {view.quote.blocks === 1 ? "bloque" : "bloques"} de 200 caracteres.
          </p>
          <p className="mt-1 text-ink/70">
            {view.fits
              ? `Después quedarían ${formatUsd(after)}.`
              : `No cabe. Quedan ${formatUsd(view.remaining)} y el tope es ${formatUsd(view.cap)}.`}
          </p>
        </>
      ) : (
        <p>
          Desde {formatUsd(BASE_USD)}, más {formatUsd(BLOCK_USD)} por cada 200 caracteres. Tope del proyecto: {formatUsd(view.cap)}.
        </p>
      )}
    </div>
  );
}
