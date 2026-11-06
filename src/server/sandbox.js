import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { copyFile, lstat, mkdir, readdir, realpath, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { sql } from "./db.js";
import { assertSafeRelative, safeJoin } from "./files.js";
import { SANDBOX_LIMITS } from "./limits.js";

const LOG_LIMIT = 8000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NAME_RE = /^seal22-sb-[0-9a-f]{12}$/;

export function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

export function workRoot() {
  return path.resolve(configuredDir(process.env.SEAL22_WORK_DIR, ".data/work"));
}

export function previewRoot() {
  return path.resolve(configuredDir(process.env.SEAL22_PREVIEW_DIR, ".data/previews"));
}

export function previewDirectory(runId) {
  if (!isUuid(runId)) throw new Error("ruta");
  const root = previewRoot();
  const dir = path.resolve(root, runId);
  if (!isInside(root, dir)) throw new Error("ruta");
  return dir;
}

export function containerArgs({ workDir, name, image }) {
  const abs = assertInsideWorkRoot(workDir);
  if (!NAME_RE.test(name)) throw new Error("ruta");
  if (image !== SANDBOX_LIMITS.image) throw new Error("ruta");
  return [
    "run",
    "--name",
    name,
    "--rm",
    "--network",
    SANDBOX_LIMITS.network,
    "--memory",
    `${SANDBOX_LIMITS.memoryMb}m`,
    "--memory-swap",
    `${SANDBOX_LIMITS.memoryMb}m`,
    "--cpus",
    String(SANDBOX_LIMITS.cpus),
    "--pids-limit",
    String(SANDBOX_LIMITS.pidsLimit),
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--read-only",
    "--tmpfs",
    "/tmp:rw,nosuid,nodev,size=256m",
    "--user",
    SANDBOX_LIMITS.user,
    "-e",
    "HOME=/tmp",
    "-e",
    "VITE_CACHE_DIR=/tmp/vite",
    "-v",
    `${abs}:/work:rw`,
    "-w",
    "/work",
    image,
    "node",
    "/opt/seal22/build.mjs",
  ];
}

export async function sandboxStatus() {
  const info = await docker(["info"], 15_000);
  if (info.code !== 0) {
    return {
      available: false,
      engine: "none",
      reason: "Docker no está disponible en este host.",
      limits: SANDBOX_LIMITS,
    };
  }
  const image = await docker(["image", "inspect", SANDBOX_LIMITS.image], 15_000);
  if (image.code !== 0) {
    return {
      available: false,
      engine: "docker",
      reason: "La imagen seal22-sandbox:alpha no está construida.",
      limits: SANDBOX_LIMITS,
    };
  }
  return { available: true, engine: "docker", reason: null, limits: SANDBOX_LIMITS };
}

export async function runSandbox({ projectId, userId, files }) {
  if (!isUuid(projectId) || !isUuid(userId)) throw new Error("identificador");
  const id = randomUUID();
  const started = Date.now();
  const base = { id, projectId, userId, started };
  if (!validFiles(files)) {
    return complete(base, {
      ok: false,
      compiled: false,
      log: "Hay una ruta de archivo no permitida.",
      previewUrl: null,
    });
  }

  const status = await sandboxStatus();
  if (status.engine === "none") {
    return complete(base, {
      ok: false,
      compiled: false,
      log: "Docker no está disponible en este host.",
      previewUrl: null,
    });
  }

  let workDir;
  try {
    if (!status.available) {
      return await complete(base, {
        ok: false,
        compiled: false,
        log: status.reason || "La imagen del sandbox no está disponible.",
        previewUrl: null,
      });
    }
    workDir = path.join(workRoot(), id);
    assertInsideWorkRoot(workDir);
    workDir = await createWorkDir(id);
    await writeProjectFiles(workDir, files);
    const name = containerName(id);
    const args = containerArgs({ workDir, name, image: SANDBOX_LIMITS.image });
    const outcome = await runContainer(args, name);
    let compiled = false;
    if (!outcome.timedOut && outcome.code === 0) {
      compiled = await publishDist(workDir, previewDirectory(id));
    }
    const infra = outcome.timedOut || outcome.enoent || isDockerInfraFailure(outcome);
    let log = [outcome.stdout, outcome.stderr].filter((part) => part && part.trim()).join("\n").trim();
    if (outcome.timedOut) log = `${log}\nEl sandbox superó el tiempo límite.`.trim();
    if (!log) log = compiled ? "Compilación lista." : "La compilación falló.";
    return await complete(
      base,
      {
        ok: !infra,
        compiled: compiled && !infra,
        log,
        previewUrl: compiled && !infra ? `/api/sandbox/preview/${id}/index.html` : null,
      },
      workDir,
    );
  } catch (error) {
    const refused = error?.message === "ruta";
    return await complete(
      base,
      {
        ok: false,
        compiled: false,
        log: refused ? "Hay una ruta de archivo no permitida." : "No se pudo ejecutar el sandbox.",
        previewUrl: null,
      },
      workDir,
    );
  } finally {
    if (workDir) await discardWorkDir(workDir).catch(() => {});
  }
}

function configuredDir(value, fallback) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;
}

