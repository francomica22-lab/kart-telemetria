// Boton de baja y boton de arrepentimiento (Ley 24.240 y Res. 424/2020).
//   baja:            cancela la renovacion; lo pagado sigue valiendo hasta que vence.
//   arrepentimiento: hasta 10 dias desde el primer pago; cancela ya y deja registrado el pedido de devolucion.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const DIAS_ARREPENTIMIENTO = 10;

Deno.serve(async (req) => {
  if (req.method == "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const sbUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
    const { data: { user } } = await sbUser.auth.getUser();
    if (!user) return json({ error: "Ingresá a tu cuenta." }, 401);
    let body: { tipo?: string; motivo?: string } = {};
    try { body = await req.json(); } catch { /* vacio */ }
    const motivo = String(body.motivo || "").slice(0, 500);
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: s, error: e0 } = await db.from("suscripciones").select("*").eq("user_id", user.id).maybeSingle();
    if (e0) throw e0;
    const ahora = new Date();
    let tipo = body.tipo == "arrepentimiento" ? "arrepentimiento" : "baja";
    const pagada = s && ["mercadopago", "lemonsqueezy"].includes(s.proveedor) && s.estado != "prueba";
    if (!pagada) {
      await db.from("pedidos_baja").insert({ user_id: user.id, email: user.email, tipo, motivo, estado: "resuelto" });
      return json({ ok: true, msg: "No tenés una suscripción paga activa: no se te va a cobrar nada." });
    }
    // el arrepentimiento vale hasta 10 dias desde el primer pago de esta suscripcion
    const dias = s.inicio_pago ? (ahora.getTime() - new Date(s.inicio_pago).getTime()) / 864e5 : 0;
    let nota = "";
    if (tipo == "arrepentimiento" && dias > DIAS_ARREPENTIMIENTO) { tipo = "baja"; nota = "Pasaron más de 10 días desde el pago, así que lo tomamos como baja. "; }

    // cancelar en el medio de pago (si ya estaba cancelada, no hace falta)
    if (s.estado != "cancelada" && s.proveedor_ref) {
      try {
        if (s.proveedor == "mercadopago") {
          const r = await fetch(`https://api.mercadopago.com/preapproval/${s.proveedor_ref}`, { method: "PUT",
            headers: { Authorization: `Bearer ${Deno.env.get("MP_ACCESS_TOKEN")}`, "Content-Type": "application/json" }, body: JSON.stringify({ status: "cancelled" }) });
          if (!r.ok) throw new Error("Mercado Pago " + r.status);
        } else {
          const r = await fetch(`https://api.lemonsqueezy.com/v1/subscriptions/${s.proveedor_ref}`, { method: "DELETE",
            headers: { Authorization: `Bearer ${Deno.env.get("LS_API_KEY")}`, Accept: "application/vnd.api+json" } });
          if (!r.ok) throw new Error("Lemon Squeezy " + r.status);
        }
      } catch (e) {
        await db.from("pedidos_baja").insert({ user_id: user.id, email: user.email, tipo, estado: "pendiente", proveedor: s.proveedor, proveedor_ref: s.proveedor_ref,
          motivo: `ERROR AL CANCELAR (${e}): cancelar a mano. ${motivo}`.slice(0, 600) });
        return json({ ok: false, msg: "Registramos tu pedido y lo procesamos a mano en menos de 48 h. No se te va a volver a cobrar." });
      }
    }
    const upd: Record<string, unknown> = { estado: "cancelada", actualizado: ahora.toISOString() };
    if (tipo == "arrepentimiento") upd.vence = ahora.toISOString();   // se corta ya: se devuelve lo cobrado
    const { error: e1 } = await db.from("suscripciones").update(upd).eq("user_id", user.id);
    if (e1) throw e1;
    const { error: e2 } = await db.from("pedidos_baja").insert({ user_id: user.id, email: user.email, tipo, motivo,
      estado: tipo == "arrepentimiento" ? "pendiente" : "resuelto", proveedor: s.proveedor, proveedor_ref: s.proveedor_ref });
    if (e2) console.error(e2);
    return json({ ok: true, msg: tipo == "arrepentimiento"
      ? "Listo: cancelamos la suscripción y pedimos la devolución de lo cobrado. Te escribimos por mail cuando esté hecha (hasta 10 días hábiles)."
      : `${nota}Listo: cancelamos la renovación. Seguís con tu plan hasta el ${new Date(s.vence).toLocaleDateString("es-AR")}.` });
  } catch (e) {
    console.error(e);
    return json({ error: "No se pudo completar. Probá de nuevo o escribinos a franco.mica22@gmail.com." }, 500);
  }
});
