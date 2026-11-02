"""Lectores de otros dataloggers: MoTeC (.ld + .ldx) y Racelogic VBOX (.vbo).
Devuelven la misma sesion que kartlib.load_session arma para los .xrk de AiM:
tiempos en ms, velocidad en m/s, aceleraciones en g, yaw en grados/s."""
import os, re, struct
import xml.etree.ElementTree as ET
import numpy as np
import pandas as pd

G = 9.81

# ---------- MoTeC .ld ----------
_HEAD = "<I4xII20xI24xHHHI8sHHI4x16s16x16s16x64s64s64x64s64x1024xI66x64s126x"
_CHAN = "<IIIIHHHHhhhh32s8s12s40x"
# canales MoTeC -> nombre corto (el primero que exista)
LD_CH = {
    "speed": ["Ground Spd", "GPS Spd", "Vehicle Speed", "Speed", "Corr Speed"],
    "rpm": ["ECU Eng Spd", "Engine RPM", "Eng Spd", "RPM"],
    "latg": ["G Force Lat", "Lateral G", "Accel Lat", "IMU Ay"],
    "long": ["G Force Long", "Longitudinal G", "Accel Long", "IMU Ax"],
    "water": ["ECU Water Temp", "Water Temp", "Eng Coolant Temp", "Coolant Temp"],
    "gear": ["ECU Gear", "Gear"],
    "lat": ["GPS Latitude"],
    "lon": ["GPS Longitude"],
}
# sensores que le sirven al piloto/ingeniero (el resto de la centralita y la PDM se ignora)
LD_KEEP = re.compile(r"Brake (Pres|Temp|Bias)|Damp Pos|Ride Height|Steer Wheel Angle|Tyre (Pres|Temp) [FR][LR]$|Tyre_IR|Wheel Slip|"
                     r"Oil (Pres|Temp)|Water (Pres|Temp)|Fuel (Pres|Temp)|Boost Pres|Inlet (Air Temp|Manifold Pres)|Intercooler Temp|"
                     r"Throttle Pos|Pedal Pos|Exh (Lam|Temp)|Gbox Temp|Bat Volts|Clutch Pres|Ign Timing|Amb Temp|G Force Vert", re.I)


def _txt(b):
    return b.decode("latin-1").split("\0")[0].strip()


def _ld_channels(path):
    f = open(path, "rb").read()
    h = struct.unpack_from(_HEAD, f, 0)
    meta = dict(date=_txt(h[12]), time=_txt(h[13]), driver=_txt(h[14]), vehicle=_txt(h[15]), venue=_txt(h[16]), comment=_txt(h[18]))
    chans, p, seen = {}, h[1], set()
    while p and p not in seen and p + struct.calcsize(_CHAN) <= len(f):
        seen.add(p)
        _, nxt, dp, n, _, da, db, rate, shift, mul, scale, dec, name, _, unit = struct.unpack_from(_CHAN, f, p)
        dt = {2: "<f2", 4: "<f4"}.get(db) if da == 7 else {2: "<i2", 4: "<i4"}.get(db) if da in (0, 3, 5) else None
        if dt and n and rate and dp + n * db <= len(f):
            raw = np.frombuffer(f, dt, n, dp).astype(float)
            v = (raw / (scale or 1) * 10.0 ** -dec + shift) * (mul or 1)
            chans[_txt(name)] = (np.arange(n) * 1000.0 / rate, v, _txt(unit))
        p = nxt
    return meta, chans


def _ldx_beacons(path):
    """Tiempos (ms) de paso por la linea segun el .ldx que MoTeC guarda junto al .ld."""
    try:
        root = ET.parse(path).getroot()
    except Exception:
        return []
    t = [float(m.get("Time")) / 1000.0 for m in root.iter("Marker")
         if m.get("ClassName") == "BCN" and re.match(r"\d+,", m.get("Name") or "")]
    return sorted(set(t))


