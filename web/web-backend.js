/* Backend de la version web: misma interfaz que la API del programa de escritorio (window.KT). */
(function () {
  const worker = new Worker("py-worker.js", { type: "module" });
  let seq = 0;
  const pending = {};
  worker.onmessage = e => {
    const m = e.data, p = pending[m.id];
    if (!p) return;
    if (m.status) { p.onStatus && p.onStatus(m.status); return; }
    delete pending[m.id];
    m.ok ? p.resolve(m) : p.reject(new Error(m.error || "Error en el análisis"));
  };
  const call = (cmd, payload = {}, transfer = [], onStatus) => new Promise((resolve, reject) => {
    const id = ++seq; pending[id] = { resolve, reject, onStatus };
    worker.postMessage(Object.assign({ id, cmd }, payload), transfer);
  });

  let rows = [], folder = null, ready = null, last = null;
  const VERSION = (document.querySelector('meta[name="kt-version"]') || {}).content || "";

  function pickFiles() {
    return new Promise(resolve => {
      const inp = document.createElement("input");
      inp.type = "file"; inp.multiple = true; inp.webkitdirectory = true; inp.accept = ".xrk";
      inp.addEventListener("change", () => resolve([...inp.files].filter(f => f.name.toLowerCase().endsWith(".xrk"))));
      inp.click();
    });
  }

  window.KT = {
    platform: "web",
    status: null,       // callback(msg) que define app.js
    init() {
      if (!ready) ready = call("init", {}, [], m => KT.status && KT.status(m));
      return ready;
    },
    async get_state() { return { folder, top: 3, bands: null, version: VERSION, platform: "web" }; },
    async pick_folder(fileList) {
      const files = fileList || await pickFiles();
      if (!files.length) return null;
      await KT.init();
      const bufs = await Promise.all(files.map(async (f, i) => ({ key: `${Date.now()}_${i}`, name: f.name, buf: await f.arrayBuffer() })));
      const r = await call("add", { files: bufs }, bufs.map(b => b.buf), m => KT.status && KT.status(m));
      rows = r.rows.sort((a, b) => (a.orden < b.orden ? 1 : -1));
      KT.errors = r.errors;
      const rel = files[0].webkitRelativePath || "";
      folder = rel ? rel.split("/")[0] : `${files.length} archivos`;
      return folder;
    },
    async list_sessions() { return { folder, rows, errors: KT.errors || [] }; },
    async compare(paths, opts) {
      try {
        const r = await call("compare", { paths, top: opts.top || 3, bands: opts.bands || [] });
        last = r.data; return { data: r.data };
      } catch (e) { return { error: `No se pudo comparar: ${e.message}. Revisá que sean tandas de la misma pista con vueltas completas.` }; }
    },
    async export_html() {
      if (!last) return { error: "Primero compará tandas." };
      const [css, js1, js2] = await Promise.all([fetch("styles.css").then(r => r.text()), fetch("report-extra.js").then(r => r.text()), fetch("report.js").then(r => r.text())]);
      const js = js1 + "\n" + js2;
      const ids = last.sessions.map(s => s.top[0].toFixed(3));
      const data = JSON.stringify(last).replace(/<\//g, "<\\/");
      const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${ids.join(" vs ")}</title><style>${css}\nhtml,body{height:auto} body{overflow:auto}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}<\/script><script>renderReport(${data}, document.getElementById("app"), {});<\/script></body></html>`;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
      a.download = `tandas_${ids.join("_vs_")}.html`;
      document.body.appendChild(a); a.click(); a.remove();
      return { path: a.download };
    },
  };
})();
