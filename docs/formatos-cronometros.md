# Formatos de cronómetros / dataloggers de karting

Investigación web (octubre 2026) para sumar marcas además de AiM `.xrk`. **Leyenda de confianza:** ✔ confirmado en fuente oficial o en código, ~ fuente de terceros o foro, ? no se pudo confirmar.

> Nota general: casi ningún fabricante de karting publica la especificación de su formato nativo ni de sus columnas CSV. Antes de escribir cada importador, conseguí **2 o 3 archivos reales de usuarios** de cada marca (sesión con GPS, una con varias sesiones y una exportada en otro idioma).

---

## 1. Tabla comparativa

| Marca / equipo | Software PC / móvil | Formato nativo | ¿Documentado / parser open-source? | Exportación oficial | Canales y frecuencia típicos | Camino recomendado |
|---|---|---|---|---|---|---|
| **AiM** MyChron 5/5S/6, Solo 2 / Solo 2 DL, EVO5, MXx | Race Studio 3 (RS3) | `.xrk` (binario); `.xrz` = `.xrk` comprimido con zlib | No es oficial, pero hay **DLL oficial de AiM** (32/64 bits, Windows) que lee xrk/xrz y, en beta, drk. Parsers OSS: `libxrk` (Py), `pyxrk` / `xdrk` (Rust) ✔ | CSV ("RaceStudio 3 CSV"), además de Excel y otros | GPS 10 Hz (MC5) / 25 Hz (MC6) ~, RPM, T° agua/EGT, G lat/long (en MC5/6), vueltas/beacons | **Nativo** (ya lo tenés). Sumar `.xrz` (libxrk ya lo descomprime) |
| **AiM** MyChron 3/4, EVO3/4 (legacy) | Race Studio 2 (RS2) | `.drk` (canales) + `.rrk` (GPS); descarga cruda `.dat`/`.imd` | DLL oficial de AiM (soporte drk en beta) ✔. No encontré parser OSS de `.drk` | CSV desde RS2 Analysis ("Data Export in Excel", Compatibility = CSV, separador decimal = punto) ✔ | RPM, T°, GPS opcional (MC4 + módulo GPS) | **CSV** del usuario (o convertir con la DLL de AiM en Windows) |
| **Unipro** UniGo One / UniGo 7006 | **Unipro Analyser** (Win/Mac/Linux AppImage) ✔ | `.uni` (binario, magic `UUni`, chunks `RECR`: DATE, DEVI, GLOS, LOCS, CHNL, SMRY, DATA…) ~ | No oficial. Ingeniería inversa parcial en el repo OSS `f7sbtpgt8g-ai/Karting` (`unigo_sync/core/uni_format.py`). Decodifica GPS, RPM, batería y T° interna; el volante es aproximado y faltan las aceleraciones ~ | **TSV** (texto separado por tabs, campos entre comillas, decimal con punto) desde Unipro Analyser ~ | GPS 100 Hz, logging hasta 60 Hz ✔; RPM, 2 T°, volante (sensor interno), G (GPS), DOP | **Importar el TSV** del Analyser (ver columnas en §3). Dejar `.uni` nativo para una segunda etapa |
| **Unipro** 6002/7002, 6003/7003 (legacy) | **PC Analyser** (Windows + driver USB) ✔ | Propietario, ? | Nada público | ? (no documentado) | RPM, T°, sin GPS en la mayoría de los modelos | Pedir un archivo exportado a un usuario. Prioridad baja |
| **Alfano** 6, 7 (y Legend) | **ADA** (Win / iOS / Android, gratis) y **ADA PRO** (Windows, Alfano 6 y 7) ✔ | Propietario; las apps comparten la sesión como **ZIP** ~ | Nada público | **CSV** ("Export as classic excel file" desde el detalle de la sesión) ~; ZIP con CSV/TXT desde la app o PC ~; un mirror menciona "exportación de sesión CSV a 100 Hz" con el firmware del A7 ~ | GPS (A7: 25 Hz ~), RPM, T° agua/EGT, G, lambda, volante, presión y T° de neumáticos (A7 con sensores) | **CSV/ZIP del usuario.** Aceptar el `.zip` y descomprimirlo del lado del servidor |
| **Alfano** PRO III / PRO III Evo, ADS (legacy) | ADA Windows / **VisualData** (antiguo) ✔ | Propietario | Nada público | CSV ("Export Files" con el tipo `*.csv`). Un archivo puede traer varias sesiones ("Track number") ~ | RPM, T°, GPS en las versiones GPS | CSV. Prioridad media-baja |
| "Alfano Vision" | — | — | No encontré un producto con ese nombre. Puede ser una confusión con **VisualData**, el software viejo de Alfano | — | — | Confirmar con el usuario |
| **Starlane** Stealth GPS-3/4, Corsaro, DaVinci-II | **MAAT** 2.0 (antes DigiRace-MMX) ✔ | Propietario (las sesiones se copian a un pendrive USB) | Nada público | **CSV** ("formato Excel", sesión completa o solo el tramo visible) ✔ | GPS, RPM, T° | CSV del usuario. Prioridad baja en kart |
| **2D Datarecording** | WinARace | Propietario, ? | Nada público | ? | Profesional (muchos canales) | Fuera de alcance por ahora (poco común en kart amateur) |
| **Racelogic VBOX** (y cualquier app que exporte VBO) | VBOX Test Suite / Circuit Tools | **`.vbo` (texto)** ✔. VBOX Sport y 3i con firmware ≥3 usan `.vbs` / `.vbb` | **Especificación pública** ✔. Parser JS: `vbo-reader` (npm) | Nativo | sats, time `hhmmss.sss`, lat/long en **minutos ×100000 (long con el signo invertido)**, velocity km/h, heading, height; 10–100 Hz | **Importador VBO genérico** (ver §2) |
| **RaceChrono** (Android/iOS) | App RaceChrono / Pro | Sesión interna de la app | — | **CSV v2 y CSV v3** (encabezados más descriptivos), **VBO** (import y export), NMEA, KML/GPX ~ | GPS (1–25 Hz según el receptor), OBD, G (del teléfono o calculada) | **VBO** o CSV v3 |
| **TrackAddict** (HP Tuners) | App TrackAddict | `Log-*.csv` interno | — | **CSV / KML / VBO** (Share → Send Data File) ~ | GPS, G del teléfono, OBD-II | **VBO** (o su CSV) |
| **Harry's LapTimer** | App | Base interna | — | **VBO**, KML ✔~; CSV (`LapTimerGPSRecDB.csv` dentro de un zip) ~ | GPS, G, OBD | **VBO** |
| **RaceCapture/Pro** (Autosport Labs) | RaceCapture app / Podium | `.log` = **CSV disperso** ✔ | **Documentado** ✔: encabezado `"Nombre"\|"Unidad"\|min\|max\|Hz`; columnas fijas `Interval` (ms) y `Utc` | CSV (mismo formato), conversores OSS (RCP2GEMS) | Configurable de 1 a 1000 Hz por canal | Parser propio simple (es texto) |
| **Garmin Catalyst** | App Garmin Catalyst | **FIT** ~ | FIT es un formato abierto (Garmin FIT SDK, con `fitparse` en Python y `fit-file-parser` en JS) | Sin exportación oficial a CSV. El FIT SDK trae una herramienta FIT→CSV ~ | GPS 10–25 Hz, G | Leer **FIT** nativo con una librería. Prioridad baja (es para autos) |
| **MoTeC** (i2) | MoTeC i2 | **`.ld`** (+ `.ldx` con vueltas), binario | Ingeniería inversa: `gotzl/ldparser` (Py, no soporta ldx), `motec-i2` (Rust, ld+ldx) ✔ | CSV ("MoTeC CSV") | Profesional | `ldparser` si aparece demanda; el **MoTeC CSV** también es un formato de intercambio |

