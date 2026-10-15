/** The body of `GET /api/health`: the backend is up and answering. */
export interface HealthResponse {
  status: "ok";
  service: "location-scout-api";
}

export const isHealthResponse = (value: unknown): value is HealthResponse =>
  typeof value === "object" &&
  value !== null &&
  "status" in value &&
  value.status === "ok" &&
  "service" in value &&
  value.service === "location-scout-api";
