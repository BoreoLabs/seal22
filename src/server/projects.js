import { randomUUID } from "node:crypto";
import { describeAction } from "../lib/generate.js";
import { canAfford, formatUsd, quotePrompt, roundUsd, SESSION_CAP_USD } from "../lib/quote.js";
import { sql } from "./db.js";
import { filesForProject } from "./files.js";
import { runProvider } from "./provider.js";
import { removeRepo, syncRepo } from "./repo.js";

const EMPTY_ERROR = "Escribe qué app quieres antes de generar.";
const INVALID_ERROR = "Ese prompt es demasiado largo.";
const UNKNOWN_ERROR = "No he podido aplicar ese cambio. Prueba con un color, el título, «añade…» o «quita…».";
const NOT_FOUND = "No encuentro ese proyecto.";

let clockMs = 0;

function stamp() {
  const now = Date.now();
  clockMs = Math.max(now, clockMs + 1);
  return new Date(clockMs).toISOString();
}

function iso(value) {
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString();
}

function money(value) {
  return roundUsd(Number(value));
}

function readSpec(value) {
  if (typeof value === "string") return JSON.parse(value);
  return value ?? null;
}

function normalizePrompt(prompt) {
  if (typeof prompt !== "string") return "";
  return prompt.trim();
}

function rejectPrompt(prompt) {
  if (!prompt) return { ok: false, status: 400, code: "empty", error: EMPTY_ERROR };
  if (prompt.length > 4000) return { ok: false, status: 400, code: "invalid", error: INVALID_ERROR };
  return null;
}

function rejectOutcome(outcome) {
  if (outcome?.ok) return null;
  if (outcome?.code === "empty") {
    return { ok: false, status: 400, code: "empty", error: EMPTY_ERROR };
  }
  return {
    ok: false,
    status: 400,
    code: outcome?.code || "unknown",
    error: UNKNOWN_ERROR,
  };
}

function rejectCap(spent, quote) {
  if (canAfford(spent, quote.usd)) return null;
  const remaining = roundUsd(SESSION_CAP_USD - roundUsd(spent));
  return {
    ok: false,
    status: 402,
    code: "cap",
    error: `Esa petición son ${formatUsd(quote.usd)} y quedan ${formatUsd(remaining)}. El tope es ${formatUsd(SESSION_CAP_USD)} y no se supera.`,
  };
}

function replyFor(outcome, quote, spentNext, durationMs) {
  const left = roundUsd(SESSION_CAP_USD - spentNext);
  return `${describeAction(outcome.action, outcome.project)} Coste confirmado ${formatUsd(quote.usd)}. Quedan ${formatUsd(left)}. Tardó ${durationMs} ms.`;
}

function mapSummary(row) {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    accent: row.accent,
    spentUsd: money(row.spent_usd),
    updatedAt: iso(row.updated_at),
  };
}

