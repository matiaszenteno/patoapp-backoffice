import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useIssuers } from "../lib/useIssuers";

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
  result: { triggered?: boolean; runUrl?: string; error?: string; processMode?: string } | null;
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" });
}

const STATUS_LABELS: Record<string, string> = {
  success: "Exitoso",
  failed: "Con error",
  running: "En curso",
  pending: "Pendiente",
};

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    success: "bg-emerald-100 text-emerald-700",
    failed: "bg-red-100 text-red-700",
    running: "bg-blue-100 text-blue-700",
    pending: "bg-amber-100 text-amber-700",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? "bg-gray-100 text-gray-600"}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function Scrapers() {
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
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
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
        <div>
          <h1 className="text-xl font-bold text-gray-900">Extracción</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Extrae beneficios por emisor y los ingresa al proceso de publicación. Puede tardar 5–15 minutos.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"
            onChange={(e) => setProcessMode(e.target.value as "changed_only" | "force_pipeline")}
            title="Solo cambios: extrae y procesa solo los beneficios que cambiaron desde la última vez. Reprocesar todo: vuelve a analizar todos los beneficios con IA, ignorando lo ya hecho. Útil tras cambios en el redactor o la lógica de enriquecimiento."
            value={processMode}
          >
            <option value="changed_only">Solo cambios</option>
            <option value="force_pipeline">Reprocesar todo</option>
          </select>
          <button
            className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
            disabled={triggeringAll}
            onClick={triggerAll}
            title="Extrae beneficios de todos los emisores en secuencia"
            type="button"
          >
            {triggeringAll ? "Disparando..." : "Correr todos"}
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left">
              <th className="px-4 py-3 font-medium text-gray-600">Emisor</th>
              <th className="px-4 py-3 font-medium text-gray-600">Última ejecución</th>
              <th className="px-4 py-3 font-medium text-gray-600">Estado</th>
              <th className="px-4 py-3 font-medium text-gray-600">Encontrados</th>
              <th className="px-4 py-3 font-medium text-gray-600">Guardados</th>
              <th className="px-4 py-3 font-medium text-gray-600">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {issuers.map(({ slug, name }) => {
              const run = lastRuns[slug];
              const state = runStates[slug];
              return (
                <tr key={slug} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{name}</td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(run?.created_at ?? null)}</td>
                  <td className="px-4 py-3">
                    {run ? <StatusBadge status={run.status} /> : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{run?.items_found ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{run?.items_inserted ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <button
                        className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-700 disabled:opacity-60"
                        disabled={state?.loading}
                        onClick={() => triggerScraper(slug)}
                        title={`Inicia la extracción de beneficios de ${name}`}
                        type="button"
                      >
                        {state?.loading ? "Iniciando..." : "Extraer beneficios"}
                      </button>
                      {state?.result?.triggered && (
                        <a
                          className="text-xs text-teal-600 underline"
                          href={state.result.runUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Ver progreso →
                        </a>
                      )}
                      {state?.result?.error && (
                        <p className="text-xs text-red-600">{state.result.error}</p>
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
