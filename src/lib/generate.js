import { KIND_LABELS } from "./theme.js";

export const EXAMPLES = [
  "Lista de tareas para la panadería: amasar, hornear y cerrar caja. Color ámbar.",
  "Landing de Seal22 para pymes europeas.",
  "Calculadora sencilla de color azul.",
  "Notas de la reunión de hoy.",
];

const KIND_WORDS = [
  ["calc", ["calculadora", "calcular"]],
  ["notes", ["notas", "nota", "apuntes"]],
  ["counter", ["contador", "habito", "racha"]],
  ["menu", ["carta", "menu", "restaurante", "cafeteria", "platos"]],
  ["todos", ["tareas", "tarea", "pendientes", "compras", "compra", "lista"]],
  ["landing", ["landing", "pagina", "presentacion", "sitio web"]],
];

const COLOR_WORDS = [
  ["amber", ["ambar", "amarillo", "dorado"]],
  ["green", ["verde"]],
  ["rose", ["rosa", "fucsia"]],
  ["red", ["rojo"]],
  ["violet", ["violeta", "morado", "purpura"]],
  ["slate", ["oscuro", "negro"]],
  ["blue", ["azul"]],
  ["teal", ["teal", "turquesa"]],
];

const COLOR_STOPWORDS = new Set(["color", "en", "de", "a", "el", "la", "tono"]);

const DEFAULT_TITLES = {
  todos: "Lista de tareas",
  notes: "Notas",
  counter: "Contador",
  menu: "Carta",
  calc: "Calculadora",
  landing: "Tu página",
};

const DEFAULT_LABELS = {
  todos: ["Revisar el encargo", "Preparar la preview", "Anotar el coste"],
  notes: ["Primera nota"],
  menu: ["Café 1,80", "Tostada 2,40", "Zumo 2,90"],
  landing: ["Mensaje principal", "Para quién es", "Siguiente paso"],
  counter: [],
  calc: [],
};

