# Contrato de la comparación básica de beneficios

Owner: `patoapp-scrapers`, migraciones `20261001000001_basic_benefit_reconciliation.sql`
y `20261001000002_reuse_operational_reconciliation.sql`.
Consumer: esta página `/salud-beneficios`. Las funciones son RPC de lectura con
verificación de administrador en el servidor; no hay acciones de reparación.

## Evidencia y alcance

La referencia por emisor es la última corrida `run_kind=scrape` con
`reconciliation_frozen_at`, incluso cuando terminó `failed`. El último intento
terminado (`issuer_last_scrape_*`) es contexto separado. Se compara todo hallazgo
observado y todo beneficio activo de emisores externos; los propios de Pato
(`platform`) no pertenecen a este control.

Los campos directos son título, descripción/condiciones de fuente, URL de origen,
vigencia, canal, tipo/valor del beneficio, método y detalles de canje y `offers`.
Las subofertas se comparan por `source_id` y condiciones directas; el orden y los
aliases permitidos no generan alertas. La ausencia de `offers` no establece una
expectativa; una lista explícita vacía sí permite detectar subofertas antiguas.
Imágenes y categorías pueden cambiar durante el pipeline y quedan fuera, al igual
que reglas inferidas, descripción IA y embeddings. `ok` significa que pasó este
control básico, no una certificación de toda la semántica del beneficio.

Las direcciones deben tener procesamiento vigente y vínculo al comercio correcto.
Se acepta el linaje durable de aliases del resolver; diferencias de formato y
lugares adicionales son neutrales. `extraction_missing` requiere investigar la
extracción desde texto, sin inventar un conteo de cero direcciones. Drafts y caches
sólo son evidencia cuando coinciden con el hash observado o con la proyección
comprometida del mismo raw, payload y corrida. Evidencia posterior no se reutiliza.

Una versión en revisión o ignorada puede convivir con una publicación activa:
se compara esa publicación y una explicación neutral nunca tapa drift, duplicados
o falta de procesamiento. Los fallos, pendientes y ausencia sin explicación son
accionables. La igualdad de fechas de fuente no verifica por sí sola que un
beneficio siga vigente hoy ni que el scraper haya interpretado bien la fuente.

## RPC y denominadores

`get_benefit_scrape_reconciliation(p_issuer_slug, p_verdicts, p_only_issues,
p_limit, p_offset)` devuelve `{total, rows}`. `total` es el total filtrado antes de
paginar. El límite de página no define el universo auditado. Los veredictos
explícitos prevalecen sobre `p_only_issues`; `null` o `[]` no filtran veredictos y
`p_limit=0` permite consultar sólo el total.

`get_benefit_scrape_reconciliation_summary(p_issuer_slug)` devuelve:

| Campo | Universo |
| --- | --- |
| `total`, `healthy`, `issues` | Beneficios activos únicos; `issues = total - healthy`. |
| `missing_publications` | Observaciones marcadas published sin beneficio activo. |
| `health_checked_total`, `health_issues` | Activos únicos más publicaciones faltantes. |
| `health_percentage` | `100 * healthy / health_checked_total`. |
| `raw_observed`, `raw_published`, `raw_not_published` | Observaciones y resultados congelados; una versión no publicada puede tener un activo anterior. |
| `fidelity_comparable`, `fidelity_matches` | Filas observadas con activo; coincidencias incluyendo revisión/ignore sin alertas. |
| `reconciliation_issues`, `verdicts` | Filas accionables y todos los veredictos principales, respectivamente. |
| `publication_states` | Estados de las observaciones, no estados del catálogo actual. |

El porcentaje visible de fidelidad usa `fidelity_matches / fidelity_comparable`;
las publicaciones faltantes quedan fuera de ese porcentaje y sí reducen la salud.
Varias fuentes pueden corresponder a un activo: no mezclar conteos de filas con
beneficios únicos. Las razones de publicación se muestran aparte de las alertas
estructurales. Los nuevos contadores son opcionales en el tipo durante el despliegue.

## Filtros, compatibilidad y fallos

Atención usa `p_only_issues=true`. Revisión/ignore usa los veredictos
`in_review`, `intentionally_ignored` y el legacy `not_published`; su contador usa
los mismos veredictos para no incluir filas cuya causa principal es una alerta.
`health_verdict` y `is_health_issue` prevalecen al consumir una vista directa;
las RPC conservan los aliases `verdict` e `is_reconciliation_issue` operacionales.
`address_match`, conteos y direcciones faltantes de la RPC representan procesamiento,
no igualdad literal con el texto de fuente.

Si falla una RPC, mostrar error y permitir reintento; no presentar datos previos
como una comparación exitosa. No hay bypass de permisos ni operaciones en lote.
Una reparación se investiga fuera de esta pantalla con IDs de observación, raw,
beneficio y corridas; el prompt copiable conserva este alcance.

## Presupuesto de consultas y rollout verificado

Las dos RPC admin tienen un presupuesto específico de 60 segundos y work_mem
32 MB. PostgREST aplica el timeout a su transacción; el límite global de 8 segundos
para authenticated y los permisos de roles permanecen iguales. La vista interna
service-only `benefit_scrape_reconciliation_operational` reúne la evidencia una vez;
el cliente sigue llamando las mismas RPC y no consulta esa vista directamente.

El 2026-10-01 se confirmó en producción la aplicación de ambas migraciones y sus
settings, y el despliegue Pages del consumidor #56. El universo de referencia
completo dio 23 filas accionables sobre 22 activos: 21 diferencias de contenido
y dos filas por fuentes duplicadas. No hay alertas principales de cobertura de
direcciones; el informe del owner corrigió una extracción inicial sin orden estable.

La consulta SQL directa pasó de 32,9 a 25,2 segundos; sigue siendo pesada y no se
presenta el tiempo local como tiempo de la página. El navegador disponible exigió
login, por lo que no se afirma una prueba REST de una sesión admin real. La carga y
manejo de errores se verificaron localmente con RPC simuladas. La auditoría completa
vive en el owner: [validación y límites](https://github.com/matiaszenteno/patoapp-scrapers/blob/main/docs/audits/2026-10-01-basic-reconciliation-validation.md).
