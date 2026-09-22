/* Service worker de Bitacora.

   Guarda la app en el telefono para que abra sin internet. Los datos siguen
   viniendo de /api/data como siempre: eso NO se cachea nunca, porque es lo
   unico que tiene que estar fresco.

   Reglas:
   - la pagina: primero la red, y si no hay, la copia guardada
   - los iconos y el manifest: primero la copia, y de fondo se actualizan
   - /api/*: siempre la red, el service worker ni se mete
*/

const VERSION = 'v5';
const CACHE = `bitacora-${VERSION}`;
const CACHE_EXTERNO = `bitacora-externo-${VERSION}`;

/* Lo minimo para que la app arranque sin conexion. */
const ESENCIALES = [
  '/',
  '/manifest.json',
  '/icons/icono-192.png',
  '/icons/icono-512.png',
  '/icons/apple-touch-icon.png',
  '/icons/favicon-32.png',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE)
      /* uno por uno: si un archivo falla, los demas igual quedan guardados */
      .then((cache) => Promise.all(ESENCIALES.map((url) => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((nombres) => Promise.all(
        nombres
          .filter((n) => n !== CACHE && n !== CACHE_EXTERNO)
          .map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

/* La pagina: se intenta la red para traer siempre la version nueva, y si no
   hay senal se sirve la copia guardada. */
async function redPrimero(request) {
  const cache = await caches.open(CACHE);
  try {
    /* sin no-store, el telefono podia contestar con la pagina que ya tenia
       guardada en su propio cache y la version nueva no llegaba nunca */
    const respuesta = await fetch(request, { cache: 'no-store' });
    if (respuesta && respuesta.ok && !respuesta.redirected) {
      cache.put('/', respuesta.clone());
    }
    return respuesta;
  } catch (err) {
    const guardada = await cache.match('/', { ignoreSearch: true });
    if (guardada) return guardada;
    throw err;
  }
}

/* Iconos, manifest y fuentes: se sirve la copia al toque y se actualiza atras. */
async function copiaPrimero(request, nombreCache) {
  const cache = await caches.open(nombreCache);
  const guardada = await cache.match(request);
  const red = fetch(request)
    .then((respuesta) => {
      if (respuesta && respuesta.ok) cache.put(request, respuesta.clone());
      return respuesta;
    })
    .catch(() => null);
  return guardada || red.then((r) => r || Promise.reject(new Error('sin conexion')));
}

self.addEventListener('fetch', (evento) => {
  const { request } = evento;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  /* Los datos nunca se cachean: que la app siga sabiendo si hay senal o no. */
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    evento.respondWith(redPrimero(request));
    return;
  }

  if (url.origin === self.location.origin) {
    evento.respondWith(copiaPrimero(request, CACHE));
    return;
  }

  /* Las tipografias de Google: si no estan, la app usa la del sistema. */
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    evento.respondWith(copiaPrimero(request, CACHE_EXTERNO));
  }
});

/* ============================================================
   LOS AVISOS
   Llegan del servidor aunque la app este cerrada. El service worker solo los
   muestra: que se avisa y que no se decide en /api/_avisos.js.
============================================================ */
self.addEventListener('push', (evento) => {
  let aviso = {};
  try { aviso = evento.data ? evento.data.json() : {}; } catch (e) { aviso = {}; }
  const titulo = aviso.titulo || 'Bitácora';
  evento.waitUntil(
    self.registration.showNotification(titulo, {
      body: aviso.cuerpo || '',
      icon: '/icons/icono-192.png',
      badge: '/icons/icono-192.png',
      lang: 'es',
      /* el tag agrupa por tipo: dos avisos de pago no se apilan como dos torres */
      tag: 'bitacora-' + (aviso.tipo || 'general'),
      renotify: false,
      data: { ir: aviso.ir || 'hoy' },
    })
  );
});

/* Al tocarla, abre la app donde corresponde en vez de una pestana nueva. */
self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const ir = evento.notification.data?.ir || 'hoy';
  const destino = new URL('/?ir=' + ir, self.location.origin).href;
  evento.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((abiertas) => {
      for (const c of abiertas) {
        if (c.url.startsWith(self.location.origin)) {
          c.postMessage({ tipo: 'ir', a: ir });
          return c.focus();
        }
      }
      return clients.openWindow(destino);
    })
  );
});
