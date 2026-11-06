import { json } from "../../../../src/server/http.js";
import { requireUser } from "../../../../src/server/accounts.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const user = await requireUser(request);
  if (!user) return json({ error: "Necesitas entrar." }, 401);
  return json({ user });
}
