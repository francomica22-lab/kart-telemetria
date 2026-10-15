# Lanzamiento de la versión paga · lo que tenés que hacer vos

Todo el código ya está hecho y probado en la rama `suscripciones`. Lo que sigue son pasos que **solo vos podés hacer** (cuentas a tu nombre, claves secretas, compras). Están en orden. Cuando termines cada bloque, avisame y sigo yo con lo que dependa de eso.

Tiempo total estimado: **1 a 2 horas** (sin contar la aprobación de Lemon Squeezy, que puede tardar unos días).

---

## 1. Supabase (10 minutos) — obligatorio

Entrá a <https://supabase.com/dashboard> → proyecto **kart-telemetria** (¡no MICA ERP!).

1. **Authentication → URL Configuration**
   - *Site URL*: `https://francomica22-lab.github.io/kart-telemetria/cuenta.html`
   - *Redirect URLs* → *Add URL*: la misma dirección.
   - Si comprás un dominio propio (paso 5), después cambiamos estas dos por el dominio nuevo.
2. **Authentication → Sign In / Providers → Email**: que estén activados **Enable Email provider** y **Confirm email**.
   ⚠️ *Confirm email* tiene que quedar activado: es lo que impide que otra persona cree una cuenta con tu mail y entre al panel de administración.
3. **Authentication → Emails → Templates** (opcional, recomendado): pegá los textos en castellano del final de este documento.
4. **Plan**: *Organization → Billing* → pasar a **Pro** (USD 25 por mes). El plan gratis pausa el proyecto si pasa una semana sin uso (ya pasó una vez y se cortaron los links compartidos). Para un producto pago no puede pasar.
5. **Mails propios (antes de anunciar)**: el servidor de mails de Supabase manda muy pocos por hora y puede ir a spam.
   - Creá una cuenta gratis en <https://resend.com>, verificá tu dominio (paso 5) y copiá las credenciales SMTP.
   - Supabase → **Authentication → Emails → SMTP Settings** → activá *Custom SMTP* y pegalas. Remitente: `no-responder@tudominio`.

## 2. Tu cuenta de administrador (2 minutos)

1. Abrí el programa (o la web) → arriba a la izquierda **Ingresar → Crear cuenta** con **franco.mica22@gmail.com**.
2. Confirmá el mail tocando el link.
3. Entrá a `…/kart-telemetria/admin.html` con esa cuenta: tenés que ver el panel.
4. Avisame y fijo el administrador a tu cuenta (por número de usuario, no solo por mail).

## 3. Mercado Pago (30 minutos) — cobro en Argentina

1. Si no tenés, creá una cuenta de **vendedor** en Mercado Pago (puede ser la personal).
2. Entrá a <https://www.mercadopago.com.ar/developers/panel/app> → **Crear aplicación**.
   - Nombre: el de la app. Tipo de solución: **Pagos online**. Producto: **Suscripciones**.
3. **Credenciales de prueba** primero: copiá el *Access Token* de prueba (empieza con `TEST-`).
4. **Webhooks** (en la aplicación → *Webhooks* → *Configurar notificaciones*):
   - URL: `https://zbesblxiezcfurswanev.supabase.co/functions/v1/mp-webhook`
   - Eventos: **Planes y suscripciones** (`subscription_preapproval` y `subscription_authorized_payment`).
   - Guardá y copiá la **clave secreta** que muestra.
5. Cargá las claves en Supabase (**nunca las pegues en el chat**): proyecto → **Edge Functions → Secrets** → *Add new secret*:
   - `MP_ACCESS_TOKEN` = el Access Token
   - `MP_WEBHOOK_SECRET` = la clave secreta del webhook
6. Avisame: hago una suscripción de prueba con un usuario de prueba de Mercado Pago y verifico que se active sola.
7. Cuando funcione, reemplazás `MP_ACCESS_TOKEN` por el **Access Token de producción** (sin `TEST-`) y repetís el paso 4 en modo producción.

