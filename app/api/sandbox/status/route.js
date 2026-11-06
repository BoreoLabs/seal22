import { requireUser } from "../../../../src/server/accounts.js";
import { json } from "../../../../src/server/http.js";
import { isUuid, sandboxStatus } from "../../../../src/server/sandbox.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const user = await requireUser(request);
  if (!user?.id || !isUuid(user.id)) return json({ error: "Necesitas entrar." }, 401);
  return json(await sandboxStatus());
}
