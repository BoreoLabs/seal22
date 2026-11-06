import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { applyPrompt } from "../src/lib/generate.js";
import { CATALOG } from "../src/server/catalog.js";
import { resetDatabase, sql } from "../src/server/db.js";
import { filesForProject } from "../src/server/files.js";
import { SANDBOX_LIMITS } from "../src/server/limits.js";
import { containerArgs, previewDirectory, runSandbox, sandboxStatus, workRoot } from "../src/server/sandbox.js";

const NAME = "seal22-sb-0123456789ab";

test("containerArgs fija los límites y el comando, sin privilegios ni red del host", () => {
  const previous = process.env.SEAL22_SENTINEL;
  process.env.SEAL22_SENTINEL = "sentinel-no-debe-entrar";
  try {
    const workDir = path.join(workRoot(), "args-check");
    const args = containerArgs({ workDir, name: NAME, image: SANDBOX_LIMITS.image });
    assert.ok(args.every((arg) => typeof arg === "string" && !arg.includes("\0") && !arg.includes("\n")));
    assert.equal(args[0], "run");
    assert.equal(flag(args, "--network"), "none");
    assert.equal(flag(args, "--memory"), "512m");
    assert.equal(flag(args, "--memory-swap"), "512m");
    assert.equal(flag(args, "--cpus"), "0.5");
    assert.equal(flag(args, "--pids-limit"), "128");
    assert.equal(flag(args, "--cap-drop"), "ALL");
    assert.equal(flag(args, "--security-opt"), "no-new-privileges");
    assert.ok(args.includes("--read-only"));
    assert.equal(flag(args, "--tmpfs"), "/tmp:rw,nosuid,nodev,size=256m");
    assert.equal(flag(args, "--user"), "1000:1000");
    assert.ok(args.includes("--rm"));
    assert.equal(flag(args, "--name"), NAME);
    assert.equal(flag(args, "-w"), "/work");
    assert.equal(flag(args, "-v"), `${path.resolve(workDir)}:/work:rw`);
    assert.deepEqual(envFlags(args).sort(), ["HOME=/tmp", "VITE_CACHE_DIR=/tmp/vite"]);
    assert.deepEqual(args.slice(-3), [SANDBOX_LIMITS.image, "node", "/opt/seal22/build.mjs"]);
    assert.equal(args.filter((arg) => arg === "-v" || arg === "--volume" || arg === "--mount").length, 1);
    assert.equal(args.some((arg) => arg.includes("privileged")), false);
    assert.equal(args.some((arg) => arg.includes("docker.sock")), false);
    assert.equal(args.some((arg) => arg === "host" || arg === "--network=host" || arg.includes("--privileged")), false);
    assert.equal(flag(args, "--network"), "none");
    assert.equal(args.some((arg) => arg.includes("sentinel-no-debe-entrar") || arg.includes("SEAL22_SENTINEL")), false);

    const normalized = path.resolve(workRoot(), "..", path.basename(workRoot()), "otra");
    const again = containerArgs({ workDir: normalized, name: NAME, image: SANDBOX_LIMITS.image });
    assert.equal(flag(again, "-v"), `${path.join(workRoot(), "otra")}:/work:rw`);
  } finally {
    if (previous === undefined) delete process.env.SEAL22_SENTINEL;
    else process.env.SEAL22_SENTINEL = previous;
  }
});

test("containerArgs rechaza un directorio fuera de la raíz permitida", () => {
  const root = workRoot();
  const image = SANDBOX_LIMITS.image;
  assert.throws(() => containerArgs({ workDir: path.resolve(root, "..", "fuera"), name: NAME, image }), /ruta/);
  assert.throws(() => containerArgs({ workDir: "relativo/job", name: NAME, image }), /ruta/);
  assert.throws(() => containerArgs({ workDir: "/etc/passwd", name: NAME, image }), /ruta/);
  assert.throws(() => containerArgs({ workDir: `${root}-extra/job`, name: NAME, image }), /ruta/);
  assert.throws(() => containerArgs({ workDir: root, name: NAME, image }), /ruta/);
  assert.throws(() => containerArgs({ workDir: path.join(root, "job"), name: "seal22-sb-$(id)", image }), /ruta/);
  assert.throws(() => containerArgs({ workDir: path.join(root, "job"), name: NAME, image: "node:22" }), /ruta/);
});

