import { useState } from "react";

/** Panel derecho, solo lectura: la entrada tal como la entregó el scraper.
 *
 *  Es la referencia contra la que el operador decide si la IA leyó bien, así que va fijo y
 *  visible — no detrás de un toggle. Nada de acá es editable: corregir el raw no tendría
 *  dónde persistirse, y el próximo scrape lo pisaría igual. */
export function SourcePanel({ payload, sourceUrl }: {
  payload: Record<string, unknown>;
  sourceUrl: string | null;
}) {
  const [showJson, setShowJson] = useState(false);

  const nested = payload.raw_payload && typeof payload.raw_payload === "object"
    ? (payload.raw_payload as Record<string, unknown>)
    : {};
  const text = String(
    payload.description_raw ?? payload.description ?? nested.description ?? "",
  );
  const title = String(payload.title ?? payload.name ?? "");
  const merchant = String(payload.merchant_name ?? payload.merchant ?? payload.store_name ?? "");
  const category = String(payload.category ?? payload.category_slug ?? "");
  const channel = String(payload.channel ?? payload.modality ?? "");
  const value = String(payload.value ?? payload.discount ?? payload.benefit ?? "");
  const image = String(payload.image_url ?? payload.merchant_image_url ?? "");

  return (
    <aside className="flex w-[340px] shrink-0 flex-col overflow-hidden border-l border-stone-200 bg-stone-50">
      <div className="shrink-0 border-b border-stone-200 px-5 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
          Origen
        </p>
        <p className="mt-0.5 text-[11px] text-stone-400">
          Lo que entregó el scraper · no editable
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">
          Texto original
        </p>
        <p className="mt-1.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-stone-700">
          {text.trim() || <em className="text-stone-300">el scraper no entregó texto</em>}
        </p>

        <dl className="mt-5 flex flex-col gap-2.5">
          {[
            { label: "Título", value: title },
            { label: "Merchant", value: merchant },
            { label: "Categoría", value: category },
            { label: "Canal", value: channel },
            { label: "Valor", value: value },
            { label: "Imagen", value: image },
          ].map((row) => (
            <div className="flex min-w-0 flex-col gap-0.5" key={row.label}>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">
                {row.label}
              </dt>
              <dd className="break-words text-xs leading-relaxed text-stone-600">
                {row.value.trim() ? row.value : <em className="text-stone-300">sin valor</em>}
              </dd>
            </div>
          ))}
        </dl>

        {sourceUrl && (
          <a
            className="mt-5 inline-block text-xs font-medium text-stone-500 underline hover:text-stone-800"
            href={sourceUrl}
            rel="noreferrer"
            target="_blank"
          >
            Ver en el sitio del emisor →
          </a>
        )}

        <button
          className="mt-5 w-full rounded-md border border-stone-200 bg-white px-2 py-1.5 text-[11px] font-medium text-stone-500 transition-colors hover:border-stone-400 hover:text-stone-800"
          onClick={() => setShowJson((value) => !value)}
          type="button"
        >
          {showJson ? "Ocultar JSON completo" : "Ver JSON completo"}
        </button>
        {showJson && (
          <pre className="mt-2 max-h-80 overflow-auto rounded-md border border-stone-200 bg-white p-2.5 text-[10px] leading-relaxed text-stone-500">
            {JSON.stringify(payload, null, 2)}
          </pre>
        )}
      </div>
    </aside>
  );
}
