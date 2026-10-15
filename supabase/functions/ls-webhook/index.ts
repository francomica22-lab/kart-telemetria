// Avisos de Lemon Squeezy (pagos del exterior en dolares). Firma obligatoria: HMAC-SHA256 del cuerpo con el
// secreto del webhook (header X-Signature). El user_id viaja en meta.custom_data desde el checkout.
import { createClient } from "jsr:@supabase/supabase-js@2";

const GRACIA_DIAS = 3;

async function firmaValida(raw: string, sig: string): Promise<boolean> {
  const secret = Deno.env.get("LS_WEBHOOK_SECRET");
  if (!secret || !sig) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
  const hex = [...mac].map(b => b.toString(16).padStart(2, "0")).join("");
  return hex === sig;
}

Deno.serve(async (req) => {
  if (req.method != "POST") return new Response("ok");
  const raw = await req.text();
  if (!(await firmaValida(raw, req.headers.get("x-signature") || ""))) return new Response("firma inválida", { status: 401 });
  const ev = JSON.parse(raw);
  const name: string = ev?.meta?.event_name || "";
  const custom = ev?.meta?.custom_data || {};
  const a = ev?.data?.attributes || {};
  const uid = custom.user_id, plan = custom.plan, periodo = custom.periodo;
  if (!name.startsWith("subscription_") || !uid || !["simple", "pro"].includes(plan)) return new Response("ignorado");
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const subId = String(ev.data.id), ahora = new Date();
  const fin = a.renews_at || a.ends_at;
  const vence = fin ? new Date(new Date(fin).getTime() + GRACIA_DIAS * 864e5) : new Date(ahora.getTime() + 31 * 864e5);
  const fila: Record<string, unknown> = { user_id: uid, plan, periodo: periodo == "anual" ? "anual" : "mensual", proveedor: "lemonsqueezy", proveedor_ref: subId,
    portal_url: a.urls?.customer_portal || null, actualizado: ahora.toISOString() };
  if (["active", "on_trial", "past_due"].includes(a.status)) Object.assign(fila, { estado: "activa", vence: vence.toISOString() });
  else if (a.status == "cancelled") Object.assign(fila, { estado: "cancelada", vence: (a.ends_at ? new Date(a.ends_at) : vence).toISOString() });
  else if (["expired", "unpaid"].includes(a.status)) Object.assign(fila, { estado: "vencida", vence: ahora.toISOString() });
  else return new Response("sin cambios");
  const { error } = await db.from("suscripciones").upsert(fila);
  if (error) { console.error(error); return new Response("error", { status: 500 }); }
  return new Response("ok");
});
