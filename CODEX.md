# Qué es esto?

UI operacional interna (solo devs) en React 19 + Vite + Tailwind. Gestiona el pipeline de
beneficios de patoapp: publicar/despublicar, disparar scrapers, clasificar raws, editar
merchants, actualizar ubicaciones. Acceso gated por `is_developer_email()` en Supabase.

Este repo es **pure consumer** de Supabase. Migraciones, Edge Functions y pipeline de datos
viven en `patoapp-scrapers`.

## Stack

- React 19 + TypeScript + Vite 6 + Tailwind CSS 3.
- React Hook Form + Zod para formularios con validación.
- Leaflet + react-leaflet para editor de ubicaciones.
- Supabase JS client directo (sin capa API ni server actions).
- Routing: react-router-dom v7 con `basename: /patoapp-backoffice/`.

## Contexto y skills

| Qué necesitas | Dónde está |
|---|---|
| Comandos, estructura, patrones, EFs | skill `repo-operations` |
| Git, branches, PRs | skill `git-workflow` |
| Supabase (lecturas, RLS, invocar EFs) | skill `supabase` |
| Diseño de features operacionales | skill `ops-review` |
| Promover learnings del inbox | skill `learning-review` |

**Learnings:** aprendizajes capturados de sesiones van a `learning/inbox/`. Promover vía `/learning-review` — no editar CLAUDE.md directamente.

## Plugins

`code-review`, `code-simplifier`, `superpowers` — declarados en `.claude/settings.json`.

## Reglas base

- No crear `supabase/functions/` ni `supabase/migrations/` aquí — van en `patoapp-scrapers`.
- No editar `.env`; documentar variables nuevas en `.env.example`.
- El `base` en `vite.config.ts` y `basename` en `BrowserRouter` deben estar sincronizados (`/patoapp-backoffice/`). Cambiar ambos o ninguno.
- No hay tests; validar cambios corriendo `npm run dev` + navegación manual.
- Todo texto de UI en español (locale es-CL).
- No agregar librerías de UI (shadcn, MUI, etc.); Tailwind puro + `src/lib/styles.ts`.
- El acceso al backoffice se controla por rol: `app_metadata.role = 'admin'` en Supabase Auth. El login (`signInWithPassword`) y `ProtectedRoute` validan ese rol; RLS (`is_developer_email()`) y las Edge Functions (`assertBackofficeDeveloper`) también. Dar de alta/baja a un admin se hace seteando/quitando el rol en Supabase (Authentication → Users → edit `app_metadata`), sin tocar código.
- No hay tipos Supabase generados; actualizar tipos locales manualmente al cambiar schema.

## Diseño y producto

Esta herramienta opera sobre producción real. Antes de implementar cualquier feature invocar
`/ops-review`: seguridad de acciones destructivas, blast radius de operaciones masivas,
feedback operacional explícito, claridad antes que estética.
