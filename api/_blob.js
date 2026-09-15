import { head, put } from '@vercel/blob';

/* Helpers compartidos por /api/data y /api/avisos. */
export function esNoEncontrado(err) {
  const msg = err?.message || '';
  const name = err?.name || err?.constructor?.name || '';
  return /BlobNotFound/i.test(name) || /not\sfound|does\snot\s*exist/i.test(msg);
}

export async function leerJson(ruta, porDefecto = null) {
  let meta;
  try {
    meta = await head(ruta);
  } catch (err) {
    if (esNoEncontrado(err)) return porDefecto;
    throw err;
  }
  const r = await fetch(`${meta.url}?v=${Date.now()}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`No se pudo leer ${ruta} (${r.status})`);
  return await r.json();
}

export async function escribirJson(ruta, valor) {
  const opts = {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  };
  const cuerpo = JSON.stringify(valor);
  try {
    return await put(ruta, cuerpo, { ...opts, cacheControlMaxAge: 0 });
  } catch (err) {
    if (!/cache/i.test(err?.message || '')) throw err;
    return await put(ruta, cuerpo, { ...opts, cacheControlMaxAge: 60 });
  }
}
