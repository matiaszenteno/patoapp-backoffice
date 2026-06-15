import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { inputCls, selectCls } from "../lib/styles";
import { useIssuers } from "../lib/useIssuers";

// ─── Types ────────────────────────────────────────────────────────────────────

type ScraperRun = {
  issuer_slug: string;
  status: string;
  items_found: number | null;
  items_inserted: number | null;
  created_at: string;
  finished_at: string | null;
};

type RunState = {
  loading: boolean;
  result: { triggered?: boolean; runUrl?: string; error?: string } | null;
};

type MainTab = "scrapers" | "pipeline";
type PipelineTab = "reprocess" | "ai_descriptions" | "locations";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" });
}

async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

const STATUS_LABELS: Record<string, string> = {
  success: "Exitoso",
  failed: "Con error",
  running: "En curso",
  pending: "Pendiente",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className="rounded px-2 py-0.5 text-xs font-medium bg-stone-100 text-stone-500 border border-stone-200">
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function IssuerSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { issuers } = useIssuers();
  return (
    <select className={`${selectCls} w-full`} onChange={(e) => onChange(e.target.value)} value={value}>
      <option value="">— todos los emisores —</option>
      {issuers.map(({ slug, name }) => (
        <option key={slug} value={slug}>{name}</option>
      ))}
    </select>
  );
}

// ─── Scrapers tab ─────────────────────────────────────────────────────────────