---

## 2. Formatos de intercambio (un importador, muchas marcas)

1. **VBO (Racelogic)**: **es el mejor candidato.** Tiene especificación pública, es texto, y lo exportan VBOX, RaceChrono, TrackAddict y Harry's LapTimer (además, varias herramientas convierten a VBO).
   - Secciones: línea de fecha → `[header]` (nombres de canal, uno por línea) → `[channel units]` → `[comments]` → `[laptiming]` → … → `[column names]` → `[data]` (filas separadas por espacios, CRLF).
   - Ojo: lat/long en **minutos ×100000**: `deg = valor/60/100000`, y la **longitud viene con el signo invertido** (Oeste positivo). `time` es UTC `hhmmss.sss`. Hay que manejar el cruce de medianoche.
   - En la columna de satélites, si se activó el disparador de freno se suma 64: hay que enmascararlo.
   - RaceChrono, al importar, solo exige lat, long, speed y heading, y recalcula las G a partir del GPS.
2. **CSV "genérico" con mapeo de columnas**: es la red de seguridad para Alfano, Starlane, AiM RS2 y MoTeC CSV. Conviene una UI de "mapear columnas" (tiempo, lat, lon, velocidad, RPM, T°…) con **perfiles guardados por marca**, detección del separador (`,` `;` `\t`), del decimal (`,` vs `.`) y del idioma del encabezado.
3. **GPX / KML**: solo traen la traza (lat/lon/tiempo y a veces la velocidad), sin RPM ni temperaturas. Sirven para comparar líneas, no para analizar el motor. Prioridad baja.
4. **FIT**: solo para Garmin.

