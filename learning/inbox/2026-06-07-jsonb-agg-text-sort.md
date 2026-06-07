---
date: 2026-06-07
session: PR #15 feat/metricas
trigger: pr-comment-resolution
category: bug
candidate_destination: undecided
confidence: high
status: new
---
## Qué pasó
La SP `get_platform_metrics` ordenaba `needs_review_by_issuer` con `ORDER BY r->>'count' DESC`. El operador `->>'` extrae como `text`, así que el orden es lexicográfico: "9" > "20" > "100". La tabla en el backoffice mostraba los emisores en orden incorrecto cuando los conteos tenían distinta cantidad de dígitos.

## Aprendizaje
Al ordenar por un campo numérico dentro de un `jsonb_agg`, siempre castear explícitamente: `(r->>'count')::int DESC`. El patrón `ORDER BY r->>'campo'` sobre valores numéricos produce orden silenciosamente incorrecto.

## Evidencia
Fix en `patoapp-scrapers/supabase/migrations/20260607000001_fix_platform_metrics.sql`, línea con `(r->>'count')::int DESC`.
