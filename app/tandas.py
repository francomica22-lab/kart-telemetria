"""Comparacion de tandas (.xrk de AiM MyChron): curva por curva, sectores y motor.

Uso por consola:
    python tandas.py --carpeta "D:/datos/DD2" 1275 1276 [--top 3]

Busca los .xrk por el numero final del archivo, toma la vuelta mas rapida de todas
como referencia y genera reportes/tandas_<ids>.html junto a la carpeta de datos.
"""
import argparse, glob, json, os, sys
import numpy as np, pandas as pd
from scipy.spatial import cKDTree
from kartlib import *
import motor
import setup_kart
import circuito

POOL_TOL = 1.07   # vueltas que entran al analisis: hasta 7% mas lentas que la mejor de la tanda

HERE = os.path.dirname(os.path.abspath(__file__))
# carpeta web/: junto al ejecutable (PyInstaller) o en la raiz del repo
WEB = os.path.join(getattr(sys, "_MEIPASS", ""), "web") if hasattr(sys, "_MEIPASS") else os.path.join(os.path.dirname(HERE), "web")


def find_file(sid, root="."):
    hits = glob.glob(os.path.join(root, "**", f"*_{sid}.xrk"), recursive=True)
    if not hits:
        sys.exit(f"No encuentro la tanda {sid} (.xrk) dentro de {os.path.abspath(root)}")
    return hits[0]


def lateral_offset_fn(ref):
    nx = -np.gradient(ref.y); ny = np.gradient(ref.x); nn = np.hypot(nx, ny); nx /= nn; ny /= nn
    tree = cKDTree(np.c_[ref.x, ref.y])

    def f(ses, lap):
        t, lat = ses["chans"]["lat"]; _, lon = ses["chans"]["lon"]
        m = (t >= lap.start_time) & (t <= lap.end_time)
        x, y = to_xy(lat[m], lon[m], ref.lat0, ref.lon0)
        dx, dy, _ = ses.get("gps_offset", (0, 0, 0))
        x, y = x + dx, y + dy
        _, k = tree.query(np.c_[x, y])
        off = (x - ref.x[k]) * nx[k] + (y - ref.y[k]) * ny[k]
        o = np.argsort(ref.s[k])
        return np.interp(np.arange(0, ref.length, DS), ref.s[k][o], pd.Series(off[o]).rolling(5, center=True, min_periods=1).mean())
    return f


def diagnose(A, B):
    """Clasifica la perdida de B contra A en una curva: agarre si B nunca llego a la G de A."""
    d = B["t3"]["tiempo"] - A["t3"]["tiempo"]
    if abs(d) < 0.02:
        return "neutro", d
    if d < 0:
        return "gana", d
    ratio = B["lat_ses_max"] / max(A["lat_ses_max"], 1e-6)
    # zona gris: con unos metros de diferencia en la referencia puede cambiar de lado
    return ("agarre" if ratio < 0.94 else "mixto" if ratio < 0.98 else "manejo"), d


def sectors(rdf, sec_traces, L, options=(3, 4)):
    """Divide la pista en N sectores con los cortes en rectas (maximos de velocidad cerca de L*k/N)."""
    from scipy.signal import savgol_filter, find_peaks
    v = savgol_filter(rdf.speed.values, 31, 2)
    peaks, _ = find_peaks(v, distance=40)
    res = {}
    for n in options:
        from itertools import combinations
        cand = [float(rdf.s[p]) for p in peaks if 40 < rdf.s[p] < L - 40]
        best_cuts, best_err = None, 1e18
        for comb in combinations(cand, n - 1):
            b = [0.0] + list(comb) + [L]
            err = sum((b[i + 1] - b[i] - L / n) ** 2 for i in range(n))
            if err < best_err:
                best_cuts, best_err = list(comb), err
        cuts = best_cuts if best_cuts and best_err ** 0.5 < L * 0.35 else [L * k / n for k in range(1, n)]
        bounds = [0.0] + sorted(cuts) + [float(rdf.s.iloc[-1])]
        by = {}
        for sid, (traces, best) in sec_traces.items():
            per_lap = {}
            for lap, d in traces.items():
                tt = np.interp(bounds, d.s, d.t)
                per_lap[lap] = np.diff(tt)
            arr = np.array(list(per_lap.values()))
            top = np.array([per_lap[l] for l in best if l in per_lap])
            by[sid] = dict(avg=[round(float(x), 3) for x in top.mean(axis=0)], best=[round(float(x), 3) for x in arr.min(axis=0)])
        res[str(n)] = dict(bounds=[round(b, 1) for b in bounds], by=by)
    return res