## 4. Lemon Squeezy (20 minutos + aprobación) — cobro en el exterior

1. Creá la cuenta en <https://www.lemonsqueezy.com> y una **Store**. Completá los datos para cobrar (te pagan por banco o PayPal). La aprobación de la tienda puede tardar unos días.
2. **Products → New product**: "Análisis Karting" (o el nombre que elijas) con 4 variantes de **suscripción**:
   - Simple mensual USD 9 · Simple anual USD 90 · Pro mensual USD 19 · Pro anual USD 190.
3. Anotá el **ID de cada variante** (en la URL de la variante o en *Share*).
4. **Settings → API** → crear una API key.
5. **Settings → Webhooks** → *Add endpoint*:
   - URL: `https://zbesblxiezcfurswanev.supabase.co/functions/v1/ls-webhook`
   - *Signing secret*: inventá una clave larga y guardala.
   - Eventos: todos los `subscription_*`.
6. Secrets en Supabase (**Edge Functions → Secrets**):
   - `LS_API_KEY` = la API key
   - `LS_STORE_ID` = el número de la tienda (Settings → Stores)
   - `LS_WEBHOOK_SECRET` = la clave del paso 5
   - `LS_VARIANTS` = `{"simple_mensual":"ID","simple_anual":"ID","pro_mensual":"ID","pro_anual":"ID"}` con los IDs del paso 3.
7. Avisame y lo pruebo en modo test.

## 5. Nombre y dominio (15 minutos)

1. Elegí el nombre (ver `docs/nombres.md`).
2. Comprá el dominio (Cloudflare, Namecheap o Vercel; los precios están en `docs/nombres.md`). Si querés un `.com.ar`, se compra en <https://nic.ar> con clave fiscal.
3. Avisame y:
   - cambio el nombre en la app, la web, los términos y los mails;
   - te paso los registros DNS para que la web quede en el dominio.

## 6. AFIP / ARCA y legales — con tu contador

- Alta en **monotributo** con la actividad de servicios informáticos/software, y **facturación electrónica** de cada cobro. Si cobrás desde el exterior es **exportación de servicios** (factura E).
- Mercado Pago retiene/percibe según tu situación fiscal: que el contador lo revise.
- Revisar con un abogado (opcional) los **Términos** (`terminos.html`). Están escritos para cumplir la Ley 24.240: botón de baja, botón de arrepentimiento visible en la portada, aviso de renovación automática y de cambios de precio.

## 7. Publicar

Cuando estén 1, 2 y 3 (Lemon Squeezy puede venir después: el botón de dólares muestra "todavía no está habilitado"), me decís **"publicá"** y yo:

1. Uno la rama `suscripciones` a la principal y publico la versión **2.0.0** (web + programa).
2. Doy un plan Pro de cortesía a quien me digas (amigos que ya la usan), desde el panel de administración.

---

## Textos de los mails (Supabase → Authentication → Emails → Templates)

**Confirm signup** — Asunto: `Confirmá tu cuenta`
```html
<h2>Confirmá tu cuenta</h2>
<p>Tocá el botón para confirmar tu mail y empezar tus 7 días gratis.</p>
<p><a href="{{ .ConfirmationURL }}">Confirmar mi cuenta</a></p>
<p>Si no creaste una cuenta, ignorá este mail.</p>
```

**Reset password** — Asunto: `Elegí una contraseña nueva`
```html
<h2>Contraseña nueva</h2>
<p>Tocá el botón para elegir una contraseña nueva.</p>
<p><a href="{{ .ConfirmationURL }}">Elegir contraseña</a></p>
<p>Si no lo pediste, ignorá este mail: tu contraseña no cambia.</p>
```

**Change email address** — Asunto: `Confirmá tu mail nuevo`
```html
<h2>Confirmá tu mail nuevo</h2>
<p><a href="{{ .ConfirmationURL }}">Confirmar el cambio</a></p>
```
