/** The body of any `/api` response that is not a success: a message for the user. */
export interface ApiErrorResponse {
  error: string;
}

export const isApiErrorResponse = (value: unknown): value is ApiErrorResponse =>
  typeof value === "object" &&
  value !== null &&
  "error" in value &&
  typeof value.error === "string";
