---
date: 2026-06-07
session: PR#19 feat/logs-view
trigger: pr-comment-resolution
category: gap
candidate_destination: skill:supabase
confidence: high
status: new
---
## Qué pasó

Al revisar el PR#19 (vista de Logs) se encontró que `Logs.tsx` lee de dos tablas con protecciones distintas: `benefit_processing_events` tiene RLS con política `is_developer_email()` (role=admin), pero `scraper_runs` no tiene RLS habilitada en ninguna migración. Cualquier usuario autenticado puede hacer SELECT a `scraper_runs` directamente via la anon key.

## Aprendizaje

`scraper_runs` carece de RLS — es la única tabla de datos operacionales del backoffice sin política de acceso a nivel Supabase. El UI la protege via `ProtectedRoute`, pero el dato queda expuesto a cualquier sesión autenticada de Supabase. Si se trabaja en seguridad o se añaden features que lean esta tabla, considerar agregar `ALTER TABLE public.scraper_runs ENABLE ROW LEVEL SECURITY` + política `is_developer_email()` en `patoapp-scrapers`.

## Evidencia

`patoapp-scrapers/supabase/migrations/` — ninguna migración contiene `enable row level security` para `scraper_runs`. La tabla se creó en `20260101000000_baseline_schema.sql` sin RLS.
