"""Analisis de motor / unidad de potencia a partir de RPM y velocidad GPS.

Ideas:
- Tiempo para subir de una RPM a otra (por marcha y por salida de curva, para comparar igual con igual).
- "Dinamometro de pista": aceleracion longitudinal media por RPM en cada marcha. A igual RPM y marcha
  la velocidad es la misma, asi que el arrastre aerodinamico tambien: la diferencia es motor (o peso).
- Puntos de cambio, RPM y velocidad maxima en recta, relacion RPM/velocidad (detecta cambio de corona).
"""
import numpy as np
import pandas as pd
from scipy.signal import savgol_filter, find_peaks

G = 9.81
DEFAULT_BANDS = [(10000, 12000), (12000, 13500)]


def detect_gears(S, laps_by_ses):
    """Relaciones RPM/(km/h) de cada marcha a partir del histograma de todas las tandas."""
    ratios = []
    for sid, s in S.items():
        tr, r = s["chans"]["rpm"]; ts, v = s["chans"]["speed"]
        for _, lap in laps_by_ses[sid].iterrows():
            m = (tr >= lap.start_time) & (tr <= lap.end_time)
            kmh = np.interp(tr[m], ts, v) * 3.6
            ok = kmh > 40
            ratios.append(r[m][ok] / kmh[ok])
    x = np.concatenate(ratios)
    h, b = np.histogram(x, bins=np.arange(60, 260, 2))
    hs = np.convolve(h, np.ones(3) / 3, mode="same")
    pk, _ = find_peaks(hs, prominence=hs.max() * 0.08, distance=8)
    pk = sorted(pk, key=lambda i: -hs[i])[:2]
    vals = sorted(float(b[i] + 1) for i in pk)
    # mayor relacion = 1ra marcha
    return {g + 1: v for g, v in enumerate(reversed(vals))}


def _session_series(s, laps, gears, ref_len):
    """Serie a 20 Hz (base RPM) de las vueltas rapidas con marcha, aceleracion y posicion."""
    tr, r = s["chans"]["rpm"]
    ts, v = s["chans"]["speed"]
    tla, la = s["chans"]["latg"]
    vs = savgol_filter(v, 11, 2)
    acc = np.gradient(vs, ts / 1000.0) / G  # g, desde la derivada de velocidad GPS
    tp, sp = s.get("proj", (None, None))
    parts = []
    for _, lap in laps.iterrows():
        m = (tr >= lap.start_time) & (tr <= lap.end_time)
        t = tr[m]
        rpm = pd.Series(r[m]).rolling(3, center=True, min_periods=1).median().values
        kmh = np.interp(t, ts, vs) * 3.6
        d = pd.DataFrame(dict(t=t, lap=int(lap.num), rpm=rpm, kmh=kmh, acc=np.interp(t, ts, acc),
                              lat=np.abs(np.interp(t, tla, la))))
        ratio = d.rpm / d.kmh.clip(lower=1)
        d["gear"] = 0
        for g, gr in gears.items():
            d.loc[(ratio > gr * 0.94) & (ratio < gr * 1.06) & (d.kmh > 30), "gear"] = g
        if tp is not None:
            ok = np.isfinite(sp)
            d["s"] = np.mod(np.interp(t, tp[ok], sp[ok]), ref_len)
        else:
            d["s"] = np.nan
        parts.append(d)
    return pd.concat(parts, ignore_index=True)


