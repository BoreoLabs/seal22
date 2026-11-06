import { useRef, useState } from "react";
import { applyPrompt, describeAction, suggestionPrompts } from "./lib/generate.js";
import { canAfford, formatUsd, quotePrompt, roundUsd, SESSION_CAP_USD } from "./lib/quote.js";
import { renderSource } from "./lib/source.js";
import { AppPreview } from "./preview/AppPreview.jsx";

const ERRORS = {
  empty: "Escribe qué app quieres antes de generar.",
  unknown: "No he podido aplicar ese cambio. Prueba con un color, el título, «añade…» o «quita…».",
};

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export default function App() {
  const [draft, setDraft] = useState("");
  const [project, setProject] = useState(null);
  const [spent, setSpent] = useState(0);
  const [turns, setTurns] = useState([]);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState("preview");
  const [copied, setCopied] = useState(false);
  const runId = useRef(0);
  const previewRef = useRef(null);

  const quote = quotePrompt(draft);
  const hasDraft = draft.trim().length > 0;
  const fits = !hasDraft || canAfford(spent, quote.usd);
  const remaining = roundUsd(SESSION_CAP_USD - spent);
  const suggestions = suggestionPrompts(project);
  const source = renderSource(project);
  const meterNow = Math.round(spent * 100);
  const meterMax = Math.round(SESSION_CAP_USD * 100);

  async function onSubmit(event) {
    event.preventDefault();
    if (running) return;
    const prompt = draft.trim();
    if (!prompt) {
      setError(ERRORS.empty);
      return;
    }
    const nextQuote = quotePrompt(prompt);
    if (!canAfford(spent, nextQuote.usd)) {
      setError(
        `Esa petición son ${formatUsd(nextQuote.usd)} y quedan ${formatUsd(remaining)}. El tope es ${formatUsd(SESSION_CAP_USD)} y no se supera.`,
      );
      return;
    }
    const result = applyPrompt(project, prompt);
    if (!result.ok) {
      setError(ERRORS[result.code] ?? ERRORS.unknown);
      return;
    }

    const id = runId.current + 1;
    runId.current = id;
    setRunning(true);
    setError("");
    const started = performance.now();
    await delay(450);
    if (runId.current !== id) return;

    const ms = Math.round(performance.now() - started);
    const nextSpent = roundUsd(spent + nextQuote.usd);
    const left = roundUsd(SESSION_CAP_USD - nextSpent);
    const reply = `${describeAction(result.action, result.project)} Coste confirmado ${formatUsd(nextQuote.usd)}. Quedan ${formatUsd(left)}. Tardó ${ms} ms.`;
    setProject(result.project);
    setSpent(nextSpent);
    setDraft("");
    setTab("preview");
    setTurns((current) => [...current, { id, prompt, reply }]);
    setRunning(false);
    if (window.innerWidth < 1024) {
      previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function reset() {
    runId.current += 1;
    setDraft("");
    setProject(null);
    setSpent(0);
    setTurns([]);
    setError("");
    setRunning(false);
    setTab("preview");
    setCopied(false);
  }

  function onPromptKeyDown(event) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  async function copySource() {
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
      setError("No se ha podido copiar el código desde este navegador.");
    }
  }

  function downloadSource() {
    const blob = new Blob([source], { type: "text/javascript;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "App.jsx";
    link.click();
    URL.revokeObjectURL(url);
  }

  const submitLabel = running
    ? "Generando…"
    : !hasDraft
      ? project
        ? "Aplicar"
        : "Generar"
      : `${project ? "Aplicar" : "Generar"} por ${formatUsd(quote.usd)}`;

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-seal font-semibold text-white">22</span>
            <div>
              <p className="font-serif text-2xl leading-none">Seal22</p>
              <p className="mt-1 text-sm text-ink/70">Alpha local · proveedor alpha-local</p>
            </div>
          </div>
          <div className="min-w-56 flex-1">
            <div
              className="h-2 overflow-hidden rounded-full bg-line"
              role="meter"
              aria-label="Gasto de la sesión"
              aria-valuemin={0}
              aria-valuemax={meterMax}
              aria-valuenow={meterNow}
            >
              <div className="h-2 bg-seal" style={{ width: `${Math.min(100, (spent / SESSION_CAP_USD) * 100)}%` }} />
            </div>
            <p className="mt-1 text-xs text-ink/70">
              {formatUsd(spent)} de {formatUsd(SESSION_CAP_USD)}. La alpha no llama a un modelo: el precio es el que confirmarías antes de ejecutar.
            </p>
          </div>
          <button
            type="button"
            onClick={reset}
            disabled={!project && spent === 0 && turns.length === 0}
            className="rounded-full border border-line bg-paper px-4 py-2 text-sm enabled:hover:border-seal disabled:opacity-40"
          >
            Empezar de cero
          </button>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
        <section className="flex flex-col gap-4">
          <div>
            <h1 className="font-serif text-3xl leading-tight">De un prompt a una preview, con el precio delante.</h1>
            <p className="mt-2 text-sm leading-relaxed text-ink/75">
              Describes la app, ves lo que cuesta y confirmas. Si no cabe en el tope, no se genera. Luego la retocas con otro prompt.
            </p>
          </div>

          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <div>
              <p className="text-sm font-medium">{project ? "Cambios de ejemplo" : "Pruebas de ejemplo"}</p>
              <ul className="mt-2 flex flex-col gap-2">
                {suggestions.map((example) => (
                  <li key={example}>
                    <button
                      type="button"
                      onClick={() => {
                        setDraft(example);
                        setError("");
                      }}
                      className="w-full rounded-xl border border-line bg-card px-3 py-2 text-left text-sm hover:border-seal"
                    >
                      {example}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <label htmlFor="prompt" className="text-sm font-medium">
                Prompt
              </label>
              <textarea
                id="prompt"
                name="prompt"
                rows={4}
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setError("");
                }}
                onKeyDown={onPromptKeyDown}
                placeholder="Una lista de tareas para la panadería…"
                className="mt-2 w-full resize-y rounded-xl border border-line bg-card px-3 py-3 outline-none focus:border-seal"
              />
              <p className="mt-1 text-xs text-ink/60">Ctrl+Enter también confirma el precio.</p>
            </div>

            <div className={`rounded-xl border px-3 py-3 text-sm ${fits ? "border-line bg-card" : "border-red-300 bg-red-50"}`} aria-live="polite">
              {hasDraft ? (
                <>
                  <p>
                    Precio de esta petición: <strong>{formatUsd(quote.usd)}</strong>
                  </p>
                  <p className="mt-1 text-ink/70">
                    {formatUsd(0.06)} de base + {formatUsd(0.01)} × {quote.blocks} {quote.blocks === 1 ? "bloque" : "bloques"} de 200 caracteres.
                  </p>
                  <p className="mt-1 text-ink/70">
                    {fits
                      ? `Después quedarían ${formatUsd(roundUsd(remaining - quote.usd))}.`
                      : `No cabe. Quedan ${formatUsd(remaining)} y el tope es ${formatUsd(SESSION_CAP_USD)}.`}
                  </p>
                </>
              ) : (
                <p>
                  Desde {formatUsd(0.06)}, más {formatUsd(0.01)} por cada 200 caracteres. Tope de la sesión: {formatUsd(SESSION_CAP_USD)}.
                </p>
              )}
            </div>

            {error ? (
              <p className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900" role="alert">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={running}
              className="rounded-xl bg-seal px-4 py-3 font-medium text-white hover:bg-seal-ink disabled:opacity-60"
            >
              {submitLabel}
            </button>
          </form>

          {turns.length > 0 ? (
            <ol className="space-y-3" aria-label="Pasadas de esta sesión">
              {turns.map((turn) => (
                <li key={turn.id} className="rounded-xl border border-line bg-card px-3 py-3 text-sm">
                  <p className="text-xs uppercase tracking-wide text-ink/50">Prompt</p>
                  <p className="mt-1">{turn.prompt}</p>
                  <p className="mt-2 text-ink/80">{turn.reply}</p>
                </li>
              ))}
            </ol>
          ) : null}
        </section>

        <section ref={previewRef} className="min-w-0" aria-busy={running}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div role="tablist" aria-label="Vista de la app" className="flex rounded-full border border-line bg-card p-1">
              <button
                type="button"
                role="tab"
                aria-selected={tab === "preview"}
                onClick={() => setTab("preview")}
                className={`rounded-full px-4 py-1.5 text-sm ${tab === "preview" ? "bg-seal text-white" : ""}`}
              >
                Preview
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "code"}
                onClick={() => setTab("code")}
                className={`rounded-full px-4 py-1.5 text-sm ${tab === "code" ? "bg-seal text-white" : ""}`}
              >
                Código
              </button>
            </div>
            <p className="text-xs text-ink/60">React + Vite + Tailwind · sin backend</p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-line bg-card shadow-sm">
            <div className="flex items-center gap-2 border-b border-line px-3 py-2">
              <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
              <span className="ml-2 truncate text-xs text-ink/60">{project ? project.title : "sin proyecto"}</span>
              {running ? <span className="ml-auto text-xs text-seal">Generando la preview…</span> : null}
            </div>

            {tab === "preview" ? (
              <div key={project?.revision ?? "empty"}>
                <AppPreview project={project} />
              </div>
            ) : (
              <div className="bg-ink text-paper">
                {project ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
                      <p className="text-sm">src/App.jsx</p>
                      <div className="flex gap-2">
                        <button type="button" onClick={copySource} className="rounded-full bg-white/10 px-3 py-1 text-sm">
                          {copied ? "Copiado" : "Copiar"}
                        </button>
                        <button type="button" onClick={downloadSource} className="rounded-full bg-white/10 px-3 py-1 text-sm">
                          Descargar
                        </button>
                      </div>
                    </div>
                    <pre className="max-h-[640px] overflow-auto p-4 text-xs leading-relaxed">
                      <code>{source}</code>
                    </pre>
                  </>
                ) : (
                  <p className="px-6 py-16 text-center text-sm text-paper/80">El código aparece con la primera preview.</p>
                )}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
