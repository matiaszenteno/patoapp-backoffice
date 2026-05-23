import { useState } from "react";
import { supabase } from "../lib/supabase";
import { getFreshAccessToken } from "../lib/auth";
import { inputCls as inputBase } from "../lib/styles";
import { useIssuers } from "../lib/useIssuers";

type Tab = "reprocess" | "ai_descriptions" | "locations";

const inputCls = `${inputBase} w-full`;
const selectCls = `${inputCls} bg-white`;

function IssuerSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { issuers } = useIssuers();
  return (
    <select className={selectCls} onChange={(e) => onChange(e.target.value)} value={value}>
      <option value="">— todos los emisores —</option>
      {issuers.map(({ slug, name }) => (
        <option key={slug} value={slug}>{name}</option>
      ))}
    </select>
  );
}

// ---------- Publicar pendientes ----------

function ReprocessTab() {
  const [issuerSlug, setIssuerSlug] = useState("");
  const [limit, setLimit] = useState("100");
  const [dryRun, setDryRun] = useState(true);
  const [force, setForce] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setResult(null);
    setError(null);
    const token = await getToken();
    if (!token) { setError("No autenticado."); setLoading(false); return; }

    const body: Record<string, unknown> = { dryRun, force, limit: Number(limit) };
    if (issuerSlug) body.issuerSlug = issuerSlug;

    const { data, error: fnError } = await supabase.functions.invoke("run-reprocess", {
      body,
      headers: { Authorization: `Bearer ${token}` },
    });

    setLoading(false);
    if (fnError) { setError(fnError.message); return; }
    setResult(data as Record<string, unknown>);
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-gray-500">
        Avanza todos los beneficios que están pendientes de publicar.
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Emisor</label>
          <IssuerSelect onChange={setIssuerSlug} value={issuerSlug} />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Máximo de beneficios a procesar</label>
          <input
            className={inputCls}
            max={500}
            min={1}
            onChange={(e) => setLimit(e.target.value)}
            type="number"
            value={limit}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-gray-700">Modo</p>
        <div className="flex flex-col gap-2">
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 bg-white p-3 hover:bg-gray-50">
            <input
              checked={!force}
              className="mt-0.5 h-4 w-4 border-gray-300 text-teal-600"
              name="reprocess-mode"
              onChange={() => setForce(false)}
              type="radio"
            />
            <div>
              <p className="text-sm font-medium text-gray-800">Continuar pendientes</p>
              <p className="text-xs text-gray-500">Avanza solo las etapas que le faltan a cada beneficio, sin repetir lo ya hecho.</p>
            </div>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 bg-white p-3 hover:bg-gray-50">
            <input
              checked={force}
              className="mt-0.5 h-4 w-4 border-gray-300 text-teal-600"
              name="reprocess-mode"
              onChange={() => setForce(true)}
              type="radio"
            />
            <div>
              <p className="text-sm font-medium text-gray-800">Rehacer desde cero</p>
              <p className="text-xs text-gray-500">Reprocesa todo desde el principio, incluyendo los análisis de IA ya realizados.</p>
            </div>
          </label>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 bg-white p-3 hover:bg-gray-50">
          <input
            checked={dryRun}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-teal-600"
            onChange={(e) => setDryRun(e.target.checked)}
            type="checkbox"
          />
          <div>
            <p className="text-sm font-medium text-gray-800">Solo previsualizar candidatos</p>
            <p className="text-xs text-gray-500">Muestra cuántos beneficios serían procesados, sin ejecutar nada.</p>
          </div>
        </label>
      </div>

      <div>
        <button
          className="rounded-lg bg-teal-700 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
          disabled={loading}
          onClick={run}
          type="button"
        >
          {loading ? "Procesando..." : dryRun ? "Previsualizar" : "Procesar ahora"}
        </button>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        {result && (
          result.runUrl ? (
            <div className="mt-3">
              <p className="text-sm text-emerald-700">Proceso iniciado correctamente.</p>
              <a
                className="text-sm text-teal-600 underline"
                href={result.runUrl as string}
                rel="noreferrer"
                target="_blank"
              >
                Ver progreso →
              </a>
            </div>
          ) : (
            <pre className="mt-3 overflow-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-700">
              {JSON.stringify(result, null, 2)}
            </pre>
          )
        )}
      </div>
    </div>
  );
}

// ---------- Regenerar descripciones ----------

