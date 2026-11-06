"use client";

import { useEffect, useRef, useState } from "react";
import { suggestionPrompts } from "../../src/lib/generate.js";
import { formatUsd } from "../../src/lib/quote.js";
import { KIND_LABELS } from "../../src/lib/theme.js";
import { AppPreview } from "../../src/preview/AppPreview.jsx";
import { safePreviewSrc } from "./api.js";
import { Brand } from "./Brand.jsx";
import { PromptForm } from "./PromptForm.jsx";

const LIMITS_TEXT = "Límites: sin red del host, sin socket de Docker, 0,5 CPU, 512 MB, solo la carpeta del proyecto.";
const DOCKER_ABSENT = "Docker no está en este alojamiento y la preview del navegador sigue activa.";

const secondaryButton =
  "w-full rounded-full border border-line bg-paper px-4 py-2 text-sm enabled:hover:border-seal disabled:opacity-40 lg:w-auto";
const primaryButton =
  "w-full rounded-full bg-seal px-4 py-2 text-sm font-medium text-white hover:bg-seal-ink disabled:opacity-60 lg:w-auto";
const dangerButton =
  "w-full rounded-full border border-red-300 bg-paper px-4 py-2 text-sm text-red-900 enabled:hover:border-red-400 disabled:opacity-40 lg:w-auto";

