import { json, isSameOrigin, clientKey, rateLimit, sessionCookie } from "../../../../src/server/http.js";
import { registerUser, loginUser } from "../../../../src/server/accounts.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const blocked = rejectCrossSite(request);
  if (blocked) return blocked;
  const body = await readJson(request);
  if (body instanceof Response) return body;

  const created = await registerUser({
    name: body?.name,
    email: body?.email,
    password: body?.password,
  });
  if (!created.ok) {
    return json({ error: created.error }, created.code === "exists" ? 409 : 400);
  }

  const logged = await loginUser({ email: created.user.email, password: body?.password });
  if (!logged.ok) return json({ error: "No he podido abrir la sesión." }, 500);
  return json({ user: created.user }, 201, {
    "set-cookie": sessionCookie(logged.token, request),
  });
}

function rejectCrossSite(request) {
  if (!isSameOrigin(request)) return json({ error: "La petición no viene de Seal22." }, 403);
  if (!rateLimit(`auth:${clientKey(request)}`)) {
    return json({ error: "Demasiados intentos. Espera unos minutos." }, 429);
  }
  return null;
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return json({ error: "No he podido leer la petición." }, 400);
  }
}
