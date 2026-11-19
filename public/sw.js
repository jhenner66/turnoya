'use strict';

/* ==================================================================
 * [ETIQUETA: CONFIGURACIÓN DE CACHÉ OFFLINE (SERVICE WORKER)]
 * Qué hace: Define la versión de caché y la lista de archivos esenciales
 * para que la app y el portal /mi-turno abran aunque no haya Internet.
 * ================================================================== */
const CACHE_NAME = 'turnoya-offline-v3';
const ARCHIVOS_BASE = [
  '/',
  '/mi-turno',
  '/index.html',
  '/mi-turno.html',
  '/styles.css',
  '/app.js',
  '/mi-turno.js',
  '/manifest.json'
];

// [ETIQUETA: INSTALACIÓN Y PRECARGA] Descarga los archivos base en caché al instalarse.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ARCHIVOS_BASE)).catch(() => {})
  );
  self.skipWaiting();
});

// [ETIQUETA: ACTIVACIÓN Y LIMPIEZA] Elimina versiones anteriores de la caché.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((claves) =>
      Promise.all(
        claves
          .filter((clave) => clave !== CACHE_NAME)
          .map((clave) => caches.delete(clave))
      )
    )
  );
  self.clients.claim();
});

// [ETIQUETA: INTERCEPTOR RED-PRIMERO CON RESPALDO LOCAL]
// Intenta descargar la versión más reciente; si falla la red, entrega desde caché.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Las llamadas a /api siempre van a la red; el cliente maneja la cola offline.
  if (url.pathname.startsWith('/api/')) return;

  // Para páginas y archivos estáticos: intenta red primero para tener siempre la última versión,
  // y si no hay Internet responde desde la caché local del teléfono.
  event.respondWith(
    fetch(request)
      .then((respuesta) => {
        if (respuesta && respuesta.ok) {
          const copia = respuesta.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copia)).catch(() => {});
        }
        return respuesta;
      })
      .catch(async () => {
        const enCache = await caches.match(request);
        if (enCache) return enCache;
        if (url.pathname.startsWith('/mi-turno') || url.pathname === '/colaborador') {
          return caches.match('/mi-turno.html');
        }
        return caches.match('/index.html');
      })
  );
});
