"""Instalacion y actualizacion automatica del programa de escritorio (Windows).

- Cada version vive en %LOCALAPPDATA%\\Programs\\AnalisisKarting\\<version>\\
- Los accesos directos (Escritorio y menu Inicio) apuntan siempre a la version actual.
- Las versiones nuevas se publican como Release en GitHub con el asset ZIP_NAME.
"""
import json, os, shutil, subprocess, sys, tempfile, urllib.request, zipfile

REPO = "francomica22-lab/kart-telemetria"
ZIP_NAME = "AnalisisKarting-windows.zip"
APP_DIR = os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "Programs", "AnalisisKarting")
SHORTCUT = "Analisis Karting.lnk"
UA = {"User-Agent": "AnalisisKarting-updater", "Accept": "application/vnd.github+json"}


def parse(v):
    try:
        return tuple(int(x) for x in v.strip().lstrip("v").split("."))
    except Exception:
        return (0,)


def frozen():
    return getattr(sys, "frozen", False)


def exe_dir():
    return os.path.dirname(sys.executable)


def shortcut_paths():
    desk = os.path.join(os.path.expanduser("~"), "Desktop")
    try:
        import ctypes.wintypes
        buf = ctypes.create_unicode_buffer(260)
        ctypes.windll.shell32.SHGetFolderPathW(None, 0, None, 0, buf)  # CSIDL_DESKTOP
        desk = buf.value or desk
    except Exception:
        pass
    start = os.path.join(os.environ.get("APPDATA", ""), "Microsoft", "Windows", "Start Menu", "Programs")
    return [os.path.join(desk, SHORTCUT), os.path.join(start, SHORTCUT)]


def make_shortcuts(target):
    """Crea/actualiza los accesos directos con PowerShell (sin dependencias)."""
    lines = ["$ws = New-Object -ComObject WScript.Shell"]
    for lnk in shortcut_paths():
        lines.append(f"$s = $ws.CreateShortcut('{lnk}'); $s.TargetPath = '{target}'; "
                     f"$s.WorkingDirectory = '{os.path.dirname(target)}'; $s.IconLocation = '{target},0'; $s.Save()")
    subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", "; ".join(lines)],
                   creationflags=0x08000000, timeout=30)  # CREATE_NO_WINDOW


def ensure_installed(version):
    """Si el programa corre desde otra carpeta (por ej. Descargas), se copia a APP_DIR y se relanza.
    Devuelve True si hay que cerrar este proceso."""
    if not frozen() or sys.platform != "win32":
        return False
    here = os.path.normcase(os.path.abspath(exe_dir()))
    if here.startswith(os.path.normcase(os.path.abspath(APP_DIR))):
        target = sys.executable
        for lnk in shortcut_paths():
            if not os.path.exists(lnk):
                make_shortcuts(target)
                break
        cleanup_old(here)
        return False
    dst = os.path.join(APP_DIR, version)
    if not os.path.exists(os.path.join(dst, os.path.basename(sys.executable))):
        shutil.copytree(exe_dir(), dst, dirs_exist_ok=True)
    target = os.path.join(dst, os.path.basename(sys.executable))
    make_shortcuts(target)
    subprocess.Popen([target], cwd=dst, close_fds=True)
    return True


def cleanup_old(current_dir):
    """Borra versiones viejas (las que no esten en uso)."""
    try:
        for name in os.listdir(APP_DIR):
            p = os.path.join(APP_DIR, name)
            if os.path.normcase(os.path.abspath(p)) != current_dir and os.path.isdir(p):
                shutil.rmtree(p, ignore_errors=True)
    except Exception:
        pass


def latest():
    """Ultima version publicada. None si no hay internet o no hay releases."""
    req = urllib.request.Request(f"https://api.github.com/repos/{REPO}/releases/latest", headers=UA)
    with urllib.request.urlopen(req, timeout=5) as r:
        d = json.load(r)
    asset = next((a for a in d.get("assets", []) if a["name"] == ZIP_NAME), None)
    if not asset:
        return None
    return dict(version=d["tag_name"].lstrip("v"), notes=d.get("body") or "", url=asset["browser_download_url"],
                size_mb=round(asset["size"] / 1e6))


def check(current):
    try:
        info = latest()
    except Exception:
        return {"available": False, "offline": True}
    if info and parse(info["version"]) > parse(current):
        return dict(available=True, **info)
    return {"available": False}


def download_and_install(info, progress=lambda f: None):
    """Descarga el ZIP, lo descomprime en APP_DIR/<version>, actualiza accesos y lanza la nueva version."""
    tmp = tempfile.mkdtemp(prefix="ak_upd_")
    zpath = os.path.join(tmp, ZIP_NAME)
    req = urllib.request.Request(info["url"], headers={"User-Agent": UA["User-Agent"]})
    with urllib.request.urlopen(req, timeout=60) as r, open(zpath, "wb") as f:
        total = int(r.headers.get("Content-Length") or 0)
        done = 0
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
            done += len(chunk)
            if total:
                progress(done / total * 0.85)
    dst = os.path.join(APP_DIR, info["version"])
    with zipfile.ZipFile(zpath) as z:
        z.extractall(dst)
    progress(0.95)
    # el zip puede traer una carpeta raiz
    exe = None
    for root, _, files in os.walk(dst):
        if "AnalisisKarting.exe" in files:
            exe = os.path.join(root, "AnalisisKarting.exe")
            break
    if not exe:
        raise RuntimeError("El paquete descargado no contiene AnalisisKarting.exe")
    make_shortcuts(exe)
    shutil.rmtree(tmp, ignore_errors=True)
    subprocess.Popen([exe], cwd=os.path.dirname(exe), close_fds=True)
    progress(1.0)
    return exe
