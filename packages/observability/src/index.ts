/**
 * @reqatlas/observability
 *
 * trace / log / metric 辅助。零框架依赖，可同时被 api 与 worker 使用。
 *
 * M1 提供：结构化 JSON 日志（每行一个 JSON 对象）+ 敏感字段脱敏。
 * 规则：绝不把 token / password / cookie / 授权头写入日志。
 */

export const OBSERVABILITY_PACKAGE = '@reqatlas/observability' as const;

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/** 命中即整体替换为 [REDACTED] 的敏感字段名。 */
const SENSITIVE_KEY =
  /(password|passwd|secret|token|authorization|cookie|api[-_]?key|credential|private[-_]?key|session)/i;

const REDACTED = '[REDACTED]';

/** 递归对对象做敏感字段脱敏（数组与嵌套对象同样处理）。 */
export function redact(input: unknown, depth = 0): unknown {
  if (depth > 6 || input === null || typeof input !== 'object') {
    return input;
  }
  if (Array.isArray(input)) {
    return input.map((item) => redact(item, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(value, depth + 1);
  }
  return out;
}

export interface LoggerOptions {
  /** 服务名，写入每条日志的 `service` 字段。 */
  service: string;
  /** 最低输出级别，默认 info。 */
  level?: LogLevel;
  /** 输出目的地，默认写 stdout 一行一条 JSON。 */
  sink?: (line: string) => void;
  /** 时间源，便于测试注入。 */
  now?: () => Date;
}

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}

/** 创建结构化 JSON 行日志器。 */
export function createJsonLogger(options: LoggerOptions): Logger {
  const threshold = LEVEL_ORDER[options.level ?? 'info'];
  const sink =
    options.sink ??
    ((line: string): void => {
      process.stdout.write(`${line}\n`);
    });
  const now = options.now ?? ((): Date => new Date());

  const emit = (level: LogLevel, msg: string, fields?: Record<string, unknown>): void => {
    if (LEVEL_ORDER[level] < threshold) {
      return;
    }
    const record: Record<string, unknown> = {
      time: now().toISOString(),
      level,
      service: options.service,
      msg,
    };
    if (fields) {
      const safe = redact(fields);
      if (safe && typeof safe === 'object' && !Array.isArray(safe)) {
        Object.assign(record, safe as Record<string, unknown>);
      }
    }
    sink(JSON.stringify(record));
  };

  return {
    debug: (msg, fields) => emit('debug', msg, fields),
    info: (msg, fields) => emit('info', msg, fields),
    warn: (msg, fields) => emit('warn', msg, fields),
    error: (msg, fields) => emit('error', msg, fields),
  };
}
