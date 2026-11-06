import { json, isSameOrigin, clientKey, rateLimit, sessionCookie } from "../../../../src/server/http.js";
import { loginUser } from "../../../../src/server/accounts.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  if (!isSameOrigin(request)) return json({ error: "La petición no viene de Seal22." }, 403);
  if (!rateLimit(`auth:${clientKey(request)}`)) {
    return json({ error: "Demasiados intentos. Espera unos minutos." }, 429);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "No he podido leer la petición." }, 400);
  }

  const result = await loginUser({ email: body?.email, password: body?.password });
  if (!result.ok) return json({ error: result.error }, 401);
  return json({ user: result.user }, 200, {
    "set-cookie": sessionCookie(result.token, request),
  });
}
