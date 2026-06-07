---
date: 2026-06-07
session: PR #15 feat/metricas
trigger: pr-comment-resolution
category: domain
candidate_destination: CLAUDE.md
confidence: high
status: new
---
## Qué pasó
La SP `get_platform_metrics` fue creada como `SECURITY DEFINER` pero sin `REVOKE EXECUTE FROM PUBLIC`. El PR la llamaba desde el backoffice sin problema, pero cualquier usuario autenticado de la app móvil podía invocarla directamente con su JWT y ver métricas de toda la plataforma.

La migración `security_fixes` (20260605) había revocado otras funciones SECURITY DEFINER de pipeline, pero esta quedó afuera porque fue creada junto al PR, no en una auditoría de seguridad.

## Aprendizaje
Toda función `SECURITY DEFINER` nueva en Supabase debe incluir explícitamente `REVOKE EXECUTE FROM PUBLIC` + un guard `is_developer_email()` si expone datos de toda la plataforma. El patrón "solo el backoffice la va a llamar" no es suficiente — el grant implícito a `authenticated` no desaparece solo.

## Evidencia
Migración de fix: `patoapp-scrapers/supabase/migrations/20260607000001_fix_platform_metrics.sql`
