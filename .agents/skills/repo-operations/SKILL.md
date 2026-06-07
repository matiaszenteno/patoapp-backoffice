---
name: repo-operations
description: Use when setting up, running, building, or validating this repo's web app, or when you need the operational runbook for patoapp-backoffice (commands, structure, conventions, Edge Function invocation, Tailwind patterns).
---

# Repo Operations — patoapp-backoffice

## What This Repo Is

UI operacional interna (solo devs) en React 19 + Vite + Tailwind. Permite publicar
beneficios, disparar scrapers, clasificar raws, editar merchants y actualizar ubicaciones.
Es **pure consumer** de Supabase: no tiene migraciones ni Edge Functions propias.

## Common Commands

```bash
npm run dev      # dev server → http://localhost:5173/patoapp-backoffice/
npm run build    # tsc + vite build → dist/
npx tsc --noEmit # typecheck sin compilar
```

No hay tests. Validar cambios corriendo `npm run dev` y navegando manualmente.

## Project Structure

```
src/
  components/   Layout.tsx, ProtectedRoute.tsx
  lib/          supabase.ts, useIssuers.ts, styles.ts
  pages/        BenefitsList, BenefitEdit, Merchants, Clasificacion, Scrapers, Pipeline, Operaciones
```

- Estilos compartidos (inputs, selects, botones) → `src/lib/styles.ts` (`inputCls`, `selectCls`, etc.)
- No hay librerías de UI (shadcn, MUI, etc.); componentes son Tailwind puro.
- Todo texto de UI en español (locale es-CL).

## Tailwind Conventions

- Usar clases de `styles.ts` para inputs/selects/botones — no reinventar en cada página.
- Para estados de loading/error/success usar texto explícito, no solo colores.
- Claridad operacional > estética: los estados deben ser inmediatamente legibles.

## Edge Functions — Invocación

Las EFs que invoca este backoffice viven en `patoapp-scrapers/supabase/functions/`:
`run-reprocess`, `trigger-scraper`, `run-refresh-ai-descriptions`, `manage-benefit`,
`refresh-merchant-locations`.

Patrón de invocación:

```ts
const { data: { session } } = await supabase.auth.getSession();
const token = session?.access_token;

const { data, error } = await supabase.functions.invoke('nombre-ef', {
  body: { ...params },
  headers: { Authorization: `Bearer ${token}` },
});
```

- El token viene de `supabase.auth.getSession()`, **no** de variables de entorno.
- Antes de cambiar parámetros de una EF, revisar `docs/operations.md` en `patoapp-scrapers`.
- Para entender qué EFs existen y sus parámetros, leer directamente los archivos en `patoapp-scrapers/supabase/functions/`.

## Routing And Base Path

- `base` en `vite.config.ts` y `basename` en `BrowserRouter` deben mantenerse sincronizados: `/patoapp-backoffice/`.
- Si cambia el base, cambiar ambos. Nunca solo uno.

## Deploy

Push a `main` dispara `.github/workflows/deploy.yml` → build → GitHub Pages automáticamente.
Variables de producción van como GitHub Secrets (no en `.env`). Agregar variable nueva requiere
añadirla también como Secret en el repo.

## Tipos Supabase

No hay tipos generados automáticamente. Al cambiar schema (en `patoapp-scrapers`), actualizar
los tipos locales en las páginas afectadas manualmente.

## Dev Email Gate

Acceso protegido por `DEV_EMAILS` en `Login.tsx` + `is_developer_email()` en Supabase.
Agregar un dev → editar `DEV_EMAILS` en `Login.tsx` **y** la función en Supabase (migración
en `patoapp-scrapers`). Nunca solo uno de los dos.
