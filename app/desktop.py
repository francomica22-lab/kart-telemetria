"""Analisis Karting: app de escritorio offline (ventana nativa con WebView2).

Uso:  python desktop.py
      AnalisisKarting.exe --prueba a.xrk b.xrk   (genera el reporte sin abrir la ventana)
"""
import json, os, sys, threading, traceback

import webview

import updater

GOOGLE_PORT = 53682   # ingreso con Google: Supabase vuelve a http://127.0.0.1:53682/callback
from sesiones import session_info, clean
from tandas import build_data, render_html
import setup_kart  # noqa: F401 (lo usa save_setup)

BASE = getattr(sys, "_MEIPASS", os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WEB = os.path.join(BASE, "web")
CFG_DIR = os.path.join(os.environ.get("APPDATA", os.path.expanduser("~")), "AnalisisKarting")
CFG = os.path.join(CFG_DIR, "config.json")
CACHE = os.path.join(CFG_DIR, "sesiones.json")
CACHE_VER = 3


def read_version():
    try:
        return open(os.path.join(BASE, "VERSION"), encoding="utf8").read().strip()
    except Exception:
        return "0.0.0"


VERSION = read_version()


def load_json(path, default):
    try:
        with open(path, encoding="utf-8-sig") as f:
            return json.load(f)
    except Exception:
        return default


def save_json(path, data):
    os.makedirs(CFG_DIR, exist_ok=True)
    with open(path, "w", encoding="utf8") as f:
        json.dump(data, f, ensure_ascii=False)


class Api:
    def __init__(self):
        self.cfg = load_json(CFG, {})
        cache = load_json(CACHE, {})
        self.cache = cache.get("rows", {}) if cache.get("v") == CACHE_VER else {}
        self.last = None
        self.lock = threading.Lock()
        self.update = None
        self.progress = 0.0

    def _folder(self):
        f = self.cfg.get("carpeta")
        return f if f and os.path.isdir(f) else None

    def get_state(self):
        return {"folder": self._folder(), "top": self.cfg.get("top", 3), "bands": self.cfg.get("bands"),
                "version": VERSION, "platform": "desktop"}

    def pick_folder(self):
        r = webview.windows[0].create_file_dialog(webview.FOLDER_DIALOG, directory=self._folder() or os.path.expanduser("~"))
        if r:
            self.cfg["carpeta"] = r[0] if isinstance(r, (list, tuple)) else r
            save_json(CFG, self.cfg)
            return self.cfg["carpeta"]
        return None

    def list_sessions(self):
        folder = self._folder()
        if not folder:
            return {"folder": None, "rows": [], "errors": []}
        files = []
        for dp, _, fs in os.walk(folder):
            files += [os.path.join(dp, f) for f in fs if f.lower().endswith((".xrk", ".xrz"))]
        rows, errors, new = [], [], False
        for p in files:
            key = f"{p}|{os.path.getmtime(p)}"
            if key not in self.cache:
                try:
                    self.cache[key] = session_info(p)
                    new = True
                except Exception as e:
                    errors.append(f"{os.path.basename(p)}: {e}")
                    continue
            rows.append(self.cache[key])
        rows.sort(key=lambda r: r["orden"], reverse=True)
        if new:
            save_json(CACHE, {"v": CACHE_VER, "rows": self.cache})
        return {"folder": folder, "rows": rows, "errors": errors}

    def compare(self, paths, opts):
        with self.lock:
            try:
                top = int(opts.get("top", 3))
                bands = [tuple(int(x) for x in b) for b in opts.get("bands") or []] or None
                self.cfg.update(top=top, bands=bands)
                save_json(CFG, self.cfg)
                data = clean(build_data(paths, top=top, bands=bands, log=lambda *a: None))
                self.last = data
                return {"data": data}
            except Exception as e:
                traceback.print_exc()
                return {"error": f"No se pudo comparar: {e}. Revisá que sean tandas de la misma pista con vueltas completas."}

    def export_html(self):
        if not self.last:
            return {"error": "Primero compará tandas."}
        try:
            out_dir = os.path.join(os.path.dirname(os.path.abspath(self._folder() or ".")), "reportes")
            path = render_html(self.last, out_dir)
            os.startfile(path)
            return {"path": path}
        except Exception as e:
            return {"error": f"No se pudo exportar: {e}"}

    def open_url(self, url):
        """Abre un link (pago, terminos) en el navegador del sistema. Solo https."""
        if not isinstance(url, str) or not url.startswith("https://"):
            return {"error": "link inválido"}
        import webbrowser
        webbrowser.open(url)
        return {"ok": True}

    def google_login(self, base_url, key):
        """Ingresar con Google desde el programa: Google no deja ingresar dentro de una ventana embebida, asi que
        se abre el navegador del sistema y Supabase vuelve a un servidor local (127.0.0.1) con un codigo de un solo
        uso, que se cambia por la sesion con PKCE (el verificador nunca sale de este equipo)."""
        import base64, hashlib, secrets, time, urllib.parse, urllib.request, webbrowser
        from http.server import BaseHTTPRequestHandler, HTTPServer
        if not (isinstance(base_url, str) and base_url.startswith("https://") and isinstance(key, str)):
            return {"error": "configuración inválida"}
        verifier = secrets.token_urlsafe(64)
        challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
        res = {}
        pagina = ("<!doctype html><meta charset='utf-8'><title>Análisis Karting</title>"
                  "<body style='font-family:Segoe UI,system-ui;background:#0d1015;color:#e9edf2;display:grid;place-items:center;height:90vh'>"
                  "<div style='text-align:center'><h2>{t}</h2><p>{p}</p></div>")

        class H(BaseHTTPRequestHandler):
            def do_GET(self):
                u = urllib.parse.urlparse(self.path)
                if u.path != "/callback":
                    self.send_response(404); self.end_headers(); return
                q = urllib.parse.parse_qs(u.query)
                res["code"] = (q.get("code") or [None])[0]
                res["error"] = (q.get("error_description") or q.get("error") or [None])[0]
                ok = bool(res["code"])
                body = pagina.format(t="Listo" if ok else "No se pudo ingresar",
                                     p="Ya podés cerrar esta pestaña y volver al programa." if ok else "Volvé al programa y probá de nuevo.")
                self.send_response(200); self.send_header("Content-Type", "text/html; charset=utf-8"); self.end_headers()
                self.wfile.write(body.encode("utf8"))

            def log_message(self, *a):
                pass

        try:
            srv = HTTPServer(("127.0.0.1", GOOGLE_PORT), H)
        except OSError:
            return {"error": "No se pudo abrir el ingreso con Google (el puerto está ocupado). Cerrá otras ventanas del programa y probá de nuevo."}
        srv.timeout = 1
        redirect = f"http://127.0.0.1:{GOOGLE_PORT}/callback"
        webbrowser.open(f"{base_url}/auth/v1/authorize?provider=google&redirect_to={urllib.parse.quote(redirect, safe='')}"
                        f"&code_challenge={challenge}&code_challenge_method=s256")
        fin = time.time() + 300
        try:
            while time.time() < fin and "code" not in res:
                srv.handle_request()
        finally:
            srv.server_close()
        if not res.get("code"):
            return {"error": res.get("error") or "Se terminó el tiempo para ingresar con Google."}
        try:
            req = urllib.request.Request(f"{base_url}/auth/v1/token?grant_type=pkce", method="POST",
                                         data=json.dumps({"auth_code": res["code"], "code_verifier": verifier}).encode(),
                                         headers={"apikey": key, "Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=20) as r:
                return {"session": json.load(r)}
        except Exception as e:
            return {"error": f"Google respondió, pero no se pudo abrir la sesión ({e})."}

    def save_setup(self, path, values):
        try:
            import setup_kart
            return {"ok": True, "valores": setup_kart.save(path, values)}
        except Exception as e:
            return {"error": f"No se pudo guardar el setup: {e}"}

    def export_pdf(self):
        """Abre el reporte en el navegador listo para imprimir / guardar como PDF."""
        if not self.last:
            return {"error": "Primero compará tandas."}
        try:
            import subprocess, pathlib
            out_dir = os.path.join(os.path.dirname(os.path.abspath(self._folder() or ".")), "reportes")
            path = render_html(self.last, out_dir)
            url = pathlib.Path(path).as_uri() + "#pdf"
            try:
                subprocess.Popen(["cmd", "/c", "start", "", "msedge", url], creationflags=0x08000000)
            except Exception:
                os.startfile(path)
            return {"path": path}
        except Exception as e:
            return {"error": f"No se pudo preparar el PDF: {e}"}

    # ---------- actualizaciones ----------
    def check_update(self):
        self.update = updater.check(VERSION)
        return self.update

    def update_progress(self):
        return self.progress

    def do_update(self):
        if not self.update or not self.update.get("available"):
            return {"error": "No hay actualización disponible."}
        try:
            updater.download_and_install(self.update, progress=lambda f: setattr(self, "progress", f))
            threading.Timer(1.5, lambda: webview.windows[0].destroy()).start()
            return {"ok": True}
        except Exception as e:
            traceback.print_exc()
            return {"error": f"No se pudo actualizar: {e}"}


def self_test(paths):
    os.makedirs(CFG_DIR, exist_ok=True)
    with open(os.path.join(CFG_DIR, "prueba.log"), "w", encoding="utf8") as f:
        try:
            data = clean(build_data(paths, log=lambda *a: None))
            json.dumps(data, allow_nan=False)
            path = render_html(data, CFG_DIR)
            f.write(f"OK v{VERSION} {path}\n")
        except Exception:
            f.write(traceback.format_exc())


def main():
    if len(sys.argv) > 2 and sys.argv[1] == "--prueba":
        self_test(sys.argv[2:])
        return
    try:
        if updater.ensure_installed(VERSION):
            return
    except Exception:
        traceback.print_exc()
    api = Api()
    webview.create_window(f"Análisis Karting {VERSION}", os.path.join(WEB, "index.html"), js_api=api,
                          width=1440, height=900, min_size=(1100, 680), background_color="#0d1015")
    webview.start(gui="edgechromium", private_mode=False, storage_path=os.path.join(CFG_DIR, "webview"))


if __name__ == "__main__":
    main()
