/* Catalogo de categorias, chasis y motores, e identificacion de cada kart (por el nombre que trae la MyChron).
   La identificacion se guarda en este equipo por nombre de vehiculo: se confirma una vez por kart. */
(function () {
  const CATEGORIAS = ["Rotax Micro Max", "Rotax Mini Max", "Rotax Junior Max", "Rotax Senior Max", "Rotax DD2", "Rotax DD2 Masters",
    "IAME X30 Junior", "IAME X30 Senior", "IAME KA100", "OK", "OK Junior", "KZ", "KZ2", "Mini / Cadete", "Otra"];
  const CHASIS = ["Tony Kart", "Pantano", "Kart Republic", "Birel ART", "CRG", "Praga", "Kosmic", "Exprit", "Redspeed", "LN Racing",
    "Sodi", "Energy", "Parolin", "Ricciardo", "Maranello", "Intrepid", "Otro"];
  const MOTORES = ["Rotax DD2 EVO", "Rotax Max EVO", "Rotax Micro/Mini Max", "IAME X30", "IAME KA100", "Vortex", "TM Racing", "Modena", "Otro"];
  const PISTAS_CAT = { "Rotax DD2": "Rotax DD2 EVO", "Rotax DD2 Masters": "Rotax DD2 EVO", "Rotax Senior Max": "Rotax Max EVO", "Rotax Junior Max": "Rotax Max EVO",
    "Rotax Micro Max": "Rotax Micro/Mini Max", "Rotax Mini Max": "Rotax Micro/Mini Max", "IAME X30 Junior": "IAME X30", "IAME X30 Senior": "IAME X30", "IAME KA100": "IAME KA100" };
  const CH_PAT = [[/TONY/, "Tony Kart"], [/PANTANO/, "Pantano"], [/\bKR\b|KART ?REPUBLIC/, "Kart Republic"], [/BIREL/, "Birel ART"], [/\bCRG\b/, "CRG"],
    [/PRAGA/, "Praga"], [/KOSMIC/, "Kosmic"], [/EXPRIT/, "Exprit"], [/REDSPEED/, "Redspeed"], [/\bLN\b/, "LN Racing"], [/SODI/, "Sodi"], [/ENERGY/, "Energy"],
    [/PAROLIN/, "Parolin"], [/RICCIARDO/, "Ricciardo"], [/MARANELLO/, "Maranello"], [/INTREPID/, "Intrepid"]];
  const CAT_PAT = [[/DD2/, "Rotax DD2"], [/SENIOR|\bMAX\b/, "Rotax Senior Max"], [/JUNIOR/, "Rotax Junior Max"], [/MICRO/, "Rotax Micro Max"],
    [/MINI/, "Rotax Mini Max"], [/X30/, "IAME X30 Senior"], [/KA100/, "IAME KA100"], [/\bKZ2?\b/, "KZ"], [/\bOKJ?\b/, "OK"], [/CADETE/, "Mini / Cadete"]];

  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } } };
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function guess(vehicle) {
    const up = (vehicle || "").toUpperCase();
    const cat = (CAT_PAT.find(([re]) => re.test(up)) || [])[1] || "";
    const ch = (CH_PAT.find(([re]) => re.test(up)) || [])[1] || "";
    return { categoria: cat, chasis: ch, motor: PISTAS_CAT[cat] || "", confirmado: false };
  }
  function get(vehicle) {
    const db = store.get("kt-karts", {}), k = (vehicle || "").trim().toUpperCase();
    return db[k] ? Object.assign({ confirmado: true }, db[k]) : guess(vehicle);
  }
  function set(vehicle, v) {
    const db = store.get("kt-karts", {});
    db[(vehicle || "").trim().toUpperCase()] = { categoria: v.categoria, chasis: v.chasis, motor: v.motor };
    store.set("kt-karts", db);
  }
  function label(vehicle) {
    const k = get(vehicle);
    return [k.categoria, k.chasis].filter(Boolean).join(" · ") || "Kart sin identificar";
  }
  function modal(vehicle, onDone) {
    const k = get(vehicle), d = document.createElement("div");
    const sel = (id, list, v) => `<input id="${id}" list="${id}-l" value="${esc(v)}" autocomplete="off"><datalist id="${id}-l">${list.map(x => `<option value="${esc(x)}">`).join("")}</datalist>`;
    d.className = "modal";
    d.innerHTML = `<form class="mbox" role="dialog" aria-modal="true" aria-labelledby="kt-kt"><h2 id="kt-kt">¿Qué kart es?</h2>
      <p class="ink2 small">La MyChron lo llama <b>${esc(vehicle || "sin nombre")}</b>. Elegí o escribí la categoría, el chasis y el motor. Queda guardado para este kart.</p>
      <div class="sgrid"><label><span>Categoría</span>${sel("kt-cat", CATEGORIAS, k.categoria)}</label>
        <label><span>Chasis</span>${sel("kt-ch", CHASIS, k.chasis)}</label>
        <label class="full"><span>Motor</span>${sel("kt-mo", MOTORES, k.motor)}</label></div>
      <div class="mact"><button type="button" class="btn" id="kt-x">Cancelar</button><button type="submit" class="btn primary">Guardar</button></div></form>`;
    document.body.appendChild(d);
    const cat = d.querySelector("#kt-cat"), mo = d.querySelector("#kt-mo");
    cat.addEventListener("change", () => { if (!mo.value && PISTAS_CAT[cat.value]) mo.value = PISTAS_CAT[cat.value]; });
    d.querySelector("#kt-x").addEventListener("click", () => d.remove());
    d.querySelector("form").addEventListener("submit", e => {
      e.preventDefault();
      set(vehicle, { categoria: cat.value.trim().slice(0, 40), chasis: d.querySelector("#kt-ch").value.trim().slice(0, 40), motor: mo.value.trim().slice(0, 40) });
      d.remove(); onDone && onDone();
    });
  }
  window.KTK = { CATEGORIAS, CHASIS, MOTORES, guess, get, set, label, modal };
})();
