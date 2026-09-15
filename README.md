# Centro de Control — Sharon

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
