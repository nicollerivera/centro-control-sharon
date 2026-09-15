# Bitácora

App de una sola página (`index.html`) con los datos guardados en **Vercel Blob**,
así el mismo estado se ve desde el celular y la compu.

## Cómo funciona

- `api/data.js` — función serverless que lee y escribe un único JSON
  (`centro-control-sharon/data.json`) en el Blob store.
  - `GET /api/data` → `{ data, updatedAt }` (`data: null` si todavía no hay nada).
  - `POST /api/data` con `{ data: {...} }` → guarda el estado completo.
- `index.html` — al abrir muestra la caché de `localStorage` (instantáneo, y sirve
  sin conexión) y enseguida baja lo que hay en el Blob. Cada cambio se guarda local
  al toque y sube al Blob 600 ms después.
- El pill de arriba a la derecha muestra el estado (Sincronizado / Sincronizando /
  Sin conexión / Bloqueado). Tocarlo fuerza una sincronización.
- Sin conexión los cambios quedan marcados como pendientes y suben solos cuando
  vuelve la red o al reabrir la app. Gana el último que escribe.

## Configuración en Vercel

1. Importar el repo como proyecto (framework: **Other**, sin build command).
2. En **Storage → Create Database → Blob**, crear el store y conectarlo al proyecto.
   Eso agrega sola la variable `BLOB_READ_WRITE_TOKEN`.
3. Opcional pero recomendado: en **Settings → Environment Variables** agregar
   `APP_PASSWORD` con un PIN. Sin esa variable el endpoint queda abierto a
   cualquiera que conozca la URL. Con ella, la app pide el PIN una vez por
   dispositivo y lo recuerda.
4. Deploy.

Para correr local: `npm i -g vercel && vercel dev` (con `vercel env pull` para
traer las variables).

## Los avisos

Solo existen tres y llegan el día antes: una entrega de la universidad que se
acerca, un pago o cuota por vencer, y un hueco libre con un pendiente que cabe.
Nunca avisa de recoger a Joel ni de entrar o salir de un turno, y no manda nada
entre las 11 de la noche y las 6 de la mañana.

- `api/_avisos.js` — qué se avisa y qué no. Es el contrato; si algo cambia,
  cambia acá y en la Guía.
- `api/push.js` — guarda la suscripción del navegador (`GET` devuelve la llave
  pública; `POST` guarda; `POST` con `quitar:true` borra).
- `api/avisos.js` — el trabajo diario. Lo dispara el cron de Vercel a la
  1:00 UTC, que son las 8 de la noche en Colombia.

### Variables que hay que poner en Vercel

| Variable | Para qué |
|---|---|
| `VAPID_PUBLIC_KEY` | la llave que el navegador usa para suscribirse |
| `VAPID_PRIVATE_KEY` | **secreta** — con ella se firman los avisos |
| `VAPID_SUBJECT` | opcional, un `mailto:` de contacto |
| `CRON_SECRET` | opcional pero recomendado: sin ella `/api/avisos` queda abierto |

Para generar un par nuevo: `npx web-push generate-vapid-keys`.
Si se cambian las llaves, todos los dispositivos hay que volver a suscribirlos.