function turnCost(turn) {
  const value = turn?.costUsd ?? turn?.cost_usd;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function turnDuration(turn) {
  const value = turn?.durationMs ?? turn?.duration_ms;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function runDuration(run) {
  const value = run?.durationMs ?? run?.duration_ms;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function Studio({ user, detail, onLogout, onBack, onTurn, onDelete, onDownload, call }) {
  const project = detail.project;
  const capUsd = detail.capUsd;
  const source = detail.source ?? "";
  const turns = detail.turns ?? [];
  const kind = project.spec?.kind ?? project.kind;
  const title = project.spec?.title || project.title || "Sin título";
  const [draft, setDraft] = useState("");
  const [tab, setTab] = useState("preview");
  const [pending, setPending] = useState("");
  const [actionError, setActionError] = useState("");
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState("");
  const [checking, setChecking] = useState(false);
  const [run, setRun] = useState(null);
  const lock = useRef(false);
  const callRef = useRef(call);
  const previewRef = useRef(null);
  callRef.current = call;
  const busy = pending !== "";
  const spent = Number(project.spentUsd) || 0;
  const cap = Number(capUsd) || 0;
  const meterMax = Math.max(1, Math.round(cap * 100));
  const meterNow = Math.min(meterMax, Math.max(0, Math.round(spent * 100)));
  const meterWidth = cap > 0 ? Math.min(100, (spent / cap) * 100) : 0;
  const suggestions = suggestionPrompts(project.spec).map((prompt, index) => ({ id: `${index}-${prompt}`, prompt }));
  const previewSrc = safePreviewSrc(run?.previewUrl ?? run?.preview_url);
  const duration = run ? runDuration(run) : null;

  useEffect(() => {
    if (tab !== "sandbox") return undefined;
    let cancel = false;
    setChecking(true);
    setStatusError("");
    callRef
      .current("/api/sandbox/status")
      .then((data) => {
        if (!cancel) setStatus(data ?? {});
      })
      .catch((error) => {
        if (cancel || error?.status === 401) return;
        setStatusError(error?.message || "No he podido comprobar Docker.");
      })
      .finally(() => {
        if (!cancel) setChecking(false);
      });
    return () => {
      cancel = true;
    };
  }, [tab]);

  async function runTask(name, task) {
    if (lock.current) {
      const error = new Error("Ya hay una petición en curso.");
      error.code = "busy";
      throw error;
    }
    lock.current = true;
    setPending(name);
    try {
      await task();
    } finally {
      lock.current = false;
      setPending("");
    }
  }

  function report(error) {
    if (error?.code === "busy" || error?.status === 401) return;
    setActionError(error?.message || "No se ha podido completar la petición.");
  }

  async function submitTurn(prompt) {
    setActionError("");
    await runTask("prompt", () => onTurn(project.id, prompt));
    setTab("preview");
    if (window.innerWidth < 1024) previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function logout() {
    if (busy || lock.current) return;
    setActionError("");
    try {
      await runTask("logout", onLogout);
    } catch (error) {
      report(error);
    }
  }

  async function back() {
    if (busy || lock.current) return;
    setActionError("");
    try {
      await runTask("back", onBack);
    } catch (error) {
      report(error);
    }
  }

  async function download() {
    if (busy || lock.current) return;
    setActionError("");
    try {
      await runTask("download", () => onDownload(project.id));
    } catch (error) {
      report(error);
    }
  }

  async function remove() {
    if (busy || lock.current) return;
    if (!window.confirm("¿Borrar este proyecto? No se puede deshacer.")) return;
    setActionError("");
    try {
      await runTask("delete", () => onDelete(project.id));
    } catch (error) {
      report(error);
    }
  }

  async function build() {
    if (busy || lock.current) return;
    setActionError("");
    try {
      await runTask("build", async () => {
        const data = await call(`/api/projects/${encodeURIComponent(project.id)}/sandbox`, { method: "POST" });
        setRun(data?.run ?? null);
      });
    } catch (error) {
      report(error);
    }
  }

  async function copySource() {
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
      setActionError("No se ha podido copiar el código desde este navegador.");
    }
  }

  const tabButton = (id, name) => (
    <button
      type="button"
      role="tab"
      id={`tab-${id}`}
      aria-selected={tab === id}
      aria-controls={`panel-${id}`}
      onClick={() => setTab(id)}
      className={`rounded-full px-3 py-1.5 text-sm sm:px-4 ${tab === id ? "bg-seal text-white" : ""}`}
    >
      {name}
    </button>
  );

  return (
    <div className="min-h-screen overflow-x-hidden bg-paper text-ink">
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <Brand />
            <p className="min-w-0 flex-1 truncate text-sm">{user?.name || user?.email}</p>
            <div className="flex w-full flex-col gap-2 lg:w-auto lg:flex-row lg:flex-wrap">
              <button type="button" onClick={back} disabled={busy} className={secondaryButton}>
                Proyectos
              </button>
              <button type="button" onClick={download} disabled={busy} className={primaryButton}>
                {pending === "download" ? "Descargando…" : "Descargar proyecto"}
              </button>
              <button type="button" onClick={remove} disabled={busy} className={dangerButton}>
                {pending === "delete" ? "Borrando…" : "Borrar proyecto"}
              </button>
              <button type="button" onClick={logout} disabled={busy} className={secondaryButton}>
                {pending === "logout" ? "Saliendo…" : "Salir"}
              </button>
            </div>
          </div>
          <div className="min-w-0">
            <div
              className="h-2 overflow-hidden rounded-full bg-line"
              role="meter"
              aria-label="Gasto del proyecto"
              aria-valuemin={0}
              aria-valuemax={meterMax}
              aria-valuenow={meterNow}
            >
              <div className="h-2 bg-seal" style={{ width: `${meterWidth}%` }} />
            </div>
            <p className="mt-1 text-xs text-ink/70">
              {formatUsd(spent)} de {formatUsd(cap)}.
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
        <section className="flex min-w-0 flex-col gap-4">
          <div>
            <h1 className="font-serif text-3xl leading-tight break-words">{title}</h1>
            <p className="mt-2 text-sm leading-relaxed text-ink/75">
              {KIND_LABELS[kind] ?? "App"}. Describes el cambio, ves el precio y confirmas. Si no cabe en el tope, no se envía.
            </p>
          </div>

          {actionError ? (
            <p className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm break-words text-red-900" role="alert">
              {actionError}
            </p>
          ) : null}

          <PromptForm
            id="prompt"
            examples={suggestions}
            examplesTitle="Cambios de ejemplo"
            draft={draft}
            onDraft={setDraft}
            spentUsd={spent}
            capUsd={cap}
            busy={busy}
            submitLabel="Aplicar"
            pendingLabel={pending === "prompt" ? "Generando…" : "Aplicar"}
            showPriceOnButton
            onSubmitPrompt={submitTurn}
          />

          {turns.length > 0 ? (
            <ol className="space-y-3" aria-label="Pasadas de este proyecto">
              {turns.map((turn, index) => {
                const cost = turnCost(turn);
                const ms = turnDuration(turn);
                return (
                  <li key={turn.id ?? index} className="rounded-xl border border-line bg-card px-3 py-3 text-sm break-words">
                    <p className="text-xs uppercase tracking-wide text-ink/50">Prompt</p>
                    <p className="mt-1 whitespace-pre-wrap">{turn.prompt}</p>
                    {turn.reply ? <p className="mt-2 whitespace-pre-wrap text-ink/80">{turn.reply}</p> : null}
                    {cost != null || ms != null ? (
                      <p className="mt-2 text-xs text-ink/60">
                        {cost != null ? formatUsd(cost) : ""}
                        {cost != null && ms != null ? " · " : ""}
                        {ms != null ? `${ms} ms` : ""}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          ) : null}
        </section>

        <section ref={previewRef} className="min-w-0" aria-busy={pending === "prompt"}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div role="tablist" aria-label="Vista de la app" className="flex max-w-full flex-wrap rounded-full border border-line bg-card p-1">
              {tabButton("preview", "Preview")}
              {tabButton("code", "Código")}
              {tabButton("sandbox", "Sandbox")}
            </div>
            <p className="text-xs text-ink/60">React + Vite + Tailwind</p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-line bg-card shadow-sm">
            <div className="flex min-w-0 items-center gap-2 border-b border-line px-3 py-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-300" />
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-300" />
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-300" />
              <span className="ml-2 min-w-0 truncate text-xs text-ink/60">{title}</span>
              {pending === "prompt" ? <span className="ml-auto shrink-0 text-xs text-seal">Generando la preview…</span> : null}
            </div>

            {tab === "preview" ? (
              <div role="tabpanel" id="panel-preview" aria-labelledby="tab-preview" key={project.spec?.revision ?? "empty"}>
                <AppPreview project={project.spec} />
              </div>
            ) : null}

            {tab === "code" ? (
              <div role="tabpanel" id="panel-code" aria-labelledby="tab-code" className="bg-ink text-paper">
                {source ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
                      <p className="text-sm">src/App.jsx</p>
                      <button type="button" onClick={copySource} className="rounded-full bg-white/10 px-3 py-1 text-sm">
                        {copied ? "Copiado" : "Copiar"}
                      </button>
                    </div>
                    <p className="border-b border-white/10 px-4 py-2 text-xs leading-relaxed text-paper/80">
                      Puedes copiar este archivo. El proyecto completo se descarga en un zip.
                    </p>
                    <pre className="max-h-[640px] max-w-full overflow-auto p-4 text-xs leading-relaxed">
                      <code>{source}</code>
                    </pre>
                  </>
                ) : (
                  <p className="px-6 py-16 text-center text-sm text-paper/80">El código aparece con la primera preview.</p>
                )}
              </div>
            ) : null}

            {tab === "sandbox" ? (
              <div role="tabpanel" id="panel-sandbox" aria-labelledby="tab-sandbox" className="space-y-3 px-4 py-4 text-sm">
                <p>{LIMITS_TEXT}</p>
                {checking ? <p className="text-ink/70">Comprobando si Docker está disponible…</p> : null}
                {status?.available === false ? <p>{DOCKER_ABSENT}</p> : null}
                {status?.available === true ? <p className="text-ink/70">Docker está disponible en este alojamiento.</p> : null}
                {statusError ? (
                  <p className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm break-words text-red-900" role="alert">
                    {statusError}
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={build}
                  disabled={busy}
                  className="w-full rounded-xl bg-seal px-4 py-3 font-medium text-white hover:bg-seal-ink disabled:opacity-60"
                >
                  {pending === "build" ? "Construyendo…" : "Construir en Docker"}
                </button>
                {run ? (
                  <div className="space-y-3">
                    <p>
                      {run.ok ? "La construcción ha terminado." : "La construcción ha fallado."}
                      {run.compiled ? " El proyecto compiló." : ""}
                      {duration != null ? ` ${duration} ms.` : ""}
                    </p>
                    <pre className="max-h-80 max-w-full overflow-auto rounded-xl bg-ink p-4 text-xs leading-relaxed break-words whitespace-pre-wrap text-paper">
                      {run.log ?? ""}
                    </pre>
                    {previewSrc ? (
                      <iframe title="Sandbox" sandbox="allow-scripts" src={previewSrc} className="h-96 w-full max-w-full rounded-xl border border-line bg-white" />
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  );
}
