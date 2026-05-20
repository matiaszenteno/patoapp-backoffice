const locationPipelineSecret = import.meta.env.VITE_LOCATION_PIPELINE_SECRET as string | undefined;

export function getLocationPipelineHeaders(token: string) {
  if (!locationPipelineSecret) {
    throw new Error("Falta VITE_LOCATION_PIPELINE_SECRET en .env.");
  }

  return {
    Authorization: `Bearer ${token}`,
    "x-pipeline-secret": locationPipelineSecret,
  };
}
