// Boton de baja y boton de arrepentimiento (Ley 24.240 y Res. 424/2020).
//   baja:           cancela la renovacion; lo pagado sigue valiendo hasta que vence.
//   arrepentimiento: dentro de los 10 dias del primer pago; cancela ya y deja registrado el pedido de devolucion.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method == "OPTIONS") return new Response("ok", { headers: CORS });
  const sbUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
  const { data: { user } } = await sbUser.auth.getUser();
  if (!user) return json({ error: "Ingresá a tu cuenta." }, 401);
  let body: { tipo?: string; motivo?: string } = {};
  try { body = await req.json(); } catch { /* vacio */ }
  const tipo = body.tipo == "arrepentimiento" ? "arrepentimiento" : "baja";
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: s } = await db.from("suscripciones").select("*").eq("user_id", user.id).maybeSingle();
  if (!s || !s.proveedor || s.estado == "prueba") {
    await db.from("pedidos_baja").insert({ user_id: user.id, email: user.email, tipo, motivo: (body.motivo || "").slice(0, 500), estado: "resuelto" });
    return json({ ok: true, msg: "No tenés una suscripción paga activa: no se te va a cobrar nada." });
  }
  try {
    if (s.proveedor == "mercadopago" && s.proveedor_ref) {
      const r = await fetch(`https://api.mercadopago.com/preapproval/${s.proveedor_ref}`, { method: "PUT",
        headers: { Authorization: `Bearer ${Deno.env.get("MP_ACCESS_TOKEN")}`, "Content-Type": "application/json" }, body: JSON.stringify({ status: "cancelled" }) });
      if (!r.ok) throw new Error("Mercado Pago " + r.status);
    } else if (s.proveedor == "lemonsqueezy" && s.proveedor_ref) {
      const r = await fetch(`https://api.lemonsqueezy.com/v1/subscriptions/${s.proveedor_ref}`, { method: "DELETE",
        headers: { Authorization: `Bearer ${Deno.env.get("LS_API_KEY")}`, Accept: "application/vnd.api+json" } });
      if (!r.ok) throw new Error("Lemon Squeezy " + r.status);
    }
  } catch (e) {
    await db.from("pedidos_baja").insert({ user_id: user.id, email: user.email, tipo, motivo: `ERROR AL CANCELAR: ${e}. ${(body.motivo || "").slice(0, 400)}`, estado: "pendiente" });
    return json({ ok: false, msg: "Registramos tu pedido de baja y lo procesamos a mano en menos de 48 h. No se te va a volver a cobrar." });
  }
  const ahora = new Date().toISOString();
  const upd: Record<string, unknown> = { estado: "cancelada", actualizado: ahora };
  if (tipo == "arrepentimiento") upd.vence = ahora;   // se corta ya: se devuelve lo cobrado
  await db.from("suscripciones").update(upd).eq("user_id", user.id);
  await db.from("pedidos_baja").insert({ user_id: user.id, email: user.email, tipo, motivo: (body.motivo || "").slice(0, 500),
    estado: tipo == "arrepentimiento" ? "pendiente" : "resuelto", proveedor: s.proveedor, proveedor_ref: s.proveedor_ref });
  return json({ ok: true, msg: tipo == "arrepentimiento"
    ? "Listo: cancelamos la suscripción y pedimos la devolución de lo cobrado. Te escribimos por mail cuando esté hecha (hasta 10 días hábiles)."
    : `Listo: cancelamos la renovación. Seguís con tu plan hasta el ${new Date(s.vence).toLocaleDateString("es-AR")}.` });
});
