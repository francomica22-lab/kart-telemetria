"""Carga de sesiones AiM (.xrk), seleccion de mejores vueltas y analisis curva por curva."""
import contextlib, io, os
import numpy as np
import pandas as pd
from scipy.signal import find_peaks, savgol_filter
from libxrk import aim_xrk

CH = {  # canal -> nombre corto
    "GPS Speed": "speed",
    "RPM": "rpm",
    "GPS_LateralAcc": "latg",
    "GPS_InlineAcc": "long",
    "GPS_Yaw_Rate": "yaw",
    "Water Temp": "water",
    "GPS Latitude": "lat",
    "GPS Longitude": "lon",
}
DS = 1.0  # resolucion en metros
# canales internos del logger que no son sensores utiles para el piloto
SKIP_CH = {"Best Run Diff", "Best Today Diff", "Prev Lap Diff", "Ref Lap Diff", "Predictive Time", "TimTpItow",
           "TimePulseTick", "ZeroX5", "ZeroX50", "Calculated_Gear", "Distance Lap", "MagnetomX", "MagnetomY", "MagnetomZ"}


def load_session(path):
    with contextlib.redirect_stdout(io.StringIO()):
        log = aim_xrk(path)
    md = log.metadata
    laps = log.laps.to_pandas()
    laps["time"] = (laps.end_time - laps.start_time) / 1000.0
    chans = {}
    for name, short in CH.items():
        if name not in log.channels:
            chans[short] = (np.array([0.0]), np.array([np.nan]))
            continue
        d = log.channels[name].to_pandas()
        chans[short] = (d.timecodes.values.astype(float), d[name].values.astype(float))
    # resto de los canales (sensores): se guardan para el analisis de sensores
    extra = {}
    for name, tbl in log.channels.items():
        if name in CH or name.startswith("GPS") or name in SKIP_CH:
            continue
        try:
            d = tbl.to_pandas()
            unit = (tbl.schema.field(name).metadata or {}).get(b"units", b"").decode()
            extra[name] = (d.timecodes.values.astype(float), d[name].values.astype(float), unit)
        except Exception:
            pass
    lat, lon = chans["lat"][1], chans["lon"][1]
    ok = np.isfinite(lat) & np.isfinite(lon) & (np.abs(lat) > 0.1)
    return dict(lat0=float(np.median(lat[ok])) if ok.any() else None, lon0=float(np.median(lon[ok])) if ok.any() else None,
        extra=extra,
        path=path,
        id=os.path.splitext(path)[0].split("_")[-1],
        driver=md.get("Driver"), vehicle=md.get("Vehicle"), venue=md.get("Venue"),
        date=md.get("Log Date"), hour=md.get("Log Time"),
        comment=(md.get("Long Comment") or "").strip(),
        series=(md.get("Series") or "").strip(), session=(md.get("Session") or "").strip(),
        laps=laps, chans=chans,
    )


def valid_laps(ses, tol=1.06):
    L = ses["laps"]
    full = L[(L.lap_type == "full") & (L.time > 30)]
    if full.empty:
        return full
    return full[full.time <= full.time.min() * tol].sort_values(["time", "num"], kind="stable")  # empate: menor numero de vuelta


def to_xy(lat, lon, lat0, lon0):
    R = 6371000.0
    x = np.radians(lon - lon0) * R * np.cos(np.radians(lat0))
    y = np.radians(lat - lat0) * R
    return x, y


def lap_raw(ses, lap):
    """Canales de una vuelta en base de tiempo (ms relativos al inicio)."""
    s, e = lap.start_time, lap.end_time
    out = {}
    for k, (t, v) in ses["chans"].items():
        m = (t >= s - 500) & (t <= e + 500)
        out[k] = (t[m] - s, v[m])
    return out


