import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import { SCHEMAS_DIR } from '../paths';

/**
 * Schema Guard：**直接以 `docs/api/schemas/*.json` 为验证源**校验模型输出。
 *
 * 契约是唯一权威——本文件不把 JSON Schema 抄成 zod，也不维护第二份结构定义；
 * 而是启动时读取契约目录、注册全部 schema，再按 `$id` 取用对应校验器。
 */

export interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
}

export interface SchemaGuard {
  readonly schemaIds: string[];
  validateDraft(data: unknown): SchemaValidationResult;
  validateChangeSet(data: unknown): SchemaValidationResult;
  validateProblem(data: unknown): SchemaValidationResult;
  /** 取任意已注册 schema 的校验器（按 $id）。 */
  validateAs(schemaId: string, data: unknown): SchemaValidationResult;
  /** 供 Provider 使用的 JSON Schema 原文（change-draft.json）。 */
  readRawSchema(schemaId: string): Record<string, unknown>;
}

interface SchemaDocument {
  $id?: string;
  [key: string]: unknown;
}

function loadSchemaDocuments(schemasDir: string): SchemaDocument[] {
  return readdirSync(schemasDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(path.join(schemasDir, f), 'utf8')) as SchemaDocument);
}

function formatErrors(errors: ErrorObject[] | null | undefined): string[] {
  if (!errors) return [];
  return errors.map((e) => `${e.instancePath || '/'} ${e.message ?? ''}`.trim());
}

/**
 * 构造 Schema Guard。
 * @param schemasDir 契约 schema 目录（默认 `docs/api/schemas`）。
 */
export function createSchemaGuard(schemasDir: string = SCHEMAS_DIR): SchemaGuard {
  const documents = loadSchemaDocuments(schemasDir);
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  const ids: string[] = [];
  for (const doc of documents) {
    if (typeof doc.$id === 'string') {
      ajv.addSchema(doc);
      ids.push(doc.$id);
    }
  }

  const compiled = new Map<string, ValidateFunction>();
  const requireValidator = (schemaId: string): ValidateFunction => {
    const cached = compiled.get(schemaId);
    if (cached) return cached;
    const validator = ajv.getSchema(schemaId);
    if (!validator) {
      throw new Error(`未注册的 schema: ${schemaId}（已注册：${ids.join(', ')}）`);
    }
    compiled.set(schemaId, validator);
    return validator;
  };

  const validateAs = (schemaId: string, data: unknown): SchemaValidationResult => {
    const validator = requireValidator(schemaId);
    const valid = validator(data) as boolean;
    return { valid, errors: formatErrors(validator.errors) };
  };

  const rawById = new Map<string, Record<string, unknown>>();
  for (const doc of documents) {
    if (typeof doc.$id === 'string') rawById.set(doc.$id, doc as Record<string, unknown>);
  }

  return {
    schemaIds: ids,
    validateDraft: (data) => validateAs('change-draft.json', data),
    validateChangeSet: (data) => validateAs('change-set.json', data),
    validateProblem: (data) => validateAs('problem.json', data),
    validateAs,
    readRawSchema: (schemaId) => {
      const raw = rawById.get(schemaId);
      if (!raw) throw new Error(`未注册的 schema: ${schemaId}`);
      return raw;
    },
  };
}
