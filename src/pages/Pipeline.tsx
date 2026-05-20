import { useState } from "react";
import { supabase } from "../lib/supabase";

type Tab = "reprocess" | "ai_descriptions" | "locations";

const VALID_STATUSES = ["needs_review", "failed", "pending", "published"] as const;
const ISSUERS = ["", "bancochile", "entel", "falabella", "itau", "santander", "tenpo", "wom"] as const;

const inputCls =
  "rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 w-full";
const selectCls = `${inputCls} bg-white`;

function Toggle({
  checked,
  onChange,
  label,
  title,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  title: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600" title={title}>
      <input
        checked={checked}
        className="h-4 w-4 rounded border-gray-300 text-teal-600"
        onChange={(e) => onChange(e.target.checked)}
        type="checkbox"
      />
      {label}
    </label>
  );
}

function ResultBox({ data }: { data: Record<string, unknown> }) {
  return (
    <pre className="mt-3 overflow-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-700">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

// ---------- Reprocess tab ----------

function ReprocessTab() {
  const [issuerSlug, setIssuerSlug] = useState("");
  const [statuses, setStatuses] = useState<string[]>(["needs_review", "failed"]);
  const [benefitId, setBenefitId] = useState("");
  const [rawBenefitId, setRawBenefitId] = useState("");
  const [limit, setLimit] = useState("100");
  const [force, setForce] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggleStatus(s: string) {
    setStatuses((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  async function run() {
    setLoading(true);
    setResult(null);
    setError(null);
    const token = await getToken();
    if (!token) { setError("No autenticado."); setLoading(false); return; }

    const body: Record<string, unknown> = { force, dryRun, limit: Number(limit) };
    if (issuerSlug) body.issuerSlug = issuerSlug;
    if (statuses.length) body.status = statuses;
    if (benefitId.trim()) body.benefitId = benefitId.trim();
    if (rawBenefitId.trim()) body.rawBenefitId = rawBenefitId.trim();

    const { data, error: fnError } = await supabase.functions.invoke("run-reprocess", {
      body,
      headers: { Authorization: `Bearer ${token}` },
    });

    setLoading(false);
    if (fnError) { setError(fnError.message); return; }
    setResult(data as Record<string, unknown>);
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-gray-500">
        Dispara el workflow de reprocess en GitHub Actions. El pipeline procesa los beneficios crudos y los publica en la tabla <code>benefits</code>.
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700" title="Filtra el reprocess por un emisor específico">
            Emisor
          </label>
          <select className={selectCls} onChange={(e) => setIssuerSlug(e.target.value)} value={issuerSlug}>
            {ISSUERS.map((s) => (
              <option key={s} value={s}>{s || "— todos —"}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700" title="Máximo de beneficios a reprocesar en este run">
            Límite
          </label>
          <input
            className={inputCls}
            max={500}
            min={1}
            onChange={(e) => setLimit(e.target.value)}
            type="number"
            value={limit}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700" title="UUID del beneficio publicado a reprocesar">
            Benefit ID (opcional)
          </label>
          <input
            className={inputCls}
            onChange={(e) => setBenefitId(e.target.value)}
            placeholder="UUID del beneficio publicado"
            value={benefitId}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700" title="UUID del raw benefit en scraped_benefits_raw">
            Raw Benefit ID (opcional)
          </label>
          <input
            className={inputCls}
            onChange={(e) => setRawBenefitId(e.target.value)}
            placeholder="UUID de scraped_benefits_raw"
            value={rawBenefitId}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-gray-700" title="Estados de processing_status a incluir en el reprocess">
          Estados a reprocesar
        </p>
        <div className="flex flex-wrap gap-3">
          {VALID_STATUSES.map((s) => (
            <label
              key={s}
              className="flex cursor-pointer items-center gap-2 text-sm text-gray-600"
              title={`Incluir beneficios con processing_status = ${s}`}
            >
              <input
                checked={statuses.includes(s)}
                className="h-4 w-4 rounded border-gray-300 text-teal-600"
                onChange={() => toggleStatus(s)}
                type="checkbox"
              />
              {s}
            </label>
          ))}
        </div>
      </div>

      <div className="flex gap-6">
        <Toggle
          checked={force}
          label="--force"
          onChange={setForce}
          title="Fuerza el reproceso aunque el beneficio ya tenga resultado (omite idempotency check)"
        />
        <Toggle
          checked={dryRun}
          label="--dry-run"
          onChange={setDryRun}
          title="Muestra los candidatos sin ejecutar el pipeline"
        />
      </div>

      <div>
        <button
          className="rounded-lg bg-teal-700 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
          disabled={loading}
          onClick={run}
          type="button"
        >
          {loading ? "Disparando..." : dryRun ? "Ver candidatos (dry run)" : "Reprocesar"}
        </button>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        {result && (
          <>
            {result.runUrl ? (
              <div className="mt-3">
                <p className="text-sm text-emerald-700">Workflow disparado.</p>
                <a
                  className="text-sm text-teal-600 underline"
                  href={result.runUrl as string}
                  rel="noreferrer"
                  target="_blank"
                >
                  Ver en GitHub Actions →
                </a>
              </div>
            ) : (
              <ResultBox data={result} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------- AI descriptions tab ----------

function AiDescriptionsTab() {
  const [issuerSlug, setIssuerSlug] = useState("");
  const [benefitIds, setBenefitIds] = useState("");
  const [limit, setLimit] = useState("50");
  const [force, setForce] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setResult(null);
    setError(null);
    const token = await getToken();
    if (!token) { setError("No autenticado."); setLoading(false); return; }

    const body: Record<string, unknown> = { force, dryRun, limit: Number(limit) };
    if (issuerSlug) body.issuerSlug = issuerSlug;
    if (benefitIds.trim()) {
      body.benefitIds = benefitIds.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    }

    const { data, error: fnError } = await supabase.functions.invoke("run-refresh-ai-descriptions", {
      body,
      headers: { Authorization: `Bearer ${token}` },
    });

    setLoading(false);
    if (fnError) { setError(fnError.message); return; }
    setResult(data as Record<string, unknown>);
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-gray-500">
        Genera o regenera la descripción corta de IA para beneficios activos usando GPT-4o mini. Corre directamente en la Edge Function (sin GitHub Actions).
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700" title="Filtra por emisor; vacío procesa todos los issuers">
            Emisor
          </label>
          <select className={selectCls} onChange={(e) => setIssuerSlug(e.target.value)} value={issuerSlug}>
            {ISSUERS.map((s) => (
              <option key={s} value={s}>{s || "— todos —"}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700" title="Máximo de beneficios a procesar en este run (máx 200)">
            Límite
          </label>
          <input
            className={inputCls}
            max={200}
            min={1}
            onChange={(e) => setLimit(e.target.value)}
            type="number"
            value={limit}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label
          className="text-sm font-medium text-gray-700"
          title="UUIDs de beneficios específicos, uno por línea o separados por coma"
        >
          Benefit IDs específicos (opcional)
        </label>
        <textarea
          className={`${inputCls} min-h-20 resize-y font-mono`}
          onChange={(e) => setBenefitIds(e.target.value)}
          placeholder="UUID1&#10;UUID2&#10;..."
          value={benefitIds}
        />
      </div>

      <div className="flex gap-6">
        <Toggle
          checked={force}
          label="--force"
          onChange={setForce}
          title="Sobreescribe descripciones existentes. Sin --force solo procesa beneficios sin ai_description"
        />
        <Toggle
          checked={dryRun}
          label="--dry-run"
          onChange={setDryRun}
          title="Lista los candidatos sin generar ni guardar descripciones"
        />
      </div>

      <div>
        <button
          className="rounded-lg bg-teal-700 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
          disabled={loading}
          onClick={run}
          type="button"
        >
          {loading ? "Procesando..." : dryRun ? "Ver candidatos (dry run)" : "Generar descripciones"}
        </button>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        {result && <ResultBox data={result} />}
      </div>
    </div>
  );
}

// ---------- Locations tab ----------

function LocationsTab() {
  const [merchantIds, setMerchantIds] = useState("");
  const [limit, setLimit] = useState("20");
  const [force, setForce] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setResult(null);
    setError(null);
    const token = await getToken();
    if (!token) { setError("No autenticado."); setLoading(false); return; }

    const body: Record<string, unknown> = { force, dryRun, limit: Number(limit) };
    if (merchantIds.trim()) {
      body.merchantIds = merchantIds.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    }

    const { data, error: fnError } = await supabase.functions.invoke("refresh-merchant-locations", {
      body,
      headers: { Authorization: `Bearer ${token}` },
    });

    setLoading(false);
    if (fnError) { setError(fnError.message); return; }
    setResult(data as Record<string, unknown>);
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-gray-500">
        Refresca las ubicaciones de merchants consultando Geoapify. Busca merchants activos sin ubicaciones o con datos desactualizados.
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label
            className="text-sm font-medium text-gray-700"
            title="UUIDs de merchants específicos; vacío procesa los que necesitan refresh según la lógica interna"
          >
            Merchant IDs específicos (opcional)
          </label>
          <textarea
            className={`${inputCls} min-h-20 resize-y font-mono`}
            onChange={(e) => setMerchantIds(e.target.value)}
            placeholder="UUID1&#10;UUID2&#10;..."
            value={merchantIds}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700" title="Máximo de merchants a procesar en este run">
            Límite de merchants
          </label>
          <input
            className={inputCls}
            max={100}
            min={1}
            onChange={(e) => setLimit(e.target.value)}
            type="number"
            value={limit}
          />
        </div>
      </div>

      <div className="flex gap-6">
        <Toggle
          checked={force}
          label="--force"
          onChange={setForce}
          title="Refresca ubicaciones aunque el merchant ya tenga datos recientes"
        />
        <Toggle
          checked={dryRun}
          label="--dry-run"
          onChange={setDryRun}
          title="Lista los merchants candidatos sin consultar Geoapify ni escribir datos"
        />
      </div>

      <div>
        <button
          className="rounded-lg bg-teal-700 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
          disabled={loading}
          onClick={run}
          type="button"
        >
          {loading ? "Procesando..." : dryRun ? "Ver candidatos (dry run)" : "Refresh ubicaciones"}
        </button>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        {result && <ResultBox data={result} />}
      </div>
    </div>
  );
}

// ---------- Main page ----------

const TABS: { id: Tab; label: string; description: string }[] = [
  { id: "reprocess", label: "Reprocesar", description: "Corre el pipeline de ingestion sobre beneficios crudos" },
  { id: "ai_descriptions", label: "Descripciones IA", description: "Genera ai_description con GPT-4o mini" },
  { id: "locations", label: "Ubicaciones", description: "Refresca merchant_locations con Geoapify" },
];

export function Pipeline() {
  const [activeTab, setActiveTab] = useState<Tab>("reprocess");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Pipeline</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Operaciones de procesamiento de datos global.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex border-b border-gray-200">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`px-5 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "border-b-2 border-teal-600 text-teal-700"
                  : "text-gray-500 hover:text-gray-700"
              }`}
              onClick={() => setActiveTab(tab.id)}
              title={tab.description}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {activeTab === "reprocess" && <ReprocessTab />}
          {activeTab === "ai_descriptions" && <AiDescriptionsTab />}
          {activeTab === "locations" && <LocationsTab />}
        </div>
      </div>
    </div>
  );
}
