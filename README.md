# Seal22

Micro alpha local de Seal22: escribes un prompt, ves el precio antes de generar y, si cabe en el tope de la sesión, aparece una preview que puedes retocar con otro prompt.

La hipótesis que cubre esta entrega es solo esa: **prompt → app → preview → edición por prompt**, con un coste cerrado. No hay cuentas, pagos, hosting ni un modelo de pago.

## Arranque

```bash
npm install
npm test
npm run dev
```

Abre `http://127.0.0.1:5173`.

`npm run build` deja la versión estática en `dist/`.

## Qué puedes hacer

- Elegir un ejemplo o escribir el prompt. El precio (0,06 USD de base, más 0,01 USD por cada 200 caracteres) se muestra antes del botón.
- Confirmar con el botón o con Ctrl+Enter. El tope de la sesión es 0,25 USD. Si la siguiente petición no cabe, no se genera y no se descuenta.
- Usar la preview: tareas, notas, contador, carta, calculadora o una página sencilla.
- Pedir un cambio: color, título, «añade…» o «quita…».
- Abrir la pestaña Código y copiar o descargar `src/App.jsx` (React + Tailwind, sin backend).

## Supuesto

No hay clave de modelo en este entorno. El proveedor `alpha-local` interpreta el prompt en el navegador y no hace una llamada de red. Las cifras son la tarifa que confirmarías antes de ejecutar; esta alpha no cobra dinero real.
