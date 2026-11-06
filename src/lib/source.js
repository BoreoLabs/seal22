import { ACCENTS } from "./theme.js";

function text(value) {
  return `{${JSON.stringify(value)}}`;
}

function banner() {
  return [
    "// Generado por Seal22 (alpha local).",
    "// Stack cerrado: React + Vite + Tailwind. Sin backend.",
    "",
  ].join("\n");
}

function names(project) {
  return JSON.stringify(
    project.items.map((item) => item.name),
    null,
    2,
  );
}

export function renderSource(project) {
  if (!project) return "";
  const accent = ACCENTS[project.accent] ?? ACCENTS.teal;
  if (project.kind === "todos") return renderTodos(project, accent);
  if (project.kind === "notes") return renderNotes(project, accent);
  if (project.kind === "counter") return renderCounter(project, accent);
  if (project.kind === "menu") return renderMenu(project, accent);
  if (project.kind === "calc") return renderCalc(project, accent);
  return renderLanding(project, accent);
}

function renderTodos(project, accent) {
  return `${banner()}import { useState } from "react";

const STARTER = ${names(project)};

export default function App() {
  const [items, setItems] = useState(STARTER.map((name) => ({ name, done: false })));
  const [draft, setDraft] = useState("");
  const [filter, setFilter] = useState("todas");
  const [error, setError] = useState("");
  const left = items.filter((item) => !item.done).length;
  const visible = items.filter((item) => {
    if (filter === "pendientes") return !item.done;
    if (filter === "hechas") return item.done;
    return true;
  });

  function add(event) {
    event.preventDefault();
    const name = draft.trim();
    if (!name) {
      setError("Escribe la tarea.");
      return;
    }
    setItems([...items, { name, done: false }]);
    setDraft("");
    setError("");
  }

  return (
    <main className="min-h-screen px-6 py-10 ${accent.frame}">
      <p className="text-xs uppercase tracking-wide">Tareas</p>
      <h1 className="mt-1 text-3xl font-semibold">${text(project.title)}</h1>
      <p className="mt-1 text-sm opacity-80">${text(project.subtitle)}</p>
      <p className="mt-4 text-sm">{left === 0 ? "Lista cerrada." : \`\${left} pendientes\`}</p>
      <form onSubmit={add} className="mt-4 flex gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="flex-1 rounded-lg border px-3 py-2 ${accent.input}"
          placeholder="Nueva tarea"
          aria-label="Nueva tarea"
        />
        <button className="rounded-lg px-3 py-2 ${accent.solid}">Añadir</button>
      </form>
      {error ? <p className="mt-2 text-sm">{error}</p> : null}
      <div className="mt-4 flex gap-2 text-sm">
        {["todas", "pendientes", "hechas"].map((value) => (
          <button key={value} type="button" onClick={() => setFilter(value)} className="rounded-full border px-3 py-1 ${accent.line}">
            {value}
          </button>
        ))}
      </div>
      {visible.length === 0 ? <p className="mt-4 text-sm">No hay tareas en esta vista.</p> : null}
      <ul className="mt-4 space-y-2">
        {visible.map((item) => (
          <li key={item.name} className="rounded-lg border px-3 py-2 ${accent.line} ${accent.soft}">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={item.done}
                onChange={() =>
                  setItems(items.map((entry) => (entry.name === item.name ? { ...entry, done: !entry.done } : entry)))
                }
              />
              <span className={item.done ? "line-through opacity-60" : ""}>{item.name}</span>
            </label>
          </li>
        ))}
      </ul>
    </main>
  );
}
`;
}

function renderNotes(project, accent) {
  const starter = project.items.map((item) => item.name).join("\n");
  return `${banner()}import { useState } from "react";

export default function App() {
  const [value, setValue] = useState(${JSON.stringify(starter)});

  return (
    <main className="min-h-screen px-6 py-10 ${accent.frame}">
      <p className="text-xs uppercase tracking-wide">Notas</p>
      <h1 className="mt-1 text-3xl font-semibold">${text(project.title)}</h1>
      <p className="mt-1 text-sm opacity-80">${text(project.subtitle)}</p>
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        rows={10}
        aria-label="Nota"
        placeholder="Escribe una nota"
        className="mt-4 w-full rounded-xl border px-3 py-3 ${accent.input}"
      />
      <p className="mt-2 text-sm opacity-70">{value.trim().length} caracteres</p>
    </main>
  );
}
`;
}