def load_ld(path):
    meta, ch = _ld_channels(path)
    chans = {}
    for short, names in LD_CH.items():
        name = next((n for n in names if n in ch), None)
        chans[short] = (ch[name][0], ch[name][1]) if name else (np.array([0.0]), np.array([np.nan]))
    t, v = chans["speed"]
    chans["speed"] = (t, v / 3.6)  # km/h -> m/s
    # posicion: solo muestras con fijacion GPS (antes del fix el logger graba ceros)
    (t, la), (_, lo) = chans["lat"], chans["lon"]
    ok = np.isfinite(la) & np.isfinite(lo) & (np.abs(la) > 0.1) & (np.abs(lo) > 0.1)
    chans["lat"], chans["lon"] = (t[ok], la[ok]), (t[ok], lo[ok])
    if "GPS Heading" in ch:
        th, hd, _ = ch["GPS Heading"]
        chans["yaw"] = _yaw(th, hd)
    else:
        chans["yaw"] = (np.array([0.0]), np.array([np.nan]))
    used = {n for names in LD_CH.values() for n in names}
    extra = {}
    for name, (tc, v, unit) in ch.items():
        if name in used or not LD_KEEP.search(name) or len(v) < 10:
            continue
        if len(np.unique(v[: 20000])) < 4 or np.nanmax(np.abs(v)) < 0.5:
            continue  # sensor sin conectar (solo ceros o el valor de relleno)
        extra[name] = (tc, v, unit)
    t_end = max(len(tc) and tc[-1] for tc, _, _ in ch.values()) if ch else 0.0
    ldx = os.path.splitext(path)[0] + ".ldx"
    beacons = _ldx_beacons(ldx) if os.path.exists(ldx) else []
    if not beacons:
        beacons = _gps_crossings(chans)
    d = meta["date"]  # MoTeC: DD/MM/AAAA; AiM (y el resto de la app): MM/DD/AAAA
    date = f"{d[3:5]}/{d[0:2]}/{d[6:10]}" if re.match(r"\d\d/\d\d/\d{4}", d) else d
    return _session(path, chans, extra, beacons, t_end, date=date, hour=meta["time"],
                    driver=meta["driver"].rstrip(". "), vehicle=meta["vehicle"], venue=meta["venue"], comment=meta["comment"])