export function fold(value) {
  return String(value ?? "")
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasWord(text, word) {
  const hay = fold(text);
  const needle = fold(word);
  const pattern = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(needle)}(?:[^a-z0-9]|$)`);
  return pattern.test(hay);
}

export function detectKind(prompt) {
  for (const [kind, words] of KIND_WORDS) {
    if (words.some((word) => hasWord(prompt, word))) return kind;
  }
  return null;
}

export function detectAccent(prompt) {
  for (const [accent, words] of COLOR_WORDS) {
    if (words.some((word) => hasWord(prompt, word))) return accent;
  }
  return null;
}

function tidy(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/^[,.:;¡!¿?\s]+|[,.:;¡!¿?\s]+$/g, "")
    .trim()
    .slice(0, 80);
}

function titleCase(value) {
  const text = tidy(value);
  if (!text) return text;
  return text.charAt(0).toLocaleUpperCase("es") + text.slice(1);
}

function stripArticle(value) {
  return value.replace(/^(?:la|el|los|las|un|una|mi)\s+/i, "");
}

function isColorOnly(text) {
  const words = fold(text).split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;
  const colors = new Set(COLOR_WORDS.flatMap(([, list]) => list));
  return words.every((word) => COLOR_STOPWORDS.has(word) || colors.has(word));
}

function splitLabels(text, { keepColors = false } = {}) {
  const protectedText = String(text ?? "").replace(/(\d),(\d)/g, "$1§$2");
  return protectedText
    .split(/[.;]|,(?:\s*)|\s+y\s+/i)
    .map((part) => tidy(part.replaceAll("§", ",")))
    .filter((part) => part.length > 1)
    .filter((part) => keepColors || !isColorOnly(part))
    .slice(0, 12);
}

function parsePriced(name) {
  const match = name.match(/^(.*?)\s+(\d{1,3}(?:[.,]\d{1,2})?)\s*€?$/);
  if (!match) return { name, price: null };
  const label = tidy(match[1]);
  if (!label) return { name, price: null };
  let price = match[2].replace(".", ",");
  if (!price.includes(",")) price = `${price},00`;
  return { name: label, price };
}

function asItems(labels, kind) {
  return labels.map((label) => (kind === "menu" ? parsePriced(label) : { name: label, price: null }));
}

function extractTitle(prompt, kind) {
  const quoted = prompt.match(/[«"“]([^»"”]{2,80})[»"”]/);
  if (quoted) return tidy(quoted[1]);

  if (kind === "landing") {
    const ofLanding = prompt.match(/\b(?:landing|p[aá]gina|sitio)\s+de\s+([^,:.]{2,60})/i);
    if (ofLanding) {
      return titleCase(stripArticle(tidy(ofLanding[1].replace(/\s+para\b.*$/i, ""))));
    }
  }

  if (kind === "notes") {
    const ofNotes = prompt.match(/\bnotas\s+de\s+([^,:.]{2,60})/i);
    if (ofNotes) return titleCase(stripArticle(tidy(ofNotes[1])));
  }

  const para = prompt.match(/\bpara\s+(?:la|el|los|las|un|una|mi)?\s*([^,:.]{2,60})/i);
  if (para) return titleCase(stripArticle(tidy(para[1])));

  return DEFAULT_TITLES[kind];
}

function extractTarget(prompt) {
  const match = prompt.match(/\b(\d{1,3})\b/);
  if (!match) return 8;
  const value = Number(match[1]);
  if (value < 1 || value > 500) return 8;
  return value;
}

function subtitleFor(kind, prompt, target) {
  if (kind === "todos") return "Marca lo que ya está hecho";
  if (kind === "notes") return "Se queda en esta preview";
  if (kind === "counter") return `Objetivo: ${target}`;
  if (kind === "calc") return "Suma, resta, multiplica y divide";
  if (kind === "menu") return "Toca un plato para apuntarlo";
  const para = prompt.match(/\bpara\s+([^,:.]{2,80})/i);
  if (para) return `Para ${tidy(para[1])}`;
  return "Borrador sin backend";
}

function createProject(prompt, revision) {
  const kind = detectKind(prompt) ?? "landing";
  const accent = detectAccent(prompt) ?? "teal";
  const target = kind === "counter" ? extractTarget(prompt) : 8;
  const colon = prompt.indexOf(":");
  const listed = colon >= 0 ? splitLabels(prompt.slice(colon + 1)) : [];
  const labels = listed.length > 0 ? listed : DEFAULT_LABELS[kind];
  return {
    revision,
    kind,
    accent,
    title: extractTitle(prompt, kind),
    subtitle: subtitleFor(kind, prompt, target),
    items: asItems(labels, kind),
    target,
  };
}

function clauses(prompt) {
  const parts = prompt
    .split(/\s+y\s+(?=(?:cambia|añade|anade|agrega|incluye|suma|quita|elimina|borra|pon|usa|renombra|llama))/i)
    .flatMap((part) => part.split(/[.;]+/))
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [prompt.trim()];
}

function matchTitle(clause) {
  const match = clause.match(
    /^(?:cambia(?:r)?\s+el\s+t[ií]tulo(?:\s+a)?|t[ií]tulo|renombra(?:r)?(?:la)?(?:\s+a)?|ll[aá]mala)\s+(.+)$/i,
  );
  if (!match) return null;
  const title = tidy(match[1]);
  return title.length >= 2 ? title : null;
}

function matchAdd(clause) {
  const match = clause.match(/^(?:añade|anade|agrega|incluye|suma)\s+(.+)$/i);
  if (!match) return null;
  const labels = splitLabels(match[1], { keepColors: true });
  return labels.length > 0 ? labels : null;
}

function matchRemove(clause, items) {
  const match = clause.match(/^(?:quita|elimina|borra)\s+(.+)$/i);
  if (!match) return null;
  const query = fold(tidy(match[1]));
  if (query.length < 2) return null;
  const next = items.filter((item) => !fold(item.name).includes(query));
  if (next.length === items.length) return null;
  return next;
}

function matchColor(clause) {
  const accent = detectAccent(clause);
  if (!accent) return null;
  const wordCount = fold(clause).split(/\s+/).filter(Boolean).length;
  if (hasWord(clause, "color") || hasWord(clause, "pon") || hasWord(clause, "usa") || wordCount <= 4) {
    return accent;
  }
  return null;
}

function patchProject(project, prompt) {
  const editableList = project.kind !== "calc" && project.kind !== "counter";
  let next = {
    ...project,
    items: project.items.map((item) => ({ ...item })),
  };
  let matched = false;

  for (const clause of clauses(prompt)) {
    const title = matchTitle(clause);
    if (title) {
      next.title = title;
      matched = true;
      continue;
    }

    if (editableList) {
      const added = matchAdd(clause);
      if (added) {
        next.items = [...next.items, ...asItems(added, project.kind)].slice(0, 12);
        matched = true;
        continue;
      }
      const removed = matchRemove(clause, next.items);
      if (removed) {
        next.items = removed;
        matched = true;
        continue;
      }
    }

    const accent = matchColor(clause);
    if (accent) {
      next.accent = accent;
      matched = true;
    }
  }

  if (!matched) return null;
  next.revision = project.revision + 1;
  return next;
}

export function applyPrompt(project, rawPrompt) {
  const prompt = String(rawPrompt ?? "").trim();
  if (!prompt) return { ok: false, code: "empty" };

  if (!project) {
    return { ok: true, action: "create", project: createProject(prompt, 1) };
  }

  const startsWithEdit = /^(?:cambia|añade|anade|agrega|incluye|suma|quita|elimina|borra|pon|usa|renombra|llama)\b/i.test(prompt);
  const nextKind = detectKind(prompt);
  if (nextKind && nextKind !== project.kind && !startsWithEdit) {
    return {
      ok: true,
      action: "replace",
      project: createProject(prompt, project.revision + 1),
    };
  }

  const patched = patchProject(project, prompt);
  if (patched) return { ok: true, action: "edit", project: patched };

  return { ok: false, code: "unknown" };
}

export function suggestionPrompts(project) {
  if (!project) return EXAMPLES;
  const color = project.accent === "green" ? "Cambia el color a azul" : "Cambia el color a verde";
  const title = "Cambia el título a Turno de mañana";
  if (project.kind === "calc" || project.kind === "counter") return [color, title];
  const add =
    project.kind === "menu"
      ? "Añade tortilla 4,50"
      : project.kind === "notes"
        ? "Añade pedir la cuenta"
        : project.kind === "landing"
          ? "Añade soporte en español"
          : "Añade revisar el horno";
  return [color, add, title];
}

export function describeAction(action, project) {
  const label = KIND_LABELS[project.kind] ?? "App";
  if (action === "edit") return `Cambio aplicado en «${project.title}».`;
  if (action === "replace") return `Nueva preview (${label}): «${project.title}».`;
  return `Preview lista (${label}): «${project.title}».`;
}
