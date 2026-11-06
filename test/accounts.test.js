import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

process.env.SEAL22_DB = "memory";

const { resetDatabase, sql } = await import("../src/server/db.js");
const { hashPassword, passwordError, verifyPassword, DUMMY_PASSWORD_HASH } = await import("../src/server/passwords.js");
const { POST: register } = await import("../app/api/auth/register/route.js");
const { POST: login } = await import("../app/api/auth/login/route.js");
const { POST: logout } = await import("../app/api/auth/logout/route.js");
const { GET: me } = await import("../app/api/auth/me/route.js");

const PASSWORD = "12345678";
const PASSWORD_ERROR = "La contraseña necesita 8 caracteres como mínimo.";
const LOGIN_ERROR = "Correo o contraseña incorrectos.";

let client = 10;

function post(path, body, { origin = "http://localhost", ip, cookie, rawBody } = {}) {
  client += 1;
  const headers = {
    origin,
    "content-type": "application/json",
    "x-forwarded-for": ip ?? `203.0.113.${client}`,
  };
  if (cookie) headers.cookie = cookie;
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers,
    body: rawBody ?? JSON.stringify(body),
  });
}

function cookiePair(response) {
  const header = response.headers.get("set-cookie") ?? "";
  const match = header.match(/seal22_session=[^;]*/);
  return match ? match[0] : "";
}

