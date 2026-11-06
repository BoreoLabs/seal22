import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;
const MIN_LENGTH = 8;
const MAX_LENGTH = 200;
const PASSWORD_ERROR = "La contraseña necesita 8 caracteres como mínimo.";
const PART = /^[A-Za-z0-9_-]+$/;

// Hash fijo de una contraseña que no pertenece a ninguna cuenta. Sirve para
// que un acceso con correo desconocido haga el mismo scrypt que uno real.
export const DUMMY_PASSWORD_HASH =
  "scrypt$7IY-On912hHcKOnYa6_qww$3aaWwgl7fFYz1raVD-BWoTvfDfZNls03U8brwtQcr7M";

export function passwordError(password) {
  if (typeof password !== "string" || password.length < MIN_LENGTH || password.length > MAX_LENGTH) {
    return PASSWORD_ERROR;
  }
  return null;
}

export async function hashPassword(password) {
  if (passwordError(password)) throw new Error("contraseña rechazada");
  const salt = randomBytes(SALT_LENGTH);
  const hash = Buffer.from(await scryptAsync(password, salt, KEY_LENGTH));
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export async function verifyPassword(password, stored) {
  if (typeof stored !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const saltPart = parts[1];
  const hashPart = parts[2];
  if (!PART.test(saltPart) || !PART.test(hashPart)) return false;
  const salt = Buffer.from(saltPart, "base64url");
  const expected = Buffer.from(hashPart, "base64url");
  if (salt.length !== SALT_LENGTH || expected.length !== KEY_LENGTH) return false;
  if (typeof password !== "string" || password.length > MAX_LENGTH) return false;
  const actual = Buffer.from(await scryptAsync(password, salt, KEY_LENGTH));
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