function ScrapersContent() {
  const { issuers } = useIssuers();
  const [lastRuns, setLastRuns] = useState<Record<string, ScraperRun>>({});
  const [runStates, setRunStates] = useState<Record<string, RunState>>({});
  const [processMode, setProcessMode] = useState<"changed_only" | "force_pipeline">("changed_only");
  const [triggeringAll, setTriggeringAll] = useState(false);

  useEffect(() => {
    supabase
      .from("scraper_runs")
      .select("issuer_slug, status, items_found, items_inserted, created_at, finished_at")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (!data) return;
        const map: Record<string, ScraperRun> = {};
        for (const row of data as ScraperRun[]) {
          if (!map[row.issuer_slug]) map[row.issuer_slug] = row;
        }
        setLastRuns(map);
      });
  }, []);

  async function triggerScraper(issuerSlug: string) {
    setRunStates((s) => ({ ...s, [issuerSlug]: { loading: true, result: null } }));
    const token = await getToken();
    if (!token) {
      setRunStates((s) => ({ ...s, [issuerSlug]: { loading: false, result: { error: "No autenticado." } } }));
      return;
    }
    const { data, error } = await supabase.functions.invoke("trigger-scraper", {
      body: { issuerSlug, processMode },
      headers: { Authorization: `Bearer ${token}` },
    });
    setRunStates((s) => ({
      ...s,
      [issuerSlug]: {
        loading: false,
        result: error ? { error: error.message } : (data as RunState["result"]),
      },
    }));
  }

  async function triggerAll() {
    setTriggeringAll(true);
    for (const issuer of issuers) {
      await triggerScraper(issuer.slug);
    }
    setTriggeringAll(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-stone-500">
          Extrae beneficios por emisor e inicia el proceso de publicación. Puede tardar 5–15 minutos.
        </p>
        <div className="flex items-center gap-3 shrink-0 ml-6">
          <select
            className={selectCls}
            onChange={(e) => setProcessMode(e.target.value as "changed_only" | "force_pipeline")}
            value={processMode}
          >
            <option value="changed_only">Solo cambios</option>
            <option value="force_pipeline">Reprocesar todo</option>
          </select>
          <button
            className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50 transition-colors"
            disabled={triggeringAll}
            onClick={triggerAll}
            type="button"
          >
            {triggeringAll ? "Disparando…" : "Correr todos"}
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-100 bg-stone-50 text-left">
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-stone-400">Emisor</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-stone-400">Última ejecución</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-stone-400">Estado</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-stone-400">Encontrados</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-stone-400">Guardados</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-stone-400">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {issuers.map(({ slug, name }) => {
              const run = lastRuns[slug];
              const state = runStates[slug];
              return (
                <tr key={slug} className="hover:bg-stone-50">
                  <td className="px-4 py-3 font-medium text-stone-900">{name}</td>
                  <td className="px-4 py-3 text-stone-400">{formatDate(run?.created_at ?? null)}</td>
                  <td className="px-4 py-3">
                    {run ? <StatusBadge status={run.status} /> : <span className="text-stone-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-stone-500">{run?.items_found ?? "—"}</td>
                  <td className="px-4 py-3 text-stone-500">{run?.items_inserted ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <button
                        className="rounded-md bg-stone-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-800 disabled:opacity-50 transition-colors"
                        disabled={state?.loading}
                        onClick={() => triggerScraper(slug)}
                        type="button"
                      >
                        {state?.loading ? "Iniciando…" : "Extraer"}
                      </button>
                      {state?.result?.triggered && (
                        <a
                          className="text-xs text-stone-500 underline hover:text-stone-800"
                          href={state.result.runUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Ver progreso →
                        </a>
                      )}
                      {state?.result?.error && (
                        <p className="text-xs text-stone-500">{state.result.error}</p>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Pipeline sub-tabs ────────────────────────────────────────────────────────

function ReprocessTab() {
  const [issuerSlug, setIssuerSlug] = useState("");
  const [limit, setLimit] = useState("100");
  const [dryRun, setDryRun] = useState(true);
  const [force, setForce] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true); setResult(null); setError(null);
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
    <div className="flex flex-col gap-5">
      <p className="text-sm text-stone-500">Avanza todos los beneficios que están pendientes de publicar.</p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-stone-400">Emisor</label>
          <IssuerSelect onChange={setIssuerSlug} value={issuerSlug} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-stone-400">Máximo de beneficios</label>
          <input className={`${inputCls} w-full`} max={500} min={1} onChange={(e) => setLimit(e.target.value)} type="number" value={limit} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Modo</p>
        {[
          { val: false, label: "Continuar pendientes", desc: "Avanza solo las etapas que le faltan a cada beneficio." },
          { val: true, label: "Rehacer desde cero", desc: "Reprocesa todo, incluyendo los análisis de IA ya realizados." },
        ].map(({ val, label, desc }) => (
          <label key={label} className="flex cursor-pointer items-start gap-3 rounded-lg border border-stone-200 bg-white p-3 hover:bg-stone-50">
            <input checked={force === val} className="mt-0.5 h-4 w-4 accent-stone-900" name="reprocess-mode" onChange={() => setForce(val)} type="radio" />
            <div>
              <p className="text-sm font-medium text-stone-800">{label}</p>
              <p className="text-xs text-stone-400">{desc}</p>
            </div>
          </label>
        ))}
      </div>
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-stone-200 bg-white p-3 hover:bg-stone-50">
        <input checked={dryRun} className="mt-0.5 h-4 w-4 accent-stone-900" onChange={(e) => setDryRun(e.target.checked)} type="checkbox" />
        <div>
          <p className="text-sm font-medium text-stone-800">Solo previsualizar</p>
          <p className="text-xs text-stone-400">Muestra cuántos beneficios serían procesados, sin ejecutar nada.</p>
        </div>
      </label>
      <div>
        <button className="rounded-md bg-stone-900 px-5 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50 transition-colors" disabled={loading} onClick={run} type="button">
          {loading ? "Procesando…" : dryRun ? "Previsualizar" : "Procesar ahora"}
        </button>
        {error && <p className="mt-2 text-sm text-stone-500">{error}</p>}
        {result && (
          result.runUrl ? (
            <div className="mt-3">
              <p className="text-sm text-stone-600">Proceso iniciado.</p>
              <a className="text-sm text-stone-500 underline hover:text-stone-800" href={result.runUrl as string} rel="noreferrer" target="_blank">Ver progreso →</a>
            </div>
          ) : (
            <pre className="mt-3 overflow-auto rounded-lg bg-stone-50 border border-stone-200 p-3 text-xs text-stone-600">{JSON.stringify(result, null, 2)}</pre>
          )
        )}
      </div>
    </div>
  );
}

function AiDescriptionsTab() {
  const [issuerSlug, setIssuerSlug] = useState("");
  const [limit, setLimit] = useState("50");
  const [overwrite, setOverwrite] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true); setResult(null); setError(null);
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
    <div className="flex flex-col gap-5">
      <p className="text-sm text-stone-500">Genera o actualiza la descripción corta de beneficios publicados. Por defecto solo procesa los que aún no tienen descripción.</p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-stone-400">Emisor</label>
          <IssuerSelect onChange={setIssuerSlug} value={issuerSlug} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-stone-400">Máximo de beneficios</label>
          <input className={`${inputCls} w-full`} max={200} min={1} onChange={(e) => setLimit(e.target.value)} type="number" value={limit} />
        </div>
      </div>
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-stone-200 bg-white p-3 hover:bg-stone-50">
        <input checked={overwrite} className="mt-0.5 h-4 w-4 accent-stone-900" onChange={(e) => setOverwrite(e.target.checked)} type="checkbox" />
        <div>
          <p className="text-sm font-medium text-stone-800">Sobreescribir descripciones existentes</p>
          <p className="text-xs text-stone-400">Sin esta opción, solo procesa los que aún no tienen descripción.</p>
        </div>
      </label>
      <div>
        <button className="rounded-md bg-stone-900 px-5 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50 transition-colors" disabled={loading} onClick={run} type="button">
          {loading ? "Procesando…" : "Regenerar ahora"}
        </button>
        {error && <p className="mt-2 text-sm text-stone-500">{error}</p>}
        {result && <pre className="mt-3 overflow-auto rounded-lg bg-stone-50 border border-stone-200 p-3 text-xs text-stone-600">{JSON.stringify(result, null, 2)}</pre>}
      </div>
    </div>
  );
}

function LocationsTab() {
  const [limit, setLimit] = useState("25");
  const [concurrency, setConcurrency] = useState("3");
  const [force, setForce] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true); setResult(null); setError(null);
    const token = await getToken();
    if (!token) { setError("No autenticado."); setLoading(false); return; }
    const { data, error: fnError } = await supabase.functions.invoke("refresh-merchant-locations", {
      body: { concurrency: Number(concurrency), dryRun, force, limit: Number(limit) },
      headers: { Authorization: `Bearer ${token}` },
    });
    setLoading(false);
    if (fnError) { setError(fnError.message); return; }
    setResult(data as Record<string, unknown>);
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-stone-500">Geocodifica las direcciones de los comercios y actualiza sus ubicaciones. Por defecto procesa solo los pendientes o sin actualizar en más de 30 días.</p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-stone-400">Máximo de comercios</label>
          <input className={`${inputCls} w-full`} max={100} min={1} onChange={(e) => setLimit(e.target.value)} type="number" value={limit} />
          <p className="text-xs text-stone-400">Máximo 100.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-stone-400">Comercios en paralelo</label>
          <input className={`${inputCls} w-full`} max={5} min={1} onChange={(e) => setConcurrency(e.target.value)} type="number" value={concurrency} />
          <p className="text-xs text-stone-400">Máximo 5.</p>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {[
          { val: dryRun, set: setDryRun, label: "Solo previsualizar", desc: "Muestra qué comercios serían actualizados, sin hacer cambios." },
          { val: force, set: setForce, label: "Forzar actualización", desc: "Vuelve a ubicar incluso los comercios actualizados recientemente." },
        ].map(({ val, set, label, desc }) => (
          <label key={label} className="flex cursor-pointer items-start gap-3 rounded-lg border border-stone-200 bg-white p-3 hover:bg-stone-50">
            <input checked={val} className="mt-0.5 h-4 w-4 accent-stone-900" onChange={(e) => set(e.target.checked)} type="checkbox" />
            <div>
              <p className="text-sm font-medium text-stone-800">{label}</p>
              <p className="text-xs text-stone-400">{desc}</p>
            </div>
          </label>
        ))}
      </div>
      <div>
        <button className="rounded-md bg-stone-900 px-5 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50 transition-colors" disabled={loading} onClick={run} type="button">
          {loading ? "Procesando…" : dryRun ? "Previsualizar" : "Actualizar ubicaciones"}
        </button>
        {error && <p className="mt-2 text-sm text-stone-500">{error}</p>}
        {result && <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-stone-50 border border-stone-200 p-3 text-xs text-stone-600">{JSON.stringify(result, null, 2)}</pre>}
      </div>
    </div>
  );
}

const PIPELINE_TABS: { id: PipelineTab; label: string }[] = [
  { id: "reprocess", label: "Publicar pendientes" },
  { id: "ai_descriptions", label: "Regenerar descripciones" },
  { id: "locations", label: "Ubicaciones" },
];

function PipelineContent() {
  const [activeTab, setActiveTab] = useState<PipelineTab>("reprocess");
  return (
    <div className="flex flex-col gap-0">
      <div className="flex border-b border-stone-200">
        {PIPELINE_TABS.map((tab) => (
          <button
            key={tab.id}
            className={`px-5 py-3 text-sm font-medium transition-colors border-b-[1.5px] -mb-px ${
              activeTab === tab.id
                ? "text-stone-900 border-stone-900"
                : "text-stone-400 border-transparent hover:text-stone-700"
            }`}
            onClick={() => setActiveTab(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="pt-6">
        {activeTab === "reprocess" && <ReprocessTab />}
        {activeTab === "ai_descriptions" && <AiDescriptionsTab />}
        {activeTab === "locations" && <LocationsTab />}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const MAIN_TABS: { id: MainTab; label: string; desc: string }[] = [
  { id: "scrapers", label: "Extracción", desc: "Extraer beneficios por emisor" },
  { id: "pipeline", label: "Pipeline", desc: "Publicar, regenerar, ubicaciones" },
];

export function Operaciones() {
  const [activeTab, setActiveTab] = useState<MainTab>("scrapers");

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-stone-900">Operaciones</h1>
        <p className="mt-0.5 text-sm text-stone-400">Extracción de beneficios y operaciones de publicación.</p>
      </div>

      <div className="rounded-lg border border-stone-200 bg-white overflow-hidden">
        <div className="flex border-b border-stone-200">
          {MAIN_TABS.map((tab) => (
            <button
              key={tab.id}
              className={`px-5 py-3 text-sm font-medium transition-colors border-b-[1.5px] -mb-px ${
                activeTab === tab.id
                  ? "text-stone-900 border-stone-900"
                  : "text-stone-400 border-transparent hover:text-stone-700"
              }`}
              onClick={() => setActiveTab(tab.id)}
              title={tab.desc}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {activeTab === "scrapers" && <ScrapersContent />}
          {activeTab === "pipeline" && <PipelineContent />}
        </div>
      </div>
      </div>
    </div>
  );
}