function mapProject(row) {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    accent: row.accent,
    spec: readSpec(row.spec),
    spentUsd: money(row.spent_usd),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapTurn(row) {
  return {
    id: row.id,
    prompt: row.prompt,
    reply: row.reply,
    costUsd: money(row.cost_usd),
    durationMs: Number(row.duration_ms),
    compiled: row.compiled == null ? null : Boolean(row.compiled),
    createdAt: iso(row.created_at),
  };
}

async function mirrorRepo(projectId, files, message) {
  try {
    await syncRepo(projectId, files, message);
  } catch {
    // El repositorio es una copia. Si git falla, la base ya guardada sigue siendo la fuente.
  }
}

async function replaceFiles(projectId, files) {
  await sql("delete from project_files where project_id = $1", [projectId]);
  if (files.length === 0) return;
  await sql(
    `insert into project_files (project_id, path, contents)
     select $1, file.path, file.contents
     from jsonb_to_recordset($2::jsonb) as file(path text, contents text)`,
    [projectId, JSON.stringify(files.map((file) => ({ path: file.path, contents: String(file.contents ?? "") })))],
  );
}

async function loadOwned(userId, id) {
  const rows = await sql(
    `select id, user_id, title, kind, accent, spec, spent_usd, created_at, updated_at
     from projects
     where id = $1 and user_id = $2`,
    [id, userId],
  );
  return rows[0] ?? null;
}

function savedTurn(detail, turnId) {
  return detail?.turns.find((turn) => turn.id === turnId) ?? null;
}

export async function listProjects(userId) {
  const rows = await sql(
    `select id, title, kind, accent, spent_usd, updated_at
     from projects
     where user_id = $1
     order by updated_at desc, id desc`,
    [userId],
  );
  return rows.map(mapSummary);
}

export async function getProject(userId, id) {
  const row = await loadOwned(userId, id);
  if (!row) return null;

  const turnRows = await sql(
    `select id, prompt, reply, cost_usd, duration_ms, compiled, created_at
     from turns
     where project_id = $1
     order by created_at asc, id asc`,
    [row.id],
  );
  const fileRows = await sql(
    `select path, contents
     from project_files
     where project_id = $1
     order by path asc`,
    [row.id],
  );
  const files = fileRows.map((file) => ({ path: file.path, contents: file.contents }));
  const source = files.find((file) => file.path === "src/App.jsx")?.contents ?? "";

  return {
    project: mapProject(row),
    turns: turnRows.map(mapTurn),
    files,
    source,
    capUsd: SESSION_CAP_USD,
  };
}

export async function createProject(userId, rawPrompt) {
  const prompt = normalizePrompt(rawPrompt);
  const rejected = rejectPrompt(prompt);
  if (rejected) return rejected;

  const provided = await runProvider({ project: null, prompt });
  const outcome = provided.result;
  const failed = rejectOutcome(outcome);
  if (failed) return failed;

  const quote = quotePrompt(prompt);
  const blocked = rejectCap(0, quote);
  if (blocked) return blocked;

  const spec = outcome.project;
  const spent = roundUsd(quote.usd);
  const files = await filesForProject(spec);
  const projectId = randomUUID();
  const turnId = randomUUID();
  const when = stamp();
  const durationMs = provided.durationMs;
  const reply = replyFor(outcome, quote, spent, durationMs);

  await sql(
    `insert into projects (id, user_id, title, kind, accent, spec, spent_usd, created_at, updated_at)
     values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $8)`,
    [projectId, userId, spec.title, spec.kind, spec.accent, JSON.stringify(spec), spent, when],
  );
  await sql(
    `insert into turns (id, project_id, prompt, reply, cost_usd, duration_ms, created_at)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [turnId, projectId, prompt, reply, quote.usd, durationMs, when],
  );
  await replaceFiles(projectId, files);
  await mirrorRepo(projectId, files, prompt);

  const detail = await getProject(userId, projectId);
  const turn = savedTurn(detail, turnId);
  if (!detail || !turn) throw new Error("No he podido leer el proyecto guardado.");
  return { ok: true, project: detail.project, turn };
}

export async function applyTurn(userId, id, rawPrompt) {
  const prompt = normalizePrompt(rawPrompt);
  const rejected = rejectPrompt(prompt);
  if (rejected) return rejected;

  const existing = await loadOwned(userId, id);
  if (!existing) return { ok: false, status: 404, error: NOT_FOUND };

  const provided = await runProvider({ project: readSpec(existing.spec), prompt });
  const outcome = provided.result;
  const failed = rejectOutcome(outcome);
  if (failed) return failed;

  const spent = money(existing.spent_usd);
  const quote = quotePrompt(prompt);
  const blocked = rejectCap(spent, quote);
  if (blocked) return blocked;

  const spec = outcome.project;
  const spentNext = roundUsd(spent + quote.usd);
  const files = await filesForProject(spec);
  const turnId = randomUUID();
  const when = stamp();
  const durationMs = provided.durationMs;
  const reply = replyFor(outcome, quote, spentNext, durationMs);

  const updated = await sql(
    `update projects
     set title = $1, kind = $2, accent = $3, spec = $4::jsonb, spent_usd = $5, updated_at = $6
     where id = $7 and user_id = $8
     returning id`,
    [spec.title, spec.kind, spec.accent, JSON.stringify(spec), spentNext, when, id, userId],
  );
  if (updated.length === 0) return { ok: false, status: 404, error: NOT_FOUND };

  await sql(
    `insert into turns (id, project_id, prompt, reply, cost_usd, duration_ms, created_at)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [turnId, id, prompt, reply, quote.usd, durationMs, when],
  );
  await replaceFiles(id, files);
  await mirrorRepo(id, files, prompt);

  const detail = await getProject(userId, id);
  const turn = savedTurn(detail, turnId);
  if (!detail || !turn) throw new Error("No he podido leer el proyecto guardado.");
  return { ok: true, project: detail.project, turn };
}

export async function deleteProject(userId, id) {
  const rows = await sql("delete from projects where id = $1 and user_id = $2 returning id", [id, userId]);
  if (rows.length === 0) return false;
  await removeRepo(rows[0].id);
  return true;
}
