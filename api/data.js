import { head, put } from '@vercel/blob';

/* Un único archivo JSON con todo el estado de la app. */
const BLOB_PATH = 'centro-control-sharon/data.json';
/* La copia de justo antes, y una por dia. Aca no habia nada: el ultimo que
   escribia ganaba y lo anterior se perdia para siempre, asi que un aparato que
   se quedara atras borraba el trabajo del otro sin vuelta. */
const BLOB_PREV = 'centro-control-sharon/data.prev.json';
const BLOB_DIA = (dia) => `centro-control-sharon/respaldos/data-${dia}.json`;
const MAX_BYTES = 4 * 1024 * 1024;

/* Si existe APP_PASSWORD, hay que mandar ese PIN en el header x-app-password.
   Sin la variable, el endpoint queda abierto (útil solo para probar). */
function authorized(req) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return true;
  const given = req.headers['x-app-password'];
  return typeof given === 'string' && given === expected;
}

function isNotFound(err) {
const msg = err?.message || '';
const name = err?.name || err?.constructor?.name || '';
return /BlobNotFound/i.test(name) || /not\sfound|does\snot\s*exist/i.test(msg);
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BYTES) throw new Error('El archivo de datos es demasiado grande');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

/* Guarda lo que hay ahora antes de pisarlo: siempre la anterior, y ademas la
   primera de cada dia, que es la que sirve cuando se da cuenta al otro dia. */
async function guardarCopia(anterior) {
  if (!anterior) return;
  const cuerpo = JSON.stringify(anterior);
  const opts = { access: 'public', contentType: 'application/json',
    addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60 };
  try {
    await put(BLOB_PREV, cuerpo, opts);
  } catch (err) {
    console.error('[api/data] no se pudo guardar la copia anterior', err?.message);
  }
  const dia = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
  try {
    await head(BLOB_DIA(dia));            // ya hay una de hoy: esa es la buena
  } catch (err) {
    if (!isNotFound(err)) return;
    try {
      await put(BLOB_DIA(dia), cuerpo, opts);
    } catch (e) {
      console.error('[api/data] no se pudo guardar la copia del dia', e?.message);
    }
  }
}

async function leerBlob(ruta) {
  let meta;
  try {
    meta = await head(ruta);
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
  const r = await fetch(`${meta.url}?v=${Date.now()}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`No se pudo leer el blob (${r.status})`);
  return { stored: await r.json(), meta };
}

async function writeBlob(payload) {
  const opts = {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  };
  try {
    return await put(BLOB_PATH, payload, { ...opts, cacheControlMaxAge: 0 });
  } catch (err) {
    /* Algunos planes no aceptan 0 como TTL: usamos el mínimo y leemos con cache-buster. */
    if (!/cache/i.test(err?.message || '')) throw err;
    return await put(BLOB_PATH, payload, { ...opts, cacheControlMaxAge: 60 });
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(500).json({
      error: 'Falta BLOB_READ_WRITE_TOKEN. Conectá un Blob store al proyecto en Vercel.',
    });
  }
  if (!authorized(req)) {
    return res.status(401).json({ error: 'PIN incorrecto' });
  }

  try {
    if (req.method === 'GET') {
      /* ?copia=prev trae la de justo antes; ?copia=2026-09-20, la de ese dia */
      const copia = req.query?.copia;
      const ruta = !copia ? BLOB_PATH
        : copia === 'prev' ? BLOB_PREV
        : /^\d{4}-\d{2}-\d{2}$/.test(copia) ? BLOB_DIA(copia)
        : null;
      if (!ruta) return res.status(400).json({ error: 'Copia no válida' });
      const leido = await leerBlob(ruta);
      if (!leido) return res.status(200).json({ data: null, updatedAt: null, copia: copia || null });
      const { stored, meta } = leido;
      return res.status(200).json({
        data: stored?.data ?? stored ?? null,
        updatedAt: stored?.updatedAt ?? meta.uploadedAt ?? null,
        copia: copia || null,
      });
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      const body = await readBody(req);
      const data = body?.data ?? body;
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return res.status(400).json({ error: 'Cuerpo inválido: se esperaba { data: {...} }' });
      }
      /* lo que habia se guarda antes de escribir encima */
      try {
        const antes = await leerBlob(BLOB_PATH);
        if (antes) await guardarCopia(antes.stored);
      } catch (err) {
        console.error('[api/data] no se pudo leer lo anterior', err?.message);
      }
      const updatedAt = new Date().toISOString();
      const blob = await writeBlob(JSON.stringify({ updatedAt, data }));
      return res.status(200).json({ ok: true, updatedAt, url: blob.url });
    }

    res.setHeader('Allow', 'GET, POST, PUT');
    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    console.error('[api/data]', err);
    return res.status(500).json({ error: err?.message || 'Error inesperado' });
  }
}
