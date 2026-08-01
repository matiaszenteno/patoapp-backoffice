export type CorrectionReprocessBody = {
  correctionOnly: true;
  correctedFields: string[];
  force: boolean;
  rawBenefitId: string;
  runKind: "correction";
};

export type CorrectionReprocessResponse = {
  error?: string;
  requestId?: string;
  runUrl?: string;
  triggered?: boolean;
};

export function buildCorrectionReprocessBody(
  rawBenefitId: string,
  correctedFields: string[],
  force: boolean,
): CorrectionReprocessBody | null {
  const savedFieldNames = [...new Set(correctedFields.filter((field) => field.trim() !== ""))];
  if (savedFieldNames.length === 0) return null;

  return {
    correctionOnly: true,
    correctedFields: savedFieldNames,
    force,
    rawBenefitId,
    runKind: "correction",
  };
}

function sameCorrectionValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

export function getChangedCorrectionFields(
  previous: Record<string, unknown> | null,
  saved: Record<string, unknown>,
): string[] {
  const allFields = new Set([...Object.keys(previous ?? {}), ...Object.keys(saved)]);
  return [...allFields].filter((field) => !sameCorrectionValue(previous?.[field], saved[field]));
}

export function getReprocessFailureMessage(
  response: CorrectionReprocessResponse | null,
  fallback: string,
): string {
  const message = response?.error ?? fallback;
  return response?.requestId ? `${message} (referencia: ${response.requestId})` : message;
}

export async function getFunctionErrorMessage(error: unknown): Promise<string> {
  const context = (error as { context?: unknown })?.context;
  if (context instanceof Response) {
    const body = await context.clone().json().catch(() => null) as CorrectionReprocessResponse | null;
    return getReprocessFailureMessage(body, error instanceof Error ? error.message : String(error));
  }
  return error instanceof Error ? error.message : String(error);
}
