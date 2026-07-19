import { DIAS_OPTIONS, type FormState } from "../../lib/classification/draft";
import type { FieldProvenance } from "../../lib/classification/vocabulary";
import { inputCls, inputReqCls } from "../../lib/styles";
import { FieldRow } from "./FieldRow";

export const compactInputCls = `${inputCls} px-2.5 py-1.5 text-xs leading-relaxed`;
export const compactSelectCls = `${compactInputCls} cursor-pointer`;
export const compactReqCls = `${inputReqCls} px-2.5 py-1.5 text-xs leading-relaxed`;

export const CATEGORY_SLUG_OPTIONS = [
  { label: "", value: "" },
  { label: "Automotriz", value: "automotriz" },
  { label: "Deporte", value: "deporte" },
  { label: "Educación", value: "educacion" },
  { label: "Entretención", value: "entretencion" },
  { label: "Hogar", value: "hogar" },
  { label: "Mascotas", value: "mascotas" },
  { label: "Moda", value: "moda" },
  { label: "Otros (la IA no supo)", value: "otros" },
  { label: "Restaurantes", value: "restaurantes" },
  { label: "Salud y Belleza", value: "salud-belleza" },
  { label: "Servicios", value: "servicios" },
  { label: "Streaming", value: "streaming" },
  { label: "Supermercados", value: "supermercados" },
  { label: "Tecnología", value: "tecnologia" },
  { label: "Viajes", value: "viajes" },
];

export const CHANNEL_OPTIONS = [
  { label: "", value: "" },
  { label: "Online", value: "online" },
  { label: "Físico", value: "physical" },
  { label: "Híbrido", value: "hybrid" },
];

export const VALUE_TYPE_OPTIONS = [
  { label: "", value: "" },
  { label: "Porcentaje", value: "percentage" },
  { label: "Monto fijo", value: "fixed_amount" },
  { label: "Producto gratis", value: "free_item" },
  { label: "2x1", value: "two_for_one" },
  { label: "Cuotas", value: "installments" },
  { label: "Cashback", value: "cashback" },
  { label: "Preventa exclusiva", value: "preventa_exclusiva" },
  { label: "Acceso anticipado", value: "acceso_anticipado" },
];

export const REDEMPTION_METHOD_OPTIONS = [
  { label: "", value: "" },
  { label: "Detección BIN", value: "bin_detection" },
  { label: "Código", value: "code" },
  { label: "QR", value: "qr" },
  { label: "Link de app", value: "app_link" },
  { label: "Cupón", value: "coupon" },
  { label: "Deep link", value: "deep_link" },
  { label: "Validación de membresía", value: "membership_validation" },
  { label: "Checkout automático", value: "automatic_checkout" },
  { label: "Regalo con compra", value: "gift_with_purchase" },
  { label: "Subida manual de boleta", value: "manual_receipt_upload" },
];

export const FIELD_LABELS: Record<string, string> = {
  ai_description: "Descripción para la app",
  category_slug: "Categoría",
  channel: "Canal",
  ends_at: "Término",
  image_url: "Imagen",
  redemption_method: "Método de canje",
  starts_at: "Inicio",
  title: "Título",
  value: "Valor",
  value_type: "Tipo de valor",
};

/** Los campos escalares del beneficio, en el orden en que un humano los lee. */
export const SCALAR_FIELDS = [
  "title",
  "category_slug",
  "channel",
  "image_url",
  "ai_description",
  "starts_at",
  "ends_at",
  "value_type",
  "value",
  "redemption_method",
];

const RULE_FIELDS = new Set([
  "br_cuotas_minimas",
  "br_dias_mode",
  "br_dias_validos",
  "br_frequency",
  "br_max_cap",
  "br_min_compra",
]);

export function isRuleField(field: string): boolean {
  return RULE_FIELDS.has(field);
}

/** Llave de provenance para cada regla: el pipeline las anota por rule-key
 *  (`benefit_rules.days`) porque no tienen un solo autor — days puede venir del parser
 *  determinístico mientras el resto viene del LLM. */
const RULE_PROVENANCE_KEY: Record<string, string> = {
  br_cuotas_minimas: "benefit_rules.installments_count",
  br_dias_mode: "benefit_rules.days",
  br_dias_validos: "benefit_rules.days",
  br_frequency: "benefit_rules.frequency",
  br_max_cap: "benefit_rules.max_cap",
  br_min_compra: "benefit_rules.min_purchase",
};

export function provenanceFor(
  provenance: Record<string, FieldProvenance> | null | undefined,
  field: string,
): FieldProvenance | null {
  if (!provenance) return null;
  const key = RULE_PROVENANCE_KEY[field] ?? field;
  return provenance[key] ?? null;
}

