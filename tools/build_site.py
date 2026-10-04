"""Arma la carpeta site/ para GitHub Pages: la misma interfaz que el programa + el analisis en Python para Pyodide."""
import os, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, sys.argv[1] if len(sys.argv) > 1 else "site")
VERSION = open(os.path.join(ROOT, "VERSION"), encoding="utf8").read().strip()

shutil.rmtree(OUT, ignore_errors=True)
shutil.copytree(os.path.join(ROOT, "web"), OUT, dirs_exist_ok=True)
os.makedirs(os.path.join(OUT, "app"), exist_ok=True)
for m in ("kartlib", "motor", "tandas", "sesiones", "setup_kart"):
    shutil.copy(os.path.join(ROOT, "app", f"{m}.py"), os.path.join(OUT, "app"))
idx = os.path.join(OUT, "index.html")
html = open(idx, encoding="utf8").read().replace("__VERSION__", VERSION)
open(idx, "w", encoding="utf8").write(html)
open(os.path.join(OUT, ".nojekyll"), "w").close()
print(f"site v{VERSION} -> {OUT}")
