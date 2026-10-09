// Notificaciones personalizadas pedidas desde el backoffice.
//
// La fila vive en `notification_plan_requests` (patoapp-scrapers). El backoffice sólo
// la lee (RLS is_developer_email) y la crea/aprueba vía la Edge Function
// `personalized-notifications`; el workflow calcula la vista previa y envía.

export type RequestStatus =
  | "queued"
  | "planning"
  | "ready"
  | "approved"
  | "sending"
  | "sent"
  | "failed";

export type PreviewRow = {
  user_id: string;
  name?: string | null;
  action: "selected" | "skipped";
  reason: string;
  title?: string | null;
  body?: string | null;
  benefit_id?: string | null;
  merchant?: string | null;
  issuer?: string | null;
  category_id?: string | null;
  category_score?: number | null;
  location_match?: string | null;
  requires_affiliation?: boolean;
};

export type PlanSummary = {
  users_considered?: number;
  selected?: number;
  skipped?: number;
  selected_by_affinity?: number;
  fallback_without_score?: number;
  excluded_cooldown?: number;
  recent_benefits_only?: number;
  no_eligible_benefit?: number;
  not_reachable?: number;
  profiles_without_communes?: number;
  location_primary_commune?: number;
  location_other_commune?: number;
  location_online?: number;
  location_elsewhere?: number;
  location_unknown?: number;
  distinct_benefits_selected?: number;
  max_users_same_benefit?: number;
};

export type DeliveryResult = {
  expo_accepted?: number;
  failed?: number;
  skipped?: number;
  sending?: number;
  submitted?: number;
};

export type PlanRequest = {
  id: string;
  audience: "users" | "all";
  target_user_ids: string[] | null;
  status: RequestStatus;
  plan_hash: string | null;
  as_of: string | null;
  summary: PlanSummary | null;
  preview: PreviewRow[] | null;
  delivery: DeliveryResult | null;
  error: string | null;
  created_at: string;
  sent_at: string | null;
};

export const MAX_TARGET_USERS = 100;
export const POLL_INTERVAL_MS = 3000;

// Estados en los que el workflow todavía está trabajando: la UI consulta la fila.
const IN_PROGRESS: ReadonlySet<RequestStatus> = new Set(["queued", "planning", "approved", "sending"]);

export function isInProgress(status: RequestStatus): boolean {
  return IN_PROGRESS.has(status);
}

export function requestStatusLabel(status: RequestStatus): string {
  switch (status) {
    case "queued": return "En cola";
    case "planning": return "Calculando vista previa";
    case "ready": return "Vista previa lista";
    case "approved": return "Envío aprobado";
    case "sending": return "Enviando";
    case "sent": return "Enviada";
    case "failed": return "Falló";
  }
}

export function locationLabel(match: string | null | undefined): string {
  switch (match) {
    case "primary_commune": return "En su comuna principal";
    case "other_commune": return "En otra de sus comunas";
    case "online": return "Online o sin local";
    case "elsewhere": return "Lejos de sus comunas";
    case "unknown": return "Sin comunas registradas";
    default: return "—";
  }
}

export function reasonLabel(reason: string): string {
  switch (reason) {
    case "category_affinity": return "Su categoría favorita";
    case "category_rotation": return "Rota a otra categoría que le interesa";
    case "fallback_per_user": return "Sin puntaje: al azar entre sus beneficios";
    case "cooldown": return "Recibió una notificación hace poco";
    case "recent_benefits_only": return "Ya recibió todos sus beneficios disponibles";
    case "no_eligible_benefit": return "No tiene beneficios disponibles hoy";
    case "not_reachable": return "No tiene notificaciones activadas";
    default: return reason;
  }
}

/** Sólo se puede enviar una vista previa lista, del mismo día, escribiendo la cantidad exacta. */
export function sendBlocker(
  request: Pick<PlanRequest, "status" | "summary" | "as_of">,
  typedRecipients: string,
  now: Date,
): string | null {
  if (request.status !== "ready") return "La vista previa no está lista.";
  const selected = request.summary?.selected ?? 0;
  if (selected < 1) return "Nadie recibiría una notificación con este plan.";
  if (!request.as_of || chileDay(new Date(request.as_of)) !== chileDay(now)) {
    return "La vista previa es de otro día; genera una nueva.";
  }
  if (typedRecipients.trim() !== String(selected)) {
    return `Escribe ${selected} para confirmar la cantidad de destinatarios.`;
  }
  return null;
}

export function chileDay(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(value);
}

export function describeDelivery(delivery: DeliveryResult | null): string {
  if (!delivery) return "Sin resultado de envío.";
  const accepted = delivery.expo_accepted ?? 0;
  const parts = [`${accepted} aceptadas por Expo`];
  if (delivery.failed) parts.push(`${delivery.failed} fallidas`);
  if (delivery.skipped) parts.push(`${delivery.skipped} omitidas al enviar`);
  if (delivery.sending) parts.push(`${delivery.sending} sin confirmar`);
  return `${parts.join(", ")}.`;
}

export function nearbyCount(summary: PlanSummary | null): number {
  return (summary?.location_primary_commune ?? 0) + (summary?.location_other_commune ?? 0);
}

export function skippedCount(summary: PlanSummary | null): number {
  return (summary?.skipped ?? 0) + (summary?.not_reachable ?? 0);
}
