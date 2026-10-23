/* Panel de Paneles: botón "← Paneles" para volver a la portada.
   Lo carga candado.js en cada panel (y el Panel de Ventas con su propia línea).
   No aparece en los celulares de planta ni en la TV (#ot y #pantalla de Producción). */
(function () {
  'use strict';
  if (window.__spVolver) return; window.__spVolver = true;
  if (window.top !== window) return;
  if (/^\/Paneldepaneles(\/|$)/i.test(location.pathname)) return;
  var PORTADA = '/Paneldepaneles/';
  var vistaPlanta = function () {
    var h = (location.hash || '').replace(/^#/, '').split('/')[0];
    return /panel-produccion/i.test(location.pathname) && (h === 'ot' || h === 'pantalla');
  };
  var host = null;
  function crear() {
    if (host) return;
    host = document.createElement('sp-volver');
    host.style.cssText = 'all:initial;position:fixed;z-index:2147483000;left:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px))';
    var raiz = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    raiz.innerHTML =
      '<style>a{display:inline-flex;align-items:center;gap:6px;background:#141414;color:#F5C400;border:1px solid #F5C400;' +
      'border-radius:999px;padding:8px 14px 8px 11px;font:600 13px/1 -apple-system,"Segoe UI",Roboto,Arial,sans-serif;' +
      'text-decoration:none;box-shadow:0 2px 10px rgba(0,0,0,.35);opacity:.9;cursor:pointer;-webkit-tap-highlight-color:transparent}' +
      'a:hover{opacity:1;background:#F5C400;color:#141414}' +
      'a:focus-visible{outline:2px solid #fff;outline-offset:2px}' +
      '@media print{a{display:none}}</style>' +
      '<a href="' + PORTADA + '" title="Volver al Panel de Paneles">' +
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>Paneles</a>';
    document.body.appendChild(host);
    actualizar();
  }
  function actualizar() { if (host) host.style.display = vistaPlanta() ? 'none' : ''; }
  window.addEventListener('hashchange', actualizar);
  function arrancar() {
    if (window.PORTAL_ACCESO && typeof window.PORTAL_ACCESO.then === 'function') {
      window.PORTAL_ACCESO.then(function (a) { if (a && !a.planta) crear(); }, function () {});
    } else {
      var haySesion = false;
      try { haySesion = !!localStorage.getItem('sb-fzylibnqqjznaddgpsjt-auth-token'); } catch (e) {}
      if (haySesion) crear();
    }
  }
  if (document.body) arrancar(); else document.addEventListener('DOMContentLoaded', arrancar);
})();
