// Avisos de Lemon Squeezy (pagos del exterior en dolares). Firma obligatoria: HMAC-SHA256 del cuerpo con el
// secreto del webhook (header X-Signature). El plan y el periodo salen de la VARIANTE pagada (no de los datos del
// checkout, que el comprador puede tocar); el user_id viaja en meta.custom_data.
import { createClient } from "jsr:@supabase/supabase-js@2";

const GRACIA_DIAS = 3;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const txt = (t: string, s = 200) => new Response(t, { status: s });

function igual(a: string, b: string) {   // comparacion en tiempo constante
  if (a.length != b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function hmacHex(secret: string, msg: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg)));
  return [...mac].map(b => b.toString(16).padStart(2, "0")).join("");
}

// si la persona tenia una suscripcion activa en Mercado Pago y ahora paga aca, se cancela la otra (no cobrar dos veces)
async function cancelarMP(ref: string) {
  const r = await fetch(`https://api.mercadopago.com/preapproval/${ref}`, { method: "PUT",
    headers: { Authorization: `Bearer ${Deno.env.get("MP_ACCESS_TOKEN")}`, "Content-Type": "application/json" }, body: JSON.stringify({ status: "cancelled" }) });
  if (!r.ok) throw new Error("Mercado Pago " + r.status);
}

Deno.serve(async (req) => {
  if (req.method != "POST") return txt("ok");
  const secret = Deno.env.get("LS_WEBHOOK_SECRET");
  const raw = await req.text();
  if (!secret || !igual(await hmacHex(secret, raw), req.headers.get("x-signature") || "")) return txt("firma inválida", 401);
  const ev = JSON.parse(raw);
  const name: string = ev?.meta?.event_name || "";
  const a = ev?.data?.attributes || {};
  if (!name.startsWith("subscription_") || ev?.data?.type != "subscriptions") return txt("ignorado");
  if (ev?.meta?.test_mode && !Deno.env.get("LS_ALLOW_TEST")) return txt("modo test ignorado");
  if (String(a.store_id) != String(Deno.env.get("LS_STORE_ID"))) return txt("otra tienda");
  let variantes: Record<string, string> = {};
  try { variantes = JSON.parse(Deno.env.get("LS_VARIANTS") || "{}"); } catch { /* vacio */ }
  const clave = Object.keys(variantes).find(k => String(variantes[k]) == String(a.variant_id));
  if (!clave) return txt("variante desconocida");
  const [plan, periodo] = clave.split("_");
  const uid = String(ev?.meta?.custom_data?.user_id || "");
  if (!UUID.test(uid) || !["simple", "pro"].includes(plan)) return txt("sin usuario");

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: u } = await db.auth.admin.getUserById(uid);
  if (!u?.user) return txt("usuario inexistente");
  const { data: act } = await db.from("suscripciones").select("*").eq("user_id", uid).maybeSingle();
  const subId = String(ev.data.id), ahora = new Date();
  const fin = a.renews_at || a.ends_at;
  const vence = fin ? new Date(new Date(fin).getTime() + GRACIA_DIAS * 864e5) : new Date(ahora.getTime() + 31 * 864e5);
  const esVigente = act?.proveedor == "lemonsqueezy" && act?.proveedor_ref == subId;

  if (["active", "on_trial", "past_due"].includes(a.status)) {
    if (act?.proveedor == "mercadopago" && act.proveedor_ref && act.estado == "activa" && new Date(act.vence) > ahora) {
      try { await cancelarMP(act.proveedor_ref); }
      catch (e) { await db.from("pedidos_baja").insert({ user_id: uid, email: u.user.email, tipo: "baja", estado: "pendiente", motivo: `CAMBIO A LEMON SQUEEZY: cancelar a mano la suscripción de Mercado Pago ${act.proveedor_ref} (${e})` }); }
    }
    const { error } = await db.from("suscripciones").upsert({ user_id: uid, plan, periodo, estado: "activa", vence: vence.toISOString(), proveedor: "lemonsqueezy",
      proveedor_ref: subId, portal_url: a.urls?.customer_portal || null, inicio_pago: esVigente && act.inicio_pago ? act.inicio_pago : ahora.toISOString(), actualizado: ahora.toISOString() });
    if (error) { console.error(error); return txt("error", 500); }
    return txt("ok");
  }
  // cancelaciones y vencimientos: solo si es la suscripcion vigente (un aviso viejo no pisa una nueva)
  if (!esVigente) return txt("no es la vigente");
  let upd: Record<string, unknown> | null = null;
  if (a.status == "cancelled") {
    // si ya se corto por arrepentimiento (vence en el pasado), no se vuelve a extender
    const cortada = act.estado == "cancelada" && new Date(act.vence) <= ahora;
    upd = { estado: "cancelada", vence: cortada ? act.vence : (a.ends_at ? new Date(a.ends_at) : vence).toISOString() };
  } else if (["expired", "unpaid"].includes(a.status)) upd = { estado: "vencida", vence: ahora.toISOString() };
  if (!upd) return txt("sin cambios");
  const { error } = await db.from("suscripciones").update({ ...upd, actualizado: ahora.toISOString() }).eq("user_id", uid);
  if (error) { console.error(error); return txt("error", 500); }
  return txt("ok");
});
