"""Setup de cada tanda: lo que se escribe en el comentario de la MyChron + lo que se carga a mano en la app.

Lo cargado a mano se guarda junto al .xrk como <archivo>.setup.json, asi viaja con los datos.
"""
import json, os, re

# campos que entiende la app (clave, etiqueta, unidad)
FIELDS = [
    ("gomas", "Gomas", ""),                  # nuevas / usadas / set
    ("vueltas_goma", "Vueltas de la goma", ""),
    ("presion_del", "Presión delantera", "bar"),
    ("presion_tras", "Presión trasera", "bar"),
    ("presion_tipo", "Presión medida en", ""),  # frío / caliente
    ("trocha_del", "Trocha delantera", "mm"),
    ("trocha_tras", "Trocha trasera", "mm"),
    ("eje", "Eje", ""),
    ("altura_del", "Altura delantera", ""),
    ("altura_tras", "Altura trasera", ""),
    ("carburacion", "Carburación", ""),
    ("pinon", "Piñón", "dientes"),
    ("corona", "Corona", "dientes"),
    ("peso", "Peso kart + piloto", "kg"),
    ("motor", "Motor", ""),
    ("escape", "Escape", ""),
    ("notas", "Notas", ""),
]


def _num(x):
    return float(x.replace(",", "."))


def parse_comment(text):
    """Saca lo que se pueda del comentario libre. Lo que no se entiende queda en 'notas'."""
    t = (text or "").replace("\r", "\n")
    up = t.upper()
    out = {}
    m = re.search(r"(\d+[.,]\d+)\s*(BAR)?\s*(EN\s+)?(CALIENTE|FRI[OÓ])", up)
    if m:
        out["presion_del"] = out["presion_tras"] = _num(m.group(1))
        out["presion_tipo"] = "caliente" if m.group(4).startswith("CAL") else "frío"
    for key, pat in (("presion_del", r"(?:DEL(?:ANTERA)?|ADELANTE)\s*:?\s*(\d+[.,]\d+)"), ("presion_tras", r"(?:TRAS(?:ERA)?|ATR[AÁ]S)\s*:?\s*(\d+[.,]\d+)")):
        mm = re.search(pat, up)
        if mm and _num(mm.group(1)) < 3:
            out[key] = _num(mm.group(1))
    m = re.search(r"GOMAS?\s*(\d+)\s*VUELTAS?", up)
    if m:
        out["vueltas_goma"] = int(m.group(1)); out["gomas"] = "usadas" if int(m.group(1)) > 0 else "nuevas"
    elif re.search(r"GOMAS?\s*0\b|GOMAS?\s*NUEVAS?", up):
        out["gomas"] = "nuevas"; out["vueltas_goma"] = 0
    elif re.search(r"SIN\s+GOMA", up):
        out["gomas"] = "sin goma (pista)"
    m = re.search(r"(?:PI[ÑN]ON|PINON)\s*:?\s*(\d{1,2})", up)
    if m:
        out["pinon"] = int(m.group(1))
    m = re.search(r"CORONA\s*:?\s*(\d{2})", up)
    if m:
        out["corona"] = int(m.group(1))
    # relacion escrita como "35-62", "12/80" o "35x62" (no confundir con fechas tipo 12-03-2026)
    m = re.search(r"(?<![\d.,/-])(\d{1,2})\s*[/X-]\s*(\d{2,3})(?![\d.,/-])", up)
    if m and "pinon" not in out and 8 <= int(m.group(1)) < int(m.group(2)) <= 120:
        out["pinon"], out["corona"] = int(m.group(1)), int(m.group(2))
    m = re.search(r"TROCHA\s*(DEL\w*|TRAS\w*)?\s*:?\s*(\d{3,4})", up)
    if m:
        out["trocha_tras" if (m.group(1) or "").startswith("TRAS") else "trocha_del"] = int(m.group(2))
    m = re.search(r"EJE\s*:?\s*([A-Z0-9]+)", up)
    if m:
        out["eje"] = m.group(1).capitalize()
    m = re.search(r"ALTURA\s+(BAJA|ALTA|MEDIA)\s*(ADELANTE|DEL\w*|ATR[AÁ]S|TRAS\w*)?", up)
    if m:
        k = "altura_tras" if (m.group(2) or "").startswith(("ATR", "TRAS")) else "altura_del"
        out[k] = m.group(1).lower()
    m = re.search(r"(AGUJA[^\n,]*|CHICLER[^\n,]*|CARBU[^\n,]*|ESC(?:\s|\d)[^\n,]*)", up)
    if m:
        out["carburacion"] = m.group(1).strip().capitalize()
    m = re.search(r"MOTOR\s*:?\s*([A-Z0-9 ]+)", up)
    if m:
        out["motor"] = m.group(1).strip().capitalize()
    if t.strip():
        out["notas"] = " · ".join(x.strip() for x in t.split("\n") if x.strip())
    return out


def sidecar(path):
    return path + ".setup.json"


def load(path, comment=""):
    """Setup combinado: lo cargado a mano tiene prioridad sobre lo leido del comentario."""
    auto = parse_comment(comment)
    manual = {}
    try:
        with open(sidecar(path), encoding="utf8") as f:
            manual = json.load(f)
    except Exception:
        pass
    merged = dict(auto)
    merged.update({k: v for k, v in manual.items() if v not in (None, "")})
    return {"valores": merged, "auto": auto, "manual": manual}


def save(path, values):
    clean = {k: v for k, v in (values or {}).items() if k in dict((f[0], 1) for f in FIELDS) and v not in (None, "")}
    with open(sidecar(path), "w", encoding="utf8") as f:
        json.dump(clean, f, ensure_ascii=False, indent=1)
    return clean
