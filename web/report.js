/* Dibuja el reporte de comparacion de tandas. renderReport(D, root, opts) */
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const PAL = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)"];
  const el = (t, a, p) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; };
  const txt = (p, x, y, s, a = {}) => { const t = el("text", Object.assign({ x, y }, a), p); t.textContent = s; return t; };
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
  const sgn = (v, n = 2) => { const t = Math.abs(v).toFixed(n); return (+t == 0 ? "" : v > 0 ? "+" : "−") + t; };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const tks = (a, b, n) => { const st = (b - a) / n, o = []; for (let i = 0; i <= n; i++) o.push(+(a + i * st).toFixed(2)); return o; };
  const GEARN = g => (g == 1 ? "1ra" : g == 2 ? "2da" : g + "ª");

  function renderReport(D, root, opts = {}) {
    const IDS = D.sessions.map(s => s.id), REF = D.ref, S = Object.fromEntries(D.sessions.map(s => [s.id, s]));
    const C = D.corners, M = D.motor, others = IDS.filter(i => i != REF);
    const COL = Object.fromEntries(IDS.map((id, i) => [id, (opts.colors && opts.colors[id]) || PAL[i % 5]]));
    const BT = id => S[id].top[0].toFixed(3);   // identidad de la tanda: su mejor tiempo
    const NAME = id => `${BT(id)} · ${S[id].hour}`;
    const TAG = id => `<b style="color:${COL[id]}">${BT(id)}</b> <span class="muted">(${S[id].hour})</span>`;
    const legend = (ids, extra = "") => ids.map(id => `<span style="--c:${COL[id]}">${esc(NAME(id))}</span>`).join("") + extra;
    const fecha = d => d && d.length == 10 ? `${d.slice(3, 5)}/${d.slice(0, 2)}/${d.slice(6)}` : d;

    root.innerHTML = `
    <div class="rep">
      <div class="rep-head">
        <div style="display:grid;gap:4px">
          <div class="eyebrow">${esc([...new Set(D.sessions.map(s => fecha(s.date)))].join(" · "))} · ${esc([...new Set(D.sessions.map(s => s.kart))].join(" / "))} · piloto ${esc(D.sessions[0].driver || "")} · pista ${Math.round(D.track.L)} m</div>
          <h1>${IDS.map(BT).join(" vs ")}</h1>
        </div>
        <div class="muted" style="font-size:12.5px">Referencia: ${BT(REF)} · ${S[REF].hour} (vuelta ${D.ref_lap}, tanda ${REF})</div>
      </div>
      <div class="cards-ses">${IDS.map(id => {
        const s = S[id], w = s.laps.filter(l => s.top.includes(l.t) && l.agua != null).map(l => l.agua);
        return `<div class="sc" style="--c:${COL[id]}"><div class="eyebrow">${s.hour} · ${esc(s.kart)} · <span style="opacity:.7">tanda ${id}</span></div>
          <div class="t">${s.top[0].toFixed(3)}</div>
          <div class="l">top ${s.top.length}: ${s.top.map(x => x.toFixed(3)).join(" · ")} · prom ${avg(s.top).toFixed(3)}</div>
          <div class="l">ideal ${s.ideal.toFixed(3)} · punta ${s.vmax} km/h${w.length ? ` · agua ${Math.min(...w).toFixed(0)}–${Math.max(...w).toFixed(0)} °C` : ""}</div>
          <div class="cm">${s.comment ? "“" + esc(s.comment.replace(/\n/g, ", ")) + "”" : "<span class='muted'>sin comentario en la tanda</span>"}</div></div>`;
      }).join("")}</div>
      <div class="modesw" role="group" aria-label="Tipo de análisis">
        <button data-m="simple">Análisis simple</button><button data-m="detalle">Análisis detallado</button>
      </div>
      <div class="simple"></div>
      <div class="detalle">
      <div class="tabs" role="tablist">
        ${["Resumen", "Curvas", "Motor", "Vueltas"].map((t, i) => `<button class="tab${i == 0 ? " on" : ""}" role="tab" data-t="${i}">${t}</button>`).join("")}
      </div>
      <div class="pane" data-p="0"></div>
      <div class="pane" data-p="1" hidden></div>
      <div class="pane" data-p="2" hidden></div>
      <div class="pane" data-p="3" hidden></div>
      </div>
    </div>`;
    // modo simple / detallado (se recuerda en este equipo)
    const modeBtns = root.querySelectorAll(".modesw button");
    const setMode = m => {
      modeBtns.forEach(b => b.classList.toggle("on", b.dataset.m == m));
      root.querySelector(".simple").hidden = m != "simple"; root.querySelector(".detalle").hidden = m == "simple";
      try { localStorage.setItem("kt-mode", m); } catch (e) { }
    };
    let mode0 = "simple"; try { mode0 = localStorage.getItem("kt-mode") || "simple"; } catch (e) { }
    modeBtns.forEach(b => b.addEventListener("click", () => setMode(b.dataset.m)));
    const tabs = root.querySelectorAll(".tab"), panes = root.querySelectorAll(".pane");
    tabs.forEach(b => b.addEventListener("click", () => {
      tabs.forEach(x => x.classList.toggle("on", x == b));
      panes.forEach(p => p.hidden = p.dataset.p != b.dataset.t);
    }));
    const P = i => panes[i];

    /* ---------- conclusiones en palabras ---------- */
    const f1 = v => Math.abs(v).toFixed(1), f0 = v => Math.abs(v).toFixed(0);
    function reasons(a, b, kind) {
      const r = [], A = a.t3, B = b.t3;
      if (kind == "mixto") r.push(`la G lateral queda cerca pero por debajo de la otra (${b.lat_ses_max.toFixed(2)} g contra ${a.lat_ses_max.toFixed(2)} g)`);
      if (kind == "agarre") r.push(`en ninguna vuelta llegó a la G lateral de la otra (${b.lat_ses_max.toFixed(2)} g contra ${a.lat_ses_max.toFixed(2)} g)`);
      const dAp = B.s_vmin - A.s_vmin; if (Math.abs(dAp) >= 4) r.push(`hace el vértice ${f0(dAp)} m ${dAp < 0 ? "antes" : "más tarde"}`);
      const dV = B.v_min - A.v_min; if (Math.abs(dV) >= 0.7) r.push(`pasa ${f1(dV)} km/h más ${dV < 0 ? "lento" : "rápido"} por el vértice`);
      const dO = B.v_salida - A.v_salida; if (Math.abs(dO) >= 0.8) r.push(`sale ${f1(dO)} km/h más ${dO < 0 ? "lento" : "rápido"}`);
      if (A.s_freno != null && B.s_freno != null) { const dB = B.s_freno - A.s_freno; if (Math.abs(dB) >= 3) r.push(`frena ${f0(dB)} m ${dB < 0 ? "antes" : "más tarde"}`); }
      const dG = B.freno_max - A.freno_max; if (Math.abs(dG) >= 0.12) r.push(`frena más ${dG < 0 ? "suave" : "fuerte"} (${B.freno_max.toFixed(2)} g contra ${A.freno_max.toFixed(2)} g)`);
      if (A.s_acel != null && B.s_acel != null) { const dA = B.s_acel - A.s_acel; if (Math.abs(dA) >= 4) r.push(`acelera ${f0(dA)} m ${dA < 0 ? "antes" : "más tarde"}`); }
      const dL = B.off_apex - A.off_apex; if (Math.abs(dL) >= 0.6) r.push(`la línea en el vértice está corrida ${f1(dL)} m`);
      return r;
    }
    function advice(a, b) {
      const A = a.t3, B = b.t3, t = [];
      if (B.s_vmin - A.s_vmin <= -4) t.push(`esperar el vértice hasta cerca del metro ${f0(A.s_vmin)}`);
      if (B.freno_max - A.freno_max <= -0.12) t.push(`frenar más fuerte y más corto (la otra llega a ${A.freno_max.toFixed(2)} g)`);
      if (A.s_acel != null && B.s_acel != null && B.s_acel - A.s_acel >= 4) t.push(`acelerar antes, cerca del metro ${f0(A.s_acel)}`);
      if (Math.abs(B.off_apex - A.off_apex) >= 0.6) t.push(`repetir la línea de la ${BT(REF)}`);
      if (!t.length && B.v_salida - A.v_salida <= -0.8) t.push("priorizar la salida, aunque se pierda algo de velocidad en el vértice");
      return t;
    }
    function driveConclusion(id) {
      const gap = avg(S[id].top) - avg(S[REF].top);
      const parts = C.map(c => ({ n: c.n, k: c.diag[id][0], d: c.diag[id][1], a: c.by[REF], b: c.by[id] }));
      const lost = parts.filter(p => ["manejo", "agarre", "mixto"].includes(p.k)).sort((x, y) => y.d - x.d), won = parts.filter(p => p.k == "gana");
      const sum = k => lost.filter(p => p.k == k).reduce((a, p) => a + p.d, 0);
      const man = sum("manejo"), agr = sum("agarre"), mix = sum("mixto");
      const mixTxt = mix >= 0.02 ? ` Otros ${mix.toFixed(2)} s están en zona gris: no se puede separar manejo de agarre.` : "";
      const verdict = !lost.length ? "No hay curvas donde pierda tiempo de forma clara." :
        man >= 2 * agr && man >= mix ? `<b>La mayor parte es manejo</b> (${man.toFixed(2)} s); el agarre explica ${agr.toFixed(2)} s.${mixTxt}` :
        agr >= 2 * man && agr >= mix ? `<b>La mayor parte es agarre</b> (${agr.toFixed(2)} s): gomas, pista o setup. El manejo explica ${man.toFixed(2)} s.${mixTxt}` :
        mix > man && mix > agr ? `<b>No se puede separar con claridad</b>: ${mix.toFixed(2)} s en zona gris, ${man.toFixed(2)} s de manejo y ${agr.toFixed(2)} s de agarre.` :
        `<b>Se reparte entre manejo</b> (${man.toFixed(2)} s) <b>y agarre</b> (${agr.toFixed(2)} s).${mixTxt}`;
      const g = Math.abs(gap) < 0.01 ? "<b>igual de rápida</b>" : `<b>${Math.abs(gap).toFixed(3)} s ${gap > 0 ? "más lenta" : "más rápida"}</b>`;
      const items = lost.slice(0, 3).map(p => {
        const r = reasons(p.a, p.b, p.k);
        if (!r.length) {
          const prev = C.find(c => c.n == p.n - 1);
          const dPrev = prev ? prev.by[id].t3.v_salida - prev.by[REF].t3.v_salida : 0;
          r.push(dPrev <= -0.8 ? `llega más lento porque sale ${f1(dPrev)} km/h más lento de la curva ${p.n - 1}` : "la diferencia se reparte a lo largo de la curva, sin un punto claro");
        } return `<li><b>Curva ${p.n}</b> <span class="b num">+${p.d.toFixed(2)} s</span> <span class="chip ${p.k}">${p.k}</span>${r.length ? " " + r.slice(0, 3).join(", ") + "." : ""}</li>`; });
      const adv = lost.filter(p => p.k == "manejo").slice(0, 3).map(p => { const t = advice(p.a, p.b); return t.length ? `<li><b>Curva ${p.n}:</b> ${t.join("; ")}.</li>` : ""; }).join("");
      return `<p class="lead">La ${TAG(id)} es ${g} por vuelta que la ${TAG(REF)}. ${verdict}</p>
        ${items.length ? `<ul class="why">${items.join("")}</ul>` : ""}
        ${won.length ? `<p class="ink2 small">Gana en ${won.map(p => `curva ${p.n} (${sgn(p.d)} s)`).join(", ")}.</p>` : ""}
        ${adv ? `<div class="todo"><div class="eyebrow">Para trabajar</div><ul>${adv}</ul></div>` : ""}`;
    }
    function motorConclusion(id) {
      const c = M.compare.find(x => x.ses == id); if (!c) return "";
      const gs = Object.keys(M.gears).map(Number), tg = gs.find(g => M.gears[g] == Math.min(...gs.map(x => M.gears[x])));
      const d = c.dyno[tg] || c.dyno[String(tg)], gn = tg == 1 ? "1ra" : tg == 2 ? "2da" : tg + "ª";
      const notes = [];
      const r = IDS.map(x => M.sessions[x].ratio_top), rr = (Math.max(...r) - Math.min(...r)) / Math.min(...r);
      if (rr > 0.015) notes.push("Cambió la relación (corona o piñón) entre tandas: la comparación de aceleración no es directa.");
      const wa = x => { const w = S[x].laps.filter(l => S[x].top.includes(l.t) && l.agua != null).map(l => l.agua); return w.length ? avg(w) : null; };
      const wA = wa(REF), wB = wa(id);
      if (wA != null && wB != null && Math.abs(wB - wA) >= 4) notes.push(`El agua estuvo ${f0(wB - wA)} °C más ${wB > wA ? "caliente" : "fría"} en la ${BT(id)}.`);
      const hh = x => { const [h, m] = S[x].hour.split(":").map(Number); return h + m / 60; };
      if (Math.abs(hh(id) - hh(REF)) >= 2) notes.push(`Hay ${f1(hh(id) - hh(REF))} h entre una tanda y otra: la temperatura del aire también cambia la potencia.`);
      const dv = S[id].vmax - S[REF].vmax;
      if (!d) return `<p class="lead">No hay datos suficientes de aceleración en ${gn} para comparar el rendimiento del motor.</p>`;
      const range = `entre ${(d.rango[0] / 1000).toFixed(1)}k y ${(d.rango[1] / 1000).toFixed(1)}k rpm`;
      let lead; const why = [];
      if (d.real) {
        const win = d.pct > 0 ? id : REF, lose = win == id ? REF : id;
        lead = `<b>La unidad de potencia rindió más en la ${TAG(win)}:</b> a igual RPM acelera <b>${f1(d.pct)}% más</b> en ${gn} ${range} (margen ±${(d.margin ?? 2 * d.se).toFixed(1)}%${d.vueltas ? `, medido en ${d.vueltas[0]} y ${d.vueltas[1]} vueltas` : ""}).`;
        notes.unshift("Si el motor fue el mismo, una diferencia así suele venir de la carburación, la temperatura o humedad del aire, el viento en las rectas, la presión de las gomas o el peso. No significa necesariamente que un motor sea mejor que otro.");
        if (Math.abs(dv) >= 0.5) why.push(`${(dv > 0) == (win == id) ? "Lo confirma la punta" : "Sin embargo, la punta va al revés"}: ${S[win].vmax} contra ${S[lose].vmax} km/h.`);
      } else {
        lead = `<b>No hay una diferencia clara de rendimiento de motor.</b> En ${gn}, a igual RPM, la aceleración difiere ${sgn(d.pct, 1)}% y el margen de la medición es ±${(d.margin ?? 2 * d.se).toFixed(1)}%${d.vueltas ? ` (${d.vueltas[0]} y ${d.vueltas[1]} vueltas)` : ""}.`;
        why.push(`Punta: ${S[REF].vmax} km/h la ${BT(REF)} y ${S[id].vmax} km/h la ${BT(id)}${Math.abs(dv) < 1 ? ", prácticamente igual" : ""}.`);
      }
      for (const [k, b] of Object.entries(c.bands)) if (b && b.real) { const [lo, hi] = k.split("-"); why.push(`De ${(lo / 1000).toFixed(1)}k a ${(hi / 1000).toFixed(1)}k rpm la ${BT(id)} sube ${f1(b.pct)}% más ${b.pct < 0 ? "rápido" : "lento"}.`); }
      if (!Object.values(c.bands).some(b => b && b.real)) why.push("Las subidas de RPM por salida de curva no muestran diferencias claras.");
      return `<p class="lead">${lead}</p><ul class="why">${why.concat(notes).map(x => `<li>${x}</li>`).join("")}</ul>`;
    }
    const conclusionsHTML = which => others.map(id => `<div class="concl">${others.length > 1 ? `<div class="eyebrow">${NAME(id)} contra ${NAME(REF)}</div>` : ""}${which == "m" ? motorConclusion(id) : driveConclusion(id)}</div>`).join("");

    /* ================= RESUMEN ================= */
    const B = others[0];
    const motorLine = sid => {
      const c = M.compare.find(x => x.ses == sid); if (!c) return "";
      const d2 = c.dyno["2"] || c.dyno[2];
      if (!d2) return "Sin datos suficientes de aceleración en 2da para comparar.";
      const real = d2.real;
      return `${real ? `<b class="${d2.pct > 0 ? "g" : "b"}">${sgn(d2.pct, 1)}% de aceleración en 2da</b>` : `<b>Sin diferencia medible</b> (${sgn(d2.pct, 1)}% ± ${(2 * d2.se).toFixed(1)}%)`} contra la ${REF}, a igual RPM.`;
    };
    let resumen = `<div class="panel conclusion"><h2>Conclusión</h2>
      <div class="cgrid"><section><div class="eyebrow">Manejo y agarre</div>${conclusionsHTML("d")}</section>
      <section><div class="eyebrow">Motor</div>${conclusionsHTML("m")}</section></div></div>`;
    for (const id of others) resumen += `<div class="panel"><div class="eyebrow" style="margin-bottom:8px">Dónde pierde la ${NAME(id)}, curva por curva (naranja: manejo · verde: agarre · gris: zona gris)</div><div class="split" data-id="${id}"></div></div>`;
    P(0).innerHTML = `
      <div class="verdict" style="display:grid;gap:12px">${resumen || ""}</div>
      ${opts.notas ? `<div class="panel">${opts.notas}</div>` : ""}
      <div class="grid2">
        <div class="panel" style="display:grid;gap:8px">
          <h2>Velocidad y diferencia de tiempo</h2>
          <p class="ink2" style="font-size:13px">Mejor vuelta de cada tanda. Abajo, el tiempo acumulado contra la vuelta de referencia: si la línea sube, esa tanda pierde.</p>
          <div class="legend">${legend(IDS)}</div>
          <svg class="speed" viewBox="0 0 800 260"></svg>
          <svg class="delta" viewBox="0 0 800 180"></svg>
          <div class="readout">Pasá el mouse por los gráficos</div>
        </div>
        <div class="panel" style="display:grid;gap:6px"><div class="eyebrow">Trazado · largada ★</div><svg class="map" viewBox="0 0 300 340"></svg></div>
      </div>`;
    // barra de perdida por curva
    P(0).querySelectorAll(".split").forEach(div => {
      const id = div.dataset.id, lost = C.map(c => ({ n: c.n, k: c.diag[id][0], d: c.diag[id][1] })).filter(p => ["manejo", "agarre", "mixto"].includes(p.k));
      if (!lost.length) return;
      const tot = lost.reduce((a, p) => a + p.d, 0), sc = 800 / tot; let x = 0;
      let svg = `<svg viewBox="0 0 800 56" style="max-width:640px">`;
      for (const p of lost) { const w = p.d * sc; svg += `<rect x="${x + 1}" y="2" width="${Math.max(w - 2, 2)}" height="28" rx="3" fill="${p.k == "agarre" ? "var(--s3)" : p.k == "mixto" ? "var(--muted)" : "var(--s2)"}"/><text x="${x + w / 2}" y="21" text-anchor="middle" style="fill:#fff;font-weight:600">C${p.n}</text><text x="${x + w / 2}" y="48" text-anchor="middle">+${p.d.toFixed(2)}</text>`; x += w; }
      div.innerHTML = svg + "</svg>";
    });
    // velocidad / delta / mapa
    const L = D.track.L, PL = 64, PR = 10, W = 800, X = s => PL + (s / L) * (W - PL - PR);
    function chart(svg, H, key, y0, y1, ticks, unit) {
      const PT = 10, PB = 22, Y = v => PT + (1 - (v - y0) / (y1 - y0)) * (H - PT - PB);
      C.forEach((c, i) => { if (i % 2 == 0) el("rect", { x: X(c.s0), y: PT, width: X(c.s1) - X(c.s0), height: H - PT - PB, fill: "var(--band)" }, svg); if (key == "v") txt(svg, X(c.sa), H - PB - 6, "C" + c.n, { "text-anchor": "middle" }); });
      for (const v of ticks) { el("line", { x1: PL, x2: W - PR, y1: Y(v), y2: Y(v), stroke: "var(--grid)" }, svg); txt(svg, PL - 6, Y(v) + 4, +v.toFixed(2) + unit, { "text-anchor": "end" }); }
      if (key == "dt") for (let s = 0; s <= L - 50; s += 100) txt(svg, X(s), H - 6, s + " m", { "text-anchor": "middle" });
      for (const sid of IDS) { const s = S[sid]; el("polyline", { points: s.s.map((d, i) => X(d).toFixed(1) + "," + Y(Math.max(y0, Math.min(y1, s[key][i]))).toFixed(1)).join(" "), fill: "none", stroke: COL[sid], "stroke-width": 2, "stroke-linejoin": "round" }, svg); }
      const cross = el("line", { y1: PT, y2: H - PB, stroke: "var(--ink2)", opacity: 0 }, svg), hit = el("rect", { x: PL, y: 0, width: W - PL - PR, height: H, fill: "transparent" }, svg);
      return { svg, cross, hit };
    }
    const allv = D.sessions.flatMap(s => s.v), vlo = Math.floor(Math.min(...allv) / 10) * 10, vhi = Math.ceil(Math.max(...allv) / 10) * 10;
    const alld = D.sessions.flatMap(s => s.dt), dlo = Math.min(-0.1, Math.floor(Math.min(...alld) * 10) / 10), dhi = Math.max(0.2, Math.ceil(Math.max(...alld) * 10) / 10);
    const cs = chart(P(0).querySelector(".speed"), 260, "v", vlo, vhi, tks(vlo, vhi, 4), " km/h"), cd = chart(P(0).querySelector(".delta"), 180, "dt", dlo, dhi, tks(dlo, dhi, 4), " s");
    const map = P(0).querySelector(".map"), tx = D.track.x, ty = D.track.y;
    const minx = Math.min(...tx), maxx = Math.max(...tx), miny = Math.min(...ty), maxy = Math.max(...ty), k2 = Math.min(260 / (maxx - minx), 300 / (maxy - miny));
    const MX = x => 20 + (x - minx) * k2, MY = y => 20 + (maxy - y) * k2, tp = tx.map((x, i) => MX(x).toFixed(1) + "," + MY(ty[i]).toFixed(1)).join(" ");
    el("polyline", { points: tp, fill: "none", stroke: "var(--line)", "stroke-width": 10, "stroke-linejoin": "round" }, map);
    el("polyline", { points: tp, fill: "none", stroke: "var(--ink2)", "stroke-width": 1.5 }, map);
    const idxAt = s => Math.min(tx.length - 1, Math.round(s / L * (tx.length - 1)));
    for (const c of C) { const i = idxAt(c.sa); el("circle", { cx: MX(tx[i]), cy: MY(ty[i]), r: 10, fill: "var(--panel)", stroke: "var(--ink2)" }, map); txt(map, MX(tx[i]), MY(ty[i]) + 4, c.n, { "text-anchor": "middle", style: "fill:var(--ink);font-weight:600" }); }
    txt(map, MX(tx[0]) - 14, MY(ty[0]) + 5, "★", { "text-anchor": "middle", style: "fill:var(--ink);font-size:15px" });
    const car = el("circle", { r: 6, fill: "var(--ink)", stroke: "var(--panel)", "stroke-width": 2, opacity: 0 }, map), ro = P(0).querySelector(".readout");
    function show(s) {
      for (const c of [cs, cd]) { c.cross.setAttribute("x1", X(s)); c.cross.setAttribute("x2", X(s)); c.cross.setAttribute("opacity", 1); }
      const i = idxAt(s); car.setAttribute("cx", MX(tx[i])); car.setAttribute("cy", MY(ty[i])); car.setAttribute("opacity", 1);
      ro.innerHTML = `${Math.round(s)} m · ` + IDS.map(id => { const q = S[id], k = Math.min(Math.round(s / 2), q.v.length - 1); return `<span style="color:${COL[id]}">●</span> ${BT(id)} ${q.v[k].toFixed(1)} km/h (${sgn(q.dt[k])} s)`; }).join(" · ");
    }
    for (const c of [cs, cd]) {
      c.hit.addEventListener("pointermove", e => { const r = c.svg.getBoundingClientRect(); show(Math.max(0, Math.min(L, (((e.clientX - r.left) / r.width * W) - PL) / (W - PL - PR) * L))); });
      c.hit.addEventListener("pointerleave", () => { for (const q of [cs, cd]) q.cross.setAttribute("opacity", 0); car.setAttribute("opacity", 0); });
    }

    /* ================= ANALISIS SIMPLE ================= */
    (() => {
      const box = root.querySelector(".simple");
      const tipFor = (p) => {
        if (p.k == "agarre") return "Acá el kart agarró menos que en la otra tanda. No es tu manejo: revisá gomas, presiones o puesta a punto.";
        const A = p.a.t3, B = p.b.t3, t = [];
        if (B.s_vmin - A.s_vmin <= -4) t.push("girá un poco más tarde: esperá antes de buscar el vértice (la parte de adentro de la curva)");
        if (B.freno_max - A.freno_max <= -0.12) t.push("frená más fuerte y más corto");
        if (A.s_acel != null && B.s_acel != null && B.s_acel - A.s_acel >= 4) t.push("volvé a acelerar antes");
        if (Math.abs(B.off_apex - A.off_apex) >= 0.6) t.push(`repetí la trayectoria de la ${BT(REF)}`);
        if (!t.length && B.v_salida - A.v_salida <= -0.8) t.push("priorizá salir rápido de la curva, aunque entres un poco más lento");
        if (!t.length) {
          const prev = C.find(c => c.n == p.n - 1);
          if (prev && prev.by[p.id].t3.v_salida - prev.by[REF].t3.v_salida <= -0.8) t.push(`llegás lento porque salís lento de la curva ${p.n - 1}: mejorá esa salida`);
        }
        if (!t.length) return p.k == "mixto" ? "Acá se mezcla manejo y agarre: probá repetir la línea de tu mejor tanda." : "Pequeña diferencia repartida en toda la curva.";
        const txt = t.join(", y ");
        return txt.charAt(0).toUpperCase() + txt.slice(1) + ".";
      };
      const motorSimple = id => {
        const c = M.compare.find(x => x.ses == id); if (!c) return "";
        const gs = Object.keys(M.gears).map(Number), tg = gs.find(g => M.gears[g] == Math.min(...gs.map(x => M.gears[x])));
        const d = c.dyno[tg] || c.dyno[String(tg)];
        if (!d) return "No hay datos suficientes para comparar el motor.";
        if (!d.real) return "El motor rindió parecido en las dos tandas.";
        const win = d.pct > 0 ? id : REF;
        return `El motor rindió un poco más en la ${BT(win)} (${f1(d.pct)}%). Si es el mismo motor, puede ser por el clima o la carburación.`;
      };
      let h = "";
      for (const id of others) {
        const gap = avg(S[id].top) - avg(S[REF].top);
        const parts = C.map(c => ({ id, n: c.n, k: c.diag[id][0], d: c.diag[id][1], a: c.by[REF], b: c.by[id] }));
        const lost = parts.filter(p => ["manejo", "agarre", "mixto"].includes(p.k)).sort((x, y) => y.d - x.d), won = parts.filter(p => p.k == "gana");
        const slower = gap > 0 ? id : REF, faster = slower == id ? REF : id;
        h += `<section class="sp">
          <div class="sp-head">
            <div class="eyebrow">${NAME(id)} contra ${NAME(REF)}</div>
            <p class="sp-big">La ${TAG(slower)} fue <b>${Math.abs(gap).toFixed(2)} s más lenta</b> por vuelta que la ${TAG(faster)}.</p>
            <p class="ink2">En una tanda de 10 vueltas son unos ${(Math.abs(gap) * 10).toFixed(1)} s.</p>
          </div>
          <div class="sp-grid">
            <div class="panel sp-map"><div class="eyebrow">Dónde se pierde tiempo</div><svg viewBox="-30 -20 360 380" data-id="${id}"></svg>
              <div class="sp-leg"><span class="lose">pierde</span><span class="win">gana</span><span class="even">igual</span></div></div>
            <div class="sp-right">
              <div class="panel"><div class="eyebrow" style="margin-bottom:8px">Qué hacer para bajar el tiempo</div>
                ${lost.length ? `<ol class="tips">${lost.slice(0, 3).map(p => `<li><span class="tc">Curva ${p.n}<small>+${p.d.toFixed(2)} s</small></span><span>${tipFor(p)}</span></li>`).join("")}</ol>` : `<p>No hay curvas donde se pierda tiempo de forma clara.</p>`}
                ${won.length ? `<p class="ink2 small" style="margin-top:10px">Bien hecho en ${won.map(p => "la curva " + p.n).join(" y ")}: ahí la ${BT(id)} fue más rápida.</p>` : ""}
              </div>
              <div class="panel"><div class="eyebrow" style="margin-bottom:6px">Motor</div><p>${motorSimple(id)}</p></div>
            </div>
          </div>
        </section>`;
      }
      h += `<div class="panel"><div class="eyebrow" style="margin-bottom:10px">Tus vueltas</div><div class="laps-simple">${IDS.map(id => {
        const s = S[id], best = Math.min(...s.laps.map(l => l.t)), worst = Math.max(...s.laps.map(l => l.t));
        return `<div class="ls"><div class="ls-h"><span class="dot" style="--c:${COL[id]}"></span>${NAME(id)}</div>` + s.laps.map(l => {
          const w = 30 + 70 * (1 - (l.t - best) / Math.max(worst - best, 0.3));
          return `<div class="lr"><span class="muted">V${l.lap}</span><span class="lb"><i style="width:${w.toFixed(0)}%;background:${COL[id]};opacity:${l.t == best ? 1 : .45}"></i></span><span class="num${l.t == best ? " g" : ""}">${l.t.toFixed(3)}</span></div>`;
        }).join("") + `</div>`;
      }).join("")}</div><p class="ink2 small" style="margin-top:8px">La barra más larga es la vuelta más rápida de cada tanda.</p></div>
      <p class="ink2 small">¿Querés ver el porqué de cada número? Pasá al <button class="link" data-go="detalle">análisis detallado</button>.</p>`;
      box.innerHTML = h;
      box.querySelector("[data-go]").addEventListener("click", () => { setMode("detalle"); root.scrollIntoView(); });
      box.querySelectorAll(".sp-map svg").forEach(svg => {
        const id = svg.dataset.id, tp2 = tx.map((x, i) => MX(x).toFixed(1) + "," + MY(ty[i]).toFixed(1));
        el("polyline", { points: tp2.join(" "), fill: "none", stroke: "var(--line)", "stroke-width": 10, "stroke-linejoin": "round" }, svg);
        for (const c of C) {
          const [k, d] = c.diag[id], a = idxAt(c.s0), b = idxAt(c.s1);
          const col = k == "gana" ? "var(--good)" : k == "neutro" ? "var(--muted)" : "var(--bad)";
          el("polyline", { points: tp2.slice(a, b + 1).join(" "), fill: "none", stroke: col, "stroke-width": 6, "stroke-linecap": "round", "stroke-linejoin": "round" }, svg);
        }
        for (const c of C) {
          const [k, d] = c.diag[id], i = idxAt(c.sa);
          el("circle", { cx: MX(tx[i]), cy: MY(ty[i]), r: 11, fill: "var(--panel)", stroke: "var(--ink2)" }, svg);
          txt(svg, MX(tx[i]), MY(ty[i]) + 4, c.n, { "text-anchor": "middle", style: "fill:var(--ink);font-weight:600" });
          if (k != "neutro") {
            // etiqueta hacia afuera del trazado (desde el centro de la pista hacia el vertice)
            const cxm = tx.reduce((a, x) => a + MX(x), 0) / tx.length, cym = ty.reduce((a, y) => a + MY(y), 0) / ty.length;
            const vx = MX(tx[i]) - cxm, vy = MY(ty[i]) - cym, nn = Math.hypot(vx, vy) || 1;
            const lx = MX(tx[i]) + vx / nn * 30, ly = MY(ty[i]) + vy / nn * 26 + 4;
            txt(svg, lx, ly, sgn(d), { "text-anchor": "middle", style: `fill:${d > 0 ? "var(--bad)" : "var(--good)"};font-weight:700;font-size:13px;paint-order:stroke;stroke:var(--panel);stroke-width:4px` });
          }
        }
        txt(svg, MX(tx[0]) - 14, MY(ty[0]) + 5, "★", { "text-anchor": "middle", style: "fill:var(--ink);font-size:15px" });
      });
      setMode(mode0);
    })();

    /* ================= CURVAS ================= */
    P(1).innerHTML = `
      <div class="panel conclusion"><h2>Conclusión · manejo y agarre</h2>${conclusionsHTML("d")}</div>
      <div class="panel sectors"><div class="sec-head"><h2>Sectores</h2>
        <div class="seg" role="group" aria-label="Cantidad de sectores">${Object.keys(D.sectors || {}).map((n, i) => `<button data-n="${n}" class="${i == 0 ? "on" : ""}">${n} sectores</button>`).join("")}</div></div>
        <p class="ink2">La pista se divide en sectores de largo parecido, con los cortes en las rectas. Promedio de las mejores vueltas y mejor sector de cada tanda.</p>
        <div class="sec-body"></div></div>
      <div class="grid2b">
        <div class="panel"><h2>Agarre usado en cada curva</h2>
          <p class="ink2">Barra: G lateral máxima promedio de las mejores vueltas. Punto: la máxima lograda en cualquier vuelta rápida. Si una tanda llegó al punto de la otra en alguna vuelta, el agarre estaba disponible.</p>
          <svg class="gmax" viewBox="0 0 800 300"></svg><div class="legend" style="margin-top:8px">${legend(IDS)}</div></div>
        <div class="panel"><h2>Círculo de fricción</h2>
          <p class="ink2">Envolvente de G en todas las vueltas rápidas. Si se achica en todas las direcciones, es agarre (gomas, pista, setup). Si se achica en una sola zona, suele ser manejo o balance.</p>
          <svg class="gg" viewBox="0 0 420 420" style="max-width:420px;margin:0 auto"></svg></div>
      </div>
      <div class="panel"><h2>Curva por curva</h2><p class="ink2">Diferencia del tiempo de cada curva contra la ${BT(REF)} (promedio de las mejores vueltas) y clasificación automática.</p>
        <div class="ccards">${C.map(c => {
          const R0 = c.by[REF];
          return `<div class="cc"><div class="eyebrow">${Math.round(c.s0)}–${Math.round(c.s1)} m · vértice ${Math.round(c.sa)} m</div><h3>Curva ${c.n}</h3>` +
            others.map(id => {
              const b = c.by[id], [k, d] = c.diag[id];
              return `<div class="row"><span class="eyebrow" style="color:${COL[id]}">${BT(id)}</span><span class="d ${d > 0.02 ? "b" : d < -0.02 ? "g" : ""}">${sgn(d)} s</span><span class="chip ${k}">${k}</span></div>
              <div class="f">vmín ${b.t3.v_min.toFixed(1)} vs ${R0.t3.v_min.toFixed(1)} · vértice ${b.t3.s_vmin.toFixed(0)} vs ${R0.t3.s_vmin.toFixed(0)} m · salida ${b.t3.v_salida.toFixed(1)} vs ${R0.t3.v_salida.toFixed(1)} · G máx ${b.lat_ses_max.toFixed(2)} vs ${R0.lat_ses_max.toFixed(2)}</div>`;
            }).join("") + `</div>`;
        }).join("")}</div></div>
      <div class="panel"><h2>Tabla completa</h2><p class="ink2">Promedio de las mejores vueltas. Línea: desvío de la trayectoria en el vértice respecto de la referencia (m).</p><div class="tw"><table class="tbl"></table></div></div>
      <p class="note">Criterio automático: si la tanda más lenta nunca llegó al 94% de la G máxima de la referencia en esa curva, la pérdida se marca como agarre; entre 94% y 98%, zona gris (mixto); por encima, manejo. Es una primera lectura: no sabe de cambios de setup, gomas ni hora del día.</p>`;
    (() => {
      const svg = P(1).querySelector(".gmax"), PL = 50, PB = 30, PT = 12, H = 300, W = 800;
      const vals = C.flatMap(c => IDS.flatMap(id => [c.by[id].t3.lat_max, c.by[id].lat_ses_max]));
      const y0 = Math.floor(Math.min(...vals) * 10 - 1) / 10, y1 = Math.ceil(Math.max(...vals) * 10 + 0.5) / 10, Y = v => PT + (1 - (v - y0) / (y1 - y0)) * (H - PT - PB);
      for (let v = Math.ceil(y0 * 5) / 5; v <= y1 + 1e-9; v += 0.2) { el("line", { x1: PL, x2: W - 8, y1: Y(v), y2: Y(v), stroke: "var(--grid)" }, svg); txt(svg, PL - 6, Y(v) + 4, v.toFixed(1) + " g", { "text-anchor": "end" }); }
      const gw = (W - PL - 8) / C.length, bw = Math.min(18, (gw - 20) / IDS.length - 6);
      C.forEach((c, i) => {
        const gx = PL + i * gw; txt(svg, gx + gw / 2, H - 10, "C" + c.n, { "text-anchor": "middle" });
        IDS.forEach((id, j) => {
          const b = c.by[id], x = gx + gw / 2 + (j - (IDS.length - 1) / 2) * (bw + 6) - bw / 2;
          el("rect", { x, y: Y(b.t3.lat_max), width: bw, height: Y(y0) - Y(b.t3.lat_max), rx: 3, fill: COL[id], opacity: .4 }, svg);
          el("line", { x1: x + bw / 2, x2: x + bw / 2, y1: Y(b.t3.lat_max), y2: Y(b.lat_ses_max), stroke: COL[id], "stroke-width": 2 }, svg);
          const d = el("circle", { cx: x + bw / 2, cy: Y(b.lat_ses_max), r: 5, fill: COL[id], stroke: "var(--panel)", "stroke-width": 2 }, svg);
          el("title", {}, d).textContent = `${BT(id)} C${c.n}: prom ${b.t3.lat_max.toFixed(2)} g · máx ${b.lat_ses_max.toFixed(2)} g`;
        });
      });
    })();
    (() => {
      const svg = P(1).querySelector(".gg"), cx = 210, cy = 210, R = 150, gmax = 2.2, r = g => g / gmax * R;
      for (const g of [0.5, 1, 1.5, 2]) { el("circle", { cx, cy, r: r(g), fill: "none", stroke: "var(--grid)" }, svg); txt(svg, cx + 4, cy - r(g) - 3, g + " g"); }
      el("line", { x1: cx - R, x2: cx + R, y1: cy, y2: cy, stroke: "var(--grid)" }, svg); el("line", { x1: cx, x2: cx, y1: cy - R, y2: cy + R, stroke: "var(--grid)" }, svg);
      txt(svg, cx, 18, "acelera", { "text-anchor": "middle" }); txt(svg, cx, 412, "frena", { "text-anchor": "middle" }); txt(svg, 6, cy - 6, "izquierda"); txt(svg, 414, cy - 6, "derecha", { "text-anchor": "end" });
      for (const id of IDS) {
        const s = S[id], pts = [];
        s.env.forEach((m, i) => { if (m == null) return; const a = (s.env_bins[i] + 7.5) * Math.PI / 180, mm = Math.min(m, gmax); pts.push([cx + r(mm) * Math.cos(a), cy - r(mm) * Math.sin(a)]); });
        el("polygon", { points: pts.map(p => p.map(v => v.toFixed(1)).join(",")).join(" "), fill: "none", stroke: COL[id], "stroke-width": 2, "stroke-linejoin": "round" }, svg);
      }
    })();
    (() => {
      const cols = [["tiempo", "Sector s", 2], ["v_min", "V mín", 1], ["s_vmin", "Vértice m", 0], ["v_salida", "V salida", 1], ["freno_max", "Freno g", 2], ["lat_max", "Lat g", 2], ["lat_ses_max", "G máx tanda", 2], ["off_apex", "Línea m", 1]];
      let h = "<thead><tr><th>Curva · tanda</th>" + cols.map(c => `<th>${c[1]}</th>`).join("") + "</tr></thead><tbody>";
      for (const c of C) IDS.forEach((id, j) => { const b = c.by[id]; h += `<tr class="${j == 0 ? "first" : ""}"><td><span class="dot" style="--c:${COL[id]}"></span>C${c.n} · ${BT(id)}</td>` + cols.map(k => { const v = k[0] == "lat_ses_max" ? b.lat_ses_max : b.t3[k[0]]; return `<td>${v.toFixed(k[2])}</td>`; }).join("") + "</tr>"; });
      P(1).querySelector(".tbl").innerHTML = h + "</tbody>";
    })();

    (() => {
      const box = P(1).querySelector(".sectors"); if (!D.sectors) { box.remove(); return; }
      const draw = n => {
        const sx = D.sectors[n]; if (!sx) return;
        const ns = sx.bounds.length - 1;
        let h = `<div class="sec-map"><svg viewBox="0 0 300 340" class="smap"></svg></div><div class="tw"><table><thead><tr><th>Tanda</th>` +
          Array.from({ length: ns }, (_, i) => `<th>S${i + 1} <span class="muted" style="font-weight:400">${Math.round(sx.bounds[i])}–${Math.round(sx.bounds[i + 1])} m</span></th>`).join("") + `<th>Vuelta</th></tr></thead><tbody>`;
        const ref = sx.by[REF];
        for (const id of IDS) {
          const b = sx.by[id], tot = b.avg.reduce((a, x) => a + x, 0), tref = ref.avg.reduce((a, x) => a + x, 0);
          h += `<tr><td><span class="dot" style="--c:${COL[id]}"></span>${NAME(id)} <span class="muted">prom.</span></td>` + b.avg.map((v, i) => {
            const d = v - ref.avg[i];
            return `<td>${v.toFixed(3)}${id == REF ? "" : ` <span class="${d > 0.02 ? "b" : d < -0.02 ? "g" : "muted"}">${sgn(d)}</span>`}</td>`;
          }).join("") + `<td>${tot.toFixed(3)}${id == REF ? "" : ` <span class="${tot - tref > 0.02 ? "b" : tot - tref < -0.02 ? "g" : "muted"}">${sgn(tot - tref)}</span>`}</td></tr>`;
          h += `<tr class="sub"><td class="muted">&nbsp;&nbsp;&nbsp;mejor sector</td>` + b.best.map(v => `<td class="muted">${v.toFixed(3)}</td>`).join("") + `<td class="muted">ideal ${b.best.reduce((a, x) => a + x, 0).toFixed(3)}</td></tr>`;
        }
        box.querySelector(".sec-body").innerHTML = h + "</tbody></table></div>";
        const svg = box.querySelector(".smap"), tp2 = tx.map((x, i) => MX(x).toFixed(1) + "," + MY(ty[i]).toFixed(1));
        const SC = ["var(--ink2)", "var(--muted)"];
        for (let i = 0; i < ns; i++) {
          const a = idxAt(sx.bounds[i]), b = idxAt(sx.bounds[i + 1]);
          el("polyline", { points: tp2.slice(a, b + 1).join(" "), fill: "none", stroke: i % 2 ? "var(--muted)" : "var(--ink)", "stroke-width": 5, "stroke-linecap": "round" }, svg);
          const m = idxAt((sx.bounds[i] + sx.bounds[i + 1]) / 2);
          el("circle", { cx: MX(tx[m]), cy: MY(ty[m]), r: 12, fill: "var(--panel)", stroke: "var(--ink2)" }, svg);
          txt(svg, MX(tx[m]), MY(ty[m]) + 4, "S" + (i + 1), { "text-anchor": "middle", style: "fill:var(--ink);font-weight:600;font-size:11px" });
        }
        txt(svg, MX(tx[0]) - 14, MY(ty[0]) + 5, "★", { "text-anchor": "middle", style: "fill:var(--ink);font-size:15px" });
      };
      box.querySelectorAll(".seg button").forEach(btn => btn.addEventListener("click", () => {
        box.querySelectorAll(".seg button").forEach(x => x.classList.toggle("on", x == btn)); draw(btn.dataset.n);
      }));
      draw(Object.keys(D.sectors)[0]);
    })();

    /* ================= MOTOR ================= */
    const gears = Object.keys(M.gears).map(Number).sort();
    const top = gears.find(g => M.gears[g] == Math.min(...gears.map(x => M.gears[x])));
    const bandKeys = M.bands.map(b => b.join("-"));
    const cmpCards = others.map(id => {
      const c = M.compare.find(x => x.ses == id) || { bands: {}, dyno: {} };
      const card = (title, val, sub, cls) => `<div class="mc"><div class="eyebrow">${title}</div><div class="v ${cls || "dim"}">${val}</div><div class="s">${sub}</div></div>`;
      let h = "";
      for (const g of [...gears].sort((a, b) => (a == top ? -1 : b == top ? 1 : 0))) {
        const d = c.dyno[g] || c.dyno[String(g)];
        if (!d) { h += card(`Aceleración en ${GEARN(g)}`, "–", "No hay suficientes datos en las dos tandas."); continue; }
        const cls = d.real ? (d.pct > 0 ? "g" : "b") : "";
        h += card(`Aceleración en ${GEARN(g)}${g == top ? " · medida principal" : ""}`, `${sgn(d.pct, 1)}%`,
          `${d.real ? `<span class="chip ${d.pct > 0 ? "good" : "bad"}">${d.pct > 0 ? "mejor" : "peor"}</span>` : `<span class="chip">dentro del ruido</span>`} margen ±${(d.margin ?? 2 * d.se).toFixed(1)}% · ${Math.round(d.rango[0] / 100) / 10}k–${Math.round(d.rango[1] / 100) / 10}k rpm`, cls);
      }
      for (const k of bandKeys) {
        const b = c.bands[k], [lo, hi] = k.split("-");
        if (!b) { h += card(`${(+lo / 1000).toFixed(1)}k → ${(+hi / 1000).toFixed(1)}k rpm`, "–", "Sin subidas comparables (misma marcha y misma salida de curva) en las dos tandas."); continue; }
        const better = b.pct < 0, cls = b.real ? (better ? "g" : "b") : "";
        h += card(`${(+lo / 1000).toFixed(1)}k → ${(+hi / 1000).toFixed(1)}k rpm`, `${sgn(b.pct, 1)}% tiempo`,
          `${b.real ? `<span class="chip ${better ? "good" : "bad"}">${better ? "sube más rápido" : "sube más lento"}</span>` : `<span class="chip">dentro del ruido</span>`} margen ±${(2 * b.se).toFixed(1)}% · ${b.detalle.length} salidas comparadas`, cls);
      }
      return `<div class="panel"><div class="eyebrow" style="margin-bottom:10px">Datos · <span style="color:${COL[id]}">${BT(id)}</span> contra <span style="color:${COL[REF]}">${BT(REF)}</span></div><div class="mcards">${h}</div></div>`;
    }).join("");
    const ratioWarn = (() => {
      const r = IDS.map(id => M.sessions[id].ratio_top), mn = Math.min(...r), mx = Math.max(...r);
      return (mx - mn) / mn > 0.015 ? `<p class="b" style="font-size:13px">La relación RPM/velocidad en ${GEARN(top)} cambia ${(((mx - mn) / mn) * 100).toFixed(1)}% entre tandas: hubo cambio de corona o piñón (o de diámetro de rueda). Comparar aceleración entre relaciones distintas no es directo.</p>` : "";
    })();
    P(2).innerHTML = `
      <div class="panel conclusion"><h2>Conclusión · motor</h2>${conclusionsHTML("m")}</div>
      ${cmpCards}
      <div class="panel"><h2>Dinamómetro de pista</h2>
        <p class="ink2">Aceleración media en cada régimen, solo acelerando y casi en recta. En la misma marcha, a igual RPM la velocidad es la misma, y el arrastre del aire también: la diferencia entre curvas es el motor (o peso, viento, densidad del aire). La banda sombreada es el margen de cada punto.</p>
        <div class="legend" style="margin-bottom:6px">${legend(IDS)}<span style="--c:var(--muted)">${gears.map(g => GEARN(g)).join(" · ")}: ${gears.length > 1 ? "línea llena 2da, punteada 1ra" : ""}</span></div>
        <svg class="dyno" viewBox="0 0 1200 400"></svg>
        <div class="readout dy-ro">Pasá el mouse por el gráfico</div>
      </div>
      <div class="grid2b">
        <div class="panel"><h2>Subidas de RPM por salida de curva</h2>
          <p class="ink2">Mediana del tiempo para subir cada banda, separado por marcha y por curva de salida para comparar igual con igual. Menos es mejor.</p>
          <div class="tw"><table class="bandtbl"></table></div></div>
        <div class="panel"><h2>Datos del motor</h2><p class="ink2">Mediana de las vueltas rápidas.</p>
          <div class="tw"><table class="mtbl"></table></div>${ratioWarn}</div>
      </div>
      <p class="note">Cómo probar un cambio de motor, escape o carburación: dos tandas seguidas, mismo horario, mismas gomas y misma relación. Mirá primero el dinamómetro en 2da: es la medida más estable. Una diferencia "dentro del ruido" significa que con estos datos no se puede afirmar que haya cambio.</p>`;
    // dyno chart
    (() => {
      const svg = P(2).querySelector(".dyno"), PL = 70, PR = 20, PT = 14, PB = 34, W = 1200, H = 400;
      const pts = IDS.flatMap(id => gears.flatMap(g => (M.sessions[id].dyno[g] || M.sessions[id].dyno[String(g)] || [])));
      if (!pts.length) { txt(svg, 600, 200, "Sin datos de aceleración", { "text-anchor": "middle" }); return; }
      const x0 = Math.floor(Math.min(...pts.map(p => p.rpm)) / 1000) * 1000, x1 = Math.ceil(Math.max(...pts.map(p => p.rpm)) / 1000) * 1000;
      const y0 = 0, y1 = Math.ceil(Math.max(...pts.map(p => p.acc + p.se)) * 10) / 10;
      const X = v => PL + (v - x0) / (x1 - x0) * (W - PL - PR), Y = v => PT + (1 - (v - y0) / (y1 - y0)) * (H - PT - PB);
      for (const v of tks(y0, y1, 4)) { el("line", { x1: PL, x2: W - PR, y1: Y(v), y2: Y(v), stroke: "var(--grid)" }, svg); txt(svg, PL - 6, Y(v) + 4, v.toFixed(2) + " g", { "text-anchor": "end" }); }
      for (let v = x0; v <= x1; v += 1000) txt(svg, X(v), H - 10, (v / 1000) + "k", { "text-anchor": "middle" });
      txt(svg, PL - 26, H - 10, "rpm", { "text-anchor": "end" });
      for (const g of gears) for (const id of IDS) {
        const d = M.sessions[id].dyno[g] || M.sessions[id].dyno[String(g)] || []; if (d.length < 2) continue;
        const up = d.map(p => X(p.rpm).toFixed(1) + "," + Y(p.acc + p.se).toFixed(1)), dn = d.slice().reverse().map(p => X(p.rpm).toFixed(1) + "," + Y(Math.max(0, p.acc - p.se)).toFixed(1));
        el("polygon", { points: up.concat(dn).join(" "), fill: COL[id], opacity: .14 }, svg);
        el("polyline", { points: d.map(p => X(p.rpm).toFixed(1) + "," + Y(p.acc).toFixed(1)).join(" "), fill: "none", stroke: COL[id], "stroke-width": 2, "stroke-dasharray": g == top ? "" : "5 4", "stroke-linejoin": "round" }, svg);
        if (id == IDS[0]) { const e = d[d.length - 1]; txt(svg, X(e.rpm) + 8, Y(e.acc) + 4, GEARN(g), { style: "fill:var(--ink2)" }); }
      }
      const cross = el("line", { y1: PT, y2: H - PB, stroke: "var(--ink2)", opacity: 0 }, svg), hit = el("rect", { x: PL, y: 0, width: W - PL - PR, height: H, fill: "transparent" }, svg);
      const ro = P(2).querySelector(".dy-ro");
      hit.addEventListener("pointermove", e => {
        const r = svg.getBoundingClientRect(), vx = (e.clientX - r.left) / r.width * W, rpm = x0 + (vx - PL) / (W - PL - PR) * (x1 - x0);
        cross.setAttribute("x1", vx); cross.setAttribute("x2", vx); cross.setAttribute("opacity", 1);
        ro.innerHTML = `${Math.round(rpm)} rpm · ` + gears.map(g => GEARN(g) + ": " + IDS.map(id => {
          const d = M.sessions[id].dyno[g] || M.sessions[id].dyno[String(g)] || [], p = d.reduce((a, q) => (!a || Math.abs(q.rpm - rpm) < Math.abs(a.rpm - rpm) ? q : a), null);
          return p && Math.abs(p.rpm - rpm) < 200 ? `<span style="color:${COL[id]}">●</span> ${p.acc.toFixed(3)} g` : `<span style="color:${COL[id]}">●</span> –`;
        }).join(" ")).join(" · ");
      });
      hit.addEventListener("pointerleave", () => cross.setAttribute("opacity", 0));
    })();
    // tabla bandas por salida
    (() => {
      const rows = {};
      for (const id of IDS) for (const k of bandKeys) for (const e of (M.sessions[id].events[k] || [])) {
        const key = `${k}|${e.gear}|${e.salida}`; (rows[key] = rows[key] || { k, gear: e.gear, salida: e.salida, by: {} }); (rows[key].by[id] = rows[key].by[id] || []).push(e.dur);
      }
      const med = a => { const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
      const list = Object.values(rows).filter(r => Object.values(r.by).some(a => a.length >= 2)).sort((a, b) => a.k.localeCompare(b.k) || a.gear - b.gear || a.salida - b.salida);
      let h = `<thead><tr><th>Banda · marcha · salida</th>${IDS.map(id => `<th><span class="dot" style="--c:${COL[id]}"></span>${BT(id)}</th>`).join("")}${others.length ? `<th>Dif.</th>` : ""}</tr></thead><tbody>`;
      let last = "";
      for (const r of list) {
        const [lo, hi] = r.k.split("-"), ref = r.by[REF] ? med(r.by[REF]) : null;
        h += `<tr class="${r.k != last ? "first" : ""}"><td>${(+lo / 1000).toFixed(1)}k→${(+hi / 1000).toFixed(1)}k · ${GEARN(r.gear)} · C${r.salida}</td>` +
          IDS.map(id => r.by[id] ? `<td>${med(r.by[id]).toFixed(2)} s <span class="muted">(${r.by[id].length})</span></td>` : `<td class="muted">–</td>`).join("");
        if (others.length) { const o = r.by[others[0]]; if (ref != null && o) { const p = (med(o) - ref) / ref * 100; h += `<td class="${Math.abs(p) < 2 ? "" : p < 0 ? "g" : "b"}">${sgn(p, 1)}%</td>`; } else h += `<td class="muted">–</td>`; }
        h += "</tr>"; last = r.k;
      }
      P(2).querySelector(".bandtbl").innerHTML = list.length ? h + "</tbody>" : "<tbody><tr><td>No hay subidas completas en estas bandas. Probá con otras RPM en la barra lateral.</td></tr></tbody>";
    })();
    (() => {
      const f = (v, n = 0) => v == null ? "–" : v.toFixed(n);
      const rowsDef = [["RPM máx por vuelta", id => f(M.sessions[id].rpm_max)], ["Velocidad máx (km/h)", id => f(M.sessions[id].kmh_max, 1)],
        [`RPM/km/h en ${GEARN(top)}`, id => f(M.sessions[id].ratio_top, 1)], ["Cambio 1ra→2da: RPM antes", id => f(M.sessions[id].shifts.rpm_antes)],
        ["Cambio 1ra→2da: RPM después", id => f(M.sessions[id].shifts.rpm_despues)], ["Cambios detectados", id => M.sessions[id].shifts.n],
        ["Agua en vueltas rápidas (°C)", id => { const w = S[id].laps.filter(l => S[id].top.includes(l.t) && l.agua != null).map(l => l.agua); return w.length ? avg(w).toFixed(1) : "–"; }]];
      P(2).querySelector(".mtbl").innerHTML = `<thead><tr><th></th>${IDS.map(id => `<th><span class="dot" style="--c:${COL[id]}"></span>${BT(id)}</th>`).join("")}</tr></thead><tbody>` +
        rowsDef.map(([n, fn]) => `<tr><td>${n}</td>${IDS.map(id => `<td>${fn(id)}</td>`).join("")}</tr>`).join("") + "</tbody>";
    })();

    /* ================= VUELTAS ================= */
    P(3).innerHTML = `
      <div class="panel"><h2>Tiempo por vuelta</h2><p class="ink2">Vueltas completas dentro del 10% de la mejor. Pasá el mouse por los puntos para ver agua y velocidad.</p>
        <svg class="evo" viewBox="0 0 1200 340"></svg><div class="legend" style="margin-top:6px">${legend(IDS)}</div></div>
      <div class="panel"><h2>Detalle</h2><div class="tw"><table class="laptbl"></table></div></div>`;
    (() => {
      const svg = P(3).querySelector(".evo"), PL = 70, PB = 32, PT = 14, H = 340, W = 1200;
      const ts = D.sessions.flatMap(s => s.laps.map(l => l.t)), y0 = Math.floor(Math.min(...ts) * 2) / 2, y1 = Math.ceil(Math.max(...ts) * 2) / 2;
      const nmax = Math.max(...D.sessions.flatMap(s => s.laps.map(l => l.lap))), Y = v => PT + (1 - (v - y0) / (y1 - y0)) * (H - PT - PB), XL = n => PL + (n - 1) / Math.max(nmax - 1, 1) * (W - PL - 20);
      for (let v = y0; v <= y1 + 1e-9; v += 0.5) { el("line", { x1: PL, x2: W - 20, y1: Y(v), y2: Y(v), stroke: "var(--grid)" }, svg); txt(svg, PL - 6, Y(v) + 4, v.toFixed(1) + " s", { "text-anchor": "end" }); }
      for (let n = 1; n <= nmax; n++) if (nmax <= 14 || n % 2) txt(svg, XL(n), H - 10, "V" + n, { "text-anchor": "middle" });
      for (const id of IDS) {
        const s = S[id], ml = Object.fromEntries((M.sessions[id].laps || []).map(l => [l.lap, l]));
        el("polyline", { points: s.laps.map(l => XL(l.lap).toFixed(1) + "," + Y(l.t).toFixed(1)).join(" "), fill: "none", stroke: COL[id], "stroke-width": 2 }, svg);
        for (const l of s.laps) { const d = el("circle", { cx: XL(l.lap), cy: Y(l.t), r: 4.5, fill: COL[id], stroke: "var(--panel)", "stroke-width": 2 }, svg); el("title", {}, d).textContent = `${BT(id)} vuelta ${l.lap}: ${l.t.toFixed(3)} s${l.agua != null ? " · agua " + l.agua + " °C" : ""}${ml[l.lap] ? " · " + ml[l.lap].kmh_max.toFixed(1) + " km/h" : ""}`; }
      }
      let h = `<thead><tr><th>Tanda · vuelta</th><th>Tiempo</th><th>Dif. mejor</th><th>Agua °C</th><th>V máx</th><th>RPM máx</th></tr></thead><tbody>`;
      for (const id of IDS) {
        const s = S[id], ml = Object.fromEntries((M.sessions[id].laps || []).map(l => [l.lap, l])), best = Math.min(...s.laps.map(l => l.t));
        s.laps.forEach((l, j) => { const m = ml[l.lap]; h += `<tr class="${j == 0 ? "first" : ""}"><td><span class="dot" style="--c:${COL[id]}"></span>${BT(id)} · V${l.lap}</td><td>${l.t.toFixed(3)}</td><td class="${l.t == best ? "g" : ""}">${l.t == best ? "mejor" : "+" + (l.t - best).toFixed(3)}</td><td>${l.agua ?? "–"}</td><td>${m ? m.kmh_max.toFixed(1) : "–"}</td><td>${m ? Math.round(m.rpm_max) : "–"}</td></tr>`; });
      }
      P(3).querySelector(".laptbl").innerHTML = h + "</tbody>";
    })();
  }
  window.renderReport = renderReport;
})();
