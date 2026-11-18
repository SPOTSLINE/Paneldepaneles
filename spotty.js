/* Spotty: asistente de los paneles (Claude).
   Botón flotante con la mascota, abajo a la derecha (arriba de "💡 Mejoras"), en la portada y en todos los paneles.
   Al tocarlo abre el proyecto "Spotty" en Claude, que consulta los datos con el conector "paneles spotsline".
   Solo aparece a quien puede usar los agentes (admins y mails de MCP_PERMITIDOS en la función agente-paneles).
   No aparece en los celulares de planta ni en la TV (#ot y #pantalla de Producción).
   Lo carga volver.js en cada panel; la portada lo carga con su propia línea. */
(function () {
  'use strict';
  // ⬇⬇ Pegá acá el link del proyecto Spotty en Claude (Proyectos → Spotty → copiar la dirección del navegador)
  var SPOTTY_URL = 'https://claude.ai/project/01a1efcd-daa8-72f2-8992-2183b9deb383';
  // ⬆⬆
  var FUNCION = 'https://fzylibnqqjznaddgpsjt.supabase.co/functions/v1/agente-paneles';
  var CLAVE_SESION = 'sb-fzylibnqqjznaddgpsjt-auth-token';
  var IMG = '/Paneldepaneles/';

  if (window.__spSpotty) return; window.__spSpotty = true;
  if (window.top !== window) return;
  var vistaPlanta = function () {
    var h = (location.hash || '').replace(/^#/, '').split('/')[0];
    return /panel-produccion/i.test(location.pathname) && (h === 'ot' || h === 'pantalla');
  };
  function sesion() { try { return JSON.parse(localStorage.getItem(CLAVE_SESION) || 'null'); } catch (e) { return null; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // ¿Puede usar Spotty? Se pregunta a la función una vez por sesión del navegador.
  function puede() {
    var s = sesion(); if (!s || !s.access_token) return Promise.resolve(null);
    var k = 'spotty_ok_' + ((s.user && s.user.id) || '');
    try { var c = JSON.parse(sessionStorage.getItem(k) || 'null'); if (c) return Promise.resolve(c); } catch (e) {}
    return fetch(FUNCION + '/puedo', { method: 'POST', headers: { Authorization: 'Bearer ' + s.access_token } })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (j && j.motivo !== 'sin sesión') { try { sessionStorage.setItem(k, JSON.stringify(j)); } catch (e) {} } return j; })
      .catch(function () { return null; });
  }

  var host = null, raiz = null;
  function crear(nombre) {
    if (host) return;
    host = document.createElement('sp-spotty');
    host.style.cssText = 'all:initial;position:fixed;z-index:2147482999;right:12px;bottom:calc(62px + env(safe-area-inset-bottom,0px))';
    raiz = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    var primerNombre = String(nombre || '').trim().split(/\s+/)[0];
    raiz.innerHTML =
      '<style>' +
      '*{box-sizing:border-box;font-family:-apple-system,"Segoe UI",Roboto,Arial,sans-serif}' +
      '.fab{width:58px;height:58px;border-radius:50%;border:0;padding:0;background:transparent;cursor:pointer;position:relative;-webkit-tap-highlight-color:transparent;filter:drop-shadow(0 3px 8px rgba(0,0,0,.45));transition:transform .15s}' +
      '.fab:hover{transform:scale(1.08)}.fab:focus-visible{outline:2px solid #fff;outline-offset:3px}' +
      '.fab img{position:absolute;inset:0;width:100%;height:100%;transition:opacity .2s;animation:flota 3s ease-in-out infinite}' +
      '.fab .feliz{opacity:0}.fab:hover .feliz,.abierto .fab .feliz{opacity:1}.fab:hover .normal,.abierto .fab .normal{opacity:0}' +
      '@keyframes flota{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}' +
      '.card{position:absolute;right:0;bottom:68px;width:min(320px,calc(100vw - 24px));background:#141414;color:#EDEDE8;border:1px solid #3A3A36;border-radius:14px;padding:14px 14px 12px;box-shadow:0 10px 30px rgba(0,0,0,.5);display:none}' +
      '.abierto .card{display:block}' +
      '.cab{display:flex;align-items:center;gap:10px;margin-bottom:8px}.cab img{width:38px;height:38px}' +
      '.cab b{color:#F5C400;font-size:15px;display:block}.cab small{color:#A3A39B;font-size:12px}' +
      '.x{margin-left:auto;background:none;border:0;color:#A3A39B;font-size:16px;cursor:pointer;padding:4px}' +
      'p{font-size:13px;line-height:1.45;margin:6px 0}' +
      '.ej{display:flex;flex-direction:column;gap:5px;margin:10px 0}' +
      '.ej button{background:#1F1F1C;border:1px solid #33332F;color:#D9D9D3;border-radius:8px;padding:7px 9px;font-size:12.5px;text-align:left;cursor:pointer}' +
      '.ej button:hover{border-color:#F5C400;color:#fff}' +
      '.ir{display:block;width:100%;text-align:center;background:#F5C400;color:#141414;border-radius:9px;padding:10px;font-weight:700;font-size:14px;text-decoration:none;margin-top:4px}' +
      '.ir:hover{filter:brightness(1.07)}.nota{font-size:11.5px;color:#8E8E86;margin-top:8px}.ok{color:#7BD88F}' +
      '@media print{:host{display:none}}' +
      '</style>' +
      '<div class="wrap">' +
      '<div class="card" role="dialog" aria-label="Spotty">' +
      '<div class="cab"><img src="' + IMG + 'spotty_feliz.webp" alt=""><div><b>Spotty</b><small>Tu asistente de los paneles</small></div><button class="x" aria-label="Cerrar">✕</button></div>' +
      '<p>¡Hola' + (primerNombre ? ' ' + esc(primerNombre) : '') + '! Preguntame lo que quieras de los paneles: ventas, resultados, cobranzas, proveedores, stock, producción, ausentismo…</p>' +
      '<div class="ej">' +
      '<button data-q="¿Cómo fueron las ventas de este mes?">📈 ¿Cómo fueron las ventas de este mes?</button>' +
      '<button data-q="¿Cómo me fue el último mes cerrado?">📊 ¿Cómo me fue el último mes cerrado?</button>' +
      '<button data-q="¿Cuánto nos deben a más de 90 días y quiénes?">💰 ¿Cuánto nos deben a más de 90 días?</button>' +
      '</div>' +
      '<a class="ir" target="_blank" rel="noopener">Hablar con Spotty</a>' +
      '<div class="nota" id="nota">Se abre en Claude. Tocá un ejemplo para copiarlo y pegalo ahí.</div>' +
      '</div>' +
      '<button class="fab" aria-label="Abrir a Spotty, el asistente" title="¿Te ayudo? Soy Spotty">' +
      '<img class="normal" src="' + IMG + 'spotty_normal.webp" alt=""><img class="feliz" src="' + IMG + 'spotty_feliz.webp" alt="">' +
      '</button></div>';
    var wrap = raiz.querySelector('.wrap'), ir = raiz.querySelector('.ir'), nota = raiz.querySelector('#nota');
    if (SPOTTY_URL) ir.href = SPOTTY_URL;
    else { ir.href = 'https://claude.ai/projects'; nota.textContent = 'Todavía falta cargar el link del proyecto Spotty en spotty.js. Mientras, abrí Claude → Proyectos → Spotty.'; }
    raiz.querySelector('.fab').addEventListener('click', function () { wrap.classList.toggle('abierto'); });
    raiz.querySelector('.x').addEventListener('click', function () { wrap.classList.remove('abierto'); });
    raiz.querySelector('.ej').addEventListener('click', function (e) {
      var b = e.target.closest('[data-q]'); if (!b) return;
      var t = b.getAttribute('data-q');
      var listo = function () { nota.innerHTML = '<span class="ok">✓ Copiado.</span> Pegalo en Spotty (Ctrl+V).'; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(listo, function () {}); else listo();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') wrap.classList.remove('abierto'); });
    document.body.appendChild(host);
    actualizar();
  }
  function actualizar() { if (host) host.style.display = vistaPlanta() ? 'none' : ''; }
  window.addEventListener('hashchange', actualizar);

  function arrancar() {
    if (vistaPlanta()) return;
    var acceso = (window.PORTAL_ACCESO && typeof window.PORTAL_ACCESO.then === 'function') ? window.PORTAL_ACCESO : Promise.resolve({});
    acceso.then(function (a) {
      if (a && a.planta) return;
      // en la portada la sesión puede tardar unos segundos en quedar guardada
      var intentos = 0;
      (function probar() {
        puede().then(function (r) {
          if (r && r.ok) crear(r.nombre || (a && a.nombre));
          else if (!r && intentos++ < 5) setTimeout(probar, 2000);
        });
      })();
    }, function () {});
  }
  if (document.body) arrancar(); else document.addEventListener('DOMContentLoaded', arrancar);
})();
