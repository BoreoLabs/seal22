import { spawn } from "node:child_process";
import { chmod, lstat, mkdir, readdir, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";

try {
  const code = await buildPreview();
  process.exit(code);
} catch (error) {
  const message = error instanceof Error ? error.stack || error.message : "No se pudo compilar.";
  console.error(message);
  process.exit(1);
}

async function buildPreview() {
  const cacheDir = process.env.VITE_CACHE_DIR || "/tmp/vite";
  await rm("/work/node_modules", { recursive: true, force: true });
  await symlink("/opt/seal22-template/node_modules", "/work/node_modules");
  await mkdir(cacheDir, { recursive: true });
  await writeFile("/tmp/seal22.vite.config.mjs", viteConfigSource(cacheDir));

  const viteBin = "/work/node_modules/vite/bin/vite.js";
  const code = await new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [viteBin, "build", "--config", "/tmp/seal22.vite.config.mjs", "--base=./"],
      { cwd: "/work", stdio: "inherit" },
    );
    child.on("error", () => resolve(1));
    child.on("exit", (status, signal) => resolve(signal ? 1 : (status ?? 1)));
  });
  await relax("/work/dist");
  return code;
}

function viteConfigSource(cacheDir) {
  return [
    'import { mergeConfig, defineConfig } from "/opt/seal22-template/node_modules/vite/dist/node/index.js";',
    'import userConfig from "/work/vite.config.js";',
    "",
    "let loaded = userConfig;",
    "if (typeof loaded === \"function\") {",
    "  loaded = await loaded({ command: \"build\", mode: \"production\", isSsrBuild: false, isPreview: false });",
    "}",
    "if (loaded && typeof loaded.then === \"function\") loaded = await loaded;",
    "",
    "export default mergeConfig(loaded ?? {}, defineConfig({",
    "  root: \"/work\",",
    "  base: \"./\",",
    `  cacheDir: ${JSON.stringify(cacheDir)},`,
    "  build: { sourcemap: false, emptyOutDir: true },",
    "}));",
    "",
  ].join("\n");
}

async function relax(dir) {
  const info = await lstat(dir).catch(() => null);
  if (!info || info.isSymbolicLink()) return;
  await chmod(dir, info.isDirectory() ? 0o755 : 0o644).catch(() => {});
  if (!info.isDirectory()) return;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    await relax(path.join(dir, entry.name));
  }
}
