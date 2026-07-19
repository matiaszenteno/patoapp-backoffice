import { useState } from "react";

import type { FormState } from "../../lib/classification/draft";
import type { FieldProvenance } from "../../lib/classification/vocabulary";
import {
  CATEGORY_SLUG_OPTIONS,
  CHANNEL_OPTIONS,
  compactInputCls,
  FieldEditor,
  FIELD_LABELS,
  REDEMPTION_METHOD_OPTIONS,
  SCALAR_FIELDS,
  VALUE_TYPE_OPTIONS,
  provenanceFor,
} from "./BenefitFields";
import { FieldRow, ReadOnlyField } from "./FieldRow";

const OPTION_LABELS: Record<string, { label: string; value: string }[]> = {
  category_slug: CATEGORY_SLUG_OPTIONS,
  channel: CHANNEL_OPTIONS,
  redemption_method: REDEMPTION_METHOD_OPTIONS,
  value_type: VALUE_TYPE_OPTIONS,
};

function displayValue(field: string, vals: FormState): string {
  const raw = String(vals[field as keyof FormState] ?? "");
  const options = OPTION_LABELS[field];
  if (!options) return raw;
  return options.find((option) => option.value === raw)?.label ?? raw;
}

/** Los campos publicables que no forman parte de la tarea. Van de lectura para dar contexto
 *  sin pedirle al operador que revise 20 campos cada vez; se abren a edición si igual quiere
 *  corregir algo de paso. */
export function BenefitRest({ excluded, onChange, provenance, vals }: {
  excluded: string[];
  onChange: <K extends keyof FormState>(field: K, val: FormState[K]) => void;
  provenance: Record<string, FieldProvenance> | null | undefined;
  vals: FormState;
}) {
  const [editing, setEditing] = useState(false);
  const fields = SCALAR_FIELDS.filter((field) => !excluded.includes(field));
  if (!fields.length) return null;

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">
          Resto del beneficio
        </span>
        <div className="h-px flex-1 bg-stone-100" />
        <button
          className="rounded border border-stone-200 px-2 py-0.5 text-[10px] font-medium text-stone-500 transition-colors hover:border-stone-400 hover:text-stone-800"
          onClick={() => setEditing((value) => !value)}
          type="button"
        >
          {editing ? "Ver como lectura" : "Editar"}
        </button>
      </div>

      {editing ? (
        <div className="flex flex-col gap-4">
          {fields.map((field) => (
            <FieldEditor
              field={field}
              key={field}
              onChange={onChange}
              provenance={provenanceFor(provenance, field)}
              vals={vals}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 lg:grid-cols-3">
          {fields.map((field) => (
            <ReadOnlyField
              key={field}
              label={FIELD_LABELS[field] ?? field}
              provenance={provenanceFor(provenance, field)}
              value={displayValue(field, vals)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function InternalNote({ onChange, value }: {
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <section className="mt-6">
      <FieldRow label="Nota interna">
        <textarea
          className={`${compactInputCls} min-h-12 resize-y`}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Comentario para el equipo — no se publica…"
          value={value}
        />
      </FieldRow>
    </section>
  );
}
