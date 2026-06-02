# Vista de Logs — Diseño

Fecha: 2026-06-02
Estado: aprobado (pendiente de plan de implementación)

## Objetivo

Construir la vista de **Logs** del backoffice, orientada a **scrapers** y **pipeline**.
Permite ver de forma unificada y cronológica los eventos de ambos procesos, tipificarlos
por origen/severidad/etapa, filtrarlos por rango de fecha/hora, y revisar el detalle
completo de cada evento.

Reemplaza el placeholder actual en `src/pages/Logs.tsx`.

## Por qué NO Grafana / Prometheus / RabbitMQ

Esas herramientas no encajan con el stack actual ni con la necesidad:

- **Prometheus** es para métricas numéricas (series de tiempo), no para logs/eventos, y
  requiere un servidor permanente que scrapee endpoints `/metrics`. El backoffice es un
  SPA estático en GitHub Pages: no hay dónde correrlo.
- **Grafana** es una app de dashboards que habría que hostear y mantener aparte.
- **RabbitMQ** es una cola de mensajes (infra de comunicación), no tiene relación con logs.

Los "logs" ya existen en Supabase, en dos tablas que llenan scrapers y pipeline. La opción
de menor costo y coherente con el repo es construir la vista leyendo esas tablas con el
cliente de Supabase, igual que el resto del backoffice. Observabilidad dedicada (Grafana/Loki)
sería un proyecto de infraestructura aparte si en el futuro se crece a muchos servicios.

## Fuentes de datos

Dos tablas en Supabase (ambas con RLS `is_developer_email()` para developers):

### `scraper_runs` (1 fila por corrida de scraper)
- `id`, `issuer_slug`, `status`, `started_at`, `finished_at`, `items_found`, `items_inserted`, `error`
- `status` ∈ `running` | `succeeded` | `failed`

### `benefit_processing_events` (1 fila por evento granular de pipeline)
- `id`, `raw_benefit_id`, `benefit_id`, `run_id`, `stage`, `processor`, `status`,
  `processor_version`, `input_payload` (jsonb), `output_payload` (jsonb), `provider`,
  `model`, `confidence`, `error`, `created_at`
- `stage` ∈ `normalization` | `enrichment` | `embedding` | `publication`
- `status` ∈ `completed` | `failed` | `skipped` | `needs_review`

## Enfoque elegido: merge en el cliente

Dos consultas Supabase en paralelo, normalización a una forma común en TS, merge y orden
por fecha en el cliente. **Sin cambios de schema ni cambios en el repo `patoapp-scrapers`**
(este repo no tiene migraciones). Mismo patrón que el resto del backoffice.

Alternativa descartada: vista/RPC `UNION` en Postgres (daría paginación real y orden global
perfecto, pero requiere una migración cross-repo en `patoapp-scrapers`; demasiado pesado para
la necesidad).

## Modelo normalizado

```ts
type LogEntry = {
  id: string;
  timestamp: string;           // scraper_runs.started_at | events.created_at (ISO)
  origin: "scraper" | "pipeline";
  type: string;                // etiqueta legible (ver más abajo)
  severity: "ok" | "warning" | "error" | "running";
  summary: string;             // texto corto legible
  raw: ScraperRun | ProcessingEvent;  // fila original, para el panel de detalle
};
```

### Etiqueta `type`
- scraper → `"Extracción"`
- pipeline → según `stage`: `normalization`→"Normalización", `enrichment`→"Enriquecimiento",
  `embedding`→"Embedding", `publication`→"Publicación". Cualquier valor desconocido se muestra
  tal cual.

### Mapeo de severidad (la "tipificación")
| Fuente | status original | severidad |
|---|---|---|
| scraper | `succeeded` | `ok` |
| scraper | `running` | `running` |
| scraper | `failed` | `error` |
| pipeline | `completed` | `ok` |
| pipeline | `skipped` | `ok` (neutro) |
| pipeline | `needs_review` | `warning` |
| pipeline | `failed` | `error` |

Cualquier status desconocido → `ok` por defecto (no romper la vista).

