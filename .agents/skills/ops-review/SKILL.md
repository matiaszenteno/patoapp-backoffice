---
name: ops-review
description: Use when designing or reviewing a new feature or significant change in patoapp-backoffice. Runs a structured pre-implementation review focused on security of destructive actions, bulk operations, feedback clarity, and operational predictability.
---

# Ops Review

Checklist de diseño para features en patoapp-backoffice. Invocar **antes de implementar**
para cubrir los ángulos que importan en una herramienta interna que opera sobre producción real.

Esta UI toca datos y procesos de producción compartidos (beneficios publicados, scrapers,
merchants). El estándar es: **predecible, seguro, explícito**.

---

## 1. Seguridad de acciones destructivas

- ¿La acción tiene blast radius claro? (¿cuántos registros afecta? ¿es reversible?)
- Si afecta múltiples registros: ¿hay un conteo visible antes de confirmar?
- ¿Hay confirmación explícita antes de ejecutar? (modal, campo de texto, segundo click)
- ¿El error más probable tiene un mensaje útil, no genérico?
- Ejemplos de acciones que requieren confirmación: publicar/despublicar en bulk,
  eliminar beneficios, disparar scrapers, reprocesar lotes.

## 2. Acciones masivas (bulk)

- ¿El usuario ve exactamente qué se va a afectar antes de ejecutar?
- ¿Hay límite de volumen razonable por operación? ¿Qué pasa si se excede?
- ¿El resultado de la operación indica cuántos registros se procesaron vs. cuántos fallaron?
- ¿Una falla parcial deja el sistema en un estado consistente o inconsistente?
- ¿Hay forma de reintentar solo lo que falló?

## 3. Operaciones manuales y flujo del operador

- ¿El happy path completo es obvio sin documentación?
- ¿Qué pasa si el operador interrumpe el flujo a mitad? ¿Queda algo colgado?
- ¿Los parámetros de las Edge Functions son explícitos en la UI? ¿O el operador
  tiene que adivinar qué pasa si deja un campo vacío?
- ¿Las operaciones de larga duración (scrapers de 5–15 min) dan feedback de progreso?

## 4. Feedback operacional

- ¿Hay estados de loading/error/success explícitos para cada acción?
- Los estados de error muestran qué falló, no solo "algo salió mal".
- Los estados de success confirman qué se hizo (registros afectados, job lanzado, etc.).
- Un operador que no entiende el sistema debe poder interpretar el resultado.

## 5. Gate y acceso

- ¿La feature nueva requiere acceso especial? ¿O cualquier dev con email en
  `DEV_EMAILS` puede usarla?
- Si la acción toca datos que no deberían ser accesibles vía el backoffice, ¿hay RLS
  que lo enforce del lado de Supabase?
- El gate `is_developer_email()` es el único control de acceso — no asumir que la UI
  es el único lugar donde se puede invocar una EF.

## 6. Claridad antes que estética

- ¿El layout es predecible? ¿El operador sabe dónde está y adónde va?
- Texto explícito > íconos solos. Labels en español (locale es-CL).
- No agregar librerías de UI (shadcn, MUI, etc.); Tailwind puro.
- Usar clases de `src/lib/styles.ts` para inputs/selects/botones — consistencia visual.

---

## Cómo usar esta skill

Revisar cada sección. Para cada pregunta responder: ✅ cubierto, ⚠️ pendiente definir, o 🚫 no aplica.
Solo avanzar a implementar cuando los ítems críticos de seguridad (secciones 1–2) están ✅ o ⚠️ con
plan explícito.
