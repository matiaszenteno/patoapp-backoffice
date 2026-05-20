import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const ISSUERS = ["bancochile", "entel", "falabella", "itau", "santander", "tenpo", "wom"] as const;
type IssuerSlug = (typeof ISSUERS)[number];

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

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" });
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    success: "bg-emerald-100 text-emerald-700",
    failed: "bg-red-100 text-red-700",
    running: "bg-blue-100 text-blue-700",
    pending: "bg-amber-100 text-amber-700",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? "bg-gray-100 text-gray-600"}`}>
      {status}
    </span>
  );
}

export function Scrapers() {
  const [lastRuns, setLastRuns] = useState<Record<string, ScraperRun>>({});
  const [runStates, setRunStates] = useState<Record<string, RunState>>({});
  const [force, setForce] = useState(false);
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

  async function triggerScraper(issuerSlug: IssuerSlug) {
    setRunStates((s) => ({ ...s, [issuerSlug]: { loading: true, result: null } }));
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setRunStates((s) => ({ ...s, [issuerSlug]: { loading: false, result: { error: "No autenticado." } } }));
      return;
    }
    const { data, error } = await supabase.functions.invoke("trigger-scraper", {
      body: { issuerSlug, force },
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
    for (const issuer of ISSUERS) {
      await triggerScraper(issuer);
    }
    setTriggeringAll(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Scrapers</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Dispara scrapers por emisor vía GitHub Actions. El workflow puede tardar 5–15 minutos.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label
            className="flex cursor-pointer items-center gap-2 text-sm text-gray-600"
            title="Ignora el hash de contenido y fuerza re-scraping aunque la página no haya cambiado"
          >
            <input
              checked={force}
              className="h-4 w-4 rounded border-gray-300 text-teal-600"
              onChange={(e) => setForce(e.target.checked)}
              type="checkbox"
            />
            --force
          </label>
          <button
            className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
            disabled={triggeringAll}
            onClick={triggerAll}
            title="Dispara el scraper de todos los emisores en secuencia"
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
              <th className="px-4 py-3 font-medium text-gray-600">Último run</th>
              <th className="px-4 py-3 font-medium text-gray-600">Estado</th>
              <th className="px-4 py-3 font-medium text-gray-600">Encontrados</th>
              <th className="px-4 py-3 font-medium text-gray-600">Insertados</th>
              <th className="px-4 py-3 font-medium text-gray-600">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {ISSUERS.map((issuer) => {
              const run = lastRuns[issuer];
              const state = runStates[issuer];
              return (
                <tr key={issuer} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{issuer}</td>
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
                        onClick={() => triggerScraper(issuer)}
                        title={`Ejecuta scrapers/${issuer}.py --live --write en GitHub Actions`}
                        type="button"
                      >
                        {state?.loading ? "Disparando..." : "Correr scraper"}
                      </button>
                      {state?.result?.triggered && (
                        <a
                          className="text-xs text-teal-600 underline"
                          href={state.result.runUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Ver en GitHub Actions →
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
