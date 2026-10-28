"""Genera los SVG del logo IVO (web/img/ivo*.svg). Geometría derecha, inclinada 18°."""
import math, os

CX, CY = 231, 110
ROJO, BLANCO, NEGRO = "#E8341C", "#F7F7F7", "#0B0B0C"


def _pt(rx, ry, t):
    t = math.radians(t)
    return CX + rx * math.cos(t), CY + ry * math.sin(t)


def _pts(p):
    return " ".join(f"{x:.1f},{y:.1f}" for x, y in p)


def cuentavueltas(letra, gris, rojo=ROJO):
    s, e = _pt(46, 34, -128), _pt(46, 34, -10)
    out = [f'<path d="M{s[0]:.1f} {s[1]:.1f}A46 34 0 1 0 {e[0]:.1f} {e[1]:.1f}" fill="none" stroke="{letra}" stroke-width="32"/>']
    cols = [gris] * 2 + [letra] * 3 + [rojo] * 3
    for k, c in enumerate(cols):
        t, h = -116 + 94 * k / 7, 4.6
        out.append(f'<polygon points="{_pts([_pt(38, 26, t - h * 1.2), _pt(62, 50, t - h), _pt(62, 50, t + h), _pt(38, 26, t + h * 1.2)])}" fill="{c}"/>')
    tip, base = _pt(33, 21, -50), (CX - 12, CY + 10)
    dx, dy = tip[0] - base[0], tip[1] - base[1]
    L = math.hypot(dx, dy)
    px, py = -dy / L * 5.5, dx / L * 5.5
    out.append(f'<polygon points="{_pts([(base[0] + px, base[1] + py), (base[0] - px, base[1] - py), tip])}" fill="{rojo}"/>')
    return "".join(out)


def letra_i(letra, rojo=ROJO):
    return f'<rect x="8" y="20" width="38" height="26" fill="{rojo}"/><rect x="0" y="60" width="37" height="100" fill="{letra}"/>'


def wordmark(letra, gris):
    return (f'<g transform="translate(70 0) skewX(-18)">{letra_i(letra)}'
            f'<polygon points="47,60 86,60 103,116 120,60 159,60 122,160 84,160" fill="{letra}"/>'
            f'<g transform="translate(-2 0)">{cuentavueltas(letra, gris)}</g></g>')


def svg(vb, body, w=None, h=None):
    size = f' width="{w}" height="{h}"' if w else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}"{size}>{body}</svg>\n'


def icono(fondo=NEGRO, letra=BLANCO, gris="#6B6F77"):
    return svg("0 0 120 120", f'<rect width="120" height="120" rx="26" fill="{fondo}"/>'
               f'<g transform="translate(60 62) scale(.78) skewX(-12) translate(-231 -110)">{cuentavueltas(letra, gris)}</g>')


if __name__ == "__main__":
    d = os.path.join(os.path.dirname(__file__), "..", "web", "img")
    files = {
        "ivo.svg": svg("8 14 340 150", wordmark(BLANCO, "#6B6F77")),          # para fondo oscuro
        "ivo-claro.svg": svg("8 14 340 150", wordmark(NEGRO, "#B3B6BC")),     # para fondo claro
        "ivo-icono.svg": icono(),
    }
    for n, s in files.items():
        with open(os.path.join(d, n), "w", encoding="utf-8") as f:
            f.write(s)
    print("ok", list(files))
