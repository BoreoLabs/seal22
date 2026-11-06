import { useState } from "react";
import { ACCENTS, KIND_LABELS } from "../lib/theme.js";

export function AppPreview({ project }) {
  if (!project) {
    return (
      <div className="grid min-h-[420px] place-items-center rounded-b-2xl bg-paper px-6 py-16 text-center">
        <div>
          <p className="font-serif text-2xl">Todavía no hay app</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ink/70">
            Escribe un prompt, mira el precio y confírmalo. La preview se abre aquí.
          </p>
        </div>
      </div>
    );
  }

  const accent = ACCENTS[project.accent] ?? ACCENTS.teal;
  return (
    <div className={`min-h-[420px] px-5 py-6 sm:px-8 ${accent.frame}`} data-accent={project.accent} data-kind={project.kind}>
      <p className="text-xs font-medium uppercase tracking-[0.14em] opacity-70">{KIND_LABELS[project.kind]}</p>
      <h2 className="mt-1 font-serif text-3xl leading-tight">{project.title}</h2>
      <p className="mt-1 text-sm opacity-80">{project.subtitle}</p>
      <div className="mt-5">
        {project.kind === "todos" ? <Todos project={project} accent={accent} /> : null}
        {project.kind === "notes" ? <Notes project={project} accent={accent} /> : null}
        {project.kind === "counter" ? <Counter project={project} accent={accent} /> : null}
        {project.kind === "menu" ? <Menu project={project} accent={accent} /> : null}
        {project.kind === "calc" ? <Calculator accent={accent} /> : null}
        {project.kind === "landing" ? <Landing project={project} accent={accent} /> : null}
      </div>
    </div>
  );
}

