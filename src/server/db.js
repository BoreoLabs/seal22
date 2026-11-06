import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";

const forceMemory = process.env.SEAL22_DB === "memory";
const databaseUrl = forceMemory ? "" : (process.env.DATABASE_URL?.trim() ?? "");
const dataDir = forceMemory ? "" : (process.env.SEAL22_DB_DIR?.trim() ?? "");

let pool;
let local;

export async function sql(text, params = []) {
  if (databaseUrl !== "") {
    pool ??= new pg.Pool({ connectionString: databaseUrl, max: 5 });
    return (await pool.query(text, params)).rows;
  }
  local ??= startLocal().catch((error) => {
    local = undefined;
    throw error;
  });
  return (await (await local).query(text, params)).rows;
}

export async function resetDatabase() {
  if (pool) {
    const current = pool;
    pool = undefined;
    await current.end();
  }
  if (local) {
    const pending = local;
    local = undefined;
    try {
      const db = await pending;
      await db.close();
    } catch {
      // The next call opens a fresh database.
    }
  }
}

async function startLocal() {
  const db = dataDir ? new PGlite(dataDir) : new PGlite();
  await db.exec(
    "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())",
  );
  const applied = await db.query("select name from schema_migrations");
  const done = new Set(applied.rows.map((row) => row.name));
  const directory = path.join(process.cwd(), "migrations");
  const files = (await readdir(directory).catch(() => []))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of files) {
    if (done.has(file)) continue;
    await db.exec(await readFile(path.join(directory, file), "utf8"));
    await db.query("insert into schema_migrations (name) values ($1)", [file]);
  }
  return db;
}