---

## 3. Detalle por marca

### AiM
- **Archivos** (según el documento oficial "AiM File Types"): `XRK` es el log del equipo (MyChron 5, EVO5, MXL2…). `XRZ` es un único XRK comprimido. `DRK` + `RRK` son de RS2 (canales + GPS). `DAT`/`IMD` son el volcado crudo de RS2 (MyChron 3/4, EVO3/4). `BAK`/`GPK` son auxiliares de RS2 Analysis.
- **Exportar desde RS3:** RS3 Analysis → clic derecho en la sesión → *Export Items As → RaceStudio 3 CSV* → seleccionar todos los canales. El CSV trae un bloque de metadatos (venue, vehículo, frecuencia de muestreo, vueltas/beacons), después los nombres de canal y una fila de unidades. **No encontré documentación oficial de ese encabezado:** validalo con un archivo real.
- **DLL oficial** "MatLabXRK" (32/64 bits, ejemplos para VS2022 y MATLAB): lee xrk/xrz y drk (beta). Puede servir como herramienta en Windows para convertir `.drk` legacy.
- `libxrk` lee `.xrk` y `.xrz`, detecta vueltas y convierte GPS (Python 3.10–3.14).

### Unipro
- **UniGo** (One, 7006): GPS 100 Hz, logging hasta 60 Hz, volante interno, 2 T°, RPM, lambda, sensores BLE. Descarga por WiFi (el equipo hace de AP), BT o USB.
- **Nativo `.uni`** (de la ingeniería inversa del repo `f7sbtpgt8g-ai/Karting`, archivo `unigo_sync/findings.md`):
  - el equipo sirve HTTP en `192.168.4.1` sin autenticación: `GET /file?filelist` y `GET /file?filename=…`;
  - nombre de archivo: `YYMMDD_HHMM_<pista>_<piloto>.uni`;
  - contiene registros `DA 7A` dentro del chunk `DATA`. La lat/lon es int32 BE /1e7.
  - **Ojo:** existe un endpoint `GET /file?delete=` que borra archivos. Nunca exponerlo.
