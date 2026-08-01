import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { BenefitRest, InternalNote } from "../components/classification/BenefitRest";
import { labelsForFields, ReviewBlock } from "../components/classification/ReviewBlock";
import { SourcePanel } from "../components/classification/SourcePanel";
import { getFreshAccessToken } from "../lib/auth";
import {
  buildCorrectionFields,
  correctionForDraft,
  formFromDraft,
  isCorrectionStale,
  type FormState,
  type IngestionDraft,
} from "../lib/classification/draft";
import { getPrimaryAction, getReviewTask, type ReviewTask } from "../lib/classification/task";
import { BLOCKER_LABELS } from "../lib/classification/vocabulary";
import {
  buildCorrectionReprocessBody,
  type CorrectionReprocessResponse,
  getChangedCorrectionFields,
  getFunctionErrorMessage,
  getReprocessFailureMessage,
} from "../lib/correctionReprocess";
import { supabase } from "../lib/supabase";
import { useIssuers } from "../lib/useIssuers";

// ─── Types ────────────────────────────────────────────────────────────────────

type RawRow = {
  benefit_id: string | null;
  id: string;
  issuer_slug: string | null;
  processing_status: string | null;
  publication_blockers: string[] | null;
  raw_payload: Record<string, unknown> | null;
  run_id: string | null;
  scraped_at: string | null;
  source_url: string | null;
};

type CardData = {
  blockers: string[];
  correctionBaseContentHash: string | null;
  correctionBaseSchemaVersion: string | null;
  draft: IngestionDraft | null;
  existingCorrection: Record<string, unknown> | null;
  /** La lectura falló (red, RLS, timeout). Distinto de "no hay draft": acá no sabemos
   *  si existe, así que no podemos afirmar que el pipeline no lo procesó. */
  loadError: string | null;
  /** El schema del draft es más nuevo que el que este cliente sabe leer. */
  unsupported: boolean;
};

const SUPPORTED_DRAFT_SCHEMA = "2026-07-draft-v1";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short" })
    .format(new Date(value));
}

