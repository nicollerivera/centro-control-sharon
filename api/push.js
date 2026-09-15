import { leerJson, escribirJson } from './_blob.js';

/* Los telefonos y navegadores donde Sharon quiere recibir los avisos.
   Guardamos la suscripcion que da el navegador; sin ella no hay forma de
   mandarle nada con la app cerrada. */
const RUTA = 'centro-control-sharon/push.json';

function autorizado(req) {
  const esperado = process.env.APP_PASSWORD;
  if (!esperado) return true;
  return req.headers['x-app-password'] === esperado;
}

async function leerCuerpo(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  const trozos = [];
  for await (const t of req) trozos.push(t);
  return JSON.parse(Buffer.concat(trozos).toString('utf8') || '{}');
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  /* La llave publica la necesita el navegador para suscribirse. No es secreta. */
  if (req.method === 'GET') {
    return res.status(200).json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(500).json({ error: 'Falta el Blob store' });
  }
  if (!autorizado(req)) return res.status(401).json({ error: 'PIN incorrecto' });

  try {
    const cuerpo = await leerCuerpo(req);
    const sub = cuerpo?.subscription;
    if (!sub?.endpoint) return res.status(400).json({ error: 'Falta la suscripción' });

    const guardadas = (await leerJson(RUTA, { subs: [] }))?.subs || [];
    const otras = guardadas.filter((s) => s.endpoint !== sub.endpoint);

    if (req.method === 'DELETE' || cuerpo.quitar) {
      await escribirJson(RUTA, { subs: otras });
      return res.status(200).json({ ok: true, activas: otras.length });
    }

    const nuevas = [...otras, { ...sub, desde: new Date().toISOString() }];
    await escribirJson(RUTA, { subs: nuevas });
    return res.status(200).json({ ok: true, activas: nuevas.length });
  } catch (err) {
    console.error('[api/push]', err);
    return res.status(500).json({ error: err?.message || 'Error inesperado' });
  }
}
