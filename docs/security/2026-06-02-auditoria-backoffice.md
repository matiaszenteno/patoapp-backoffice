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
- **Confirmado (2026-06-02):** de las 4 cuentas dev, solo `c.mansillabrito@gmail.com`
  tiene provider `email`; un intento de login con `p4t0appdevs!` devolvió **HTTP 200**,
  o sea la contraseña filtrada **sigue activa y funcional** en esa cuenta. Las otras 3
  (`matiaszentenoco`, `nicolas.canalespm`, `cristobal.a.garridov`) son solo Google → no
  afectadas.
- **Fix:**
  1. ✅ Quitar `VITE_DEV_PASSWORD` de `.env.example` y de `.github/workflows/deploy.yml`.
  2. ✅ Eliminar el GitHub Secret `VITE_DEV_PASSWORD`.
  3. ⏳ **PENDIENTE (acción manual del owner):** rotar/eliminar la contraseña de
     `c.mansillabrito@gmail.com`. Decisión 2026-06-02: no tocar la cuenta automáticamente
     para no afectar a la persona; coordinar el cambio con Cristóbal. Hasta entonces esa
     cuenta es comprometible por cualquiera que haya leído el bundle de producción.
  4. Considerar el valor `p4t0appdevs!` como comprometido para siempre.

### H2 — ALTA · ✅ RESUELTO · Autorización inconsistente: las Edge Functions NO reconocen el rol `admin`

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
- **Fix aplicado (branch `security/role-based-authz` en patoapp-scrapers):**
  `assertBackofficeDeveloper()` ahora valida `user.app_metadata?.role === 'admin'` en vez
  de `DEV_EMAILS`. Las 5 Edge Functions afectadas fueron redeployadas. Verificado:
  `admin_backoffice` pasa la autorización (400 por body, no 403) y un token sin rol → 403.

### H3 — MEDIA · ✅ RESUELTO · Emails de admin hardcodeados en dos lugares

- Los mismos 4 emails están duplicados en:
  - `is_developer_email()` (SQL, en `patoapp-scrapers`).
  - `DEV_EMAILS` en `backoffice-auth.ts` (Edge Functions).
- (Antes también en `Login.tsx`, ya eliminado en este trabajo.)
- Mantenerlos sincronizados es frágil y propenso a olvidos al dar de alta/baja personas.
- **Fix aplicado:** se asignó `role = 'admin'` en `app_metadata` a las 4 cuentas dev y se
  eliminaron las listas de emails de ambos lugares (`is_developer_email()` vía migración
  `20260602000002`, y `DEV_EMAILS` en `backoffice-auth.ts`). Ahora la autorización tiene
  un solo criterio (`role = 'admin'`) gestionado desde Supabase, sin tocar código para
  alta/baja. (Recordar actualizar la nota de `CLAUDE.md` que aún menciona editar
  `DEV_EMAILS` / `is_developer_email()` al agregar un dev.)

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

1. ✅ **H1** — `VITE_DEV_PASSWORD` quitada de `.env.example`, workflow y Secrets.
   ⏳ Pendiente manual: rotar la contraseña de `c.mansillabrito@gmail.com`.
2. ✅ **H2** — `assertBackofficeDeveloper()` valida `role = 'admin'`; Edge Functions redeployadas.
3. ✅ **H4** — `.env` local del backoffice limpio; secretos movidos a `patoapp-scrapers/.env.local`.
4. ✅ **H3** — Listas de emails eliminadas; autorización 100% por rol.
