export const CATALOG = [
  {
    id: "bakery",
    prompt: "Lista de tareas para la panadería: amasar, hornear y cerrar caja. Color ámbar.",
    kind: "todos",
    accent: "amber",
  },
  {
    id: "landing",
    prompt: "Landing de Seal22 para pymes europeas.",
    kind: "landing",
  },
  {
    id: "calc",
    prompt: "Calculadora sencilla de color azul.",
    kind: "calc",
    accent: "blue",
  },
  {
    id: "notes",
    prompt: "Notas de la reunión de hoy.",
    kind: "notes",
  },
  {
    id: "counter",
    prompt: "Contador de hábito hasta 21.",
    kind: "counter",
  },
  {
    id: "menu",
    prompt: "Carta de la cafetería: café 1,80, tostada 2,40 y zumo 2,90.",
    kind: "menu",
  },
  {
    id: "edit-color",
    base: "bakery",
    prompt: "Cambia el color a verde",
    kind: "todos",
    accent: "green",
  },
  {
    id: "edit-add",
    base: "bakery",
    prompt: "Añade revisar el horno",
    kind: "todos",
  },
  {
    id: "edit-title",
    base: "bakery",
    prompt: "Cambia el título a Turno de mañana",
    kind: "todos",
    title: "Turno de mañana",
  },
  {
    id: "unknown",
    base: "bakery",
    prompt: "haz magia con los astros",
    expect: "unknown",
  },
];
