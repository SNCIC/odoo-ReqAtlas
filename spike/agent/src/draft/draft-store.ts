import type { ChangeDraft } from '../contract';

/**
 * Draft Store：草案**只存内存**，不写数据库、不改动 bundle。
 * Agent 的唯一产出是 `change_draft`（ADR-005 决策 4）。
 */
export interface DraftStore {
  save(draft: ChangeDraft): void;
  get(draftId: string): ChangeDraft | undefined;
  list(): ChangeDraft[];
  clear(): void;
  readonly size: number;
}

export function createDraftStore(): DraftStore {
  const drafts = new Map<string, ChangeDraft>();
  return {
    save(draft) {
      // 深拷贝入库，避免调用方后续改动污染 store。
      drafts.set(draft.draftId, JSON.parse(JSON.stringify(draft)) as ChangeDraft);
    },
    get(draftId) {
      return drafts.get(draftId);
    },
    list() {
      return [...drafts.values()];
    },
    clear() {
      drafts.clear();
    },
    get size() {
      return drafts.size;
    },
  };
}
