# Auditoría de seguridad — patoapp-backoffice

Fecha: 2026-06-02
Branch: `security/backoffice-audit`
Alcance: postura de seguridad del backoffice al nivel actual (SPA en GitHub Pages
+ Supabase como único backend), tras migrar el login a usuario/contraseña con rol `admin`.

## Modelo de amenazas (resumen)

- El backoffice es una **SPA estática pública** servida desde GitHub Pages. Todo el
  JS y cualquier variable `VITE_*` queda embebida en el bundle y es **descargable por
  cualquiera**. El código cliente no es un límite de seguridad.
- El **único límite real** es Supabase: políticas RLS sobre las tablas y la función
  `assertBackofficeDeveloper()` en las Edge Functions. Las verificaciones en
  `Login.tsx` y `ProtectedRoute.tsx` son solo UX.
- La `anon key` es pública por diseño — no es un hallazgo.

## Hallazgos

### H1 — ALTA · Contraseña compartida `VITE_DEV_PASSWORD` filtrada en repo y en bundle público

- `\.env.example` commitea `VITE_DEV_PASSWORD=p4t0appdevs!` en texto plano.
- Toda var `VITE_*` se inyecta en el bundle en build (`vite build`), y el sitio se
  publica en GitHub Pages **público** → la contraseña era extraíble del JS de producción.
- El login anterior usaba esa contraseña compartida para las 4 cuentas dev
  (`signInWithPassword` con `DEV_EMAILS`). Cualquiera que leyera el bundle podía
  iniciar sesión como dev.
- **Estado:** el nuevo login ya no usa esta variable, pero:
  - La contraseña sigue commiteada en `.env.example` y configurada como GitHub Secret.
  - Las cuentas dev en Supabase que tengan esa password siguen activas con ella.
- **Fix:**
  1. Quitar `VITE_DEV_PASSWORD` de `.env.example`, de `.github/workflows/deploy.yml`
     y de los GitHub Secrets.
  2. Rotar/eliminar la contraseña de las cuentas dev en Supabase que la usaban.
  3. Considerar el valor `p4t0appdevs!` como comprometido para siempre.

### H2 — ALTA · Autorización inconsistente: las Edge Functions NO reconocen el rol `admin`

- RLS ya acepta `app_metadata.role = 'admin'` (migración `20260602000001`), pero las
  Edge Functions (`manage-benefit`, `trigger-scraper`, `run-reprocess`,
  `run-refresh-ai-descriptions`, `refresh-merchant-locations`) autorizan vía
  `assertBackofficeDeveloper()` en
  `patoapp-scrapers/supabase/functions/_shared/backoffice-auth.ts`, que **solo** chequea
  la lista hardcodeada `DEV_EMAILS`.
- Consecuencia: el usuario `admin_backoffice@patoapp.cl` puede **leer y editar tablas**
  (RLS) pero recibe **403** al publicar beneficios, disparar scrapers, reprocesar, etc.
- Es además una mala práctica tener **dos fuentes de verdad** distintas para "quién es
  admin" (RLS por rol vs Edge Functions por email).
- **Fix:** actualizar `assertBackofficeDeveloper()` para aceptar también
  `user.app_metadata?.role === 'admin'`, unificando el criterio con `is_developer_email()`.

### H3 — MEDIA · Emails de admin hardcodeados en dos lugares

- Los mismos 4 emails están duplicados en:
  - `is_developer_email()` (SQL, en `patoapp-scrapers`).
  - `DEV_EMAILS` en `backoffice-auth.ts` (Edge Functions).
- (Antes también en `Login.tsx`, ya eliminado en este trabajo.)
- Mantenerlos sincronizados es frágil y propenso a olvidos al dar de alta/baja personas.
- **Recomendación:** una vez que H2 esté resuelto y todos los devs tengan cuentas con
  `role = 'admin'` en `app_metadata`, **eliminar las listas de emails** y basar TODA la
  autorización en el rol. Esto deja un solo criterio (`role = 'admin'`) gestionado desde
  Supabase, sin tocar código para alta/baja. Responde directamente a la pregunta del
  usuario: sí, conviene dejar de hardcodearlos.

### H4 — MEDIA · `SUPABASE_SECRET_KEY` y otros secretos sensibles en `.env` local

- El `.env` local contiene `SUPABASE_SECRET_KEY` (equivalente service_role, bypassa RLS),
  `OPENAI_API_KEY`, `GEOAPIFY_API_KEY`, `LOCATION_PIPELINE_SECRET`.
- `.env` está correctamente en `.gitignore` y **nunca fue commiteado** (verificado).
- Riesgo real: ese secreto **no pertenece a este repo** (el backoffice solo necesita la
  anon key). Tenerlo acá aumenta la superficie de exposición accidental (ej. pegar el
  archivo, un futuro `VITE_` por error que lo embeba en el bundle).
- **Fix:** mantener en `.env` de este repo **solo** `VITE_SUPABASE_URL` y
  `VITE_SUPABASE_ANON_KEY`. El `SUPABASE_SECRET_KEY` y demás secretos del pipeline viven
  en `patoapp-scrapers`, no acá. **Nunca** prefijar un secreto con `VITE_`.

## Cosas que están bien

- `.env` ignorado y nunca commiteado.
- Uso de la `anon key` (no service_role) en el cliente.
- RLS activa sobre las tablas que el cliente consulta; la app no puede saltarse permisos
  desde el navegador.
- Edge Functions validan el JWT server-side (`getUser`) antes de operar.
- El nuevo login valida `role === 'admin'` y hace `signOut()` si no corresponde.

## Plan de acción priorizado

1. **H1** — Rotar `p4t0appdevs!`, quitarla de `.env.example`, workflow y Secrets.
2. **H2** — Hacer que `assertBackofficeDeveloper()` acepte `role = 'admin'`
   (cambio en `patoapp-scrapers`).
3. **H4** — Limpiar `.env` local dejando solo las 2 vars públicas.
4. **H3** — Tras 1-3 y migrar a todos los devs a cuentas con `role = 'admin'`,
   eliminar las listas de emails hardcodeadas y dejar el rol como criterio único.
