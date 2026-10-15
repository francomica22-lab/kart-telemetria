/* Cuenta y suscripcion (window.KTA).
   Supabase Auth por REST (sin librerias, funciona igual en el programa y en la web).
   El plan se consulta con la RPC mi_plan(); si no hay internet vale el ultimo plan conocido hasta 7 dias. */
(function () {
  const URL = "https://zbesblxiezcfurswanev.supabase.co";
  const KEY = "sb_publishable_HRIpZ4BfWemVZ8TNA37-EQ_tKN1joRG";
  const CUENTA_PAGE = "https://francomica22-lab.github.io/kart-telemetria/cuenta.html";
  const GRACIA_DIAS = 7;
  // que habilita cada plan (se puede cambiar aca sin tocar el resto)
  const PLANES = {
    simple: { nombre: "Simple", lema: "Te habla fácil", funciones: ["analizar", "simple", "pdf"] },
    pro: { nombre: "Pro", lema: "Te habla como un ingeniero", funciones: ["analizar", "simple", "pdf", "detallado", "link", "setup", "video"] },
  };
  // precios mostrados (el servidor tiene los suyos y es el que cobra; mantener iguales)
  const PRECIOS = {
    ARS: { simple: { mensual: 9900, anual: 99000 }, pro: { mensual: 19900, anual: 199000 } },
    USD: { simple: { mensual: 9, anual: 90 }, pro: { mensual: 19, anual: 190 } },
  };
  const enArgentina = () => { try { return /Argentina|Buenos_Aires|Cordoba|Mendoza|Salta|Jujuy|Tucuman|Catamarca|La_Rioja|San_Juan|San_Luis|Rio_Gallegos|Ushuaia/.test(Intl.DateTimeFormat().resolvedOptions().timeZone); } catch (e) { return true; } };
  const fmt = (v, m) => m == "ARS" ? "$" + v.toLocaleString("es-AR") : "USD " + v;
  const abrir = url => { if (window.pywebview && window.pywebview.api && window.pywebview.api.open_url) window.pywebview.api.open_url(url); else window.open(url, "_blank", "noopener"); };
  async function fn(nombre, body) {
    const t = await token(); if (!t) throw new Error("Ingresá a tu cuenta.");
    const r = await fetch(`${URL}/functions/v1/${nombre}`, { method: "POST", headers: { apikey: KEY, Authorization: "Bearer " + t, "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok && !j.msg) throw new Error(j.error || "No se pudo completar (" + r.status + ").");
    return j;
  }
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } },
  };
  const listeners = [];
  const emit = () => listeners.forEach(f => { try { f(estado()); } catch (e) { } });

  async function req(path, body, token, method = "POST") {
    const r = await fetch(URL + path, {
      method, headers: Object.assign({ apikey: KEY, "Content-Type": "application/json" }, token ? { Authorization: "Bearer " + token } : {}),
      body: body ? JSON.stringify(body) : undefined,
    });
    let j = null; try { j = await r.json(); } catch (e) { }
    if (!r.ok) { const e = new Error(traducir((j && (j.msg || j.error_description || j.message || j.error)) || "error " + r.status)); e.status = r.status; throw e; }
    return j;
  }
  const traducir = m => {
    const t = String(m);
    if (/invalid login credentials/i.test(t)) return "Mail o contraseña incorrectos.";
    if (/email not confirmed/i.test(t)) return "Todavía no confirmaste el mail: tocá el link que te mandamos.";
    if (/already registered|already exists/i.test(t)) return "Ya hay una cuenta con ese mail. Ingresá o recuperá la contraseña.";
    if (/password should be at least|password.*(weak|contain|characters)|weak.?password/i.test(t)) return "La contraseña es muy débil: usá al menos 8 caracteres, con letras y números.";
    if (/rate limit|too many/i.test(t)) return "Demasiados intentos seguidos. Esperá unos minutos.";
    if (/invalid.*email|unable to validate email/i.test(t)) return "Ese mail no es válido.";
    return t;
  };

  /* ---------- sesion ---------- */
  const guardarSesion = j => { if (j && j.access_token) store.set("kt-auth", { at: j.access_token, rt: j.refresh_token, exp: Date.now() + (j.expires_in || 3600) * 1000, user: { id: j.user.id, email: j.user.email } }); };
  const sesion = () => store.get("kt-auth");
  let renovando = null;
  async function token() {
    const s = sesion(); if (!s) return null;
    if (Date.now() < s.exp - 60000) return s.at;
    if (!renovando) renovando = (async () => {
      try { guardarSesion(await req("/auth/v1/token?grant_type=refresh_token", { refresh_token: s.rt })); return sesion().at; }
      catch (e) {
        // 400/401: la sesion ya no vale (otro equipo, contrasena cambiada). Otro error = sin internet: se sigue con lo guardado
        if (e.status == 400 || e.status == 401) { store.set("kt-auth", null); emit(); }
        return null;
      } finally { setTimeout(() => { renovando = null; }, 0); }
    })();
    return renovando;
  }
  async function crear(email, password) {
    const j = await req(`/auth/v1/signup?redirect_to=${encodeURIComponent(CUENTA_PAGE)}`, { email, password });
    if (j && j.access_token) { guardarSesion(j); await refrescar(); }   // si el proyecto no pide confirmar el mail
    return !!(j && j.access_token);
  }
  async function ingresar(email, password) {
    guardarSesion(await req("/auth/v1/token?grant_type=password", { email, password }));
    await refrescar();
  }
  // Google: en la web se va y vuelve con la sesion en el hash; en el programa de escritorio Google no permite
  // ingresar dentro de la ventana, asi que se abre el navegador y el programa recibe la sesion (PKCE, desktop.py)
  async function google() {
    const api = window.pywebview && window.pywebview.api;
    if (api && api.google_login) {
      const r = await api.google_login(URL, KEY);
      if (!r || r.error || !r.session) throw new Error((r && r.error) || "No se pudo ingresar con Google.");
      guardarSesion(r.session); await refrescar(); return true;
    }
    location.href = `${URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(location.origin + location.pathname)}`;
    return false;
  }
  async function volverDeGoogle() {
    const h = new URLSearchParams(location.hash.slice(1));
    const at = h.get("access_token");
    if (!at || h.get("type") == "recovery" || h.get("type") == "signup") return;
    history.replaceState(null, "", location.pathname + location.search);   // que el token no quede en la barra
    try {
      const u = await req("/auth/v1/user", null, at, "GET");
      guardarSesion({ access_token: at, refresh_token: h.get("refresh_token"), expires_in: +h.get("expires_in") || 3600, user: u });
      await refrescar();
    } catch (e) { /* link vencido: queda sin sesion */ }
  }
  async function recuperar(email) { await req(`/auth/v1/recover?redirect_to=${encodeURIComponent(CUENTA_PAGE)}`, { email }); }
  async function salir() {
    const t = await token().catch(() => null);
    if (t) try { await req("/auth/v1/logout", null, t); } catch (e) { }
    store.set("kt-auth", null); store.set("kt-plan", null); emit();
  }

  /* ---------- plan ---------- */
  async function refrescar() {
    const t = await token();
    if (!t) { emit(); return estado(); }
    try {
      const p = await req("/rest/v1/rpc/mi_plan", {}, t);
      store.set("kt-plan", Object.assign({}, p, { uid: p.uid || sesion().user.id, revisado: Date.now() }));
    } catch (e) { /* sin internet: queda el ultimo plan conocido */ }
    emit(); return estado();
  }
  function estado() {
    const s = sesion(); let p = store.get("kt-plan");
    if (!s) return { logueado: false, vigente: false, plan: null };
    if (p && p.uid && p.uid != s.user.id) p = null;   // plan de otra cuenta en este equipo
    if (!p) return { logueado: true, email: s.user.email, vigente: false, plan: null, sinDatos: true };
    const vence = Date.parse(p.vence), ahora = Date.now();
    const offlineOk = ahora - (p.revisado || 0) < GRACIA_DIAS * 864e5;
    const vigente = !!p.plan && !!PLANES[p.plan] && vence > ahora && offlineOk;
    const inicio = p.inicio_pago ? Date.parse(p.inicio_pago) : null;
    return { logueado: true, email: s.user.email, plan: vigente ? p.plan : null, planNombre: vigente ? PLANES[p.plan].nombre : null, estado: p.estado,
      prueba: p.estado == "prueba", vence, dias: Math.max(0, Math.ceil((vence - ahora) / 864e5)), vigente, revisarOnline: !offlineOk,
      pago: ["mercadopago", "lemonsqueezy"].includes(p.proveedor), arrepentible: !!inicio && ahora - inicio <= 10 * 864e5 && ["activa", "cancelada"].includes(p.estado) };
  }
  const puede = f => { const e = estado(); return e.vigente && PLANES[e.plan] && PLANES[e.plan].funciones.includes(f); };

  /* ---------- interfaz ---------- */
  function boton() {
    const e = estado();
    if (!e.logueado) return `<button class="acct" id="acct">Ingresar · probá 7 días gratis</button>`;
    const tag = !e.vigente ? `<span class="pl off">sin plan</span>` : e.prueba ? `<span class="pl">prueba · ${e.dias} d</span>` : `<span class="pl">${esc(e.planNombre)}</span>`;
    return `<button class="acct" id="acct" title="${esc(e.email)}"><span class="em">${esc(e.email)}</span>${tag}</button>`;
  }
  function modal(html) {
    const d = document.createElement("div"); d.className = "modal";
    d.innerHTML = `<div class="mbox acctbox" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(d);
    d.addEventListener("click", ev => { if (ev.target == d) d.remove(); });
    return d;
  }
  function login(motivo) {
    const d = modal(`<h2>${motivo ? esc(motivo) : "Tu cuenta"}</h2>
      <p class="ink2 small">Con una cuenta tenés <b>7 días de todo gratis</b>, sin tarjeta. Después elegís cómo querés que te hable tu ingeniero: <b>Simple</b> (fácil) o <b>Pro</b> (profesional).</p>
      <button type="button" class="btn gbtn" id="a-g"><svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>Continuar con Google</button>
      <div class="or"><span>o con tu mail</span></div>
      <div class="seg acct-tabs" role="tablist"><button type="button" data-t="in" class="on">Ingresar</button><button type="button" data-t="up">Crear cuenta</button></div>
      <form class="acct-f"><label><span>Mail</span><input type="email" id="a-em" autocomplete="email" required></label>
        <label><span>Contraseña</span><input type="password" id="a-pw" autocomplete="current-password" minlength="8" required></label>
        <p class="small muted" id="a-pwh" hidden>Al menos 8 caracteres, con letras y números.</p>
        <p class="small" id="a-msg" role="status"></p>
        <div class="mact"><button type="button" class="link" id="a-rec">Olvidé mi contraseña</button><button type="button" class="btn" id="a-x">Cerrar</button><button class="btn primary" id="a-go">Ingresar</button></div></form>`);
    let modo = "in";
    const msg = (t, err) => { const m = d.querySelector("#a-msg"); m.textContent = t; m.className = "small " + (err ? "b" : "ink2"); };
    d.querySelectorAll(".acct-tabs button").forEach(b => b.addEventListener("click", () => {
      modo = b.dataset.t; d.querySelectorAll(".acct-tabs button").forEach(x => x.classList.toggle("on", x == b));
      d.querySelector("#a-go").textContent = modo == "in" ? "Ingresar" : "Crear cuenta y empezar la prueba";
      d.querySelector("#a-pw").autocomplete = modo == "in" ? "current-password" : "new-password"; msg("");
      d.querySelector("#a-pwh").hidden = modo == "in";
    }));
    d.querySelector("#a-x").addEventListener("click", () => d.remove());
    d.querySelector("#a-g").addEventListener("click", async () => {
      const g = d.querySelector("#a-g"); g.disabled = true;
      msg(window.pywebview ? "Se abrió el navegador: ingresá con Google y volvé acá." : "Yendo a Google…");
      try { if (await google()) d.remove(); } catch (e) { msg(e.message, true); } finally { g.disabled = false; }
    });
    d.querySelector("#a-rec").addEventListener("click", async () => {
      const em = d.querySelector("#a-em").value.trim(); if (!em) { msg("Escribí tu mail y tocá de nuevo.", true); return; }
      try { await recuperar(em); msg("Te mandamos un mail para elegir una contraseña nueva."); } catch (e) { msg(e.message, true); }
    });
    d.querySelector("form").addEventListener("submit", async ev => {
      ev.preventDefault();
      const em = d.querySelector("#a-em").value.trim(), pw = d.querySelector("#a-pw").value, go = d.querySelector("#a-go");
      go.disabled = true; msg(modo == "in" ? "Ingresando…" : "Creando la cuenta…");
      try {
        if (modo == "in") { await ingresar(em, pw); d.remove(); return; }
        const dentro = await crear(em, pw);
        if (dentro) { d.remove(); return; }
        msg("Listo. Te mandamos un mail: tocá el link para confirmar la cuenta y después ingresá acá con tu mail y contraseña.");
        d.querySelector('.acct-tabs button[data-t="in"]').click();
      } catch (e) { msg(e.message, true); }
      finally { go.disabled = false; }
    });
    setTimeout(() => d.querySelector("#a-em").focus(), 50);
  }
  function panel() {
    const e = estado(), p = store.get("kt-plan");
    const d = modal(`<h2>Tu cuenta</h2><p>${esc(e.email)}</p>
      <div class="tiles">${!e.vigente ? `<div class="tile bad"><div class="eyebrow">Plan</div><div class="tv">Sin plan</div><div class="ts">${e.sinDatos ? "No pudimos consultar tu plan. Revisá la conexión." : "Tu prueba o tu suscripción terminó."}</div></div>`
        : `<div class="tile"><div class="eyebrow">Plan</div><div class="tv">${esc(e.planNombre)}${e.prueba ? " · prueba" : ""}</div><div class="ts">${e.prueba ? `te quedan ${e.dias} día${e.dias == 1 ? "" : "s"}` : `${e.estado == "cancelada" ? "cancelada, vale hasta" : "se renueva el"} ${new Date(e.vence).toLocaleDateString("es-AR")}`}</div></div>`}</div>
      ${e.revisarOnline ? `<p class="small b">Hace más de ${GRACIA_DIAS} días que el programa no se conecta: conectate a internet para seguir usándolo.</p>` : ""}
      ${p && p.portal ? `<p class="small"><a href="${esc(p.portal)}" target="_blank" rel="noopener">Facturas y medio de pago</a></p>` : ""}
      ${e.pago && (e.estado == "activa" || e.arrepentible) ? `<p class="small">${e.estado == "activa" ? `<button class="link" id="p-baja">Dar de baja la suscripción</button>` : ""}${e.estado == "activa" && e.arrepentible ? " · " : ""}${e.arrepentible ? `<button class="link" id="p-arr">Botón de arrepentimiento</button>` : ""}</p>` : ""}
      <div class="mact"><button class="btn" id="p-out">Cerrar sesión</button><button class="btn" id="p-ref">Actualizar</button><button class="btn primary" id="p-planes">${e.vigente && !e.prueba ? "Cambiar de plan" : "Ver planes"}</button></div>`);
    const bb = d.querySelector("#p-baja"); if (bb) bb.addEventListener("click", () => { d.remove(); baja("baja"); });
    const ba = d.querySelector("#p-arr"); if (ba) ba.addEventListener("click", () => { d.remove(); baja("arrepentimiento"); });
    d.querySelector("#p-out").addEventListener("click", async () => { await salir(); d.remove(); });
    d.querySelector("#p-ref").addEventListener("click", async () => { await refrescar(); d.remove(); panel(); });
    d.querySelector("#p-planes").addEventListener("click", () => { d.remove(); planes(); });
  }
  function planes(motivo) {
    const fl = f => ({ analizar: "Analizar y comparar tandas", simple: "Análisis simple: en qué curva perdés y si fuiste vos o fue el kart", pdf: "Exportar a PDF", detallado: "Análisis detallado (curvas, sectores, G)", link: "Compartir por link y QR", setup: "Setup y carburación", video: "Video sincronizado" }[f]);
    const all = PLANES.pro.funciones;
    let periodo = "anual", moneda = enArgentina() ? "ARS" : "USD";
    const d = modal(`<h2>${esc(motivo || "Planes")}</h2>
      <div class="pl-opts"><div class="seg" role="group" aria-label="Período"><button type="button" data-per="mensual">Mensual</button><button type="button" data-per="anual">Anual · 2 meses gratis</button></div>
        <div class="seg" role="group" aria-label="Moneda"><button type="button" data-mon="ARS">Pesos</button><button type="button" data-mon="USD">Dólares</button></div></div>
      <div class="planes">${Object.entries(PLANES).map(([k, p]) => `<div class="plan${k == "pro" ? " rec" : ""}"><h3>${p.nombre}</h3><div class="lema">${esc(p.lema)}</div><div class="pr" data-pr="${k}"></div>
        <ul>${all.map(f => `<li class="${p.funciones.includes(f) ? "" : "no"}">${p.funciones.includes(f) ? "✓" : "–"} ${fl(f)}</li>`).join("")}</ul>
        <button class="btn${k == "pro" ? " primary" : ""}" data-plan="${k}">Suscribirme</button></div>`).join("")}</div>
      <p class="small ink2" id="pl-nota"></p>
      <label class="acct-f pl-mp"><span class="small ink2">Mail de tu cuenta de Mercado Pago (si es distinto al de esta cuenta)</span><input type="email" id="pl-em" placeholder="${esc((estado().email) || "")}" autocomplete="email"></label>
      <p class="small" id="pl-msg" role="status"></p>
      <p class="small ink2">Se renueva sola; la cancelás cuando quieras desde tu cuenta (botón de baja). Tenés 10 días para arrepentirte y te devolvemos todo. <a href="https://francomica22-lab.github.io/kart-telemetria/terminos.html" target="_blank" rel="noopener">Términos</a></p>
      <div class="mact"><button class="btn" id="pl-x">Cerrar</button></div>`);
    const pintar = () => {
      d.querySelectorAll("[data-per]").forEach(b => b.classList.toggle("on", b.dataset.per == periodo));
      d.querySelectorAll("[data-mon]").forEach(b => b.classList.toggle("on", b.dataset.mon == moneda));
      d.querySelectorAll("[data-pr]").forEach(el => { const v = PRECIOS[moneda][el.dataset.pr][periodo]; el.innerHTML = `<b>${fmt(v, moneda)}</b> <span class="muted">/ ${periodo == "anual" ? "año" : "mes"}</span>${periodo == "anual" ? `<div class="small ink2">equivale a ${fmt(Math.round(v / 12), moneda)} por mes</div>` : ""}`; });
      d.querySelector(".pl-mp").hidden = moneda != "ARS";
      d.querySelector("#pl-nota").textContent = moneda == "ARS" ? "Pagás con Mercado Pago (tarjeta de crédito o débito, o dinero en cuenta)." : "Pagás con tarjeta internacional (Lemon Squeezy). Los impuestos de tu país se agregan al pagar.";
    };
    d.querySelectorAll("[data-per]").forEach(b => b.addEventListener("click", () => { periodo = b.dataset.per; pintar(); }));
    d.querySelectorAll("[data-mon]").forEach(b => b.addEventListener("click", () => { moneda = b.dataset.mon; pintar(); }));
    d.querySelectorAll("[data-plan]").forEach(b => b.addEventListener("click", async () => {
      const m = d.querySelector("#pl-msg");
      if (!estado().logueado) { d.remove(); login("Ingresá para suscribirte"); return; }
      b.disabled = true; m.className = "small ink2"; m.textContent = "Abriendo el pago…";
      try {
        const em = d.querySelector("#pl-em").value.trim();
        const r = await fn("suscribir", { plan: b.dataset.plan, periodo, proveedor: moneda == "ARS" ? "mp" : "ls", email_pago: moneda == "ARS" && em ? em : undefined });
        if (!r.url) throw new Error(r.error || "No se pudo abrir el pago.");
        abrir(r.url);
        m.textContent = "Se abrió el pago en el navegador. Cuando termines, volvé acá: el plan se activa solo en un minuto.";
        esperarPago();
      } catch (e) { m.className = "small b"; m.textContent = e.message; }
      finally { b.disabled = false; }
    }));
    d.querySelector("#pl-x").addEventListener("click", () => d.remove());
    pintar();
  }
  // despues de pagar: revisar el plan cada 10 s durante 10 minutos (el aviso del cobro tarda unos segundos)
  let espera = null;
  function esperarPago() {
    clearInterval(espera); let n = 0;
    const huella = () => { const p = store.get("kt-plan") || {}; return JSON.stringify([p.plan, p.estado, p.vence, p.periodo, p.proveedor]); };
    const antes = huella();
    espera = setInterval(async () => {
      n++; await refrescar();
      const e = estado();
      if (huella() != antes && e.vigente && !e.prueba) { clearInterval(espera); document.querySelectorAll(".modal").forEach(m => m.remove()); aviso(`¡Listo! Tu plan ${e.planNombre} está activo.`); }
      if (n > 60) clearInterval(espera);
    }, 10000);
  }
  function aviso(t) { const d = modal(`<h2>${esc(t)}</h2><div class="mact"><button class="btn primary" id="av-ok">Seguir</button></div>`); d.querySelector("#av-ok").addEventListener("click", () => d.remove()); }
  // boton de baja y de arrepentimiento
  function baja(tipo) {
    const e = estado(), arr = tipo == "arrepentimiento";
    const d = modal(`<h2>${arr ? "Botón de arrepentimiento" : "Dar de baja la suscripción"}</h2>
      <p class="ink2">${arr ? "Si pagaste hace 10 días o menos, cancelamos ya y te devolvemos todo lo cobrado." : `Se cancela la renovación. Seguís usando tu plan hasta el ${new Date(e.vence).toLocaleDateString("es-AR")} y no se te cobra más.`}</p>
      <label class="acct-f"><span class="small ink2">¿Por qué? (opcional, nos ayuda a mejorar)</span><textarea id="b-mot" rows="2" maxlength="500"></textarea></label>
      <p class="small" id="b-msg" role="status"></p>
      <div class="mact"><button class="btn" id="b-x">Volver</button><button class="btn primary" id="b-go">${arr ? "Arrepentirme y pedir la devolución" : "Dar de baja"}</button></div>`);
    d.querySelector("#b-x").addEventListener("click", () => d.remove());
    d.querySelector("#b-go").addEventListener("click", async () => {
      const m = d.querySelector("#b-msg"), go = d.querySelector("#b-go"); go.disabled = true; m.className = "small ink2"; m.textContent = "Procesando…";
      try { const r = await fn("cancelar", { tipo, motivo: d.querySelector("#b-mot").value }); m.className = "small"; m.textContent = r.msg || "Listo."; await refrescar(); go.hidden = true; }
      catch (er) { m.className = "small b"; m.textContent = er.message; go.disabled = false; }
    });
  }
  // devuelve true si puede usar la funcion; si no, muestra lo que corresponda
  function requiere(f) {
    const e = estado();
    if (!e.logueado) { login("Ingresá para analizar"); return false; }
    if (puede(f)) return true;
    if (e.vigente) planes(`Esto es del plan Pro`);
    else if (e.revisarOnline) panel();
    else planes(e.sinDatos ? "No pudimos consultar tu plan" : "Elegí un plan para seguir");
    return false;
  }
  function montar(el) {
    if (!el) return;
    const pintar = () => { el.innerHTML = boton(); el.querySelector("#acct").addEventListener("click", () => estado().logueado ? panel() : login()); };
    listeners.push(pintar); pintar();
  }

  volverDeGoogle();
  window.KTA = { crear, ingresar, google, recuperar, salir, refrescar, estado, puede, requiere, login, panel, planes, baja, montar, onChange: f => listeners.push(f), PLANES, PRECIOS, token, fn };
})();