- **TSV de Unipro Analyser** (28 columnas, según el parser del repo citado):
  `Start Date, Start Time, Lap Number, Session Time, Lap Time, Heading, Steering Angle, Vertical Acceleration, RPM, Steering Rate, GPS Speed, Slip, Horizontal DOP, Inverse Corner Radius, Latitude, GPS Distance, GPS Lateral Acceleration, GPS Longitudinal Acceleration, Internal Temperature, Vertical DOP, Longitude, Battery Voltage, Positional DOP, Time, Temperature 1, GPS Total Acceleration, RPM unfiltered, Altitude`
  - `Session Time` y `Lap Time` vienen en **nanosegundos**.
  - Las **filas son dispersas**: cada fila es un evento de un sensor y el resto de las columnas queda vacío, así que hay que reconstruir cada canal por separado e interpolar.
  - Un archivo puede tener **varias sesiones**: `Session Time` vuelve a ~0 en cada una.
  - **Los encabezados se traducen según el idioma** de la instalación (por ejemplo, en danés "Breddegrad" = Latitude), así que hacen falta alias. El separador decimal siempre es punto.
- **6003/7003:** usan "PC Analyser" (Windows). No encontré ninguna documentación de exportación.

### Alfano
- **Software:** ADA (Win/iOS/Android) y ADA PRO (Windows, para Alfano 6 y 7, con G, lambda, volante, EGT y presión/T° de neumáticos, más canales matemáticos). El software antiguo para PRO III es VisualData.
- **Exportación:**
  - ADA: detalle de la sesión → ícono CSV → *Export as classic excel file*.
  - App: Compartir → ZIP (con CSV/TXT y GPS).
  - VisualData: *Export Files* → `*.csv`. Puede traer varias sesiones en un mismo archivo.
- **No hay columnas documentadas públicamente.** Terceros como MyRaceLab, Kart Track y Open Racer importan el CSV y el ZIP, así que es viable, pero se necesitan muestras reales.

### Apps y otros
- **RaceChrono:** el autor recomienda VBO porque "no hay estándar en CSV". El CSV v3 tiene encabezados más ricos.
- **TrackAddict:** Share → "Send Data File (CSV / KML / VBO)".
- **Harry's LapTimer:** exporta VBO y KML. El CSV viene zipeado (`LapTimerGPSRecDB.csv`).
- **RaceCapture:** CSV disperso documentado. El encabezado de cada columna es `"Name"|"Units"|min|max|SampleRate`.
- **Garmin Catalyst:** FIT. Para CSV se usa la herramienta FIT→CSV del FIT SDK.
- **MoTeC:** `.ld` binario (parsers por ingeniería inversa) o MoTeC CSV.

---

## 4. Recomendación (plan priorizado)

Antes de empezar, definí un **modelo interno común**, por ejemplo `Session { meta, laps[], channels{name, unit, t[], v[]} }`, con canales normalizados: `time_s, lat, lon, speed_kmh, rpm, water_temp, egt, g_lat, g_lon, steering, lap_idx`. Cada importador es un adaptador hacia ese modelo, y la detección de formato se hace por extensión y "magic bytes" (`UUni`, encabezado VBO `File created on`, metadatos de AiM CSV, `"Interval"|` de RaceCapture).

1. **AiM `.xrz` + revisión de `.xrk`** (esfuerzo mínimo). Cubre la mayoría del parque de karting.
2. **Importador VBO genérico** (1 o 2 días). Suma VBOX, RaceChrono, TrackAddict y Harry's LapTimer con un solo parser. Hay especificación pública.
3. **Unipro TSV** (1 o 2 días). Columnas conocidas, filas dispersas que hay que reconstruir por canal, nanosegundos, alias por idioma y separación de sesiones. UniGo crece mucho en karting.
4. **CSV genérico con asistente de mapeo y perfiles** (2 o 3 días). Resuelve Alfano (CSV y ZIP), Starlane, AiM RS2/MyChron 4, AiM RS3 CSV y MoTeC CSV. Pedí **archivos de muestra de Alfano 6/7** para crear el perfil "Alfano" con mapeo automático.
5. **AiM RS3 CSV con perfil fijo**: útil para quien no tiene el `.xrk` a mano (por ejemplo, un compañero que solo te pasa el CSV).
6. **Opcionales:** RaceCapture (es texto y está documentado, es simple), FIT (Garmin) con librería, MoTeC `.ld` con `ldparser`.
7. **Investigación de largo plazo:** el `.uni` nativo de UniGo (decodificación parcial OSS; falta G y el volante es aproximado) y la descarga por WiFi directa desde el equipo. **Nunca** llamar a `/file?delete`.

