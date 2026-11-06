import { json } from "../../../../src/server/http.js";
import { requireUser } from "../../../../src/server/accounts.js";
import { deleteProject, getProject } from "../../../../src/server/projects.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOT_FOUND = "No encuentro ese proyecto.";

async function readId(context) {
  const params = await context.params;
  return params.id;
}

export async function GET(request, context) {
  const user = await requireUser(request);
  if (!user) return json({ error: "Necesitas entrar." }, 401);
  const detail = await getProject(user.id, await readId(context));
  if (!detail) return json({ error: NOT_FOUND }, 404);
  return json(detail);
}

export async function DELETE(request, context) {
  const user = await requireUser(request);
  if (!user) return json({ error: "Necesitas entrar." }, 401);
  const removed = await deleteProject(user.id, await readId(context));
  if (!removed) return json({ error: NOT_FOUND }, 404);
  return new Response(null, {
    status: 204,
    headers: { "cache-control": "no-store" },
  });
}
