"use client";

import { useRef, useState } from "react";
import { formatUsd, SESSION_CAP_USD } from "../../src/lib/quote.js";
import { CATALOG } from "../../src/server/catalog.js";
import { KIND_LABELS } from "../../src/lib/theme.js";
import { Brand } from "./Brand.jsx";
import { PromptForm } from "./PromptForm.jsx";

const examples = CATALOG.filter((item) => !Object.hasOwn(item, "base")).map((item) => ({
  id: item.id,
  prompt: item.prompt,
}));

function formatStamp(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function Dashboard({ user, projects, listError, onLogout, onOpen, onCreate }) {
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState("");
  const [actionError, setActionError] = useState("");
  const lock = useRef(false);
  const busy = pending !== "";

  async function run(name, task) {
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

  async function logout() {
    setActionError("");
    try {
      await run("logout", onLogout);
    } catch (error) {
      if (error?.code === "busy" || error?.status === 401) return;
      setActionError(error.message);
    }
  }

  async function openProject(id) {
    setActionError("");
    try {
      await run("open", () => onOpen(id));
    } catch (error) {
      if (error?.code === "busy" || error?.status === 401) return;
      setActionError(error.message);
    }
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-paper text-ink">
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-4">
          <Brand />
          <p className="min-w-0 flex-1 truncate text-sm">{user?.name || user?.email}</p>
          <button
            type="button"
            onClick={logout}
            disabled={busy}
            className="w-full rounded-full border border-line bg-paper px-4 py-2 text-sm enabled:hover:border-seal disabled:opacity-40 lg:w-auto"
          >
            {pending === "logout" ? "Saliendo…" : "Salir"}
          </button>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
        <section className="min-w-0">
          <h1 className="font-serif text-3xl leading-tight">Nuevo proyecto</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink/75">
            Describes la app, ves lo que cuesta y confirmas. Si no cabe en el tope, no se crea.
          </p>
          <div className="mt-4">
            <PromptForm
              id="nuevo-prompt"
              examples={examples}
              examplesTitle="Pruebas de ejemplo"
              draft={draft}
              onDraft={setDraft}
              spentUsd={0}
              capUsd={SESSION_CAP_USD}
              busy={busy}
              submitLabel="Crear proyecto"
              pendingLabel={pending === "prompt" ? "Creando…" : "Crear proyecto"}
              onSubmitPrompt={(prompt) => run("prompt", () => onCreate(prompt))}
            />
          </div>
        </section>

        <section className="min-w-0">
          <h2 className="font-serif text-3xl leading-tight">Proyectos</h2>
          {actionError || listError ? (
            <p className="mt-3 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm break-words text-red-900" role="alert">
              {actionError || listError}
            </p>
          ) : null}
          {pending === "open" ? (
            <p className="mt-3 text-sm text-ink/70" role="status">
              Abriendo el proyecto…
            </p>
          ) : null}
          {projects.length === 0 ? (
            <div className="mt-4 rounded-xl border border-line bg-card px-6 py-12 text-center">
              <p className="font-serif text-2xl">Todavía no hay proyectos</p>
              <p className="mx-auto mt-2 max-w-sm text-sm text-ink/70">Escribe un prompt, mira el precio y crea el primero.</p>
            </div>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {projects.map((project) => {
                const stamp = formatStamp(project.updatedAt);
                return (
                  <li key={project.id}>
                    <button
                      type="button"
                      onClick={() => openProject(project.id)}
                      disabled={busy}
                      className="w-full rounded-xl border border-line bg-card px-4 py-3 text-left hover:border-seal disabled:opacity-60"
                    >
                      <span className="block font-serif text-2xl leading-tight break-words">{project.title || "Sin título"}</span>
                      <span className="mt-1 block text-sm text-ink/70">
                        {KIND_LABELS[project.kind] ?? "App"} · {formatUsd(project.spentUsd)}
                      </span>
                      {stamp ? <span className="mt-1 block text-xs text-ink/50">{stamp}</span> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
