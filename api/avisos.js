import webpush from 'web-push';
import { leerJson, escribirJson } from './_blob.js';
import { avisosPara, enSilencio } from './_avisos.js';

/* El trabajo diario que manda los avisos. Lo dispara el cron de Vercel a las
   8 de la noche hora de Colombia: el dia antes (D85) y fuera del silencio (D46). */
const RUTA_DATOS = 'centro-control-sharon/data.json';
const RUTA_PUSH = 'centro-control-sharon/push.json';

function autorizado(req) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return true;                       // sin secreto, queda abierto
  return req.headers.authorization === `Bearer ${secreto}`;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!autorizado(req)) return res.status(401).json({ error: 'No autorizado' });

  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return res.status(500).json({ error: 'Faltan las llaves VAPID' });
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:nicollerivera282016@gmail.com',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );

  try {
    if (enSilencio()) return res.status(200).json({ ok: true, motivo: 'silencio' });

    const guardado = await leerJson(RUTA_DATOS, null);
    const datos = guardado?.data ?? guardado ?? null;
    const avisos = avisosPara(datos);
    if (!avisos.length) return res.status(200).json({ ok: true, enviados: 0, motivo: 'nada que avisar' });

    const subs = (await leerJson(RUTA_PUSH, { subs: [] }))?.subs || [];
    if (!subs.length) return res.status(200).json({ ok: true, enviados: 0, motivo: 'sin dispositivos' });

    let enviados = 0;
    const muertas = [];
    for (const sub of subs) {
      for (const aviso of avisos) {
        try {
          await webpush.sendNotification(sub, JSON.stringify(aviso));
          enviados++;
        } catch (err) {
          /* 404 o 410: el navegador tiro esa suscripcion. Se limpia. */
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            muertas.push(sub.endpoint);
            break;
          }
          console.error('[avisos] fallo al enviar', err?.statusCode, err?.body);
        }
      }
    }

    if (muertas.length) {
      await escribirJson(RUTA_PUSH, { subs: subs.filter((s) => !muertas.includes(s.endpoint)) });
    }
    return res.status(200).json({ ok: true, avisos: avisos.length, enviados, limpiadas: muertas.length });
  } catch (err) {
    console.error('[api/avisos]', err);
    return res.status(500).json({ error: err?.message || 'Error inesperado' });
  }
}
