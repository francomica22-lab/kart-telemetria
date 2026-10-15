// Avisos de Mercado Pago (suscripciones). No se le cree al aviso: con el id se consulta el estado real en la API
// de Mercado Pago y con eso se actualiza la suscripcion. La firma (x-signature) se verifica si esta el secreto.
import { createClient } from "jsr:@supabase/supabase-js@2";

const MP = "https://api.mercadopago.com";
const GRACIA_DIAS = 3;   // margen despues de la fecha de cobro por si el pago se demora
const ok = (t = "ok") => new Response(t, { status: 200 });

function igual(a: string, b: string) {   // comparacion en tiempo constante
  if (a.length != b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function firmaValida(req: Request, dataId: string): Promise<boolean> {
  const secret = Deno.env.get("MP_WEBHOOK_SECRET");
  if (!secret) return true;   // sin secreto igual es seguro: el estado se lee de la API
  const sig = req.headers.get("x-signature") || "", rid = req.headers.get("x-request-id") || "";
  const parts = Object.fromEntries(sig.split(",").map(p => p.trim().split("=", 2) as [string, string]));
  if (!parts.ts || !parts.v1) return false;
  const manifest = `id:${dataId.toLowerCase()};request-id:${rid};ts:${parts.ts};`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest)));
  return igual([...mac].map(b => b.toString(16).padStart(2, "0")).join(""), parts.v1);
}

async function mp(path: string, init: RequestInit = {}) {
  const r = await fetch(MP + path, { ...init, headers: { Authorization: `Bearer ${Deno.env.get("MP_ACCESS_TOKEN")}`, "Content-Type": "application/json", ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`MP ${path}: ${r.status}`);
  return r.json();
}
const cancelarMP = (id: string) => mp(`/preapproval/${id}`, { method: "PUT", body: JSON.stringify({ status: "cancelled" }) });

async function aplicar(preId: string) {
  const p = await mp(`/preapproval/${preId}`);
  const [uid, plan, periodo] = String(p.external_reference || "").split("|");
  if (!uid || !["simple", "pro"].includes(plan) || !["mensual", "anual"].includes(periodo)) return;
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: actual } = await db.from("suscripciones").select("*").eq("user_id", uid).maybeSingle();
  const ahora = new Date();
  const anotar = (motivo: string) => db.from("pedidos_baja").insert({ user_id: uid, email: p.payer_email || "sin-mail@mercadopago", tipo: "baja", estado: "pendiente", motivo });
  if (p.status == "authorized") {
    // cambio de plan dentro de Mercado Pago: queda la mas nueva y se cancela la otra
    if (actual?.proveedor == "mercadopago" && actual.proveedor_ref && actual.proveedor_ref != preId && actual.estado == "activa") {
      let vieja: { status?: string; date_created?: string } | null = null;
      try { vieja = await mp(`/preapproval/${actual.proveedor_ref}`); } catch { /* no existe */ }
      if (vieja?.status == "authorized" && vieja.date_created && p.date_created && new Date(vieja.date_created) > new Date(p.date_created)) {
        // el aviso es de la suscripcion mas vieja: se cancela esa y queda la vigente
        try { await cancelarMP(preId); } catch (e) { await anotar(`Cancelar a mano la suscripción vieja de Mercado Pago ${preId} (${e})`); }
        return;
      }
      if (vieja?.status == "authorized") {
        try { await cancelarMP(actual.proveedor_ref); } catch (e) { await anotar(`Cancelar a mano la suscripción anterior de Mercado Pago ${actual.proveedor_ref} (${e})`); }
      }
    }
    // pasaba de Lemon Squeezy a Mercado Pago: se cancela la de dolares
    if (actual?.proveedor == "lemonsqueezy" && actual.proveedor_ref && actual.estado == "activa" && new Date(actual.vence) > ahora) {
      const r = await fetch(`https://api.lemonsqueezy.com/v1/subscriptions/${actual.proveedor_ref}`, { method: "DELETE",
        headers: { Authorization: `Bearer ${Deno.env.get("LS_API_KEY")}`, Accept: "application/vnd.api+json" } }).catch(() => null);
      if (!r || !r.ok) await anotar(`CAMBIO A MERCADO PAGO: cancelar a mano la suscripción de Lemon Squeezy ${actual.proveedor_ref}`);
    }
    const prox = p.next_payment_date ? new Date(p.next_payment_date) : new Date(ahora.getTime() + (periodo == "anual" ? 365 : 31) * 864e5);
    const vence = new Date(prox.getTime() + GRACIA_DIAS * 864e5);
    const misma = actual?.proveedor == "mercadopago" && actual.proveedor_ref == preId;
    const { error } = await db.from("suscripciones").upsert({ user_id: uid, plan, periodo, estado: "activa", vence: vence.toISOString(), proveedor: "mercadopago",
      proveedor_ref: preId, portal_url: null, inicio_pago: misma && actual.inicio_pago ? actual.inicio_pago : ahora.toISOString(), actualizado: ahora.toISOString() });
    if (error) throw new Error("db " + error.message);
  } else if (["cancelled", "paused"].includes(p.status)) {
    // solo si es la suscripcion vigente; sigue valiendo hasta que vence lo pagado (o ya se corto por arrepentimiento)
    if (actual?.proveedor == "mercadopago" && actual.proveedor_ref == preId && actual.estado != "cancelada") {
      const { error } = await db.from("suscripciones").update({ estado: "cancelada", actualizado: ahora.toISOString() }).eq("user_id", uid);
      if (error) throw new Error("db " + error.message);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method != "POST") return ok();
  const url = new URL(req.url);
  let body: { type?: string; topic?: string; data?: { id?: string } } = {};
  try { body = await req.json(); } catch { /* vacio */ }
  const type = body.type || body.topic || url.searchParams.get("type") || url.searchParams.get("topic") || "";
  const id = String(url.searchParams.get("data.id") || body.data?.id || url.searchParams.get("id") || "");
  if (!id) return ok("sin id");
  if (!Deno.env.get("MP_ACCESS_TOKEN")) return ok("sin configurar");
  if (!(await firmaValida(req, id))) return new Response("firma inválida", { status: 401 });
  try {
    if (type == "subscription_preapproval") await aplicar(id);
    else if (type == "subscription_authorized_payment") {
      const pago = await mp(`/authorized_payments/${id}`);
      if (pago.preapproval_id) await aplicar(pago.preapproval_id);
    }
  } catch (e) {
    console.error(e);
    if (/: 40[04]$/.test(String((e as Error).message))) return ok("no existe");   // id falso o de otra cuenta: no reintentar
    return new Response("error", { status: 500 });   // falla temporal (o token vencido): Mercado Pago reintenta
  }
  return ok();
});
