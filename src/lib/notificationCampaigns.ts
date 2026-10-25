import { z } from "zod";

export const DEFAULT_SEARCH_MIN_QUERY_LENGTH = 3;
export const TITLE_MAX = 120;
export const BODY_MAX = 300;

export type CampaignDestination = "none" | "benefit" | "feed" | "nearby" | "profile" | "in_app_campaign";
export type DiscoveryFilter = "none" | "category" | "query";

export type CampaignFormValues = {
  title: string;
  body: string;
  dest: CampaignDestination;
  benefit_id: string;
  in_app_campaign_id: string;
  discoveryFilter: DiscoveryFilter;
  category_slug: string;
  query: string;
  audience: "all" | "users";
  target_user_ids: string[];
};

export const defaultCampaignValues: CampaignFormValues = {
  title: "",
  body: "",
  dest: "feed",
  benefit_id: "",
  in_app_campaign_id: "",
  discoveryFilter: "none",
  category_slug: "",
  query: "",
  audience: "all",
  target_user_ids: [],
};

export function createCampaignSchema(minQueryLength: number) {
  return z
    .object({
      title: z.string().min(1, "Requerido").max(TITLE_MAX, `Máximo ${TITLE_MAX} caracteres`),
      body: z.string().min(1, "Requerido").max(BODY_MAX, `Máximo ${BODY_MAX} caracteres`),
      dest: z.enum(["none", "benefit", "feed", "nearby", "profile", "in_app_campaign"]),
      benefit_id: z.string(),
      in_app_campaign_id: z.string(),
      discoveryFilter: z.enum(["none", "category", "query"]),
      category_slug: z.string(),
      query: z.string(),
      audience: z.enum(["all", "users"]),
      target_user_ids: z.array(z.string()),
    })
    .superRefine((value, context) => {
      if (value.dest === "benefit" && !value.benefit_id) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["benefit_id"], message: "Seleccioná un beneficio." });
      }

      if (value.dest === "in_app_campaign" && !value.in_app_campaign_id) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["in_app_campaign_id"],
          message: "Seleccioná una campaña in-app.",
        });
      }

      const discoveryDestination = value.dest === "feed" || value.dest === "nearby";
      if (discoveryDestination && value.discoveryFilter === "category" && !value.category_slug) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["category_slug"], message: "Seleccioná una categoría." });
      }
      if (discoveryDestination && value.discoveryFilter === "query") {
        const query = value.query.trim();
        if (query.length < minQueryLength) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["query"],
            message: `Ingresá al menos ${minQueryLength} caracteres.`,
          });
        }
      }
      if (value.audience === "users" && value.target_user_ids.length === 0) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["target_user_ids"], message: "Elegí al menos un usuario." });
      }
    });
}

export function buildCampaignData(values: CampaignFormValues): Record<string, unknown> | null {
  if (values.dest === "none") return null;
  if (values.dest === "benefit") {
    return { dest: "benefit", benefit_id: values.benefit_id };
  }
  if (values.dest === "profile") return { dest: "profile" };
  if (values.dest === "in_app_campaign") {
    return { dest: "in_app_campaign", campaign_id: values.in_app_campaign_id };
  }
  if (values.discoveryFilter === "category") {
    return { dest: values.dest, category_slug: values.category_slug };
  }
  if (values.discoveryFilter === "query") {
    return { dest: values.dest, query: values.query.trim() };
  }
  return { dest: values.dest };
}

export type CampaignSendResult = {
  id: string;
  expo_accepted?: number;
  failed?: number;
  skipped?: number;
  sending?: number;
  error?: string;
};

export type CampaignSendResponse = {
  results?: CampaignSendResult[];
  message?: string;
};

export function describeCampaignSendResult(
  campaignId: string,
  response: CampaignSendResponse | null,
): { ok: boolean; message: string } {
  const result = response?.results?.find((candidate) => candidate.id === campaignId);
  if (!result) {
    return {
      ok: false,
      message: response?.message ?? "La función no confirmó el resultado de esta campaña.",
    };
  }
  if (result.error) return { ok: false, message: result.error };

  const accepted = result.expo_accepted ?? 0;
  const failed = result.failed ?? 0;
  const skipped = result.skipped ?? 0;
  const sending = result.sending ?? 0;
  if (accepted === 0) {
    return {
      ok: false,
      message: `Expo no aceptó destinatarios (${failed} fallidos, ${skipped} omitidos, ${sending} pendientes).`,
    };
  }

  return {
    ok: true,
    message: `Expo aceptó ${accepted}; ${failed} fallidos, ${skipped} omitidos y ${sending} pendientes de cierre.`,
  };
}

export type CampaignDeliveryCounts = {
  campaign_id: string;
  total: number;
  selected: number;
  skipped: number;
  sending: number;
  expo_accepted: number;
  receipt_ok: number;
  receipt_failed: number;
  failed: number;
  opened: number;
};

