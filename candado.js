/* ═══════════════════════════════════════════════════════════════
   CANDADO — login único para los paneles de SPL / Spotsline
   Se agrega como PRIMERA línea dentro del <head> de cada panel:

     <script src="/Paneldepaneles/candado.js" data-panel="patrimonial"></script>

   data-panel = patrimonial | eerr | proveedores | cobranzas | cheques | produccion | ausentismo
   data-sin-login = "ot,pantalla"  (opcional) pantallas que se pueden abrir sin usuario, por ejemplo
                    el modo Operario (celular) y la TV de Producción.

   Qué hace:
   1. Si no hay sesión → manda a la portada a ingresar (y vuelve solo a este panel).
   2. Si el usuario no tiene este panel asignado → muestra un aviso y no deja ver nada.
   3. Todo lo que el panel le pide a los Supabase viejos de Carla lo redirige al
      Supabase del portal, con la sesión del usuario (así las tablas quedan cerradas).
   4. Le avisa al panel quién entró y sus permisos internos:
        window.PORTAL_ACCESO  → promesa con { user_id, email, nombre, es_admin, config }
        window.PORTAL.usuarios() → usuarios que tienen este panel (para menciones, etc.)
        window.PORTAL.salir()    → cierra la sesión y vuelve a la portada

   ACCESO DE OPERARIOS (versión 2026-11-12, sin clave en este archivo)
   Solo en paneles con data-sin-login (Producción). Sin sesión del Panel de Paneles, la
   sesión de planta se pide a la función de Supabase "prod-acceso", que la entrega si:
     • viene de Mi Spotsline (sessionStorage 'rrhh_tok') y el empleado está habilitado en
       Producción, o
     • el equipo está registrado (TV, PC de sector): se abre una vez el link
       ...?equipo=CODIGO#vista que da prod_nuevo_dispositivo() y el código queda guardado.
   Un equipo de operario (Mi Spotsline, equipo registrado o con sesión de planta guardada)
   entra en cualquier pantalla, no solo en las de data-sin-login.
   Si no se puede entrar, al operario se le explica qué hacer: nunca se lo manda a
   ingresar al Panel de Paneles.
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
  var SIN_LOGIN = ((yo && yo.getAttribute('data-sin-login')) || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
  var CLAVE_PLANTA = 'spl-planta-sesion';           // sesión de celulares / TV de planta
  var CLAVE_EQUIPO = 'spl-equipo';                  // código de equipo registrado (TV, PC de sector)
  var FUNCION_ACCESO = NUEVO_URL + '/functions/v1/prod-acceso';
  var MI_SPOTSLINE = 'https://spotsline.github.io/Panel-de-Ausentismo/portal_empleado.html#produccion';
  var vistaActual = function () { return (location.hash || '').replace(/^#/, '').split('/')[0]; };
  var esVistaLibre = function () { return SIN_LOGIN.indexOf(vistaActual()) >= 0; };
  var usandoPlanta = false;
  var verificado = false;      // true cuando terminó la verificación inicial
  var plantaFallida = false;   // no se pudo abrir el modo planta: no seguir pidiendo
  var errorPlanta = '';        // último motivo por el que no se pudo abrir el modo planta
  var fetchOriginal = window.fetch.bind(window);
  var resolverAcceso, avisarVerificado;
  window.PORTAL_ACCESO = new Promise(function (r) { resolverAcceso = r; });
  var VERIFICACION = new Promise(function (r) { avisarVerificado = r; });

  function ls(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function ss(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }

  // Link de alta de un equipo: ...?equipo=CODIGO#vista → se guarda el código y se saca de la dirección
  (function () {
    if (!SIN_LOGIN.length) return;
    try {
      var u = new URL(location.href);
      var cod = u.searchParams.get('equipo');
      if (!cod) return;
      localStorage.setItem(CLAVE_EQUIPO, cod.trim());
      localStorage.removeItem(CLAVE_PLANTA);         // que pida una sesión nueva con el código
      u.searchParams.delete('equipo');
      history.replaceState(history.state, '', u.pathname + u.search + u.hash);
    } catch (e) {}
  })();

  // Equipo de operario: viene de Mi Spotsline, es un equipo registrado o ya tiene sesión de planta
  function esEquipoOperario() {
    if (!SIN_LOGIN.length) return false;
    return !!(ss('rrhh_tok') || ls(CLAVE_EQUIPO) || ls(CLAVE_PLANTA));
  }
  function puedeModoPlanta() { return SIN_LOGIN.length > 0 && (esVistaLibre() || esEquipoOperario()); }

  // Ocultar el panel hasta confirmar el acceso
  var estilo = document.createElement('style');
  estilo.id = 'candado-oculto';
  estilo.textContent = 'body{visibility:hidden!important}';
  document.documentElement.appendChild(estilo);

  function irAlPortal() {
    location.replace(PORTAL + '?volver=' + encodeURIComponent(location.pathname + location.search + location.hash));
  }
  function leerSesion(clave) {
    try { return JSON.parse(localStorage.getItem(clave || (usandoPlanta ? CLAVE_PLANTA : CLAVE_SESION)) || 'null'); } catch (e) { return null; }
  }

  var refrescando = null;
  function tokenVigente() {
    var s = leerSesion();
    if (!s || !s.access_token) return Promise.resolve(null);
    var ahora = Math.floor(Date.now() / 1000);
    if (s.expires_at && s.expires_at - ahora > 60) return Promise.resolve(s.access_token);
    if (!s.refresh_token) return Promise.resolve(null);
    if (!refrescando) {
      var claveDestino = usandoPlanta ? CLAVE_PLANTA : CLAVE_SESION;
      refrescando = fetchOriginal(NUEVO_URL + '/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        headers: { apikey: NUEVO_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: s.refresh_token })
      }).then(function (r) { return r.ok ? r.json() : null; }).then(function (n) {
        refrescando = null;
        if (!n || !n.access_token) return null;
        if (!n.expires_at) n.expires_at = Math.floor(Date.now() / 1000) + (n.expires_in || 3600);
        try { localStorage.setItem(claveDestino, JSON.stringify(n)); } catch (e) {}
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
    // Si el panel pide datos antes de que termine la verificación inicial, se espera
    // (evita mandar al Panel de Paneles a un operario por una sesión vieja vencida).
    if (!verificado) return VERIFICACION.then(function () { return window.fetch(entrada, opciones); });
    var base = (typeof entrada === 'object' && entrada instanceof Request) ? entrada : null;
    var init = Object.assign({}, opciones || {});
    if (base && !opciones) {
      init = { method: base.method, headers: base.headers, body: base.method === 'GET' || base.method === 'HEAD' ? undefined : base.clone().body, duplex: 'half' };
    }
    return tokenVigente().then(function (t) { return (!t && usandoPlanta && !plantaFallida) ? pedirSesionPlanta() : t; }).then(function (token) {
      if (!token) { if (!usandoPlanta) irAlPortal(); return new Response('[]', { status: 401 }); }
      var h = new Headers(init.headers || {});
      h.set('apikey', NUEVO_KEY);
      h.set('Authorization', 'Bearer ' + token);
      init.headers = h;
      return fetchOriginal(nueva, init);
    });
  };

  function tarjeta(titulo, texto, botones) {
    var aviso = document.createElement('div');
    aviso.id = 'candado-aviso';
    aviso.setAttribute('style', 'position:fixed;inset:0;z-index:2147483647;background:#0f0f0f;color:#f0f0f0;display:flex;align-items:center;justify-content:center;padding:16px;font-family:-apple-system,Segoe UI,Arial,sans-serif;visibility:visible');
    aviso.innerHTML = '<div style="max-width:380px;background:#1a1a1a;border:1px solid #333;border-top:3px solid #f5c400;border-radius:12px;padding:24px">' +
      '<div style="font:11px ui-monospace,Consolas,monospace;letter-spacing:.1em;color:#666;text-transform:uppercase">SPL / Spotsline</div>' +
      '<h2 style="margin:6px 0 10px;font-size:20px">' + titulo + '</h2>' +
      '<p style="color:#aaa;font-size:14px;line-height:1.5;margin:0 0 16px">' + texto + '</p>' + botones + '</div>';
    var poner = function () { var v = document.getElementById('candado-aviso'); if (v) v.remove(); document.body.appendChild(aviso); };
    if (document.body) poner(); else document.addEventListener('DOMContentLoaded', poner);
  }
  var BOTON = 'display:inline-block;background:#f5c400;color:#111;font-weight:700;text-decoration:none;padding:10px 14px;border-radius:8px;margin:0 8px 8px 0';
  var BOTON2 = 'display:inline-block;background:#2a2a2a;color:#f0f0f0;font-weight:600;text-decoration:none;padding:10px 14px;border-radius:8px;margin:0 8px 8px 0;border:1px solid #444';

  function mostrarSinAcceso(texto) {
    tarjeta('Sin acceso a este panel', texto, '<a href="' + PORTAL + '" style="' + BOTON + '">Ir al Panel de Paneles</a>');
  }
  // Aviso para operarios: explica qué hacer y no los manda al Panel de Paneles
  function mostrarAvisoOperario(motivo) {
    var deMiSpotsline = !!ss('rrhh_tok');
    var texto = {
      sesion_vencida: 'Tu sesión de Mi Spotsline venció. Volvé a entrar desde Mi Spotsline → Producción.',
      no_habilitado: 'Todavía no estás habilitado para cargar producción. Avisale a tu supervisor.',
      equipo_no_habilitado: 'Este equipo no está habilitado para Producción. Pedile al supervisor el link de alta del equipo.',
      sin_credencial: 'Para cargar producción entrá desde <b>Mi Spotsline</b> → botón <b>Producción</b>.'
    }[motivo] || 'No se pudo conectar con Producción. Probá de nuevo en un momento; si sigue, avisale a tu supervisor.';
    var botones = '<a href="' + MI_SPOTSLINE + '" style="' + (deMiSpotsline || motivo === 'sin_credencial' || motivo === 'sesion_vencida' ? BOTON : BOTON2) + '">Ir a Mi Spotsline</a>' +
      '<a href="#" onclick="location.reload();return false" style="' + BOTON2 + '">Probar de nuevo</a>' +
      '<div style="margin-top:10px;font-size:12px"><a href="' + PORTAL + '?volver=' + encodeURIComponent(location.pathname + location.hash) + '" style="color:#777">Soy supervisor / gerencia: ingresar con mi usuario</a></div>';
    tarjeta('Producción no está disponible ahora', texto, botones);
  }
  function mostrarPanel() {
    var e = document.getElementById('candado-oculto');
    if (e) e.remove();
  }

  function rpc(nombre, datos, token) {
    return fetchOriginal(NUEVO_URL + '/rest/v1/rpc/' + nombre, {
      method: 'POST',
      headers: { apikey: NUEVO_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(datos || {})
    });
  }

  // Sesión de planta: la entrega la función prod-acceso (Mi Spotsline o equipo registrado)
  var infoPlanta = null;
  function entrarComoPlanta() {
    usandoPlanta = true;
    var s = leerSesion(CLAVE_PLANTA);
    if (s && s.access_token) return tokenVigente().then(function (t) { return t || pedirSesionPlanta(); });
    return pedirSesionPlanta();
  }
  var pidiendo = null;
  function pedirSesionPlanta() {
    if (pidiendo) return pidiendo;
    var tok = ss('rrhh_tok'), equipo = ls(CLAVE_EQUIPO);
    if (!tok && !equipo) { errorPlanta = 'sin_credencial'; return Promise.resolve(null); }
    var cuerpo = tok ? { rrhh_tok: tok } : { equipo: equipo };
    pidiendo = fetchOriginal(FUNCION_ACCESO, {
      method: 'POST', headers: { apikey: NUEVO_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo)
    }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (j) {
        if (!r.ok || !j || !j.ok || !j.session || !j.session.access_token) {
          errorPlanta = (j && j.error) || ('http_' + r.status);
          // Si el token de Mi Spotsline venció pero el equipo está registrado, se prueba con el equipo
          if (tok && equipo && (errorPlanta === 'sesion_vencida')) { pidiendo = null; try { sessionStorage.removeItem('rrhh_tok'); } catch (e) {} return pedirSesionPlanta(); }
          try { console.warn('[candado] prod-acceso:', errorPlanta); } catch (e) {}
          return null;
        }
        var n = j.session;
        if (!n.expires_at) n.expires_at = Math.floor(Date.now() / 1000) + (n.expires_in || 3600);
        try { localStorage.setItem(CLAVE_PLANTA, JSON.stringify(n)); } catch (e) {}
        infoPlanta = { via: j.via, quien: j.quien, vista: j.vista };
        errorPlanta = '';
        return n.access_token;
      });
    }).catch(function () { errorPlanta = 'sin_conexion'; return null; })
      .then(function (t) { pidiendo = null; return t; });
    return pidiendo;
  }

  window.PORTAL = {
    panel: PANEL,
    planta: false,
    irAlPortal: irAlPortal,
    usuarios: function () {
      return tokenVigente().then(function (t) { return rpc('portal_usuarios_panel', { p_panel: PANEL }, t); })
        .then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; });
    },
    // Olvida este equipo (deja de entrar solo). Para usar desde la consola o un botón del panel.
    olvidarEquipo: function () { try { localStorage.removeItem(CLAVE_EQUIPO); localStorage.removeItem(CLAVE_PLANTA); } catch (e) {} },
    salir: function () {
      var s = leerSesion();
      var fin = function () { try { localStorage.removeItem(CLAVE_SESION); } catch (e) {} location.href = PORTAL; };
      if (s && s.access_token) {
        fetchOriginal(NUEVO_URL + '/auth/v1/logout', { method: 'POST', headers: { apikey: NUEVO_KEY, Authorization: 'Bearer ' + s.access_token } })
          .then(fin, fin);
      } else fin();
    }
  };

  function modoPlanta() {
    return entrarComoPlanta().then(function (t) {
      if (!t) { plantaFallida = true; mostrarAvisoOperario(errorPlanta); return; }
      window.PORTAL.planta = true;
      var i = infoPlanta || {};
      resolverAcceso({ ok: true, planta: true, user_id: null, email: '', nombre: 'Planta', es_admin: false, config: {}, acceso: i.via || 'sesion_guardada', quien: i.quien || '', vista_equipo: i.vista || '' });
      mostrarPanel();
    });
  }

  // Verificar sesión y permiso
  tokenVigente().then(function (token) {
    if (!token && puedeModoPlanta()) return modoPlanta();
    if (!token) { irAlPortal(); return; }
    return rpc('portal_mi_acceso', { p_panel: PANEL }, token).then(function (r) {
      if (r.status === 401) { if (puedeModoPlanta()) return modoPlanta(); irAlPortal(); return; }
      if (r.status === 404) {
        // Todavía no se corrió 2_permisos_paneles.sql: se usa el chequeo simple
        return rpc('portal_tiene_panel', { p_panel: PANEL }, token).then(function (r2) { return r2.json(); }).then(function (ok) {
          if (ok === true) { resolverAcceso({ ok: true, user_id: null, email: '', nombre: '', es_admin: false, config: {} }); mostrarPanel(); }
          else if (puedeModoPlanta()) return modoPlanta();
          else mostrarSinAcceso('Tu usuario no tiene habilitado este panel. Pedíselo a un administrador desde Usuarios en el Panel de Paneles.');
        });
      }
      return r.json().then(function (a) {
        if (a && a.ok) { resolverAcceso(a); mostrarPanel(); }
        else if (puedeModoPlanta()) return modoPlanta();
        else mostrarSinAcceso('Tu usuario no tiene habilitado este panel. Pedíselo a un administrador desde Usuarios en el Panel de Paneles.');
      });
    });
  }).catch(function () {
    if (puedeModoPlanta()) mostrarAvisoOperario('sin_conexion');
    else mostrarSinAcceso('No se pudo verificar tu acceso. Revisá tu conexión y volvé a intentar.');
  }).then(function () { verificado = true; avisarVerificado(); });
})();

/* Botón "← Paneles" para volver a la portada (no aparece en planta ni en la TV) */
(function () {
  if (window.__spVolverCargado) return; window.__spVolverCargado = true;
  var s = document.createElement('script'); s.src = '/Paneldepaneles/volver.js'; s.defer = true;
  (document.head || document.documentElement).appendChild(s);
})();
