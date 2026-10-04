import { DEMO_TRADE_BUNDLE_RELATIVE_PATH } from './anchor';
import { sha256File } from './hash';

/**
 * 机器可读产物的**来源元数据封装**。
 *
 * 仅仅记录 `basedOnRevision` 不足以让产物自证来源；产物必须记录其依据的源 bundle 的
 * sha256。该值**重算**自 bundle 字节（`sha256File`），而不是从 `anchor.ts` 常量抄写，
 * 因此能真正证明「产物源自当前冻结基线」。
 *
 * 注意：契约对象（ChangeDraft / ChangeSet）本身在 `docs/api/schemas/*.json` 中声明了
 * `additionalProperties: false`，因此元数据放在**外层信封** `metadata` 中，`payload` 保持
 * 契约原样、可被 Schema Guard 直接校验。
 */

export interface ArtifactMetadata {
  kind: 'change-draft' | 'change-set';
  scenarioId: string;
  basedOnRevision: number;
  /** 相对 testkit fixtures 的路径（禁止写入本机绝对路径）。 */
  sourceBundlePath: string;
  /** 重算自源 bundle 字节的 sha256。 */
  sourceBundleSha256: string;
  generatedBy: string;
}

export interface ArtifactEnvelope<T> {
  metadata: ArtifactMetadata;
  payload: T;
}

export interface BuildArtifactParams<T> {
  kind: ArtifactMetadata['kind'];
  scenarioId: string;
  basedOnRevision: number;
  /** 源 bundle 的实际文件路径，仅用于重算，不写入产物。 */
  bundlePath: string;
  payload: T;
}

/** 重算源 bundle sha256 并构造产物信封。 */
export function buildArtifactEnvelope<T>(params: BuildArtifactParams<T>): ArtifactEnvelope<T> {
  const sourceBundleSha256 = sha256File(params.bundlePath);
  return {
    metadata: {
      kind: params.kind,
      scenarioId: params.scenarioId,
      basedOnRevision: params.basedOnRevision,
      sourceBundlePath: DEMO_TRADE_BUNDLE_RELATIVE_PATH,
      sourceBundleSha256,
      generatedBy: 'scripts/golden-run.ts',
    },
    payload: params.payload,
  };
}