export function acceptedByExpo(counts: CampaignDeliveryCounts): number {
  return counts.expo_accepted + counts.receipt_ok + counts.receipt_failed + counts.opened;
}

export function acceptedByProvider(counts: CampaignDeliveryCounts): number {
  return counts.receipt_ok + counts.opened;
}

export function pendingDelivery(counts: CampaignDeliveryCounts): number {
  return counts.selected + counts.sending;
}

export function totalFailed(counts: CampaignDeliveryCounts): number {
  return counts.failed + counts.receipt_failed;
}

// ---------- Borrador, prueba y aprobación (decisión 0024 de patoapp) ----------

/** Borrador guardado y la versión que el operador está viendo. */
export type CampaignDraftRef = { id: string; version: number };

/** Parámetros de `admin_save_notification_campaign_draft`. Con un borrador previo
 * lo edita, y la RPC rechaza el cambio si otra persona lo modificó entretanto. */
export function draftRpcParams(values: CampaignFormValues, draft: CampaignDraftRef | null) {
  return {
    title: values.title.trim(),
    body: values.body.trim(),
    data: buildCampaignData(values),
    target: values.audience,
    target_user_ids: values.audience === "users" ? values.target_user_ids : null,
    campaign_id: draft?.id ?? null,
    expected_version: draft?.version ?? null,
  };
}

/** Las RPC de borrador, aprobación y cancelación devuelven una fila `{id, version}`. */
export function parseDraftRow(data: unknown): CampaignDraftRef | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  const { id, version } = row as { id?: unknown; version?: unknown };
  if (typeof id !== "string" || typeof version !== "number") return null;
  return { id, version };
}

/** `admin_create_notification_campaign_test` devuelve el id de la copia a enviar. */
export function parseTestCampaignId(data: unknown): string | null {
  const row = Array.isArray(data) ? data[0] : data;
  const id = (row as { test_campaign_id?: unknown } | null)?.test_campaign_id;
  return typeof id === "string" ? id : null;
}

export function campaignStatusLabel(status: string): string {
  switch (status) {
    case "draft": return "Borrador";
    case "pending": return "Aprobada";
    case "sending": return "Enviando";
    case "sent": return "Procesada";
    case "failed": return "Falló";
    case "cancelled": return "Cancelada";
    default: return status;
  }
}

/** Sólo un borrador o una campaña aprobada que send-campaign no tomó se cancelan. */
export function canCancelCampaign(status: string): boolean {
  return status === "draft" || status === "pending";
}

/** Texto de la confirmación previa al envío real: deja explícito a quién llega. */
export function sendConfirmationMessage(values: CampaignFormValues): string {
  const audience = values.audience === "all"
    ? "TODAS las personas con notificaciones activas"
    : `${values.target_user_ids.length} usuario(s) elegido(s)`;
  return `Vas a aprobar y enviar «${values.title.trim()}» a ${audience}. ¿Continuar?`;
}

/** Campaña in-app activa que una push puede anunciar (decisión 0022 de patoapp). */
export type InAppCampaignOption = {
  id: string;
  image_url: string;
  accessibility_label: string;
  cta_label: string | null;
  starts_at: string;
  ends_at: string | null;
  target: "all" | "users";
  target_user_ids: string[] | null;
};

/** Mismo margen que exige send-campaign en el primer envío. */
export const IN_APP_CAMPAIGN_PUSH_MIN_REMAINING_MS = 24 * 60 * 60 * 1000;

/**
 * Replica en el formulario las reglas con que send-campaign rechaza una push que
 * anuncia una campaña in-app, para avisar antes de crearla. send-campaign sigue
 * siendo la validación autoritativa.
 */
export function inAppCampaignPushProblem(
  campaign: InAppCampaignOption,
  audience: CampaignFormValues["audience"],
  targetUserIds: string[],
  now: Date = new Date(),
): string | null {
  if (new Date(campaign.starts_at).getTime() > now.getTime()) {
    return "La campaña in-app todavía no empieza.";
  }
  if (campaign.ends_at) {
    const remainingMs = new Date(campaign.ends_at).getTime() - now.getTime();
    if (remainingMs <= 0) return "La campaña in-app ya terminó.";
    if (remainingMs < IN_APP_CAMPAIGN_PUSH_MIN_REMAINING_MS) {
      return "La campaña in-app termina en menos de 24 horas.";
    }
  }
  if (campaign.target === "users") {
    const inAppUsers = new Set(campaign.target_user_ids ?? []);
    if (audience !== "users" || !targetUserIds.every((id) => inAppUsers.has(id))) {
      return "La campaña in-app es para usuarios específicos: la push debe ir a esos mismos usuarios o a un subconjunto.";
    }
  }
  return null;
}
