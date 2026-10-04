import {
  ERROR_CODES,
  NON_CONTRACT_FALLBACK,
  type ErrorCode,
  type NonContractFallbackCode,
} from '@reqatlas/contracts';

/** 过滤器可产出的 code：权威枚举，或显式登记的非契约兜底码。 */
export type ApiErrorCode = ErrorCode | NonContractFallbackCode;

/**
 * 显式 `HTTP 状态 → 默认稳定错误码` 映射表（替代此前 `HTTP_${status}` 的任意兜底）。
 *
 * 仅登记「一个状态唯一对应一个 code」的情况。**一对多的状态**（如 409 对应
 * REVISION_CONFLICT / IDEMPOTENCY_MISMATCH / BASELINE_LOCKED）不在此表，
 * 必须由业务层在 HttpException 中显式给出 `code`。
 *
 * 500 使用**非契约兜底码** `INTERNAL_ERROR`：附录 A 未定义 500 码，
 * 属当前已知契约违约，待 **OQ-4** 裁定（见 docs/engineering/README.md 已知偏差）。
 */
export const STATUS_DEFAULT_CODE: Readonly<Record<number, ApiErrorCode>> = {
  400: ERROR_CODES.VALIDATION_FAILED,
  401: ERROR_CODES.AUTH_REQUIRED,
  403: ERROR_CODES.PERMISSION_DENIED,
  404: ERROR_CODES.RESOURCE_NOT_FOUND,
  422: ERROR_CODES.DOMAIN_RULE_BLOCKED,
  429: ERROR_CODES.RATE_LIMITED,
  500: NON_CONTRACT_FALLBACK.INTERNAL_ERROR,
  503: ERROR_CODES.DEPENDENCY_UNAVAILABLE,
};

/** 一对多、必须由业务层显式提供 `code` 的状态。 */
export const AMBIGUOUS_STATUSES: readonly number[] = [409];

/**
 * `apps/api` 目前可产出的 HTTP 状态集合。新增可产出状态时必须同步：
 * 要么登记进 `STATUS_DEFAULT_CODE`，要么声明为 `AMBIGUOUS_STATUSES`；
 * 否则 `problem-details.filter.spec.ts` 会红灯（防止静默产出非法 code）。
 */
export const API_PRODUCIBLE_STATUSES: readonly number[] = [
  400, 401, 403, 404, 409, 422, 429, 500, 503,
];

/** 取某状态的默认码；未登记返回 `undefined`（调用方须显式失败，不得造码）。 */
export function defaultCodeForStatus(status: number): ApiErrorCode | undefined {
  return STATUS_DEFAULT_CODE[status];
}

/** 该状态是否为「一对多、需显式 code」。 */
export function isAmbiguousStatus(status: number): boolean {
  return AMBIGUOUS_STATUSES.includes(status);
}

/** 该状态是否「可被安全映射」（有默认码或已声明为歧义）。 */
export function isMappedStatus(status: number): boolean {
  return defaultCodeForStatus(status) !== undefined || isAmbiguousStatus(status);
}
