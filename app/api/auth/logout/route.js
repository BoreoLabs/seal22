import { json, isSameOrigin, clearSessionCookie, readSessionToken } from "../../../../src/server/http.js";
import { logoutToken } from "../../../../src/server/accounts.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  if (!isSameOrigin(request)) return json({ error: "La petición no viene de Seal22." }, 403);
  const raw = await request.text();
  if (raw.trim()) {
    try {
      JSON.parse(raw);
    } catch {
      return json({ error: "No he podido leer la petición." }, 400);
    }
  }

  await logoutToken(readSessionToken(request));
  return new Response(null, {
    status: 204,
    headers: {
      "cache-control": "no-store",
      "set-cookie": clearSessionCookie(request),
    },
  });
}
