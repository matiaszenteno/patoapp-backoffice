import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type UserStats = {
  total: number;
  active_7d: number;
  active_30d: number;
  new_7d: number;
  notifications_enabled: number;
};

type BenefitStats = {
  published: number;
  needs_review: number;
  failed: number;
  pending: number;
};

type ScraperRun = {
  issuer_slug: string;
  status: string;
  started_at: string;
  finished_at: string | null;
};

type NeedsReviewByIssuer = {
  issuer_slug: string;
  count: number;
};

type WeeklyEntry = {
  week: string;
  count: number;
};

type Metrics = {
  users: UserStats;
  benefits: BenefitStats;
  scraper_runs: ScraperRun[];
  weekly_users: WeeklyEntry[];
  needs_review_by_issuer: NeedsReviewByIssuer[];
};

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white px-5 py-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-1">{label}</p>
      <p className="text-3xl font-bold text-stone-900">{value}</p>
      {sub && <p className="text-xs text-stone-400 mt-1">{sub}</p>}
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  succeeded: "bg-emerald-100 text-emerald-700",
  success: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
  running: "bg-blue-100 text-blue-700",
  pending: "bg-amber-100 text-amber-700",
};

const STATUS_LABELS: Record<string, string> = {
  succeeded: "Exitoso",
  success: "Exitoso",
  failed: "Con error",
  running: "En curso",
  pending: "Pendiente",
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" });
}

function pct(value: number, total: number) {
  if (!total) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

export function Metricas() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc("get_platform_metrics").then(({ data, error: err }) => {
      if (err) { setError(err.message); setLoading(false); return; }
      setMetrics(data as Metrics);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-stone-400">
        Cargando métricas…
      </div>
    );
  }

  if (error || !metrics) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-stone-500">
        Error: {error ?? "Sin datos"}
      </div>
    );
  }

  const { users, benefits, scraper_runs, weekly_users, needs_review_by_issuer } = metrics;
  const weeklyList = weekly_users ?? [];
  const maxWeekCount = Math.max(...weeklyList.map((w) => w.count), 1);
  const totalBenefits = benefits.published + benefits.needs_review + benefits.failed + benefits.pending || 1;

  return (
    <div className="overflow-y-auto h-full">
      <div className="max-w-5xl mx-auto px-6 py-8 flex flex-col gap-8">

        <div>
          <h1 className="text-xl font-bold text-stone-900">Métricas</h1>
          <p className="mt-0.5 text-sm text-stone-500">Resumen del estado de la plataforma.</p>
        </div>

        {/* ── Usuarios ── */}
        <section className="flex flex-col gap-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-400">Usuarios</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Registrados" value={users.total} />
            <StatCard
              label="Activos 7 días"
              value={users.active_7d}
              sub={`${pct(users.active_7d, users.total)} del total`}
            />
            <StatCard
              label="Activos 30 días"
              value={users.active_30d}
              sub={`${pct(users.active_30d, users.total)} del total`}
            />
            <StatCard label="Nuevos esta semana" value={users.new_7d} />
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard
              label="Con notificaciones"
              value={users.notifications_enabled}
              sub={`${pct(users.notifications_enabled, users.total)} del total`}
            />
          </div>

          {weeklyList.length > 0 && (
            <div className="rounded-xl border border-stone-200 bg-white px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-4">
                Nuevos usuarios por semana
              </p>
              <div className="flex items-end gap-2 h-24">
                {weeklyList.map(({ week, count }) => (
                  <div key={week} className="flex flex-col items-center gap-1 flex-1">
                    <span className="text-[10px] text-stone-400">{count}</span>
                    <div
                      className="w-full rounded-sm bg-stone-800"
                      style={{ height: `${Math.round((count / maxWeekCount) * 72)}px`, minHeight: 4 }}
                    />
                    <span className="text-[9px] text-stone-400 truncate w-full text-center">
                      {new Date(week + "T12:00:00").toLocaleDateString("es-CL", { day: "numeric", month: "short" })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ── Beneficios ── */}
        <section className="flex flex-col gap-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-400">Beneficios</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Publicados" value={benefits.published} />
            <StatCard label="En revisión" value={benefits.needs_review} />
            <StatCard label="Fallidos" value={benefits.failed} />
            <StatCard label="Pendientes" value={benefits.pending} />
          </div>

          <div className="rounded-xl border border-stone-200 bg-white px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-3">
              Distribución del pipeline
            </p>
            {[
              { label: "Publicados", value: benefits.published, color: "bg-emerald-500" },
              { label: "En revisión", value: benefits.needs_review, color: "bg-amber-400" },
              { label: "Fallidos", value: benefits.failed, color: "bg-red-400" },
              { label: "Pendientes", value: benefits.pending, color: "bg-stone-300" },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex items-center gap-3 mb-2">
                <span className="text-xs text-stone-500 w-24 shrink-0">{label}</span>
                <div className="flex-1 h-2 bg-stone-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${color}`}
                    style={{ width: `${(value / totalBenefits) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-stone-400 w-10 text-right">{value}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Pendientes de revisión por emisor ── */}
        {needs_review_by_issuer?.length > 0 && (
          <section className="flex flex-col gap-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-400">
              Pendientes de revisión por emisor
            </h2>
            <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-100 bg-stone-50 text-left">
                    <th className="px-4 py-3 text-xs font-medium text-stone-500">Emisor</th>
                    <th className="px-4 py-3 text-xs font-medium text-stone-500">Beneficios por revisar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {needs_review_by_issuer.map((row) => (
                    <tr key={row.issuer_slug} className="hover:bg-stone-50">
                      <td className="px-4 py-3 font-medium text-stone-800">{row.issuer_slug}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-xs font-medium">
                          {row.count}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ── Scrapers ── */}
        {scraper_runs?.length > 0 && (
          <section className="flex flex-col gap-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-400">
              Última ejecución de scrapers
            </h2>
            <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-100 bg-stone-50 text-left">
                    <th className="px-4 py-3 text-xs font-medium text-stone-500">Emisor</th>
                    <th className="px-4 py-3 text-xs font-medium text-stone-500">Estado</th>
                    <th className="px-4 py-3 text-xs font-medium text-stone-500">Última ejecución</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {scraper_runs.map((run) => (
                    <tr key={run.issuer_slug} className="hover:bg-stone-50">
                      <td className="px-4 py-3 font-medium text-stone-800">{run.issuer_slug}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[run.status] ?? "bg-stone-100 text-stone-500"}`}>
                          {STATUS_LABELS[run.status] ?? run.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-stone-400">{formatDate(run.started_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

      </div>
    </div>
  );
}
