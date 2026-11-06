# Seal22

Constructor de apps con precio visible antes de ejecutar. Creas una cuenta, abres un proyecto y lo retocas con otro prompt. El tope de cada proyecto es 0,25 USD. Si la siguiente petición no cabe, no se genera y no se descuenta.

El proveedor de esta alpha es `alpha-local`: interpreta el prompt en el servidor y no llama a un modelo de pago. Las cifras son la tarifa que confirmarías antes de ejecutar.

## Arranque

```bash
npm install
npm test
npm run dev
```

Abre `http://127.0.0.1:5173`.

`npm run build` deja la app de Next lista y aplica las migraciones si existe `DATABASE_URL`.

## Qué puedes hacer

- Crear una cuenta, entrar y salir.
- Crear un proyecto desde un prompt y ver el precio antes de confirmar.
- Retocar la preview, copiar `src/App.jsx` y descargar el proyecto en zip.
- Construir la preview en Docker cuando el host tiene el motor y la imagen `seal22-sandbox:alpha`. El contenedor va sin red del host, sin socket de Docker, sin privilegios, con 0,5 CPU y 512 MB, y solo monta la carpeta del proyecto. Si no hay Docker, la preview del navegador sigue activa.

## Sandbox

La imagen se construye una vez, con red, desde `sandbox/`:

```bash
docker build -t seal22-sandbox:alpha sandbox
```