function isInside(root, candidate) {
  const parent = path.resolve(root);
  const target = path.resolve(candidate);
  return target.startsWith(`${parent}${path.sep}`);
}

function assertInsideWorkRoot(workDir) {
  if (typeof workDir !== "string" || workDir.length === 0 || workDir.length > 4096) throw new Error("ruta");
  if (!path.isAbsolute(workDir) || /[\0\n\r:]/.test(workDir)) throw new Error("ruta");
  const target = path.resolve(workDir);
  if (!isInside(workRoot(), target)) throw new Error("ruta");
  return target;
}

function containerName(id) {
  const name = `seal22-sb-${id.replaceAll("-", "").slice(0, 12)}`;
  if (!NAME_RE.test(name)) throw new Error("ruta");
  return name;
}

function validFiles(files) {
  if (!Array.isArray(files)) return false;
  for (const file of files) {
    if (!file || typeof file.contents !== "string") return false;
    try {
      assertSafeRelative(file.path);
    } catch {
      return false;
    }
    if (file.path === "node_modules" || file.path.startsWith("node_modules/")) return false;
  }
  return true;
}

async function createWorkDir(id) {
  const root = workRoot();
  await mkdir(root, { recursive: true });
  const workDir = path.join(root, id);
  assertInsideWorkRoot(workDir);
  await mkdir(workDir, { recursive: true });
  const realRoot = await realpath(root);
  const realWork = await realpath(workDir);
  if (!isInside(realRoot, realWork)) throw new Error("ruta");
  return assertInsideWorkRoot(realWork);
}

async function writeProjectFiles(workDir, files) {
  for (const file of files) {
    const target = safeJoin(workDir, file.path);
    await mkdir(path.dirname(target), { recursive: true });
    const parent = await realpath(path.dirname(target));
    const root = await realpath(workDir);
    if (parent !== root && !parent.startsWith(`${root}${path.sep}`)) throw new Error("ruta");
    await writeFile(target, file.contents, { encoding: "utf8", mode: 0o644 });
  }
}

async function publishDist(workDir, previewDir) {
  if (!isInside(previewRoot(), previewDir)) throw new Error("ruta");
  const dist = path.join(workDir, "dist");
  const distInfo = await lstat(dist).catch(() => null);
  if (!distInfo?.isDirectory() || distInfo.isSymbolicLink()) return false;
  await mkdir(path.dirname(previewDir), { recursive: true });
  await rm(previewDir, { recursive: true, force: true });
  await mkdir(previewDir, { recursive: true });
  await copyRegularFiles(dist, previewDir);
  const indexPath = path.join(previewDir, "index.html");
  const indexInfo = await lstat(indexPath).catch(() => null);
  if (!indexInfo?.isFile() || indexInfo.isSymbolicLink() || indexInfo.size === 0) {
    await rm(previewDir, { recursive: true, force: true });
    return false;
  }
  const realPreview = await realpath(previewDir);
  const realIndex = await realpath(indexPath);
  if (!isInside(realPreview, realIndex)) {
    await rm(previewDir, { recursive: true, force: true });
    return false;
  }
  return true;
}

async function copyRegularFiles(sourceDir, targetDir) {
  const realSource = await realpath(sourceDir);
  const entries = await readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    if (entry.name === "node_modules" || entry.name.startsWith(".") || entry.name.endsWith(".map")) continue;
    const source = path.join(sourceDir, entry.name);
    let destination;
    try {
      destination = safeJoin(targetDir, entry.name);
    } catch {
      continue;
    }
    if (entry.isDirectory()) {
      await mkdir(destination, { recursive: true });
      await copyRegularFiles(source, destination);
      continue;
    }
    if (!entry.isFile()) continue;
    const realFile = await realpath(source);
    if (!isInside(realSource, realFile)) continue;
    await copyFile(source, destination);
  }
}

async function discardWorkDir(workDir) {
  const target = path.resolve(workDir);
  if (!isInside(workRoot(), target)) return;
  const link = path.join(target, "node_modules");
  const info = await lstat(link).catch(() => null);
  if (info?.isSymbolicLink()) await unlink(link).catch(() => {});
  await rm(target, { recursive: true, force: true });
}

