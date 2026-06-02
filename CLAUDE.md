# Qué es esto?

UI operacional para gestionar el pipeline de beneficios de patoapp. Permite
publicar beneficios, disparar scrapers, clasificar raws, editar merchants y
actualizar ubicaciones. Solo accesible para emails de desarrolladores.

## Stack

- React 19 + TypeScript 5.7 + Vite 6 + Tailwind CSS 3.
- React Hook Form + Zod para formularios con validación.
- Leaflet + react-leaflet para el editor de ubicaciones de merchants.
- Supabase JS client directo (sin capa API ni server actions).

## Comandos y deploy

```bash
npm run dev      # dev server en http://localhost:5173/patoapp-backoffice/
npm run build    # tsc + vite build → dist/
```

Variables requeridas en `.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
`VITE_DEV_PASSWORD`. Ver `.env.example`.

**Deploy:** push a `main` dispara `.github/workflows/deploy.yml` → build → GitHub Pages automáticamente.
Las variables de producción van como GitHub Secrets (no en `.env`). Agregar una variable nueva requiere añadirla también como Secret en el repo.

## Estructura

```
src/
  components/   Layout.tsx, ProtectedRoute.tsx
  lib/          supabase.ts, useIssuers.ts, styles.ts (clases Tailwind compartidas)
  pages/        BenefitsList, BenefitEdit, Merchants, Clasificacion, Scrapers, Pipeline
```

## Patrones clave

- **Datos:** `supabase.from(tabla).select/insert/update/delete()` directamente en cada página.
- **Edge Functions:** `supabase.functions.invoke(nombre, { body, headers: { Authorization: \`Bearer ${token}\` } })`. El token viene de `supabase.auth.getSession()`.
- **Formularios:** Zod schema → `zodResolver` → `useForm`. Sin submit nativo.
- **Estilos:** inputs y selects usan `inputCls`/`selectCls` de `src/lib/styles.ts`.

## Relación con patoapp-scrapers

Las Edge Functions que invoca este backoffice viven en `patoapp-scrapers/supabase/functions/`:
`run-reprocess`, `trigger-scraper`, `run-refresh-ai-descriptions`, `manage-benefit`,
`refresh-merchant-locations`.

Antes de cambiar parámetros de esas funciones, revisar `docs/operations.md` en patoapp-scrapers.

## Supabase — límites de este repo

Este repo **no tiene Edge Functions propias ni migraciones de Supabase**. No crear `supabase/functions/` ni `supabase/migrations/` aquí.

- Las Edge Functions las administran `patoapp-scrapers` (pipeline) y `patoapp` (app).
- Las migraciones de schema viven en `patoapp-scrapers/supabase/migrations/`.
- Si una tarea requiere una nueva Edge Function o cambio de schema, el cambio va en el repo correspondiente, no acá.

## Reglas base

- Todo el texto de la UI va en español (locale es-CL).
- No agregar librerías de UI (shadcn, MUI, etc.); los componentes son Tailwind puro.
- No hay tests; validar cambios de UI corriendo `npm run dev`.
- El `base` en `vite.config.ts` y el `basename` en `BrowserRouter` deben mantenerse sincronizados (`/patoapp-backoffice/`).
- No hay tipos Supabase generados; al cambiar schema, actualizar los tipos locales manualmente.
- El acceso al backoffice se controla por rol: `app_metadata.role = 'admin'` en Supabase Auth. El login (`signInWithPassword`) y `ProtectedRoute` validan ese rol; RLS (`is_developer_email()`) y las Edge Functions (`assertBackofficeDeveloper`) también. Dar de alta/baja a un admin se hace seteando/quitando el rol en Supabase (Authentication → Users → edit `app_metadata`), sin tocar código.
