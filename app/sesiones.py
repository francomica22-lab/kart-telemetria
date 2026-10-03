"""Datos de cada tanda para la lista (compartido entre escritorio y web)."""
import math, os

from kartlib import load_session, valid_laps


def session_info(path, name=None):
    s = load_session(path)
    v = valid_laps(s)
    L = s["laps"]
    full = L[(L.lap_type == "full") & (L.time > 30)]
    d = s["date"] or ""
    return dict(path=path, id=s["id"], fecha=f"{d[3:5]}/{d[0:2]}/{d[6:]}" if len(d) == 10 else d,
                orden=f"{d[6:]}{d[0:2]}{d[3:5]} {s['hour']}", hora=(s["hour"] or "")[:5],
                kart=s["vehicle"] or "", pista=s["venue"] or "",
                mejor=f"{v.time.min():.3f}" if len(v) else "–", vueltas=int(len(full)),
                comentario=s["comment"].replace("\r", "").replace("\n", " · "),
                piloto=s["driver"] or "", campeonato=s.get("series") or "", tipo=s.get("session") or "",
                archivo=name or os.path.basename(path), kb=round(os.path.getsize(path) / 1024, 1),
                mejor_n=float(v.time.min()) if len(v) else None)


def clean(o):
    """NaN/inf -> None para que el JSON sea valido en el navegador."""
    if isinstance(o, float):
        return None if (math.isnan(o) or math.isinf(o)) else o
    if isinstance(o, dict):
        return {str(k): clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    return o
