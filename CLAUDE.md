# Qué es esto?

UI operacional para gestionar el pipeline de beneficios de patoapp. Permite
publicar beneficios, disparar scrapers, clasificar raws, editar merchants y
actualizar ubicaciones. Solo accesible para emails de desarrolladores.

## Stack

- React 19 + TypeScript 5.7 + Vite 6 + Tailwind CSS 3.
- React Hook Form + Zod para formularios con validación.
- Leaflet + react-leaflet para el editor de ubicaciones de merchants.
- Supabase JS client directo (sin capa API ni server actions).

## Comandos

```bash
npm run dev      # dev server en http://localhost:5173/patoapp-backoffice/
npm run build    # tsc + vite build → dist/
```

Variables requeridas en `.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
`VITE_DEV_PASSWORD`. Ver `.env.example`.

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

## Reglas base

- Todo el texto de la UI va en español (locale es-CL).
- No agregar librerías de UI (shadcn, MUI, etc.); los componentes son Tailwind puro.
- No hay tests; validar cambios de UI corriendo `npm run dev`.
- El `base` en `vite.config.ts` y el `basename` en `BrowserRouter` deben mantenerse sincronizados (`/patoapp-backoffice/`).
- No hay tipos Supabase generados; al cambiar schema, actualizar los tipos locales manualmente.
- Agregar un email de dev requiere editar `DEV_EMAILS` en `Login.tsx` Y la función `is_developer_email()` en Supabase (migración en patoapp-scrapers).
