/* Logica de la ventana: lista de tandas, seleccion y analisis.
   Escritorio: API de Python via pywebview. Web: window.KT (Pyodide en un Web Worker). */
(function () {
  const PAL = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)"];
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  let rows = [], sel = [], last = null;
  const api = () => window.KT || (window.pywebview && window.pywebview.api);
  const IS_WEB = !!window.KT;
  const DOWNLOAD = "https://github.com/francomica22-lab/kart-telemetria/releases/latest/download/AnalisisKarting-windows.zip";
  let VERSION = "";
  const rowOf = p => rows.find(r => r.path == p);

  function toast(msg, err) {
    const t = document.createElement("div"); t.className = "toast" + (err ? " err" : ""); t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), err ? 9000 : 3500);
  }
  function busy(on, msg) {
    let b = document.querySelector(".busy");
    if (on && !b) { b = document.createElement("div"); b.className = "busy"; b.innerHTML = `<div class="spin"></div><div class="ink2"></div>`; $("main").appendChild(b); }
    if (b) { if (on) b.lastChild.textContent = msg || "Analizando…"; else b.remove(); }
  }
  const KT_status = m => { const b = document.querySelector(".busy .ink2"); if (b) b.textContent = m; };
  const colorOf = p => { const i = sel.indexOf(p); return i < 0 ? null : PAL[i % PAL.length]; };

  const label = r => r.mejor_n ? r.mejor : "sin vueltas";
  const tip = r => [`Tanda ${r.id} · ${r.fecha} ${r.hora}`, r.piloto && `Piloto: ${r.piloto}`, r.kart && `Vehículo: ${r.kart}`, r.pista && `Pista: ${r.pista}`,
    r.campeonato && `Campeonato: ${r.campeonato}`, r.tipo && `Tipo de sesión: ${r.tipo}`, `Vueltas: ${r.vueltas}`, r.archivo && `Archivo: ${r.archivo} (${r.kb} kB)`,
    r.comentario && `Comentario: ${r.comentario}`].filter(Boolean).join("\n");

  /* ---------- inicio: circuitos a la izquierda, tandas del circuito por dia a la derecha (como Race Studio) ---------- */
  let circ = null, view = "home";
  try { circ = localStorage.getItem("kt-circ"); } catch (e) { }
  const pistaDe = r => r.pista || "Sin nombre de pista";
  const sesionDe = r => { const c = (r.comentario || "").split(" · "); return { s: c[0] || "", resto: c.slice(1).join(" · ") }; };
  const visibles = () => {
    const q = $("q").value.toLowerCase().trim(), only = $("onlylaps").checked;
    return rows.filter(r => (!only || r.vueltas > 0 || sel.includes(r.path)) &&
      (!q || [r.id, r.fecha, r.hora, r.kart, r.pista, r.comentario, r.mejor, r.campeonato, r.piloto, r.tipo].join(" ").toLowerCase().includes(q)));
  };
  const rango = rs => { const o = rs.map(r => r.orden).sort(), f = x => rs.find(r => r.orden == x).fecha; const a = f(o[0]), b = f(o[o.length - 1]); return a == b ? a : `${a.slice(0, 5)} – ${b}`; };
  function renderList() {
    const vis = visibles();
    if (!vis.length) { $("list").innerHTML = `<p class="muted pad">${rows.length ? "Ninguna tanda coincide." : "No hay archivos .xrk en esta carpeta."}</p>`; renderHome(); return; }
    const groups = {};
    for (const r of vis) (groups[pistaDe(r)] = groups[pistaDe(r)] || []).push(r);
    // el circuito mas reciente primero
    const keys = Object.keys(groups).sort((a, b) => (groups[a].map(r => r.orden).sort().pop() < groups[b].map(r => r.orden).sort().pop() ? 1 : -1));
    if (circ && !groups[circ] && circ != "*") circ = null;
    if (!circ) circ = keys[0];
    const item = (k, rs, label) => {
      const best = rs.filter(r => r.mejor_n).map(r => r.mejor_n), nsel = rs.filter(r => sel.includes(r.path)).length;
      return `<button class="circ-row${circ == k ? " on" : ""}" data-c="${esc(k)}"><span class="cn">${esc(label || k)}</span>${nsel ? `<span class="cs">${nsel}</span>` : ""}
        <span class="cm">${esc(rango(rs))} · ${rs.length} tanda${rs.length > 1 ? "s" : ""}${best.length ? ` · mejor ${tVuelta(Math.min(...best))}` : ""}</span></button>`;
    };
    $("list").innerHTML = `<div class="eyebrow pad-x">Circuitos</div>` + keys.map(k => item(k, groups[k])).join("") + (keys.length > 1 ? item("*", vis, "Todos los circuitos") : "");
    renderHome();
  }
  function renderHome() {
    const H = $("home"); if (!H) return;
    if (!rows.length) { H.hidden = true; return; }
    const vis = visibles().filter(r => circ == "*" || pistaDe(r) == circ);
    const days = {};
    for (const r of vis) (days[r.fecha] = days[r.fecha] || []).push(r);
    const dk = Object.keys(days).sort((a, b) => (days[a][0].orden < days[b][0].orden ? 1 : -1));
    // columnas vacias en todas las tandas (por ejemplo campeonato) no se muestran
    const vacia = k => vis.every(r => !(k == "com" ? sesionDe(r).resto : r[k]));
    const hid = { pil: vacia("piloto"), veh: vacia("kart"), camp: vacia("campeonato"), com: vacia("com") };
    const cols = `<colgroup><col class="c-chk"><col class="c-hr"><col class="c-nv"><col class="c-best"><col class="c-ses"><col class="c-pil${hid.pil ? " hide" : ""}"><col class="c-veh${hid.veh ? " hide" : ""}"><col class="c-camp${hid.camp ? " hide" : ""}"><col class="c-com${hid.com ? " hide" : ""}"><col class="c-id"></colgroup>`;
    const head = `<tr class="th"><th></th><th>Hora</th><th>Vueltas</th><th>Mejor</th><th>Sesión</th><th class="c-pil${hid.pil ? " hide" : ""}">Piloto</th><th class="c-veh${hid.veh ? " hide" : ""}">Vehículo</th><th class="c-camp${hid.camp ? " hide" : ""}">Campeonato</th><th class="c-com${hid.com ? " hide" : ""}">Comentario</th><th class="c-id">Tanda</th></tr>`;
    const body = dk.map(d => {
      const rs = days[d].sort((a, b) => (a.orden < b.orden ? 1 : -1)), best = rs.filter(r => r.mejor_n).map(r => r.mejor_n);
      const allSel = rs.every(r => sel.includes(r.path));
      return `<tbody><tr class="dayrow"><td><button class="chk${allSel ? " on" : ""}" data-day="${esc(d)}" title="${allSel ? "Quitar" : "Elegir"} todas las tandas del día" aria-pressed="${allSel}"></button></td>
        <td colspan="9"><b>${esc(d)}</b> <span class="muted">· ${rs.length} tanda${rs.length > 1 ? "s" : ""}${best.length ? ` · mejor <b class="num">${tVuelta(Math.min(...best))}</b>` : ""}${circ == "*" ? " · " + esc([...new Set(rs.map(pistaDe))].join(", ")) : ""}</span></td></tr>` +
        rs.map(r => {
          const c = colorOf(r.path), se = sesionDe(r), isBest = r.mejor_n && r.mejor_n == Math.min(...best);
          return `<tr class="srow${c ? " sel" : ""}${r.vueltas ? "" : " nolap"}" data-p="${esc(r.path)}" style="--c:${c || "transparent"}" tabindex="0" aria-selected="${!!c}" title="${esc(tip(r))}">
            <td><span class="chk${c ? " on" : ""}"></span></td><td class="num">${esc(r.hora)}</td><td class="num">${r.vueltas || "–"}</td>
            <td class="num best${isBest ? " top" : ""}">${r.mejor_n ? tVuelta(r.mejor_n) : "–"}</td>
            <td class="ses">${esc(se.s || r.tipo || "")}</td><td class="c-pil${hid.pil ? " hide" : ""}">${esc(r.piloto)}</td><td class="c-veh${hid.veh ? " hide" : ""}">${esc(r.kart)}</td><td class="c-camp${hid.camp ? " hide" : ""}">${esc(r.campeonato)}</td>
            <td class="c-com muted${hid.com ? " hide" : ""}">${esc(se.resto)}</td><td class="c-id num muted">#${esc(r.id)}</td></tr>`;
        }).join("") + `</tbody>`;
    }).join("");
    const all = circ == "*" ? visibles() : vis;
    H.innerHTML = `<div class="home-h"><div><div class="eyebrow">${circ == "*" ? "Todos los circuitos" : "Circuito"}</div><h1>${esc(circ == "*" ? "Todas las tandas" : circ)}</h1>
        <p class="muted">${all.length ? `${esc(rango(all))} · ${dk.length} día${dk.length > 1 ? "s" : ""} · ${all.length} tanda${all.length > 1 ? "s" : ""}` : "Sin tandas"}</p></div>
        ${last ? `<button class="btn ghost" id="back-rep">Volver al análisis</button>` : ""}</div>
      <p class="ink2 small">Tocá una tanda para analizarla, o varias para compararlas. Abajo a la izquierda está el botón para comparar.</p>
      <div class="tw"><table class="stbl">${cols}<thead>${head}</thead>${body || `<tbody><tr><td colspan="10" class="muted">Ninguna tanda coincide.</td></tr></tbody>`}</table></div>`;
    const br = $("back-rep"); if (br) br.addEventListener("click", () => show("report"));
  }
  function show(v) {
    if (v == "home") renderHome();
    view = v;
    const hasRep = !!last;
    $("empty").hidden = rows.length > 0 || (v == "report" && hasRep);
    $("home").hidden = v != "home" || !rows.length;
    $("report").hidden = v != "report" || !hasRep;
    const t = $("tohome"); if (t) t.hidden = v != "report";
    $("main").scrollTop = 0;
  }

  function renderTray() {
    const n = sel.length;
    $("go").disabled = n < 1;
    $("go").textContent = n >= 2 ? `Comparar ${n} tandas` : n == 1 ? "Analizar esta tanda" : "Comparar";
    if (!n) { $("tray").innerHTML = `<span class="muted">Tocá una tanda para analizarla, o dos o más para compararlas.</span>`; return; }
    const pistas = new Set(sel.map(p => (rowOf(p) || {}).pista));
    $("tray").innerHTML = sel.map(p => `<span class="tchip" style="--c:${colorOf(p)}">${esc(label(rowOf(p) || {}))} <small>${esc((rowOf(p) || {}).hora || "")}</small><button data-rm="${esc(p)}" title="Quitar">×</button></span>`).join("") +
      (n == 1 ? `<span class="muted">o elegí otra para comparar</span>` : "") +
      (pistas.size > 1 ? `<span class="warnline">Configuraciones de pista distintas (${[...pistas].map(esc).join(", ")}). Sirve si el trazado es el mismo.</span>` : "");
  }

  function toggle(p) {
    const i = sel.indexOf(p);
    if (i >= 0) sel.splice(i, 1);
    else { if (sel.length >= 5) { toast("Máximo 5 tandas por comparación."); return; } sel.push(p); }
    renderList(); renderTray();
  }

  $("list").addEventListener("click", e => {
    const c = e.target.closest(".circ-row"); if (!c) return;
    circ = c.dataset.c; try { localStorage.setItem("kt-circ", circ); } catch (x) { }
    renderList(); show("home");
  });
  $("home").addEventListener("click", e => {
    const d = e.target.closest("[data-day]");
    if (d) {
      const rs = visibles().filter(r => r.fecha == d.dataset.day && (circ == "*" || pistaDe(r) == circ)), on = rs.every(r => sel.includes(r.path));
      for (const r of rs) { const i = sel.indexOf(r.path); if (on && i >= 0) sel.splice(i, 1); else if (!on && i < 0) { if (sel.length >= 5) { toast("Máximo 5 tandas por comparación."); break; } sel.push(r.path); } }
      renderList(); renderTray(); return;
    }
    const row = e.target.closest(".srow"); if (row) toggle(row.dataset.p);
  });
  $("home").addEventListener("keydown", e => { if ((e.key == "Enter" || e.key == " ") && e.target.classList.contains("srow")) { e.preventDefault(); toggle(e.target.dataset.p); } });
  $("tray").addEventListener("click", e => { const b = e.target.closest("[data-rm]"); if (b) toggle(b.dataset.rm); });
  $("q").addEventListener("input", renderList);
  $("onlylaps").addEventListener("change", renderList);

  async function scan() {
    $("list").innerHTML = `<p class="muted pad">Leyendo tandas…</p>`;
    try {
      const r = await api().list_sessions();
      rows = r.rows.slice().sort((a, b) => (a.orden < b.orden ? 1 : -1));
      if (!r.folder) { emptyList(); return; }
      const parts = r.folder.split(/[\\/]/).filter(Boolean);
      $("fname").textContent = parts[parts.length - 1] || r.folder;
      $("path").textContent = r.folder; $("pick").title = r.folder + " · tocá para cambiar";
      sel = sel.filter(p => rows.some(x => x.path == p));
      renderList(); renderTray(); show(last && view == "report" ? "report" : "home");
      if (r.errors && r.errors.length) toast(`${r.errors.length} archivo(s) no se pudieron leer.`, true);
    } catch (e) { $("list").innerHTML = `<p class="b pad">${esc(e.message || e)}</p>`; }
  }

  function emptyList() {
    $("fname").textContent = "Elegí una carpeta"; $("path").textContent = IS_WEB ? "Tus archivos no salen de tu PC" : "La carpeta donde descargás las tandas";
    $("list").innerHTML = `<div class="pad pick-hint"><p>Elegí la carpeta donde guardás los archivos <b>.xrk</b> de la MyChron (la de Race Studio o cualquier otra).</p>
      <button class="btn" id="pick2">Elegir carpeta</button>${IS_WEB ? `<p class="muted">También podés arrastrar la carpeta o los archivos acá.</p>` : ""}</div>`;
    $("pick2").addEventListener("click", pick);
  }
  async function pick(fileList) {
    try {
      if (IS_WEB) $("list").innerHTML = `<p class="muted pad" id="stat">Preparando…</p>`;
      const f = await api().pick_folder(fileList instanceof Array ? fileList : undefined);
      if (f) scan(); else if (IS_WEB && !rows.length) emptyList();
    } catch (e) { toast("Error: " + (e.message || e), true); if (!rows.length) emptyList(); }
  }
  $("pick").addEventListener("click", () => pick());
  if (IS_WEB) {
    KT.status = m => { const st = $("stat"); if (st) st.textContent = m; const b = document.querySelector(".busy .ink2"); if (b) b.textContent = m; };
    const collect = async items => {
      const out = [];
      const walk = entry => new Promise(res => {
        if (entry.isFile) entry.file(f => { if (f.name.toLowerCase().endsWith(".xrk")) out.push(f); res(); }, () => res());
        else if (entry.isDirectory) { const rd = entry.createReader(); const all = []; const next = () => rd.readEntries(async es => { if (!es.length) { for (const x of all) await walk(x); res(); } else { all.push(...es); next(); } }, () => res()); next(); }
        else res();
      });
      for (const it of items) { const en = it.webkitGetAsEntry && it.webkitGetAsEntry(); if (en) await walk(en); }
      return out;
    };
    document.addEventListener("dragover", e => { e.preventDefault(); document.body.classList.add("drop"); });
    document.addEventListener("dragleave", e => { if (!e.relatedTarget) document.body.classList.remove("drop"); });
    document.addEventListener("drop", async e => {
      e.preventDefault(); document.body.classList.remove("drop");
      const videos = [...e.dataTransfer.files].filter(f => window.KTX && KTX.esVideo(f));
      if (videos.length) {
        // un video soltado en cualquier lado va a los recuadros de video del análisis abierto, en orden
        const boxes = [...document.querySelectorAll(".vbox")].filter(b => b.offsetParent && b.querySelector("input[type=file]"));
        if (boxes.length) { videos.slice(0, boxes.length).forEach((f, i) => KTX.cargarVideo(boxes[i], f)); return; }
        return toast("Eso es un video. Primero analizá la tanda, después abrí la parte Video y cargalo ahí.", true);
      }
      const files = await collect([...e.dataTransfer.items]);
      if (files.length) pick(files); else toast("No encontré archivos .xrk en lo que soltaste.", true);
    });
  }
  $("reload").addEventListener("click", scan);

  /* ---------- clima (Open-Meteo, gratis, sin clave) ---------- */
  async function addWeather(D) {
    D.clima = {};
    await Promise.all(D.sessions.map(async s => {
      if (s.lat0 == null || !s.date || s.date.length != 10) return;
      const iso = `${s.date.slice(6)}-${s.date.slice(0, 2)}-${s.date.slice(3, 5)}`;
      const key = `kt-clima-${iso}-${s.lat0.toFixed(2)}-${s.lon0.toFixed(2)}`;
      let j = null; try { j = JSON.parse(localStorage.getItem(key)); } catch (e) { }
      if (!j) {
        const days = (Date.now() - Date.parse(iso)) / 864e5;
        const base = days < 80 ? "https://api.open-meteo.com/v1/forecast" : "https://archive-api.open-meteo.com/v1/archive";
        const url = `${base}?latitude=${s.lat0.toFixed(4)}&longitude=${s.lon0.toFixed(4)}&hourly=temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,wind_direction_10m&start_date=${iso}&end_date=${iso}&timezone=auto`;
        const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 6000);
        try {
          const r = await fetch(url, { signal: ctl.signal });
          if (r.ok) { j = await r.json(); if (j.hourly && j.hourly.temperature_2m.some(x => x != null)) { if (days > 2) try { localStorage.setItem(key, JSON.stringify(j)); } catch (e) { } } else j = null; }
        } catch (e) { j = null; } finally { clearTimeout(tm); }
      }
      if (!j) return;
      const [h, m] = (s.hour || "12:00").split(":").map(Number), x = Math.min(22.99, h + m / 60), H = j.hourly, i = Math.floor(x), fr = x - i;
      const lerp = k => H[k][i] == null ? null : H[k][i] + ((H[k][i + 1] ?? H[k][i]) - H[k][i]) * fr;
      const T = lerp("temperature_2m"), RH = lerp("relative_humidity_2m"), P = lerp("surface_pressure");
      if (T == null || RH == null || P == null) return;
      const es = 6.1078 * Math.pow(10, 7.5 * T / (T + 237.3)), pv = RH / 100 * es, pd = P - pv;
      const rho = pd * 100 / (287.05 * (T + 273.15)) + pv * 100 / (461.495 * (T + 273.15));
      D.clima[s.id] = { T, RH, P, W: lerp("wind_speed_10m") || 0, WD: H.wind_direction_10m[Math.round(x)], rho };
    }));
  }

  /* ---------- setup: escritorio guarda junto al .xrk; web guarda en este navegador ---------- */
  const setupKey = s => `kt-setup-${(s.path || "").split(/[\\/]/).pop()}`;
  function applyWebSetups(D) {
    for (const s of D.sessions) {
      let m = null; try { m = JSON.parse(localStorage.getItem(setupKey(s))); } catch (e) { }
      if (m) { s.setup = s.setup || {}; s.setup.manual = m; s.setup.valores = Object.assign({}, s.setup.auto || {}, m); }
    }
  }
  async function saveSetup(s, vals) {
    if (IS_WEB) { try { localStorage.setItem(setupKey(s), JSON.stringify(vals)); } catch (e) { return { error: "No se pudo guardar en este navegador." }; } toast("Setup guardado en este navegador."); return { valores: vals }; }
    const r = await api().save_setup(s.path, vals);
    if (!r.error) toast("Setup guardado junto al archivo de la tanda.");
    return r;
  }
  async function exportPdf() {
    const r = IS_WEB ? await api().export_html({ pdf: true }) : await api().export_pdf();
    if (r && r.error) toast(r.error, true); else toast("Se abrió el reporte para imprimir: elegí \"Guardar como PDF\".");
  }
  async function exportReport() {
    const r = await api().export_html();
    if (r && r.path) toast(IS_WEB ? "Reporte descargado: " + r.path : "Reporte guardado en " + r.path); else if (r && r.error) toast(r.error, true);
  }

  $("go").addEventListener("click", async () => {
    const bands = [[+$("b1a").value, +$("b1b").value], [+$("b2a").value, +$("b2b").value]].filter(b => b[0] > 0 && b[1] > b[0]);
    const opts = { top: Math.max(1, Math.min(5, +$("top").value || 3)), bands };
    busy(true, IS_WEB ? `Analizando ${sel.length} tandas en el navegador…` : `Analizando ${sel.length} tandas…`);
    try {
      const res = await api().compare(sel, opts);
      if (res.error) { toast(res.error, true); return; }
      last = res.data;
      if (IS_WEB) applyWebSetups(last);
      KT_status("Buscando el clima de cada tanda…");
      await addWeather(last);
      const colors = {}; sel.forEach((p, i) => { const r = rowOf(p); if (r) colors[r.id] = PAL[i % PAL.length]; });
      show("report");
      renderReport(last, $("report"), { colors, saveSetup, onExport: exportReport, onShare: () => KTR.dialog(last, { onPdf: exportPdf }), onKartChange: () => window.KTS && KTS.share(last, { version: VERSION, web: IS_WEB }) });
      if (window.KTS) KTS.share(last, { version: VERSION, web: IS_WEB });   // resumen anonimo (si esta activado)
      $("main").scrollTop = 0;
    } catch (e) { toast("Error: " + (e.message || e), true); }
    finally { busy(false); }
  });

  function topbar() {
    const tb = $("topbar");
    if (IS_WEB) {
      tb.innerHTML = `<button class="btn ghost" id="tohome" hidden>← Tandas</button><span class="ver">versión web ${esc(VERSION)}</span><a class="btn dl" href="${DOWNLOAD}">Descargar para Windows</a>`;
      $("tohome").addEventListener("click", () => show("home"));
      return;
    }
    tb.innerHTML = `<button class="btn ghost" id="tohome" hidden>← Tandas</button><span class="ver">v${esc(VERSION)}</span>`;
    $("tohome").addEventListener("click", () => show("home"));
    api().check_update().then(u => {
      if (!u || !u.available) return;
      tb.insertAdjacentHTML("afterbegin", `<button class="upd" id="upd" title="Hay una versión nueva"><span class="bang">!</span>Actualización ${esc(u.version)}</button>`);
      $("upd").addEventListener("click", () => updateDialog(u));
    }).catch(() => { });
  }
  function updateDialog(u) {
    const d = document.createElement("div"); d.className = "modal";
    d.innerHTML = `<div class="mbox" role="dialog" aria-modal="true" aria-labelledby="mt"><h2 id="mt">Nueva versión ${esc(u.version)}</h2>
      <p class="ink2">Tenés la ${esc(VERSION)}. La descarga pesa unos ${u.size_mb} MB y el programa se reinicia solo.</p>
      ${u.notes ? `<div class="notes">${esc(u.notes).replace(/\n/g, "<br>")}</div>` : ""}
      <div class="bar" hidden><i></i></div><p class="ink2 small" id="ust"></p>
      <div class="mact"><button class="btn" id="ulater">Más tarde</button><button class="btn primary" id="unow">Actualizar ahora</button></div></div>`;
    document.body.appendChild(d);
    $("ulater").addEventListener("click", () => d.remove());
    $("unow").addEventListener("click", async () => {
      $("unow").disabled = true; $("ulater").disabled = true; d.querySelector(".bar").hidden = false; $("ust").textContent = "Descargando…";
      const t = setInterval(async () => { const f = await api().update_progress(); d.querySelector(".bar i").style.width = (f * 100).toFixed(0) + "%"; }, 400);
      const r = await api().do_update(); clearInterval(t);
      if (r.error) { $("ust").textContent = r.error; $("ulater").disabled = false; $("ulater").textContent = "Cerrar"; }
      else { d.querySelector(".bar i").style.width = "100%"; $("ust").textContent = "Listo. Abriendo la versión nueva…"; }
    });
  }

  /* ---------- reportar un problema (llega por mail via FormSubmit) ---------- */
  const REPORT_URL = "https://formsubmit.co/ajax/franco.mica22@gmail.com";
  window.addEventListener("error", e => { window.KT_LAST_ERROR = String(e.message || e.error || ""); });
  window.addEventListener("unhandledrejection", e => { window.KT_LAST_ERROR = String((e.reason && e.reason.message) || e.reason || ""); });
  function reportDialog() {
    const d = document.createElement("div"); d.className = "modal";
    d.innerHTML = `<form class="mbox" role="dialog" aria-modal="true" aria-labelledby="rt"><h2 id="rt">Reportar un problema</h2>
      <p class="ink2 small">Contanos qué pasó o qué te gustaría que mejore. Le llega directo a quien desarrolla la app.</p>
      <label for="rp-msg" class="small">Qué pasó</label><textarea id="rp-msg" rows="5" required placeholder="Ej.: elegí dos tandas de Zárate y no aparece la curva 3…"></textarea>
      <label for="rp-who" class="small">Tu nombre o contacto (opcional)</label><input id="rp-who" autocomplete="name">
      <label class="toggle small"><input type="checkbox" id="rp-tech" checked><span>Incluir datos técnicos (versión, tandas elegidas, último error)</span></label>
      <p class="small" id="rp-st"></p>
      <div class="mact"><button type="button" class="btn" id="rp-cancel">Cancelar</button><button type="submit" class="btn primary">Enviar</button></div></form>`;
    document.body.appendChild(d);
    d.querySelector("#rp-cancel").addEventListener("click", () => d.remove());
    d.querySelector("form").addEventListener("submit", async e => {
      e.preventDefault();
      const msg = d.querySelector("#rp-msg").value.trim(); if (!msg) return;
      const tech = d.querySelector("#rp-tech").checked ? [
        `Versión: ${VERSION} (${IS_WEB ? "web" : "escritorio"})`, `Navegador: ${navigator.userAgent}`,
        `Tandas elegidas: ${sel.map(p => { const r = rowOf(p) || {}; return `${r.mejor} ${r.fecha} ${r.hora} ${r.pista} (#${r.id})`; }).join("; ") || "ninguna"}`,
        `Último error: ${window.KT_LAST_ERROR || "ninguno"}`].join("\n") : "";
      const st = d.querySelector("#rp-st"); st.textContent = "Enviando…"; st.className = "small ink2";
      try {
        const r = await fetch(REPORT_URL, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ _subject: `Análisis Karting · reporte (${IS_WEB ? "web" : "escritorio"} ${VERSION})`, _template: "box", nombre: d.querySelector("#rp-who").value.trim() || "anónimo", mensaje: msg, datos_tecnicos: tech }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j.success === "false" || j.success === false) throw new Error(j.message || "error");
        d.remove(); toast("¡Gracias! El reporte se envió.");
      } catch (err) {
        st.className = "small b";
        st.textContent = "No se pudo enviar (¿sin internet?). Copiá el texto y mandalo por WhatsApp.";
        try { await navigator.clipboard.writeText(msg + (tech ? "\n\n" + tech : "")); st.textContent += " Ya lo copié al portapapeles."; } catch (e2) { }
      }
    });
  }
  $("report-btn").addEventListener("click", reportDialog);

  async function boot() {
    try {
      const st = await api().get_state();
      VERSION = st.version || "";
      $("top").value = st.top || 3;
      if (st.bands && st.bands.length) [[$("b1a"), $("b1b")], [$("b2a"), $("b2b")]].forEach((p, i) => { if (st.bands[i]) { p[0].value = st.bands[i][0]; p[1].value = st.bands[i][1]; } });
    } catch (e) { }
    topbar();
    if (window.KTS) {
      const sh = $("share-on"); sh.checked = KTS.enabled();
      sh.addEventListener("change", () => { KTS.setEnabled(sh.checked); toast(sh.checked ? "Compartir datos anónimos: activado." : "Compartir datos anónimos: desactivado."); });
      document.addEventListener("kt-share-change", () => { sh.checked = KTS.enabled(); });
      $("share-info").addEventListener("click", () => KTS.notice(true));
      KTS.notice(false); KTS.flush();
    }
    if (IS_WEB) {
      $("empty").innerHTML = `<div class="eyebrow">Análisis de telemetría AiM MyChron</div>
        <h1>Compará tus tandas, curva por curva</h1>
        <p>Elegí la carpeta con tus archivos <b>.xrk</b> (los que descarga Race Studio 3), tocá dos tandas y compará.
        Te dice cuánto perdés, en qué curva, si es manejo o agarre, y cómo rindió el motor.</p>
        <p class="ink2">Todo se calcula en tu navegador: tus archivos no se suben a ningún lado. <a href="privacidad.html" target="_blank" rel="noopener" style="color:var(--ink2)">Privacidad</a></p>
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:6px"><button class="btn primary" style="width:auto" id="pick3">Elegir carpeta de tandas</button>
        <a class="btn" style="text-decoration:none;padding:11px 14px" href="${DOWNLOAD}">Descargar programa para Windows</a></div>
        <ol class="steps">
          <li><b>Simple</b><span>Cuánto perdés, dónde y qué hacer. Para empezar.</span></li>
          <li><b>Detallado</b><span>Curvas, sectores, círculo de fricción y G.</span></li>
          <li><b>Motor</b><span>Rendimiento a igual RPM, subidas y cambios.</span></li>
          <li><b>Programa</b><span>Sin internet y se actualiza solo.</span></li>
        </ol>`;
      $("pick3").addEventListener("click", () => pick());
      emptyList(); KT.init().catch(e => toast("No se pudo cargar el análisis: " + e.message, true)); }
    else scan();
  }
  if (api()) boot(); else window.addEventListener("pywebviewready", boot);
})();
