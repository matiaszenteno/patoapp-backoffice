import { offersFromDraft, type BenefitOffer } from "../../lib/classification/draft";

const CHANNEL_LABELS: Record<string, string> = {
  hybrid: "Presencial y online",
  online: "Online",
  physical: "Presencial",
};

const VALUE_TYPE_LABELS: Record<string, string> = {
  cashback: "cashback",
  fixed_amount: "de descuento",
  free_item: "gratis",
  percentage: "% de descuento",
  preferred_price: "precio preferencial",
  two_for_one: "2×1",
};

function offerValue(offer: BenefitOffer): string | null {
  if (offer.value != null && offer.value_type) {
    return `${offer.value}${offer.value_type === "percentage" ? "" : " "}${
      VALUE_TYPE_LABELS[offer.value_type] ?? offer.value_type
    }`;
  }
  if (offer.display_price != null) return `Precio $${offer.display_price}`;
  return offer.value_type ? VALUE_TYPE_LABELS[offer.value_type] ?? offer.value_type : null;
}

function validity(offer: BenefitOffer): string | null {
  if (offer.starts_at && offer.ends_at) return `${offer.starts_at.slice(0, 10)} → ${offer.ends_at.slice(0, 10)}`;
  if (offer.ends_at) return `Hasta ${offer.ends_at.slice(0, 10)}`;
  if (offer.starts_at) return `Desde ${offer.starts_at.slice(0, 10)}`;
  return null;
}

export function BenefitOffers({ draft }: { draft: Record<string, unknown> }) {
  const offers = offersFromDraft(draft);
  if (!offers.length) return null;

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">
          Ofertas incluidas · {offers.length}
        </span>
        <div className="h-px flex-1 bg-stone-100" />
        <span className="text-[10px] text-stone-400">Solo lectura</span>
      </div>

      <div className="flex flex-col gap-3">
        {offers.map((offer) => {
          const metadata = [
            offerValue(offer),
            offer.channel ? CHANNEL_LABELS[offer.channel] ?? offer.channel : null,
            validity(offer),
            offer.redemption_method,
          ].filter(Boolean);
          const steps = typeof offer.redemption_details.steps === "string"
            ? offer.redemption_details.steps
            : null;

          return (
            <article className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2.5" key={offer.source_id}>
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-xs font-semibold leading-relaxed text-stone-800">{offer.title}</h3>
                <code className="shrink-0 text-[10px] text-stone-400">{offer.source_id}</code>
              </div>
              {metadata.length > 0 && (
                <p className="mt-1 text-[10px] text-stone-500">{metadata.join(" · ")}</p>
              )}
              {offer.description && (
                <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-stone-600">
                  {offer.description}
                </p>
              )}
              {steps && (
                <p className="mt-2 whitespace-pre-wrap text-[11px] leading-relaxed text-stone-500">
                  <span className="font-medium text-stone-600">Cómo usar:</span> {steps}
                </p>
              )}
              {offer.terms && (
                <details className="mt-2 text-[11px] text-stone-500">
                  <summary className="cursor-pointer font-medium text-stone-600">Ver condiciones</summary>
                  <p className="mt-1 whitespace-pre-wrap leading-relaxed">{offer.terms}</p>
                </details>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
