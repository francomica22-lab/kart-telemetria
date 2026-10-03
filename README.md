# Análisis Karting

Compará tandas de la **AiM MyChron** (archivos `.xrk`) curva por curva: cuánto se pierde, dónde, si es manejo o agarre, y cómo rindió el motor.

- **Web:** https://francomica22-lab.github.io/kart-telemetria/ — el análisis corre en el navegador (Pyodide); los archivos no se suben.
- **Windows:** [descargar](https://github.com/francomica22-lab/kart-telemetria/releases/latest/download/AnalisisKarting-windows.zip). Funciona sin internet. Al abrirlo por primera vez se instala solo y crea el acceso directo. Cuando hay una versión nueva aparece un aviso **!** arriba a la derecha.

> Windows puede mostrar "Windows protegió su PC" porque el programa no está firmado: tocá *Más información → Ejecutar de todas formas*.

## Estructura

| Carpeta | Qué hay |
|---|---|
| `app/` | Análisis en Python (`kartlib`, `tandas`, `motor`, `sesiones`), programa de escritorio (`desktop.py`) y actualizador (`updater.py`) |
| `web/` | Interfaz (la misma para escritorio y web). `web-backend.js` + `py-worker.js` solo se usan en la web |
| `tools/build_site.py` | Arma la carpeta `site/` para GitHub Pages |
| `.github/workflows/` | `pages.yml` publica la web en cada push a `main`; `release.yml` arma el `.exe` en cada tag `vX.Y.Z` |

## Cómo publicar una versión

1. Cambios en `main` → la web se actualiza sola.
2. Para el programa de Windows: subir `VERSION`, commit, y un tag con notas:

```bash
git tag -a v1.1.0 -m "Qué cambió en esta versión"
git push origin main --tags
```

GitHub Actions arma el ejecutable y publica el Release; los programas instalados lo ofrecen como actualización.

## Desarrollo local

```bash
pip install -r requirements.txt
python app/desktop.py
```
