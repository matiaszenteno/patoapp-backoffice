import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useIssuers } from "../lib/useIssuers";

type Reconciliation = {
  benefit_id: string;
  issuer_slug: string;
  merchant_name: string;
  title: string;
  raw_status: string | null;
  last_seen_at: string | null;
  days_since_seen: number | null;
  issuer_last_scrape_run_id: string | null;
  issuer_last_scrape_at: string | null;
  issuer_last_scrape_finished_at: string | null;
  issuer_last_scrape_status: string | null;
  came_in_last_run: boolean | null;
  raw_match: boolean | null;
  raw_drift_fields: string[] | null;
  published_gap_fields: string[] | null;
  raw_address_count: number | null;
  published_address_count: number | null;
  address_match: boolean | null;
  missing_published_addresses: string[] | null;
  extra_published_addresses: string[] | null;
  verdict: string;
};

type Page = { total: number; rows: Reconciliation[] };
type Summary = {
  total: number;
  healthy: number;
  issues: number;
  health_percentage: number;
  present_in_last_run: number;
  raw_matches: number;
  address_matches: number;
  published_gaps: number;
  verdicts: Record<string, number>;
};

const PAGE_SIZE = 100;
const VERDICTS = ["raw_missing", "no_completed_run", "absent_from_last_run", "raw_drift", "location_drift", "ok"];
const LABELS: Record<string, string> = {
  ok: "Perfecto",
  raw_missing: "Sin raw vinculado",
  no_completed_run: "Sin corrida terminada",
  absent_from_last_run: "Ausente de la última corrida",
  raw_drift: "Datos distintos",
  location_drift: "Direcciones distintas",
};

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" }) : "—";
}

