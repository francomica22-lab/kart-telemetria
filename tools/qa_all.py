"""QA: corre el analisis con cada tanda sola y con pares de tandas de la misma pista. Uso: python tools/qa_all.py <carpeta>"""
import sys, os, glob, json, itertools, time, traceback
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "app"))
from tandas import build_data
from sesiones import session_info, clean

root = sys.argv[1]
files = sorted(glob.glob(os.path.join(root, "**", "*.xrk"), recursive=True))
info = {}
for f in files:
    try:
        info[f] = session_info(f)
    except Exception as e:
        print("LISTA FALLA", os.path.basename(f), e)
withlaps = [f for f, r in info.items() if r["vueltas"] > 0]
print(len(files), "archivos,", len(withlaps), "con vueltas")
fails = 0
cases = [[f] for f in withlaps] + [list(p) for p in itertools.combinations(withlaps, 2)]
t0 = time.time()
for case in cases:
    try:
        out = clean(build_data(case, log=lambda *a: None))
        json.dumps(out, allow_nan=False)
    except Exception as e:
        fails += 1
        tb = traceback.format_exc().strip().splitlines()
        print("FALLA", [info[c]["id"] for c in case], tb[-1], "|", [l for l in tb if "app" in l][-1:])
print(f"{len(cases)} casos, {fails} fallas, {time.time() - t0:.0f} s")