async function triggerRawReprocess(
  body: NonNullable<ReturnType<typeof buildCorrectionReprocessBody>>,
  token: string,
) {
  const { data, error } = await supabase.functions.invoke("run-reprocess", {
    body,
    headers: { Authorization: `Bearer ${token}` },
  });
  const response = (data ?? null) as CorrectionReprocessResponse | null;
  if (error) {
    throw new Error(response?.error
      ? getReprocessFailureMessage(response, response.error)
      : await getFunctionErrorMessage(error));
  }
  if (response?.triggered !== true) {
    throw new Error(getReprocessFailureMessage(
      response,
      "El servicio no confirmó que el beneficio se está reprocesando.",
    ));
  }
  return response;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function Clasificacion() {
  const [searchParams] = useSearchParams();
  const rawParam = searchParams.get("raw");
  const { issuers } = useIssuers();
  const [rows, setRows] = useState<RawRow[]>([]);
  const [statusFilters, setStatusFilters] = useState<string[]>(["needs_review", "failed"]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cardData, setCardData] = useState<Record<string, CardData>>({});
  const [loadingCards, setLoadingCards] = useState<Set<string>>(new Set());
  const [formValues, setFormValues] = useState<Record<string, FormState>>({});
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [ignoring, setIgnoring] = useState<Set<string>>(new Set());
  const [saveResult, setSaveResult] = useState<Record<string, { msg: string; ok: boolean }>>({});
  const [savedToast, setSavedToast] = useState<
    { merchant: string; requestId?: string; runUrl?: string } | null
  >(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [userIdentifier, setUserIdentifier] = useState<string | null>(null);

  useEffect(() => {
    if (!rawParam && statusFilters.length === 0) {
      setRows([]);
      setPageLoading(false);
      return;
    }
    setPageLoading(true);
    const select = "id, issuer_slug, source_url, raw_payload, scraped_at, processing_status, benefit_id, run_id, publication_blockers";
    const rowsQuery = rawParam
      ? supabase.from("scraped_benefits_raw").select(select).eq("id", rawParam)
      // Se filtra por processing_status, no por el inner join a draft_status que trajo
      // #35: este rediseño quiere que los raws sin draft aparezcan en la cola con un
      // estado vacío honesto en vez de desaparecer sin explicación. Ver la sección
      // "Borrado del camino legacy" del design doc.
      : supabase.from("scraped_benefits_raw").select(select)
        .in("processing_status", statusFilters)
        .order("scraped_at", { ascending: false });

    Promise.all([supabase.auth.getSession(), rowsQuery]).then(
      ([{ data: sessionData }, { data: rowData, error }]) => {
        setUserIdentifier(sessionData.session?.user.email ?? sessionData.session?.user.id ?? null);
        if (error) setPageError(error.message);
        else setRows((rowData ?? []) as RawRow[]);
        setPageLoading(false);
      },
    );
  }, [statusFilters, rawParam]);

  useEffect(() => {
    if (rows.length > 0 && !selectedId) {
      setSelectedId(rows[0].id);
      loadCardData(rows[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const loadCardData = async (row: RawRow) => {
    setLoadingCards((prev) => new Set(prev).add(row.id));

    try {
      const [correctionRes, draftRes] = await Promise.all([
        supabase.from("raw_benefit_corrections").select("*").eq("raw_benefit_id", row.id).maybeSingle(),
        supabase.from("benefit_ingestion_drafts")
          .select("raw_benefit_id, run_id, benefit_id, source_content_hash, schema_version, normalized_version, draft_status, draft, field_provenance, publication_blockers, updated_at")
          .eq("raw_benefit_id", row.id)
          .maybeSingle(),
      ]);

      if (draftRes.error) {
        throw new Error(`No se pudo leer el draft: ${draftRes.error.message}`);
      }

      const draft = draftRes.data as IngestionDraft | null;
      const unsupported = !!draft && draft.schema_version !== SUPPORTED_DRAFT_SCHEMA;
      const existing = (correctionRes.data?.corrected_fields as Record<string, unknown> | null) ?? null;
      const note = (correctionRes.data?.note as string | null) ?? null;
      const baseContentHash = (correctionRes.data?.base_content_hash as string | null) ?? null;
      const baseSchemaVersion = (correctionRes.data?.base_draft_schema_version as string | null) ?? null;

      setCardData((prev) => ({
        ...prev,
        [row.id]: {
          blockers: draft?.publication_blockers ?? row.publication_blockers ?? [],
          correctionBaseContentHash: baseContentHash,
          correctionBaseSchemaVersion: baseSchemaVersion,
          draft,
          existingCorrection: existing,
          loadError: null,
          unsupported,
        },
      }));

      if (draft && !unsupported) {
        const applicable = correctionForDraft(existing, baseContentHash, baseSchemaVersion, draft);
        setFormValues((prev) => ({ ...prev, [row.id]: formFromDraft(draft.draft, applicable, note) }));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Sin esto la ficha queda undefined y el render la confunde con "no hay draft",
      // afirmándole al operador que el pipeline nunca procesó el raw cuando en realidad
      // fue un error de lectura recuperable.
      setCardData((prev) => ({
        ...prev,
        [row.id]: {
          blockers: row.publication_blockers ?? [],
          correctionBaseContentHash: null,
          correctionBaseSchemaVersion: null,
          draft: null,
          existingCorrection: null,
          loadError: msg,
          unsupported: false,
        },
      }));
      setSaveResult((prev) => ({ ...prev, [row.id]: { msg, ok: false } }));
    } finally {
      setLoadingCards((prev) => { const s = new Set(prev); s.delete(row.id); return s; });
    }
  };

  const handleSelect = (row: RawRow) => {
    setSelectedId(row.id);
    if (!cardData[row.id]) loadCardData(row);
  };

  const removeFromQueue = (rawId: string) => {
    const idx = rows.findIndex((r) => r.id === rawId);
    const nextRow = rows[idx + 1] ?? rows[idx - 1] ?? null;
    setRows((prev) => prev.filter((row) => row.id !== rawId));
    setSelectedId(nextRow?.id ?? null);
    if (nextRow && !cardData[nextRow.id]) loadCardData(nextRow);
  };

  const setField = <K extends keyof FormState>(rawId: string, field: K, val: FormState[K]) => {
    setFormValues((prev) => ({ ...prev, [rawId]: { ...prev[rawId], [field]: val } }));
  };

  const handleIgnoreRaw = async (row: RawRow) => {
    if (row.processing_status === "ignored") return;
    if (!window.confirm("¿Descartar este raw? Se marcará como no-beneficio y saldrá de la cola.")) return;

    setIgnoring((prev) => new Set(prev).add(row.id));
    // Descartar escribe dos tablas (benefit_ingestion_drafts.draft_status + el mirror
    // processing_status/publication_blockers en scraped_benefits_raw). Va por RPC para
    // que sea atómico: desde acá serían dos requests y un fallo entremedio dejaría el
    // draft y el raw en desacuerdo. El RPC además rechaza los raws que todavía no
    // tienen draft canónico — sin draft, el backfill del pipeline lo crea en
    // 'needs_review' y pisa el 'ignored', o sea el descarte se deshace solo. Ese error
    // cae en el branch de abajo y el operador lo ve.
    const { error } = await supabase.rpc("mark_ingestion_draft_ignored", { p_raw_benefit_id: row.id });
    setIgnoring((prev) => { const s = new Set(prev); s.delete(row.id); return s; });

    if (error) {
      setSaveResult((prev) => ({ ...prev, [row.id]: { msg: `No se pudo descartar: ${error.message}`, ok: false } }));
      return;
    }

    setSaveResult((prev) => ({ ...prev, [row.id]: { msg: "Raw descartado.", ok: true } }));
    if (statusFilters.includes("ignored")) {
      setRows((prev) => prev.map((current) => current.id === row.id
        ? { ...current, processing_status: "ignored", publication_blockers: [] }
        : current));
    } else {
      removeFromQueue(row.id);
    }
  };

  const handleSave = async (rawId: string, task: ReviewTask) => {
    setSavedToast(null);
    const data = cardData[rawId];
    const vals = formValues[rawId];
    const draft = data?.draft;

    if (!vals || !draft) {
      setSaveResult((prev) => ({
        ...prev,
        [rawId]: { msg: "Datos todavía no disponibles. Esperá a que cargue la ficha.", ok: false },
      }));
      return;
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const correctedBy = sessionData.session?.user.email ?? sessionData.session?.user.id ?? userIdentifier;
      if (!correctedBy) {
        setSaveResult((prev) => ({ ...prev, [rawId]: { msg: "Sesión no disponible. Recargá la página.", ok: false } }));
        return;
      }

      // Un vencido se desbloquea corrigiendo la vigencia, no declarándolo revisado: marcar
      // needs_review=false ahí resolvería una revisión que nadie pidió.
      const cf = buildCorrectionFields({
        blockers: data.blockers,
        confirmReview: task.confirmsReview,
        draft,
        vals,
      });

      setSaving((prev) => new Set(prev).add(rawId));
      const { data: savedCorrection, error } = await supabase
        .from("raw_benefit_corrections")
        .upsert(
          {
            base_content_hash: draft.source_content_hash,
            base_draft_schema_version: draft.schema_version,
            base_draft_updated_at: draft.updated_at,
            corrected_by: correctedBy,
            corrected_fields: cf,
            note: vals.note.trim() || null,
            raw_benefit_id: rawId,
          },
          { onConflict: "raw_benefit_id" },
        )
        .select("corrected_fields")
        .single();

      if (error) {
        setSaving((prev) => { const s = new Set(prev); s.delete(rawId); return s; });
        setSaveResult((prev) => ({ ...prev, [rawId]: { msg: error.message, ok: false } }));
        return;
      }

      setSaveResult((prev) => ({ ...prev, [rawId]: { msg: "Guardado. Solicitando reproceso…", ok: true } }));

      const row = rows.find((r) => r.id === rawId);
      const savedFields = getChangedCorrectionFields(
        data.existingCorrection,
        savedCorrection.corrected_fields as Record<string, unknown>,
      );
      const body = buildCorrectionReprocessBody(rawId, savedFields, row?.processing_status === "published");
      if (!body) {
        setSaving((prev) => { const s = new Set(prev); s.delete(rawId); return s; });
        setSaveResult((prev) => ({
          ...prev,
          [rawId]: { msg: "Nota guardada. No cambió ningún campo, así que no se inició un reproceso.", ok: true },
        }));
        return;
      }

      const token = await getFreshAccessToken();
      if (!token) {
        setSaving((prev) => { const s = new Set(prev); s.delete(rawId); return s; });
        setSaveResult((prev) => ({ ...prev, [rawId]: { msg: "Sesión vencida. Recargá la página e intentá de nuevo.", ok: false } }));
        return;
      }

      const payload = row?.raw_payload ?? {};
      const merchant = String(
        payload.merchant_name ?? payload.merchant ?? payload.title ?? payload.name ?? row?.source_url ?? "beneficio",
      );

      try {
        const runData = await triggerRawReprocess(body, token);
        setSavedToast({ merchant, requestId: runData.requestId, runUrl: runData.runUrl });
        removeFromQueue(rawId);
      } catch (reprocessError) {
        setSaveResult((prev) => ({
          ...prev,
          [rawId]: {
            msg: `Corrección guardada, pero el reproceso falló: ${
              reprocessError instanceof Error ? reprocessError.message : String(reprocessError)
            }`,
            ok: false,
          },
        }));
      } finally {
        setSaving((prev) => { const s = new Set(prev); s.delete(rawId); return s; });
      }
    } catch (err) {
      setSaving((prev) => { const s = new Set(prev); s.delete(rawId); return s; });
      setSaveResult((prev) => ({
        ...prev,
        [rawId]: { msg: `Error inesperado: ${err instanceof Error ? err.message : String(err)}`, ok: false },
      }));
    }
  };

  // ─── Selected row derived state ─────────────────────────────────────────────

  const selectedRow = rows.find((r) => r.id === selectedId) ?? null;
  const data = selectedId ? cardData[selectedId] : null;
  const vals = selectedId ? formValues[selectedId] : null;
  const isLoadingCard = selectedId ? loadingCards.has(selectedId) : false;
  const isSaving = selectedId ? saving.has(selectedId) : false;
  const isIgnoring = selectedId ? ignoring.has(selectedId) : false;
  const result = selectedId ? saveResult[selectedId] : undefined;

  const provenance = data?.draft?.field_provenance;
  const task = getReviewTask(data?.blockers ?? [], provenance);
  const action = vals
    ? getPrimaryAction(task, vals, labelsForFields([...task.missingFields, "ends_at"]))
    : null;
  const canSave = !!vals && !!data?.draft && !data.unsupported && !action?.disabledReason;

  const payload = selectedRow?.raw_payload ?? {};
  const headerMerchant = String(
    data?.draft?.draft.merchant_name
    ?? payload.merchant_name
    ?? payload.merchant
    ?? payload.title
    ?? payload.name
    ?? selectedRow?.source_url
    ?? "",
  );
  const issuerNameBySlug = new Map(issuers.map((issuer) => [issuer.slug, issuer.name]));
  const staleCorrection = !!data?.draft && isCorrectionStale(
    data.correctionBaseContentHash,
    data.correctionBaseSchemaVersion,
    data.draft,
  );

  const onSave = () => {
    if (!selectedId) return;
    if (action?.needsConfirmation) {
      const ok = window.confirm(
        `Este beneficio está vencido. Vas a publicarlo con vigencia hasta ${
          vals?.ends_at || "—"
        }, y quedará visible para los usuarios de la app. ¿Continuar?`,
      );
      if (!ok) return;
    }
    handleSave(selectedId, task);
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full">

      {/* ── Cola ── */}
      <div className="flex w-64 shrink-0 flex-col overflow-hidden border-r border-stone-200 bg-stone-100">
        <div className="border-b border-stone-200 bg-stone-50 px-4 pb-3 pt-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">Cola</span>
            <span className="text-[11px] text-stone-400">{rows.length}</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {["needs_review", "failed", "ignored"].map((status) => (
              <button
                className={`rounded border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  statusFilters.includes(status)
                    ? "border-stone-900 bg-stone-900 text-white"
                    : "border-stone-200 text-stone-400 hover:border-stone-400"
                }`}
                key={status}
                onClick={() => setStatusFilters((prev) => prev.includes(status)
                  ? prev.filter((s) => s !== status)
                  : [...prev, status])}
                type="button"
              >
                {status === "needs_review" ? "review" : status}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {pageLoading && <p className="px-4 py-4 text-xs text-stone-400">Cargando…</p>}
          {pageError && <p className="px-4 py-4 text-xs text-stone-500">{pageError}</p>}
          {!pageLoading && !pageError && rows.length === 0 && (
            <p className="px-4 py-8 text-center text-xs text-stone-400">Sin beneficios por clasificar</p>
          )}
          {rows.map((row) => {
            const rowPayload = row.raw_payload ?? {};
            const rowMerchant = String(
              rowPayload.merchant_name ?? rowPayload.merchant ?? rowPayload.store_name
              ?? rowPayload.title ?? rowPayload.name ?? row.source_url ?? row.id,
            );
            const issuerName = row.issuer_slug
              ? issuerNameBySlug.get(row.issuer_slug) ?? row.issuer_slug
              : "";
            const rowBlockers = cardData[row.id]?.blockers.length
              ? cardData[row.id].blockers
              : row.publication_blockers ?? [];

            return (
              <div
                className={`cursor-pointer border-b border-stone-200 px-4 py-2.5 transition-colors ${
                  row.id === selectedId
                    ? "border-l-2 border-l-stone-500 bg-stone-200 pl-[14px]"
                    : "hover:bg-stone-200/50"
                }`}
                key={row.id}
                onClick={() => handleSelect(row)}
              >
                <div className="mb-0.5 flex items-baseline justify-between gap-2">
                  <span className={`truncate text-[12.5px] font-medium leading-snug ${
                    row.id === selectedId ? "text-stone-900" : "text-stone-700"
                  }`}>
                    {rowMerchant}
                  </span>
                  <span className="max-w-[86px] shrink-0 truncate text-right text-[10px] text-stone-400">
                    {issuerName}
                  </span>
                </div>
                {rowBlockers.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {rowBlockers.slice(0, 2).map((blocker) => (
                      <span
                        className="rounded border border-stone-200 bg-white px-1.5 py-0.5 text-[10px] font-medium leading-none text-stone-500"
                        key={blocker}
                      >
                        {BLOCKER_LABELS[blocker] ?? blocker}
                      </span>
                    ))}
                    {rowBlockers.length > 2 && (
                      <span className="rounded border border-stone-200 bg-white px-1.5 py-0.5 text-[10px] font-medium leading-none text-stone-400">
                        +{rowBlockers.length - 2}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── A revisar ── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-white">
        {savedToast && (
          <div className="flex shrink-0 items-center justify-between gap-4 border-b border-emerald-200 bg-emerald-50 px-8 py-2.5">
            <span className="text-sm font-medium text-emerald-800">
              ✓ <span className="font-semibold">{savedToast.merchant}</span> guardado — reproceso iniciado
              {savedToast.runUrl && (
                <> · <a className="underline" href={savedToast.runUrl} rel="noreferrer" target="_blank">Ver en GitHub Actions →</a></>
              )}
              {savedToast.requestId && <> · referencia <code>{savedToast.requestId}</code></>}
            </span>
            <button
              className="text-lg leading-none text-emerald-600 hover:text-emerald-800"
              onClick={() => setSavedToast(null)}
              type="button"
            >
              ×
            </button>
          </div>
        )}

        {!selectedRow ? (
          <div className="flex flex-1 items-center justify-center text-sm text-stone-300">
            Seleccioná un beneficio de la cola
          </div>
        ) : (
          <>
            <div className="shrink-0 border-b border-stone-200 px-8 pb-4 pt-5">
              <div className="mb-1.5 text-[11px] text-stone-400">Clasificación</div>
              <h2 className="mb-2 truncate text-[17px] font-semibold leading-snug text-stone-900">
                {headerMerchant}
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                {selectedRow.issuer_slug && (
                  <span className="rounded border border-stone-200 bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-500">
                    {selectedRow.issuer_slug}
                  </span>
                )}
                <span className="rounded border border-stone-200 bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-500">
                  {selectedRow.processing_status ?? "—"}
                </span>
                {selectedRow.scraped_at && (
                  <span className="text-[10px] text-stone-400">
                    scrapeado {formatDateTime(selectedRow.scraped_at)}
                  </span>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-8 py-5">
              {isLoadingCard ? (
                <p className="text-sm text-stone-400">Cargando datos…</p>
              ) : data?.loadError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                  <p className="text-sm font-medium text-red-800">
                    No se pudieron cargar los datos de este raw.
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-red-700">{data.loadError}</p>
                  <button
                    className="mt-2 text-xs font-medium text-red-800 underline"
                    onClick={() => loadCardData(selectedRow)}
                    type="button"
                  >
                    Reintentar
                  </button>
                </div>
              ) : !data?.draft ? (
                <div className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-3">
                  <p className="text-sm font-medium text-stone-800">
                    Este raw no fue procesado por el pipeline de drafts.
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-stone-500">
                    No hay un snapshot canónico que corregir, así que no se puede clasificar desde
                    acá. Podés revisar la entrada del scraper a la derecha. Tampoco se puede
                    descartar todavía: sin draft, el pipeline volvería a crearlo en revisión y el
                    descarte se desharía solo.
                  </p>
                </div>
              ) : data.unsupported ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  El draft usa el schema <code>{data.draft.schema_version}</code>, que esta versión
                  del backoffice no sabe leer. Actualizá el cliente antes de editar.
                </div>
              ) : vals ? (
                <>
                  {staleCorrection && (
                    <div className="mb-5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      Había una corrección guardada sobre una versión anterior de este raw. Se
                      conservaron sólo los campos que siguen siendo válidos.
                    </div>
                  )}

                  <ReviewBlock
                    blockers={data.blockers}
                    onChange={(field, val) => setField(selectedRow.id, field, val)}
                    provenance={provenance}
                    task={task}
                    vals={vals}
                  />

                  <BenefitRest
                    excluded={[...task.missingFields, ...task.doubtFields, ...(task.expired ? ["starts_at", "ends_at"] : [])]}
                    onChange={(field, val) => setField(selectedRow.id, field, val)}
                    provenance={provenance}
                    vals={vals}
                  />

                  <InternalNote
                    onChange={(value) => setField(selectedRow.id, "note", value)}
                    value={vals.note}
                  />
                </>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center justify-between gap-4 border-t border-stone-200 bg-white px-8 py-3">
              <div className="min-w-0 flex-1 text-xs">
                {result && !result.ok ? (
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 font-medium text-red-800">
                    {result.msg}
                  </span>
                ) : action?.disabledReason ? (
                  <span className="text-stone-500">{action.disabledReason}</span>
                ) : result?.ok ? (
                  <span className="text-stone-500">{result.msg}</span>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="rounded-md border border-red-200 px-4 py-1.5 text-sm font-medium text-red-700 transition-colors hover:border-red-300 hover:bg-red-50 disabled:opacity-40"
                  disabled={isSaving || isIgnoring || selectedRow.processing_status === "ignored"}
                  onClick={() => handleIgnoreRaw(selectedRow)}
                  type="button"
                >
                  {isIgnoring ? "Descartando…" : "Descartar"}
                </button>
                <button
                  className="rounded-md bg-stone-900 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-stone-800 disabled:opacity-50"
                  disabled={isSaving || isIgnoring || !canSave}
                  onClick={onSave}
                  title={action?.disabledReason ?? undefined}
                  type="button"
                >
                  {isSaving ? "Guardando…" : action?.label ?? "Guardar"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Origen ── */}
      {selectedRow && (
        <SourcePanel payload={payload} sourceUrl={selectedRow.source_url} />
      )}
    </div>
  );
}
