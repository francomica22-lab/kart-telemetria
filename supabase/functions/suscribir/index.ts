// Crea el checkout de una suscripcion y devuelve la URL de pago.
//   Argentina: Mercado Pago (suscripcion sin plan, pago pendiente -> init_point), en pesos.
//   Exterior:  Lemon Squeezy (checkout con el user_id en custom data), en dolares.
// Los precios viven aca (o en el secreto PRECIOS_JSON), nunca en la app.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const PRECIOS_DEF = {
  ARS: { simple: { mensual: 9900, anual: 99000 }, pro: { mensual: 19900, anual: 199000 } },
  USD: { simple: { mensual: 9, anual: 90 }, pro: { mensual: 19, anual: 190 } },
};
const precios = () => { try { return JSON.parse(Deno.env.get("PRECIOS_JSON") || "") } catch { return PRECIOS_DEF; } };
const VOLVER = Deno.env.get("URL_VOLVER") || "https://francomica22-lab.github.io/kart-telemetria/cuenta.html?pago=ok";

Deno.serve(async (req) => {
  if (req.method == "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method != "POST") return json({ error: "método no permitido" }, 405);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return json({ error: "Ingresá a tu cuenta." }, 401);
  let body: { plan?: string; periodo?: string; proveedor?: string } = {};
  try { body = await req.json(); } catch { /* vacio */ }
  const plan = body.plan == "simple" ? "simple" : body.plan == "pro" ? "pro" : null;
  const periodo = body.periodo == "anual" ? "anual" : body.periodo == "mensual" ? "mensual" : null;
  if (!plan || !periodo) return json({ error: "Plan o período inválido." }, 400);
  const P = precios();

  if (body.proveedor == "mp") {
    const token = Deno.env.get("MP_ACCESS_TOKEN");
    if (!token) return json({ error: "El pago con Mercado Pago todavía no está habilitado." }, 503);
    const r = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: `Análisis Karting ${plan == "pro" ? "Pro" : "Simple"} (${periodo})`,
        external_reference: `${user.id}|${plan}|${periodo}`,
        payer_email: user.email,
        auto_recurring: { frequency: periodo == "anual" ? 12 : 1, frequency_type: "months", transaction_amount: P.ARS[plan][periodo], currency_id: "ARS" },
        back_url: VOLVER,
        status: "pending",
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !(j.init_point || j.sandbox_init_point)) return json({ error: "Mercado Pago no respondió bien: " + (j.message || r.status) }, 502);
    return json({ url: j.init_point || j.sandbox_init_point });
  }

  if (body.proveedor == "ls") {
    const key = Deno.env.get("LS_API_KEY"), store = Deno.env.get("LS_STORE_ID");
    let variantes: Record<string, string> = {};
    try { variantes = JSON.parse(Deno.env.get("LS_VARIANTS") || "{}"); } catch { /* vacio */ }
    const variant = variantes[`${plan}_${periodo}`];
    if (!key || !store || !variant) return json({ error: "El pago internacional todavía no está habilitado." }, 503);
    const r = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, Accept: "application/vnd.api+json", "Content-Type": "application/vnd.api+json" },
      body: JSON.stringify({ data: { type: "checkouts",
        attributes: { checkout_data: { email: user.email, custom: { user_id: user.id, plan, periodo } }, product_options: { redirect_url: VOLVER } },
        relationships: { store: { data: { type: "stores", id: String(store) } }, variant: { data: { type: "variants", id: String(variant) } } } } }),
    });
    const j = await r.json().catch(() => ({}));
    const url = j?.data?.attributes?.url;
    if (!r.ok || !url) return json({ error: "No se pudo abrir el pago internacional (" + r.status + ")." }, 502);
    return json({ url });
  }
  return json({ error: "Medio de pago inválido." }, 400);
});