**Para "cruzar" datos entre marcas:** remuestrear a una base común (por ejemplo 20 Hz o por **distancia**), alinear por distancia de vuelta (las vueltas no se alinean por tiempo) y recalcular en tu app la distancia y las G desde el GPS cuando falten. No hay que confiar en las G de origen, porque cada marca las calcula distinto. Además, normalizar unidades (km/h, °C) y la convención de signo de la G lateral.

---

## 5. Fuentes

- AiM, tipos de archivo (PDF oficial): https://www.aimsports.com/webinars/Documents/AiM_FileTypes.pdf
- AiM XRK DLL oficial: https://www.aim-sportline.com/docs/racestudio3/html/xrk-dll.html
- libxrk (PyPI): https://pypi.org/project/libxrk/ · repo: https://github.com/m3rlin45/libxrk · pyxrk: https://github.com/joeportela/pyxrk
- Wrapper MATLAB de la DLL de AiM: https://www.mathworks.com/matlabcentral/fileexchange/180222-read-aim-xrk-files
- Exportación de AiM RS3 a CSV: https://karttrackapp.com/how-to · RaceRender (AiM RS2, Alfano VisualData, HLT, TrackAddict, etc.): https://racerender.com/RR3/docs/HowTo-DataInput.html
- Unipro, descargas (Unipro Analyser / PC Analyser): https://uniprolaptimer.com/downloads/ · UniGo 7006 (especificaciones): https://uniprolaptimer.com/laptimer-and-datalogger-for-karting-unigo7006/
- Repo OSS de Unipro (parser TSV + ingeniería inversa de `.uni`): https://github.com/f7sbtpgt8g-ai/Karting (`telemetry/parser.py`, `unigo_sync/findings.md`, PR #28 de alias por idioma)
- Alfano ADA: https://www.alfano.com/en/ada/ · https://www.alfano.co.uk/alfano-software-ada-mychron-APPS-unipro-off-camber-data-race-studio
- Exportación CSV de Alfano: https://myracelab.com/device-support/alfano/ · ZIP de Alfano: https://open-racer.com/alfano-racing-line-importer · ApexHub (AiM/Alfano/UniGo): http://apexhub.run/
- Starlane, manuales y MAAT: https://www.starlane.com/ftp/manuali/DRMMX_ENG.pdf · https://www.starlane.com/ftp/manuali/MAAT_Eng.pdf · https://www.starlane.com/en/software-update-download
- Especificación VBO: https://developers.racelogic.co.uk/Portal/Tutorials/tutorialVBOfilestructure.html · https://en.racelogic.support/Knowledge_Base/.VBO_Files · vbo-reader (npm): https://unpkg.com/vbo-reader@1.4.0/README.md
- RaceChrono (CSV v3 / VBO): https://racechrono.com/forum/discussion/comment/11815/
- TrackAddict, exportación: https://forum.hptuners.com/showthread.php?p=462424
- RaceCapture, formato de log: https://wiki.autosportlabs.com/RaceCapturePro2_logfile_reference · https://github.com/autosportlabs/RCP2GEMS
- Garmin Catalyst, FIT: https://rennlist.com/forums/data-acquisition-and-analysis-for-racing-and-de/1325046-garmin-catalyst-technical-hacks.html
- MoTeC `.ld`: https://github.com/gotzl/ldparser · https://lib.rs/crates/motec-i2