export type FieldEditorProps = {
  field: string;
  isMissing?: boolean;
  onChange: <K extends keyof FormState>(field: K, val: FormState[K]) => void;
  provenance?: FieldProvenance | null;
  vals: FormState;
};

export function FieldEditor({ field, isMissing, onChange, provenance, vals }: FieldEditorProps) {
  const label = FIELD_LABELS[field] ?? field;
  const required = (value: string) => (isMissing && !value.trim() ? compactReqCls : compactInputCls);

  const missingHint = isMissing ? (
    <p className="text-[10px] font-medium text-red-700">necesario para publicar</p>
  ) : null;

  switch (field) {
    case "title":
      return (
        <FieldRow label={label} provenance={provenance}>
          <input
            className={required(vals.title)}
            onChange={(e) => onChange("title", e.target.value)}
            placeholder="Título del beneficio"
            value={vals.title}
          />
          {!vals.title.trim() && missingHint}
        </FieldRow>
      );

    case "category_slug":
      return (
        <FieldRow label={label} provenance={provenance}>
          <select
            className={isMissing && !vals.category_slug ? `${compactReqCls} cursor-pointer` : compactSelectCls}
            onChange={(e) => onChange("category_slug", e.target.value)}
            value={vals.category_slug}
          >
            {CATEGORY_SLUG_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {!vals.category_slug && missingHint}
        </FieldRow>
      );

    case "channel":
      return (
        <FieldRow label={label} provenance={provenance}>
          <select
            className={isMissing && !vals.channel ? `${compactReqCls} cursor-pointer` : compactSelectCls}
            onChange={(e) => onChange("channel", e.target.value)}
            value={vals.channel}
          >
            {CHANNEL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {!vals.channel && missingHint}
        </FieldRow>
      );

    case "image_url":
      return (
        <FieldRow label={label} provenance={provenance}>
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <input
                className={`${required(vals.image_url)} w-full`}
                onChange={(e) => onChange("image_url", e.target.value)}
                placeholder="https://..."
                value={vals.image_url}
              />
              {!vals.image_url.trim() && missingHint}
            </div>
            {vals.image_url.trim() && (
              <img
                alt=""
                className="h-[52px] w-[84px] shrink-0 rounded-md border border-stone-200 object-cover"
                src={vals.image_url.trim()}
              />
            )}
          </div>
        </FieldRow>
      );

    case "ai_description":
      return (
        <FieldRow hint="máx. 150 chars" label={label} provenance={provenance}>
          <textarea
            className={`${required(vals.ai_description)} min-h-20 resize-y`}
            maxLength={150}
            onChange={(e) => onChange("ai_description", e.target.value)}
            placeholder="Descripción corta visible para el usuario"
            value={vals.ai_description}
          />
          <p className="text-right text-[10px] text-stone-400">{vals.ai_description.length}/150</p>
          {!vals.ai_description.trim() && missingHint}
        </FieldRow>
      );

    case "starts_at":
    case "ends_at":
      return (
        <FieldRow label={label} provenance={provenance}>
          <input
            className={compactInputCls}
            onChange={(e) => onChange(field, e.target.value)}
            type="date"
            value={vals[field]}
          />
        </FieldRow>
      );

    case "value_type":
      return (
        <FieldRow label={label} provenance={provenance}>
          <select
            className={compactSelectCls}
            onChange={(e) => onChange("value_type", e.target.value)}
            value={vals.value_type}
          >
            {VALUE_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </FieldRow>
      );

    case "value":
      return (
        <FieldRow hint="ej: 15 para 15%" label={label} provenance={provenance}>
          <input
            className={compactInputCls}
            onChange={(e) => onChange("value", e.target.value)}
            placeholder="ej: 15"
            step="any"
            type="number"
            value={vals.value}
          />
        </FieldRow>
      );

    case "redemption_method":
      return (
        <>
          <FieldRow label={label} provenance={provenance}>
            <select
              className={compactSelectCls}
              onChange={(e) => onChange("redemption_method", e.target.value)}
              value={vals.redemption_method}
            >
              {REDEMPTION_METHOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </FieldRow>
          <RedemptionDetailsFields
            code={vals.rd_code}
            method={vals.redemption_method}
            onCode={(v) => onChange("rd_code", v)}
            onUrl={(v) => onChange("rd_url", v)}
            url={vals.rd_url}
          />
        </>
      );

    default:
      return null;
  }
}

function RedemptionDetailsFields({ method, code, url, onCode, onUrl }: {
  code: string;
  method: string;
  onCode: (v: string) => void;
  onUrl: (v: string) => void;
  url: string;
}) {
  const withoutDetails = [
    "bin_detection",
    "membership_validation",
    "automatic_checkout",
    "gift_with_purchase",
    "manual_receipt_upload",
  ];
  if (!method || withoutDetails.includes(method)) return null;

  if (method === "code" || method === "coupon") {
    return (
      <FieldRow label="Código de descuento">
        <input
          className={compactInputCls}
          onChange={(e) => onCode(e.target.value)}
          placeholder="ej: RAUKA15"
          value={code}
        />
      </FieldRow>
    );
  }
  if (method === "qr") {
    return (
      <FieldRow label="URL del QR">
        <input
          className={compactInputCls}
          onChange={(e) => onUrl(e.target.value)}
          placeholder="https://..."
          value={url}
        />
      </FieldRow>
    );
  }
  return (
    <FieldRow label="URL de destino">
      <input
        className={compactInputCls}
        onChange={(e) => onUrl(e.target.value)}
        placeholder="https://..."
        value={url}
      />
    </FieldRow>
  );
}

export function BenefitRulesFields({ provenance, vals, onChange }: {
  onChange: <K extends keyof FormState>(field: K, val: FormState[K]) => void;
  provenance?: Record<string, FieldProvenance> | null;
  vals: FormState;
}) {
  const toggleDia = (dia: string) => {
    const current = vals.br_dias_validos;
    onChange(
      "br_dias_validos",
      current.includes(dia) ? current.filter((d) => d !== dia) : [...current, dia],
    );
  };

  const setDaysMode = (mode: "all" | "specific") => {
    onChange("br_dias_mode", mode);
    if (mode === "all") onChange("br_dias_validos", []);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <FieldRow hint="opcional" label="Tope ($)" provenance={provenanceFor(provenance, "br_max_cap")}>
          <input
            className={compactInputCls}
            min={0}
            onChange={(e) => onChange("br_max_cap", e.target.value)}
            placeholder="ej: 5000"
            type="number"
            value={vals.br_max_cap}
          />
        </FieldRow>
        <FieldRow hint="opcional" label="Frecuencia" provenance={provenanceFor(provenance, "br_frequency")}>
          <select
            className={compactSelectCls}
            onChange={(e) => onChange("br_frequency", e.target.value)}
            value={vals.br_frequency}
          >
            <option value="">Sin frecuencia</option>
            <option value="daily">Diaria</option>
            <option value="weekly">Semanal</option>
            <option value="monthly">Mensual</option>
          </select>
        </FieldRow>
        <FieldRow hint="opcional" label="Compra mínima ($)" provenance={provenanceFor(provenance, "br_min_compra")}>
          <input
            className={compactInputCls}
            min={0}
            onChange={(e) => onChange("br_min_compra", e.target.value)}
            placeholder="ej: 20000"
            type="number"
            value={vals.br_min_compra}
          />
        </FieldRow>
        <FieldRow hint="opcional" label="Cuotas mínimas" provenance={provenanceFor(provenance, "br_cuotas_minimas")}>
          <input
            className={compactInputCls}
            min={0}
            onChange={(e) => onChange("br_cuotas_minimas", e.target.value)}
            placeholder="ej: 3"
            type="number"
            value={vals.br_cuotas_minimas}
          />
        </FieldRow>
      </div>

      <FieldRow label="Días válidos" provenance={provenanceFor(provenance, "br_dias_validos")}>
        <div className="flex flex-col gap-2">
          <div className="inline-flex w-fit rounded-md border border-stone-200 bg-stone-50 p-0.5">
            {[
              { label: "Todos los días", value: "all" },
              { label: "Días específicos", value: "specific" },
            ].map((option) => (
              <button
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  vals.br_dias_mode === option.value
                    ? "bg-white text-stone-900 shadow-sm"
                    : "text-stone-500 hover:text-stone-800"
                }`}
                key={option.value}
                onClick={() => setDaysMode(option.value as "all" | "specific")}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
          {vals.br_dias_mode === "specific" && (
            <div className="flex flex-wrap gap-2">
              {DIAS_OPTIONS.map((dia) => (
                <button
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    vals.br_dias_validos.includes(dia)
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-stone-200 bg-white text-stone-500 hover:border-stone-400"
                  }`}
                  key={dia}
                  onClick={() => toggleDia(dia)}
                  type="button"
                >
                  {dia}
                </button>
              ))}
            </div>
          )}
        </div>
      </FieldRow>
    </div>
  );
}