function Todos({ project, accent }) {
  const [items, setItems] = useState(() => project.items.map((item) => ({ name: item.name, done: false })));
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
    setItems((current) => [...current, { name, done: false }]);
    setDraft("");
    setError("");
  }

  function toggle(target) {
    setItems((current) => current.map((entry) => (entry === target ? { ...entry, done: !entry.done } : entry)));
  }

  return (
    <div>
      <p className="text-sm">{left === 0 ? "Lista cerrada." : `${left} pendientes`}</p>
      <form onSubmit={add} className="mt-3 flex gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className={`min-w-0 flex-1 rounded-lg border px-3 py-2 ${accent.input}`}
          placeholder="Nueva tarea"
          aria-label="Nueva tarea"
        />
        <button type="submit" className={`rounded-lg px-3 py-2 ${accent.solid}`}>
          Añadir
        </button>
      </form>
      {error ? (
        <p className="mt-2 text-sm" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        {[
          ["todas", "Todas"],
          ["pendientes", "Pendientes"],
          ["hechas", "Hechas"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className={`rounded-full border px-3 py-1 ${accent.line} ${filter === value ? accent.solid : accent.soft}`}
          >
            {label}
          </button>
        ))}
      </div>
      {items.length === 0 ? <p className="mt-4 text-sm">No queda ninguna tarea. Añade una aquí o con otro prompt.</p> : null}
      {items.length > 0 && visible.length === 0 ? <p className="mt-4 text-sm">No hay tareas en esta vista.</p> : null}
      <ul className="mt-4 space-y-2">
        {visible.map((item, index) => (
          <li key={`${item.name}-${index}`} className={`rounded-lg border px-3 py-2 ${accent.line} ${accent.soft}`}>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={item.done} onChange={() => toggle(item)} />
              <span className={item.done ? "line-through opacity-60" : ""}>{item.name}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Notes({ project, accent }) {
  const [value, setValue] = useState(() => project.items.map((item) => item.name).join("\n"));
  return (
    <div>
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        rows={8}
        aria-label="Nota"
        placeholder="Escribe una nota"
        className={`w-full rounded-xl border px-3 py-3 ${accent.input}`}
      />
      <p className="mt-2 text-sm opacity-70">{value.trim().length} caracteres</p>
    </div>
  );
}

function Counter({ project, accent }) {
  const [count, setCount] = useState(0);
  const width = Math.min(100, Math.round((count / project.target) * 100));
  return (
    <div>
      <p className="text-center font-serif text-6xl">{count}</p>
      <div className={`mx-auto mt-4 h-2 max-w-xs overflow-hidden rounded-full ${accent.soft}`}>
        <div className={`h-2 ${accent.solid}`} style={{ width: `${width}%` }} />
      </div>
      <p className="mt-3 text-center text-sm">{count >= project.target ? "Objetivo cumplido" : `Faltan ${project.target - count}`}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <button type="button" className={`rounded-lg px-4 py-2 ${accent.solid}`} onClick={() => setCount((value) => value + 1)}>
          +1
        </button>
        <button type="button" className={`rounded-lg border px-4 py-2 ${accent.line} ${accent.soft}`} onClick={() => setCount((value) => Math.max(0, value - 1))}>
          −1
        </button>
        <button type="button" className={`rounded-lg border px-4 py-2 ${accent.line} ${accent.soft}`} onClick={() => setCount(0)}>
          Reiniciar
        </button>
      </div>
    </div>
  );
}

function Menu({ project, accent }) {
  const [ordered, setOrdered] = useState([]);

  function toggle(name) {
    setOrdered((current) => (current.includes(name) ? current.filter((item) => item !== name) : [...current, name]));
  }

  if (project.items.length === 0) {
    return <p className="text-sm">La carta está vacía. Añade un plato con otro prompt.</p>;
  }

  return (
    <div>
      <p className="text-sm">{ordered.length} en el pedido</p>
      <ul className="mt-3 space-y-2">
        {project.items.map((dish) => {
          const active = ordered.includes(dish.name);
          return (
            <li key={dish.name}>
              <button
                type="button"
                onClick={() => toggle(dish.name)}
                aria-pressed={active}
                className={`flex w-full items-center justify-between rounded-lg border px-3 py-3 text-left ${accent.line} ${active ? accent.solid : accent.soft}`}
              >
                <span>{dish.name}</span>
                <span>{dish.price ? `${dish.price} €` : active ? "Pedido" : "Apuntar"}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Calculator({ accent }) {
  const [display, setDisplay] = useState("0");
  const [stored, setStored] = useState(null);
  const [operator, setOperator] = useState(null);
  const [fresh, setFresh] = useState(false);

  function inputDigit(digit) {
    setDisplay((current) => (fresh || current === "0" || current === "Error" ? digit : `${current}${digit}`));
    setFresh(false);
  }

  function inputDot() {
    setDisplay((current) => {
      const base = fresh || current === "Error" ? "0" : current;
      return base.includes(",") ? base : `${base},`;
    });
    setFresh(false);
  }

  function compute(left, op, right) {
    if (op === "+") return left + right;
    if (op === "-") return left - right;
    if (op === "*") return left * right;
    if (op === "/" && right === 0) return Number.POSITIVE_INFINITY;
    if (op === "/") return left / right;
    return right;
  }

  function choose(op) {
    const value = parseNumber(display);
    if (stored != null && operator && !fresh) {
      const result = compute(stored, operator, value);
      setStored(Number.isFinite(result) ? result : null);
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
    <div>
      <p className={`rounded-xl border px-4 py-5 text-right text-3xl ${accent.line} ${accent.soft}`} aria-live="polite">
        {display === "Error" ? "No se puede" : display}
      </p>
      {display === "Error" ? <p className="mt-2 text-sm">No se puede dividir entre cero.</p> : null}
      <div className="mt-4 grid grid-cols-4 gap-2">
        <button type="button" className={`col-span-4 rounded-lg border px-3 py-3 ${accent.line} ${accent.soft}`} onClick={clearAll}>
          Borrar
        </button>
        {keys.map((key) => (
          <button
            key={key}
            type="button"
            className={`rounded-lg px-3 py-3 ${key === "=" ? accent.solid : `border ${accent.line} ${accent.soft}`}`}
            onClick={() => {
              if (/\d/.test(key)) inputDigit(key);
              else if (key === ",") inputDot();
              else if (key === "=") equals();
              else choose(key);
            }}
          >
            {key === "*" ? "×" : key === "/" ? "÷" : key}
          </button>
        ))}
      </div>
    </div>
  );
}

function Landing({ project, accent }) {
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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setOk(false);
      setMessage("Ese correo no parece válido.");
      return;
    }
    setOk(true);
    setMessage("Apuntado en esta preview. No se ha enviado a ningún servidor.");
  }

  return (
    <div>
      <ul className="grid gap-3 sm:grid-cols-3">
        {project.items.map((item) => (
          <li key={item.name} className={`rounded-xl border px-4 py-4 ${accent.line} ${accent.soft}`}>
            {item.name}
          </li>
        ))}
      </ul>
      {project.items.length === 0 ? <p className="text-sm">Esta página no tiene bloques. Añade uno con otro prompt.</p> : null}
      <form onSubmit={submit} className="mt-5 flex max-w-md flex-col gap-2">
        <label htmlFor="preview-email">Correo para el aviso</label>
        <input
          id="preview-email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={`rounded-lg border px-3 py-2 ${accent.input}`}
          placeholder="tu@correo.es"
        />
        <button type="submit" className={`rounded-lg px-3 py-2 ${accent.solid}`}>
          Apuntarme
        </button>
        {message ? (
          <p className={ok ? "text-sm" : "text-sm font-medium"} role={ok ? "status" : "alert"}>
            {message}
          </p>
        ) : null}
      </form>
    </div>
  );
}

function parseNumber(value) {
  const number = Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : 0;
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return "Error";
  const rounded = Math.round(value * 1e8) / 1e8;
  return String(rounded).replace(".", ",");
}
