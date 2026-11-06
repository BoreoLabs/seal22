"use client";

import { useState } from "react";
import { formatUsd } from "../../src/lib/quote.js";
import { assessPrompt, PriceBox, promptAllowed } from "./PriceBox.jsx";

export function PromptForm({
  id,
  examples,
  examplesTitle,
  draft,
  onDraft,
  spentUsd,
  capUsd,
  busy,
  submitLabel,
  pendingLabel,
  showPriceOnButton = false,
  onSubmitPrompt,
}) {
  const [error, setError] = useState("");
  const view = assessPrompt(draft, spentUsd, capUsd);
  const label = busy
    ? pendingLabel
    : showPriceOnButton && view.hasDraft
      ? `${submitLabel} por ${formatUsd(view.quote.usd)}`
      : submitLabel;

  function onKeyDown(event) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (busy) return;
    const gate = promptAllowed(draft, spentUsd, capUsd);
    if (!gate.ok) {
      setError(gate.message);
      return;
    }
    setError("");
    try {
      await onSubmitPrompt(gate.prompt);
      onDraft("");
    } catch (caught) {
      if (caught?.code === "busy" || caught?.status === 401) return;
      setError(caught?.message || "No se ha podido completar la petición.");
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div>
        <p className="text-sm font-medium">{examplesTitle}</p>
        <ul className="mt-2 flex flex-col gap-2">
          {examples.map((example) => (
            <li key={example.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  onDraft(example.prompt);
                  setError("");
                }}
                className="w-full rounded-xl border border-line bg-card px-3 py-2 text-left text-sm break-words hover:border-seal disabled:opacity-60"
              >
                {example.prompt}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <label htmlFor={id} className="text-sm font-medium">
          Prompt
        </label>
        <textarea
          id={id}
          name="prompt"
          rows={4}
          value={draft}
          disabled={busy}
          onChange={(event) => {
            onDraft(event.target.value);
            setError("");
          }}
          onKeyDown={onKeyDown}
          placeholder="Una lista de tareas para la panadería…"
          className="mt-2 w-full resize-y rounded-xl border border-line bg-card px-3 py-3 outline-none focus:border-seal disabled:opacity-60"
        />
        <p className="mt-1 text-xs text-ink/60">Ctrl+Enter también confirma el precio.</p>
      </div>

      <PriceBox draft={draft} spentUsd={spentUsd} capUsd={capUsd} />

      {error ? (
        <p className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm break-words text-red-900" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-xl bg-seal px-4 py-3 font-medium text-white hover:bg-seal-ink disabled:opacity-60"
      >
        {label}
      </button>
    </form>
  );
}
