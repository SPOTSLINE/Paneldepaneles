/* ═══════════════════════════════════════════════════════════════
   MEJORAS — bandeja única de pedidos de mejora (SPL / Spotsline)

   · En cada panel: botón "💡 Mejoras" abajo a la derecha, igual en todos.
     Lo carga volver.js (que a su vez carga candado.js), así que no hay que
     tocar los paneles. Reemplaza (oculta) los botones de mejora viejos.
   · En la portada: la bandeja de TODOS los paneles. La portada la abre con
       SPMejoras.abrir({ todos:true })   y lee los avisos con   SPMejoras.resumen()
   · Datos: tabla public.mejoras del Supabase del portal (4_mejoras.sql).
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.SPMejoras) return;
  if (window.top !== window) return;

  var SB_URL = 'https://fzylibnqqjznaddgpsjt.supabase.co';
  var SB_KEY = 'sb_publishable_zHONcBODl6nbPiLS3TSrZw_D8MVJqeE';
  var CLAVE_SESION = 'sb-fzylibnqqjznaddgpsjt-auth-token';
  var PORTADA = '/Paneldepaneles/';

  var NOMBRES = {
    ventas: 'Ventas', patrimonial: 'Situación patrimonial', eerr: 'Estado de resultados', proveedores: 'Proveedores',
    cobranzas: 'Cobranzas', cheques: 'Intereses y gastos bancarios', cashflow: 'Cash Flow', produccion: 'Producción', ausentismo: 'Ausentismo',
    planificacion: 'Planificación de Ventas'
  };
  var POR_RUTA = {
    'panel-ventas': 'ventas', 'panel-patrimonial': 'patrimonial', 'panel-estado-resultados': 'eerr',
    'panel-de-proveedores': 'proveedores', 'cobranzas': 'cobranzas', 'panel-de-cheques': 'cheques', 'panel-cash-flow': 'cashflow',
    'panel-produccion': 'produccion', 'panel-de-ausentismo': 'ausentismo',
    'panel-planificacion': 'planificacion'
  };
  /* Botones de mejora que traía cada panel: quedan ocultos para que haya uno solo, igual en todos */
  var VIEJOS = '#btn-pedidos,#ped-fab,#btnPedidos,#fabPedido,#btnMejoras,#bzBtn';

  var TIPOS = ['Mejora', 'Error', 'Idea', 'Consulta'];
  var PRIORIDADES = ['Baja', 'Normal', 'Alta', 'Urgente'];
  var ESTADOS = { 'pendiente': 'Pendiente', 'en curso': 'En curso', 'resuelto': 'Resuelto', 'descartado': 'Descartado' };
  var abierto = function (m) { return m.estado === 'pendiente' || m.estado === 'en curso'; };

  var enPortada = /^\/Paneldepaneles(\/|$)/i.test(location.pathname);
  var seg = (location.pathname.split('/')[1] || '').toLowerCase();
  var PANEL = (window.PORTAL && window.PORTAL.panel) || POR_RUTA[seg] || '';

  /* ---------- sesión y Supabase ---------- */
  function leerSesion() { try { return JSON.parse(localStorage.getItem(CLAVE_SESION) || 'null'); } catch (e) { return null; } }
  var refrescando = null;
  function token() {
    var s = leerSesion();
    if (!s || !s.access_token) return Promise.resolve(null);
    var ahora = Math.floor(Date.now() / 1000);
    if (!s.expires_at || s.expires_at - ahora > 60) return Promise.resolve(s.access_token);
    if (!s.refresh_token) return Promise.resolve(null);
    if (!refrescando) {
      refrescando = fetch(SB_URL + '/auth/v1/token?grant_type=refresh_token', {
        method: 'POST', headers: { apikey: SB_KEY, 'Content-Type': 'application/json' },
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
  function api(ruta, opciones) {
    return token().then(function (t) {
      if (!t) throw new Error('Sin sesión. Volvé a ingresar desde el Panel de Paneles.');
      var o = opciones || {};
      var h = { apikey: SB_KEY, Authorization: 'Bearer ' + t };
      if (o.body) h['Content-Type'] = 'application/json';
      return fetch(SB_URL + '/rest/v1/' + ruta, { method: o.method || 'GET', headers: h, body: o.body ? JSON.stringify(o.body) : undefined });
    }).then(function (r) {
      return r.text().then(function (txt) {
        var j = null; try { j = txt ? JSON.parse(txt) : null; } catch (e) {}
        if (!r.ok) {
          var msg = (j && (j.message || j.hint)) || txt || ('Error ' + r.status);
          if (r.status === 404 || /mejoras|mej_/.test(msg) && /exist|find/i.test(msg)) msg = 'Falta correr 4_mejoras.sql en Supabase.';
          throw new Error(msg);
        }
        return j;
      });
    });
  }
  var rpc = function (nombre, datos) { return api('rpc/' + nombre, { method: 'POST', body: datos || {} }); };

  var YO = null;
  function yo() {
    if (YO) return Promise.resolve(YO);
    return rpc('mej_yo').then(function (r) { YO = r || {}; return YO; });
  }
  function listar(panel) {
    return api('mejoras?select=*&order=id.desc' + (panel ? '&panel=eq.' + encodeURIComponent(panel) : ''));
  }
  var esNuevo = function (m) { return !!YO && (m.vistos || []).indexOf(YO.user_id) < 0; };
  /* Aviso: para un admin, todo lo que no vio; para el resto, novedades de sus propios pedidos */
  var avisa = function (m) { return esNuevo(m) && (YO.es_admin || m.creado_por === YO.user_id); };

  /** Resumen para la portada: { total:{nuevos, abiertos}, por_panel:{ id:{nuevos, abiertos} }, es_admin } */
  function resumen() {
    return yo().then(function () { return listar(''); }).then(function (lista) {
      var r = { total: { nuevos: 0, abiertos: 0 }, por_panel: {}, es_admin: !!YO.es_admin };
      (lista || []).forEach(function (m) {
        var p = r.por_panel[m.panel] || (r.por_panel[m.panel] = { nuevos: 0, abiertos: 0 });
        if (avisa(m)) { p.nuevos++; r.total.nuevos++; }
        if (abierto(m)) { p.abiertos++; r.total.abiertos++; }
      });
      return r;
    });
  }

  /* ---------- utilidades ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fecha(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  }
  function opciones(lista, actual, etiquetas) {
    return lista.map(function (v) { return '<option value="' + esc(v) + '"' + (v === actual ? ' selected' : '') + '>' + esc(etiquetas ? etiquetas[v] : v) + '</option>'; }).join('');
  }
  function pantallaActual() {
    var sel = ['[aria-current="page"]', '[role="tab"][aria-selected="true"]', '.tab.active', '.tabs .active', '.tab.on', '.nav .active',
      'nav .active', 'nav .on', '.active[data-view]', '.on[data-view]', '.sidebar .active', '.menu .active', '.menu .on', '.side a.on'];
    for (var i = 0; i < sel.length; i++) {
      var el = document.querySelector(sel[i]);
      if (el && el.offsetParent !== null) {
        var t = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (t && t.length <= 50) return t;
      }
    }
    var h = (location.hash || '').replace(/^#\/?/, '').split('/')[0];
    if (h) return h;
    var h1 = document.querySelector('h1');
    var t1 = h1 && (h1.textContent || '').replace(/\s+/g, ' ').trim();
    return (t1 && t1.length <= 50) ? t1 : 'General';
  }
  function vistaPlanta() {
    var h = (location.hash || '').replace(/^#/, '').split('/')[0];
    return /panel-produccion/i.test(location.pathname) && ['ot', 'pantalla', 'ingreso', 'pintura', 'armado'].indexOf(h) >= 0;
  }

  /* ---------- estilos (todo dentro de un Shadow DOM: no choca con el panel) ---------- */
  var CSS = '' +
    ':host{all:initial}' +
    '*{box-sizing:border-box;margin:0;padding:0;font-family:-apple-system,"Segoe UI",Roboto,Arial,sans-serif}' +
    '[hidden]{display:none!important}' +
    '.fab{position:fixed;z-index:2147483000;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));display:inline-flex;align-items:center;gap:7px;' +
      'background:#141414;color:#F5C400;border:1px solid #F5C400;border-radius:999px;padding:8px 14px 8px 12px;font:600 13px/1 -apple-system,"Segoe UI",Roboto,Arial,sans-serif;' +
      'box-shadow:0 2px 10px rgba(0,0,0,.35);opacity:.92;cursor:pointer;-webkit-tap-highlight-color:transparent}' +
    '.fab:hover{opacity:1;background:#F5C400;color:#141414}' +
    '.fab:focus-visible,button:focus-visible,select:focus-visible,textarea:focus-visible,input:focus-visible{outline:2px solid #F5C400;outline-offset:2px}' +
    '.bad{min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#E3533B;color:#fff;font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center}' +
    '.fondo{position:fixed;inset:0;z-index:2147483001;background:rgba(0,0,0,.45);display:flex;justify-content:flex-end}' +
    '.caja{width:100%;max-width:470px;height:100%;background:#151515;color:#EDEDE8;border-left:3px solid #F5C400;display:flex;flex-direction:column;box-shadow:-8px 0 30px rgba(0,0,0,.4)}' +
    '.caja.ancha{max-width:820px}' +
    '.cab{padding:16px 18px 12px;border-bottom:1px solid #2C2C29;display:flex;gap:10px;align-items:flex-start}' +
    '.cab .t{flex:1}.cab small{display:block;font:11px ui-monospace,Consolas,monospace;letter-spacing:.1em;color:#8A8A84;text-transform:uppercase}' +
    '.cab h2{font-size:19px;font-weight:700;margin-top:2px;color:#fff}' +
    '.x{background:none;border:1px solid #3A3A36;color:#EDEDE8;border-radius:8px;padding:6px 10px;cursor:pointer;font-size:13px}.x:hover{border-color:#EDEDE8}' +
    '.cuerpo{flex:1;overflow:auto;padding:14px 18px 24px}' +
    '.nuevo{background:#1E1E1C;border:1px solid #2C2C29;border-radius:10px;padding:12px;margin-bottom:14px}' +
    '.nuevo h3{font-size:13px;font-weight:700;color:#F5C400;margin-bottom:8px;text-transform:uppercase;letter-spacing:.05em}' +
    '.fila{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px}.fila label{flex:1;min-width:110px;font-size:11px;color:#A3A39B;display:flex;flex-direction:column;gap:3px}' +
    'select,input,textarea{background:#101010;color:#EDEDE8;border:1px solid #3A3A36;border-radius:7px;padding:7px 8px;font-size:13px;width:100%}' +
    'textarea{resize:vertical;min-height:70px;line-height:1.4}' +
    '.btn{background:#F5C400;color:#141414;border:0;border-radius:8px;padding:8px 14px;font-weight:700;font-size:13px;cursor:pointer}.btn:hover{filter:brightness(1.07)}.btn:disabled{opacity:.5;cursor:default}' +
    '.btn2{background:none;color:#EDEDE8;border:1px solid #3A3A36;border-radius:8px;padding:7px 12px;font-weight:600;font-size:12px;cursor:pointer}.btn2:hover{border-color:#EDEDE8}' +
    '.btn2.on{background:#F5C400;border-color:#F5C400;color:#141414}' +
    '.msg{font-size:12px;margin-top:6px;min-height:15px}.msg.ok{color:#5DBB8E}.msg.err{color:#E3775F}' +
    '.barra{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:10px}' +
    '.barra .sp{flex:1}.barra select,.barra input{width:auto;padding:6px 8px;font-size:12px}.barra input{min-width:150px;flex:1}' +
    '.item{border:1px solid #2C2C29;border-radius:10px;padding:10px 12px;margin-bottom:8px;background:#1A1A18}' +
    '.item.nv{border-color:#F5C400;box-shadow:inset 3px 0 0 #F5C400}' +
    '.item .top{display:flex;gap:6px;flex-wrap:wrap;align-items:center;font-size:11px}' +
    '.chip{padding:2px 7px;border-radius:99px;background:#2A2A27;color:#D9D9D3;font-weight:600;font-size:11px}' +
    '.chip.panel{background:#3A3000;color:#FFE27A}.chip.Error{background:#3C211B;color:#F0A08C}.chip.Urgente,.chip.Alta{background:#3C211B;color:#F0A08C}' +
    '.chip.resuelto{background:#17332A;color:#7FD3AA}.chip.descartado{background:#2A2A27;color:#8A8A84}.chip.encurso{background:#1C2A3D;color:#9CC3F0}' +
    '.chip.nuevo{background:#E3533B;color:#fff}' +
    '.num{font:700 12px ui-monospace,Consolas,monospace;color:#8A8A84}' +
    '.txt{font-size:14px;line-height:1.45;margin:6px 0 4px;white-space:pre-wrap;word-break:break-word;color:#fff}' +
    '.meta{font-size:11px;color:#8A8A84}' +
    '.resp{margin-top:8px;border-left:2px solid #3A3A36;padding-left:9px;display:flex;flex-direction:column;gap:5px}' +
    '.resp div{font-size:12px;color:#D9D9D3;white-space:pre-wrap;word-break:break-word}.resp b{color:#fff}.resp i{color:#8A8A84;font-style:normal}' +
    '.acc{margin-top:8px;display:flex;flex-direction:column;gap:6px}.acc .fila{margin:0}.acc textarea{min-height:44px}' +
    '.lnk{background:none;border:0;color:#F5C400;font-size:12px;font-weight:600;cursor:pointer;padding:0;text-decoration:underline}' +
    '.vacio{color:#8A8A84;font-size:13px;padding:20px 0;text-align:center}' +
    '.pie{padding:10px 18px;border-top:1px solid #2C2C29;font-size:12px;color:#8A8A84;display:flex;gap:10px;flex-wrap:wrap;align-items:center}' +
    '.pie a{color:#F5C400}' +
    '.claude{background:#1E1E1C;border:1px solid #2C2C29;border-radius:10px;padding:12px;margin-bottom:12px}' +
    '.claude p{font-size:12px;color:#A3A39B;margin-bottom:8px;line-height:1.45}' +
    '.prev{font-size:12px;margin-top:8px;color:#D9D9D3}.prev li{margin-left:16px;margin-bottom:3px}' +
    '@media (max-width:600px){.caja,.caja.ancha{max-width:none;border-left:0;border-top:3px solid #F5C400}.fab .lbl{display:none}.fab{padding:9px 11px}}' +
    '@media print{.fab,.fondo{display:none!important}}';

  /* ---------- componente ---------- */
  var host = null, raiz = null, fab = null;
  var EST = { todos: false, filtro: 'abiertos', panel: '', texto: '', lista: [], abierta: false, verClaude: false };

  function montar() {
    if (host) return;
    host = document.createElement('sp-mejoras');
    host.style.cssText = 'all:initial';
    raiz = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    raiz.innerHTML = '<style>' + CSS + '</style><div id="zona"></div>';
    document.body.appendChild(host);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && EST.abierta) cerrar(); });
  }
  var $ = function (s) { return raiz.querySelector(s); };

  function ponerFab() {
    montar();
    if (fab) return;
    fab = document.createElement('button');
    fab.type = 'button'; fab.className = 'fab'; fab.title = 'Pedidos de mejora: errores, ideas o cambios para este panel';
    fab.innerHTML = '<span aria-hidden="true">💡</span><span class="lbl">Mejoras</span><span class="bad" hidden></span>';
    fab.addEventListener('click', function () { abrir({}); });
    raiz.appendChild(fab);
    var act = function () { fab.style.display = vistaPlanta() ? 'none' : ''; };
    window.addEventListener('hashchange', act); act();
    contar();
    setInterval(function () { if (document.visibilityState === 'visible' && !EST.abierta) contar(); }, 180000);
  }
  function contar() {
    if (!fab) return;
    yo().then(function () { return listar(PANEL); }).then(function (l) {
      var n = (l || []).filter(avisa).length;
      var b = fab.querySelector('.bad'); b.textContent = n; b.hidden = !n;
      fab.title = n ? (n === 1 ? 'Hay 1 novedad en los pedidos de mejora' : 'Hay ' + n + ' novedades en los pedidos de mejora') : 'Pedidos de mejora: errores, ideas o cambios para este panel';
    }).catch(function () {});
  }

  function abrir(op) {
    montar();
    op = op || {};
    EST.todos = !!op.todos || enPortada;
    EST.panel = op.panel || '';
    EST.filtro = op.filtro || 'abiertos';
    EST.abierta = true; EST.verClaude = false;
    var zona = $('#zona');
    var nombre = EST.todos ? 'Todos los paneles' : (NOMBRES[PANEL] || document.title);
    zona.innerHTML =
      '<div class="fondo" id="fondo"><div class="caja' + (EST.todos ? ' ancha' : '') + '" role="dialog" aria-modal="true" aria-labelledby="mj-tit">' +
        '<div class="cab"><div class="t"><small>SPL / Spotsline · ' + esc(nombre) + '</small><h2 id="mj-tit">Pedidos de mejora</h2></div>' +
        '<button class="x" id="cerrar" type="button">Cerrar ✕</button></div>' +
        '<div class="cuerpo" id="cuerpo">' +
          (EST.todos ? '' :
          '<div class="nuevo"><h3>Nuevo pedido</h3>' +
            '<div class="fila"><label>Tipo<select id="n-tipo">' + opciones(TIPOS, 'Mejora') + '</select></label>' +
            '<label>Prioridad<select id="n-prio">' + opciones(PRIORIDADES, 'Normal') + '</select></label></div>' +
            '<div class="fila"><label style="flex:1 1 100%">Pantalla<input id="n-pant" maxlength="80"></label></div>' +
            '<textarea id="n-txt" placeholder="Contá qué pasa o qué necesitás. Si es un error: qué hiciste y qué esperabas que pase."></textarea>' +
            '<div style="display:flex;justify-content:flex-end;margin-top:8px"><button class="btn" id="n-ok" type="button">Guardar pedido</button></div>' +
            '<div class="msg" id="n-msg"></div></div>') +
          '<div id="claude" hidden></div>' +
          '<div class="barra" id="barra"></div>' +
          '<div id="lista"><div class="vacio">Cargando…</div></div>' +
        '</div>' +
        '<div class="pie" id="pie"></div>' +
      '</div></div>';
    $('#fondo').addEventListener('click', function (e) { if (e.target.id === 'fondo') cerrar(); });
    $('#cerrar').addEventListener('click', cerrar);
    if (!EST.todos) {
      $('#n-pant').value = pantallaActual();
      $('#n-ok').addEventListener('click', crear);
      setTimeout(function () { var t = $('#n-txt'); if (t) t.focus(); }, 50);
    }
    cargar(true);
  }
  function cerrar() {
    EST.abierta = false;
    if ($('#zona')) $('#zona').innerHTML = '';
    contar();
    try { window.dispatchEvent(new CustomEvent('sp-mejoras-cerrada')); } catch (e) {}
  }

  function cargar(marcar) {
    return yo().then(function () { return listar(EST.todos ? '' : PANEL); }).then(function (l) {
      EST.lista = l || [];
      pintar();
      if (marcar) {
        /* Lo que aparece en pantalla queda visto (sigue resaltado hasta cerrar) */
        var ids = EST.lista.filter(esNuevo).map(function (m) { return m.id; });
        if (ids.length) rpc('mej_marcar_vistos', { p_ids: ids }).then(function () {
          EST.lista.forEach(function (m) { if (ids.indexOf(m.id) >= 0) { m._eraNuevo = true; m.vistos = (m.vistos || []).concat([YO.user_id]); } });
          if (fab) { var b = fab.querySelector('.bad'); b.hidden = true; }
        }).catch(function () {});
      }
    }).catch(function (e) {
      $('#lista').innerHTML = '<div class="vacio">' + esc(e.message || e) + '</div>';
    });
  }

  function filtrada() {
    var t = EST.texto.trim().toLowerCase();
    return EST.lista.filter(function (m) {
      if (EST.filtro === 'abiertos' && !abierto(m)) return false;
      if (EST.filtro === 'cerrados' && abierto(m)) return false;
      if (EST.filtro === 'mios' && m.creado_por !== YO.user_id) return false;
      if (EST.panel && m.panel !== EST.panel) return false;
      if (t && (m.texto + ' ' + m.pantalla + ' ' + m.creado_nombre + ' #' + m.id).toLowerCase().indexOf(t) < 0) return false;
      return true;
    }).sort(function (a, b) {
      var na = (esNuevo(a) || a._eraNuevo) ? 1 : 0, nb = (esNuevo(b) || b._eraNuevo) ? 1 : 0;
      if (na !== nb) return nb - na;
      var pa = PRIORIDADES.indexOf(a.prioridad), pb = PRIORIDADES.indexOf(b.prioridad);
      if (abierto(a) && abierto(b) && pa !== pb) return pb - pa;
      return b.id - a.id;
    });
  }

  function pintar() {
    var admin = !!YO.es_admin;
    var ab = EST.lista.filter(abierto).length;
    var paneles = Object.keys(NOMBRES).filter(function (p) { return EST.lista.some(function (m) { return m.panel === p; }); });
    var F = [['abiertos', 'Abiertos (' + ab + ')'], ['cerrados', 'Cerrados (' + (EST.lista.length - ab) + ')'], ['todos', 'Todos'], ['mios', 'Míos']];
    $('#barra').innerHTML = F.map(function (f) { return '<button type="button" class="btn2' + (EST.filtro === f[0] ? ' on' : '') + '" data-f="' + f[0] + '">' + esc(f[1]) + '</button>'; }).join('') +
      (EST.todos ? '<select id="f-panel" aria-label="Panel"><option value="">Todos los paneles</option>' + paneles.map(function (p) { return '<option value="' + p + '"' + (EST.panel === p ? ' selected' : '') + '>' + esc(NOMBRES[p]) + '</option>'; }).join('') + '</select>' : '') +
      '<input id="f-txt" type="search" placeholder="Buscar…" value="' + esc(EST.texto) + '" aria-label="Buscar">';
    raiz.querySelectorAll('[data-f]').forEach(function (b) { b.onclick = function () { EST.filtro = b.dataset.f; pintar(); }; });
    var fp = $('#f-panel'); if (fp) fp.onchange = function () { EST.panel = fp.value; pintar(); };
    var ft = $('#f-txt'); ft.oninput = function () { EST.texto = ft.value; pintarLista(); };

    $('#pie').innerHTML = admin
      ? '<button type="button" class="btn2" id="b-copiar">Copiar pendientes para Claude</button><button type="button" class="btn2" id="b-pegar">Pegar respuesta de Claude</button>' +
        (EST.todos ? '' : '<span style="flex:1"></span><a href="' + PORTADA + '#mejoras">Ver los pedidos de todos los paneles ›</a>')
      : '<span>Tus pedidos los ve el administrador. Cuando te respondan, el botón 💡 te va a avisar.</span>';
    if (admin) { $('#b-copiar').onclick = copiarClaude; $('#b-pegar').onclick = function () { EST.verClaude = !EST.verClaude; pintarClaude(); }; }
    pintarLista();
  }

  function pintarLista() {
    var admin = !!YO.es_admin, l = filtrada();
    if (!l.length) { $('#lista').innerHTML = '<div class="vacio">' + (EST.lista.length ? 'No hay pedidos con este filtro.' : 'Todavía no hay pedidos de mejora.') + '</div>'; return; }
    $('#lista').innerHTML = l.map(function (m) {
      var nuevo = esNuevo(m) || m._eraNuevo, autor = m.creado_por && m.creado_por === YO.user_id;
      var resp = (m.respuestas || []).map(function (r) {
        var cambios = [r.estado ? '→ ' + (ESTADOS[r.estado] || r.estado) : '', r.prioridad ? 'prioridad ' + r.prioridad : ''].filter(Boolean).join(' · ');
        return '<div><b>' + esc(r.por || '') + '</b> <i>' + esc(fecha(r.en)) + (cambios ? ' · ' + esc(cambios) : '') + '</i>' + (r.texto ? '<br>' + esc(r.texto) : '') + '</div>';
      }).join('');
      var acc = '';
      if (admin) {
        acc = '<div class="acc"><div class="fila"><label>Estado<select data-e="' + m.id + '">' + opciones(Object.keys(ESTADOS), m.estado, ESTADOS) + '</select></label>' +
          '<label>Prioridad<select data-p="' + m.id + '">' + opciones(PRIORIDADES, m.prioridad) + '</select></label></div>' +
          '<textarea data-r="' + m.id + '" placeholder="Respuesta o qué se hizo (opcional)"></textarea>' +
          '<div style="display:flex;gap:8px;align-items:center"><button class="btn" type="button" data-g="' + m.id + '">Guardar</button>' +
          '<span class="msg" data-m="' + m.id + '"></span><span style="flex:1"></span><button class="lnk" type="button" data-b="' + m.id + '">Borrar</button></div></div>';
      } else if (autor) {
        acc = '<div class="acc"><textarea data-r="' + m.id + '" placeholder="Agregar un comentario a tu pedido"></textarea>' +
          '<div style="display:flex;gap:8px;align-items:center"><button class="btn2" type="button" data-g="' + m.id + '">Comentar</button><span class="msg" data-m="' + m.id + '"></span></div></div>';
      }
      return '<div class="item' + (nuevo ? ' nv' : '') + '">' +
        '<div class="top"><span class="num">#' + m.id + '</span>' + (nuevo ? '<span class="chip nuevo">Nuevo</span>' : '') +
          (EST.todos ? '<span class="chip panel">' + esc(NOMBRES[m.panel] || m.panel) + '</span>' : '') +
          '<span class="chip ' + esc(m.tipo) + '">' + esc(m.tipo) + '</span><span class="chip ' + esc(m.prioridad) + '">Prioridad ' + esc(m.prioridad).toLowerCase() + '</span>' +
          '<span class="chip ' + esc(m.estado.replace(' ', '')) + '">' + esc(ESTADOS[m.estado] || m.estado) + '</span></div>' +
        '<div class="txt">' + esc(m.texto) + '</div>' +
        '<div class="meta">' + (m.pantalla ? 'Pantalla: ' + esc(m.pantalla) + ' · ' : '') + esc(m.creado_nombre || '—') + ' · ' + esc(fecha(m.creado_en)) + '</div>' +
        (resp ? '<div class="resp">' + resp + '</div>' : '') + acc + '</div>';
    }).join('');
    raiz.querySelectorAll('[data-g]').forEach(function (b) { b.onclick = function () { guardar(+b.dataset.g, b); }; });
    raiz.querySelectorAll('[data-b]').forEach(function (b) {
      b.onclick = function () {
        if (b.dataset.ok !== '1') { b.dataset.ok = '1'; b.textContent = '¿Seguro? Tocá de nuevo para borrar'; setTimeout(function () { b.dataset.ok = ''; b.textContent = 'Borrar'; }, 4000); return; }
        rpc('mej_borrar', { p_id: +b.dataset.b }).then(function () { cargar(false); }).catch(function (e) { avisar(+b.dataset.b, e.message, true); });
      };
    });
  }
  function avisar(id, txt, err) { var el = raiz.querySelector('[data-m="' + id + '"]'); if (el) { el.className = 'msg ' + (err ? 'err' : 'ok'); el.textContent = txt; } }

  function guardar(id, boton) {
    var r = raiz.querySelector('[data-r="' + id + '"]'), e = raiz.querySelector('[data-e="' + id + '"]'), p = raiz.querySelector('[data-p="' + id + '"]');
    var datos = { p_id: id, p_texto: r ? r.value.trim() : '', p_estado: e ? e.value : null, p_prioridad: p ? p.value : null };
    var m = EST.lista.find(function (x) { return x.id === id; });
    if (!datos.p_texto && (!m || ((!e || e.value === m.estado) && (!p || p.value === m.prioridad)))) { avisar(id, 'No hay cambios.', true); return; }
    boton.disabled = true;
    rpc('mej_responder', datos).then(function () { return cargar(false); })
      .catch(function (err) { boton.disabled = false; avisar(id, err.message, true); });
  }

  function crear() {
    var txt = $('#n-txt').value.trim(), msg = $('#n-msg'), b = $('#n-ok');
    if (!txt) { msg.className = 'msg err'; msg.textContent = 'Escribí qué pasa o qué necesitás.'; return; }
    if (!PANEL) { msg.className = 'msg err'; msg.textContent = 'No se reconoce este panel.'; return; }
    b.disabled = true;
    rpc('mej_crear', { p_panel: PANEL, p_pantalla: $('#n-pant').value.trim(), p_tipo: $('#n-tipo').value, p_prioridad: $('#n-prio').value, p_texto: txt })
      .then(function (r) {
        b.disabled = false; $('#n-txt').value = ''; $('#n-tipo').value = 'Mejora'; $('#n-prio').value = 'Normal';
        msg.className = 'msg ok'; msg.textContent = 'Pedido #' + ((r && r.id) || '') + ' guardado. Ya le llega al administrador.';
        EST.filtro = 'abiertos'; return cargar(false);
      }).catch(function (e) { b.disabled = false; msg.className = 'msg err'; msg.textContent = e.message; });
  }

  /* ---------- Claude: copiar pendientes / pegar respuesta ---------- */
  function copiarClaude() {
    var l = EST.lista.filter(abierto).filter(function (m) { return !EST.panel || m.panel === EST.panel; })
      .sort(function (a, b) { return (a.panel > b.panel ? 1 : a.panel < b.panel ? -1 : 0) || a.id - b.id; });
    var b = $('#b-copiar');
    if (!l.length) { b.textContent = 'No hay pendientes'; setTimeout(function () { b.textContent = 'Copiar pendientes para Claude'; }, 2500); return; }
    var alcance = EST.todos ? (EST.panel ? NOMBRES[EST.panel] : 'todos los paneles') : NOMBRES[PANEL];
    var txt = 'PEDIDOS DE MEJORA PENDIENTES — ' + alcance + ' (' + l.length + ')\n' +
      'Cuando termines, respondé una línea por pedido con el formato:  #número | Estado | qué se hizo\n' +
      '(Estado: Resuelto, En curso, Descartado o Pendiente)\n\n' +
      l.map(function (m) {
        return '#' + m.id + ' · ' + (NOMBRES[m.panel] || m.panel) + ' · ' + m.tipo + ' · prioridad ' + m.prioridad + ' · ' + ESTADOS[m.estado] + '\n   ' +
          m.texto.replace(/\n/g, '\n   ') + '\n   Pantalla: ' + (m.pantalla || '-') + ' · ' + (m.creado_nombre || '') + ', ' + fecha(m.creado_en) +
          (m.respuestas || []).map(function (r) { return '\n   ↳ ' + (r.por || '') + (r.estado ? ' (' + ESTADOS[r.estado] + ')' : '') + ': ' + (r.texto || ''); }).join('');
      }).join('\n\n');
    var ok = function () { b.textContent = '✓ Copiados ' + l.length; setTimeout(function () { b.textContent = 'Copiar pendientes para Claude'; }, 2500); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok, function () { copiaManual(txt); ok(); });
    else { copiaManual(txt); ok(); }
  }
  function copiaManual(txt) {
    var t = document.createElement('textarea'); t.value = txt; t.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(t); t.select();
    try { document.execCommand('copy'); } catch (e) {} t.remove();
  }
  function normEstado(s) {
    s = (s || '').toLowerCase().trim();
    if (/^resuel|^hech|^list|^ok/.test(s)) return 'resuelto';
    if (/curso|parcial|avanc/.test(s)) return 'en curso';
    if (/descart|no se hace|rechaz/.test(s)) return 'descartado';
    if (/pendien/.test(s)) return 'pendiente';
    return null;
  }
  function parsear(txt) {
    var out = [];
    (txt || '').split(/\r?\n/).forEach(function (linea) {
      var m = linea.match(/^\s*[-*•]?\s*#?(\d+)\s*\|\s*([^|]+?)\s*\|\s*(.*)$/);
      if (!m) return;
      var id = +m[1], est = normEstado(m[2]);
      if (EST.lista.some(function (x) { return x.id === id; })) out.push({ id: id, estado: est, texto: m[3].trim() });
    });
    return out;
  }
  function pintarClaude() {
    var c = $('#claude');
    c.hidden = !EST.verClaude;
    if (!EST.verClaude) return;
    c.className = 'claude';
    c.innerHTML = '<p>Pegá la respuesta de Claude. Se toman las líneas con el formato <b>#número | Estado | qué se hizo</b> y cada una queda como respuesta en su pedido.</p>' +
      '<textarea id="c-txt" style="min-height:110px" placeholder="#12 | Resuelto | Se agregó el filtro por sector"></textarea>' +
      '<div class="prev" id="c-prev"></div>' +
      '<div style="display:flex;gap:8px;margin-top:8px"><button class="btn" id="c-ok" type="button" disabled>Aplicar</button><button class="btn2" id="c-no" type="button">Cancelar</button><span class="msg" id="c-msg"></span></div>';
    var t = $('#c-txt'), prev = $('#c-prev'), ok = $('#c-ok');
    t.oninput = function () {
      var r = parsear(t.value);
      ok.disabled = !r.length;
      prev.innerHTML = r.length ? '<ul>' + r.map(function (x) { return '<li>#' + x.id + ' → ' + esc(x.estado ? ESTADOS[x.estado] : 'sin cambio de estado') + (x.texto ? ': ' + esc(x.texto) : '') + '</li>'; }).join('') + '</ul>'
        : (t.value.trim() ? 'No encontré líneas con el formato #número | Estado | texto que coincidan con pedidos de esta lista.' : '');
    };
    $('#c-no').onclick = function () { EST.verClaude = false; pintarClaude(); };
    ok.onclick = function () {
      var r = parsear(t.value); ok.disabled = true;
      var hechos = 0, fallas = [];
      r.reduce(function (p, x) {
        return p.then(function () {
          return rpc('mej_responder', { p_id: x.id, p_texto: x.texto ? 'Claude: ' + x.texto : '', p_estado: x.estado, p_prioridad: null })
            .then(function () { hechos++; }, function (e) { fallas.push('#' + x.id + ' (' + e.message + ')'); });
        });
      }, Promise.resolve()).then(function () {
        var msg = $('#c-msg'); msg.className = 'msg ' + (fallas.length ? 'err' : 'ok');
        msg.textContent = 'Aplicados ' + hechos + (fallas.length ? '. Fallaron: ' + fallas.join(', ') : '.');
        t.value = ''; prev.innerHTML = '';
        cargar(false).then(function () { pintarClaude(); var m2 = $('#c-msg'); if (m2) { m2.className = msg.className; m2.textContent = msg.textContent; } });
      });
    };
  }

  /* ---------- arranque ---------- */
  window.SPMejoras = { abrir: abrir, cerrar: cerrar, resumen: resumen, panel: PANEL, nombres: NOMBRES };

  function arrancar() {
    if (enPortada) { montar(); return; }       // en la portada no va el botón flotante: la portada pone "Mejoras" en su menú
    if (!PANEL) return;
    var st = document.createElement('style');
    st.textContent = VIEJOS + '{display:none!important}';
    (document.head || document.documentElement).appendChild(st);
    var listo = function (a) { if (a && !a.planta) ponerFab(); };
    if (window.PORTAL_ACCESO && typeof window.PORTAL_ACCESO.then === 'function') window.PORTAL_ACCESO.then(listo, function () {});
    else if (leerSesion()) ponerFab();       // Panel de Ventas: tiene su propio login, con la misma sesión
  }
  if (document.body) arrancar(); else document.addEventListener('DOMContentLoaded', arrancar);
})();