function Badge({ verdict }: { verdict: string }) {
  const cls = verdict === "ok" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200";
  return <span className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium ${cls}`}>{LABELS[verdict] ?? verdict}</span>;
}

function Fields({ label, fields }: { label: string; fields: string[] | null }) {
  if (!fields?.length) return null;
  return <div><p className="text-xs font-semibold uppercase tracking-wide text-stone-400">{label}</p><p className="mt-1 text-sm text-stone-700">{fields.join(", ")}</p></div>;
}

function Addresses({ label, addresses }: { label: string; addresses: string[] | null }) {
  if (!addresses?.length) return null;
  return <div><p className="text-xs font-semibold uppercase tracking-wide text-stone-400">{label}</p><ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-stone-700">{addresses.map((address) => <li key={address}>{address}</li>)}</ul></div>;
}

function Detail({ row, onClose }: { row: Reconciliation; onClose: () => void }) {
  const navigate = useNavigate();
  return <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
    <div className="absolute inset-0 bg-stone-900/20" />
    <aside className="relative z-50 flex h-full w-full max-w-md flex-col gap-5 overflow-y-auto border-l border-stone-200 bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-start justify-between gap-4"><div><p className="text-xs text-stone-400">{row.issuer_slug}</p><h2 className="text-base font-semibold text-stone-900">{row.merchant_name}</h2><p className="text-sm text-stone-500">{row.title}</p></div><button className="text-sm text-stone-500 hover:text-stone-900" onClick={onClose} type="button">Cerrar</button></div>
      <Badge verdict={row.verdict} />
      {row.published_gap_fields?.length ? <div className="rounded-md border border-amber-200 bg-amber-50 p-3"><p className="text-sm font-medium text-amber-800">Datos que trajo el scraper y faltan publicados</p><p className="mt-1 text-sm text-amber-700">{row.published_gap_fields.join(", ")}</p></div> : null}
      <Fields label="Datos distintos del raw" fields={row.raw_drift_fields} />
      <Addresses label="Direcciones que faltan publicar" addresses={row.missing_published_addresses} />
      <Addresses label="Direcciones publicadas que sobran" addresses={row.extra_published_addresses} />
      <div className="grid grid-cols-2 gap-4 text-sm"><div><p className="text-xs text-stone-400">Estado del raw</p><p>{row.raw_status ?? "—"} <span className="text-stone-400">(informativo)</span></p></div><div><p className="text-xs text-stone-400">Última vez visto</p><p>{formatDate(row.last_seen_at)}</p></div><div><p className="text-xs text-stone-400">Último scrape terminado</p><p>{row.issuer_last_scrape_status ?? "—"}</p><p className="text-xs text-stone-400">{formatDate(row.issuer_last_scrape_finished_at)}</p></div><div><p className="text-xs text-stone-400">Vino en esa corrida</p><p>{row.came_in_last_run === null ? "No evaluable" : row.came_in_last_run ? "Sí" : "No"}</p></div><div><p className="text-xs text-stone-400">Datos crudos</p><p>{row.raw_match === null ? "No evaluable" : row.raw_match ? "Coinciden" : "Distintos"}</p></div><div><p className="text-xs text-stone-400">Direcciones</p><p>{row.address_match === null ? "No evaluable" : row.address_match ? "Coinciden" : "Distintas"} · {row.raw_address_count ?? "—"} scraper / {row.published_address_count ?? "—"} publicadas</p></div></div>
      <button className="mt-auto rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800" onClick={() => navigate(`/benefits/${row.benefit_id}`)} type="button">Abrir beneficio</button>
    </aside>
  </div>;
}

export function SaludBeneficios() {
  const { issuers } = useIssuers();
  const [issuer, setIssuer] = useState("");
  const [onlyIssues, setOnlyIssues] = useState(true);
  const [verdicts, setVerdicts] = useState<string[]>([]);
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<Page | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [selected, setSelected] = useState<Reconciliation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true); setError(null);
    const args = { p_issuer_slug: issuer || null, p_verdicts: verdicts.length ? verdicts : null, p_only_issues: onlyIssues, p_limit: PAGE_SIZE, p_offset: offset };
    const [pageRes, summaryRes] = await Promise.all([supabase.rpc("get_benefit_scrape_reconciliation", args), supabase.rpc("get_benefit_scrape_reconciliation_summary", { p_issuer_slug: issuer || null })]);
    if (currentRequest !== requestId.current) return;
    if (pageRes.error || summaryRes.error) setError(pageRes.error?.message ?? summaryRes.error?.message ?? "No se pudo cargar la salud.");
    else { setPage(pageRes.data as Page); setSummary(summaryRes.data as Summary); }
    setLoading(false);
  }, [issuer, offset, onlyIssues, verdicts]);

  useEffect(() => { void load(); }, [load]);
  const resetPage = () => { requestId.current += 1; setOffset(0); setSelected(null); };
  const toggle = (verdict: string) => {
    resetPage();
    setVerdicts((current) => current.includes(verdict) ? current.filter((item) => item !== verdict) : [...current, verdict]);
  };
  const copyInvestigationPrompt = async () => {
    const issues = (page?.rows ?? []).filter((row) => row.verdict !== "ok");
    const examples = issues.slice(0, 25).map((row) => {
      const raw = row.raw_drift_fields?.join(", ") || "—";
      const missing = row.missing_published_addresses?.length ?? 0;
      const extra = row.extra_published_addresses?.length ?? 0;
      return `- ${row.issuer_slug} | ${row.merchant_name} | ${row.title} | verdict=${row.verdict} | raw_fields=${raw} | locations_missing=${missing} | locations_extra=${extra}`;
    }).join("\n") || "- No hay problemas en los resultados visibles.";
    const prompt = `Investiga la salud de beneficios detectada por benefit_scrape_reconciliation en Patoapp y arma un plan concreto para llegar a 100%.\n\nContrato de salud: cada beneficio activo debe aparecer en la última corrida de scraper terminada, sus campos directos del raw deben coincidir con benefits y el set normalizado de benefit_locations debe ser exactamente el mismo que trajo el scraper. processing_status, drafts, provenance, reglas, parser e IA no forman parte del score.\n\nContexto del filtro: emisor=${issuer || "todos"}; solo problemas=${onlyIssues ? "sí" : "no"}; veredictos=${verdicts.length ? verdicts.join(", ") : "todos"}.\nResumen: ${summary?.healthy ?? 0}/${summary?.total ?? 0} perfectos (${summary?.health_percentage ?? 0}%); ${summary?.present_in_last_run ?? 0} presentes; ${summary?.raw_matches ?? 0} con raw coincidente; ${summary?.address_matches ?? 0} con direcciones exactas.\n\nCasos visibles:\n${examples}\n\n1. Para ausentes, verifica el run_id de la última corrida terminada y por qué el scraper no los releyó.\n2. Para raw_drift, traza solo los campos listados entre scraped_benefits_raw y benefits; no investigues reglas ni datos post-pipeline.\n3. Para location_drift, compara las direcciones faltantes y sobrantes con merchant_addresses, merchant_location_candidates y benefit_locations.\n4. Agrupa por causa raíz, cuantifica impacto y propone un plan seguro con validaciones y criterio de cierre verificable. No ejecutes acciones mutantes sin confirmar primero el alcance.`;
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return <div className="h-full overflow-y-auto px-8 py-8"><div className="mx-auto max-w-7xl">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-lg font-semibold text-stone-900">Salud de beneficios</h1><p className="mt-0.5 text-sm text-stone-500">Beneficios publicados versus la última corrida de scraper terminada: presencia, datos crudos y direcciones exactas.</p></div><div className="flex gap-2"><button className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50" disabled={!page || loading} onClick={() => void copyInvestigationPrompt()} type="button">{copied ? "Prompt copiado" : "Copiar prompt de investigación"}</button><button className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50" disabled={loading} onClick={() => void load()} type="button">{loading ? "Cargando…" : "Refrescar"}</button></div></div>
    <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5"><div className="rounded-lg border border-stone-200 bg-white p-4"><p className="text-xs text-stone-400">Activos auditados</p><p className="text-2xl font-semibold">{summary?.total ?? "—"}</p></div><div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4"><p className="text-xs text-emerald-700">Perfectos</p><p className="text-2xl font-semibold text-emerald-800">{summary?.healthy ?? "—"}</p><p className="text-xs text-emerald-700">{summary ? `${summary.health_percentage}%` : "—"}</p></div><div className="rounded-lg border border-stone-200 bg-white p-4"><p className="text-xs text-stone-400">Presentes última corrida</p><p className="text-2xl font-semibold">{summary?.present_in_last_run ?? "—"}</p></div><div className="rounded-lg border border-stone-200 bg-white p-4"><p className="text-xs text-stone-400">Datos crudos iguales</p><p className="text-2xl font-semibold">{summary?.raw_matches ?? "—"}</p></div><div className="rounded-lg border border-stone-200 bg-white p-4"><p className="text-xs text-stone-400">Direcciones exactas</p><p className="text-2xl font-semibold">{summary?.address_matches ?? "—"}</p></div></div>
    <div className="mb-4 flex flex-wrap items-center gap-3"><select className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm" onChange={(e) => { resetPage(); setIssuer(e.target.value); }} value={issuer}><option value="">Todos los emisores</option>{issuers.map((i) => <option key={i.slug} value={i.slug}>{i.name}</option>)}</select><label className="flex items-center gap-2 text-sm text-stone-600"><input checked={onlyIssues} className="accent-stone-900" onChange={(e) => { resetPage(); setOnlyIssues(e.target.checked); }} type="checkbox" />Ocultar OK</label></div>
    <div className="mb-4 flex flex-wrap gap-2">{VERDICTS.map((v) => <button className={`rounded-full border px-3 py-1 text-xs ${verdicts.includes(v) ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white text-stone-600"}`} key={v} onClick={() => toggle(v)} type="button">{LABELS[v] ?? v} {summary?.verdicts?.[v] ? `(${summary.verdicts[v]})` : ""}</button>)}</div>
    {error ? <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
    <div className="overflow-hidden rounded-lg border border-stone-200 bg-white"><table className="w-full text-sm"><thead><tr className="border-b border-stone-100 bg-stone-50 text-left"><th className="px-4 py-3 text-xs text-stone-400">Emisor</th><th className="px-4 py-3 text-xs text-stone-400">Beneficio</th><th className="px-4 py-3 text-xs text-stone-400">Estado</th><th className="px-4 py-3 text-xs text-stone-400">Visto</th></tr></thead><tbody className="divide-y divide-stone-100">{page?.rows.map((row) => <tr className="cursor-pointer hover:bg-stone-50" key={row.benefit_id} onClick={() => setSelected(row)}><td className="px-4 py-3 text-stone-500">{row.issuer_slug}</td><td className="px-4 py-3"><p className="font-medium text-stone-800">{row.merchant_name}</p><p className="max-w-md truncate text-xs text-stone-400">{row.title}</p>{row.published_gap_fields?.length ? <p className="mt-1 text-xs text-amber-700">Brecha: {row.published_gap_fields.join(", ")}</p> : null}</td><td className="px-4 py-3"><Badge verdict={row.verdict} /></td><td className="px-4 py-3 whitespace-nowrap text-stone-500">{formatDate(row.last_seen_at)}</td></tr>)}{!loading && !page?.rows.length ? <tr><td className="px-4 py-8 text-center text-stone-400" colSpan={4}>Sin beneficios para estos filtros.</td></tr> : null}</tbody></table></div>
    {page ? <div className="mt-3 flex items-center justify-between gap-3 text-xs text-stone-400"><p>Mostrando {page.rows.length ? offset + 1 : 0}–{offset + page.rows.length} de {page.total}.</p><div className="flex gap-2"><button className="rounded border border-stone-300 bg-white px-3 py-1 text-stone-600 hover:bg-stone-50 disabled:opacity-50" disabled={loading || offset === 0} onClick={() => { setSelected(null); setOffset((current) => Math.max(0, current - PAGE_SIZE)); }} type="button">Anterior</button><button className="rounded border border-stone-300 bg-white px-3 py-1 text-stone-600 hover:bg-stone-50 disabled:opacity-50" disabled={loading || offset + page.rows.length >= page.total} onClick={() => { setSelected(null); setOffset((current) => current + PAGE_SIZE); }} type="button">Siguiente</button></div></div> : null}
    {selected ? <Detail onClose={() => setSelected(null)} row={selected} /> : null}
  </div></div>;
}
