import { isSameOrigin, json } from "../../../../../src/server/http.js";
import { requireUser } from "../../../../../src/server/accounts.js";
import { applyTurn } from "../../../../../src/server/projects.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readId(context) {
  const params = await context.params;
  return params.id;
}

export async function POST(request, context) {
  if (!isSameOrigin(request)) return json({ error: "La petición no viene de Seal22." }, 403);
  const user = await requireUser(request);
  if (!user) return json({ error: "Necesitas entrar." }, 401);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "No he podido leer la petición." }, 400);
  }
  const result = await applyTurn(user.id, await readId(context), body?.prompt);
  if (!result.ok) {
    const payload = { error: result.error };
    if (result.code) payload.code = result.code;
    return json(payload, result.status ?? 400);
  }
  return json({ project: result.project, turn: result.turn });
}
