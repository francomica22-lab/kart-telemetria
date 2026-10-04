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
    const V = Object.assign({}, (s.setup || {}).valores || {}), auto = (s.setup || {}).auto || {}, F = D.setup_fields || [];
    const d = document.createElement("div"); d.className = "modal";
    d.innerHTML = `<form class="mbox wide" role="dialog" aria-modal="true" aria-labelledby="st"><h2 id="st">Setup · ${esc(s.top[0].toFixed(3))} · ${esc(s.hour)}</h2>
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
          <div><div class="eyebrow">Vuelta óptima</div><div class="big">${op.optima.toFixed(3)}</div><div class="muted small">tus mejores curvas juntas</div></div>
          <div><div class="eyebrow">Mejor vuelta</div><div class="big">${op.mejor.toFixed(3)}</div><div class="muted small">vuelta ${op.mejor_vuelta} · ${sgn(lost, 3)} s</div></div>
          <div><div class="eyebrow">Promedio</div><div class="big">${op.promedio.toFixed(3)}</div><div class="muted small" title="Desvío entre vueltas: ±${op.desvio.toFixed(2)} s">${sgn(toAvg, 3)} s · ±${op.desvio.toFixed(2)} s</div></div>
        </div>
        ${tips.length ? `<div class="todo" style="margin-top:12px"><div class="eyebrow">Repetí lo que ya hiciste bien</div><ul class="why compact">${tips.map(t => `<li>${t.why.length ? `<details class="fold"><summary><b>Curva ${t.n}</b> · vuelta ${t.lap} · <span class="g num">−${t.gain.toFixed(2)} s</span> vs tu promedio</summary><div class="fold-body">${t.why.join(", ")}.</div></details>` : `<b>Curva ${t.n}</b> · vuelta ${t.lap} · <span class="g num">−${t.gain.toFixed(2)} s</span> vs tu promedio`}</li>`).join("")}</ul></div>` : ""}
        <details class="fold subtle" style="margin-top:10px"><summary class="small">Regularidad y ritmo</summary><div class="fold-body"><ul class="why">
          ${irreg.map((c, i) => `<li><b>Curva ${c.n}</b> ${i == 0 ? "es la más irregular" : "le sigue"}: varía ±${c.desvio.toFixed(2)} s entre vueltas${c.desvio_vertice >= 2.5 ? ` y el vértice se mueve ±${c.desvio_vertice.toFixed(0)} m` : ""}${c.desvio_freno != null && c.desvio_freno >= 2.5 ? `; el punto de frenada, ±${c.desvio_freno.toFixed(0)} m` : ""}.</li>`).join("")}
          ${trend != null ? `<li>${Math.abs(trend) < 0.01 ? "El ritmo se mantuvo parejo a lo largo de la tanda." : trend > 0 ? `Cada vuelta fuiste <b>${trend.toFixed(3)} s más lento</b> en promedio: el agarre o el motor caen con las vueltas.` : `Cada vuelta mejoraste ${Math.abs(trend).toFixed(3)} s en promedio: las gomas y la pista fueron entrando.`}</li>` : ""}
        </ul></div></details>
        <details class="fold subtle"><summary class="small">Tabla curva por curva</summary><div class="fold-body tw"><table><thead><tr><th>Curva</th><th>Óptima</th><th>Vuelta</th><th>En tu mejor vuelta</th><th>Promedio</th><th>Desvío</th><th>Vértice ±m</th></tr></thead><tbody>
          ${op.curvas.map(c => `<tr><td>Curva ${c.n}</td><td class="g">${c.mejor.toFixed(3)}</td><td>V${c.mejor_lap}</td><td>${c.en_mejor_vuelta != null ? c.en_mejor_vuelta.toFixed(3) + ` <span class="muted">${sgn(c.en_mejor_vuelta - c.mejor)}</span>` : "–"}</td><td>${c.promedio.toFixed(3)} <span class="muted">${sgn(c.promedio - c.mejor)}</span></td><td>±${c.desvio.toFixed(3)}</td><td>±${c.desvio_vertice.toFixed(1)}</td></tr>`).join("")}
          <tr class="first"><td><b>Vuelta</b></td><td class="g"><b>${op.optima.toFixed(3)}</b></td><td></td><td>${op.mejor.toFixed(3)}</td><td>${op.promedio.toFixed(3)}</td><td>±${op.desvio.toFixed(3)}</td><td></td></tr>
        </tbody></table></div></details></div>`;
    }
    return h;
  }
  function simpleOptimo(ctx, id) {
    const { D } = ctx, op = D.optimo[id]; if (!op) return "";
    const tips = optimoTips(op).slice(0, 2);
    return `<div class="panel"><div class="eyebrow" style="margin-bottom:6px">Tu vuelta óptima</div>
      <p>Juntando tus mejores curvas de la tanda, la vuelta sería <b>${op.optima.toFixed(3)}</b>, <b>${(op.mejor - op.optima).toFixed(2)} s</b> mejor que tu mejor vuelta.</p>
      ${tips.length ? `<ul class="why" style="margin-top:8px">${tips.map(t => `<li>En la <b>curva ${t.n}</b>, en la vuelta ${t.lap}, lo hiciste ${t.gain.toFixed(2)} s mejor que tu promedio${t.why.length ? ": " + t.why.slice(0, 2).join(" y ") : ""}. ¡Repetilo!</li>`).join("")}</ul>` : ""}</div>`;
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
      box.querySelector(".vlap").insertAdjacentHTML("beforeend", laps.map(l => `<option value="${l.num}">Vuelta ${l.num} · ${l.time.toFixed(3)}</option>`).join(""));
      sel.innerHTML = laps.map(l => `<option value="line:${l.num}">Línea de la MyChron · inicio vuelta ${l.num} (${l.time.toFixed(3)})</option>`).join("") +
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

  window.KTX = { circuitPane, wireCircuit, circuitSummary, audioSpectrum, spectralSync, setupDiff, setupChips, setupModal, climaTxt, optimoPane, simpleOptimo, optimoTips, lapTrend, powerPanel, drawPower, hpDelta, transPane, wireTrans, sensorsPane, drawWater, videoPane, wireVideo, store };
})();
