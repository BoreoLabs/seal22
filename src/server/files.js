import { readFile } from "node:fs/promises";
import path from "node:path";
import { renderSource } from "../lib/source.js";

const TEMPLATE_ROOT = path.resolve("sandbox/template");
const STATIC_FILES = ["package.json", "vite.config.js", "index.html", "src/main.jsx", "src/index.css"];

export function assertSafeRelative(filePath) {
  if (typeof filePath !== "string" || filePath.length === 0 || filePath.length > 180) {
    throw new Error("ruta");
  }
  if (filePath.includes("\\") || filePath.startsWith("/") || filePath.includes("\0")) {
    throw new Error("ruta");
  }
  const parts = filePath.split("/");
  if (parts.some((part) => part === "" || part === "." || part === ".." || part.startsWith("."))) {
    throw new Error("ruta");
  }
  return filePath;
}

export function safeJoin(root, relative) {
  assertSafeRelative(relative);
  const rootResolved = path.resolve(root);
  const target = path.resolve(rootResolved, relative);
  if (target !== rootResolved && !target.startsWith(`${rootResolved}${path.sep}`)) {
    throw new Error("ruta");
  }
  return target;
}

export async function filesForProject(project) {
  const files = [];
  for (const relative of STATIC_FILES) {
    files.push({
      path: relative,
      contents: await readFile(path.join(TEMPLATE_ROOT, relative), "utf8"),
    });
  }
  files.push({ path: "src/App.jsx", contents: renderSource(project) });
  return files;
}
