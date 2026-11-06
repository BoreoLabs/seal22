import { json } from "../../../../../src/server/http.js";
import { requireUser } from "../../../../../src/server/accounts.js";
import { getProject } from "../../../../../src/server/projects.js";
import { exportZipBytes } from "../../../../../src/server/repo.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, context) {
  const user = await requireUser(request);
  if (!user) return json({ error: "Necesitas entrar." }, 401);
  const params = await context.params;
  const detail = await getProject(user.id, params.id);
  if (!detail) return json({ error: "No encuentro ese proyecto." }, 404);
  const bytes = await exportZipBytes(detail.files);
  return new Response(bytes, {
    status: 200,
    headers: {
      "content-type": "application/zip",
      "content-disposition": 'attachment; filename="seal22-proyecto.zip"',
      "cache-control": "no-store",
    },
  });
}
