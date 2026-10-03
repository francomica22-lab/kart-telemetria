/* Web Worker: corre el mismo analisis en Python dentro del navegador (Pyodide). Los archivos no salen de la PC. */
const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/";
import { loadPyodide } from "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide.mjs";

let py = null;
const say = (id, msg) => postMessage({ id, status: msg });

async function init(id) {
  say(id, "Cargando Python en el navegador…");
  py = await loadPyodide({ indexURL: PYODIDE });
  say(id, "Cargando librerías de análisis (solo la primera vez tarda)…");
  await py.loadPackage(["numpy", "pandas", "scipy", "pyarrow", "micropip"]);
  say(id, "Cargando lector de archivos AiM…");
  await py.pyimport("micropip").install("libxrk==0.13.0");
  py.FS.mkdirTree("/home/pyodide/kt");
  py.FS.mkdirTree("/data");
  for (const m of ["kartlib", "motor", "tandas", "sesiones"]) {
    const r = await fetch(`app/${m}.py`, { cache: "no-cache" });
    if (!r.ok) throw new Error(`No se pudo cargar ${m}.py`);
    py.FS.writeFile(`/home/pyodide/kt/${m}.py`, await r.text());
  }
  py.runPython(`
import sys, json, os
sys.path.insert(0, "/home/pyodide/kt")
from sesiones import session_info, clean
from tandas import build_data
def _info(path, name):
    return json.dumps(clean(session_info(path, name)), ensure_ascii=False)
def _compare(paths_json, top, bands_json):
    bands = [tuple(int(x) for x in b) for b in json.loads(bands_json)] or None
    return json.dumps(clean(build_data(json.loads(paths_json), top=int(top), bands=bands, log=lambda *a: None)), ensure_ascii=False, allow_nan=False)
def _remove(path):
    try: os.remove(path)
    except Exception: pass
`);
}

onmessage = async e => {
  const { id, cmd } = e.data;
  try {
    if (cmd == "init") { await init(id); postMessage({ id, ok: true }); return; }
    if (cmd == "add") {
      const rows = [], errors = [];
      for (const f of e.data.files) {
        py.FS.mkdirTree(`/data/${f.key}`);
        const path = `/data/${f.key}/${f.name.replace(/[\/]/g, "_")}`;   // conserva el nombre: el numero de tanda sale de ahi
        py.FS.writeFile(path, new Uint8Array(f.buf));
        try { rows.push(JSON.parse(py.globals.get("_info")(path, f.name))); }
        catch (err) { errors.push(`${f.name}: ${String(err.message || err).split("\n").pop()}`); py.globals.get("_remove")(path); }
        postMessage({ id, status: `Leyendo tandas… ${rows.length + errors.length}/${e.data.files.length}` });
      }
      postMessage({ id, ok: true, rows, errors }); return;
    }
    if (cmd == "compare") {
      const out = py.globals.get("_compare")(JSON.stringify(e.data.paths), e.data.top, JSON.stringify(e.data.bands || []));
      postMessage({ id, ok: true, data: JSON.parse(out) }); return;
    }
  } catch (err) {
    postMessage({ id, ok: false, error: String(err.message || err).split("\n").filter(Boolean).slice(-1)[0] });
  }
};
