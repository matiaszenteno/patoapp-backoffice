import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

type RawRow = {
  id: string;
  issuer_slug: string | null;
  source_url: string | null;
  raw_payload: Record<string, unknown> | null;
  scraped_at: string | null;
  benefit_id: string | null;
};

export function Review() {
  const [rows, setRows] = useState<RawRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [updating, setUpdating] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from("scraped_benefits_raw")
      .select("id, issuer_slug, source_url, raw_payload, scraped_at, benefit_id")
      .eq("processing_status", "needs_review")
      .order("scraped_at", { ascending: false });

    setLoading(false);
    if (fetchError) {
      setError(fetchError.message);
      return;
    }
    setRows((data ?? []) as RawRow[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const markAs = async (id: string, status: "published" | "failed") => {
    setUpdating(id);
    const { error: updateError } = await supabase
      .from("scraped_benefits_raw")
      .update({ processing_status: status })
      .eq("id", id);
    setUpdating(null);
    if (updateError) {
      setError(updateError.message);
    } else {
      setRows((prev) => prev.filter((r) => r.id !== id));
    }
  };

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  if (loading) return <p className="text-gray-400">Cargando...</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900">
          Revisión
          {rows.length > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-sm font-medium text-amber-700">
              {rows.length}
            </span>
          )}
        </h1>
      </div>

      {error ? (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          <strong>Error:</strong> {error}
        </div>
      ) : null}

      {!error && rows.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-12 text-center text-gray-400">
          Sin beneficios por revisar
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        {rows.map((row) => {
          const payload = row.raw_payload ?? {};
          const title = String(payload.title ?? payload.name ?? row.source_url ?? row.id);
          const description = payload.description_raw ?? payload.description ?? null;
          const isExpanded = expanded.has(row.id);
          const isBusy = updating === row.id;

          return (
            <div className="rounded-xl border border-amber-200 bg-white" key={row.id}>
              <div className="flex items-start justify-between gap-4 px-4 py-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="line-clamp-2 font-medium text-gray-900">{title}</p>
                  {description ? (
                    <p className="line-clamp-2 text-sm text-gray-500">{String(description)}</p>
                  ) : null}
                  <div className="flex flex-wrap gap-3 text-xs text-gray-400">
                    {row.issuer_slug ? <span className="font-medium text-gray-600">{row.issuer_slug}</span> : null}
                    {row.scraped_at ? <span>{row.scraped_at.substring(0, 10)}</span> : null}
                    {row.source_url ? (
                      <a
                        className="max-w-xs truncate text-teal-600 hover:underline"
                        href={row.source_url}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {row.source_url}
                      </a>
                    ) : null}
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap justify-end gap-2">
                  {row.benefit_id ? (
                    <button
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      onClick={() => navigate(`/benefits/${row.benefit_id}`)}
                      type="button"
                    >
                      Ver beneficio
                    </button>
                  ) : null}
                  <button
                    className="rounded-lg border border-teal-200 px-3 py-1.5 text-xs font-medium text-teal-700 hover:bg-teal-50 disabled:opacity-60"
                    disabled={isBusy}
                    onClick={() => markAs(row.id, "published")}
                    type="button"
                  >
                    Publicar
                  </button>
                  <button
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                    disabled={isBusy}
                    onClick={() => markAs(row.id, "failed")}
                    type="button"
                  >
                    Descartar
                  </button>
                  <button
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50"
                    onClick={() => toggleExpanded(row.id)}
                    type="button"
                  >
                    {isExpanded ? "Ocultar" : "Ver datos"}
                  </button>
                </div>
              </div>

              {isExpanded ? (
                <div className="border-t border-amber-100 px-4 py-3">
                  <pre className="max-h-80 overflow-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-700">
                    {JSON.stringify(payload, null, 2)}
                  </pre>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
