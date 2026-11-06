import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoDir = await mkdtemp(path.join(tmpdir(), "seal22-repos-"));
process.env.SEAL22_DB = "memory";
process.env.SEAL22_REPO_DIR = repoDir;

const { exportZipBytes, removeRepo, syncRepo } = await import("../src/server/repo.js");

let gitAvailable = true;
try {
  await execFileAsync("git", ["--version"]);
} catch {
  gitAvailable = false;
}

after(async () => {
  await rm(repoDir, { recursive: true, force: true });
});

describe("repositorio", { concurrency: false }, () => {
  test("exportZipBytes es un zip PK con src/App.jsx", async () => {
    const marker = "export default function App(){ return \"Panadería\"; }";
    const bytes = await exportZipBytes([
      { path: "src/App.jsx", contents: marker },
      { path: "package.json", contents: '{"name":"seal22"}' },
      { path: "../secret.txt", contents: "NO-DEBE-ESTAR" },
      { path: ".git/config", contents: "NO-GIT" },
      { path: "src/../../outside.txt", contents: "NO-OUTSIDE" },
    ]);
    assert.ok(bytes instanceof Uint8Array);
    assert.equal(Buffer.from(bytes.subarray(0, 2)).toString("utf8"), "PK");

    const files = await unzip(bytes);
    assert.equal(files["src/App.jsx"], marker);
    assert.equal(files["package.json"], '{"name":"seal22"}');
    assert.equal(Object.hasOwn(files, "../secret.txt"), false);
    assert.equal(Object.hasOwn(files, ".git/config"), false);
    assert.equal(JSON.stringify(files).includes("NO-DEBE-ESTAR"), false);
    assert.equal(JSON.stringify(files).includes("NO-GIT"), false);
    assert.equal(JSON.stringify(files).includes("NO-OUTSIDE"), false);
  });

  test("syncRepo crea un commit y no falla si no hay cambios", { skip: !gitAvailable }, async () => {
    const id = randomUUID();
    const contents = "export default function App(){ return \"Panadería\"; }\n";
    await syncRepo(id, [{ path: "src/App.jsx", contents }], "Primer\ncommit\u0001");
    const cwd = path.join(repoDir, id);
    const log = await execFileAsync("git", ["log", "-1", "--format=%an%n%ae%n%s"], { cwd });
    const [name, email, subject] = log.stdout.trim().split("\n");
    assert.equal(name, "Seal22");
    assert.equal(email, "seal22@localhost");
    assert.equal(subject, "Primer commit");

    const show = await execFileAsync("git", ["show", "HEAD:src/App.jsx"], { cwd });
    assert.equal(show.stdout, contents);

    await syncRepo(id, [{ path: "src/App.jsx", contents }], "sin cambios");
    const count = await execFileAsync("git", ["rev-list", "--count", "HEAD"], { cwd });
    assert.equal(count.stdout.trim(), "1");

    const literal = "hola $(rm -rf /) `touch pwned`";
    await syncRepo(id, [{ path: "src/App.jsx", contents: `${contents}v2\n` }], literal);
    const next = await execFileAsync("git", ["log", "-1", "--format=%s"], { cwd });
    assert.equal(next.stdout.trim(), literal);
    const long = "b".repeat(180);
    await syncRepo(id, [{ path: "src/App.jsx", contents: `${contents}v3\n` }], long);
    const clipped = await execFileAsync("git", ["log", "-1", "--format=%s"], { cwd });
    assert.equal(clipped.stdout.trim(), "b".repeat(160));
  });

  test("un id inválido no toca el disco", async () => {
    await assert.rejects(() => syncRepo("../etc", [{ path: "src/App.jsx", contents: "x" }], "mal"));
    await assert.rejects(() => syncRepo("not-a-uuid", [], "mal"));
    await assert.rejects(() => removeRepo(".."));
    await assert.rejects(() => removeRepo(path.join(repoDir, "..")));
    assert.equal((await readdir(repoDir)).includes("etc"), false);
  });

  test("syncRepo rechaza una ruta que sale del proyecto", { skip: !gitAvailable }, async () => {
    const id = randomUUID();
    await assert.rejects(() => syncRepo(id, [{ path: "../secret.txt", contents: "NO" }], "mal"));
    await assert.rejects(access(path.join(repoDir, "secret.txt")), { code: "ENOENT" });
  });

  test("removeRepo borra el proyecto y no el directorio raíz", { skip: !gitAvailable }, async () => {
    const id = randomUUID();
    const sibling = path.join(repoDir, "vecino.txt");
    await writeFile(sibling, "se queda");
    await syncRepo(id, [{ path: "src/App.jsx", contents: "hola\n" }], "crear");
    await removeRepo(id);
    await assert.rejects(access(path.join(repoDir, id)), { code: "ENOENT" });
    await removeRepo(id);
    assert.equal(await readText(sibling), "se queda");

    const linkId = randomUUID();
    await symlink(repoDir, path.join(repoDir, linkId));
    await assert.rejects(() => removeRepo(linkId), /ruta/);
    assert.equal((await readdir(repoDir)).includes("vecino.txt"), true);
    assert.equal((await readdir(repoDir)).includes(linkId), true);
  });

  test("syncRepo lanza si git no está", async () => {
    const id = randomUUID();
    const previous = process.env.PATH;
    process.env.PATH = path.join(repoDir, "sin-binarios");
    try {
      await assert.rejects(
        () => syncRepo(id, [{ path: "src/App.jsx", contents: "x\n" }], "x"),
        /git no está disponible/,
      );
    } finally {
      process.env.PATH = previous;
    }
  });

  test("syncRepo lanza si el commit no puede hacerse", { skip: !gitAvailable }, async () => {
    const id = randomUUID();
    const dir = path.join(repoDir, id);
    await syncRepo(id, [{ path: "src/App.jsx", contents: "v1\n" }], "uno");
    await rm(path.join(dir, ".git"), { recursive: true, force: true });
    await writeFile(path.join(dir, ".git"), "no-es-un-repo");
    await assert.rejects(() => syncRepo(id, [{ path: "src/App.jsx", contents: "v2\n" }], "dos"));
  });
});

async function unzip(bytes) {
  const dir = await mkdtemp(path.join(tmpdir(), "seal22-zip-"));
  const zipPath = path.join(dir, "proyecto.zip");
  await writeFile(zipPath, bytes);
  try {
    const { stdout } = await execFileAsync("python3", [
      "-c",
      [
        "import json, sys, zipfile",
        "archive = zipfile.ZipFile(sys.argv[1])",
        "bad = archive.testzip()",
        "if bad: raise SystemExit(bad)",
        "print(json.dumps({name: archive.read(name).decode('utf-8') for name in archive.namelist()}))",
      ].join("\n"),
      zipPath,
    ]);
    return JSON.parse(stdout);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function readText(file) {
  const { readFile } = await import("node:fs/promises");
  return readFile(file, "utf8");
}
