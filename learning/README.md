# Learning Loop

Mecanismo de dos fases para capturar aprendizajes del trabajo en este repo y formalizarlos en el lugar correcto.

## Qué va aquí (y qué no)

**Learning loop** (este directorio) = aprendizajes que se promueven a artefactos **compartidos del repo**: CLAUDE.md, skills, hooks. Son conocimiento para el equipo, versionado y visible en git.

No confundir con el auto-memory local (`~/.claude/`) que es contexto personal del usuario, no versionado. Si algo es solo tuyo y no generalizable al repo, va allá o no se guarda.

## Fases

### 1. Captura (semi-automática)
El hook `capture-learning.sh` detecta cuando una sesión involucró trabajo sobre comentarios de PR y emite una sugerencia suave a Claude. Claude escribe una entry en `learning/inbox/` **solo si hay algo genuinamente útil** — una corrección de reviewer, un patrón no obvio, una restricción desconocida. Si no hay nada que valga, no escribe nada.

### 2. Promoción (on-demand)
El skill `/learning-review` lee el inbox, evalúa cada entry y propone diffs al artefacto correcto. El usuario aprueba cada cambio. Las entries procesadas se mueven a `learning/archive/`.

## Schema de una entry

Archivo: `learning/inbox/YYYY-MM-DD-slug.md`

```markdown
---
date: 2026-06-03
session: <branch o PR # si está disponible>
trigger: pr-comment-resolution
category: bug | preference | process | gap | domain
candidate_destination: CLAUDE.md | skill:<name> | settings-hook | undecided
confidence: low | medium | high
status: new
---
## Qué pasó
<contexto: qué pedí/hice, qué corrigió el reviewer>
## Aprendizaje
<la regla o insight, en una o dos frases>
## Evidencia
<link al comentario / commit / archivo:línea>
```

## Routing al promover

| Tipo de aprendizaje | Destino |
|---|---|
| Regla dura / boundary | `CLAUDE.md` (sección *Reglas base*) |
| Know-how procedimental | skill en `.agents/skills/` |
| Algo que debería ser enforced automáticamente | hook en `.claude/hooks/` + `settings.json` |

## Criterios de descarte

- One-off que no va a repetirse
- Ya está cubierto en CLAUDE.md o el skill correspondiente
- Confianza baja sin evidencia de recurrencia
