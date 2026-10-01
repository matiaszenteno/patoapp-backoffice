import { z } from "zod";

export const DEFAULT_SEARCH_MIN_QUERY_LENGTH = 3;
export const TITLE_MAX = 120;
export const BODY_MAX = 300;

export type CampaignDestination = "none" | "benefit" | "feed" | "nearby" | "profile";
export type DiscoveryFilter = "none" | "category" | "query";

export type CampaignFormValues = {
  title: string;
  body: string;
  dest: CampaignDestination;
  benefit_id: string;
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
      dest: z.enum(["none", "benefit", "feed", "nearby", "profile"]),
      benefit_id: z.string(),
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
