import { execFile } from "node:child_process";
import { access, lstat, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { assertSafeRelative, safeJoin } from "./files.js";

const execFileAsync = promisify(execFile);
const textEncoder = new TextEncoder();

const PROJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let crc = index;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    table[index] = crc >>> 0;
  }
  return table;
})();

function repoRoot() {
  const configured = process.env.SEAL22_REPO_DIR?.trim();
  return path.resolve(configured || path.join(".data", "repos"));
}

function assertProjectId(projectId) {
  if (typeof projectId !== "string" || !PROJECT_ID.test(projectId)) {
    throw new Error("proyecto");
  }
  return projectId;
}

function projectDir(projectId) {
  const id = assertProjectId(projectId);
  const root = repoRoot();
  const dir = path.resolve(root, id);
  if (dir === root || !dir.startsWith(`${root}${path.sep}`)) {
    throw new Error("ruta");
  }
  return dir;
}

function commitMessage(message) {
  const cleaned = String(message ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  return cleaned || "Seal22";
}

function gitEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith("GIT_")) delete env[key];
  }
  env.LC_ALL = "C";
  env.GIT_TERMINAL_PROMPT = "0";
  return env;
}

async function git(cwd, args) {
  try {
    return await execFileAsync("git", args, {
      cwd,
      env: gitEnv(),
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    });
  } catch (error) {
    if (error?.code === "ENOENT") {
      const missing = new Error("git no está disponible");
      missing.code = "ENOENT";
      missing.cause = error;
      throw missing;
    }
    throw error;
  }
}

async function ensureRepo(dir) {
  try {
    await access(path.join(dir, ".git"));
  } catch {
    await git(dir, ["init"]);
  }
}

async function hasStagedChanges(dir) {
  try {
    await git(dir, ["diff", "--cached", "--quiet"]);
    return false;
  } catch (error) {
    if (error?.code === 1) return true;
    throw error;
  }
}

function insideRoot(root, target) {
  const base = path.resolve(root);
  const resolved = path.resolve(target);
  return resolved !== base && resolved.startsWith(`${base}${path.sep}`);
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value) {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

function u32(value) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value >>> 0, true);
  return bytes;
}

function concat(parts) {
  let size = 0;
  for (const part of parts) size += part.length;
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export async function syncRepo(projectId, files, message) {
  const dir = projectDir(projectId);
  await mkdir(dir, { recursive: true });

  const relatives = [];
  for (const file of files ?? []) {
    const relative = file?.path;
    const target = safeJoin(dir, relative);
    await mkdir(path.dirname(target), { recursive: true });
    const contents = typeof file.contents === "string" ? file.contents : String(file.contents ?? "");
    await writeFile(target, contents, "utf8");
    relatives.push(relative);
  }

  await ensureRepo(dir);
  if (relatives.length > 0) {
    await git(dir, ["add", "--", ...relatives]);
  }
  if (!(await hasStagedChanges(dir))) return;

  await git(dir, [
    "-c",
    "user.email=seal22@localhost",
    "-c",
    "user.name=Seal22",
    "commit",
    "-m",
    commitMessage(message),
  ]);
}

export async function exportZipBytes(files) {
  const entries = [];
  for (const file of files ?? []) {
    let relative = "";
    try {
      relative = assertSafeRelative(file?.path);
    } catch {
      continue;
    }
    const name = textEncoder.encode(relative);
    const data = textEncoder.encode(String(file?.contents ?? ""));
    entries.push({ name, data, crc: crc32(data) });
  }

  const locals = [];
  const offsets = [];
  let offset = 0;
  for (const entry of entries) {
    offsets.push(offset);
    const local = concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(entry.crc),
      u32(entry.data.length),
      u32(entry.data.length),
      u16(entry.name.length),
      u16(0),
      entry.name,
      entry.data,
    ]);
    locals.push(local);
    offset += local.length;
  }

  const centrals = [];
  let centralSize = 0;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const central = concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(entry.crc),
      u32(entry.data.length),
      u32(entry.data.length),
      u16(entry.name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offsets[index]),
      entry.name,
    ]);
    centrals.push(central);
    centralSize += central.length;
  }

  const end = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralSize),
    u32(offset),
    u16(0),
  ]);

  return concat([...locals, ...centrals, end]);
}

export async function removeRepo(projectId) {
  const root = repoRoot();
  const dir = projectDir(projectId);
  let info;
  try {
    info = await lstat(dir);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }

  let realRoot = "";
  let realDir = "";
  try {
    realRoot = await realpath(root);
    realDir = await realpath(dir);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  if (!insideRoot(realRoot, realDir)) throw new Error("ruta");

  if (info.isSymbolicLink()) {
    await rm(dir, { force: true });
    return;
  }
  await rm(dir, { recursive: true, force: true });
}