def _band_events(d, lo, hi, corners):
    """Subidas de RPM de lo a hi sin levantar ni cambiar de marcha."""
    ev = []
    for lap, q in d.groupby("lap"):
        rpm, t, gear = q.rpm.values, q.t.values, q.gear.values
        i = 1
        while i < len(rpm):
            if rpm[i - 1] < lo <= rpm[i]:
                t_lo = np.interp(lo, [rpm[i - 1], rpm[i]], [t[i - 1], t[i]])
                g = gear[i]
                j, peak, ok = i, rpm[i], False
                while j < len(rpm):
                    peak = max(peak, rpm[j])
                    if rpm[j] < peak - 250 or (gear[j] not in (0, g)) or t[j] - t_lo > 8000:
                        break
                    if rpm[j] >= hi:
                        t_hi = np.interp(hi, [rpm[j - 1], rpm[j]], [t[j - 1], t[j]])
                        ok = True
                        break
                    j += 1
                if ok and g and (t_hi - t_lo) > (hi - lo) / 8.0:  # descarta saltos (cambios, ruido)
                    s0 = q.s.values[i]
                    apex = [c for c in corners if c["s_apex"] <= s0]
                    exit_of = (apex[-1] if apex else corners[-1])["n"]
                    ev.append(dict(lap=int(lap), gear=int(g), dur=(t_hi - t_lo) / 1000.0, s=float(s0), salida=int(exit_of),
                                   kmh0=float(q.kmh.values[i]), kmh1=float(q.kmh.values[min(j, len(rpm) - 1)]),
                                   lat=float(q.lat.values[i:j + 1].mean())))
                i = j + 1
            else:
                i += 1
    return pd.DataFrame(ev)


def _dyno(d, gear, lo=9000, hi=14600, step=250):
    """Aceleracion media por banda de RPM, solo acelerando en (casi) linea recta."""
    q = d[(d.gear == gear)].copy()
    q["drpm"] = np.gradient(q.rpm.values)
    q = q[(q.drpm > 0) & (q.lat < 0.8)]
    out = []
    for b in range(lo, hi, step):
        x = q[(q.rpm >= b) & (q.rpm < b + step)].acc
        if len(x) >= 8:
            out.append(dict(rpm=b + step / 2, acc=float(x.median()), se=float(1.2533 * x.std() / np.sqrt(len(x))), n=int(len(x))))
    return out