def optimal(Rs, ses, pool):
    """Vuelta optima y regularidad de una tanda: mejor version de cada curva vs el promedio de la tanda."""
    keys = ["tiempo", "v_min", "s_vmin", "v_salida", "freno_max", "s_freno", "s_acel", "lat_max"]
    best_lap = pool.sort_values(["time", "num"], kind="stable").iloc[0]
    out = {"vueltas": int(len(pool)), "mejor": round(float(best_lap.time), 3), "mejor_vuelta": int(best_lap.num),
           "promedio": round(float(pool.time.mean()), 3), "desvio": round(float(pool.time.std(ddof=1)), 3) if len(pool) > 1 else 0.0,
           "curvas": []}
    total = 0.0
    for n, q in Rs.groupby("curva"):
        q = q.sort_values(["tiempo", "lap"], kind="stable")
        b = q.iloc[0]
        f = q[q.lap == int(best_lap.num)]
        avg = q[keys].mean(numeric_only=True)
        total += float(b.tiempo)
        out["curvas"].append(dict(
            n=int(n), mejor=round(float(b.tiempo), 3), mejor_lap=int(b.lap),
            en_mejor_vuelta=round(float(f.tiempo.iloc[0]), 3) if len(f) else None,
            promedio=round(float(avg.tiempo), 3), desvio=round(float(q.tiempo.std(ddof=1)), 3) if len(q) > 1 else 0.0,
            mejor_metricas={k: (None if pd.isna(b[k]) else round(float(b[k]), 2)) for k in keys},
            prom_metricas={k: (None if pd.isna(avg[k]) else round(float(avg[k]), 2)) for k in keys},
            desvio_vertice=round(float(q.s_vmin.std(ddof=1)), 1) if len(q) > 1 else 0.0,
            desvio_freno=round(float(q.s_freno.std(ddof=1)), 1) if len(q) > 1 and q.s_freno.notna().sum() > 1 else None,
            por_vuelta=[dict(lap=int(r.lap), t=round(float(r.tiempo), 3)) for r in q.sort_values("lap").itertuples()]))
    out["optima"] = round(total, 3)
    return out


def series_10hz(ses, ref):
    """Toda la tanda a 10 Hz (para sincronizar video): tiempo, RPM, velocidad, distancia en la pista y vuelta."""
    tr, r = ses["chans"]["rpm"]
    ts, v = ses["chans"]["speed"]
    if len(tr) < 10:
        return None
    t = np.arange(tr[0], tr[-1], 100.0)
    tp, sp = ses.get("proj", (None, None))
    L = ses["laps"]
    lapn = np.zeros(len(t), int)
    for _, l in L.iterrows():
        lapn[(t >= l.start_time) & (t < l.end_time)] = int(l.num)
    out = dict(t0=float(t[0]), rpm=np.round(np.interp(t, tr, r)).astype(int).tolist(),
               kmh=np.round(np.interp(t, ts, v) * 3.6, 1).tolist(), lap=lapn.tolist(),
               laps=[dict(num=int(l.num), t0=float(l.start_time), t1=float(l.end_time), time=round(float(l.time), 3)) for _, l in L.iterrows()])
    if tp is not None:
        ok = np.isfinite(sp)
        out["s"] = np.round(np.mod(np.interp(t, tp[ok], sp[ok]), ref.length), 1).tolist()
    return out


