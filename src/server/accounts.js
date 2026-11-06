import crypto from "node:crypto";
import { sql } from "./db.js";
import { readSessionToken } from "./http.js";
import { DUMMY_PASSWORD_HASH, hashPassword, passwordError, verifyPassword } from "./passwords.js";

const NAME_ERROR = "Escribe tu nombre.";
const EMAIL_ERROR = "Ese correo no es válido.";
const DUPLICATE_ERROR = "Ya hay una cuenta con ese correo.";
const LOGIN_ERROR = "Correo o contraseña incorrectos.";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function invalid(error) {
  return { ok: false, code: "invalid", error };
}

function normalizeName(name) {
  if (typeof name !== "string") return invalid(NAME_ERROR);
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 80) return invalid(NAME_ERROR);
  return { ok: true, name: trimmed };
}

function normalizeEmail(email) {
  if (typeof email !== "string") return invalid(EMAIL_ERROR);
  const normalized = email.trim().toLowerCase();
  if (normalized.length < 1 || normalized.length > 200 || !EMAIL_PATTERN.test(normalized)) {
    return invalid(EMAIL_ERROR);
  }
  return { ok: true, email: normalized };
}

function publicUser(row) {
  return { id: row.id, name: row.name, email: row.email };
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("base64url");
}

function isDuplicateEmail(error) {
  const candidates = [error, error?.cause];
  return candidates.some((item) => item?.code === "23505" && item.constraint === "users_email_key");
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString("base64url");
  await sql(
    "insert into sessions (token_hash, user_id, expires_at) values ($1, $2, now() + interval '14 days')",
    [hashToken(token), userId],
  );
  return token;
}

async function userByEmail(email) {
  const rows = await sql(
    "select id, name, email, password_hash from users where email = $1",
    [email],
  );
  return rows[0] ?? null;
}

export async function registerUser({ name, email, password } = {}) {
  const named = normalizeName(name);
  if (!named.ok) return named;
  const mailed = normalizeEmail(email);
  if (!mailed.ok) return mailed;
  const passwordMessage = passwordError(password);
  if (passwordMessage) return invalid(passwordMessage);

  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  try {
    await sql("insert into users (id, name, email, password_hash) values ($1, $2, $3, $4)", [
      id,
      named.name,
      mailed.email,
      passwordHash,
    ]);
  } catch (error) {
    if (isDuplicateEmail(error)) return { ok: false, code: "exists", error: DUPLICATE_ERROR };
    throw error;
  }
  return { ok: true, user: { id, name: named.name, email: mailed.email } };
}

export async function loginUser({ email, password } = {}) {
  const mailed = normalizeEmail(email);
  const row = mailed.ok ? await userByEmail(mailed.email) : null;
  const candidate = typeof password === "string" ? password : "";
  const matches = await verifyPassword(candidate, row ? row.password_hash : DUMMY_PASSWORD_HASH);
  if (!row || !matches) return invalid(LOGIN_ERROR);
  const token = await createSession(row.id);
  return { ok: true, user: publicUser(row), token };
}

export async function logoutToken(token) {
  if (typeof token !== "string" || token.length === 0) return;
  await sql("delete from sessions where token_hash = $1", [hashToken(token)]);
}

export async function userFromToken(token) {
  if (typeof token !== "string" || token.length === 0) return null;
  const tokenHash = hashToken(token);
  const removed = await sql(
    "delete from sessions where token_hash = $1 and expires_at <= now() returning token_hash",
    [tokenHash],
  );
  if (removed.length > 0) return null;
  const rows = await sql(
    "select users.id as id, users.name as name, users.email as email from sessions join users on users.id = sessions.user_id where sessions.token_hash = $1 and sessions.expires_at > now()",
    [tokenHash],
  );
  const row = rows[0];
  if (!row) return null;
  return publicUser(row);
}

export async function requireUser(request) {
  return userFromToken(readSessionToken(request));
}
