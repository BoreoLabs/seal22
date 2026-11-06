export class ApiError extends Error {
  constructor(message, status, code = "") {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function parseJson(response) {
  if (response.status === 204) return null;
  const type = response.headers.get("content-type") ?? "";
  if (!type.toLowerCase().includes("json")) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function errorFrom(response, payload) {
  const server = typeof payload?.error === "string" ? payload.error.trim() : "";
  const code = typeof payload?.code === "string" ? payload.code : "";
  const message = server || code || `No se ha podido completar la petición (${response.status}).`;
  return new ApiError(message, response.status, code);
}

export async function api(path, { method = "GET", body, blob = false } = {}) {
  const init = {
    method,
    credentials: "include",
    cache: "no-store",
  };
  if (body !== undefined) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new ApiError("No hay conexión con el servidor.", 0);
  }

  if (blob) {
    if (!response.ok) throw errorFrom(response, await parseJson(response));
    return response.blob();
  }

  const payload = await parseJson(response);
  if (!response.ok) throw errorFrom(response, payload);
  return payload;
}

export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function safePreviewSrc(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 4000) return "";
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("data:") || lower.startsWith("vbscript:")) return "";
  return trimmed;
}

export function projectPath(id, suffix = "") {
  return `/api/projects/${encodeURIComponent(id)}${suffix}`;
}
