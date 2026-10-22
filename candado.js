/* ═══════════════════════════════════════════════════════════════
   CANDADO — login único para los paneles de SPL / Spotsline
   Se agrega como PRIMERA línea dentro del <head> de cada panel:

     <script src="/Paneldepaneles/candado.js" data-panel="patrimonial"></script>

   data-panel = patrimonial | eerr | proveedores | cobranzas | cheques | produccion | ausentismo

   Qué hace:
   1. Si no hay sesión → manda a la portada a ingresar (y vuelve solo a este panel).
   2. Si el usuario no tiene este panel asignado → muestra un aviso y no deja ver nada.
   3. Todo lo que el panel le pide a los Supabase viejos de Carla lo redirige al
      Supabase del portal, con la sesión del usuario (así las tablas quedan cerradas).
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var NUEVO_URL = 'https://fzylibnqqjznaddgpsjt.supabase.co';
  var NUEVO_KEY = 'sb_publishable_zHONcBODl6nbPiLS3TSrZw_D8MVJqeE';
  var VIEJOS = ['https://ozbynorwhkmevjmftpmy.supabase.co', 'https://edjbfzjzvpjkmjqjworu.supabase.co'];
  var RENOMBRES = { ventas: 'ventas_cobranza' };       // tablas que cambiaron de nombre
  var PORTAL = '/Paneldepaneles/';
  var CLAVE_SESION = 'sb-fzylibnqqjznaddgpsjt-auth-token'; // la misma que usa la portada

  var yo = document.currentScript;
  var PANEL = (yo && yo.getAttribute('data-panel')) || '';
  var fetchOriginal = window.fetch.bind(window);

  // Ocultar el panel hasta confirmar el acceso
  var estilo = document.createElement('style');
  estilo.id = 'candado-oculto';
  estilo.textContent = 'body{visibility:hidden!important}';
  document.documentElement.appendChild(estilo);

  function irAlPortal() {
    location.replace(PORTAL + '?volver=' + encodeURIComponent(location.pathname + location.search + location.hash));
  }
  function leerSesion() {
    try { return JSON.parse(localStorage.getItem(CLAVE_SESION) || 'null'); } catch (e) { return null; }
  }

  var refrescando = null;
  function tokenVigente() {
    var s = leerSesion();
    if (!s || !s.access_token) return Promise.resolve(null);
    var ahora = Math.floor(Date.now() / 1000);
    if (s.expires_at && s.expires_at - ahora > 60) return Promise.resolve(s.access_token);
    if (!s.refresh_token) return Promise.resolve(null);
    if (!refrescando) {
      refrescando = fetchOriginal(NUEVO_URL + '/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        headers: { apikey: NUEVO_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: s.refresh_token })
      }).then(function (r) { return r.ok ? r.json() : null; }).then(function (n) {
        refrescando = null;
        if (!n || !n.access_token) return null;
        if (!n.expires_at) n.expires_at = Math.floor(Date.now() / 1000) + (n.expires_in || 3600);
        try { localStorage.setItem(CLAVE_SESION, JSON.stringify(n)); } catch (e) {}
        return n.access_token;
      }).catch(function () { refrescando = null; return null; });
    }
    return refrescando;
  }

  // Redirigir pedidos a los Supabase viejos → Supabase del portal, con la sesión
  function redirigir(url) {
    for (var i = 0; i < VIEJOS.length; i++) {
      if (url.indexOf(VIEJOS[i] + '/rest/v1/') === 0) {
        var resto = url.slice((VIEJOS[i] + '/rest/v1/').length);
        var m = resto.match(/^([A-Za-z_]+)(.*)$/);
        if (m && RENOMBRES[m[1]]) resto = RENOMBRES[m[1]] + m[2];
        return NUEVO_URL + '/rest/v1/' + resto;
      }
    }
    return null;
  }

  window.fetch = function (entrada, opciones) {
    var url = typeof entrada === 'string' ? entrada : (entrada && entrada.url) || String(entrada);
    var nueva = redirigir(url);
    if (!nueva) return fetchOriginal(entrada, opciones);
    var base = (typeof entrada === 'object' && entrada instanceof Request) ? entrada : null;
    var init = Object.assign({}, opciones || {});
    if (base && !opciones) {
      init = { method: base.method, headers: base.headers, body: base.method === 'GET' || base.method === 'HEAD' ? undefined : base.clone().body, duplex: 'half' };
    }
    return tokenVigente().then(function (token) {
      if (!token) { irAlPortal(); return new Response('[]', { status: 401 }); }
      var h = new Headers(init.headers || {});
      h.set('apikey', NUEVO_KEY);
      h.set('Authorization', 'Bearer ' + token);
      init.headers = h;
      return fetchOriginal(nueva, init);
    });
  };

  function mostrarSinAcceso(texto) {
    var aviso = document.createElement('div');
    aviso.setAttribute('style', 'position:fixed;inset:0;z-index:2147483647;background:#0f0f0f;color:#f0f0f0;display:flex;align-items:center;justify-content:center;padding:16px;font-family:-apple-system,Segoe UI,Arial,sans-serif;visibility:visible');
    aviso.innerHTML = '<div style="max-width:380px;background:#1a1a1a;border:1px solid #333;border-top:3px solid #f5c400;border-radius:12px;padding:24px">' +
      '<div style="font:11px ui-monospace,Consolas,monospace;letter-spacing:.1em;color:#666;text-transform:uppercase">SPL / Spotsline</div>' +
      '<h2 style="margin:6px 0 10px;font-size:20px">Sin acceso a este panel</h2>' +
      '<p style="color:#aaa;font-size:14px;line-height:1.5;margin:0 0 16px">' + texto + '</p>' +
      '<a href="' + PORTAL + '" style="display:inline-block;background:#f5c400;color:#111;font-weight:700;text-decoration:none;padding:10px 14px;border-radius:8px">Ir al Panel de Paneles</a></div>';
    var poner = function () { document.body.appendChild(aviso); };
    if (document.body) poner(); else document.addEventListener('DOMContentLoaded', poner);
  }
  function mostrarPanel() {
    var e = document.getElementById('candado-oculto');
    if (e) e.remove();
  }

  // Verificar sesión y permiso
  tokenVigente().then(function (token) {
    if (!token) { irAlPortal(); return; }
    return fetchOriginal(NUEVO_URL + '/rest/v1/rpc/portal_tiene_panel', {
      method: 'POST',
      headers: { apikey: NUEVO_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_panel: PANEL })
    }).then(function (r) {
      if (r.status === 401) { irAlPortal(); return; }
      return r.json().then(function (ok) {
        if (ok === true) mostrarPanel();
        else mostrarSinAcceso('Tu usuario no tiene habilitado este panel. Pedíselo a un administrador desde Permisos en el Panel de Paneles.');
      });
    });
  }).catch(function () {
    mostrarSinAcceso('No se pudo verificar tu acceso. Revisá tu conexión y volvé a intentar.');
  });
})();