function renderCounter(project, accent) {
  return `${banner()}import { useState } from "react";

const TARGET = ${project.target};

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <main className="min-h-screen px-6 py-10 ${accent.frame}">
      <p className="text-xs uppercase tracking-wide">Contador</p>
      <h1 className="mt-1 text-3xl font-semibold">${text(project.title)}</h1>
      <p className="mt-1 text-sm opacity-80">${text(project.subtitle)}</p>
      <p className="mt-8 text-center text-6xl font-semibold">{count}</p>
      <p className="mt-2 text-center text-sm">{count >= TARGET ? "Objetivo cumplido" : \`Faltan \${TARGET - count}\`}</p>
      <div className="mt-6 flex justify-center gap-2">
        <button type="button" className="rounded-lg px-4 py-2 ${accent.solid}" onClick={() => setCount(count + 1)}>+1</button>
        <button type="button" className="rounded-lg border px-4 py-2 ${accent.line}" onClick={() => setCount(Math.max(0, count - 1))}>−1</button>
        <button type="button" className="rounded-lg border px-4 py-2 ${accent.line}" onClick={() => setCount(0)}>Reiniciar</button>
      </div>
    </main>
  );
}
`;
}

function renderMenu(project, accent) {
  const dishes = JSON.stringify(project.items, null, 2);
  return `${banner()}import { useState } from "react";

const DISHES = ${dishes};

export default function App() {
  const [ordered, setOrdered] = useState([]);

  function toggle(name) {
    setOrdered((current) => (current.includes(name) ? current.filter((item) => item !== name) : [...current, name]));
  }

  return (
    <main className="min-h-screen px-6 py-10 ${accent.frame}">
      <p className="text-xs uppercase tracking-wide">Carta</p>
      <h1 className="mt-1 text-3xl font-semibold">${text(project.title)}</h1>
      <p className="mt-1 text-sm opacity-80">${text(project.subtitle)}</p>
      <p className="mt-4 text-sm">{ordered.length} en el pedido</p>
      {DISHES.length === 0 ? <p className="mt-4 text-sm">La carta está vacía.</p> : null}
      <ul className="mt-4 space-y-2">
        {DISHES.map((dish) => (
          <li key={dish.name}>
            <button
              type="button"
              onClick={() => toggle(dish.name)}
              className="flex w-full items-center justify-between rounded-lg border px-3 py-3 text-left ${accent.line} ${accent.soft}"
              aria-pressed={ordered.includes(dish.name)}
            >
              <span>{dish.name}</span>
              <span>{dish.price ? \`\${dish.price} €\` : ordered.includes(dish.name) ? "Pedido" : "Apuntar"}</span>
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
`;
}