def sensors(ses, pool):
    """Resumen de todos los sensores de la tanda (agua, escape, bateria...) en las vueltas analizadas."""
    res = []
    tw, vw = ses["chans"]["water"]
    items = [("Water Temp", (tw, vw, "C"))] + sorted(ses.get("extra", {}).items())
    for name, (t, v, unit) in items:
        m = np.zeros(len(t), bool)
        for _, l in pool.iterrows():
            m |= (t >= l.start_time) & (t < l.end_time)
        x = v[m]
        ok = np.isfinite(x) & (np.abs(x) < 1e6)
        item = dict(nombre=name, unidad=unit, n=int(m.sum()))
        if ok.sum() < 5 or np.nanmax(np.abs(x[ok])) < 0.05:
            item.update(estado="sin datos")
        else:
            xs = x[ok]
            item.update(estado="ok", min=round(float(xs.min()), 2), prom=round(float(xs.mean()), 2), max=round(float(xs.max()), 2))
            per = []
            for _, l in pool.sort_values("num").iterrows():
                mm = (t >= l.start_time) & (t < l.end_time) & np.isfinite(v)
                if mm.any():
                    per.append(dict(lap=int(l.num), prom=round(float(np.mean(v[mm])), 2), max=round(float(np.max(v[mm])), 2)))
            item["por_vuelta"] = per
        res.append(item)
    return res


