# Clasificación manual: revisión legible para humanos

Fecha: 2026-07-19
Estado: aprobado, pendiente de implementar

## Problema

La pantalla de clasificación manual (`src/pages/Clasificacion.tsx`, 1745 líneas) no permite
entender por qué un beneficio no se publicó, qué tan confiable es cada dato ni quién lo
extrajo. Muestra ~20 campos editables idénticos, mezcla la entrada del scraper con el output
publicable, y expone plomería interna (versiones de schema, nombre del normalizador).

Debajo del problema de legibilidad hay un bug que congela la cola.

### Bug: el 93% de la cola no se puede guardar

En modo persistido — el único que corre en producción, porque `deploy.yml:34` fuerza
`VITE_USE_PERSISTED_INGESTION_DRAFTS: "true"` — la cadena es:

1. `formFromDraft` (línea 360) setea `resolve_needs_review = draft.needs_review === false`.
   Los 167 drafts con `needs_manual_review` tienen `needs_review: true` → queda en `false`.
2. `getUnresolvedCorrectionBlockers` (459) exige `resolve_needs_review === true` para dar por
   resuelto el blocker `needs_manual_review`.
3. `canSaveCorrection` (1176) exige cero blockers sin resolver → `false`.
4. Ambos botones Guardar quedan `disabled`.
5. **`resolve_needs_review` no se renderiza en ningún control.** No hay forma de ponerlo en
   `true` desde la UI.

En modo legacy la línea 863 lo sembraba en `true` cuando el blocker estaba presente, así que
funcionaba. El rollout de drafts persistidos cambió la fuente del valor sin agregar el control
equivalente.

Evidencia en producción: los 167 raws con `needs_manual_review` tienen **cero** filas en
`raw_benefit_corrections`. Nadie guardó ninguno nunca. La única salida disponible es Descartar.

El fallback legacy fue lo que enmascaró el bug: como en legacy funcionaba, nadie notó que en
persistido la cola quedó congelada.

### El dato que se pide ya existe y se descarta

`benefit_ingestion_drafts.field_provenance` guarda, por campo, exactamente lo pedido:

```json
"category_slug":  { "source": "ai", "version": "2026-07-structured-v10", "confidence": 0.78 },
"value":          { "source": "deterministic_parser" },
"title":          { "source": "scraper" },
"merchant_normalized_name": { "source": "merchant_resolution", "method": "exact" },
"needs_review:rules_uncertain": { "source": "ai", "reason": "rules_uncertain" }
```

Pero el tipo `FieldProvenance` (línea 54) declara `{source, processor, version}`: **sin
`confidence`**. Se lee y se tira. `scrapers/contracts.py:38` ya anticipaba que "ahora la
consume el backoffice desde field_provenance" — nunca se cableó.

Peor: con el flag en `true`, las dos queries a `benefit_processing_events` (líneas 747 y 756)
devuelven vacío por diseño, así que `aiConfidence` es **siempre `[]`** y el bloque "Confianza
por tarea IA" no se renderiza nunca. El motivo cae al string enlatado de
`REVIEW_REASON_BY_BLOCKER`.

## Vocabulario real en producción

| Blocker | Cant. | | Razón (`needs_review:*`) | Cant. |
|---|---|---|---|---|
| `needs_manual_review` | 167 | | `rules_uncertain` | 156 |
| `image_url_missing` | 26 | | `days_ambiguous` | 10 |
| `channel_missing` | 11 | | `value_ambiguous` | 1 |
| `benefit_expired` | 5 | | | |
| `description_missing` | 1 | | | |

## Diseño

### 1. Traducir la provenance

| `source` | En pantalla | Confianza |
|---|---|---|
| `scraper` | Del sitio del emisor | — (texto literal, no inferencia) |
| `deterministic_parser` | Regla determinística | — (no es una adivinanza) |
| `ai` | IA · `core-v11` | el `confidence` real |
| `merchant_resolution` | Match exacto / Match difuso (82%) / Merchant nuevo | según `method` |
| `sibling_inheritance` | Heredado de otro beneficio del grupo | — |
| `normalizer` | Normalizado | — |
| `default` | Valor por defecto | — |
| `issuer_fallback` | Heredado del emisor (legacy) | — |
| `manual` | Corregido por `<email>` | — |
| `published_existing` | Ya publicado antes | — |

**No inventar un porcentaje donde no lo hay.** Que `title` venga del scraper sin confianza no
es un dato faltante: es la mejor garantía posible, texto literal del emisor. Hoy `title`
(scraper) y `channel` (IA al 74%) se pintan con la misma pastilla gris, y esa equivalencia
miente. Un `merchant_resolution` con `method: "new_merchant"` se destaca: puede ser un
duplicado que el fuzzy no pescó.

Razones de bloqueo:

| Código | En pantalla |
|---|---|
| `rules_uncertain` | La IA extrajo reglas pero no confía en ellas |
| `days_ambiguous` | Los días de validez se contradicen en el texto original |
| `value_ambiguous` | El monto del descuento es ambiguo en el texto original |

### 2. Tres formas de tarea

**Duda** (`needs_manual_review`, 167). Campos implicados según el código de razón:
`rules_uncertain` → `benefit_rules.*`; `days_ambiguous` → `benefit_rules.days`;
`value_ambiguous` → `value` + `value_type`. Prellenados y editables.
Acción primaria: **✓ Confirmar**, siempre habilitada.

**Falta** (`image_url_missing`, `channel_missing`, `description_missing`). El campo se muestra
vacío y con foco. Acción primaria: **Guardar y publicar**, deshabilitada hasta completarlo.

