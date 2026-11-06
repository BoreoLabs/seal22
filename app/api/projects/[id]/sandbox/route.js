import { requireUser } from "../../../../../src/server/accounts.js";
import { sql } from "../../../../../src/server/db.js";
import { isSameOrigin, json } from "../../../../../src/server/http.js";
import { isUuid, runSandbox } from "../../../../../src/server/sandbox.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request, context) {
  if (!isSameOrigin(request)) return json({ error: "La petición no viene de Seal22." }, 403);
  const user = await requireUser(request);
  if (!user?.id || !isUuid(user.id)) return json({ error: "Necesitas entrar." }, 401);

  const params = (await context?.params) ?? {};
  const id = typeof params.id === "string" ? params.id : "";
  if (!isUuid(id)) return json({ error: "No encuentro ese proyecto." }, 404);

  const rows = await sql(
    `select f.path, f.contents
     from projects as p
     left join project_files as f on f.project_id = p.id
     where p.id = $1::text and p.user_id = $2::text
     order by f.path`,
    [id, user.id],
  );
  if (rows.length === 0) return json({ error: "No encuentro ese proyecto." }, 404);

  const files = rows
    .filter((row) => typeof row.path === "string" && typeof row.contents === "string")
    .map((row) => ({ path: row.path, contents: row.contents }));
  const run = await runSandbox({ projectId: id, userId: user.id, files });
  return json({ run });
}