# ---------- Racelogic VBOX .vbo ----------
def load_vbo(path):
    txt = open(path, encoding="latin-1").read()
    sec, cur = {}, None
    for line in txt.splitlines():
        m = re.match(r"\s*\[(.+?)\]\s*$", line)
        if m:
            cur = m.group(1).lower(); sec[cur] = []
        elif cur is not None and line.strip():
            sec[cur].append(line.strip())
    cols = " ".join(sec.get("column names", [])).split()
    rows = [r.split() for r in sec.get("data", [])]
    rows = [r for r in rows if len(r) == len(cols)]
    if not cols or not rows:
        raise ValueError("el .vbo no tiene datos")
    D = {c: np.array([_num(r[i]) for r in rows]) for i, c in enumerate(cols)}
    # hora UTC HHMMSS.ss -> ms desde el inicio (pasando la medianoche si hace falta)
    hh = D["time"]
    secs = (hh // 10000) * 3600 + (hh // 100 % 100) * 60 + hh % 100
    secs = secs + np.cumsum(np.r_[0, np.diff(secs) < -43200]) * 86400
    t = (secs - secs[0]) * 1000.0
    # VBOX: latitud en minutos (+ norte), longitud en minutos (+ OESTE)
    lat, lon = D["lat"] / 60.0, -D["long"] / 60.0
    kmh = D["velocity"]
    ok = (np.abs(lat) > 0.1) & (np.abs(lon) > 0.1) & (D.get("sats", np.full(len(t), 9)) >= 4)
    v = kmh / 3.6
    # aceleraciones a partir de la velocidad y el rumbo del GPS
    dt = np.gradient(t / 1000.0)
    dt[dt <= 0] = np.nan
    lon_g = _smooth(np.gradient(v) / dt / G)
    _, yaw = _yaw(t, D["heading"])
    lat_g = _smooth(v * np.radians(yaw) / G)
    chans = dict(speed=(t, v), lat=(t[ok], lat[ok]), lon=(t[ok], lon[ok]), latg=(t, lat_g), long=(t, lon_g), yaw=(t, yaw))
    for k in ("rpm", "water", "gear"):
        chans[k] = (np.array([0.0]), np.array([np.nan]))
    extra = {}
    for c in cols:
        if c in ("sats", "time", "lat", "long", "velocity", "heading", "height", "vert-vel") or np.nanstd(D[c]) < 1e-6:
            continue
        extra[c] = (t, D[c], "")
    m = re.search(r"(\d\d)/(\d\d)/(\d{4})\s*@\s*(\d\d:\d\d(:\d\d)?)", txt[:300])
    date, hour = (f"{m.group(2)}/{m.group(1)}/{m.group(3)}", m.group(4)) if m else ("", "")
    if len(hour) == 5:
        hour += ":00"
    return _session(path, chans, extra, _gps_crossings(chans), t[-1], date=date, hour=hour, driver="", vehicle="", venue="", comment="")


# ---------- comun ----------
def _num(s):
    try:
        return float(s)
    except ValueError:
        return np.nan


def _smooth(v, n=5):
    return pd.Series(v).rolling(n, center=True, min_periods=1).mean().values


def _yaw(t, heading):
    """Velocidad de giro (grados/s) a partir del rumbo del GPS."""
    h = np.unwrap(np.radians(heading))
    dt = np.gradient(np.asarray(t, float) / 1000.0)
    dt[dt <= 0] = np.nan
    return np.asarray(t, float), _smooth(np.degrees(np.gradient(h) / dt))


def _gps_crossings(chans, radio=15.0):
    """Sin balizas: corta las vueltas cada vez que el auto vuelve a pasar por el punto de maxima velocidad
    (siempre cae en la recta, nunca en boxes). Devuelve los tiempos de paso en ms."""
    (t, la), (_, lo) = chans["lat"], chans["lon"]
    if len(t) < 50:
        return []
    ts, v = chans["speed"]
    vi = np.interp(t, ts, v)
    i0 = int(np.nanargmax(vi))
    R = 6371000.0
    x = np.radians(lo - lo[i0]) * R * np.cos(np.radians(la[i0]))
    y = np.radians(la - la[i0]) * R
    d = np.hypot(x, y)
    near = d < radio
    out, i, n = [], 0, len(d)
    while i < n:
        if not near[i]:
            i += 1; continue
        j = i
        while j < n and near[j]:
            j += 1
        k = i + int(np.argmin(d[i:j]))
        if not out or t[k] - out[-1] > 20000:
            out.append(float(t[k]))
        i = j
    return out


def _session(path, chans, extra, beacons, t_end, **md):
    """Arma la tabla de vueltas (igual que libxrk) con los pasos por la linea."""
    edges = [0.0] + [b for b in beacons if 0 < b < t_end] + [float(t_end)]
    rows = []
    for i in range(len(edges) - 1):
        s, e = int(round(edges[i])), int(round(edges[i + 1]))
        if e <= s:
            continue
        kind = "out" if i == 0 else ("in" if i == len(edges) - 2 else "full")
        rows.append(dict(num=len(rows), start_time=s, end_time=e, lap_type=kind))
    laps = pd.DataFrame(rows, columns=["num", "start_time", "end_time", "lap_type"])
    laps["time"] = (laps.end_time - laps.start_time) / 1000.0
    la, lo = chans["lat"][1], chans["lon"][1]
    stem = os.path.splitext(os.path.basename(path))[0].strip()
    return dict(lat0=float(np.median(la)) if len(la) > 1 else None, lon0=float(np.median(lo)) if len(lo) > 1 else None,
                extra=extra, path=path, id=re.sub(r"\s+", "_", stem.split("_")[-1]) or stem,
                series="", session="", laps=laps, chans=chans, **md)