function runContainer(args, name) {
  const timeoutMs = SANDBOX_LIMITS.timeoutMs;
  return new Promise((resolve) => {
    let settled = false;
    let timedOut = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const child = execFile(
      "docker",
      args,
      { encoding: "utf8", maxBuffer: 2 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const overflow = error?.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER";
        if (timedOut || overflow || error?.signal) {
          execFile("docker", ["kill", name], { encoding: "utf8", timeout: 15_000 }, () => {});
        }
        finish({
          code: error ? (Number.isInteger(error.code) ? error.code : 1) : 0,
          stdout: typeof stdout === "string" ? stdout : "",
          stderr: typeof stderr === "string" ? stderr : "",
          timedOut,
          enoent: error?.code === "ENOENT",
        });
      },
    );
    const timer = setTimeout(() => {
      if (settled) return;
      timedOut = true;
      execFile("docker", ["kill", name], { encoding: "utf8", timeout: 15_000 }, () => {
        if (!settled) child.kill("SIGKILL");
      });
    }, timeoutMs);
  });
}

function docker(args, timeout) {
  return new Promise((resolve) => {
    execFile(
      "docker",
      args,
      { encoding: "utf8", timeout, maxBuffer: 1024 * 1024, killSignal: "SIGKILL" },
      (error, stdout, stderr) => {
        resolve({
          code: error ? (Number.isInteger(error.code) ? error.code : 1) : 0,
          stdout: typeof stdout === "string" ? stdout : "",
          stderr: typeof stderr === "string" ? stderr : "",
          enoent: error?.code === "ENOENT",
        });
      },
    );
  });
}

function isDockerInfraFailure(outcome) {
  if (outcome.enoent || outcome.timedOut) return true;
  if ([125, 126, 127, 137, 143].includes(outcome.code)) return true;
  const text = `${outcome.stdout}\n${outcome.stderr}`;
  return /Cannot connect to the Docker daemon|Is the docker daemon running|unable to find image|Unable to find image|error during connect|^docker: Error/im.test(text);
}

async function complete(base, fields, workDir) {
  const durationMs = Math.max(0, Date.now() - base.started);
  const log = sanitizeLog(fields.log, [workDir, previewDirectory(base.id)]);
  const result = {
    id: base.id,
    ok: Boolean(fields.ok),
    compiled: Boolean(fields.compiled),
    durationMs,
    log,
    previewUrl: fields.compiled ? fields.previewUrl : null,
  };
  await rememberRun({
    id: result.id,
    projectId: base.projectId,
    userId: base.userId,
    ok: result.ok,
    compiled: result.compiled,
    durationMs,
    log,
  });
  return result;
}

async function rememberRun(row) {
  try {
    await sql(
      `insert into sandbox_runs (id, project_id, user_id, ok, compiled, duration_ms, log)
       values ($1::text, $2::text, $3::text, $4::boolean, $5::boolean, $6::integer, $7::text)`,
      [row.id, row.projectId, row.userId, row.ok, row.compiled, row.durationMs, row.log],
    );
  } catch (error) {
    if (isForeignKeyError(error)) return;
    throw error;
  }
}

function isForeignKeyError(error) {
  const seen = new Set();
  let current = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    if (current.code === "23503") return true;
    const message = String(current.message ?? "");
    if (/23503|foreign key|llave for[aá]nea|not present in table/i.test(message)) return true;
    current = current.cause;
  }
  return false;
}

function sanitizeLog(value, extraPaths = []) {
  let text = String(value ?? "").replaceAll("\0", "");
  const needles = new Set();
  const add = (item) => {
    if (typeof item !== "string") return;
    const trimmed = item.trim();
    if (trimmed.length < 2 || trimmed === "/") return;
    needles.add(trimmed);
  };
  add(workRoot());
  add(previewRoot());
  add(path.resolve(".data"));
  add(process.cwd());
  try {
    add(os.homedir());
  } catch {
    // No home directory to redact.
  }
  add(process.env.HOME);
  add("/opt/cursor");
  add("/home/ubuntu");
  add("/agent");
  for (const item of extraPaths) add(item);
  for (const needle of [...needles].sort((a, b) => b.length - a.length)) {
    text = text.split(needle).join("[path]");
  }
  text = text.replace(
    /\/(?:opt\/cursor|home\/[A-Za-z0-9._-]+|agent(?:\/[^\s"'`<>|]*)?|Users\/[A-Za-z0-9._-]+(?:\/[^\s"'`<>|]*)?)/g,
    "[path]",
  );
  const chars = Array.from(text);
  if (chars.length > LOG_LIMIT) return chars.slice(0, LOG_LIMIT).join("");
  return text;
}
