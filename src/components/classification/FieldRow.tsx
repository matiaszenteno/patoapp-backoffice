import { describeProvenance, type FieldProvenance } from "../../lib/classification/vocabulary";

/** Etiqueta de procedencia: quién extrajo el dato y con cuánta confianza.
 *
 *  La confianza sólo aparece cuando existe. Un dato del scraper no la trae porque es texto
 *  literal del emisor, no una inferencia — pintarlo igual que una salida de IA al 74% haría
 *  ver como equivalentes dos cosas que el operador debe tratar distinto. */
export function ProvenanceChip({ provenance }: { provenance: FieldProvenance | null | undefined }) {
  const display = describeProvenance(provenance);
  if (!display) return null;

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
          display.needsAttention
            ? "bg-amber-50 text-amber-700"
            : "bg-stone-100 text-stone-400"
        }`}
      >
        {display.label}
      </span>
      {display.confidence && (
        <span
          className={`rounded px-1.5 py-0.5 text-[9px] font-semibold tabular-nums ${
            display.isLowConfidence ? "bg-amber-50 text-amber-700" : "bg-stone-100 text-stone-500"
          }`}
          title={
            display.isLowConfidence
              ? "Bajo el umbral con que el pipeline publica sin revisión humana"
              : undefined
          }
        >
          {display.confidence}
        </span>
      )}
    </span>
  );
}

export function FieldRow({ label, provenance, hint, children }: {
  children: React.ReactNode;
  hint?: string;
  label: string;
  provenance?: FieldProvenance | null;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-stone-500">
          {label}
        </label>
        <ProvenanceChip provenance={provenance} />
        {hint && <span className="text-xs text-stone-400">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

/** Campo publicable en modo lectura, para el resumen del resto del beneficio. */
export function ReadOnlyField({ label, provenance, value }: {
  label: string;
  provenance?: FieldProvenance | null;
  value: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">
          {label}
        </span>
        <ProvenanceChip provenance={provenance} />
      </div>
      <p className="break-words text-xs leading-relaxed text-stone-700">
        {value.trim() ? value : <em className="text-stone-300">sin valor</em>}
      </p>
    </div>
  );
}
