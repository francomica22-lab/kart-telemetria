/* Datos anonimos compartidos (activado por defecto; se desactiva en Ajustes).
   Se envia un resumen por tanda: circuito, kart, setup, clima, mejor tiempo y resultados del analisis.
   Nunca: vueltas, telemetria, archivos, nombres ni comentarios libres. Si no hay internet queda en cola. */
(function () {
  const URL_ = "https://zbesblxiezcfurswanev.supabase.co/rest/v1/envios";
  const KEY = "sb_publishable_HRIpZ4BfWemVZ8TNA37-EQ_tKN1joRG";   // clave publica: solo permite agregar resumenes
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } } };

  const enabled = () => store.get("kt-share", true) !== false;
  const PRIV = "https://francomica22-lab.github.io/kart-telemetria/privacidad.html";
  // al desactivar se descarta lo que estuviera esperando para enviarse
  const setEnabled = v => { store.set("kt-share", !!v); if (!v) store.set("kt-share-queue", []); };
  function device() {
    let id = store.get("kt-device", null);
    if (!id) { id = (crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c => (c ^ Math.random() * 16 >> c / 4).toString(16))); store.set("kt-device", id); }
    return id;
  }
  async function sha(text) {
    const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("").slice(0, 40);
  }
  const num = (v, d = 3) => (v == null || !isFinite(v)) ? null : +(+v).toFixed(d);

  // potencia maxima con parametros estandar (175 kg, CdA 0.55, Crr 0.025) y el aire del dia: comparable entre envios
  function peakPower(bins, rho) {
    const pts = (bins || []).filter(b => b.n >= 25 && b.vueltas >= 2);
    if (pts.length < 3) return [null, null];
    let best = [0, 0];
    for (const b of pts) { const hp = (175 * b.acc * 9.81 + 0.5 * (rho || 1.2) * 0.55 * b.v * b.v + 0.025 * 175 * 9.81) * b.v / 745.7; if (hp > best[0]) best = [hp, b.rpm]; }
    return [num(best[0], 1), Math.round(best[1])];
  }

  async function buildRecords(D, opts) {
    const c = D.circuito || {}, out = [];
    for (const s of D.sessions) {
      const M = ((D.motor || {}).sessions || {})[s.id] || {}, cl = (D.clima || {})[s.id] || null, k = window.KTK ? KTK.get(s.kart) : {};
      const file = (s.path || "").split(/[\\/]/).pop();
      const iso = s.date && s.date.length == 10 ? `${s.date.slice(6)}-${s.date.slice(0, 2)}-${s.date.slice(3, 5)}` : null;
      const setup = Object.assign({}, ((s.setup || {}).valores) || {}); delete setup.notas;   // sin texto libre
      const gr = (D.corners || []).map(x => ((x.by || {})[s.id] || {}).lat_ses_max).filter(v => v != null).sort((a, b) => a - b);
      const [hp, hpr] = peakPower(M.potencia, cl && cl.rho);
      out.push({
        sesion_hash: await sha(`${file}|${s.date}|${s.hour}|${s.top && s.top[0]}`),
        dispositivo: device(), app_version: (opts.version || "").slice(0, 20), plataforma: opts.web ? "web" : "escritorio",
        circuito_key: c.lat != null ? `${c.lat.toFixed(2)}_${c.lon.toFixed(2)}` : null, circuito_nombre: (c.nombre || s.venue || "").slice(0, 60),
        circuito: c.largo ? { largo: c.largo, v_media: c.v_media, curvas: (c.curvas || []).map(x => ({ tipo: x.tipo, forma: x.forma, giro: x.giro, radio: x.radio, v_min: x.v_min, lado: x.sentido })),
          recta_max: c.recta_max, pct_acelerando: c.pct_acelerando, pct_frenando: c.pct_frenando, grip_g: c.grip_g, huella: c.huella } : null,
        categoria: (k.categoria || "").slice(0, 40) || null, chasis: (k.chasis || "").slice(0, 40) || null, motor: (k.motor || "").slice(0, 40) || null,
        kart_texto: (s.kart || "").slice(0, 60) || null,
        fecha: iso, hora: (s.hour || "").slice(0, 8), mejor_tiempo: num(s.top && s.top[0]), vueltas: (D.optimo && D.optimo[s.id] ? D.optimo[s.id].vueltas : (s.laps || []).length),
        promedio: s.top && s.top.length ? num(s.top.reduce((a, b) => a + b, 0) / s.top.length) : null,
        setup: Object.keys(setup).length ? setup : null,
        clima: cl ? { T: num(cl.T, 1), RH: num(cl.RH, 0), P: num(cl.P, 0), W: num(cl.W, 0), rho: num(cl.rho, 3) } : null,
        potencia_hp: hp, potencia_rpm: hpr, grip_g: gr.length ? num(gr[gr.length >> 1], 2) : null,
        fallas_motor: ((M.fallas || {}).grupos || []).filter(g => g.n >= 2).length,
        relacion_rpm_kmh: num(M.ratio_top, 1),
      });
    }
    return out;
  }

  async function flush() {
    if (!enabled()) return;
    const q = store.get("kt-share-queue", []), sent = new Set(store.get("kt-share-sent", []));
    const keep = [];
    for (const r of q) {
      if (sent.has(r.sesion_hash)) continue;
      try {
        const res = await fetch(URL_, { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify(r) });
        if (res.ok || res.status == 409) sent.add(r.sesion_hash);       // 409: ya estaba (otra persona analizo la misma tanda)
        else if (res.status >= 500) keep.push(r);                        // error del servidor: reintentar despues
      } catch (e) { keep.push(r); }                                       // sin internet: queda en cola
    }
    store.set("kt-share-queue", keep.slice(-200));
    store.set("kt-share-sent", [...sent].slice(-2000));
  }
  async function share(D, opts) {
    if (!enabled() || !D) return;
    try {
      const recs = await buildRecords(D, opts || {});
      const sent = new Set(store.get("kt-share-sent", [])), q = store.get("kt-share-queue", []);
      for (const r of recs) if (!sent.has(r.sesion_hash) && !q.some(x => x.sesion_hash == r.sesion_hash)) q.push(r);
      store.set("kt-share-queue", q);
      await flush();
    } catch (e) { /* compartir nunca debe romper el analisis */ }
  }
  const AVISO = `Para mejorar las sugerencias, la app comparte un <b>resumen anónimo</b> de cada tanda que analizás: el circuito, el kart (categoría, chasis y motor), el setup, el clima, el mejor tiempo y los resultados del análisis.
    <br><br><b>Nunca</b> se comparten tus vueltas, la telemetría, los archivos, tu nombre ni tus comentarios.`;
  function notice(force) {
    if (!force && store.get("kt-share-aviso", false)) return;
    const d = document.createElement("div"); d.className = "modal";
    d.innerHTML = `<div class="mbox" role="dialog" aria-modal="true" aria-labelledby="sh-t"><h2 id="sh-t">Datos anónimos</h2><p class="ink2 small">${AVISO}</p>
      <label class="toggle"><input type="checkbox" id="sh-on" ${enabled() ? "checked" : ""}><span>Compartir datos anónimos</span></label>
      <p class="muted small">Lo podés cambiar cuando quieras en Ajustes del análisis. <a href="${PRIV}" target="_blank" rel="noopener">Política de privacidad</a></p>
      <p class="muted small">Identificador anónimo de este equipo (para pedir que se borren tus envíos): <span class="num" style="user-select:all">${device()}</span></p>
      <div class="mact"><button class="btn primary" id="sh-ok">Listo</button></div></div>`;
    document.body.appendChild(d);
    d.querySelector("#sh-ok").addEventListener("click", () => {
      setEnabled(d.querySelector("#sh-on").checked); store.set("kt-share-aviso", true); d.remove();
      document.dispatchEvent(new CustomEvent("kt-share-change"));
    });
  }
  window.KTS = { PRIV, device, enabled, setEnabled, share, flush, notice, buildRecords };
})();
