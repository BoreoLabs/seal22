import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, beforeEach, describe, test } from "node:test";
import { promisify } from "node:util";
import { BASE_USD, BLOCK_USD, formatUsd, quotePrompt, roundUsd, SESSION_CAP_USD } from "../src/lib/quote.js";

const execFileAsync = promisify(execFile);
const repoDir = await mkdtemp(path.join(tmpdir(), "seal22-projects-"));
process.env.SEAL22_DB = "memory";
process.env.SEAL22_REPO_DIR = repoDir;

const { sql, resetDatabase } = await import("../src/server/db.js");
const { applyTurn, createProject, deleteProject, getProject, listProjects } = await import("../src/server/projects.js");

const BAKERY = "Lista de tareas para la panadería: amasar, hornear y cerrar caja. Color ámbar.";

after(async () => {
  await rm(repoDir, { recursive: true, force: true });
});

describe("proyectos", { concurrency: false }, () => {
  beforeEach(async () => {
    process.env.SEAL22_DB = "memory";
    process.env.SEAL22_REPO_DIR = repoDir;
    await resetDatabase();
  });

  test("crea la panadería con coste, archivos y código", async () => {
    const userId = randomUUID();
    await sql("insert into users (id, name, email, password_hash) values ($1,$2,$3,$4)", [
      userId,
      "Ana",
      "ana@example.com",
      "x",
    ]);

    const quote = quotePrompt(BAKERY);
    assert.equal(quote.blocks, 1);
    assert.equal(quote.usd, roundUsd(BASE_USD + BLOCK_USD));

    const created = await createProject(userId, `  ${BAKERY}  `);
    assert.equal(created.ok, true);
    assert.equal(created.project.kind, "todos");
    assert.equal(created.project.title, "Panadería");
    assert.equal(created.project.accent, "amber");
    assert.equal(created.project.spentUsd, quote.usd);
    assert.equal(typeof created.project.spentUsd, "number");
    assert.equal(created.project.spec.kind, "todos");
    assert.equal(created.turn.prompt, BAKERY);
    assert.equal(created.turn.compiled, null);
    assert.equal(created.turn.costUsd, quote.usd);
    assert.equal(typeof created.turn.durationMs, "number");
    assert.equal(created.project.createdAt, new Date(created.project.createdAt).toISOString());
    const left = roundUsd(SESSION_CAP_USD - quote.usd);
    assert.equal(created.turn.reply.includes(`Coste confirmado ${formatUsd(quote.usd)}.`), true);
    assert.equal(created.turn.reply.includes(`Quedan ${formatUsd(left)}.`), true);
    assert.match(created.turn.reply, new RegExp(`Tardó ${created.turn.durationMs} ms`));

    const detail = await getProject(userId, created.project.id);
    const app = detail.files.find((file) => file.path === "src/App.jsx");
    assert.ok(app);
    assert.match(app.contents, /Panadería/);
    assert.equal(detail.source, app.contents);
    assert.equal(detail.capUsd, SESSION_CAP_USD);
    assert.equal(detail.turns[0].id, created.turn.id);
    assert.deepEqual(
      detail.files.map((file) => file.path),
      ["index.html", "package.json", "src/App.jsx", "src/index.css", "src/main.jsx", "vite.config.js"],
    );

    const listed = await listProjects(userId);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].id, created.project.id);
    assert.equal(listed[0].title, "Panadería");
    assert.equal(listed[0].kind, "todos");
    assert.equal(listed[0].accent, "amber");
    assert.equal(listed[0].spentUsd, quote.usd);
    assert.equal(listed[0].updatedAt, created.project.updatedAt);
    assert.equal("spec" in listed[0], false);

    const { stdout } = await execFileAsync("git", ["rev-parse", "--verify", "HEAD"], {
      cwd: path.join(repoDir, created.project.id),
    });
    assert.match(stdout, /^[0-9a-f]{40}/);
  });

  test("otro usuario no abre ni borra el proyecto", async () => {
    const ownerId = randomUUID();
    const otherId = randomUUID();
    await sql("insert into users (id, name, email, password_hash) values ($1,$2,$3,$4)", [
      ownerId,
      "Ana",
      "ana@example.com",
      "x",
    ]);
    await sql("insert into users (id, name, email, password_hash) values ($1,$2,$3,$4)", [
      otherId,
      "Bea",
      "bea@example.com",
      "x",
    ]);

    const created = await createProject(ownerId, BAKERY);
    assert.equal(await getProject(otherId, created.project.id), null);
    assert.equal(await deleteProject(otherId, created.project.id), false);
    assert.deepEqual(await listProjects(otherId), []);

    const still = await getProject(ownerId, created.project.id);
    assert.equal(still.project.title, "Panadería");
    assert.equal((await listProjects(ownerId)).length, 1);
  });

  test("cambiar el color a verde mantiene las tareas y suma el coste", async () => {
    const userId = await insertUser();
    const created = await createProject(userId, BAKERY);
    const edited = await applyTurn(userId, created.project.id, "Cambia el color a verde");
    assert.equal(edited.ok, true);
    assert.equal(edited.project.kind, "todos");
    assert.equal(edited.project.accent, "green");
    assert.equal(edited.project.spec.kind, "todos");
    assert.equal(edited.project.spec.accent, "green");
    assert.equal(edited.project.spec.items.some((item) => item.name === "amasar"), true);

    const quote = quotePrompt("Cambia el color a verde");
    assert.equal(edited.project.spentUsd, roundUsd(created.project.spentUsd + quote.usd));
    assert.ok(edited.project.spentUsd > created.project.spentUsd);

    const detail = await getProject(userId, created.project.id);
    assert.deepEqual(
      detail.turns.map((turn) => turn.prompt),
      [BAKERY, "Cambia el color a verde"],
    );
    assert.equal(detail.turns[0].createdAt < detail.turns[1].createdAt, true);
    assert.match(detail.source, /Panadería/);

    const cwd = path.join(repoDir, created.project.id);
    const count = await execFileAsync("git", ["rev-list", "--count", "HEAD"], { cwd });
    assert.equal(count.stdout.trim(), "2");
    const subject = await execFileAsync("git", ["log", "-1", "--format=%s"], { cwd });
    assert.equal(subject.stdout.trim(), "Cambia el color a verde");
    const committed = await execFileAsync("git", ["show", "HEAD:src/App.jsx"], { cwd });
    assert.match(committed.stdout, /emerald/);
  });

  test("un prompt desconocido no cambia el gasto", async () => {
    const userId = await insertUser();
    const created = await createProject(userId, BAKERY);
    const unknown = await applyTurn(userId, created.project.id, "haz magia con los astros");
    assert.equal(unknown.ok, false);
    assert.equal(unknown.status, 400);
    assert.equal(unknown.code, "unknown");
    assert.equal(
      unknown.error,
      "No he podido aplicar ese cambio. Prueba con un color, el título, «añade…» o «quita…».",
    );

    const detail = await getProject(userId, created.project.id);
    assert.equal(detail.project.spentUsd, created.project.spentUsd);
    assert.equal(detail.project.accent, "amber");
    assert.equal(detail.turns.length, 1);
  });

  test("el cuarto prompt corto no cabe en el tope", async () => {
    const userId = await insertUser();
    const prompts = [
      "Lista corta",
      "Cambia el color a verde",
      "Cambia el color a azul",
      "Cambia el título a Turno de mañana",
    ];
    for (const prompt of prompts) assert.equal(quotePrompt(prompt).usd, roundUsd(BASE_USD + BLOCK_USD));

    const created = await createProject(userId, prompts[0]);
    assert.equal(created.ok, true);
    const second = await applyTurn(userId, created.project.id, prompts[1]);
    assert.equal(second.ok, true);
    const third = await applyTurn(userId, created.project.id, prompts[2]);
    assert.equal(third.ok, true);
    const spent = third.project.spentUsd;
    assert.equal(spent, roundUsd(3 * roundUsd(BASE_USD + BLOCK_USD)));

    const blocked = await applyTurn(userId, created.project.id, prompts[3]);
    assert.equal(blocked.ok, false);
    assert.equal(blocked.status, 402);
    assert.equal(blocked.code, "cap");
    const quote = quotePrompt(prompts[3]);
    const remaining = roundUsd(SESSION_CAP_USD - spent);
    assert.equal(blocked.error.includes(formatUsd(quote.usd)), true);
    assert.equal(blocked.error.includes(formatUsd(remaining)), true);
    assert.equal(blocked.error.includes(formatUsd(SESSION_CAP_USD)), true);

    const detail = await getProject(userId, created.project.id);
    assert.equal(detail.project.spentUsd, spent);
    assert.equal(detail.turns.length, 3);
    const raw = await sql("select spent_usd from projects where id = $1", [created.project.id]);
    assert.equal(roundUsd(Number(raw[0].spent_usd)), spent);
  });

  test("borrar quita la fila, los turnos y el repositorio", async () => {
    const userId = await insertUser();
    const created = await createProject(userId, BAKERY);
    const id = created.project.id;
    assert.equal(await deleteProject(userId, id), true);
    assert.equal(await getProject(userId, id), null);
    assert.deepEqual(await listProjects(userId), []);
    assert.equal((await sql("select id from projects where id = $1", [id])).length, 0);
    assert.equal((await sql("select id from turns where project_id = $1", [id])).length, 0);
    assert.equal((await sql("select path from project_files where project_id = $1", [id])).length, 0);
    await assert.rejects(access(path.join(repoDir, id)), { code: "ENOENT" });
    assert.equal(await deleteProject(userId, id), false);
  });

  test("rechaza el prompt vacío o demasiado largo sin crear fila", async () => {
    const userId = await insertUser();
    const empty = await createProject(userId, "   ");
    assert.equal(empty.ok, false);
    assert.equal(empty.status, 400);
    assert.equal(empty.code, "empty");
    assert.equal(empty.error, "Escribe qué app quieres antes de generar.");

    const invalid = await createProject(userId, "a".repeat(4001));
    assert.equal(invalid.code, "invalid");
    assert.equal(invalid.error, "Ese prompt es demasiado largo.");

    const missing = await applyTurn(userId, randomUUID(), "Cambia el color a verde");
    assert.equal(missing.ok, false);
    assert.equal(missing.status, 404);
    assert.equal(missing.error, "No encuentro ese proyecto.");
    assert.equal((await sql("select id from projects")).length, 0);
  });

  test("si git falla el proyecto sigue guardado", async () => {
    const blocker = path.join(repoDir, "not-a-directory");
    await writeFile(blocker, "x");
    process.env.SEAL22_REPO_DIR = blocker;
    try {
      const userId = await insertUser();
      const created = await createProject(userId, BAKERY);
      assert.equal(created.ok, true);
      const detail = await getProject(userId, created.project.id);
      assert.equal(detail.project.title, "Panadería");
      assert.match(detail.source, /Panadería/);
    } finally {
      process.env.SEAL22_REPO_DIR = repoDir;
      await rm(blocker, { force: true });
    }
  });
});

async function insertUser() {
  const id = randomUUID();
  await sql("insert into users (id, name, email, password_hash) values ($1,$2,$3,$4)", [
    id,
    "Ana",
    "ana@example.com",
    "x",
  ]);
  return id;
}
