"""Ficha del circuito: largo, curvas (sentido, radio, giro, velocidad), rectas, porcentaje a fondo y nivel de agarre.

Se arma con la vuelta de referencia (trazado) y con todas las vueltas analizadas de todas las tandas (agarre).
La "huella" sirve para encontrar circuitos parecidos.
"""
import numpy as np
import pandas as pd

G = 9.81


def _heading(x, y):
    h = np.unwrap(np.arctan2(np.gradient(y), np.gradient(x)))
    return np.degrees(h)


def circuit_profile(rdf, corners, R, traces_all, best_time):
    """rdf: vuelta de referencia remuestreada cada 1 m (x, y, speed, latg, long).
    R: metricas por curva y vuelta de todas las tandas. traces_all: lista de DataFrames de todas las vueltas analizadas."""
    L = float(rdf.s.iloc[-1])
    sp = rdf.speed.rolling(9, center=True, min_periods=1).mean().values
    lat = rdf.latg.rolling(9, center=True, min_periods=1).median().values
    hd = _heading(rdf.x.values, rdf.y.values)
    curvas = []
    for c in corners:
        n = c["n"]
        q = R[R.curva == n]
        ia = int(np.argmin(np.abs(rdf.s.values - c["s_apex"])))
        # zona de giro: alrededor del vertice mientras la G lateral sea apreciable
        a, b = ia, ia
        while a > 0 and abs(lat[a]) > 0.6 and ia - a < 150:
            a -= 1
        while b < len(lat) - 1 and abs(lat[b]) > 0.6 and b - ia < 150:
            b += 1
        giro = float(hd[b] - hd[a])
        vmin = float(q.v_min.median()) if len(q) else float(sp[ia])
        g_ap = float(np.median(np.abs(lat[max(0, ia - 5):ia + 6]))) or 0.1
        radio = (vmin / 3.6) ** 2 / (g_ap * G)
        tipo = "lenta" if vmin < 65 else "media" if vmin < 85 else "rápida"
        forma = "horquilla" if abs(giro) >= 135 else "cerrada" if abs(giro) >= 75 else "abierta"
        curvas.append(dict(n=n, sentido="izquierda" if giro > 0 else "derecha", giro=round(abs(giro)), radio=round(radio, 1),
                           v_min=round(vmin, 1), tipo=tipo, forma=forma, s_apex=round(float(c["s_apex"])),
                           lat_max=round(float(q.lat_max.quantile(0.9)), 2) if len(q) else None,
                           frenada_g=round(float(q.freno_max.median()), 2) if len(q) else None))
    # rectas: tramos de 60 m o mas con poca G lateral (suavizada); se recorre la vuelta dos veces para no cortar la recta en la largada
    latr = np.abs(rdf.latg.rolling(25, center=True, min_periods=1).median().values)
    n = len(latr)
    straight = np.r_[latr, latr] < 0.55
    cand, i = [], 0
    while i < 2 * n:
        if straight[i]:
            j = i
            while j < 2 * n and straight[j] and j - i < n:
                j += 1
            if j - i >= 60:
                cand.append((i, j))
            i = j
        else:
            i += 1
    # las mas largas primero; se descartan las que se superponen con una ya elegida (misma recta vista dos veces)
    rectas, used = [], set()
    for i, j in sorted(cand, key=lambda c: c[0] - c[1]):
        idx = set((np.arange(i, j) % n).tolist())
        if len(idx & used) > 0.3 * len(idx):
            continue
        used |= idx
        ii = np.arange(i, j) % n
        rectas.append(dict(desde=int(i % n), largo=int(j - i), v_max=round(float(sp[ii].max()), 1)))
    allv = pd.concat(traces_all) if traces_all else rdf
    lg = allv.long.rolling(5, center=True, min_periods=1).median()
    la = allv.latg.abs().rolling(7, center=True, min_periods=1).median()
    acel = float((lg > 0.05).mean() * 100)
    frena = float((lg < -0.3).mean() * 100)
    # agarre: G lateral maxima tipica en las curvas (mediana de las curvas del percentil 90 por vuelta)
    gs = [c["lat_max"] for c in curvas if c["lat_max"] is not None]
    grip = float(np.median(gs)) if gs else float(la.quantile(0.97))
    nivel = "alto" if grip >= 2.2 else "medio" if grip >= 1.8 else "bajo"
    n_tipo = {t: sum(1 for c in curvas if c["tipo"] == t) for t in ("lenta", "media", "rápida")}
    izq = sum(1 for c in curvas if c["sentido"] == "izquierda")
    return dict(
        largo=round(L), curvas=curvas, rectas=rectas, recta_max=max((r["largo"] for r in rectas), default=0),
        v_media=round(L / best_time * 3.6, 1), v_max=round(float(sp.max()), 1), v_min=round(float(sp.min()), 1),
        pct_acelerando=round(acel), pct_frenando=round(frena), grip_g=round(grip, 2), grip_nivel=nivel,
        n_lentas=n_tipo["lenta"], n_medias=n_tipo["media"], n_rapidas=n_tipo["rápida"], n_izq=izq, n_der=len(curvas) - izq,
        sentido_giro="antihorario" if izq > len(curvas) - izq else "horario",
        # huella para comparar circuitos (valores normalizados aprox. 0..1)
        huella=[round(L / 1500, 3), round(L / best_time * 3.6 / 100, 3), round(n_tipo["lenta"] / max(len(curvas), 1), 3),
                round(acel / 100, 3), round(len(curvas) / 15, 3), round(max((r["largo"] for r in rectas), default=0) / 400, 3)],
    )