class Reference:
    """Trazado de referencia (vuelta mas rapida) para proyectar el resto por distancia."""

    def __init__(self, ses, lap):
        r = lap_raw(ses, lap)
        t, lat = r["lat"]; _, lon = r["lon"]
        m = (t >= 0) & (t <= lap.time * 1000)
        self.lat0, self.lon0 = lat[m][0], lon[m][0]
        x, y = to_xy(lat[m], lon[m], self.lat0, self.lon0)
        d = np.r_[0, np.cumsum(np.hypot(np.diff(x), np.diff(y)))]
        self.length = d[-1]
        self.s = np.arange(0, self.length, 0.5)
        self.x = np.interp(self.s, d, x)
        self.y = np.interp(self.s, d, y)

    def project_session(self, ses):
        """Distancia acumulada sobre la referencia para toda la sesion (vueltas desenrolladas).
        Se cachea en ses['proj'] = (t_ms, s_acumulada)."""
        key = ("proj", self.lat0, self.lon0)
        if ses.get("proj_key") == key:
            return ses["proj"]
        t, lat = ses["chans"]["lat"]; _, lon = ses["chans"]["lon"]
        x, y = to_xy(lat, lon, self.lat0, self.lon0)
        # corregir deriva del GPS entre sesiones: traslacion que mejor calza con la referencia
        from scipy.spatial import cKDTree
        tree = cKDTree(np.c_[self.x, self.y])
        dx = dy = 0.0
        for _ in range(8):
            d, k = tree.query(np.c_[x + dx, y + dy])
            m = d < 6
            dx += np.mean(self.x[k[m]] - (x[m] + dx)) * 0.9
            dy += np.mean(self.y[k[m]] - (y[m] + dy)) * 0.9
        x, y = x + dx, y + dy
        ses["gps_offset"] = (dx, dy, float(np.median(tree.query(np.c_[x, y])[0][m])))
        n, L = len(self.s), self.length
        out = np.full(len(x), np.nan)
        idx, laps_done, prev = None, 0, None
        for i, (px, py) in enumerate(zip(x, y)):
            j = np.arange(n) if idx is None else np.arange(idx - 10, idx + 120) % n
            d2 = (self.x[j] - px) ** 2 + (self.y[j] - py) ** 2
            q = int(np.argmin(d2))
            if d2[q] > 15 ** 2:  # fuera de pista (boxes): perder enganche
                idx = None
                continue
            k = j[q]
            if prev is not None and prev > 0.8 * n and k < 0.2 * n:
                laps_done += 1
            idx = prev = k
            out[i] = self.s[k] + laps_done * L
        ses["proj"], ses["proj_key"] = (t, out), key
        return ses["proj"]


def lap_on_distance(ses, lap, ref):
    """Vuelta recortada en la linea de la referencia y remuestreada cada DS metros."""
    t, sg = ref.project_session(ses)
    ok = np.isfinite(sg)
    t, sg = t[ok], sg[ok]
    L = ref.length
    # vuelta de referencia cuyo inicio queda mas cerca del inicio oficial de la vuelta
    k0 = np.floor(np.interp(lap.start_time, t, sg) / L + 0.5)
    s0, s1 = k0 * L, (k0 + 1) * L
    t0, t1 = np.interp([s0, s1], np.maximum.accumulate(sg), t)
    grid = np.arange(0, L, DS)
    m = (t >= t0 - 1000) & (t <= t1 + 1000)
    sm = np.maximum.accumulate(sg[m])
    u = np.r_[True, np.diff(sm) > 0]
    t_of_s = np.interp(grid + s0, sm[u], t[m][u])
    df = pd.DataFrame({"s": grid, "t": (t_of_s - t0) / 1000.0})
    for k in ("speed", "rpm", "latg", "long", "yaw", "water"):
        tc, v = ses["chans"][k]
        good = np.isfinite(v)
        df[k] = np.interp(t_of_s, tc[good], v[good]) if good.any() else np.nan  # canal ausente (p. ej. sin sensor de agua)
    df["speed"] *= 3.6
    df["x"] = np.interp(grid, ref.s, ref.x)
    df["y"] = np.interp(grid, ref.s, ref.y)
    df["rpm"] = pd.Series(df.rpm).rolling(5, center=True, min_periods=1).median()  # picos espureos
    df.attrs["laptime"] = (t1 - t0) / 1000.0
    return df


def detect_corners(refdf, prom=4.0):
    """Curvas = minimos de velocidad; sectores cortados en los maximos de velocidad."""
    v = savgol_filter(refdf.speed.values, 31, 2)
    mins, _ = find_peaks(-v, prominence=prom, distance=40)
    corners = []
    n = len(v)
    for i, a in enumerate(mins):
        lo = mins[i - 1] if i > 0 else 0
        hi = mins[i + 1] if i + 1 < len(mins) else n - 1
        start = lo + int(np.argmax(v[lo:a])) if a > lo else 0
        end = a + int(np.argmax(v[a:hi + 1]))
        corners.append(dict(n=i + 1, s_start=refdf.s[start], s_apex=refdf.s[a], s_end=refdf.s[end]))
    return corners


def corner_metrics(df, c):
    seg = df[(df.s >= c["s_start"]) & (df.s <= c["s_end"])]
    win = seg[(seg.s >= c["s_apex"] - 30) & (seg.s <= c["s_apex"] + 30)]
    iapex = win.speed.idxmin()
    v = seg.speed.values
    # punto de frenada: primer punto con desaceleracion < -0.3 g despues del inicio
    brk = seg[seg.long < -0.3]
    s_brake = brk.s.iloc[0] if len(brk) else np.nan
    after = df[(df.s >= df.s[iapex]) & (df.s <= c["s_end"])]
    thr = after[after.long > 0.15]
    s_gas = thr.s.iloc[0] if len(thr) else np.nan
    return dict(
        tiempo=seg.t.iloc[-1] - seg.t.iloc[0],
        v_entrada=v[0], v_min=df.speed[iapex], s_vmin=df.s[iapex], v_salida=v[-1],
        s_freno=s_brake, s_acel=s_gas,
        freno_max_g=-seg.long.min(), lat_max_g=seg.latg.abs().max(),
        rpm_min=seg.rpm.min(), rpm_max=seg.rpm.max(),
    )