def build_data(paths, top=3, bands=None, log=print):
    """Compara las tandas de los .xrk dados. Devuelve el diccionario de resultados."""
    S = {}
    for f in paths:
        s = load_session(f)
        S[s["id"]] = s
    ids = list(S)
    # todas las tandas tienen que ser del mismo circuito (comparamos la ubicacion GPS)
    pos = {sid: (x.get("lat0"), x.get("lon0")) for sid, x in S.items()}
    good = {k: v for k, v in pos.items() if v[0] is not None}
    for a in good:
        for b in good:
            dy = (good[a][0] - good[b][0]) * 111320
            dx = (good[a][1] - good[b][1]) * 111320 * np.cos(np.radians(good[a][0]))
            if np.hypot(dx, dy) > 3000:
                raise ValueError(f"las tandas {a} y {b} son de circuitos distintos (están a {np.hypot(dx, dy) / 1000:.0f} km)")
    if any(valid_laps(x).empty for x in S.values()):
        sin = [sid for sid, x in S.items() if valid_laps(x).empty]
        raise ValueError(f"la tanda {', '.join(sin)} no tiene vueltas completas para analizar")
    ref_id, ref_lap = min(((sid, l) for sid, s in S.items() for _, l in valid_laps(s).iterrows()), key=lambda p: (round(p[1].time, 3), p[0], int(p[1].num)))  # determinista ante empates
    ref = Reference(S[ref_id], ref_lap)
    rdf = lap_on_distance(S[ref_id], ref_lap, ref)
    corners = detect_corners(rdf, prom=1.5)
    corners[0]["s_start"] = 0.0; corners[-1]["s_end"] = rdf.s.iloc[-1]
    offset = lateral_offset_fn(ref)

    out = {"ref": ref_id, "ref_lap": int(ref_lap.num), "ref_time": float(ref_lap.time), "sessions": [], "corners": []}
    rows, rap_by, sec_traces = [], {}, {}
    for sid, s in S.items():
        L = s["laps"]
        full = L[(L.lap_type == "full") & (L.time > 30)]
        best = full.time.min()
        rap = full[full.time <= best * POOL_TOL]   # todas las vueltas razonables (sin salida/entrada a boxes)
        rap_by[sid] = rap
        best_laps = rap.sort_values(["time", "num"], kind="stable").head(top)
        traces = {}
        for _, lap in rap.iterrows():
            d = lap_on_distance(s, lap, ref)
            d["latg_s"] = d.latg.abs().rolling(7, center=True, min_periods=1).median()
            d["off"] = offset(s, lap)
            traces[int(lap.num)] = d
            for c in corners:
                seg = d[(d.s >= c["s_start"]) & (d.s <= c["s_end"])]
                apx = seg[(seg.s >= c["s_apex"] - 30) & (seg.s <= c["s_apex"] + 30)]
                ia = apx.speed.idxmin()
                lg = seg.long.rolling(5, center=True, min_periods=1).median()
                brk = seg[(lg < -0.3) & (seg.s < d.s[ia])]
                gas = seg[(lg > 0.15) & (seg.s > d.s[ia])]
                rows.append(dict(ses=sid, lap=int(lap.num), top=lap.num in best_laps.num.values, curva=c["n"],
                                 tiempo=seg.t.iloc[-1] - seg.t.iloc[0], v_min=d.speed[ia], s_vmin=d.s[ia],
                                 v_salida=seg.speed.iloc[-1], lat_max=seg.latg_s.max(),
                                 freno_max=-seg.long.rolling(5, center=True, min_periods=1).median().min(),
                                 off_apex=d.off[ia],
                                 s_freno=float(brk.s.iloc[0]) if len(brk) else np.nan,
                                 s_acel=float(gas.s.iloc[0]) if len(gas) else np.nan))
        allg = pd.concat(traces.values())
        ang = np.degrees(np.arctan2(allg.long, allg.latg))
        mag = np.hypot(allg.latg, allg.long).rolling(5, center=True, min_periods=1).median()
        bins = np.arange(-180, 180, 15)
        env = [float(np.percentile(mag[(ang >= b) & (ang < b + 15)], 97)) if ((ang >= b) & (ang < b + 15)).sum() > 20 else None for b in bins]
        tw, w = s["chans"]["water"]
        laps = []
        for _, l in full[full.time < best * 1.1].iterrows():
            m = (tw >= l.start_time) & (tw < l.end_time)
            laps.append(dict(lap=int(l.num), t=round(float(l.time), 3), agua=None if not m.any() else round(float(np.nanmean(w[m])), 1)))
        bd = traces[int(best_laps.iloc[0].num)]
        sec_traces[sid] = (traces, [int(x) for x in best_laps.num])
        out["sessions"].append(dict(id=sid, date=s["date"], hour=s["hour"][:5], kart=s["vehicle"], driver=s["driver"],
            path=s["path"], lat0=s.get("lat0"), lon0=s.get("lon0"), venue=s.get("venue"),
            setup=setup_kart.load(s["path"], s["comment"]), sensores=sensors(s, rap), serie=series_10hz(s, ref),
            comment=s["comment"].replace("\r", "").strip(), top=[round(float(x), 3) for x in best_laps.time], n_rap=len(rap),
            laps=laps, env=env, env_bins=bins.tolist(), s=bd.s[::2].tolist(), v=bd.speed[::2].round(1).tolist(),
            dt=(bd.t - rdf.t)[::2].round(3).tolist(), vmax=round(float(bd.speed.max()), 1)))
    R = pd.DataFrame(rows)
    for c in corners:
        by = {}
        for sid in S:
            q = R[(R.ses == sid) & (R.curva == c["n"])]
            t = q[q.top]
            by[sid] = dict(t3={k: round(float(t[k].mean()), 3) for k in ["tiempo", "v_min", "s_vmin", "v_salida", "lat_max", "freno_max", "off_apex", "s_freno", "s_acel"]},
                           lat_ses_max=round(float(q.lat_max.max()), 2), best_sector=round(float(q.tiempo.min()), 3))
        diag = {sid: diagnose(by[ref_id], by[sid]) for sid in S if sid != ref_id}
        out["corners"].append(dict(n=c["n"], s0=c["s_start"], sa=c["s_apex"], s1=c["s_end"], by=by,
                                   diag={k: [v[0], round(v[1], 3)] for k, v in diag.items()}))
    for s in out["sessions"]:
        s["ideal"] = round(sum(c["by"][s["id"]]["best_sector"] for c in out["corners"]), 3)
    out["sectors"] = sectors(rdf, sec_traces, ref.length)
    out["circuito"] = circuito.circuit_profile(rdf, corners, R, [d for tr, _ in sec_traces.values() for d in tr.values()], float(ref_lap.time))
    out["circuito"].update(nombre=S[ref_id].get("venue"), lat=S[ref_id].get("lat0"), lon=S[ref_id].get("lon0"))
    out["optimo"] = {sid: optimal(R[R.ses == sid], S[sid], rap_by[sid]) for sid in S}
    out["setup_fields"] = [list(f) for f in setup_kart.FIELDS]
    out["motor"] = motor.analyze(S, rap_by, ref_id, ref.length, corners, bands)
    out["track"] = {"x": ref.x[::6].round(1).tolist(), "y": ref.y[::6].round(1).tolist(), "L": ref.length}

    # resumen en consola
    print = log
    print(f"REFERENCIA: tanda {ref_id} vuelta {int(ref_lap.num)} {ref_lap.time:.3f}")
    for s in out["sessions"]:
        print(f"{s['id']} {s['date']} {s['hour']} {s['kart']} top{top}={s['top']} prom={np.mean(s['top']):.3f} ideal={s['ideal']} vmax={s['vmax']} coment={s['comment']!r}")
    for c in out["corners"]:
        line = f"C{c['n']} ({int(c['s0'])}-{int(c['s1'])} m): " + " | ".join(
            f"{sid}: {b['t3']['tiempo']:.2f}s vmin {b['t3']['v_min']:.1f} vert {b['t3']['s_vmin']:.0f} sal {b['t3']['v_salida']:.1f} lat {b['t3']['lat_max']:.2f}/max {b['lat_ses_max']:.2f} freno {b['t3']['freno_max']:.2f} linea {b['t3']['off_apex']:+.1f}"
            for sid, b in c["by"].items())
        print(line)
        print("     diag vs ref:", c["diag"])

    return out