def _lap_index(d, gear, ref_curve, step=250):
    """Un numero por vuelta: aceleracion de esa vuelta relativa a la curva de referencia (1.00 = igual).
    Medir por vuelta evita contar como independientes muestras pegadas de la misma vuelta."""
    q = d[(d.gear == gear)].copy()
    q["drpm"] = np.gradient(q.rpm.values)
    q = q[(q.drpm > 0) & (q.lat < 0.8)]
    q["bin"] = (q.rpm // step) * step + step / 2
    q = q[q.bin.isin(list(ref_curve))]
    out = []
    for _, x in q.groupby("lap"):
        g = x.groupby("bin").acc
        m = g.median()[g.size() >= 2]
        if len(m) >= 4:
            # diferencia en g sumada sobre los regimenes medidos, relativa a la aceleracion de referencia en esos mismos regimenes:
            # asi un regimen alto (poca aceleracion por el aire) no infla el porcentaje
            out.append(float(1 + sum(m[b] - ref_curve[b] for b in m.index) / sum(ref_curve[b] for b in m.index)))
    return np.array(out)


def _shifts(d):
    out = []
    for lap, q in d.groupby("lap"):
        g = q.gear.values
        nz = np.where(g > 0)[0]
        for a, b in zip(nz[:-1], nz[1:]):
            if g[a] == 1 and g[b] == 2 and b - a <= 10:
                out.append(dict(lap=int(lap), rpm_antes=float(q.rpm.values[a]), rpm_despues=float(q.rpm.values[b]), kmh=float(q.kmh.values[b])))
    return out


def analyze(S, laps_by_ses, ref_id, ref_len, corners, bands=None):
    bands = bands or DEFAULT_BANDS
    gears = detect_gears(S, laps_by_ses)
    res = {"gears": gears, "bands": [list(b) for b in bands], "sessions": {}, "compare": []}
    events, series = {}, {}
    for sid, s in S.items():
        d = _session_series(s, laps_by_ses[sid], gears, ref_len)
        series[sid] = d
        ev = {f"{lo}-{hi}": _band_events(d, lo, hi, corners) for lo, hi in bands}
        events[sid] = ev
        laps = []
        for lap, q in d.groupby("lap"):
            laps.append(dict(lap=int(lap), rpm_max=float(q.rpm.quantile(0.995)), kmh_max=float(q.kmh.max())))
        sh = _shifts(d)
        res["sessions"][sid] = dict(
            dyno={g: _dyno(d, g) for g in gears},
            bands={k: (dict(n=len(e), median=float(e.dur.median()), p25=float(e.dur.quantile(.25)), p75=float(e.dur.quantile(.75)),
                            by_gear={int(g): dict(n=len(x), median=float(x.dur.median())) for g, x in e.groupby("gear")})
                       if len(e) else dict(n=0)) for k, e in ev.items()},
            events={k: e.round(3).to_dict("records") for k, e in ev.items()},
            rpm_max=float(np.median([l["rpm_max"] for l in laps])), kmh_max=float(np.median([l["kmh_max"] for l in laps])),
            ratio_top=float(np.median((d.rpm / d.kmh.clip(lower=1))[(d.gear == min(gears, key=lambda g: gears[g])) & (d.kmh > 90)])),
            shifts=dict(n=len(sh), rpm_antes=float(np.median([x["rpm_antes"] for x in sh])) if sh else None,
                        rpm_despues=float(np.median([x["rpm_despues"] for x in sh])) if sh else None),
            laps=laps)

    # comparaciones contra la tanda de referencia: igual marcha y misma salida de curva
    for sid in S:
        if sid == ref_id:
            continue
        cmp = {"ses": sid, "bands": {}, "dyno": {}}
        for k in events[ref_id]:
            A, B = events[ref_id][k], events[sid][k]
            if A.empty or B.empty:
                cmp["bands"][k] = None
                continue
            rows = []
            for (g, ex), a in A.groupby(["gear", "salida"]):
                b = B[(B.gear == g) & (B.salida == ex)]
                if len(a) >= 2 and len(b) >= 2:
                    rows.append(dict(gear=int(g), salida=int(ex), a=float(a.dur.median()), b=float(b.dur.median()),
                                     n=min(len(a), len(b)), sa=float(a.dur.std()), sb=float(b.dur.std()), na=len(a), nb=len(b)))
            if not rows:
                cmp["bands"][k] = None
                continue
            r = pd.DataFrame(rows)
            w = r.n / r.n.sum()
            pct = float(((r.b - r.a) / r.a * w).sum() * 100)
            se = float(np.sqrt((w ** 2 * ((r.sa ** 2 / r.na + r.sb ** 2 / r.nb) / r.a ** 2)).sum()) * 100)
            cmp["bands"][k] = dict(pct=pct, se=se, real=bool(abs(pct) > 2 * se), detalle=r.round(3).to_dict("records"))
        for g in gears:
            ref_curve = {x["rpm"]: x["acc"] for x in res["sessions"][ref_id]["dyno"][g] if x["acc"] > 0.05}
            other = {x["rpm"] for x in res["sessions"][sid]["dyno"][g]}
            ref_curve = {k: v for k, v in ref_curve.items() if k in other}
            iA, iB = _lap_index(series[ref_id], g, ref_curve), _lap_index(series[sid], g, ref_curve)
            if len(ref_curve) < 4 or len(iA) < 3 or len(iB) < 3:
                cmp["dyno"][g] = None
                continue
            mA, mB = iA.mean(), iB.mean()
            pct = float((mB / mA - 1) * 100)
            va, vb = iA.var(ddof=1) / len(iA), iB.var(ddof=1) / len(iB)
            se = float(np.sqrt(va + vb) / mA * 100)
            # pocas vueltas: margen con t de Student (Welch) en lugar de 2 sigma
            from scipy.stats import t as student
            df = (va + vb) ** 2 / (va ** 2 / (len(iA) - 1) + vb ** 2 / (len(iB) - 1)) if (va + vb) > 0 else 1
            margin = float(student.ppf(0.975, max(df, 1)) * se)
            cmp["dyno"][g] = dict(pct=pct, se=se, margin=margin, real=bool(abs(pct) > margin and abs(pct) >= 1.5),
                                  vueltas=[int(len(iA)), int(len(iB))],
                                  rango=[min(ref_curve), max(ref_curve)])
        res["compare"].append(cmp)
    return res
