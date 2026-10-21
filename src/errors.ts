import { t } from "./i18n";

export type ErrorCode = "invalid_input" | "state_unavailable" | "newer_schema" | "backup_review_required"
  | "instance_busy" | "unsupported_platform" | "account_mismatch" | "credentials_unavailable"
  | "not_implemented" | "invalid_transition" | "needs_reconciliation" | "login_required" | "authorization_failed" | "share_access_required" | "output_required" | "output_unavailable";

export class AppError extends Error {
  constructor(readonly code: ErrorCode) { super(t().errors[code]); this.name = "AppError"; }
}

export function publicError(error: unknown): string {
  // 按输出时的语言取文字：错误可能在确定语言之前创建。
  return error instanceof AppError ? t().errors[error.code] : t().hiddenError;
}