### `summary`
- scraper: `"{Emisor}: {items_inserted}/{items_found} guardados"`; si `status=failed`, mostrar el `error`.
- pipeline: `"{processor}"` + referencia corta al beneficio/raw (p. ej. `raw_benefit_id` truncado).

## Filtros

- **Rango fecha/hora**: dos inputs `datetime-local` (desde / hasta). Default: últimas 24 h.
  Se aplica **server-side** (`gte`/`lte` sobre `started_at` para scraper y `created_at` para
  pipeline). Es el control principal de volumen.
- **Origen**: chips multi-selección (scraper / pipeline). Client-side tras el merge.
- **Severidad**: chips multi-selección (ok / aviso / error / en curso). Client-side tras el merge.
- **Etapa**: chips multi-selección, solo aplica a pipeline. Client-side.

Los tres filtros de chips se aplican client-side por simplicidad; el rango de fecha (server-side)
es el único control de volumen. Ambas fuentes se consultan siempre dentro del rango.

## Consultas

- `scraper_runs`: `select` de campos necesarios, `gte('started_at', desde)`,
  `lte('started_at', hasta)`, `order('started_at', desc)`, `limit` (p. ej. 500).
- `benefit_processing_events`: `select` de campos necesarios, `gte('created_at', desde)`,
  `lte('created_at', hasta)`, `order('created_at', desc)`, `limit` (p. ej. 500).
- Ejecutar en paralelo (`Promise.all`). Normalizar cada resultado a `LogEntry`, concatenar,
  ordenar por `timestamp` desc, aplicar filtros client-side (origen / severidad / etapa) sobre
  el resultado merged.
- Si el límite por fuente se alcanza, indicar en la UI que el resultado puede estar truncado
  (sugerir acotar el rango).

## UI

- **Header**: título "Logs" + subtítulo breve.
- **Barra de filtros**: rango (desde/hasta), chips de origen / severidad / etapa, toggle de
  auto-refresh, botón "Refrescar" manual, indicador "actualizado hace X".
- **Tabla**: columnas `Hora | Origen | Tipo | Estado (badge) | Resumen`. Click en una fila abre
  el detalle.
- **Detalle** (panel lateral o fila expandida): error completo (en rojo si existe),
  `input_payload` / `output_payload` en `<pre>` con JSON formateado, `provider` / `model` /
  `confidence`, `processor_version`, ids relacionados (`raw_benefit_id`, `benefit_id`, `run_id`),
  y para scraper: `items_found`, `items_inserted`, `started_at`, `finished_at`.
- **Estados**: cargando, vacío (sin resultados en el rango), error.
- **Estilos**: badges y controles con la paleta `stone` ya usada en `Operaciones.tsx`; reutilizar
  `inputCls`/`selectCls` de `src/lib/styles.ts`.

## Auto-refresh

- `setInterval` cada **15 s** re-ejecuta ambas queries respetando los filtros actuales.
- Toggle para activar/pausar; indicador de última actualización.
- Sigue refrescando aunque el panel de detalle esté abierto (simplicidad).
- Limpiar el intervalo al desmontar o al pausar.

## Estructura de archivos

- Reemplazar `src/pages/Logs.tsx` (placeholder).
- Dentro del mismo archivo: helpers de normalización, `SeverityBadge`, `LogDetailPanel`.
  Separar a archivos propios solo si el archivo crece demasiado.
- Reutilizar `useIssuers` (mapear `issuer_slug` → nombre legible en el `summary`).
- Reutilizar `src/lib/styles.ts`.

## Manejo de errores

- Si una de las dos queries falla, mostrar un banner de error pero renderizar igual la otra fuente.
- Errores de auth/sesión: comportamiento consistente con el resto del backoffice.

## Validación

- No hay tests en el repo. Validar con `npm run dev` (revisión manual) y `npm run build`
  (`tsc` + `vite build`) para asegurar que compila.

## Fuera de alcance (v1)

- Filtro por emisor (los eventos de pipeline no tienen `issuer_slug` directo; requeriría join
  vía `run_id`/`raw_benefit_id`).
- Paginación con cursor / orden global perfecto.
- Supabase Realtime.
- Exportar a CSV.