def render_html(out, out_dir=None, notas="", colors=None):
    """Reporte HTML autonomo (sin internet): mismo dibujo que la app, con los datos adentro."""
    ids = [x["id"] for x in out["sessions"]]
    out_dir = out_dir or os.path.abspath("reportes")
    os.makedirs(out_dir, exist_ok=True)
    web = WEB
    css = open(os.path.join(web, "styles.css"), encoding="utf8").read()
    js = "\n".join(open(os.path.join(web, f), encoding="utf8").read() for f in ("report-extra.js", "report.js"))
    data = json.dumps(out, separators=(",", ":")).replace("</", "<\\/")
    opts = json.dumps({"notas": notas, "colors": colors or {}}).replace("</", "<\\/")
    html = f"""<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tandas {' vs '.join(ids)}</title><style>{css}
html,body{{height:auto}} body{{overflow:auto}}</style></head><body><div id="app"></div>
<script>{js}</script><script>renderReport({data}, document.getElementById("app"), {opts});</script><script>if(location.hash=="#pdf"){{document.body.classList.add("printing");document.querySelectorAll("details").forEach(x=>x.open=true);document.querySelectorAll("p.help").forEach(x=>x.hidden=false);setTimeout(()=>print(),700)}}</script></body></html>"""
    path = os.path.join(out_dir, f"tandas_{'_'.join(ids)}.html")
    open(path, "w", encoding="utf8").write(html)
    return path


def build_report(paths, top=3, notas="", out_dir=None, log=print, bands=None):
    path = render_html(build_data(paths, top, bands, log), out_dir, notas)
    log("REPORTE:", path)
    return path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ids", nargs="+")
    ap.add_argument("--carpeta", default=".", help="carpeta donde buscar los .xrk")
    ap.add_argument("--top", type=int, default=3)
    ap.add_argument("--notas", help="archivo .html con el veredicto escrito a mano")
    a = ap.parse_args()
    notas = open(a.notas, encoding="utf8").read() if a.notas else ""
    build_report([find_file(i, a.carpeta) for i in a.ids], top=a.top, notas=notas)


if __name__ == "__main__":
    main()