test.describe("cuentas", { concurrency: false }, () => {
  test.beforeEach(async () => {
    await resetDatabase();
  });

  test("la contraseña se guarda con scrypt y rechaza valores mal formados", async () => {
    assert.equal(passwordError(PASSWORD), null);
    assert.equal(passwordError("a".repeat(200)), null);
    assert.equal(passwordError("corto"), PASSWORD_ERROR);
    assert.equal(passwordError("a".repeat(201)), PASSWORD_ERROR);
    assert.equal(passwordError(12345678), PASSWORD_ERROR);

    const stored = await hashPassword(PASSWORD);
    assert.match(stored, /^scrypt\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
    assert.equal(await verifyPassword(PASSWORD, stored), true);
    assert.equal(await verifyPassword("otra-clave", stored), false);
    assert.equal(await verifyPassword(PASSWORD, "scrypt$no$vale"), false);
    assert.equal(await verifyPassword(PASSWORD, "texto"), false);
    assert.equal(await verifyPassword(PASSWORD, null), false);
    assert.equal(await verifyPassword("a".repeat(500), stored), false);
    assert.equal(await verifyPassword("dummy-password-seal22", DUMMY_PASSWORD_HASH), true);
  });

  test("registra una cuenta y /me lee la cookie", async () => {
    const response = await register(post("/api/auth/register", {
      name: "  María López  ",
      email: "  Maria@Example.com ",
      password: PASSWORD,
    }));
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.deepEqual(Object.keys(body).sort(), ["user"]);
    assert.deepEqual(Object.keys(body.user).sort(), ["email", "id", "name"]);
    assert.equal(body.user.name, "María López");
    assert.equal(body.user.email, "maria@example.com");
    assert.equal(body.user.password_hash, undefined);

    const cookie = cookiePair(response);
    assert.match(response.headers.get("set-cookie"), /HttpOnly/);
    assert.match(response.headers.get("set-cookie"), /Max-Age=1209600/);
    const token = decodeURIComponent(cookie.slice("seal22_session=".length));
    const sessions = await sql("select token_hash, user_id from sessions");
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].user_id, body.user.id);
    assert.equal(sessions[0].token_hash, createHash("sha256").update(token).digest("base64url"));
    assert.notEqual(sessions[0].token_hash, token);

    const users = await sql("select password_hash from users where id = $1", [body.user.id]);
    assert.match(users[0].password_hash, /^scrypt\$/);
    assert.notEqual(users[0].password_hash, PASSWORD);

    const current = await me(new Request("http://localhost/api/auth/me", { headers: { cookie } }));
    assert.equal(current.status, 200);
    assert.deepEqual(await current.json(), { user: body.user });
  });

  test("rechaza un correo duplicado", async () => {
    const first = await register(post("/api/auth/register", {
      name: "Ana",
      email: "Ana@Example.com",
      password: PASSWORD,
    }));
    assert.equal(first.status, 201);
    const second = await register(post("/api/auth/register", {
      name: "Otra",
      email: "ana@example.com",
      password: "87654321",
    }));
    assert.equal(second.status, 409);
    assert.deepEqual(await second.json(), { error: "Ya hay una cuenta con ese correo." });
    const users = await sql("select email from users");
    assert.deepEqual(users.map((row) => row.email), ["ana@example.com"]);
  });

  test("rechaza una contraseña corta", async () => {
    const response = await register(post("/api/auth/register", {
      name: "Ana",
      email: "ana@example.com",
      password: "corta",
    }));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: PASSWORD_ERROR });
    const users = await sql("select id from users");
    assert.equal(users.length, 0);
  });

  test("rechaza un correo inválido", async () => {
    const response = await register(post("/api/auth/register", {
      name: "Ana",
      email: "no-es-correo",
      password: PASSWORD,
    }));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "Ese correo no es válido." });
  });

  test("rechaza un nombre vacío", async () => {
    const response = await register(post("/api/auth/register", {
      name: "   ",
      email: "ana@example.com",
      password: PASSWORD,
    }));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "Escribe tu nombre." });
  });

  test("la contraseña incorrecta usa el mismo error si el correo no existe", async () => {
    const created = await register(post("/api/auth/register", {
      name: "Ana",
      email: "ana@example.com",
      password: PASSWORD,
    }));
    assert.equal(created.status, 201);

    const wrong = await login(post("/api/auth/login", {
      email: "ana@example.com",
      password: "87654321",
    }));
    const missing = await login(post("/api/auth/login", {
      email: "otra@example.com",
      password: PASSWORD,
    }));
    assert.equal(wrong.status, 401);
    assert.equal(missing.status, 401);
    const wrongBody = await wrong.json();
    const missingBody = await missing.json();
    assert.deepEqual(wrongBody, { error: LOGIN_ERROR });
    assert.deepEqual(missingBody, wrongBody);
    assert.equal(wrong.headers.get("set-cookie"), null);
  });

  test("entra con la cookie y sale", async () => {
    await register(post("/api/auth/register", {
      name: "Ana",
      email: "ana@example.com",
      password: PASSWORD,
    }));
    const logged = await login(post("/api/auth/login", {
      email: " ANA@example.com ",
      password: PASSWORD,
    }));
    assert.equal(logged.status, 200);
    const body = await logged.json();
    assert.equal(body.user.email, "ana@example.com");
    assert.equal(body.user.password_hash, undefined);
    const cookie = cookiePair(logged);

    const current = await me(new Request("http://localhost/api/auth/me", { headers: { cookie } }));
    assert.equal(current.status, 200);

    const gone = await logout(post("/api/auth/logout", null, { cookie, rawBody: "" }));
    assert.equal(gone.status, 204);
    assert.equal(await gone.text(), "");
    assert.match(gone.headers.get("set-cookie"), /seal22_session=;/);
    assert.match(gone.headers.get("set-cookie"), /Max-Age=0/);

    const after = await me(new Request("http://localhost/api/auth/me", { headers: { cookie } }));
    assert.equal(after.status, 401);
    assert.deepEqual(await after.json(), { error: "Necesitas entrar." });
    const sessions = await sql("select token_hash from sessions where user_id = $1", [body.user.id]);
    assert.equal(sessions.length, 1);
  });

  test("un origen cruzado recibe 403", async () => {
    const response = await register(post("/api/auth/register", {
      name: "Ana",
      email: "ana@example.com",
      password: PASSWORD,
    }, { origin: "https://evil.example" }));
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "La petición no viene de Seal22." });
    const users = await sql("select id from users");
    assert.equal(users.length, 0);

    const logged = await login(post("/api/auth/login", {
      email: "ana@example.com",
      password: PASSWORD,
    }, { origin: "https://evil.example" }));
    assert.equal(logged.status, 403);
  });

  test("una sesión caducada se borra y /me responde 401", async () => {
    const created = await register(post("/api/auth/register", {
      name: "Ana",
      email: "ana@example.com",
      password: PASSWORD,
    }));
    const cookie = cookiePair(created);
    await sql("update sessions set expires_at = now() - interval '1 minute'");
    const response = await me(new Request("http://localhost/api/auth/me", { headers: { cookie } }));
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Necesitas entrar." });
    const sessions = await sql("select token_hash from sessions");
    assert.equal(sessions.length, 0);
  });

  test("un JSON ilegible responde 400", async () => {
    const response = await register(post("/api/auth/register", null, { rawBody: "{" }));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "No he podido leer la petición." });
  });

  test("demasiados intentos responden 429", async () => {
    const ip = "198.51.100.8";
    const statuses = [];
    for (let attempt = 0; attempt < 9; attempt += 1) {
      const response = await register(post("/api/auth/register", {
        name: "Ana",
        email: "ana@example.com",
        password: "corta",
      }, { ip }));
      statuses.push(response.status);
    }
    assert.deepEqual(statuses, [400, 400, 400, 400, 400, 400, 400, 400, 429]);
  });
});
