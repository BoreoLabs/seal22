import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { requireUser } from "../../../../../../src/server/accounts.js";
import { sql } from "../../../../../../src/server/db.js";
import { safeJoin } from "../../../../../../src/server/files.js";
import { isUuid, previewDirectory } from "../../../../../../src/server/sandbox.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".woff2", "font/woff2"],
  [".ico", "image/x-icon"],
]);

const PREVIEW_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "private, no-store",
  "Content-Security-Policy": "frame-ancestors 'self'",
  "Referrer-Policy": "no-referrer",
};

export async function GET(request, context) {
  const user = await requireUser(request);
  if (!user?.id || !isUuid(user.id)) return deny("Necesitas entrar.", 401);

  const params = (await context?.params) ?? {};
  const id = typeof params.id === "string" ? params.id : "";
  if (!isUuid(id)) return missingPreview();

  const rows = await sql(
    "select id from sandbox_runs where id = $1::text and user_id = $2::text",
    [id, user.id],
  );
  if (rows.length === 0) return missingPreview();

  const segments = Array.isArray(params.path) ? params.path : [];
  if (segments.some((segment) => typeof segment !== "string" || segment.length === 0)) return missingFile();
  if (segments.some((segment) => segment === "node_modules" || segment.endsWith(".map") || segment.startsWith("."))) {
    return missingFile();
  }
  const relative = segments.length === 0 ? "index.html" : segments.join("/");
  if (relative.endsWith(".map") || relative.split("/").includes("node_modules")) return missingFile();

  let previewDir;
  let filePath;
  try {
    previewDir = previewDirectory(id);
    filePath = safeJoin(previewDir, relative);
  } catch {
    return missingFile();
  }

  const type = TYPES.get(path.extname(filePath).toLowerCase());
  if (!type) return missingFile();

  const info = await lstat(filePath).catch(() => null);
  if (!info?.isFile() || info.isSymbolicLink()) return missingFile();
  const realDir = await realpath(previewDir).catch(() => null);
  const realFile = await realpath(filePath).catch(() => null);
  if (!realDir || !realFile || (realFile !== realDir && !realFile.startsWith(`${realDir}${path.sep}`))) {
    return missingFile();
  }

  const body = await readFile(realFile);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": type,
      ...PREVIEW_HEADERS,
    },
  });
}

function missingPreview() {
  return deny("No encuentro esa preview.", 404);
}

function missingFile() {
  return deny("No encuentro ese archivo.", 404);
}

function deny(error, status) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...PREVIEW_HEADERS,
    },
  });
}