function AiDescriptionsTab() {
  const [issuerSlug, setIssuerSlug] = useState("");
  const [limit, setLimit] = useState("50");
  const [overwrite, setOverwrite] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setResult(null);
    setError(null);
    const token = await getToken();
    if (!token) { setError("No autenticado."); setLoading(false); return; }

    const body: Record<string, unknown> = { force: overwrite, limit: Number(limit) };
    if (issuerSlug) body.issuerSlug = issuerSlug;

    const { data, error: fnError } = await supabase.functions.invoke("run-refresh-ai-descriptions", {
      body,
      headers: { Authorization: `Bearer ${token}` },
    });

    setLoading(false);
    if (fnError) { setError(fnError.message); return; }
    setResult(data as Record<string, unknown>);
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-gray-500">
        Genera o actualiza la descripción corta de beneficios publicados con IA, sin reprocesarlos por completo. Útil cuando cambia el redactor o el formato de las descripciones. Por defecto solo procesa los que aún no tienen descripción.
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Emisor</label>
          <IssuerSelect onChange={setIssuerSlug} value={issuerSlug} />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Máximo de beneficios a procesar</label>
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

      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 bg-white p-3 hover:bg-gray-50">
        <input
          checked={overwrite}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-teal-600"
          onChange={(e) => setOverwrite(e.target.checked)}
          type="checkbox"
        />
        <div>
          <p className="text-sm font-medium text-gray-800">Sobreescribir descripciones existentes</p>
          <p className="text-xs text-gray-500">Sin esta opción, solo procesa beneficios que aún no tienen descripción.</p>
        </div>
      </label>

      <div>
        <button
          className="rounded-lg bg-teal-700 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
          disabled={loading}
          onClick={run}
          type="button"
        >
          {loading ? "Procesando..." : "Regenerar ahora"}
        </button>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        {result && (
          <pre className="mt-3 overflow-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-700">
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

// ---------- Actualizar ubicaciones ----------

function LocationsTab() {
  const [limit, setLimit] = useState("25");
  const [concurrency, setConcurrency] = useState("3");
  const [force, setForce] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setResult(null);
    setError(null);
    const token = await getToken();
    if (!token) { setError("No autenticado."); setLoading(false); return; }

    const body = {
      concurrency: Number(concurrency),
      dryRun,
      force,
      limit: Number(limit),
    };

    const { data, error: fnError } = await supabase.functions.invoke("refresh-merchant-locations", {
      body,
      headers: { Authorization: `Bearer ${token}` },
    });

    setLoading(false);
    if (fnError) { setError(fnError.message); return; }
    setResult(data as Record<string, unknown>);
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-gray-500">
        Geocodifica las direcciones de los comercios y actualiza sus ubicaciones.
        Por defecto solo procesa los que están pendientes o llevan más de 30 días sin actualizarse.
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Máximo de comercios</label>
          <input
            className={inputCls}
            max={100}
            min={1}
            onChange={(e) => setLimit(e.target.value)}
            type="number"
            value={limit}
          />
          <p className="text-xs text-gray-400">Máximo 100.</p>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Comercios en paralelo</label>
          <input
            className={inputCls}
            max={5}
            min={1}
            onChange={(e) => setConcurrency(e.target.value)}
            type="number"
            value={concurrency}
          />
          <p className="text-xs text-gray-400">Máximo 5.</p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 bg-white p-3 hover:bg-gray-50">
          <input
            checked={dryRun}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-teal-600"
            onChange={(e) => setDryRun(e.target.checked)}
            type="checkbox"
          />
          <div>
            <p className="text-sm font-medium text-gray-800">Solo previsualizar candidatos</p>
            <p className="text-xs text-gray-500">Muestra qué comercios serían actualizados, sin hacer cambios.</p>
          </div>
        </label>

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 bg-white p-3 hover:bg-gray-50">
          <input
            checked={force}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-teal-600"
            onChange={(e) => setForce(e.target.checked)}
            type="checkbox"
          />
          <div>
            <p className="text-sm font-medium text-gray-800">Forzar actualización</p>
            <p className="text-xs text-gray-500">Vuelve a ubicar en el mapa incluso los comercios actualizados recientemente.</p>
          </div>
        </label>
      </div>

      <div>
        <button
          className="rounded-lg bg-teal-700 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
          disabled={loading}
          onClick={run}
          type="button"
        >
          {loading ? "Procesando..." : dryRun ? "Previsualizar" : "Actualizar ubicaciones"}
        </button>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        {result && (
          <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-700">
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

// ---------- Main page ----------

const TABS: { id: Tab; label: string; description: string }[] = [
  { id: "reprocess", label: "Publicar pendientes", description: "Publica los beneficios que están esperando procesamiento" },
  { id: "ai_descriptions", label: "Regenerar descripciones", description: "Genera o actualiza descripciones cortas con IA" },
  { id: "locations", label: "Ubicaciones", description: "Actualiza las ubicaciones de comercios en el mapa" },
];

export function Pipeline() {
  const [activeTab, setActiveTab] = useState<Tab>("reprocess");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Pipeline</h1>
        <p className="mt-0.5 text-sm text-gray-500">Operaciones de publicación y mantenimiento.</p>
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