**Decisión** (`benefit_expired`, 5). No es un campo malo, es una pregunta. Se muestra la fecha
de término vencida junto a la acción. Si el operador quiere republicar es porque la fecha está
mal, así que la acción es **editar la vigencia y publicar** (con confirmación explícita, ver
Ops review), no republicar a ciegas. Alternativa: **Descartar**.

### 3. Layout

Tres columnas: **Cola | A revisar | Origen**.

- **Origen** fijo a la derecha, solo lectura: el texto del scraper arriba (lo que el operador
  realmente lee para decidir), luego merchant/categoría/URL, y el JSON completo tras un toggle.
- **A revisar**: el bloque de la tarea, según su forma.
- **Resto del beneficio**: colapsado bajo A revisar. Los demás campos publicables como resumen
  de lectura con su chip de procedencia; se expande a editable si hace falta.

Se van los tres banners (`schema 2026-07-draft-v1`, normalizador, "draft canónico"). Queda un
aviso solo cuando algo está realmente mal: una corrección anclada a un raw que ya cambió.

### 4. Guardado

Se conserva **intacta** la lógica de diff contra el draft (líneas 1012-1057): solo persisten
overrides reales, nunca el form entero como corrección.

Cambia:

- **`resolve_needs_review` sale de `FormState`.** Era un campo fantasma sin control, y ahí
  vivía el bug. Confirmar pasa a ser una *acción* que agrega `needs_review: false` al payload.
- El gate de guardado se vuelve por tipo de tarea: Duda → siempre habilitado; Falta →
  habilitado al completar; Decisión → botones explícitos.
- Muere el fallback `!persistedDraft && rawWasWaitingForReview` (línea 1002).

Verificado punta a punta contra el pipeline:

- `CORRECTION_INVALIDATION_PLAN` (`scrapers/pipeline.py:123,126`) mapea `needs_review` y
  `benefit_rules` a `{readiness, publish}` → **fast path**, sin re-correr la IA. Confirmar no
  puede volver a bloquear el beneficio al 74% en loop.
- `getChangedCorrectionFields(null, {needs_review: false})` devuelve `["needs_review"]`, así
  que `buildCorrectionReprocessBody` no devuelve `null` y el reproceso sí se dispara.

No requiere cambios en `patoapp-scrapers`.

### 5. Borrado del camino legacy

Se eliminan: las dos queries a `benefit_processing_events`, `legacyInitial`,
`getLatestAiConfidence`, `CONFIDENCE_META`, `AiValues`, `getCurrentValueSource`, `dataMode`,
los tres banners, y el flag en `deploy.yml` + `.env.example`. La confianza deja de
reconstruirse desde eventos: sale de `field_provenance`.

Quedan **12 raws sin draft persistido** (11 `needs_review` + 1 `failed`, de 187 en cola). Pasan
a estado vacío honesto y de solo lectura ("este raw no fue procesado por el pipeline nuevo"),
con el raw visible a la derecha. Es preferible a datos reconstruidos: no son un snapshot
canónico, y guardar una corrección sobre ellos la ancla a una base que no existe.

### 6. Estructura de archivos

1745 líneas en un archivo es parte del problema.

- `src/lib/classification/vocabulary.ts` — sources, razones y blockers → etiquetas; qué campos
  implica cada razón. Puro, testeable.
- `src/lib/classification/draft.ts` — `formFromDraft`, diff de correcciones, serialize/
  deserialize de reglas y canje. Puro, testeable.
- `src/components/classification/` — `ReviewBlock`, `SourcePanel`, `FieldRow`, `BenefitRest`.
- `Clasificacion.tsx` — shell, cola, selección, guardado.

### 7. Tests

`package.json` corre `node --test tests/*.test.ts`: runner de node pelado, sin React Testing
Library. Por eso el diseño empuja la lógica a módulos puros — es lo único que este setup sabe
testear, y es donde estuvo el bug.

Cobertura: `formFromDraft` con y sin corrección; el mapeo razón → campos; el diff que produce
`["needs_review"]` al confirmar sin editar; provenance sin `confidence` (no debe inventar un
porcentaje).

No se monta React Testing Library; sería otra discusión.

> Nota: `CLAUDE.md` dice "No hay tests". Está desactualizado —
> `tests/correctionReprocess.test.ts` existe y `npm test` corre. Promover vía
> `/learning-review`.

## Ops review

| Sección | Estado |
|---|---|
| 1. Acciones destructivas | ✅ blast radius de 1 registro, reversible. `Descartar` ya tiene `window.confirm`. ⚠️ **`benefit_expired` → publicar requiere confirmación explícita y mostrar la fecha vencida**: publicar un beneficio vencido lo expone en la app a usuarios finales. |
| 2. Bulk | 🚫 no aplica — de a un raw por vez. |
| 3. Flujo del operador | ✅ es el objetivo del rediseño: la tarea queda nombrada y con una acción primaria evidente. |
| 4. Feedback | ✅ se conservan toast de éxito, estado de reproceso y errores con `requestId`. Confirmar necesita success explícito propio. |
| 5. Gate y acceso | ✅ sin superficie nueva; mismas tablas y misma EF. |
| 6. Claridad | ✅ es el objetivo. Tailwind puro + `src/lib/styles.ts`, textos en es-CL. |

## Fuera de alcance

El pipeline **sigue generando raws sin draft persistido** — el más reciente del 2026-07-16,
`banco-estado`. Es un bug de `patoapp-scrapers`, no del backoffice, y merece su propio hilo.
