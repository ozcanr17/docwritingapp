import { ApiError } from "./api";

type Translate = (key: string) => string;

export function userFacingError(error: unknown, t: Translate): string {
  if (!(error instanceof ApiError)) return navigator.onLine ? t("operationFailedRetry") : t("operationFailedOffline");
  if (error.status === 400 || error.status === 422) return t("operationFailedValidation");
  if (error.status === 401) return t("operationFailedSession");
  if (error.status === 403) return t("operationFailedPermission");
  if (error.status === 404) return t("operationFailedNotFound");
  if (error.status === 409) return t("conflictError");
  if (error.status === 413) return t("operationFailedTooLarge");
  if (error.status === 429) return t("operationFailedRateLimit");
  return t("operationFailedRetry");
}
