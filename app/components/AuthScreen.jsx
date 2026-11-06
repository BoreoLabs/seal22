"use client";

import { useState } from "react";
import { formatUsd, SESSION_CAP_USD } from "../../src/lib/quote.js";
import { Brand } from "./Brand.jsx";

const fieldClass = "mt-1 w-full rounded-xl border border-line bg-paper px-3 py-2 outline-none focus:border-seal";

export function AuthScreen({ notice, onLogin, onRegister }) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const message = error || notice || "";

  function switchMode(next) {
    if (busy) return;
    setMode(next);
    setError("");
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (busy) return;
    const trimmedEmail = email.trim();
    const trimmedName = name.trim();
    if (mode === "register" && (!trimmedName || !trimmedEmail || !password)) {
      setError("Escribe el nombre, el correo y la contraseña.");
      return;
    }
    if (mode === "login" && (!trimmedEmail || !password)) {
      setError("Escribe el correo y la contraseña.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (mode === "register") {
        await onRegister({ name: trimmedName, email: trimmedEmail, password });
      } else {
        await onLogin({ email: trimmedEmail, password });
      }
    } catch (caught) {
      setError(caught?.message || "No se ha podido completar la petición.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-paper text-ink">
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-10">
        <Brand heading subtitle="Alpha local · proveedor alpha-local" />
        <div className="mt-6 rounded-xl border border-line bg-card p-4">
          <div role="tablist" aria-label="Cuenta" className="grid grid-cols-2 gap-1 rounded-full border border-line bg-paper p-1">
            <button
              type="button"
              role="tab"
              id="tab-login"
              aria-selected={mode === "login"}
              aria-controls="panel-account"
              disabled={busy}
              onClick={() => switchMode("login")}
              className={`rounded-full px-3 py-2 text-sm ${mode === "login" ? "bg-seal text-white" : ""}`}
            >
              Entrar
            </button>
            <button
              type="button"
              role="tab"
              id="tab-register"
              aria-selected={mode === "register"}
              aria-controls="panel-account"
              disabled={busy}
              onClick={() => switchMode("register")}
              className={`rounded-full px-3 py-2 text-sm ${mode === "register" ? "bg-seal text-white" : ""}`}
            >
              Crear cuenta
            </button>
          </div>

          <form id="panel-account" role="tabpanel" aria-labelledby={mode === "login" ? "tab-login" : "tab-register"} onSubmit={onSubmit} noValidate className="mt-4 flex flex-col gap-3">
            {mode === "register" ? (
              <div>
                <label htmlFor="account-name" className="text-sm font-medium">
                  Nombre
                </label>
                <input
                  id="account-name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  value={name}
                  disabled={busy}
                  onChange={(event) => setName(event.target.value)}
                  className={fieldClass}
                />
              </div>
            ) : null}
            <div>
              <label htmlFor="account-email" className="text-sm font-medium">
                Correo
              </label>
              <input
                id="account-email"
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                disabled={busy}
                onChange={(event) => setEmail(event.target.value)}
                className={fieldClass}
              />
            </div>
            <div>
              <label htmlFor="account-password" className="text-sm font-medium">
                Contraseña
              </label>
              <input
                id="account-password"
                name="password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                disabled={busy}
                onChange={(event) => setPassword(event.target.value)}
                className={fieldClass}
              />
            </div>

            {message ? (
              <p className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm break-words text-red-900" role="alert">
                {message}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-seal px-4 py-3 font-medium text-white hover:bg-seal-ink disabled:opacity-60"
            >
              {busy ? (mode === "login" ? "Entrando…" : "Creando cuenta…") : mode === "login" ? "Entrar" : "Crear cuenta"}
            </button>
          </form>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-ink/70">
          El proveedor es alpha-local, esta alpha no cobra dinero real, y cada proyecto tiene un tope de {formatUsd(SESSION_CAP_USD)}.
        </p>
      </main>
    </div>
  );
}
