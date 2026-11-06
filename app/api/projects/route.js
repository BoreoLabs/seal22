import { isSameOrigin, json } from "../../../src/server/http.js";
import { requireUser } from "../../../src/server/accounts.js";
import { createProject, listProjects } from "../../../src/server/projects.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resultResponse(result, status) {
  if (!result.ok) {
    const payload = { error: result.error };
    if (result.code) payload.code = result.code;
    return json(payload, result.status ?? 400);
  }
  return json({ project: result.project, turn: result.turn }, status);
}

export async function GET(request) {
  const user = await requireUser(request);
  if (!user) return json({ error: "Necesitas entrar." }, 401);
  return json({ projects: await listProjects(user.id) });
}

export async function POST(request) {
  if (!isSameOrigin(request)) return json({ error: "La petición no viene de Seal22." }, 403);
  const user = await requireUser(request);
  if (!user) return json({ error: "Necesitas entrar." }, 401);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "No he podido leer la petición." }, 400);
  }
  return resultResponse(await createProject(user.id, body?.prompt), 201);
}