function renderCalc(project, accent) {
  return `${banner()}import { useState } from "react";

function parseNumber(value) {
  const number = Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : 0;
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return "Error";
  const rounded = Math.round(value * 1e8) / 1e8;
  return String(rounded).replace(".", ",");
}

export default function App() {
  const [display, setDisplay] = useState("0");
  const [stored, setStored] = useState(null);
  const [operator, setOperator] = useState(null);
  const [fresh, setFresh] = useState(false);

  function inputDigit(digit) {
    setDisplay((current) => (fresh || current === "0" || current === "Error" ? digit : \`\${current}\${digit}\`));
    setFresh(false);
  }

  function inputDot() {
    setDisplay((current) => {
      const base = fresh || current === "Error" ? "0" : current;
      return base.includes(",") ? base : \`\${base},\`;
    });
    setFresh(false);
  }

  function compute(left, op, right) {
    if (op === "+") return left + right;
    if (op === "-") return left - right;
    if (op === "*") return left * right;
    if (op === "/" && right === 0) return Infinity;
    if (op === "/") return left / right;
    return right;
  }

  function choose(op) {
    const value = parseNumber(display);
    if (stored != null && operator && !fresh) {
      const result = compute(stored, operator, value);
      setStored(result);
      setDisplay(formatNumber(result));
    } else {
      setStored(value);
    }
    setOperator(op);
    setFresh(true);
  }

  function equals() {
    if (operator == null || stored == null) return;
    const result = compute(stored, operator, parseNumber(display));
    setDisplay(formatNumber(result));
    setStored(null);
    setOperator(null);
    setFresh(true);
  }

  function clearAll() {
    setDisplay("0");
    setStored(null);
    setOperator(null);
    setFresh(false);
  }

  const keys = ["7", "8", "9", "/", "4", "5", "6", "*", "1", "2", "3", "-", "0", ",", "=", "+"];

  return (
    <main className="min-h-screen px-6 py-10 ${accent.frame}">
      <p className="text-xs uppercase tracking-wide">Calculadora</p>
      <h1 className="mt-1 text-3xl font-semibold">${text(project.title)}</h1>
      <p className="mt-1 text-sm opacity-80">${text(project.subtitle)}</p>
      <p className="mt-6 rounded-xl border px-4 py-5 text-right text-3xl ${accent.line} ${accent.soft}" aria-live="polite">
        {display === "Error" || display === "Infinity" ? "No se puede" : display}
      </p>
      <div className="mt-4 grid grid-cols-4 gap-2">
        <button type="button" className="col-span-4 rounded-lg border px-3 py-3 ${accent.line}" onClick={clearAll}>
          Borrar
        </button>
        {keys.map((key) => (
          <button
            key={key}
            type="button"
            className={"rounded-lg px-3 py-3 " + (key === "=" ? "${accent.solid}" : "border ${accent.line} ${accent.soft}")}
            onClick={() => {
              if (/\\d/.test(key)) inputDigit(key);
              else if (key === ",") inputDot();
              else if (key === "=") equals();
              else choose(key);
            }}
          >
            {key === "*" ? "×" : key === "/" ? "÷" : key}
          </button>
        ))}
      </div>
    </main>
  );
}
`;
}

function renderLanding(project, accent) {
  const features = JSON.stringify(
    project.items.map((item) => item.name),
    null,
    2,
  );
  return `${banner()}import { useState } from "react";

const FEATURES = ${features};

export default function App() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState(false);

  function submit(event) {
    event.preventDefault();
    const value = email.trim();
    if (!value) {
      setOk(false);
      setMessage("Escribe un correo.");
      return;
    }
    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(value)) {
      setOk(false);
      setMessage("Ese correo no parece válido.");
      return;
    }
    setOk(true);
    setMessage("Apuntado en esta preview. No se ha enviado a ningún servidor.");
  }

  return (
    <main className="min-h-screen px-6 py-10 ${accent.frame}">
      <p className="text-xs uppercase tracking-wide">Página</p>
      <h1 className="mt-1 text-4xl font-semibold">${text(project.title)}</h1>
      <p className="mt-2 max-w-xl text-lg opacity-80">${text(project.subtitle)}</p>
      <ul className="mt-6 grid gap-3 sm:grid-cols-3">
        {FEATURES.map((feature) => (
          <li key={feature} className="rounded-xl border px-4 py-4 ${accent.line} ${accent.soft}">{feature}</li>
        ))}
      </ul>
      <form onSubmit={submit} className="mt-6 flex max-w-md flex-col gap-2">
        <label htmlFor="email">Correo para el aviso</label>
        <input id="email" value={email} onChange={(event) => setEmail(event.target.value)} className="rounded-lg border px-3 py-2 ${accent.input}" placeholder="tu@correo.es" />
        <button className="rounded-lg px-3 py-2 ${accent.solid}">Apuntarme</button>
        {message ? <p className={ok ? "" : "font-medium"}>{message}</p> : null}
      </form>
    </main>
  );
}
`;
}
