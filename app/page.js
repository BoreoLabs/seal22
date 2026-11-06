"use client";

import { useEffect, useRef, useState } from "react";
import { SESSION_CAP_USD } from "../src/lib/quote.js";
import { AuthScreen } from "./components/AuthScreen.jsx";
import { Dashboard } from "./components/Dashboard.jsx";
import { Studio } from "./components/Studio.jsx";
import { api, projectPath, saveBlob } from "./components/api.js";
import { promptAllowed } from "./components/PriceBox.jsx";
import { Brand } from "./components/Brand.jsx";

function money(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeProjects(payload) {
  const list = Array.isArray(payload?.projects) ? payload.projects : [];
  return list.map((project) => ({
    id: project.id,
    title: project.title ?? "",
    kind: project.kind ?? "",
    accent: project.accent ?? "",
    spentUsd: money(project.spentUsd ?? project.spent_usd),
    updatedAt: project.updatedAt ?? project.updated_at ?? "",
  }));
}

function sourceFrom(payload) {
  if (typeof payload?.source === "string" && payload.source.length > 0) return payload.source;
  const files = Array.isArray(payload?.files) ? payload.files : [];
  const appFile = files.find((file) => file?.path === "src/App.jsx" && typeof file.contents === "string");
  if (appFile) return appFile.contents;
  return typeof payload?.source === "string" ? payload.source : "";
}

function normalizeDetail(payload) {
  const project = payload?.project ?? {};
  const spec = project.spec && typeof project.spec === "object" ? project.spec : null;
  const capValue = payload?.capUsd ?? payload?.cap_usd;
  return {
    project: {
      ...project,
      title: spec?.title || project.title || "Sin título",
      kind: spec?.kind || project.kind || "",
      accent: spec?.accent || project.accent || "",
      spentUsd: money(project.spentUsd ?? project.spent_usd),
      spec,
    },
    turns: Array.isArray(payload?.turns) ? payload.turns : [],
    files: Array.isArray(payload?.files) ? payload.files : [],
    source: sourceFrom(payload),
    capUsd: capValue == null ? SESSION_CAP_USD : money(capValue),
  };
}

function LoadingScreen() {
  return (
    <div className="grid min-h-screen place-items-center overflow-x-hidden bg-paper px-4 text-ink">
      <div className="text-center">
        <Brand heading />
        <p className="mt-4 text-sm text-ink/70" role="status">
          Cargando la sesión…
        </p>
      </div>
    </div>
  );
}

export default function Page() {
  const [phase, setPhase] = useState("loading");
  const [user, setUser] = useState(null);
  const [projects, setProjects] = useState([]);
  const [studio, setStudio] = useState(null);
  const [notice, setNotice] = useState("");
  const [listError, setListError] = useState("");
  const userRef = useRef(null);

  function dropSession(expired) {
    userRef.current = null;
    setUser(null);
    setProjects([]);
    setStudio(null);
    setListError("");
    setNotice(expired ? "La sesión ha caducado. Entra otra vez." : "");
    setPhase("auth");
  }

  async function call(path, options) {
    try {
      return await api(path, options);
    } catch (error) {
      if (error?.status === 401) dropSession(Boolean(userRef.current));
      throw error;
    }
  }

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const me = await api("/api/auth/me");
        if (cancel) return;
        if (!me?.user) {
          setPhase("auth");
          return;
        }
        userRef.current = me.user;
        setUser(me.user);
        try {
          const list = await api("/api/projects");
          if (cancel) return;
          setProjects(normalizeProjects(list));
        } catch (error) {
          if (cancel) return;
          if (error?.status === 401) {
            dropSession(false);
            return;
          }
          setListError(error?.message || "No he podido cargar los proyectos.");
        }
        if (!cancel) setPhase("dashboard");
      } catch (error) {
        if (cancel) return;
        if (error?.status === 401) {
          setPhase("auth");
          return;
        }
        setNotice(error?.message || "No he podido comprobar la sesión.");
        setPhase("auth");
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  async function enter(data) {
    if (!data?.user) throw new Error("El servidor no ha devuelto la cuenta.");
    userRef.current = data.user;
    setUser(data.user);
    setNotice("");
    const list = await call("/api/projects");
    setProjects(normalizeProjects(list));
    setListError("");
    setPhase("dashboard");
  }

  async function onLogin(body) {
    setNotice("");
    const data = await api("/api/auth/login", { method: "POST", body });
    await enter(data);
  }

  async function onRegister(body) {
    setNotice("");
    const data = await call("/api/auth/register", { method: "POST", body });
    await enter(data);
  }

  async function onLogout() {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch (error) {
      if (error?.status !== 401) throw error;
    }
    dropSession(false);
  }

  async function onCreate(prompt) {
    const gate = promptAllowed(prompt, 0, SESSION_CAP_USD);
    if (!gate.ok) throw new Error(gate.message);
    const created = await call("/api/projects", { method: "POST", body: { prompt: gate.prompt } });
    const id = created?.project?.id;
    if (!id) throw new Error("El servidor no ha devuelto el proyecto.");
    const detail = await call(projectPath(id));
    setStudio(normalizeDetail(detail));
    setListError("");
    setPhase("studio");
  }

  async function onOpen(id) {
    const detail = await call(projectPath(id));
    setStudio(normalizeDetail(detail));
    setPhase("studio");
  }

  async function onBack() {
    setStudio(null);
    setPhase("dashboard");
    try {
      const list = await call("/api/projects");
      setProjects(normalizeProjects(list));
      setListError("");
    } catch (error) {
      if (error?.status === 401) throw error;
      setListError(error?.message || "No he podido cargar los proyectos.");
    }
  }

  async function onTurn(id, prompt) {
    const spent = studio?.project?.id === id ? studio.project.spentUsd : 0;
    const cap = studio?.project?.id === id ? studio.capUsd : SESSION_CAP_USD;
    const gate = promptAllowed(prompt, spent, cap);
    if (!gate.ok) throw new Error(gate.message);
    await call(projectPath(id, "/turns"), { method: "POST", body: { prompt: gate.prompt } });
    const detail = await call(projectPath(id));
    setStudio(normalizeDetail(detail));
  }

  async function onDelete(id) {
    await call(projectPath(id), { method: "DELETE" });
    setStudio(null);
    setPhase("dashboard");
    try {
      const list = await call("/api/projects");
      setProjects(normalizeProjects(list));
      setListError("");
    } catch (error) {
      if (error?.status === 401) throw error;
      setProjects((current) => current.filter((project) => project.id !== id));
      setListError(error?.message || "El proyecto se ha borrado, pero no he podido refrescar la lista.");
    }
  }

  async function onDownload(id) {
    const blob = await call(projectPath(id, "/export"), { blob: true });
    saveBlob(blob, "seal22-proyecto.zip");
  }

  if (phase === "loading") return <LoadingScreen />;
  if (phase === "auth" || !user) return <AuthScreen notice={notice} onLogin={onLogin} onRegister={onRegister} />;
  if (phase === "studio" && studio?.project?.id) {
    return (
      <Studio
        user={user}
        detail={studio}
        onLogout={onLogout}
        onBack={onBack}
        onTurn={onTurn}
        onDelete={onDelete}
        onDownload={onDownload}
        call={call}
      />
    );
  }
  return <Dashboard user={user} projects={projects} listError={listError} onLogout={onLogout} onOpen={onOpen} onCreate={onCreate} />;
}
