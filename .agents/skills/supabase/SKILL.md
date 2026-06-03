---
name: supabase
description: Use when reading data from Supabase, invoking Edge Functions, inspecting RLS policies, or understanding the dev-email gate in patoapp-backoffice. This repo is a pure consumer — no migrations or Edge Functions are authored here.
---

# Supabase — patoapp-backoffice (pure consumer)

## Role Of This Repo

Este repo **no tiene migraciones ni Edge Functions propias**. Solo consume datos y llama EFs
que viven en `patoapp-scrapers`. Toda modificación de schema o EF va allá.

## Reading Data

```ts
// Select
const { data, error } = await supabase
  .from('benefits')
  .select('id, title, issuer_id')
  .eq('is_published', true);

// Update
const { error } = await supabase
  .from('benefits')
  .update({ is_published: false })
  .eq('id', benefitId);
```

- Siempre manejar `error` explícitamente — mostrar feedback al usuario (no silenciar).
- No asumir que una operación exitosa (`error === null`) implica que se afectaron filas; RLS
  puede filtrar silenciosamente.

## RLS Awareness

- Las tablas tienen RLS activo. Las políticas se definen en `patoapp-scrapers`.
- El acceso del backoffice está gated por `is_developer_email()` — si una query retorna vacío
  inesperadamente, verificar primero que el email de sesión pasa el gate.
- Para inspeccionar políticas activas: `mcp__supabase__execute_sql` con un SELECT sobre
  `pg_policies` (SELECT/EXPLAIN siempre permitidos; DDL bloqueado por hook).

## Dev-Email Gate

```ts
// Login.tsx — lista local
const DEV_EMAILS = ['dev1@...', 'dev2@...'];

// Supabase — función SQL (en patoapp-scrapers)
-- is_developer_email(email text) returns boolean
```

Agregar un dev requiere actualizar **ambos**. La función SQL es el gate real para RLS.

## Edge Function Invocation

Ver skill `repo-operations` para el patrón completo (`getSession()` + `Authorization: Bearer`).
Resumen:

```ts
const token = (await supabase.auth.getSession()).data.session?.access_token;
const { data, error } = await supabase.functions.invoke('ef-name', {
  body: { ...params },
  headers: { Authorization: `Bearer ${token}` },
});
```

Las EFs disponibles están en `patoapp-scrapers/supabase/functions/`.

## What NOT To Do Here

- No ejecutar `apply_migration` — el hook lo bloquea.
- No ejecutar `deploy_edge_function` — el hook lo bloquea.
- No escribir DDL en `execute_sql` — el hook lo bloquea.
- No crear `supabase/functions/` ni `supabase/migrations/` en este repo.

Si una tarea requiere un cambio de schema o una EF nueva, el trabajo va en `patoapp-scrapers`.
