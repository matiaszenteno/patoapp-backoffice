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

`patoapp` mantiene la única fuente editable de producto y este repositorio no
conserva copias. La versión vigente es la mergeada en `patoapp/main`. Cargar desde
GitHub:

- [Producto](https://github.com/matiaszenteno/patoapp/blob/main/docs/product/README.md)
- [Decisiones](https://github.com/matiaszenteno/patoapp/blob/main/docs/decisions/README.md)
- [Product Thinking](https://github.com/matiaszenteno/patoapp/blob/main/.agents/skills/product-thinking/SKILL.md)

Un checkout hermano `../patoapp` puede reemplazar esas URLs solo después de
verificar su branch/ref y SHA contra el `patoapp/main` vigente en GitHub. Si la
tarea identifica explícitamente un PR o SHA coordinado, se puede leer esa
revisión local como contexto propuesto, nombrándola y contrastándola con `main`.
La mera existencia del
directorio no demuestra que sea canónico. Si no se puede acceder a `main` ni a una
revisión local verificada y la ausencia puede cambiar el resultado, declarar la
limitación en vez de inventar contexto.

Aplicar `product-thinking` además de las skills locales al planificar, implementar,
revisar o discutir cambios que puedan alterar usuarios, comportamiento, oferta,
operación, promesas públicas, métricas, costo, riesgo o contratos entre repositorios.
Las tareas mecánicas sin impacto de producto no necesitan este paso.

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
- La lógica pura (`src/lib/`) se testea con `npm test` (`node --test`); CI corre eso más `tsc --noEmit` en cada PR. Los componentes no tienen tests: los cambios de UI se validan con `npm run dev` + navegación manual.
- Todo texto de UI en español (locale es-CL).
- No agregar librerías de UI (shadcn, MUI, etc.); Tailwind puro + `src/lib/styles.ts`.
- El acceso al backoffice se controla por rol: `app_metadata.role = 'admin'` en Supabase Auth. El login (`signInWithPassword`) y `ProtectedRoute` validan ese rol; RLS (`is_developer_email()`) y las Edge Functions (`assertBackofficeDeveloper`) también. Dar de alta/baja a un admin se hace seteando/quitando el rol en Supabase (Authentication → Users → edit `app_metadata`), sin tocar código.
- No hay tipos Supabase generados; actualizar tipos locales manualmente al cambiar schema.

## Diseño y producto

Esta herramienta opera sobre producción real. Antes de implementar cualquier feature invocar
`/ops-review`: seguridad de acciones destructivas, blast radius de operaciones masivas,
feedback operacional explícito, claridad antes que estética. Si además existe impacto de
producto, aplicar primero el contexto y protocolo transversal de `product-thinking`.
