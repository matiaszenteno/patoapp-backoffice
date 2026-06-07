---
name: learning-review
description: Use when the user wants to review and promote pending learnings from learning/inbox/ to the right artifact (CLAUDE.md, a skill, a doc, or a hook).
---

# Learning Review

Skill on-demand para promover entries de `learning/inbox/` al artefacto correcto del repo.

## Procedimiento

1. **Leer el inbox**: listar y leer todos los archivos en `learning/inbox/` (ignorar `.gitkeep`). Si está vacío, informar y terminar.

2. **Evaluar cada entry** según estos criterios:
   - ¿Es generalizable o es un one-off? (one-off → descartar)
   - ¿Ya está cubierto en CLAUDE.md, docs/ o el skill correspondiente? (sí → descartar)
   - ¿La confianza y evidencia justifican formalizarlo?

3. **Determinar destino** para cada entry que sobrevive:
   - Regla dura / boundary → `CLAUDE.md` (sección *Reglas base*)
   - Know-how procedimental → skill en `.agents/skills/` (existente o nuevo)
   - Conocimiento de dominio/operacional → `docs/<archivo>.md` (si existe en el repo)
   - Algo que debería ser enforced automáticamente → hook en `.claude/hooks/` + registro en `.claude/settings.json`

4. **Proponer diff concreto** al artefacto destino para cada entry que se promueve. Pedir aprobación del usuario antes de aplicar cada cambio.

5. **Archivar**: una vez aprobado (o descartado), mover la entry de `learning/inbox/` a `learning/archive/` y actualizar el campo `status:` en el frontmatter:
   - `promoted` + agregar `destination: <ruta del artefacto>`
   - `discarded` + agregar `reason: <motivo breve>`

## Notas

- Procesar una entry a la vez: proponer, esperar aprobación, archivar, seguir con la siguiente.
- No ejecutar cambios de schema ni deploys de EFs como resultado de un learning — esos cambios van en `patoapp-scrapers`.
- Si el destino es un skill nuevo, seguir el formato de skills del repo (frontmatter `name` + `description`, cuerpo en español).
