import type { FormState } from "../../lib/classification/draft";
import type { ReviewTask } from "../../lib/classification/task";
import {
  BLOCKER_LABELS,
  describeProvenance,
  formatConfidence,
  REVIEW_REASON_LABELS,
  RULES_REVIEW_CONFIDENCE_THRESHOLD,
  type FieldProvenance,
} from "../../lib/classification/vocabulary";
import {
  BenefitRulesFields,
  FieldEditor,
  FIELD_LABELS,
  isRuleField,
  provenanceFor,
} from "./BenefitFields";

/** Explica en una frase por qué este beneficio no se publicó, y con qué confianza.
 *
 *  Reemplaza el string enlatado que se mostraba antes: el pipeline deja el motivo real en
 *  field_provenance, tanto el código de razón como el confidence del campo que lo gatilló. */
function WhyBlocked({ blockers, provenance, task }: {
  blockers: string[];
  provenance: Record<string, FieldProvenance> | null | undefined;
  task: ReviewTask;
}) {
  const reasonTexts = task.reasons.map((reason) => REVIEW_REASON_LABELS[reason] ?? reason);
  const blockerTexts = blockers
    .filter((blocker) => blocker !== "needs_manual_review")
    .map((blocker) => BLOCKER_LABELS[blocker] ?? blocker);

  // La confianza que gatilló la revisión: la menor entre los campos en duda. Se ordena por el
  // número, no por el texto ya formateado — "8%" ordenaría antes que "74%" como string.
  const lowest = task.doubtFields
    .map((field) => provenanceFor(provenance, field))
    .filter((field): field is FieldProvenance => typeof field?.confidence === "number")
    .sort((a, b) => (a.confidence ?? 0) - (b.confidence ?? 0))
    .map(describeProvenance)[0];

  const texts = [...reasonTexts, ...blockerTexts];
  if (!texts.length && !task.expired) return null;

  return (
    <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">
        Por qué no se publicó
      </p>
      <ul className="mt-1.5 flex flex-col gap-1">
        {task.expired && (
          <li className="text-sm leading-snug text-amber-900">
            La vigencia de este beneficio ya venció. Publicarlo lo deja visible en la app.
          </li>
        )}
        {texts.map((text) => (
          <li className="text-sm leading-snug text-amber-900" key={text}>{text}</li>
        ))}
      </ul>
      {lowest?.confidence && (
        <p className="mt-2 text-xs text-amber-800">
          Confianza de la IA: <strong>{lowest.confidence}</strong> · el pipeline publica sin
          revisión humana desde {formatConfidence(RULES_REVIEW_CONFIDENCE_THRESHOLD)}.
        </p>
      )}
    </div>
  );
}

export function ReviewBlock({ blockers, onChange, provenance, task, vals }: {
  blockers: string[];
  onChange: <K extends keyof FormState>(field: K, val: FormState[K]) => void;
  provenance: Record<string, FieldProvenance> | null | undefined;
  task: ReviewTask;
  vals: FormState;
}) {
  const showRules = task.doubtFields.some(isRuleField);
  const scalarDoubts = task.doubtFields.filter((field) => !isRuleField(field));
  // Un vencido se resuelve corrigiendo la vigencia, así que las fechas son parte de la tarea.
  const expiredFields = task.expired ? ["starts_at", "ends_at"] : [];
  const editable = [...new Set([...task.missingFields, ...scalarDoubts, ...expiredFields])];
  const hasWork = editable.length > 0 || showRules;

  return (
    <section>
      <WhyBlocked blockers={blockers} provenance={provenance} task={task} />

      {hasWork ? (
        <>
          <div className="mb-3 flex items-center gap-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">
              A revisar
            </span>
            <div className="h-px flex-1 bg-stone-100" />
          </div>

          <div className="flex flex-col gap-4">
            {editable.map((field) => (
              <FieldEditor
                field={field}
                isMissing={task.missingFields.includes(field)}
                key={field}
                onChange={onChange}
                provenance={provenanceFor(provenance, field)}
                vals={vals}
              />
            ))}

            {showRules && (
              <div className="rounded-lg border border-stone-200 p-4">
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-stone-400">
                  Reglas del beneficio
                </p>
                <BenefitRulesFields onChange={onChange} provenance={provenance} vals={vals} />
              </div>
            )}
          </div>
        </>
      ) : (
        <p className="text-sm text-stone-500">
          No hay un campo puntual que corregir. Revisá el beneficio completo contra el origen y
          confirmá si está correcto.
        </p>
      )}
    </section>
  );
}

/** Etiquetas en castellano para nombrar campos dentro de mensajes al operador
 *  (por ejemplo "Completá Canal, Imagen"). */
export function labelsForFields(fields: string[]): Record<string, string> {
  return Object.fromEntries(fields.map((field) => [field, FIELD_LABELS[field] ?? field]));
}
