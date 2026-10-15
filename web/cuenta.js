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
    simple: { nombre: "Simple", funciones: ["analizar", "simple", "pdf"] },
    pro: { nombre: "Pro", funciones: ["analizar", "simple", "pdf", "detallado", "link", "setup", "video"] },
  };
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
    if (!r.ok) throw new Error(traducir((j && (j.msg || j.error_description || j.message || j.error)) || "error " + r.status));
    return j;
  }
  const traducir = m => {
    const t = String(m);
    if (/invalid login credentials/i.test(t)) return "Mail o contraseña incorrectos.";
    if (/email not confirmed/i.test(t)) return "Todavía no confirmaste el mail: tocá el link que te mandamos.";
    if (/already registered|already exists/i.test(t)) return "Ya hay una cuenta con ese mail. Ingresá o recuperá la contraseña.";
    if (/password should be at least/i.test(t)) return "La contraseña tiene que tener al menos 6 caracteres.";
    if (/rate limit|too many/i.test(t)) return "Demasiados intentos seguidos. Esperá unos minutos.";
    if (/invalid.*email|unable to validate email/i.test(t)) return "Ese mail no es válido.";
    return t;
  };

  /* ---------- sesion ---------- */
  const guardarSesion = j => { if (j && j.access_token) store.set("kt-auth", { at: j.access_token, rt: j.refresh_token, exp: Date.now() + (j.expires_in || 3600) * 1000, user: { id: j.user.id, email: j.user.email } }); };
  const sesion = () => store.get("kt-auth");
  async function token() {
    const s = sesion(); if (!s) return null;
    if (Date.now() < s.exp - 60000) return s.at;
    try { guardarSesion(await req("/auth/v1/token?grant_type=refresh_token", { refresh_token: s.rt })); return sesion().at; }
    catch (e) { if (navigator.onLine) { store.set("kt-auth", null); emit(); } return null; }
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
      store.set("kt-plan", Object.assign({}, p, { revisado: Date.now() }));
    } catch (e) { /* sin internet: queda el ultimo plan conocido */ }
    emit(); return estado();
  }
  function estado() {
    const s = sesion(), p = store.get("kt-plan");
    if (!s) return { logueado: false, vigente: false, plan: null };
    if (!p) return { logueado: true, email: s.user.email, vigente: false, plan: null, sinDatos: true };
    const vence = Date.parse(p.vence), ahora = Date.now();
    const offlineOk = ahora - (p.revisado || 0) < GRACIA_DIAS * 864e5;
    const vigente = !!p.plan && vence > ahora && offlineOk;
    return { logueado: true, email: s.user.email, plan: vigente ? p.plan : null, planNombre: vigente ? PLANES[p.plan].nombre : null, estado: p.estado,
      prueba: p.estado == "prueba", vence, dias: Math.max(0, Math.ceil((vence - ahora) / 864e5)), vigente, revisarOnline: !offlineOk };
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
      <p class="ink2 small">Con una cuenta tenés <b>7 días de todo gratis</b>. Después elegís el plan Simple o Pro.</p>
      <div class="seg acct-tabs" role="tablist"><button type="button" data-t="in" class="on">Ingresar</button><button type="button" data-t="up">Crear cuenta</button></div>
      <form class="acct-f"><label><span>Mail</span><input type="email" id="a-em" autocomplete="email" required></label>
        <label><span>Contraseña</span><input type="password" id="a-pw" autocomplete="current-password" minlength="6" required></label>
        <p class="small" id="a-msg" role="status"></p>
        <div class="mact"><button type="button" class="link" id="a-rec">Olvidé mi contraseña</button><button type="button" class="btn" id="a-x">Cerrar</button><button class="btn primary" id="a-go">Ingresar</button></div></form>`);
    let modo = "in";
    const msg = (t, err) => { const m = d.querySelector("#a-msg"); m.textContent = t; m.className = "small " + (err ? "b" : "ink2"); };
    d.querySelectorAll(".acct-tabs button").forEach(b => b.addEventListener("click", () => {
      modo = b.dataset.t; d.querySelectorAll(".acct-tabs button").forEach(x => x.classList.toggle("on", x == b));
      d.querySelector("#a-go").textContent = modo == "in" ? "Ingresar" : "Crear cuenta y empezar la prueba";
      d.querySelector("#a-pw").autocomplete = modo == "in" ? "current-password" : "new-password"; msg("");
    }));
    d.querySelector("#a-x").addEventListener("click", () => d.remove());
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
    const e = estado();
    const d = modal(`<h2>Tu cuenta</h2><p>${esc(e.email)}</p>
      <div class="tiles">${!e.vigente ? `<div class="tile bad"><div class="eyebrow">Plan</div><div class="tv">Sin plan</div><div class="ts">${e.sinDatos ? "No pudimos consultar tu plan. Revisá la conexión." : "Tu prueba o tu suscripción terminó."}</div></div>`
        : `<div class="tile"><div class="eyebrow">Plan</div><div class="tv">${esc(e.planNombre)}${e.prueba ? " · prueba" : ""}</div><div class="ts">${e.prueba ? `te quedan ${e.dias} día${e.dias == 1 ? "" : "s"}` : `${e.estado == "cancelada" ? "cancelada, vale hasta" : "se renueva el"} ${new Date(e.vence).toLocaleDateString("es-AR")}`}</div></div>`}</div>
      ${e.revisarOnline ? `<p class="small b">Hace más de ${GRACIA_DIAS} días que el programa no se conecta: conectate a internet para seguir usándolo.</p>` : ""}
      <div class="mact"><button class="btn" id="p-out">Cerrar sesión</button><button class="btn" id="p-ref">Actualizar</button><button class="btn primary" id="p-planes">Ver planes</button></div>`);
    d.querySelector("#p-out").addEventListener("click", async () => { await salir(); d.remove(); });
    d.querySelector("#p-ref").addEventListener("click", async () => { await refrescar(); d.remove(); panel(); });
    d.querySelector("#p-planes").addEventListener("click", () => { d.remove(); planes(); });
  }
  // por ahora sin cobro: la parte de pago (Mercado Pago / exterior) se conecta aca
  function planes(motivo) {
    const fl = f => ({ analizar: "Analizar y comparar tandas", simple: "Análisis simple", pdf: "Exportar a PDF", detallado: "Análisis detallado (curvas, sectores, G)", link: "Compartir por link y QR", setup: "Setup y carburación", video: "Video sincronizado" }[f]);
    const all = PLANES.pro.funciones;
    const d = modal(`<h2>${esc(motivo || "Planes")}</h2>
      <div class="planes">${Object.entries(PLANES).map(([k, p]) => `<div class="plan${k == "pro" ? " rec" : ""}"><h3>${p.nombre}</h3>
        <ul>${all.map(f => `<li class="${p.funciones.includes(f) ? "" : "no"}">${p.funciones.includes(f) ? "✓" : "–"} ${fl(f)}</li>`).join("")}</ul>
        <button class="btn${k == "pro" ? " primary" : ""}" data-plan="${k}" disabled>Suscribirme (pronto)</button></div>`).join("")}</div>
      <p class="small ink2">Mensual o anual con descuento. El pago se habilita en la próxima versión.</p>
      <div class="mact"><button class="btn" id="pl-x">Cerrar</button></div>`);
    d.querySelector("#pl-x").addEventListener("click", () => d.remove());
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

  window.KTA = { crear, ingresar, recuperar, salir, refrescar, estado, puede, requiere, login, panel, planes, montar, onChange: f => listeners.push(f), PLANES, token };
})();