test("compila la preview de la panadería dentro del contenedor", { timeout: 180_000 }, async (t) => {
  const previousSentinel = process.env.SEAL22_SECRET_SENTINEL;
  process.env.SEAL22_SECRET_SENTINEL = "sentinel-no-debe-salir";
  try {
    const missing = await runSandbox({
      projectId: randomUUID(),
      userId: randomUUID(),
      files: [{ path: "../secret", contents: "no" }],
    });
    assert.equal(missing.ok, false);
    assert.equal(missing.compiled, false);
    assert.equal(missing.previewUrl, null);
    assert.equal(missing.log.includes("../secret"), false);
    assert.equal(missing.log.includes("sentinel-no-debe-salir"), false);

    const status = await sandboxStatus();
    if (status.engine === "none") {
      t.skip("Docker no está disponible en este host.");
      return;
    }
    assert.equal(status.limits, SANDBOX_LIMITS);
    if (!status.available) {
      const log = await captureBuildLog();
      assert.fail(`Falta la imagen ${SANDBOX_LIMITS.image}.\n${log}`);
    }

    const bakery = CATALOG.find((entry) => entry.id === "bakery");
    const created = applyPrompt(null, bakery.prompt);
    assert.equal(created.ok, true);
    const files = await filesForProject(created.project);
    const userId = randomUUID();
    const projectId = randomUUID();
    await sql(
      "insert into users (id, name, email, password_hash) values ($1::text, $2::text, $3::text, $4::text)",
      [userId, "Ana", `${userId}@example.com`, "test-hash"],
    );
    await sql(
      "insert into projects (id, user_id, title, kind, accent, spec) values ($1::text, $2::text, $3::text, $4::text, $5::text, $6::jsonb)",
      [projectId, userId, "Panadería", "todos", "amber", "{}"],
    );

    const run = await runSandbox({ projectId, userId, files });
    assert.equal(run.compiled, true, run.log);
    assert.equal(run.ok, true);
    assert.equal(run.previewUrl, `/api/sandbox/preview/${run.id}/index.html`);
    assert.equal(run.log.includes("/opt/cursor"), false, run.log);
    const home = os.homedir();
    if (home && home !== "/" && home.length > 1) assert.equal(run.log.includes(home), false, run.log);
    assert.equal(run.log.includes("sentinel-no-debe-salir"), false);
    assert.equal(run.log.includes("SEAL22_SECRET_SENTINEL"), false);
    assert.ok(run.durationMs >= 0);
    assert.ok(run.log.length <= 8000);

    const previewDir = previewDirectory(run.id);
    const indexPath = path.join(previewDir, "index.html");
    const html = await readFile(indexPath, "utf8");
    assert.match(html, /id="root"/);
    assert.match(html, /src="\.\/assets\//);
    assert.doesNotMatch(html, /src="\/assets\//);
    const produced = await walk(previewDir);
    assert.ok(produced.some((file) => file.endsWith(`${path.sep}index.html`)));
    assert.ok(produced.every((file) => !file.endsWith(".map")));
    assert.ok(produced.every((file) => !file.split(path.sep).includes("node_modules")));
    const bundled = await Promise.all(
      produced.filter((file) => file.endsWith(".js") || file.endsWith(".html")).map((file) => readFile(file, "utf8")),
    );
    assert.match(bundled.join("\n"), /amasar/);

    const rows = await sql(
      "select ok, compiled, log from sandbox_runs where id = $1::text and user_id = $2::text and project_id = $3::text",
      [run.id, userId, projectId],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].compiled, true);
    assert.equal(rows[0].ok, true);
    assert.equal(String(rows[0].log).includes("/opt/cursor"), false);
  } finally {
    if (previousSentinel === undefined) delete process.env.SEAL22_SECRET_SENTINEL;
    else process.env.SEAL22_SECRET_SENTINEL = previousSentinel;
    await resetDatabase();
  }
});

function flag(args, name) {
  const index = args.indexOf(name);
  assert.ok(index >= 0, name);
  return args[index + 1];
}

function envFlags(args) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "-e" || args[index] === "--env") values.push(args[index + 1]);
  }
  return values;
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const found = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await walk(full)));
    else found.push(full);
  }
  return found;
}

function captureBuildLog() {
  return new Promise((resolve) => {
    execFile(
      "docker",
      ["build", "-t", SANDBOX_LIMITS.image, "sandbox"],
      { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, timeout: 150_000 },
      (error, stdout, stderr) => {
        resolve(`${stdout ?? ""}\n${stderr ?? ""}\n${error?.message ?? ""}`.slice(-12_000));
      },
    );
  });
}
