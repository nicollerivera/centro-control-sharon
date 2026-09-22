import webpush from 'web-push';
import { leerJson, escribirJson } from './_blob.js';
import { avisosPara, avisosDeAhora, enSilencio } from './_avisos.js';

/* El trabajo diario que manda los avisos. Lo dispara el cron de Vercel a las
   8 de la noche hora de Colombia: el dia antes (D85) y fuera del silencio (D46). */
const RUTA_DATOS = 'centro-control-sharon/data.json';
const RUTA_PUSH = 'centro-control-sharon/push.json';
const RUTA_YA = 'centro-control-sharon/avisos-enviados.json';

function autorizado(req) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return true;                       // sin secreto, queda abierto
  return req.headers.authorization === `Bearer ${secreto}`;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!autorizado(req)) return res.status(401).json({ error: 'No autorizado' });

  /* Las llaves se pegan a mano en Vercel y llegan con un salto de linea, un
     espacio o el "=" del final: web-push las rechaza y se caia todo el envio.
     Se limpian antes de usarlas en vez de pedirle que las pegue de nuevo. */
  const limpiarLlave = (k) =>
    String(k || '').trim().replace(/\s+/g, '').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const VAPID_PUBLIC_KEY = limpiarLlave(process.env.VAPID_PUBLIC_KEY);
  const VAPID_PRIVATE_KEY = limpiarLlave(process.env.VAPID_PRIVATE_KEY);
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return res.status(500).json({ error: 'Faltan las llaves VAPID' });
  }
  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:nicollerivera282016@gmail.com',
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY
    );
  } catch (err) {
    console.error('[avisos] llaves VAPID invalidas', err?.message);
    return res.status(500).json({
      error: 'Las llaves VAPID de Vercel no sirven: hay que generarlas de nuevo con "npx web-push generate-vapid-keys".',
      detalle: err?.message,
    });
  }

  try {
    if (enSilencio() && req.query?.momento !== 'prueba') {
      return res.status(200).json({ ok: true, motivo: 'silencio' });
    }

    const guardado = await leerJson(RUTA_DATOS, null);
    const datos = guardado?.data ?? guardado ?? null;

    /* Dos formas de correr: la de todos los dias (los tres avisos del contrato,
       el dia antes) y la de cada rato, que es la que alcanza a avisar de una
       clase antes de que empiece. */
    const alInstante = req.query?.momento === 'ahora';
    /* La prueba tiene que salir del servidor y volver por el mismo camino que
       los de verdad. La de antes se la pintaba el propio telefono: decia que
       si aunque las llaves estuvieran rotas y no llegara nunca nada. */
    const esPrueba = req.query?.momento === 'prueba';
    let avisos = esPrueba
      ? [{ tipo:'prueba', titulo:'Bitácora', cuerpo:'Prueba: los avisos te están llegando bien.', ir:'yo' }]
      : alInstante ? avisosDeAhora(datos) : avisosPara(datos);

    /* lo de cada rato se repetiria en cada corrida: cada aviso se manda una vez */
    let yaEnviados = null;
    if (alInstante && avisos.length) {
      yaEnviados = (await leerJson(RUTA_YA, { claves: [] }))?.claves || [];
      avisos = avisos.filter((a) => !yaEnviados.includes(a.clave));
    }
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

    /* se guarda lo mandado, con la fecha de hoy nada mas: lo viejo se cae solo */
    if (alInstante && enviados) {
      const hoy = avisos[0].clave.slice(0, 10);
      const claves = [...(yaEnviados || []).filter((k) => k.startsWith(hoy)), ...avisos.map((a) => a.clave)];
      await escribirJson(RUTA_YA, { claves });
    }

    if (muertas.length) {
      await escribirJson(RUTA_PUSH, { subs: subs.filter((s) => !muertas.includes(s.endpoint)) });
    }
    return res.status(200).json({ ok: enviados > 0 || !avisos.length, avisos: avisos.length,
      enviados, dispositivos: subs.length, limpiadas: muertas.length,
      error: enviados === 0 && avisos.length
        ? 'No se pudo entregar en ninguno de los ' + subs.length + ' dispositivos guardados.' : undefined });
  } catch (err) {
    console.error('[api/avisos]', err);
    return res.status(500).json({ error: err?.message || 'Error inesperado' });
  }
}
