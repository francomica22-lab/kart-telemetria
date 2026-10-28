/* Tiempo de vuelta: segundos hasta 59.999, después m:ss.mmm (1:02.345). */
function tVuelta(t) {
  if (t == null || !isFinite(t)) return "–";
  const ms = Math.round(t * 1000);
  if (ms < 60000) return (ms / 1000).toFixed(3);
  return `${Math.floor(ms / 60000)}:${((ms % 60000) / 1000).toFixed(3).padStart(6, "0")}`;
}

/* Secciones del reporte: vuelta optima, potencia, transmision, sensores, video y setup.
   Las usa report.js (window.KTX). Todo es local: no necesita internet salvo el clima (lo trae app.js). */
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const el = (t, a, p) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; };
  const txt = (p, x, y, s, a = {}) => { const t = el("text", Object.assign({ x, y }, a), p); t.textContent = s; return t; };
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
  const sgn = (v, n = 2) => { const t = Math.abs(v).toFixed(n); return (+t == 0 ? "" : v > 0 ? "+" : "−") + t; };
  const f1 = v => Math.abs(v).toFixed(1), f0 = v => Math.abs(v).toFixed(0);
  const tks = (a, b, n) => { const st = (b - a) / n, o = []; for (let i = 0; i <= n; i++) o.push(+(a + i * st).toFixed(2)); return o; };
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } } };

  /* ---------- clima y aire ---------- */
  const SENSOR_NAMES = { "Water Temp": "Temperatura de agua", "Temp TC 1": "Temperatura de escape 1 (termocupla)", "Temp TC 2": "Temperatura de escape 2 (termocupla)",
    "Temp TR 2": "Temperatura (termorresistencia) 2", "External Voltage": "Tensión externa", "Internal Batt": "Batería interna del logger", "Logger Temperature": "Temperatura del logger",
    "Luminosity": "Luminosidad", "Jackshaft": "RPM eje intermedio", "WheelSpeed": "Velocidad de rueda" };
  const climaTxt = c => c ? `${c.T.toFixed(0)} °C · ${c.RH.toFixed(0)}% hum · ${c.P.toFixed(0)} hPa · viento ${c.W.toFixed(0)} km/h` : "";

  /* ---------- setup ---------- */
  function setupDiff(D, a, b) {
    const A = (a.setup || {}).valores || {}, B = (b.setup || {}).valores || {}, F = Object.fromEntries((D.setup_fields || []).map(f => [f[0], f]));
    const out = [];
    for (const k of Object.keys(F)) {
      if (k == "notas") continue;
      if (A[k] != null && B[k] != null && String(A[k]) != String(B[k])) out.push(`${F[k][1]}: ${A[k]} → ${B[k]}${F[k][2] ? " " + F[k][2] : ""}`);
      else if ((A[k] == null) != (B[k] == null) && (A[k] != null || B[k] != null)) out.push(`${F[k][1]}: ${A[k] ?? "—"} → ${B[k] ?? "—"}`);
    }
    return out;
  }
  function setupChips(D, s) {
    const V = (s.setup || {}).valores || {}, F = D.setup_fields || [];
    const items = F.filter(f => f[0] != "notas" && V[f[0]] != null && V[f[0]] !== "").map(f => `<span class="schip" title="${esc(f[1])}">${esc(f[1].replace("Presión ", "P. ").replace("delantera", "del.").replace("trasera", "tras."))}: <b>${esc(V[f[0]])}${f[2] && f[2] != "dientes" ? " " + f[2] : ""}</b></span>`);
    return items.join("");
  }
  function setupModal(D, s, onSave) {
    const V = Object.assign({}, (s.setup || {}).valores || {}), auto = (s.setup || {}).auto || {}, F = (D.setup_fields || []).filter(f => !CARB_KEYS.includes(f[0]));
    const d = document.createElement("div"); d.className = "modal";
    d.innerHTML = `<form class="mbox wide" role="dialog" aria-modal="true" aria-labelledby="st"><h2 id="st">Setup · ${esc(tVuelta(s.top[0]))} · ${esc(s.hour)}</h2>
      <p class="ink2 small">Lo que viene del comentario de la MyChron ya está completo. Lo que cargues acá se guarda junto al archivo de la tanda.</p>
      <div class="sgrid">${F.map(f => `<label class="${f[0] == "notas" ? "full" : ""}"><span>${esc(f[1])}${f[2] ? ` <span class="muted">(${esc(f[2])})</span>` : ""}${auto[f[0]] != null ? ` <span class="muted">· del comentario</span>` : ""}</span>
        ${f[0] == "notas" ? `<textarea id="sf-${f[0]}" rows="2">${esc(V[f[0]] ?? "")}</textarea>` : `<input id="sf-${f[0]}" value="${esc(V[f[0]] ?? "")}" autocomplete="off">`}</label>`).join("")}</div>
      <p class="small" id="smsg"></p>
      <div class="mact"><button type="button" class="btn" id="scancel">Cancelar</button><button type="submit" class="btn primary">Guardar setup</button></div></form>`;
    document.body.appendChild(d);
    d.querySelector("#scancel").addEventListener("click", () => d.remove());
    d.querySelector("form").addEventListener("submit", async e => {
      e.preventDefault();
      const vals = {};
      for (const f of F) { let v = d.querySelector("#sf-" + f[0]).value.trim(); if (v === "") continue; const n = Number(v.replace(",", ".")); vals[f[0]] = f[2] && !isNaN(n) ? n : v; }
      const man = (s.setup || {}).manual || {}; for (const k of CARB_KEYS) if (man[k] != null && man[k] !== "") vals[k] = man[k];
      const r = await onSave(vals);
      if (r && r.error) { d.querySelector("#smsg").textContent = r.error; d.querySelector("#smsg").className = "small b"; return; }
      d.remove();
    });
  }

  /* ---------- vuelta optima y regularidad ---------- */
  function optimoTips(op) {
    const tips = [];
    for (const c of op.curvas) {
      const gain = c.promedio - c.mejor; if (gain < 0.03) continue;
      const B = c.mejor_metricas, A = c.prom_metricas, why = [];
      if (B.freno_max != null && A.freno_max != null && B.freno_max - A.freno_max >= 0.1) why.push(`frenaste más fuerte (${B.freno_max.toFixed(2)} g contra ${A.freno_max.toFixed(2)} g de promedio)`);
      if (B.s_freno != null && A.s_freno != null && B.s_freno - A.s_freno >= 2.5) why.push(`frenaste ${f0(B.s_freno - A.s_freno)} m más tarde`);
      if (B.v_min - A.v_min >= 0.7) why.push(`pasaste ${f1(B.v_min - A.v_min)} km/h más rápido por el vértice`);
      if (Math.abs(B.s_vmin - A.s_vmin) >= 3) why.push(`hiciste el vértice ${f0(B.s_vmin - A.s_vmin)} m ${B.s_vmin < A.s_vmin ? "antes" : "más tarde"}`);
      if (B.s_acel != null && A.s_acel != null && A.s_acel - B.s_acel >= 3) why.push(`aceleraste ${f0(A.s_acel - B.s_acel)} m antes`);
      if (B.v_salida - A.v_salida >= 0.8) why.push(`saliste ${f1(B.v_salida - A.v_salida)} km/h más rápido`);
      tips.push({ n: c.n, lap: c.mejor_lap, gain, why });
    }
    return tips.sort((a, b) => b.gain - a.gain);
  }
  function lapTrend(s) {
    const best = Math.min(...s.laps.map(l => l.t)), L = s.laps.filter(l => l.t <= best * 1.04);
    if (L.length < 6) return null;
    const x = L.map(l => l.lap), y = L.map(l => l.t), mx = avg(x), my = avg(y);
    const b = x.reduce((a, xi, i) => a + (xi - mx) * (y[i] - my), 0) / x.reduce((a, xi) => a + (xi - mx) ** 2, 0);
    return b;
  }
  function optimoPane(ctx) {
    const { D, IDS, S, COL, NAME } = ctx;
    let h = "";
    for (const id of IDS) {
      const op = D.optimo[id], s = S[id]; if (!op) continue;
      const tips = optimoTips(op).slice(0, 3), trend = lapTrend(s);
      const irreg = op.curvas.slice().sort((a, b) => b.desvio - a.desvio).slice(0, 2);
      const lost = op.mejor - op.optima, toAvg = op.promedio - op.optima;
      h += `<div class="panel"><div class="eyebrow" style="color:${COL[id]};margin-bottom:6px">${NAME(id)} · ${op.vueltas} vueltas analizadas</div>
        <div class="optrow">
          <div><div class="eyebrow">Vuelta óptima</div><div class="big">${tVuelta(op.optima)}</div><div class="muted small">tus mejores curvas juntas</div></div>
          <div><div class="eyebrow">Mejor vuelta</div><div class="big">${tVuelta(op.mejor)}</div><div class="muted small">vuelta ${op.mejor_vuelta} · ${sgn(lost, 3)} s</div></div>
          <div><div class="eyebrow">Promedio</div><div class="big">${tVuelta(op.promedio)}</div><div class="muted small" title="Desvío entre vueltas: ±${op.desvio.toFixed(2)} s">${sgn(toAvg, 3)} s · ±${op.desvio.toFixed(2)} s</div></div>
        </div>
        ${tips.length ? `<div class="todo" style="margin-top:12px"><div class="eyebrow">Repetí lo que ya hiciste bien</div><ul class="why compact">${tips.map(t => `<li>${t.why.length ? `<details class="fold"><summary><b>Curva ${t.n}</b> · vuelta ${t.lap} · <span class="g num">−${t.gain.toFixed(2)} s</span> vs tu promedio</summary><div class="fold-body">${t.why.join(", ")}.</div></details>` : `<b>Curva ${t.n}</b> · vuelta ${t.lap} · <span class="g num">−${t.gain.toFixed(2)} s</span> vs tu promedio`}</li>`).join("")}</ul></div>` : ""}
        <details class="fold subtle" style="margin-top:10px"><summary class="small">Regularidad y ritmo</summary><div class="fold-body"><ul class="why">
          ${irreg.map((c, i) => `<li><b>Curva ${c.n}</b> ${i == 0 ? "es la más irregular" : "le sigue"}: varía ±${c.desvio.toFixed(2)} s entre vueltas${c.desvio_vertice >= 2.5 ? ` y el vértice se mueve ±${c.desvio_vertice.toFixed(0)} m` : ""}${c.desvio_freno != null && c.desvio_freno >= 2.5 ? `; el punto de frenada, ±${c.desvio_freno.toFixed(0)} m` : ""}.</li>`).join("")}
          ${trend != null ? `<li>${Math.abs(trend) < 0.01 ? "El ritmo se mantuvo parejo a lo largo de la tanda." : trend > 0 ? `Cada vuelta fuiste <b>${trend.toFixed(3)} s más lento</b> en promedio: el agarre o el motor caen con las vueltas.` : `Cada vuelta mejoraste ${Math.abs(trend).toFixed(3)} s en promedio: las gomas y la pista fueron entrando.`}</li>` : ""}
        </ul></div></details>
        <details class="fold subtle"><summary class="small">Tabla curva por curva</summary><div class="fold-body tw"><table><thead><tr><th>Curva</th><th>Óptima</th><th>Vuelta</th><th>En tu mejor vuelta</th><th>Promedio</th><th>Desvío</th><th>Vértice ±m</th></tr></thead><tbody>
          ${op.curvas.map(c => `<tr><td>Curva ${c.n}</td><td class="g">${c.mejor.toFixed(3)}</td><td>V${c.mejor_lap}</td><td>${c.en_mejor_vuelta != null ? c.en_mejor_vuelta.toFixed(3) + ` <span class="muted">${sgn(c.en_mejor_vuelta - c.mejor)}</span>` : "–"}</td><td>${c.promedio.toFixed(3)} <span class="muted">${sgn(c.promedio - c.mejor)}</span></td><td>±${c.desvio.toFixed(3)}</td><td>±${c.desvio_vertice.toFixed(1)}</td></tr>`).join("")}
          <tr class="first"><td><b>Vuelta</b></td><td class="g"><b>${tVuelta(op.optima)}</b></td><td></td><td>${tVuelta(op.mejor)}</td><td>${tVuelta(op.promedio)}</td><td>±${op.desvio.toFixed(3)}</td><td></td></tr>
        </tbody></table></div></details></div>`;
    }
    return h;
  }
  function simpleOptimo(ctx, id) {
    const { D } = ctx, op = D.optimo[id]; if (!op) return "";
    const tips = optimoTips(op).slice(0, 2);
    return `<div class="panel"><div class="eyebrow" style="margin-bottom:6px">Tu vuelta óptima</div>
      <p>Juntando tus mejores curvas de la tanda, la vuelta sería <b>${tVuelta(op.optima)}</b>, <b>${(op.mejor - op.optima).toFixed(2)} s</b> mejor que tu mejor vuelta.</p>
      ${tips.length ? `<ul class="why" style="margin-top:8px">${tips.map(t => `<li>En la <b>curva ${t.n}</b>, en la vuelta ${t.lap}, lo hiciste ${t.gain.toFixed(2)} s mejor que tu promedio${t.why.length ? ": " + t.why.slice(0, 2).join(" y ") : ""}. ¡Repetilo!</li>`).join("")}</ul>` : ""}</div>`;
  }

  /* ---------- curva por curva: que te conviene, referencias, velocidad y trazado ---------- */
  const mean = a => { const v = a.filter(x => x != null && isFinite(x)); return v.length ? avg(v) : null; };
  const sd = a => { const v = a.filter(x => x != null && isFinite(x)); if (v.length < 2) return null; const m = avg(v); return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1)); };
  const median = a => { const v = a.filter(x => x != null && isFinite(x)).sort((x, y) => x - y); return v.length ? v[Math.floor((v.length - 1) / 2)] : null; };
  function corr(x, y) {
    const p = x.map((xi, i) => [xi, y[i]]).filter(([a, b]) => a != null && b != null);
    if (p.length < 6) return null;
    const mx = avg(p.map(q => q[0])), my = avg(p.map(q => q[1]));
    let sxy = 0, sxx = 0, syy = 0; for (const [a, b] of p) { sxy += (a - mx) * (b - my); sxx += (a - mx) ** 2; syy += (b - my) ** 2; }
    return sxx && syy ? { r: sxy / Math.sqrt(sxx * syy), slope: sxy / sxx } : null;
  }
  // pasadas validas de una curva: sin las que quedaron muy lentas (trafico, trompo, boxes)
  function cornerLaps(cv) {
    const L = cv.por_vuelta.filter(l => l.t != null), m = median(L.map(l => l.t));
    return L.filter(l => l.t <= m * 1.08);
  }
  // compara las pasadas mas rapidas con el resto y arma la receta
  function cornerAdvice(cv, corner) {
    const L = cornerLaps(cv).sort((a, b) => a.t - b.t), n = L.length, sa = corner.sa;
    const best = L[0], k = Math.max(1, Math.min(3, Math.round(n / 3))), fast = L.slice(0, k), rest = L.slice(k);
    const ref = { f: median(fast.map(l => l.f)), a: median(fast.map(l => l.a)), sv: median(fast.map(l => l.sv)), vm: mean(fast.map(l => l.vm)) };
    const out = { n, best, k, ref, sa, pot: n > 1 ? mean(L.map(l => l.t)) - best.t : 0, spread: { f: sd(L.map(l => l.f)), a: sd(L.map(l => l.a)), sv: sd(L.map(l => l.sv)) } };
    if (n < 4 || !rest.length) { out.title = "Pocas vueltas para comparar"; out.text = "Hacen falta al menos 4 pasadas parecidas por esta curva para saber qué te conviene."; return out; }
    const d = key => { const a = mean(fast.map(l => l[key])), b = mean(rest.map(l => l[key])); return a != null && b != null ? a - b : 0; };
    const dF = d("f"), dA = d("a"), dVm = d("vm"), dVg = d("vg"), dVs = d("vs"), gain = mean(rest.map(l => l.t)) - mean(fast.map(l => l.t));
    const late = dF >= 2.5, early = dF <= -2.5, gasE = dA <= -2.5, gasL = dA >= 2.5;
    const fm = `${f0(dF)} m`, am = `${f0(dA)} m`, g = `${gain.toFixed(2)} s`;
    if (late && !gasL) { out.kind = "tarde"; out.title = "Frená más tarde"; out.text = `En tus pasadas más rápidas frenaste ${fm} más tarde${gasE ? ` y además aceleraste ${am} antes` : " y aceleraste en el mismo lugar"}. Frenar pasado no te arruinó la salida: ganaste ${g}.`; }
    else if (late && gasL) { out.kind = "tarde"; out.title = "Frená pasado, aunque acelerés después"; out.text = `En las rápidas frenaste ${fm} más tarde y aceleraste ${am} más tarde. La velocidad que metés adentro (${sgn(dVm, 1)} km/h en el vértice) compensa la salida: ganaste ${g}.`; }
    else if (early && gasE) { out.kind = "antes"; out.title = "Frená antes y acelerá antes"; out.text = `En las rápidas frenaste ${fm} antes pero aceleraste ${am} antes y saliste ${sgn(dVs, 1)} km/h. Lo que perdés en la entrada lo recuperás de sobra en la salida: ganaste ${g}.`; }
    else if (early) { out.kind = "antes"; out.title = "No la frenes tan pasado"; out.text = `En las rápidas frenaste ${fm} antes y llegaste más ordenado al vértice (${sgn(dVm, 1)} km/h). Cuando frenás tarde te pasás y perdés: frenando antes ganaste ${g}.`; }
    else if (gasE) { out.kind = "salida"; out.title = "Acelerá antes"; out.text = `La frenada es la misma: la diferencia está en la salida. En las rápidas aceleraste ${am} antes y saliste ${sgn(dVs, 1)} km/h: ganaste ${g}.`; }
    else if (dVm >= 1 || dVg >= 1.5) { out.kind = "medio"; out.title = "Llevá más velocidad adentro"; out.text = `Frenás y acelerás en el mismo lugar, pero en las rápidas ${dVm >= 1 ? `pasaste ${sgn(dVm, 1)} km/h por el vértice` : `empezaste a girar ${sgn(dVg, 1)} km/h más rápido`}: soltá el freno antes y dejá correr el kart. Ganaste ${g}.`; }
    else { out.kind = "parejo"; out.title = "Tus pasadas son parecidas"; out.text = `Entre tus pasadas rápidas y las demás hay ${g} y no aparece una diferencia clara de frenada ni de aceleración. Fijá las referencias de abajo y buscá la línea de tu mejor pasada.`; }
    const cf = corr(L.map(l => l.f), L.map(l => l.t));
    if (cf && Math.abs(cf.r) >= 0.4) out.corr = `Mirando todas tus vueltas, las que frenaste más tarde salieron más ${cf.slope < 0 ? "rápidas" : "lentas"}: unos ${f0(Math.abs(cf.slope) * 1000)} ms por cada metro.`;
    return out;
  }
  // posicion relativa al vertice
  const relV = (s, sa) => s == null ? "–" : Math.abs(s - sa) < 3 ? "en el vértice" : s < sa ? `${f0(sa - s)} m antes del vértice` : `${f0(s - sa)} m después del vértice`;

  function curvaTool(ctx) {
    const { D, IDS } = ctx;
    if (!D.corners || !D.corners[0] || !D.corners[0].geo || !IDS.some(id => D.optimo[id] && D.optimo[id].curvas[0].trazas)) return "";
    return `<div class="panel cvt"><div class="cvt-head"><div><div class="eyebrow">Curva por curva</div><h2>Qué te conviene en cada curva</h2></div>
      ${IDS.length > 1 ? `<label class="cvt-sel">Tanda <select data-cv="ses">${IDS.map(id => `<option value="${id}">${esc(ctx.NAME(id))}</option>`).join("")}</select></label>` : ""}</div>
      <div class="cvt-curvas" role="tablist"></div><div class="cvt-body"></div></div>`;
  }

  function wireCurva(ctx, box) {
    const root = box.querySelector(".cvt"); if (!root) return;
    const { D, IDS } = ctx, C = D.corners, sentido = n => ((D.circuito || {}).curvas || []).find(c => c.n == n);
    let sid = IDS[0], cn = null, cmp = null, zoom = 1;
    const curvaBtns = () => {
      const rows = D.optimo[sid].curvas.map(cv => ({ n: cv.n, g: cornerAdvice(cv, C.find(c => c.n == cv.n)).pot }));
      if (cn == null) cn = rows.slice().sort((a, b) => b.g - a.g)[0].n;   // arranca por la curva con mas para ganar
      root.querySelector(".cvt-curvas").innerHTML = rows.map(r => `<button role="tab" data-n="${r.n}" class="${r.n == cn ? "on" : ""}" title="Tu promedio en esta curva está ${r.g.toFixed(2)} s arriba de tu mejor pasada (sin contar pasadas con tráfico o errores)"><b>Curva ${r.n}</b><small>${r.g >= 0.005 ? "−" + r.g.toFixed(2) + " s" : "="}</small></button>`).join("");
      root.querySelectorAll(".cvt-curvas button").forEach(b => b.addEventListener("click", () => { cn = +b.dataset.n; cmp = null; render(); }));
    };
    const render = () => {
      curvaBtns();
      const cv = D.optimo[sid].curvas.find(c => c.n == cn), corner = C.find(c => c.n == cn), A = cornerAdvice(cv, corner), sc = sentido(cn);
      const laps = cornerLaps(cv).sort((a, b) => a.t - b.t), bl = A.best, tip = laps[Math.floor(laps.length / 2)];
      if (cmp == null || !laps.some(l => l.lap == cmp && l.lap != bl.lap)) cmp = laps.length > 1 ? (tip.lap != bl.lap ? tip.lap : laps[1].lap) : bl.lap;
      const cl = cv.por_vuelta.find(l => l.lap == cmp);
      const refRow = (lbl, s, spread, extra = "") => `<tr><td>${lbl}</td><td><b>${relV(s, A.sa)}</b>${extra}</td><td class="muted">${spread != null ? `±${spread.toFixed(0)} m` : ""}</td></tr>`;
      root.querySelector(".cvt-body").innerHTML = `
        <div class="cvt-top">
          <div class="cvt-rec">
            <div class="small ink2">Curva ${cn}${sc ? ` · ${sc.sentido} · ${sc.giro}°` : ""} · mejor pasada ${A.best.t.toFixed(3)} s (vuelta ${A.best.lap}) · promedio ${(A.best.t + A.pot).toFixed(3)} s</div>
            <h3 class="cvt-title">${A.title}</h3>
            <p>${A.text}</p>${A.corr ? `<p class="small ink2">${A.corr}</p>` : ""}
            <div class="eyebrow" style="margin-top:12px">Tus referencias${A.k > 1 ? ` · tus ${A.k} pasadas más rápidas` : ""}</div>
            <table class="cvt-ref"><thead><tr><th></th><th>Dónde</th><th title="Cuánto varía de una vuelta a otra">Varía</th></tr></thead><tbody>
              ${refRow("Frenada", A.ref.f, A.spread.f)}
              ${refRow("Vértice", A.ref.sv, A.spread.sv, A.ref.vm != null ? ` · ${A.ref.vm.toFixed(1)} km/h` : "")}
              ${refRow("Acelerador", A.ref.a, A.spread.a)}
            </tbody></table>
            ${A.spread.f != null && A.spread.f >= 4 ? `<p class="small cvt-warn">Tu frenada se mueve ±${A.spread.f.toFixed(0)} m de una vuelta a otra: elegí una referencia fija (cartel, cordón, una marca en la pista) y frená siempre ahí.</p>` : ""}
          </div>
          <div class="cvt-mapbox"><div class="cvt-maphead"><span class="eyebrow">Trazado</span><button class="link" data-cv="zoom">${zoom > 1 ? "ver a escala real" : "ampliar diferencias ×4"}</button></div>
            <svg class="cvt-map"></svg>
            <div class="cvt-leg"><span><i style="background:var(--good)"></i>Ideal: tu mejor pasada (V${bl.lap})</span>${cmp != bl.lap ? `<span><i style="background:var(--s1)"></i>Vuelta ${cmp}</span>` : ""}</div>
            <p class="small ink2">${zoom > 1 ? "Las diferencias de línea están ampliadas 4 veces para que se vean." : "Línea según el GPS (precisión de 1 a 2 m). La franja gris es la pista aproximada."}</p></div>
        </div>
        <div class="cvt-chhead"><span class="eyebrow">Velocidad en la curva</span>
          ${laps.length > 1 ? `<label class="cvt-sel">Comparar con <select data-cv="cmp">${laps.filter(l => l.lap != bl.lap).map(l => `<option value="${l.lap}" ${l.lap == cmp ? "selected" : ""}>vuelta ${l.lap} · ${tVuelta(l.t)}${l.lap == tip.lap ? " (típica)" : ""}</option>`).join("")}</select></label>` : ""}</div>
        <svg class="cvt-chart"></svg>
        <p class="small ink2">F: empieza a frenar · V: vértice · A: vuelve a acelerar. Abajo, la línea azul es el tiempo que la vuelta ${cmp} pierde (sube) o gana (baja) contra tu mejor pasada, metro a metro. Pasá el mouse para ver los valores.</p>`;
      const sel = root.querySelector('[data-cv="cmp"]'); if (sel) sel.addEventListener("change", () => { cmp = +sel.value; render(); });
      root.querySelector('[data-cv="zoom"]').addEventListener("click", () => { zoom = zoom > 1 ? 1 : 4; render(); });
      drawCurvaChart(root.querySelector(".cvt-chart"), corner, cv, bl, cl);
      drawCurvaMap(root.querySelector(".cvt-map"), corner, cv, bl, cl, zoom);
    };
    const ss = root.querySelector('[data-cv="ses"]'); if (ss) ss.addEventListener("change", () => { sid = ss.value; cn = null; cmp = null; render(); });
    render();
    return { go(n, id) { if (id && id != sid) { sid = id; if (ss) ss.value = id; } cn = n; cmp = null; render(); root.scrollIntoView({ behavior: "smooth", block: "start" }); } };
  }
  // receta corta de una curva (para las listas del analisis simple)
  function cornerTip(D, sid, n) {
    const op = D.optimo[sid], cv = op && op.curvas.find(c => c.n == n), corner = (D.corners || []).find(c => c.n == n);
    return cv && corner && cv.por_vuelta[0] && "f" in cv.por_vuelta[0] ? cornerAdvice(cv, corner) : null;
  }

  // grilla de la curva: distancia relativa al vertice
  const gridOf = (corner, n) => { const g = corner.geo, o = []; for (let i = 0; i < n; i++) o.push(g.s0 + i * g.ds - corner.sa); return o; };
  const idxOf = (corner, s) => s == null ? -1 : Math.round((s - corner.geo.s0) / corner.geo.ds);
  // la salida se corta a una distancia razonable del vertice (la recta entera no aporta)
  const nShow = (corner, n) => Math.min(n, Math.round((corner.sa + Math.max(80, 1.3 * (corner.sa - corner.geo.s0)) - corner.geo.s0) / corner.geo.ds) + 1);
  const cut = (t, n) => ({ v: t.v.slice(0, n), o: t.o.slice(0, n) });

  function drawCurvaChart(svg, corner, cv, bl, cl) {
    const W = Math.max(600, Math.round(svg.getBoundingClientRect().width) || 900), H = 330, PL = 46, PR = 14, PT = 14, HV = 210, PB = 26;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    if (!cv.trazas[bl.lap] || !cv.trazas[cl.lap]) return;
    const n = nShow(corner, cv.trazas[bl.lap].v.length), tb = cut(cv.trazas[bl.lap], n), tc = cut(cv.trazas[cl.lap], n);
    const x = gridOf(corner, n), all = tb.v.concat(tc.v), st = Math.max(...all) - Math.min(...all) > 50 ? 20 : 10;
    const vmin = Math.floor(Math.min(...all) / st) * st, vmax = Math.ceil(Math.max(...all) / st) * st;
    const X = v => PL + (v - x[0]) / (x[x.length - 1] - x[0]) * (W - PL - PR), Y = v => PT + (1 - (v - vmin) / (vmax - vmin)) * (HV - PT);
    // tiempo acumulado (dt = ds / v) y diferencia contra la mejor
    const cum = v => { let t = 0; return v.map((s, i) => (i ? (t += corner.geo.ds / Math.max((s + v[i - 1]) / 2 / 3.6, 1)) : 0)); };
    const cb = cum(tb.v), dt = cum(tc.v).map((t, i) => t - cb[i]), dmax = Math.max(0.05, ...dt.map(Math.abs));
    const Y0 = HV + 24, Y1 = H - PB, YD = v => (Y0 + Y1) / 2 - v / dmax * (Y1 - Y0) / 2;
    for (let t = vmin; t <= vmax; t += st) { el("line", { x1: PL, x2: W - PR, y1: Y(t), y2: Y(t), stroke: "var(--grid)" }, svg); txt(svg, PL - 6, Y(t) + 4, t.toFixed(0), { "text-anchor": "end", class: "ax" }); }
    for (let m = Math.ceil(x[0] / 20) * 20; m <= x[x.length - 1]; m += 20) { el("line", { x1: X(m), x2: X(m), y1: PT, y2: Y1, stroke: m == 0 ? "var(--line)" : "var(--grid)" }, svg); txt(svg, X(m), H - 8, m == 0 ? "vértice" : (m > 0 ? "+" : "") + m + " m", { "text-anchor": "middle", class: "ax" }); }
    el("line", { x1: PL, x2: W - PR, y1: YD(0), y2: YD(0), stroke: "var(--line)" }, svg);
    txt(svg, PL - 6, YD(0) + 4, "0 s", { "text-anchor": "end", class: "ax" });
    txt(svg, PL - 6, Y0 + 4, `+${dmax.toFixed(2)}`, { "text-anchor": "end", class: "ax" });
    txt(svg, PL - 6, Y1 + 4, `−${dmax.toFixed(2)}`, { "text-anchor": "end", class: "ax" });
    txt(svg, PL + 4, Y0 - 6, "diferencia de tiempo", { class: "ax" });
    el("polyline", { points: dt.map((d, i) => `${X(x[i]).toFixed(1)},${YD(d).toFixed(1)}`).join(" "), fill: "none", stroke: "var(--s1)", "stroke-width": 2 }, svg);
    const dl = dt[dt.length - 1];
    txt(svg, W - PR, YD(dl) + (dl > 0 ? -6 : 16), `${sgn(dl)} s`, { "text-anchor": "end", style: `fill:${dl > 0 ? "var(--bad)" : "var(--good)"};font-weight:600;font-size:13px` });
    const line = (v, col, w) => el("polyline", { points: v.map((s, i) => `${X(x[i]).toFixed(1)},${Y(s).toFixed(1)}`).join(" "), fill: "none", stroke: col, "stroke-width": w, "stroke-linejoin": "round" }, svg);
    if (cl.lap != bl.lap) line(tc.v, "var(--s1)", 2);
    line(tb.v, "var(--good)", 2.5);
    const mark = (l, v, col, up) => {
      for (const [k, lbl] of [["f", "F"], ["sv", "V"], ["a", "A"]]) {
        const i = idxOf(corner, l[k]); if (i < 0 || i >= v.length) continue;
        el("circle", { cx: X(x[i]), cy: Y(v[i]), r: 4, fill: col, stroke: "var(--panel)", "stroke-width": 1.5 }, svg);
        txt(svg, X(x[i]), Y(v[i]) + (up ? -9 : 18), lbl, { "text-anchor": "middle", style: `fill:${col};font-weight:700;font-size:12px;paint-order:stroke;stroke:var(--panel);stroke-width:3px` });
      }
    };
    if (cl.lap != bl.lap) mark(cl, tc.v, "var(--s1)", false);
    mark(bl, tb.v, "var(--good)", true);
    // cursor
    const cur = el("line", { y1: PT, y2: Y1, stroke: "var(--ink2)", "stroke-dasharray": "3 3", opacity: 0 }, svg);
    const lab = txt(svg, 0, PT + 4, "", { class: "ax", style: "fill:var(--ink);font-size:12px;paint-order:stroke;stroke:var(--panel);stroke-width:4px" });
    const hit = el("rect", { x: PL, y: PT, width: W - PL - PR, height: Y1 - PT, fill: "transparent" }, svg);
    hit.addEventListener("pointermove", e => {
      const r = svg.getBoundingClientRect(), px = (e.clientX - r.left) / r.width * W, i = Math.max(0, Math.min(x.length - 1, Math.round((px - PL) / (W - PL - PR) * (x.length - 1))));
      cur.setAttribute("x1", X(x[i])); cur.setAttribute("x2", X(x[i])); cur.setAttribute("opacity", 1);
      lab.setAttribute("x", Math.min(X(x[i]) + 6, W - 330));
      lab.textContent = `${x[i] <= 0 ? f0(x[i]) + " m antes" : f0(x[i]) + " m después"} · mejor ${tb.v[i].toFixed(1)} · V${cl.lap} ${tc.v[i].toFixed(1)} km/h · ${sgn(dt[i])} s`;
    });
    hit.addEventListener("pointerleave", () => { cur.setAttribute("opacity", 0); lab.textContent = ""; });
  }

  function drawCurvaMap(svg, corner, cv, bl, cl, zoom) {
    if (!cv.trazas[bl.lap] || !cv.trazas[cl.lap]) return;
    const n = nShow(corner, cv.trazas[bl.lap].v.length), tb = cut(cv.trazas[bl.lap], n), tc = cut(cv.trazas[cl.lap], n), g0 = corner.geo;
    const g = { x: g0.x.slice(0, n), y: g0.y.slice(0, n), nx: g0.nx, ny: g0.ny };
    const pts = o => g.x.map((x, i) => [x + o[i] * zoom * g.nx[i], -(g.y[i] + o[i] * zoom * g.ny[i])]);
    const P0 = g.x.map((x, i) => [x, -g.y[i]]), Pb = pts(tb.o), Pc = pts(tc.o), all = P0.concat(Pb, Pc);
    const pad = 12, x0 = Math.min(...all.map(p => p[0])) - pad, x1 = Math.max(...all.map(p => p[0])) + pad, y0 = Math.min(...all.map(p => p[1])) - pad, y1 = Math.max(...all.map(p => p[1])) + pad;
    svg.setAttribute("viewBox", `${x0.toFixed(1)} ${y0.toFixed(1)} ${(x1 - x0).toFixed(1)} ${(y1 - y0).toFixed(1)}`);
    const u = Math.max(x1 - x0, y1 - y0) / 320;   // un "pixel" en metros, para trazos y textos
    const pl = (P, a) => el("polyline", Object.assign({ points: P.map(p => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" "), fill: "none", "stroke-linejoin": "round", "stroke-linecap": "round" }, a), svg);
    if (zoom == 1) pl(P0, { stroke: "var(--line)", "stroke-width": 9 });   // pista aproximada: 9 m de ancho
    if (cl.lap != bl.lap) pl(Pc, { stroke: "var(--s1)", "stroke-width": 2.2 * u });
    pl(Pb, { stroke: "var(--good)", "stroke-width": 3 * u });
    // sentido de marcha
    const a = Pb[0], b = Pb[Math.min(4, Pb.length - 1)], ang = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
    el("path", { d: `M ${-7 * u} ${-6 * u} L ${7 * u} 0 L ${-7 * u} ${6 * u} Z`, fill: "var(--ink2)", transform: `translate(${a[0]} ${a[1]}) rotate(${ang})` }, svg);
    const mark = (l, P, col, side) => {
      for (const [k, lbl] of [["f", "F"], ["sv", "V"], ["a", "A"]]) {
        const i = idxOf(corner, l[k]); if (i < 0 || i >= P.length) continue;
        el("circle", { cx: P[i][0], cy: P[i][1], r: 4.5 * u, fill: col, stroke: "var(--panel)", "stroke-width": 1.5 * u }, svg);
        txt(svg, P[i][0] + side * 8 * u, P[i][1] + 4 * u, lbl, { "text-anchor": side > 0 ? "start" : "end", style: `fill:${col};font-weight:700;font-size:${13 * u}px;paint-order:stroke;stroke:var(--panel);stroke-width:${3 * u}px` });
      }
    };
    if (cl.lap != bl.lap) mark(cl, Pc, "var(--s1)", -1);
    mark(bl, Pb, "var(--good)", 1);
  }

  /* ---------- potencia ---------- */
  function powerOf(b, P) { const g = 9.81; return (P.m * b.acc * g + 0.5 * P.rho * P.cda * b.v * b.v + P.crr * P.m * g) * b.v / 745.7; }
  function powerCurve(bins) { return (bins || []).filter(b => b.n >= 25 && b.vueltas >= 2); }
  // peso minimo con piloto segun la categoria que figura en la tanda (se puede cambiar; queda guardado por kart)
  const CAT_PESO = [[/DD2/i, 175], [/SENIOR|MAX/i, 165], [/JUNIOR/i, 145], [/MINI/i, 115], [/MICRO/i, 110], [/KZ|SHIFTER/i, 175]];
  const pesoCat = kart => { const c = CAT_PESO.find(([re]) => re.test(kart || "")); return c ? c[1] : null; };
  const pesoKey = s => "kt-peso-" + (s.kart || "kart").toUpperCase();
  function powerParams(ctx, id) {
    const st = store.get("kt-pot", {}), s = ctx.S[id], c = (ctx.D.clima || {})[id];
    const peso = +(((s.setup || {}).valores || {}).peso) || store.get(pesoKey(s), null) || pesoCat(s.kart) || 175;
    return { m: peso, cda: st.cda || 0.55, crr: st.crr || 0.025, rho: c ? c.rho : 1.2 };
  }
  /* ---------- carburacion: pico de RPM contra pico de velocidad en recta ---------- */
  const CARB_KEYS = ["carb_tipo", "chicler", "aguja", "baja", "alta", "sensacion", "sensacion_donde", "detonacion"];
  const CARB = { rico: ["Gordo (rico)", "bad"], pobre: ["Fino (pobre)", "bad"], ok: ["En punto", "good"] };
  const carbDonde = c => Math.abs(c.delta) < 0.5 ? "en el mismo lugar que el de velocidad" : `${f1(c.delta)} m ${c.delta > 0 ? "antes" : "después"} que el de velocidad`;
  function carbSimple(ctx) {
    const { IDS, M, BT } = ctx, xs = IDS.filter(id => M.sessions[id].carburacion);
    if (!xs.length) return "";
    return `<p class="small ink2" style="margin-top:6px">Carburación: ${xs.map(id => { const c = M.sessions[id].carburacion; return `${xs.length > 1 ? BT(id) + " " : ""}<b>${CARB[c.estado][0].toLowerCase()}</b> (${sgn(c.delta, 1) || "0"} m${c.pocos ? ", pocos datos" : ""})`; }).join(" · ")}</p>`;
  }
  function carbPanel(ctx) {
    const { IDS, M, COL, BT } = ctx, xs = IDS.filter(id => M.sessions[id].carburacion);
    if (!xs.length) return "";
    const U = M.sessions[xs[0]].carburacion.umbral, R = 15, W = 620, H = 40 + xs.length * 32 + 72;
    const X = v => 44 + (Math.max(-R, Math.min(R, v)) + R) / (2 * R) * (W - 88), y0 = 22 + xs.length * 32;
    let svg = `<svg class="carb" viewBox="0 0 ${W} ${H}" role="img" aria-label="Escala de carburación">
      <rect x="${X(-R)}" y="${y0}" width="${X(-U) - X(-R)}" height="14" fill="var(--bad)" opacity=".18"/>
      <rect x="${X(-U)}" y="${y0}" width="${X(U) - X(-U)}" height="14" fill="var(--good)" opacity=".22"/>
      <rect x="${X(U)}" y="${y0}" width="${X(R) - X(U)}" height="14" fill="var(--bad)" opacity=".18"/>
      ${[-R, -U, 0, U, R].map(v => `<line x1="${X(v)}" x2="${X(v)}" y1="${y0 + 14}" y2="${y0 + 20}" stroke="var(--muted)"/><text x="${X(v)}" y="${y0 + 44}" text-anchor="middle" font-size="15" fill="var(--muted)">${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)} m</text>`).join("")}
      <text x="${X(-R) - 30}" y="${y0 + 74}" font-size="16" fill="var(--ink2)">← Fino (pobre)</text>
      <text x="${X(0)}" y="${y0 + 74}" font-size="16" fill="var(--ink2)" text-anchor="middle">En punto</text>
      <text x="${X(R) + 30}" y="${y0 + 74}" font-size="16" fill="var(--ink2)" text-anchor="end">Gordo (rico) →</text>`;
    xs.forEach((id, i) => {
      const c = M.sessions[id].carburacion, x = X(c.delta), e = Math.min(c.se * 2, R), ty = 20 + i * 32;
      svg += `<line x1="${X(c.delta - e)}" x2="${X(c.delta + e)}" y1="${y0 + 7}" y2="${y0 + 7}" stroke="${COL[id]}" stroke-width="3"/>
        <line x1="${x}" x2="${x}" y1="${ty + 4}" y2="${y0 + 7}" stroke="${COL[id]}" stroke-width="1" opacity=".5"/>
        <circle cx="${x}" cy="${y0 + 7}" r="8" fill="${COL[id]}" stroke="var(--panel)" stroke-width="2"/>
        <text x="${x}" y="${ty}" text-anchor="${x < 90 ? "start" : x > W - 90 ? "end" : "middle"}" font-size="17" font-weight="600" fill="${COL[id]}">${xs.length > 1 ? BT(id) + " · " : ""}${sgn(c.delta, 1) || "0"} m</text>`;
    });
    svg += "</svg>";
    const tip = c => c.estado == "rico" ? "Probá empobrecer un punto y volvé a medir."
      : c.estado == "pobre" ? "Probá enriquecer un punto: andar fino arriesga el motor (pistón, aros)." : "";
    const lines = xs.map(id => {
      const c = M.sessions[id].carburacion, [lbl, cls] = CARB[c.estado];
      return `<li>${xs.length > 1 ? `<span class="dot" style="--c:${COL[id]}"></span><b>${BT(id)}</b> · ` : ""}<span class="chip ${cls}">${lbl}</span>
        el pico de RPM llega ${carbDonde(c)} <span class="muted small">(±${f1(c.se * 2)} m · ${c.n} pasadas${c.pocos ? " · pocos datos, tomalo con cuidado" : ""})</span>${tip(c) ? `<br><span class="small ink2">${tip(c)}</span>` : ""}</li>`;
    }).join("");
    let diff = "";
    if (xs.length > 1) {
      const a = M.sessions[xs[0]].carburacion, b = M.sessions[xs[1]].carburacion, dd = b.delta - a.delta, m = 2 * Math.hypot(a.se, b.se);
      diff = Math.abs(dd) > Math.max(m, 2) ? `<p class="small">Entre tandas: la ${BT(xs[1])} está ${f1(dd)} m más ${dd > 0 ? "gorda" : "fina"} que la ${BT(xs[0])}.</p>`
        : `<p class="small ink2">Entre tandas no hay diferencia medible de carburación.</p>`;
    }
    const det = xs.map(id => {
      const c = M.sessions[id].carburacion;
      return `<div class="tw"><table><thead><tr><th>${xs.length > 1 ? `<span class="dot" style="--c:${COL[id]}"></span>${BT(id)} · ` : ""}Recta antes de</th><th>Largo</th><th>Vel. máx</th><th>RPM antes que vel.</th><th>Desvío</th><th>Pasadas</th></tr></thead><tbody>${
        c.rectas.map(r => `<tr><td>Curva ${r.curva}</td><td>${r.largo} m</td><td>${r.kmh.toFixed(0)} km/h</td><td><b>${sgn(r.delta, 1) || "0"} m</b></td><td>±${r.desvio.toFixed(1)} m</td><td>${r.n}${r.descartadas ? ` <span class="muted">(+${r.descartadas} descartadas)</span>` : ""}</td></tr>`).join("")}</tbody></table></div>`;
    }).join("");
    const semaf = carbVotos(ctx);
    return `<div class="panel carbp"><h2>Carburación</h2>
      <p class="ink2">Tres indicios, sin sensor de escape. Ninguno es absoluto: si dos coinciden, la señal es firme. Confirmalo mirando la bujía y la cabeza del pistón.</p>
      ${semaf}
      <h3 class="carb-h">Lo que sentiste y qué cambiar</h3>${sentiBlock(ctx)}
      <h3 class="carb-h">1 · Pico de RPM contra pico de velocidad</h3>
      <p class="ink2 small">En cada recta: si el pico de RPM llega más de ${U} m antes que el de velocidad, está gordo; si llega más de ${U} m después, fino.</p>
      ${svg}<ul class="why compact carb-l">${lines}</ul>${diff}
      <details class="fold subtle"><summary><span class="small">Detalle por recta y cómo se mide</span></summary><div class="fold-body">${det}
        <p class="note">Se mide en todas las pasadas por cada recta de más de 80 m, solo en la última marcha (un cambio a mitad de recta o la rebajada al frenar dan picos falsos). Los valores fuera de lo normal se descartan (rango intercuartil) y se promedia. Positivo = el pico de RPM llega antes. El ± es el margen del promedio (95%). En marcha fija las RPM y la velocidad van atadas, así que las diferencias suelen ser de pocos metros: comparar tandas con el mismo motor es lo más útil.</p></div></details>
      <h3 class="carb-h">2 · Cómo estira arriba</h3>${estiraBlock(ctx)}
      <h3 class="carb-h">3 · Clima, chicler y temperatura</h3><div class="carb-clima">${climaBlock(ctx)}</div></div>`;
  }

  /* --- indicio 2: cuanto cae la potencia pasado el pico (gordo = no pasa de vueltas) --- */
  const CARRERA_RE = /\b(PRE ?FINAL|FINAL|MANGA|CARRERA|HEAT|RACE)\b/i, NO_CARRERA = /WARM ?UP|PR[AÁ]CTICA|ENTRENA|TEST|LIBRE/i;
  const CARRERA = { test: t => CARRERA_RE.test(t) && !NO_CARRERA.test(t) };
  const mismaRel = (M, a, b) => Math.abs(M.sessions[a].ratio_top - M.sessions[b].ratio_top) / M.sessions[a].ratio_top < 0.015;
  // con ritmo muy distinto (pista mojada, gomas gastadas) las RPM de arriba no dicen nada del carburador
  const ritmoParecido = (ctx, a, b) => Math.abs(ctx.S[a].top[0] / ctx.S[b].top[0] - 1) < 0.025;
  const comparable = (ctx, a, b) => mismaRel(ctx.M, a, b) && ritmoParecido(ctx, a, b);
  function estiraVoto(ctx, id) {
    const { M, REF, IDS } = ctx, e = M.sessions[id].estira;
    if (!e) return null;
    const otros = IDS.filter(x => x != id && M.sessions[x].estira && comparable(ctx, x, id));
    // no llega a estirar: tope de RPM muy por debajo del de las otras tandas con la misma relacion
    const topes = otros.map(x => M.sessions[x].estira.rpm_max);
    if (topes.length && e.rpm_max < Math.min(...topes) - 700) return { v: "rico", txt: `no pasa de ${(e.rpm_max / 1000).toFixed(1)}k rpm (las otras llegan a ${(Math.min(...topes) / 1000).toFixed(1)}k)` };
    if (id == REF || !comparable(ctx, REF, id)) return null;
    // subida de RPM cerca del tope (rpm/s, mediana por vuelta): mas rapido = estira mas = mas fino
    const su = M.sessions[id].sube, sr = M.sessions[REF].sube;
    if (su && sr && sr.med > 0) {
      const d = su.med / sr.med - 1, m = 2 * Math.hypot(su.se, sr.se) / sr.med;
      if (Math.abs(d) < Math.max(0.12, m)) return { v: "ok", txt: `cerca del tope sube igual que la ${ctx.BT(REF)}` };
      return { v: d > 0 ? "pobre" : "rico", txt: `cerca del tope sube ${f0(d * 100)}% ${d > 0 ? "más rápido" : "más lento"} que la ${ctx.BT(REF)}` };
    }
    const r = M.sessions[REF].estira;
    if (e.caida == null || !r || r.caida == null) return null;
    const d = (e.caida - r.caida) * 100, m = 2 * Math.hypot(e.sd || 0.03, r.sd || 0.03) * 100;
    if (Math.abs(d) < Math.max(4, m)) return { v: "ok", txt: "estira igual que la referencia" };
    return { v: d > 0 ? "rico" : "pobre", txt: `estira ${d > 0 ? "menos" : "más"} que la ${ctx.BT(REF)} (${f0(d)} puntos)` };
  }
  function estiraBlock(ctx) {
    const { IDS, M, COL, BT, REF } = ctx, xs = IDS.filter(id => M.sessions[id].estira);
    if (!xs.length) return `<p class="small ink2">No hay suficientes datos acelerando arriba para medirlo.</p>`;
    const li = xs.map(id => {
      const e = M.sessions[id].estira, v = estiraVoto(ctx, id);
      const su = M.sessions[id].sube;
      const base = (su ? `entre ${(su.banda[0] / 1000).toFixed(1)}k y ${(su.banda[1] / 1000).toFixed(1)}k sube <b>${su.med} rpm/s</b> <span class="muted small">(±${2 * su.se} · ${su.n} vueltas)</span> · ` : "") +
        (e.caida == null ? `pico de potencia a ${(e.pico / 1000).toFixed(1)}k, llega hasta ${(e.rpm_max / 1000).toFixed(1)}k`
          : `pico de potencia a ${(e.pico / 1000).toFixed(1)}k, ${e.dr} rpm más arriba cae ${(e.caida * 100).toFixed(0)}%`) +
        (CARRERA.test(ctx.S[id].comment || "") ? `<br><span class="small ink2">Fue carrera: el rebufo también ayuda a estirar arriba.</span>` : "");
      return `<li>${xs.length > 1 ? `<span class="dot" style="--c:${COL[id]}"></span><b>${BT(id)}</b> · ` : ""}${base}${v && v.v != "ok" ? `<br><span class="chip bad">${v.v == "rico" ? "Más gorda" : "Más fina"}</span> <span class="small">${v.txt}</span>` : v ? `<br><span class="small ink2">${v.txt}</span>` : ""}</li>`;
    }).join("");
    const rel = xs.length < 2 ? "" : xs.some(id => !mismaRel(M, REF, id)) ? `<p class="small b">Hay tandas con otra relación de transmisión: el estiramiento no se compara entre ellas.</p>`
      : xs.some(id => !ritmoParecido(ctx, REF, id)) ? `<p class="small b">Hay tandas con un ritmo muy distinto (¿pista mojada?): el estiramiento no se compara entre ellas.</p>` : "";
    return `<p class="ink2 small">Un motor gordo "no pasa de vueltas" y se planta arriba; uno fino estira más (y es el que detona). Se mide cuántas rpm por segundo sube cerca del tope, en la marcha larga y casi en recta, y se compara entre tandas con la misma relación y ritmo parecido.</p><ul class="why compact carb-l">${li}</ul>${rel}`;
  }

  /* --- indicio 3: clima. Un carburador empobrece con aire mas denso: el chicler va con la raiz cuarta de la
     densidad del aire seco (el vapor de agua no aporta oxigeno) --- */
  const rhoSeco = c => { const es = 6.1078 * Math.pow(10, 7.5 * c.T / (c.T + 237.3)), pv = c.RH / 100 * es; return (c.P - pv) * 100 / (287.05 * (c.T + 273.15)); };
  const chiclerDe = s => { const V = (s.setup || {}).valores || {}; if (+V.chicler) return +V.chicler; const t = String(V.carburacion || ""); const m = t.match(/CHICLER\D{0,4}(\d{2,3})/i) || t.match(/\b(1\d\d|2[0-4]\d)\b/); return m ? +m[1] : null; };
  const carbRefKey = s => "kt-carbref-" + (s.kart || "kart").toUpperCase();
  const aguaDe = (ctx, id) => { const s = ctx.S[id], w = s.laps.filter(l => s.top.includes(l.t) && l.agua != null).map(l => l.agua); return w.length ? avg(w) : null; };
  function climaVoto(ctx, id) {
    const s = ctx.S[id], c = (ctx.D.clima || {})[id], ref = store.get(carbRefKey(s), null);
    if (!c || !ref) return null;
    const ratio = rhoSeco(c) / ref.rho;
    if (!ref.chicler) {   // membrana: sin formula de vueltas confiable, solo la direccion
      const dd = ratio - 1;
      return { ratio, membrana: true, d: 0, v: Math.abs(dd) < 0.03 ? "ok" : dd > 0 ? "pobre" : "rico", ref };
    }
    const sug = ref.chicler * Math.pow(ratio, 0.25), uso = chiclerDe(s) || ref.chicler, d = uso - sug;
    return { ratio, sug, uso, propio: !!chiclerDe(s), d, v: d > 1.5 ? "rico" : d < -1.5 ? "pobre" : "ok", ref };
  }
  function climaBlock(ctx) {
    const { IDS, S, COL, BT, D } = ctx, any = IDS.find(id => (D.clima || {})[id]);
    if (!any) return `<p class="small ink2">Sin datos de clima (hace falta internet la primera vez que se abre la tanda).</p>`;
    const ref = store.get(carbRefKey(S[any]), null);
    const li = IDS.filter(id => (D.clima || {})[id]).map(id => {
      const c = D.clima[id], v = climaVoto(ctx, id), ag = aguaDe(ctx, id), cj = chiclerDe(S[id]);
      let t = `${c.T.toFixed(0)} °C · ${c.RH.toFixed(0)}% hum · ${c.P.toFixed(0)} hPa${ag != null ? ` · agua ${ag.toFixed(0)} °C` : ""}${cj ? ` · chicler ${cj}` : ""}`;
      if (v) {
        const dens = (v.ratio - 1) * 100;
        if (v.membrana) {
          t += `<br>Aire ${f1(dens)}% ${dens >= 0 ? "más denso" : "más liviano"} que el día de referencia` + (v.v == "ok" ? ` <span class="chip good">Mismo ajuste</span>`
            : `: con las mismas vueltas queda más ${v.v == "rico" ? "gordo" : "fino"} <span class="chip bad">${v.v == "rico" ? "Cerrá" : "Abrí"} un poco la alta</span>`);
        } else {
          t += `<br>Aire ${f1(dens)}% ${dens >= 0 ? "más denso" : "más liviano"} que el día de referencia: chicler sugerido <b>${v.sug.toFixed(0)}</b>`;
          t += v.v == "ok" ? ` <span class="chip good">En punto</span>` : ` <span class="chip bad">${v.v == "rico" ? "Gordo" : "Fino"}</span> <span class="small">${v.propio ? `con el ${v.uso}` : `si usaste el ${v.uso}`} estás ${f1(v.d)} números ${v.v == "rico" ? "gordo" : "fino"}</span>`;
        }
        if (ag != null && v.ref.agua != null && Math.abs(ag - v.ref.agua) >= 5)
          t += `<br><span class="small ink2">El agua estuvo ${f0(ag - v.ref.agua)} °C ${ag > v.ref.agua ? "más caliente: el motor tiende a afinar (quema más completo y sube el riesgo de detonación)" : "más fría: el motor tiende a engordar"}.</span>`;
      }
      return `<li>${IDS.length > 1 ? `<span class="dot" style="--c:${COL[id]}"></span><b>${BT(id)}</b> · ` : ""}${t}</li>`;
    }).join("");
    const head = ref ? `<p class="small">Referencia: tanda ${esc(ref.tanda)} del ${esc(ref.fecha)}, ${ref.chicler ? `chicler <b>${ref.chicler}</b>` : `baja ${esc(vueltasTxt(ref.baja))} · alta ${esc(vueltasTxt(ref.alta))}`}${ref.agua != null ? `, agua ${ref.agua.toFixed(0)} °C` : ""}. <button class="btn small" data-borrar="1">Quitar referencia</button></p>`
      : `<p class="small">Cargá en "Lo que sentiste" una tanda que anduvo <b>en punto</b> con su chicler (o sus vueltas): pasa a ser la referencia y con el clima de cada día te digo cómo ajustar las demás.</p>`;
    return `<p class="ink2 small">Con el mismo chicler, el carburador empobrece cuando el aire está más denso (frío, presión alta, seco) y engorda cuando está más liviano. El chicler necesario va con la raíz cuarta de la densidad del aire seco: 4% más de densidad ≈ 1% más de chicler (165 → 167).</p>${head}<ul class="why compact carb-l">${li}</ul>`;
  }
  function wireCarb(ctx, root) {
    const panel = root.querySelector(".carbp"); if (!panel) return;
    const redraw = () => { const t = document.createElement("div"); t.innerHTML = carbPanel(ctx); const n = t.firstElementChild; panel.replaceWith(n); wireCarb(ctx, root); };
    panel.addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.borrar) { try { localStorage.removeItem(carbRefKey(ctx.S[ctx.IDS[0]])); } catch (x) { } redraw(); }
      if (b.dataset.senti) {
        const id = b.dataset.senti, s = ctx.S[id];
        carbModal(ctx, id, async vals => {
          const man = Object.assign({}, (s.setup || {}).manual || {});
          for (const k of CARB_KEYS) delete man[k];
          Object.assign(man, vals);
          const r = ctx.saveSetup ? await ctx.saveSetup(s, man) : null;
          if (r && r.error) return r;
          s.setup = s.setup || {}; s.setup.manual = man; s.setup.valores = Object.assign({}, s.setup.auto || {}, man);
          // una tanda "en punto" pasa a ser la referencia de clima del kart
          const c = (ctx.D.clima || {})[id];
          if (vals.sensacion == "en punto" && c && (vals.chicler || vals.alta != null))
            store.set(carbRefKey(s), { chicler: vals.carb_tipo == "cortina" ? vals.chicler : null, baja: vals.baja, alta: vals.alta, tipo: vals.carb_tipo, rho: rhoSeco(c), agua: aguaDe(ctx, id),
              fecha: s.date && s.date.length == 10 ? `${s.date.slice(3, 5)}/${s.date.slice(0, 2)}/${s.date.slice(6)}` : s.date, tanda: ctx.BT(id) });
          redraw();
        });
      }
    });
  }

  /* --- lo que sentiste: tipo de carburador, ajuste, sensacion y detonacion --- */
  const MEMBRANA = /IAME|X30|KA100|\bOK\b|\bKZ|VORTEX|\bTM\b|MODENA|TILLOTSON|IBEA/i;
  const parseVueltas = v => { if (v == null || v === "") return null; if (typeof v == "number") return v; const m = String(v).replace(",", ".").trim().match(/^(\d+(?:\.\d+)?)?\s*(?:(\d+)\/(\d+))?$/); if (!m) return null; return (m[1] ? +m[1] : 0) + (m[2] ? +m[2] / +m[3] : 0); };
  const vueltasTxt = v => { v = parseVueltas(v); if (v == null) return "–"; const n = Math.round(v * 8), e = Math.floor(n / 8), r = n % 8; const fr = ["", "1/8", "1/4", "3/8", "1/2", "5/8", "3/4", "7/8"][r]; return (e ? e + (fr ? " " : "") : "") + (fr || (e ? "" : "0")); };
  function carbInfo(s) {
    const V = (s.setup || {}).valores || {};
    let motor = ""; try { motor = (window.KTK && KTK.get(s.kart).motor) || ""; } catch (e) { }
    const tipo = V.carb_tipo || (MEMBRANA.test(motor + " " + (s.kart || "")) ? "membrana" : "cortina");
    return { tipo, chicler: chiclerDe(s), aguja: V.aguja ?? null, baja: parseVueltas(V.baja), alta: parseVueltas(V.alta), sensacion: V.sensacion || null, donde: V.sensacion_donde || null, detonacion: V.detonacion || null };
  }
  const SENT = { gordo: "rico", fino: "pobre", "en punto": "ok" };
  function coincidencia(ctx, id, sensacion) {
    const v = carbVotosDe(ctx, id).filter(x => x != null), t = SENT[sensacion];
    if (!v.length || !t) return null;
    const opp = t == "rico" ? "pobre" : t == "pobre" ? "rico" : null;
    const a = v.filter(x => x == t).length, c = t == "ok" ? v.filter(x => x != "ok").length : v.filter(x => x == opp).length;
    return a && !c ? { k: "si", txt: `Coincide con los datos (${a} de ${v.length} indicios)` } : c && !a ? { k: "no", txt: "Los datos dicen lo contrario" }
      : a && c ? { k: "mixto", txt: "Los datos están divididos" } : { k: "nada", txt: "Los datos no lo marcan" };
  }
  function datosVer(ctx, id) {
    const v = carbVotosDe(ctx, id), g = v.filter(x => x == "rico").length, f = v.filter(x => x == "pobre").length, o = v.filter(x => x == "ok").length;
    return g >= 2 ? "rico" : f >= 2 ? "pobre" : g && !f ? "rico?" : f && !g ? "pobre?" : g && f ? null : o >= 1 ? "ok" : null;
  }
  // sugerencia de cambio segun lo sentido + los datos
  function sugerencia(ctx, id) {
    const I = carbInfo(ctx.S[id]), dv = datosVer(ctx, id), cort = I.tipo == "cortina", out = [];
    const det = I.detonacion && I.detonacion != "no";
    const engordarArriba = cort ? `chicler <b>+2 a +3 números</b>${I.chicler ? ` (${I.chicler} → ${I.chicler + 2}/${I.chicler + 3})` : ""}` : `abrí la <b>alta 1/8 de vuelta</b>${I.alta != null ? ` (${vueltasTxt(I.alta)} → ${vueltasTxt(I.alta + 0.125)})` : ""}`;
    const afinarArriba = cort ? `chicler <b>−2 números</b>${I.chicler ? ` (${I.chicler} → ${I.chicler - 2})` : ""}` : `cerrá la <b>alta 1/8 de vuelta</b>${I.alta != null ? ` (${vueltasTxt(I.alta)} → ${vueltasTxt(I.alta - 0.125)})` : ""}`;
    const engordarAbajo = cort ? `aguja <b>un punto más rica</b> (clip una ranura más abajo)${I.aguja ? `, hoy en ${esc(I.aguja)}` : ""}` : `abrí la <b>baja 1/8 de vuelta</b>${I.baja != null ? ` (${vueltasTxt(I.baja)} → ${vueltasTxt(I.baja + 0.125)})` : ""}`;
    const afinarAbajo = cort ? `aguja <b>un punto más pobre</b> (clip una ranura más arriba)${I.aguja ? `, hoy en ${esc(I.aguja)}` : ""}` : `cerrá la <b>baja 1/8 de vuelta</b>${I.baja != null ? ` (${vueltasTxt(I.baja)} → ${vueltasTxt(I.baja - 0.125)})` : ""}`;
    if (det) {
      out.push(`<b>Detonó${I.detonacion == "recta" ? " en la recta" : I.detonacion == "curvas" ? " en curvas" : ""}: engordá arriba ya</b> → ${engordarArriba}. Detonar rompe el pistón.`);
      const ev = estiraVoto(ctx, id), ref = store.get(carbRefKey(ctx.S[id]), null), ag = aguaDe(ctx, id);
      const pistas = [];
      if (ev && ev.v == "pobre") pistas.push(`el motor estira más arriba (${ev.txt.replace("cerca del tope ", "")})`);
      if ((dv || "").startsWith("pobre")) pistas.push("los indicios de carburación dan fina");
      if (ag != null && ref && ref.agua != null && ag - ref.agua >= 5) pistas.push(`el agua estuvo ${f0(ag - ref.agua)} °C más caliente que en la referencia`);
      out.push(pistas.length ? `Los datos acompañan: ${pistas.join("; ")}. Todo eso empuja a detonar.` : `Los datos no muestran mezcla fina: si sigue detonando, revisá nafta (octanaje), avance de encendido y squish.`);
      if (CARRERA.test(ctx.S[id].comment || "")) out.push(rebufoTxt);
      return out;
    }
    const ev0 = estiraVoto(ctx, id);
    if (!I.sensacion) {
      const r = dv ? [`Según los datos: ${dv.startsWith("rico") ? "tira a gorda" : dv.startsWith("pobre") ? "tira a fina" : "en punto"}${dv.endsWith("?") ? " (un solo indicio)" : ""}. Cargá lo que sentiste para cruzarlo.`] : [];
      if (ev0 && ev0.v == "pobre" && CARRERA.test(ctx.S[id].comment || "")) r.push(rebufoTxt);
      return r;
    }
    const sent = SENT[I.sensacion] || "ok", co = coincidencia(ctx, id, I.sensacion);
    const coincide = !co || co.k == "nada" ? null : co.k == "si" ? true : co.k == "no" ? false : null;
    const abajo = I.donde == "abajo";
    if (sent == "ok") out.push(co && co.k != "si" && dv && dv != "ok" ? `Sentiste en punto pero hay indicios de mezcla ${dv.startsWith("rico") ? "gorda" : "fina"}: mantené y mirá la bujía.` : "En punto: mantené el ajuste. Con el clima de cada día te digo cómo corregirlo.");
    else {
      const cambio = sent == "rico" ? (abajo ? afinarAbajo : afinarArriba) : (abajo ? engordarAbajo : engordarArriba);
      out.push(`${coincide ? "Coincide con los datos" : coincide === false ? "Los datos no lo confirman: probá de a medio paso" : "Sin datos para confirmar"} → ${cambio}.`);
      if (sent == "pobre") out.push("Fino arriba es riesgoso: ante la duda, engordá.");
    }
    return out;
  }
  const rebufoTxt = "En carrera, con rebufo, el motor pasa más vueltas y va más tiempo a fondo: es cuando más detona. Para carrera conviene ir 2 números más gordo arriba que en clasificación (o 1/8 de vuelta más abierta la alta).";
  // una palabra para el modo simple
  function carbCorto(ctx, id) {
    const I = carbInfo(ctx.S[id]);
    if (I.detonacion && I.detonacion != "no") return "con detonación";
    const v = datosVer(ctx, id);
    return v == null ? null : v == "ok" ? "en punto" : v.startsWith("rico") ? "tira a gorda" : "tira a fina";
  }
  function sentiBlock(ctx) {
    const { IDS, S, COL, BT } = ctx;
    const li = IDS.map(id => {
      const I = carbInfo(S[id]), dv = datosVer(ctx, id);
      const aj = I.tipo == "cortina" ? [I.chicler ? `chicler ${I.chicler}` : "", I.aguja ? `aguja ${esc(I.aguja)}` : ""].filter(Boolean).join(" · ")
        : [I.baja != null ? `baja ${vueltasTxt(I.baja)}` : "", I.alta != null ? `alta ${vueltasTxt(I.alta)}` : ""].filter(Boolean).join(" · ");
      const sentTxt = I.sensacion ? `Sentiste <b>${esc(I.sensacion)}</b>${I.donde ? ` ${I.donde == "todo" ? "en todo el rango" : I.donde}` : ""}` : `<span class="muted">Sin cargar lo que sentiste</span>`;
      const detTxt = I.detonacion && I.detonacion != "no" ? ` · <span class="chip bad">Detonó: ${esc(I.detonacion)}</span>` : "";
      const co = I.sensacion ? coincidencia(ctx, id, I.sensacion) : null;
      const coinc = co ? `<span class="chip ${co.k == "si" ? "good" : co.k == "no" ? "bad" : ""}">${co.txt}</span>` : "";
      const sug = sugerencia(ctx, id);
      return `<li>${IDS.length > 1 ? `<span class="dot" style="--c:${COL[id]}"></span><b>${BT(id)}</b> · ` : ""}${sentTxt}${detTxt} ${coinc}
        <span class="small ink2">· carburador a ${I.tipo}${aj ? " · " + aj : ""}</span>
        ${sug.length ? `<div class="carb-sug">${sug.map(x => `<p class="small">${x}</p>`).join("")}</div>` : ""}
        ${ctx.saveSetup ? `<div class="carb-ref"><button class="btn small" data-senti="${esc(id)}">${I.sensacion || I.detonacion ? "Editar" : "Cargar"} lo que sentiste</button></div>` : ""}</li>`;
    }).join("");
    return `<ul class="why compact carb-l">${li}</ul>`;
  }
  function carbModal(ctx, id, onSave) {
    const s = ctx.S[id], I = carbInfo(s);
    const seg = (name, opts, val) => `<div class="seg" role="radiogroup">${opts.map(([v, l]) => `<label><input type="radio" name="${name}" value="${v}" ${val == v ? "checked" : ""}><span>${l}</span></label>`).join("")}</div>`;
    const d = document.createElement("div"); d.className = "modal";
    d.innerHTML = `<form class="mbox" role="dialog" aria-modal="true" aria-labelledby="cm-t"><h2 id="cm-t">Carburación · ${esc(ctx.BT(id))} · ${esc(s.hour)}</h2>
      <label class="cm-row"><span>Carburador</span>${seg("tipo", [["cortina", "A cortina (Rotax)"], ["membrana", "A membrana (IAME, OK)"]], I.tipo)}</label>
      <div class="cm-cort sgrid"><label><span>Chicler</span><input id="cm-ch" inputmode="numeric" value="${esc(I.chicler ?? "")}"></label><label><span>Aguja <span class="muted">(ranura del clip)</span></span><input id="cm-ag" value="${esc(I.aguja ?? "")}"></label></div>
      <div class="cm-memb sgrid"><label><span>Baja <span class="muted">(vueltas, ej. 1 3/4)</span></span><input id="cm-ba" value="${I.baja != null ? vueltasTxt(I.baja) : ""}"></label><label><span>Alta <span class="muted">(vueltas)</span></span><input id="cm-al" value="${I.alta != null ? vueltasTxt(I.alta) : ""}"></label></div>
      <label class="cm-row"><span>¿Cómo lo sentiste?</span>${seg("sen", [["gordo", "Gordo"], ["en punto", "En punto"], ["fino", "Fino"]], I.sensacion)}</label>
      <label class="cm-row"><span>¿Dónde?</span>${seg("don", [["abajo", "Abajo (salida de curva)"], ["arriba", "Arriba (final de recta)"], ["todo", "En todo"]], I.donde)}</label>
      <label class="cm-row"><span>¿Detonó?</span>${seg("det", [["no", "No"], ["recta", "En recta"], ["curvas", "En curvas"], ["ambas", "En las dos"]], I.detonacion || "no")}</label>
      <p class="small" id="cm-msg"></p>
      <div class="mact"><button type="button" class="btn" id="cm-x">Cancelar</button><button type="submit" class="btn primary">Guardar</button></div></form>`;
    document.body.appendChild(d);
    const tipo = () => d.querySelector('input[name="tipo"]:checked').value;
    const sync = () => { d.querySelector(".cm-cort").hidden = tipo() != "cortina"; d.querySelector(".cm-memb").hidden = tipo() != "membrana"; };
    d.querySelectorAll('input[name="tipo"]').forEach(x => x.addEventListener("change", sync)); sync();
    d.querySelector("#cm-x").addEventListener("click", () => d.remove());
    d.querySelector("form").addEventListener("submit", async e => {
      e.preventDefault();
      const val = n => (d.querySelector(`input[name="${n}"]:checked`) || {}).value || null, msg = d.querySelector("#cm-msg");
      const v = { carb_tipo: tipo(), sensacion: val("sen"), sensacion_donde: val("don"), detonacion: val("det") };
      if (tipo() == "cortina") {
        const ch = d.querySelector("#cm-ch").value.trim(), ag = d.querySelector("#cm-ag").value.trim();
        if (ch) { if (!(+ch >= 80 && +ch <= 260)) { msg.className = "small b"; msg.textContent = "El chicler tiene que ser un número (por ejemplo 165)."; return; } v.chicler = +ch; }
        if (ag) v.aguja = ag;
      } else {
        for (const [k, sel] of [["baja", "#cm-ba"], ["alta", "#cm-al"]]) {
          const t = d.querySelector(sel).value.trim(); if (!t) continue;
          const n = parseVueltas(t); if (n == null || n < 0 || n > 6) { msg.className = "small b"; msg.textContent = `No entiendo las vueltas de ${k}: escribilo como 1 3/4 o 1.75.`; return; }
          v[k] = Math.round(n * 8) / 8;
        }
      }
      for (const k of Object.keys(v)) if (v[k] == null) delete v[k];
      const r = await onSave(v);
      if (r && r.error) { msg.className = "small b"; msg.textContent = r.error; return; }
      d.remove();
    });
  }
  /* --- resumen: los tres indicios por tanda --- */
  function carbVotosDe(ctx, id) {
    const c = ctx.M.sessions[id].carburacion, e = estiraVoto(ctx, id), k = climaVoto(ctx, id);
    return [c && !c.pocos ? c.estado : null, e ? e.v : null, k ? k.v : null];
  }
  function carbVotos(ctx) {
    const { IDS, M, COL, BT } = ctx;
    const rows = IDS.map(id => {
      const v = carbVotosDe(ctx, id);
      const chip = (x, n) => x == null ? `<span class="chip">${n}: –</span>` : `<span class="chip ${x == "ok" ? "good" : "bad"}">${n}: ${x == "ok" ? "en punto" : x == "rico" ? "gordo" : "fino"}</span>`;
      const g = v.filter(x => x == "rico").length, f = v.filter(x => x == "pobre").length, n = v.filter(x => x != null).length, o = v.filter(x => x == "ok").length;
      const one = v.find(x => x != null), lbl = x => x == "ok" ? "en punto" : x == "rico" ? "gorda" : "fina";
      const res = g >= 2 ? `<b>Gorda</b>: coinciden ${g} indicios` : f >= 2 ? `<b>Fina</b>: coinciden ${f} indicios` : g && f ? "Los indicios no coinciden"
        : g ? "<b>Tira a gorda</b> (1 indicio)" : f ? "<b>Tira a fina</b> (1 indicio)" : o >= 2 ? "<b>En punto</b>" : n == 1 ? `Un solo indicio: ${lbl(one)}` : "Sin datos";
      return `<li>${IDS.length > 1 ? `<span class="dot" style="--c:${COL[id]}"></span><b>${BT(id)}</b> · ` : ""}${res}<br>${chip(v[0], "Picos")} ${chip(v[1], "Estira")} ${chip(v[2], "Clima")}</li>`;
    }).join("");
    return `<ul class="why compact carb-sem">${rows}</ul>`;
  }

  function powerPanel(ctx) {
    return `<div class="panel"><div class="sec-head"><h2>Curva de potencia</h2>
        <details class="settings pp"><summary>Ajustes del cálculo</summary><div class="opts">
          <label for="pp-cda">Área aerodinámica CdA (m²)</label><input id="pp-cda" type="number" step="0.01">
          <label for="pp-crr">Rodadura</label><input id="pp-crr" type="number" step="0.001"></div></details></div>
      <p class="ink2">Potencia estimada en la rueda a cada régimen, usando todas las vueltas de la tanda (acelerando y casi en recta, 1ra y 2da juntas). La densidad del aire sale del clima de cada tanda. Sirve para comparar tandas: el valor absoluto puede errar ±10–15%.</p>
      <div class="pp-peso"><label for="pp-m"><b>Peso kart + piloto</b> (kg, listo para correr)</label><input id="pp-m" type="number" step="1" min="60" max="250"><span class="small ink2 pp-hint"></span></div>
      <div class="legend pp-leg" style="margin:6px 0"></div>
      <svg class="pow" viewBox="0 0 1200 420"></svg><div class="readout pp-ro">Pasá el mouse por la curva</div>
      <div class="mcards pp-cards" style="margin-top:12px"></div></div>`;
  }
  function drawPower(ctx, root) {
    const { D, IDS, S, COL, NAME, M } = ctx, svg = root.querySelector(".pow"); if (!svg) return;
    const st = store.get("kt-pot", {});
    const inp = { m: root.querySelector("#pp-m"), cda: root.querySelector("#pp-cda"), crr: root.querySelector("#pp-crr") };
    const p0 = powerParams(ctx, IDS[0]), s0 = S[IDS[0]], cat = pesoCat(s0.kart);
    inp.m.value = p0.m; inp.cda.value = p0.cda; inp.crr.value = p0.crr;
    root.querySelector(".pp-hint").textContent = cat ? `Sugerido para ${s0.kart}: ${cat} kg (peso mínimo de la categoría; si tu torneo usa otro, cambialo).` : "No reconozco la categoría del kart: cargá el peso real para que los HP sean correctos.";
    const redraw = () => {
      store.set("kt-pot", { cda: +inp.cda.value || 0.55, crr: +inp.crr.value || 0.025 });
      if (+inp.m.value) store.set(pesoKey(s0), +inp.m.value);
      svg.innerHTML = "";
      const curves = IDS.map(id => { const P = Object.assign(powerParams(ctx, id), { m: +inp.m.value || 175 }); return { id, P, pts: powerCurve(M.sessions[id].potencia).map(b => ({ rpm: b.rpm, hp: powerOf(b, P), b })) }; }).filter(c => c.pts.length >= 3);
      if (!curves.length) { txt(svg, 600, 210, "No hay suficientes datos acelerando para armar la curva", { "text-anchor": "middle" }); return; }
      const all = curves.flatMap(c => c.pts), PL = 70, PR = 20, PT = 16, PB = 36, W = 1200, H = 420;
      const x0 = Math.floor(Math.min(...all.map(p => p.rpm)) / 1000) * 1000, x1 = Math.ceil(Math.max(...all.map(p => p.rpm)) / 1000) * 1000;
      const y0 = Math.floor(Math.min(...all.map(p => p.hp)) / 5) * 5 - 5, y1 = Math.ceil(Math.max(...all.map(p => p.hp)) / 5) * 5 + 2;
      const X = v => PL + (v - x0) / (x1 - x0) * (W - PL - PR), Y = v => PT + (1 - (v - y0) / (y1 - y0)) * (H - PT - PB);
      for (let v = y0; v <= y1; v += 5) { el("line", { x1: PL, x2: W - PR, y1: Y(v), y2: Y(v), stroke: "var(--grid)" }, svg); txt(svg, PL - 8, Y(v) + 4, v + " HP", { "text-anchor": "end" }); }
      for (let v = x0; v <= x1; v += 1000) txt(svg, X(v), H - 12, (v / 1000) + "k", { "text-anchor": "middle" });
      txt(svg, PL - 30, H - 12, "rpm", { "text-anchor": "end" });
      const cards = [];
      for (const c of curves) {
        const pk = c.pts.reduce((a, p) => p.hp > a.hp ? p : a), band = c.pts.filter(p => p.hp >= pk.hp * 0.9);
        el("rect", { x: X(band[0].rpm), y: PT, width: Math.max(2, X(band[band.length - 1].rpm) - X(band[0].rpm)), height: H - PT - PB, fill: COL[c.id], opacity: 0.06 }, svg);
        el("polyline", { points: c.pts.map(p => X(p.rpm).toFixed(1) + "," + Y(p.hp).toFixed(1)).join(" "), fill: "none", stroke: COL[c.id], "stroke-width": 3, "stroke-linejoin": "round" }, svg);
        for (const p of c.pts) { const d = el("circle", { cx: X(p.rpm), cy: Y(p.hp), r: 3.5, fill: COL[c.id] }, svg); el("title", {}, d).textContent = `${NAME(c.id)} · ${Math.round(p.rpm)} rpm: ${p.hp.toFixed(1)} HP (${(p.b.v * 3.6).toFixed(0)} km/h)`; }
        el("circle", { cx: X(pk.rpm), cy: Y(pk.hp), r: 7, fill: "none", stroke: COL[c.id], "stroke-width": 2 }, svg);
        txt(svg, X(pk.rpm), Y(pk.hp) - 12, `${pk.hp.toFixed(1)} HP`, { "text-anchor": "middle", style: `fill:${COL[c.id]};font-weight:700;font-size:14px` });
        cards.push(`<div class="mc"><div class="eyebrow" style="color:${COL[c.id]}">${NAME(c.id)}</div><div class="v">${pk.hp.toFixed(1)} HP</div>
          <div class="s" title="Rinde 90% o más del máximo en esa banda. Aire ${c.P.rho.toFixed(3)} kg/m³">a ${Math.round(pk.rpm)} rpm · banda ${(band[0].rpm / 1000).toFixed(1)}k–${(band[band.length - 1].rpm / 1000).toFixed(1)}k</div></div>`);
      }
      root.querySelector(".pp-cards").innerHTML = cards.join("");
      root.querySelector(".pp-leg").innerHTML = curves.map(c => `<span style="--c:${COL[c.id]}">${esc(NAME(c.id))}</span>`).join("") + `<span style="--c:var(--muted)">zona sombreada: banda de potencia (90% del máximo)</span>`;
      const cross = el("line", { y1: PT, y2: H - PB, stroke: "var(--ink2)", opacity: 0 }, svg), hit = el("rect", { x: PL, y: 0, width: W - PL - PR, height: H, fill: "transparent" }, svg);
      hit.addEventListener("pointermove", e => {
        const r = svg.getBoundingClientRect(), vx = (e.clientX - r.left) / r.width * W, rpm = x0 + (vx - PL) / (W - PL - PR) * (x1 - x0);
        cross.setAttribute("x1", vx); cross.setAttribute("x2", vx); cross.setAttribute("opacity", 1);
        root.querySelector(".pp-ro").innerHTML = `${Math.round(rpm)} rpm · ` + curves.map(c => { const p = c.pts.reduce((a, q) => Math.abs(q.rpm - rpm) < Math.abs(a.rpm - rpm) ? q : a); return `<span style="color:${COL[c.id]}">●</span> ${Math.abs(p.rpm - rpm) < 200 ? p.hp.toFixed(1) + " HP" : "–"}`; }).join(" · ");
      });
      hit.addEventListener("pointerleave", () => cross.setAttribute("opacity", 0));
    };
    Object.values(inp).forEach(i => i.addEventListener("change", redraw));
    redraw();
  }
  // diferencia de potencia en HP aproximada a partir del % de aceleracion
  function hpDelta(ctx, id, pct) {
    const P = powerParams(ctx, ctx.REF), pts = powerCurve(ctx.M.sessions[ctx.REF].potencia);
    if (!pts.length) return null;
    const accPow = avg(pts.map(b => P.m * b.acc * 9.81 * b.v / 745.7));
    return accPow * pct / 100;
  }

  /* ---------- transmision ---------- */
  // la relacion se recuerda por circuito (por ubicacion GPS), porque cambia de pista en pista
  const trKey = s => `kt-trans-${s.lat0 != null ? s.lat0.toFixed(2) + "_" + s.lon0.toFixed(2) : s.venue || "pista"}`;
  function transPane(ctx) {
    const { IDS, S, COL, NAME, M } = ctx;
    return `<div class="panel"><h2>Relación de transmisión</h2>
      <p class="ink2">Cargá el piñón y la corona que usaste en esta tanda (si están en el setup o en el comentario ya aparecen) y las RPM que querés tener al final de la recta más rápida. La app calcula qué corona te deja ahí. Se recuerda por circuito.</p>
      ${IDS.map(id => {
        const s = S[id], V = (s.setup || {}).valores || {}, tr = M.sessions[id].transmision, st = store.get(trKey(s), {});
        const longest = tr.fin_recta.reduce((a, b) => b.kmh > a.kmh ? b : a, tr.fin_recta[0] || { rpm: 0, kmh: 0 });
        const slow = tr.curvas.reduce((a, b) => b.rpm < a.rpm ? b : a, tr.curvas[0] || { rpm: 0, kmh: 0, curva: 0 });
        return `<div class="trbox" data-id="${id}" data-top="${longest.rpm}" data-low="${slow.rpm}">
          <div class="eyebrow" style="color:${COL[id]};margin:14px 0 8px">${NAME(id)}</div>
          <div class="trin">
            <label>Piñón <input class="tr-p" type="number" value="${esc(V.pinon ?? st.p ?? "")}" placeholder="dientes"></label>
            <label>Corona <input class="tr-c" type="number" value="${esc(V.corona ?? st.c ?? "")}" placeholder="dientes"></label>
            <label>RPM objetivo al final de la recta más larga <input class="tr-t" type="number" step="100" value="${esc(st.t ?? 13900)}"></label>
          </div>
          <div class="tw"><table><thead><tr><th>Dónde</th><th>RPM</th><th>km/h</th></tr></thead><tbody>
            ${tr.fin_recta.map(f => `<tr><td>Final de recta antes de la curva ${f.curva}${f === longest ? " <span class='chip'>la más rápida</span>" : ""}</td><td>${f.rpm}</td><td>${f.kmh}</td></tr>`).join("")}
            ${tr.curvas.map(c => `<tr><td>Mínimo en curva ${c.curva}${c === slow ? " <span class='chip'>la más lenta</span>" : ""} (${c.marcha == 1 ? "1ra" : c.marcha == 2 ? "2da" : "–"})</td><td>${c.rpm}</td><td>${c.kmh}</td></tr>`).join("")}
            <tr class="first"><td>Régimen tope (99.5% de la tanda)</td><td>${tr.rpm_tope}</td><td></td></tr>
            <tr><td>Tiempo arriba de 13.800 rpm</td><td>${tr.pct_sobre_13800}%</td><td></td></tr>
          </tbody></table></div>
          <div class="todo tr-out" style="margin-top:10px"></div></div>`;
      }).join("")}</div>`;
  }
  function wireTrans(ctx, root) {
    root.querySelectorAll(".trbox").forEach(box => {
      const id = box.dataset.id, top = +box.dataset.top, low = +box.dataset.low, pIn = box.querySelector(".tr-p"), cIn = box.querySelector(".tr-c"), tIn = box.querySelector(".tr-t");
      const pts = powerCurve(ctx.M.sessions[id].potencia), P = powerParams(ctx, id);
      let bandLo = null, bandHi = null;
      if (pts.length) { const hp = pts.map(b => powerOf(b, P)), pk = Math.max(...hp); const band = pts.filter((b, i) => hp[i] >= pk * 0.9); bandLo = band[0].rpm; bandHi = band[band.length - 1].rpm; }
      const calc = () => {
        store.set(trKey(ctx.S[id]), { p: pIn.value, c: cIn.value, t: tIn.value });
        const p = +pIn.value, c = +cIn.value, t = +tIn.value || 13900, out = box.querySelector(".tr-out");
        const k = t / top; // cuanto tendria que cambiar la relacion
        let h = `<div class="eyebrow">Sugerencia</div><ul>`;
        if (Math.abs(k - 1) < 0.008) h += `<li>Al final de la recta más rápida llegás a ${top} rpm, prácticamente el objetivo (${t}). La relación está bien para esta pista.</li>`;
        else h += `<li>Al final de la recta más rápida llegás a <b>${top} rpm</b>; para llegar a <b>${t}</b> la relación tiene que ser ${f1((k - 1) * 100)}% más ${k > 1 ? "corta (más corona)" : "larga (menos corona)"}.</li>`;
        if (p && c) {
          const cNew = c * k, cR = Math.round(cNew);
          h += `<li>Con piñón ${p}: corona <b>${cR}</b> (${sgn(cR - c, 0)} dientes; exacto ${cNew.toFixed(1)}). ${cR != c ? `Con ${cR} llegarías a unas ${Math.round(top * cR / c)} rpm al final de la recta y la curva más lenta quedaría en ${Math.round(low * cR / c)} rpm.` : ""}</li>`;
        } else h += `<li class="muted">Cargá piñón y corona (o completalos en el setup de la tanda) para ver la sugerencia en dientes.</li>`;
        if (bandLo) h += `<li>Tu banda de potencia (90% del máximo) va de ${(bandLo / 1000).toFixed(1)}k a ${(bandHi / 1000).toFixed(1)}k rpm. En la curva más lenta bajás a ${low} rpm${low < bandLo ? `: por debajo de la banda, la salida va a ser floja. Una corona más grande ayuda ahí, pero acorta la recta` : `: dentro de la banda, bien`}.</li>`;
        out.innerHTML = h + `</ul>`;
      };
      [pIn, cIn, tIn].forEach(i => i.addEventListener("input", calc));
      calc();
    });
  }

  /* ---------- sensores ---------- */
  function sensorsPane(ctx) {
    const { IDS, S, COL, NAME } = ctx;
    const names = [...new Set(IDS.flatMap(id => (S[id].sensores || []).map(x => x.nombre)))];
    const nice = n => SENSOR_NAMES[n] || n;
    const unit = (u, n) => (u == "C" || /Temp/.test(n) ? "°C" : u || "");
    let h = `<div class="panel"><h2>Sensores</h2><p class="ink2">Todo lo que registró la MyChron además de GPS y RPM, en las vueltas analizadas.</p>
      <div class="tw"><table><thead><tr><th>Sensor</th>${IDS.map(id => `<th><span class="dot" style="--c:${COL[id]}"></span>${NAME(id)}</th>`).join("")}</tr></thead><tbody>`;
    for (const n of names) {
      h += `<tr><td>${esc(nice(n))}</td>` + IDS.map(id => {
        const x = (S[id].sensores || []).find(y => y.nombre == n);
        if (!x) return `<td class="muted">–</td>`;
        if (x.estado != "ok") return `<td class="muted">sin datos</td>`;
        return `<td>${x.prom} <span class="muted">${unit(x.unidad, n)} (${x.min}–${x.max})</span></td>`;
      }).join("") + `</tr>`;
    }
    h += `</tbody></table></div>`;
    const missing = names.filter(n => /Temp TC|Temp TR/.test(n) && IDS.every(id => ((S[id].sensores || []).find(y => y.nombre == n) || {}).estado != "ok"));
    if (missing.length) h += `<p class="note" style="margin-top:10px">${missing.map(nice).join(", ")}: el canal existe pero no tiene datos. Si conectás la termocupla de escape, la app puede analizar la carburación (la temperatura de escape es el mejor indicador de mezcla).</p>`;
    h += `<h3 style="margin-top:16px">Temperatura de agua por vuelta</h3><svg class="water" viewBox="0 0 1200 260"></svg></div>`;
    return h;
  }
  function drawWater(ctx, root) {
    const { IDS, S, COL } = ctx, svg = root.querySelector(".water"); if (!svg) return;
    const series = IDS.map(id => ({ id, p: (((S[id].sensores || []).find(y => y.nombre == "Water Temp") || {}).por_vuelta || []) })).filter(s => s.p.length);
    if (!series.length) { txt(svg, 600, 130, "Sin datos de temperatura de agua", { "text-anchor": "middle" }); return; }
    const all = series.flatMap(s => s.p), PL = 70, PR = 20, PT = 14, PB = 32, W = 1200, H = 260;
    const nmax = Math.max(...all.map(p => p.lap)), y0 = Math.floor(Math.min(...all.map(p => p.prom)) / 5) * 5, y1 = Math.ceil(Math.max(...all.map(p => p.max)) / 5) * 5;
    const X = n => PL + (n - 1) / Math.max(nmax - 1, 1) * (W - PL - PR), Y = v => PT + (1 - (v - y0) / Math.max(y1 - y0, 1)) * (H - PT - PB);
    for (let v = y0; v <= y1; v += 5) { el("line", { x1: PL, x2: W - PR, y1: Y(v), y2: Y(v), stroke: "var(--grid)" }, svg); txt(svg, PL - 8, Y(v) + 4, v + " °C", { "text-anchor": "end" }); }
    for (let n = 1; n <= nmax; n++) if (nmax <= 20 || n % 2) txt(svg, X(n), H - 10, "V" + n, { "text-anchor": "middle" });
    el("rect", { x: PL, y: Y(Math.min(55, y1)), width: W - PL - PR, height: Math.max(0, Y(Math.max(45, y0)) - Y(Math.min(55, y1))), fill: "var(--good)", opacity: 0.06 }, svg);
    for (const s of series) {
      el("polyline", { points: s.p.map(p => X(p.lap).toFixed(1) + "," + Y(p.prom).toFixed(1)).join(" "), fill: "none", stroke: COL[s.id], "stroke-width": 2.5 }, svg);
      for (const p of s.p) { const d = el("circle", { cx: X(p.lap), cy: Y(p.prom), r: 4, fill: COL[s.id] }, svg); el("title", {}, d).textContent = `Vuelta ${p.lap}: ${p.prom} °C (máx ${p.max})`; }
    }
    txt(svg, W - PR, Y(Math.min(55, y1)) - 4, "zona verde: 45–55 °C", { "text-anchor": "end" });
  }

  /* ---------- video ---------- */
  const esVideo = f => /^video\//.test(f.type) || /\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(f.name);
  // carga un archivo en el recuadro de video de una tanda, como si lo hubiera elegido con el botón
  function cargarVideo(box, f) {
    const input = box.querySelector("input[type=file]"); if (!input) return false;
    const dt = new DataTransfer(); dt.items.add(f); input.files = dt.files;
    input.dispatchEvent(new Event("change"));
    return true;
  }
  // FFT radix-2 (in-place) para estimar el tono del motor
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]];[im[i], im[j]] = [im[j], im[i]]; } }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let j = 0; j < len / 2; j++) { const a = i + j, b = a + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr; re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } }
    }
  }
  // Espectro del audio del video cada 0.1 s (normalizado por cuadro)
  async function audioSpectrum(file, onStatus) {
    onStatus("Leyendo el audio del video…");
    const buf = await file.arrayBuffer();
    const ac = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 44100, 44100);
    const audio = await ac.decodeAudioData(buf);
    const sr = audio.sampleRate, x = audio.getChannelData(0), N = 8192, hop = Math.round(sr * 0.1), frames = [];
    onStatus("Analizando el sonido del motor…");
    const win = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)));
    const k0 = Math.round(60 * N / sr), k1 = Math.round(1200 * N / sr);
    for (let p = 0; p + N < x.length; p += hop) {
      const re = new Float64Array(N), im = new Float64Array(N);
      for (let i = 0; i < N; i++) re[i] = x[p + i] * win[i];
      fft(re, im);
      const mag = new Float32Array(k1 + 1); let m = 0;
      for (let k = 0; k <= k1; k++) { mag[k] = Math.hypot(re[k], im[k]); if (k >= k0) m += mag[k]; }
      m = m / (k1 - k0 + 1) || 1;
      for (let k = 0; k <= k1; k++) mag[k] /= m;
      frames.push(mag);
      if (frames.length % 100 == 0) await new Promise(r => setTimeout(r, 0));
    }
    return { frames, sr, N, k1 };
  }
  // Busca en que momento de la tanda el sonido tiene energia en las frecuencias del motor segun las RPM de la MyChron
  // (2 tiempos, 1 cilindro: suena a RPM/60 Hz y armonicos). Devuelve offset (s de sesion en t=0 del video).
  function spectralSync(spec, serie, lapPref) {
    const { frames, sr, N, k1 } = spec, nf = frames.length, S = serie.rpm, t0 = serie.t0 / 1000;
    const score = new Float32Array(Math.max(0, S.length - nf)).fill(-1);
    for (let i = 0; i < score.length; i++) {
      let ok = 0, tot = 0;
      for (let j = 0; j < nf; j++) {
        const r = S[i + j]; if (r < 5000) continue; ok++;
        const f = frames[j];
        for (let h = 1; h <= 4; h++) { const k = Math.round(r / 60 * h * N / sr); if (k <= k1) tot += f[k] / h; }
      }
      if (ok >= 0.7 * nf) score[i] = tot / ok;
    }
    // mejor candidato por vuelta (la vuelta que contiene la mitad del video)
    const byLap = {};
    for (let i = 0; i < score.length; i++) {
      if (score[i] < 0) continue;
      const lap = serie.lap[Math.min(S.length - 1, i + Math.round(nf / 2))];
      if (!lap) continue;
      if (!byLap[lap] || score[i] > byLap[lap].s) byLap[lap] = { s: score[i], i };
    }
    const ranked = Object.entries(byLap).map(([lap, v]) => ({ lap: +lap, s: v.s, off: t0 + v.i * 0.1 })).sort((a, b) => b.s - a.s);
    if (!ranked.length) return null;
    const pick = lapPref != null ? (ranked.find(r => r.lap == lapPref) || ranked[0]) : ranked[0];
    const second = ranked.find(r => r.lap != pick.lap);
    return { off: pick.off, lap: pick.lap, conf: second ? pick.s / second.s : 2, ranked };
  }
  function videoPane(ctx) {
    const { IDS, COL, NAME, S } = ctx;
    return `<div class="panel"><h2>Video sincronizado</h2>
      <p class="ink2">Cargá el video onboard de cada tanda (recortado a una vuelta o completo). La app lo sincroniza sola escuchando el motor y comparando con las RPM de la MyChron. Si no lo logra, sincronizalo a mano: pausá el video justo cuando pasás por un punto, elegí ese punto y tocá "Sincronizar acá".</p>
      <div class="vgrid">${IDS.map(id => `<div class="vbox" data-id="${id}">
        <div class="eyebrow" style="color:${COL[id]}">${NAME(id)}</div>
        <label class="btn vload">Elegir video… <input type="file" accept="video/mp4,video/*" hidden></label>
        <video controls playsinline preload="metadata" hidden></video>
        <div class="vhud" hidden><span class="h-lap"></span><span class="h-v"></span><span class="h-rpm"></span></div>
        <div class="vsync" hidden>
          <div class="vrow"><select class="vlap"><option value="">Vuelta del video: detectar sola</option></select><button class="btn vauto">Sincronizar por sonido</button></div>
          <div class="vrow"><span class="vstat small ink2"></span></div>
          <div class="vrow"><select class="vpoint"></select><button class="btn vmark">Sincronizar acá</button></div>
          <div class="vrow"><label class="small ink2">Ajuste fino <input class="vfine" type="range" min="-3" max="3" step="0.05" value="0"></label><span class="vfv small num">0.00 s</span></div>
        </div></div>`).join("")}</div>
      ${IDS.length > 1 ? `<label class="toggle" style="margin-top:12px"><input type="checkbox" class="vlink" checked><span>Mover juntos los videos por posición en la pista (para comparar la misma curva)</span></label>` : ""}
      <div class="vmapwrap"><svg class="vmap" viewBox="0 0 300 340"></svg></div></div>`;
  }
  function wireVideo(ctx, root) {
    const { D, IDS, S, COL } = ctx, tx = D.track.x, ty = D.track.y, L = D.track.L;
    const minx = Math.min(...tx), maxx = Math.max(...tx), miny = Math.min(...ty), maxy = Math.max(...ty), k2 = Math.min(260 / (maxx - minx), 300 / (maxy - miny));
    const MX = x => 20 + (x - minx) * k2, MY = y => 20 + (maxy - y) * k2, idxAt = s => Math.min(tx.length - 1, Math.max(0, Math.round(s / L * (tx.length - 1))));
    const map = root.querySelector(".vmap");
    el("polyline", { points: tx.map((x, i) => MX(x).toFixed(1) + "," + MY(ty[i]).toFixed(1)).join(" "), fill: "none", stroke: "var(--ink2)", "stroke-width": 2, "stroke-linejoin": "round" }, map);
    for (const c of D.corners) { const i = idxAt(c.sa); el("circle", { cx: MX(tx[i]), cy: MY(ty[i]), r: 9, fill: "var(--panel)", stroke: "var(--ink2)" }, map); txt(map, MX(tx[i]), MY(ty[i]) + 4, c.n, { "text-anchor": "middle", style: "fill:var(--ink)" }); }
    const dots = Object.fromEntries(IDS.map(id => [id, el("circle", { r: 7, fill: COL[id], stroke: "var(--panel)", "stroke-width": 2, opacity: 0 }, map)]));
    const state = {};
    const atTime = (serie, tSes) => { const i = Math.max(0, Math.min(serie.rpm.length - 1, Math.round((tSes * 1000 - serie.t0) / 100))); return { i, rpm: serie.rpm[i], kmh: serie.kmh[i], lap: serie.lap[i], s: serie.s ? serie.s[i] : null }; };
    root.querySelectorAll(".vbox").forEach(box => {
      const id = box.dataset.id, serie = S[id].serie, video = box.querySelector("video"), file = box.querySelector("input[type=file]");
      if (!serie) { box.querySelector(".vload").outerHTML = `<p class="muted small">Esta tanda no tiene datos suficientes para sincronizar.</p>`; return; }
      const st = state[id] = { offset: null, fine: 0, key: null };
      const sel = box.querySelector(".vpoint");
      const laps = serie.laps.filter(l => l.num > 0);
      box.querySelector(".vlap").insertAdjacentHTML("beforeend", laps.map(l => `<option value="${l.num}">Vuelta ${l.num} · ${tVuelta(l.time)}</option>`).join(""));
      sel.innerHTML = laps.map(l => `<option value="line:${l.num}">Línea de la MyChron · inicio vuelta ${l.num} (${tVuelta(l.time)})</option>`).join("") +
        laps.flatMap(l => D.corners.map(c => `<option value="apex:${l.num}:${c.n}">Vértice curva ${c.n} · vuelta ${l.num}</option>`)).join("");
      const setOffset = (o, why) => {
        st.offset = o; store.set(st.key, { offset: o, fine: st.fine });
        box.querySelector(".vstat").textContent = why; tick();
      };
      const tick = () => {
        if (st.offset == null) return;
        const tSes = video.currentTime + st.offset + st.fine, p = atTime(serie, tSes);
        box.querySelector(".vhud").hidden = false;
        box.querySelector(".h-lap").textContent = p.lap ? `Vuelta ${p.lap}` : "Boxes";
        box.querySelector(".h-v").textContent = `${p.kmh.toFixed(0)} km/h`;
        box.querySelector(".h-rpm").textContent = `${p.rpm} rpm`;
        if (p.s != null) { const i = idxAt(p.s); dots[id].setAttribute("cx", MX(tx[i])); dots[id].setAttribute("cy", MY(ty[i])); dots[id].setAttribute("opacity", 1); }
        return p;
      };
      // también se puede soltar el video arriba del recuadro
      box.addEventListener("dragover", e => { e.preventDefault(); e.stopPropagation(); box.classList.add("vdrop"); });
      box.addEventListener("dragleave", e => { if (!box.contains(e.relatedTarget)) box.classList.remove("vdrop"); });
      box.addEventListener("drop", e => {
        e.preventDefault(); e.stopPropagation(); box.classList.remove("vdrop");
        const f = [...e.dataTransfer.files].find(esVideo);
        if (f) cargarVideo(box, f);
        else { box.querySelector(".vstat").textContent = "Eso no es un video. Soltá un .mp4 o tocá Elegir video."; box.querySelector(".vsync").hidden = false; }
      });
      file.addEventListener("change", () => {
        const f = file.files[0]; if (!f) return;
        st.key = `kt-vsync-${f.name}-${f.size}-${id}`;
        video.src = URL.createObjectURL(f); video.hidden = false; box.querySelector(".vsync").hidden = false;
        box.querySelector(".vload").firstChild.textContent = "Cambiar video… ";
        const saved = store.get(st.key, null);
        if (saved) { st.fine = saved.fine || 0; box.querySelector(".vfine").value = st.fine; box.querySelector(".vfv").textContent = sgn(st.fine) + " s"; setOffset(saved.offset, "Sincronización guardada de la última vez."); }
        else box.querySelector(".vstat").textContent = "Todavía sin sincronizar.";
      });
      let spec = null;
      box.querySelector(".vauto").addEventListener("click", async () => {
        const f = file.files[0]; if (!f) return;
        const stat = box.querySelector(".vstat"), lapSel = box.querySelector(".vlap");
        try {
          if (!spec) spec = await audioSpectrum(f, m => stat.textContent = m);
          stat.textContent = "Buscando el momento de la tanda…"; await new Promise(r => setTimeout(r, 0));
          // si el nombre del archivo trae un tiempo (ej. "39.89 Pantano.mp4") se prioriza esa vuelta
          let pref = lapSel.value ? +lapSel.value : null;
          const mt = !pref && f.name.match(/(\d{2})[.,](\d{1,3})/);
          if (mt) { const tv = parseFloat(mt[1] + "." + mt[2]); const c = laps.reduce((a, l) => Math.abs(l.time - tv) < Math.abs(a.time - tv) ? l : a, laps[0]); if (c && Math.abs(c.time - tv) < 0.06) pref = c.num; }
          const r = spectralSync(spec, serie, pref);
          if (!r) { stat.textContent = "No encontré el motor en el sonido. Sincronizalo a mano."; return; }
          lapSel.value = r.lap;
          const lap = laps.find(l => l.num == r.lap), line = lap ? lap.t0 / 1000 - r.off : null;
          const sure = pref != null || r.conf >= 1.15;
          setOffset(r.off, `Sincronizado por sonido con la vuelta ${r.lap}${line != null && line >= 0 ? `: cruzás la línea de la MyChron a los ${line.toFixed(1)} s del video` : ""}.${sure ? "" : " No estoy seguro de que sea esa vuelta: si no coincide, elegí la vuelta y volvé a sincronizar."}`);
        } catch (e) { stat.textContent = "No se pudo leer el audio del video. Sincronizalo a mano."; }
      });
      box.querySelector(".vmark").addEventListener("click", () => {
        const [kind, lapS, cS] = sel.value.split(":"), lap = laps.find(l => l.num == +lapS);
        let tSes = lap.t0 / 1000;
        if (kind == "apex" && serie.s) {
          const c = D.corners.find(c => c.n == +cS);
          let bi = -1, bd = 1e9;
          for (let i = 0; i < serie.s.length; i++) if (serie.lap[i] == lap.num) { const d = Math.abs(serie.s[i] - c.sa); if (d < bd) { bd = d; bi = i; } }
          if (bi >= 0) tSes = (serie.t0 + bi * 100) / 1000;
        }
        st.fine = 0; box.querySelector(".vfine").value = 0; box.querySelector(".vfv").textContent = "0.00 s";
        setOffset(tSes - video.currentTime, "Sincronizado a mano. Usá el ajuste fino si hace falta.");
      });
      box.querySelector(".vfine").addEventListener("input", e => { st.fine = +e.target.value; box.querySelector(".vfv").textContent = sgn(st.fine) + " s"; if (st.offset != null) store.set(st.key, { offset: st.offset, fine: st.fine }); tick(); });
      video.addEventListener("timeupdate", () => {
        const p = tick(); if (!p) return;
        const link = root.querySelector(".vlink");
        if (!link || !link.checked || video.paused || p.s == null) return;
        for (const other of IDS) {
          if (other == id || !state[other] || state[other].offset == null || !S[other].serie) continue;
          const ov = root.querySelector(`.vbox[data-id="${other}"] video`), os = S[other].serie;
          const tO = ov.currentTime + state[other].offset + state[other].fine, po = atTime(os, tO);
          if (!os.s || !po.lap) continue;
          // buscar en la misma vuelta del otro video el punto con la misma distancia en pista
          let bi = -1, bd = 1e9;
          for (let i = Math.max(0, po.i - 600); i < Math.min(os.s.length, po.i + 600); i++) if (os.lap[i] == po.lap) { const d = Math.abs(os.s[i] - p.s); if (d < bd) { bd = d; bi = i; } }
          if (bi < 0) continue;
          const target = (os.t0 + bi * 100) / 1000 - state[other].offset - state[other].fine;
          if (Math.abs(target - ov.currentTime) > 0.25 && target >= 0 && target <= ov.duration) ov.currentTime = target;
          if (ov.paused) ov.play().catch(() => { });
        }
      });
      video.addEventListener("pause", () => { const link = root.querySelector(".vlink"); if (link && link.checked) root.querySelectorAll(".vbox video").forEach(v => { if (v != video) v.pause(); }); });
    });
  }

  /* ---------- ficha del circuito ---------- */
  const CTIPO = { lenta: "var(--s2)", media: "var(--s4)", "rápida": "var(--s3)" };
  function circuitKey(c) { return c.lat != null ? `${c.lat.toFixed(2)}_${c.lon.toFixed(2)}` : (c.nombre || "pista"); }
  function circuitSummary(c) {
    const ritmo = c.v_media < 80 ? "lento" : c.v_media < 95 ? "de velocidad media" : "rápido";
    const horq = c.curvas.filter(x => x.forma == "horquilla").length;
    const tecnico = horq >= 2 || c.n_lentas >= c.curvas.length / 2;
    return `Circuito ${ritmo}${tecnico ? " y técnico" : ""}: ${c.curvas.length} curvas${horq ? `, ${horq} horquilla${horq > 1 ? "s" : ""}` : ""}, recta más larga de ${c.recta_max} m. Sentido ${c.sentido_giro} (${c.n_izq} a la izquierda, ${c.n_der} a la derecha).`;
  }
  function circuitHints(c) {
    const h = [];
    if (c.n_lentas >= c.curvas.length / 2) h.push("Muchas salidas de curva lentas: suele convenir una relación más corta y un kart que gire bien en las horquillas.");
    if (c.recta_max >= 250) h.push("Rectas largas: la velocidad final pesa; suele convenir una relación más larga y poco arrastre.");
    if (c.pct_frenando >= 18) h.push(`Se frena el ${c.pct_frenando}% del tiempo: la estabilidad en frenada y la entrada a curva son clave.`);
    if (c.grip_nivel == "alto") h.push("Mucho agarre lateral: el kart puede trabarse; vigilar que no salte en las horquillas.");
    if (c.grip_nivel == "bajo") h.push("Poco agarre: priorizar que el kart traccione y no deslice en la salida.");
    return h;
  }
  function circuitPane(ctx) {
    const c = ctx.D.circuito; if (!c) return `<div class="panel"><p class="muted">Sin datos del circuito.</p></div>`;
    const kpi = (k, v, sub) => `<div><div class="eyebrow">${k}</div><div class="big">${v}</div>${sub ? `<div class="muted small">${sub}</div>` : ""}</div>`;
    const hints = circuitHints(c);
    return `<div class="panel"><h2>${esc(c.nombre || "Circuito")}</h2>
      <p class="ink2">Ficha armada con la vuelta de referencia (trazado) y todas las vueltas elegidas (agarre). El agarre depende de gomas, día y temperatura: con más tandas el dato es más firme.</p>
      <div class="optrow six">
        ${kpi("Largo", `${c.largo} m`)}${kpi("Velocidad media", `${c.v_media} km/h`, `máx ${c.v_max} · mín ${c.v_min}`)}
        ${kpi("Curvas", c.curvas.length, `${c.n_lentas} lentas · ${c.n_medias} medias · ${c.n_rapidas} rápidas`)}
        ${kpi("Agarre", `${c.grip_g.toFixed(2)} g`, `nivel ${c.grip_nivel}`)}
        ${kpi("Acelerando", `${c.pct_acelerando}%`, "de la vuelta")}${kpi("Frenando", `${c.pct_frenando}%`, "de la vuelta")}
      </div>
      <p class="lead" style="margin-top:12px">${esc(circuitSummary(c))}</p></div>
      <div class="grid2">
        <div class="panel"><h2>Curvas</h2><p class="ink2">Tipo según la velocidad mínima (lenta menos de 65 km/h, media menos de 85, rápida). Forma según cuánto gira: horquilla 135° o más, cerrada 75° a 135°, abierta menos. Radio estimado con velocidad y G en el vértice.</p>
          <div class="tw"><table><thead><tr><th>Curva</th><th>Lado</th><th>Forma</th><th>Radio</th><th>V mín</th><th>G lat</th><th>Frenada</th></tr></thead><tbody>
          ${c.curvas.map(x => `<tr title="${x.tipo} · ${x.sentido}"><td><span class="dot" style="--c:${CTIPO[x.tipo]}"></span>C${x.n}</td><td>${x.sentido == "izquierda" ? "izq" : "der"}</td><td>${x.forma} ${x.giro}°</td><td>${x.radio} m</td><td>${x.v_min} km/h</td><td>${x.lat_max ?? "–"} g</td><td>${x.frenada_g ?? "–"} g</td></tr>`).join("")}
          </tbody></table></div>
          <p class="small ink2" style="margin-top:8px">Rectas: ${c.rectas.map(r => `${r.largo} m (${r.v_max} km/h)`).join(" · ") || "sin rectas largas"}</p></div>
        <div class="panel"><div class="eyebrow">Tipo de curva</div><svg class="cmap" viewBox="-30 -20 360 380"></svg>
          <div class="sp-leg"><span class="lt" style="--c:var(--s2)">lenta</span><span class="lt" style="--c:var(--s4)">media</span><span class="lt" style="--c:var(--s3)">rápida</span></div></div>
      </div>
      ${hints.length ? `<div class="panel"><h2>Qué suele pedir un circuito así</h2><p class="ink2">Orientativo, sacado de las características de la pista. No reemplaza probar en el kart.</p><ul class="why">${hints.map(h => `<li>${h}</li>`).join("")}</ul></div>` : ""}
      <div class="panel"><h2>Circuitos parecidos</h2><p class="ink2">Cada circuito que analizás queda guardado en este equipo con su huella (largo, velocidad media, curvas lentas, porcentaje acelerando, recta más larga). Así, cuando vayas a una pista nueva, ves a cuál se parece.</p><div class="csim"></div></div>`;
  }
  function wireCircuit(ctx, root) {
    const c = ctx.D.circuito; if (!c) return;
    const { D } = ctx, tx = D.track.x, ty = D.track.y, L = D.track.L, svg = root.querySelector(".cmap");
    const minx = Math.min(...tx), maxx = Math.max(...tx), miny = Math.min(...ty), maxy = Math.max(...ty), k2 = Math.min(260 / (maxx - minx), 300 / (maxy - miny));
    const MX = x => 20 + (x - minx) * k2, MY = y => 20 + (maxy - y) * k2, idxAt = s => Math.min(tx.length - 1, Math.max(0, Math.round(s / L * (tx.length - 1))));
    const tp = tx.map((x, i) => MX(x).toFixed(1) + "," + MY(ty[i]).toFixed(1));
    el("polyline", { points: tp.join(" "), fill: "none", stroke: "var(--muted)", "stroke-width": 4, "stroke-linejoin": "round", opacity: .6 }, svg);
    for (const k of D.corners) {
      const cc = c.curvas.find(x => x.n == k.n); if (!cc) continue;
      el("polyline", { points: tp.slice(idxAt(k.sa - 35), idxAt(k.sa + 35) + 1).join(" "), fill: "none", stroke: CTIPO[cc.tipo], "stroke-width": 7, "stroke-linecap": "round", "stroke-linejoin": "round" }, svg);
      const i = idxAt(k.sa);
      el("circle", { cx: MX(tx[i]), cy: MY(ty[i]), r: 11, fill: "var(--panel)", stroke: "var(--ink2)" }, svg);
      txt(svg, MX(tx[i]), MY(ty[i]) + 4, k.n, { "text-anchor": "middle", style: "fill:var(--ink);font-weight:600" });
    }
    txt(svg, MX(tx[0]) - 14, MY(ty[0]) + 5, "★", { "text-anchor": "middle", style: "fill:var(--ink);font-size:15px" });
    // guardar y comparar circuitos
    const db = store.get("kt-circuitos", {}), key = circuitKey(c), today = (ctx.D.sessions[0] || {}).date || "";
    db[key] = { nombre: c.nombre, fecha: today, huella: c.huella, largo: c.largo, v_media: c.v_media, curvas: c.curvas.length, grip: c.grip_g, resumen: circuitSummary(c) };
    store.set("kt-circuitos", db);
    const others = Object.entries(db).filter(([k]) => k != key).map(([k, v]) => {
      const d = Math.sqrt(v.huella.reduce((a, x, i) => a + (x - c.huella[i]) ** 2, 0) / c.huella.length);
      return Object.assign({ sim: Math.max(0, Math.round((1 - d / 0.35) * 100)) }, v);
    }).sort((a, b) => b.sim - a.sim);
    root.querySelector(".csim").innerHTML = others.length ? `<div class="tw"><table><thead><tr><th>Circuito</th><th>Parecido</th><th>Largo</th><th>V media</th><th>Curvas</th><th>Agarre</th></tr></thead><tbody>${others.map(o => `<tr title="${esc(o.resumen)}"><td>${esc(o.nombre || "–")}</td><td class="${o.sim >= 75 ? "g" : ""}">${o.sim}%</td><td>${o.largo} m</td><td>${o.v_media} km/h</td><td>${o.curvas}</td><td>${o.grip} g</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted small">Todavía no hay otros circuitos guardados. Cuando analices tandas de otra pista, aparece acá cuánto se parece a ${esc(c.nombre || "esta")}.</p>`;
  }

  window.KTX = { esVideo, cargarVideo, circuitPane, wireCircuit, circuitSummary, audioSpectrum, spectralSync, setupDiff, setupChips, setupModal, climaTxt, optimoPane, simpleOptimo, optimoTips, lapTrend, curvaTool, wireCurva, cornerTip, powerPanel, drawPower, hpDelta, carbPanel, carbSimple, wireCarb, carbCorto, transPane, wireTrans, sensorsPane, drawWater, videoPane, wireVideo, store };
})();
