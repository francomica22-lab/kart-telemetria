/* Compartir un reporte: link + QR (se abre en el celular) y PDF.
   El link sube una copia reducida del reporte (sin rutas de archivos, sin la serie completa de la tanda).
   Se lee solo con el codigo exacto y vence a los 30 dias. */
(function () {
  const BASE = "https://zbesblxiezcfurswanev.supabase.co/rest/v1/rpc/";
  const KEY = "sb_publishable_HRIpZ4BfWemVZ8TNA37-EQ_tKN1joRG";
  const VIEWER = "https://francomica22-lab.github.io/kart-telemetria/ver.html";
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // copia del reporte sin datos que no hacen falta para verlo (ni rutas locales)
  function slim(D, conPiloto) {
    const c = JSON.parse(JSON.stringify(D));
    for (const s of c.sessions || []) {
      delete s.path; delete s.serie;
      if (!conPiloto) s.driver = "";
      if (s.setup) { delete s.setup.manual; }
    }
    for (const m of Object.values((c.motor || {}).sessions || {})) {
      delete m.events;
      if (m.fallas) delete m.fallas.eventos;
    }
    c.compartido = { fecha: new Date().toISOString().slice(0, 10) };
    return c;
  }
  async function crear(D, conPiloto) {
    const r = await fetch(BASE + "crear_compartido", { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify({ p_data: slim(D, conPiloto) }) });
    if (!r.ok) throw new Error(r.status == 400 ? "el reporte es demasiado grande" : "no se pudo subir (" + r.status + ")");
    return (await r.json()).toString();
  }
  async function ver(id) {
    const r = await fetch(BASE + "ver_compartido", { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify({ p_id: id }) });
    if (!r.ok) throw new Error("no se pudo cargar el reporte");
    return await r.json();
  }
  function qrSvg(text) {
    if (!window.qrcode) return "";
    const q = qrcode(0, "M"); q.addData(text); q.make();
    return q.createSvgTag({ cellSize: 6, margin: 3, scalable: true });
  }
  function dialog(D, opts) {
    const d = document.createElement("div"); d.className = "modal";
    d.innerHTML = `<div class="mbox share" role="dialog" aria-modal="true" aria-labelledby="cs-t"><h2 id="cs-t">Compartir reporte</h2>
      <div class="cs-step1"><p class="ink2 small">Crea un link para abrir este reporte en cualquier celular o computadora. Cualquiera que tenga el link lo puede ver; vence a los 30 días. No se suben tus archivos.</p>
        <label class="toggle small"><input type="checkbox" id="cs-pil"><span>Incluir el nombre del piloto</span></label>
        <div class="mact"><button class="btn" id="cs-pdf">PDF</button><button class="btn" id="cs-x">Cerrar</button><button class="btn primary" id="cs-go">Crear link y QR</button></div>
        <p class="small" id="cs-st"></p></div>
      <div class="cs-step2" hidden>
        <div class="cs-qr"></div>
        <p class="ink2 small" style="text-align:center">Escaneá con la cámara del teléfono</p>
        <div class="cs-link"><input id="cs-url" readonly><button class="btn" id="cs-copy">Copiar</button></div>
        <div class="mact"><button class="btn" id="cs-pdf2">PDF</button><a class="btn" id="cs-open" target="_blank" rel="noopener">Abrir</a><button class="btn primary" id="cs-x2">Listo</button></div></div></div>`;
    document.body.appendChild(d);
    const close = () => d.remove();
    d.querySelector("#cs-x").addEventListener("click", close); d.querySelector("#cs-x2").addEventListener("click", close);
    const pdf = () => { close(); opts.onPdf && opts.onPdf(); };
    d.querySelector("#cs-pdf").addEventListener("click", pdf); d.querySelector("#cs-pdf2").addEventListener("click", pdf);
    d.querySelector("#cs-go").addEventListener("click", async () => {
      const st = d.querySelector("#cs-st"), btn = d.querySelector("#cs-go");
      btn.disabled = true; st.className = "small ink2"; st.textContent = "Subiendo…";
      try {
        const id = await crear(D, d.querySelector("#cs-pil").checked), url = `${VIEWER}#${id}`;
        d.querySelector(".cs-step1").hidden = true; d.querySelector(".cs-step2").hidden = false;
        d.querySelector(".cs-qr").innerHTML = qrSvg(url);
        d.querySelector("#cs-url").value = url; d.querySelector("#cs-open").href = url;
        d.querySelector("#cs-copy").addEventListener("click", async () => {
          const i = d.querySelector("#cs-url");
          try { await navigator.clipboard.writeText(url); d.querySelector("#cs-copy").textContent = "Copiado"; }
          catch (e) { i.select(); }
        });
      } catch (e) { st.className = "small b"; st.textContent = `No se pudo crear el link: ${e.message}. ¿Hay internet?`; btn.disabled = false; }
    });
  }

  /* ---------- PDF: reporte completo, claro y con todo desplegado ---------- */
  function preparePrint(root) {
    document.body.classList.add("printing");
    root.querySelectorAll("details").forEach(x => x.open = true);
    root.querySelectorAll("p.help").forEach(x => x.hidden = false);
  }
  function printNow(root) {
    preparePrint(root || document.body);
    setTimeout(() => window.print(), 400);
  }
  window.KTR = { dialog, ver, slim, printNow, preparePrint, VIEWER };
})();
