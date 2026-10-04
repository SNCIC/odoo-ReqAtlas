/**
 * @reqatlas/contracts
 *
 * 前后端共享的 API 契约。M0/M1 阶段落地健康检查、统一响应包装与稳定错误码。
 *
 * 稳定错误码以《需求调研工作台开发方案》v1.0 附录 A 为**唯一权威**，
 * 与 `docs/api/schemas/error-code.json` 保持一致（由
 * `apps/api` 的 `contract-consistency.spec.ts` 强制，防漂移）。
 * 后续由 OpenAPI 生成物替换（见 M1-06）。
 */

export const CONTRACTS_PACKAGE = '@reqatlas/contracts' as const;

/** 统一响应元信息（见开发方案 §统一响应包装）。 */
export interface ApiMeta {
  requestId: string;
  projectRevision?: number;
}

/** 统一成功响应包装：{ data, meta }。 */
export interface ApiResponse<TData> {
  data: TData;
  meta: ApiMeta;
}

/** GET /api/v1/health 的响应体。 */
export interface HealthPayload {
  status: 'ok' | 'degraded';
  service: string;
  version: string;
  uptimeSeconds: number;
}

/**
 * RFC 9457 problem+json 错误体，`code` 为稳定错误码。
 * 字段与 `docs/api/schemas/problem.json` 对齐（`context` 为结构化上下文）。
 */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  code: string;
  requestId: string;
  context?: Record<string, unknown>;
}

/**
 * 稳定错误码（权威来源：开发方案附录 A，共 10 个）。
 * 客户端依据 `code` 分支；不得依赖 `detail` 文案或 HTTP 状态单独判断。
 */
export const ERROR_CODES = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  REVISION_CONFLICT: 'REVISION_CONFLICT',
  IDEMPOTENCY_MISMATCH: 'IDEMPOTENCY_MISMATCH',
  BASELINE_LOCKED: 'BASELINE_LOCKED',
  DOMAIN_RULE_BLOCKED: 'DOMAIN_RULE_BLOCKED',
  RATE_LIMITED: 'RATE_LIMITED',
  DEPENDENCY_UNAVAILABLE: 'DEPENDENCY_UNAVAILABLE',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/**
 * 每个稳定错误码对应的 HTTP 状态。与 `docs/api/schemas/error-code.json`
 * 的 `$comment` 机器可读映射逐项一致（由一致性测试断言）。
 * 注意：409 一对多（REVISION_CONFLICT / IDEMPOTENCY_MISMATCH / BASELINE_LOCKED）。
 */
export const ERROR_CODE_HTTP_STATUS: Readonly<Record<ErrorCode, number>> = {
  VALIDATION_FAILED: 400,
  AUTH_REQUIRED: 401,
  PERMISSION_DENIED: 403,
  RESOURCE_NOT_FOUND: 404,
  REVISION_CONFLICT: 409,
  IDEMPOTENCY_MISMATCH: 409,
  BASELINE_LOCKED: 409,
  DOMAIN_RULE_BLOCKED: 422,
  RATE_LIMITED: 429,
  DEPENDENCY_UNAVAILABLE: 503,
};

/**
 * 契约外兜底码 —— 【当前已知的契约违约】。
 *
 * 契约外兜底，见 `docs/api/open-questions.md` **OQ-4**：
 * - 仅用于**未预期异常**（HTTP >= 500）；**不得**用于任何已枚举语义；
 * - **不属于**权威 `ERROR_CODES`（附录 A 的 10 个完全不包含它）；
 * - OQ-4 裁定为「正式新增进契约」后，**此常量必须删除并并入 `ERROR_CODES`**。
 *
 * 之所以暂时保留，是为了不改变 500 的既有行为（team-lead ④）。
 * 命名刻意与 `ERROR_CODES` 区分，使违约**一眼可辨**，而非藏在看似合法的常量里。
 */
export const NON_CONTRACT_FALLBACK = {
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type NonContractFallbackCode =
  (typeof NON_CONTRACT_FALLBACK)[keyof typeof NON_CONTRACT_FALLBACK];

const ERROR_CODE_SET: ReadonlySet<string> = new Set(Object.values(ERROR_CODES));

/** 判断任意字符串是否为权威稳定错误码。 */
export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && ERROR_CODE_SET.has(value);
}
