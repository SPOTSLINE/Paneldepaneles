/* Panel de Paneles: service worker mínimo para que se pueda instalar.
   No guarda copias de los datos: siempre pide todo a internet (datos frescos).
   Si no hay conexión, muestra un aviso en vez de la pantalla de error. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(() => new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Sin conexión</title><body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;' +
    'background:#141414;color:#eee;font-family:system-ui,sans-serif;text-align:center;padding:24px">' +
    '<div><h1 style="font-size:20px;color:#F5C400">Sin conexión</h1><p>Revisá el wifi o los datos y volvé a intentar.</p>' +
    '<button onclick="location.reload()" style="margin-top:10px;padding:10px 18px;border-radius:8px;border:0;background:#F5C400;font-weight:700">Reintentar</button></div>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
});
