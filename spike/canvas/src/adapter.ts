/**
 * Domain → React Flow 适配层（ADR-003：React Flow 仅作视图适配层）。
 *
 * 设计约束：
 * - **单向投影**：ModelBundle → nodes/edges/lanes。React Flow JSON 绝不反向当领域模型。
 * - **对象 ID 一致**：node.id 恒等于 `model_object.id`（P1，客户视图/专业视图共用 ID）。
 * - 语义字段（kind/state/sourceStatus/code/title/payload）全部来自领域数据，React Flow
 *   只负责坐标与交互。
 * - 反向转换见 `changeset.ts`（编辑事件 → ChangeSet，而非持久化 RF JSON）。
 *
 * 本模块仅 `import type` React Flow 类型，运行时不依赖 @xyflow/react，
 * 因此可在 Node（性能测量）与浏览器中复用。
 */
import type { Edge, Node } from '@xyflow/react';
import type {
  ModelBundle,
  ModelObject,
  ModelRelation,
  ObjectKind,
  ObjectState,
  RelationKind,
  SourceStatus,
} from './domain';

// ---------------------------------------------------------------------------
// 几何常量
// ---------------------------------------------------------------------------

export const NODE_WIDTH = 172;
export const NODE_HEIGHT = 62;
const COL_GAP = 56;
const ROW_GAP = 16;
const LANE_PAD_X = 28;
const LANE_PAD_Y = 18;
const LANE_HEADER = 26;

/** 辅助泳道（非角色对象）。 */
const AUX_LANE_DATA = '__lane_data__';
const AUX_LANE_SYSTEM = '__lane_system__';
const AUX_LANE_INSIGHT = '__lane_insight__';

const PROCESS_KINDS: ReadonlySet<ObjectKind> = new Set<ObjectKind>([
  'start',
  'activity',
  'decision',
  'end',
  'parallel',
  'wait',
  'subprocess',
  'exception',
]);

// ---------------------------------------------------------------------------
// 视觉映射（kind → 形状/图标/强调色；sourceStatus → 颜色）
// ---------------------------------------------------------------------------

export type NodeShape =
  | 'rect'
  | 'rounded'
  | 'diamond'
  | 'pill'
  | 'circle'
  | 'hex'
  | 'parallelogram'
  | 'doc'
  | 'cylinder'
  | 'note';

export type NodeVisual = {
  shape: NodeShape;
  icon: string;
  /** 将 kind 归入的语义分组，便于属性面板/图例。 */
  group: 'raci' | 'process' | 'data' | 'problem' | 'requirement' | 'system' | 'other';
};

const VISUAL_BY_KIND: Record<ObjectKind, NodeVisual> = {
  role: { shape: 'pill', icon: '◍', group: 'raci' },
  person: { shape: 'circle', icon: '◍', group: 'raci' },
  organization: { shape: 'hex', icon: '⬡', group: 'raci' },
  activity: { shape: 'rounded', icon: '▭', group: 'process' },
  subprocess: { shape: 'rounded', icon: '⊞', group: 'process' },
  decision: { shape: 'diamond', icon: '◆', group: 'process' },
  start: { shape: 'circle', icon: '▶', group: 'process' },
  end: { shape: 'circle', icon: '◼', group: 'process' },
  parallel: { shape: 'hex', icon: '+', group: 'process' },
  wait: { shape: 'hex', icon: '⏸', group: 'process' },
  exception: { shape: 'parallelogram', icon: '!', group: 'process' },
  data_object: { shape: 'doc', icon: '▤', group: 'data' },
  system: { shape: 'cylinder', icon: '⌗', group: 'system' },
  current_fact: { shape: 'note', icon: '•', group: 'problem' },
  problem: { shape: 'note', icon: '△', group: 'problem' },
  target: { shape: 'note', icon: '◎', group: 'problem' },
  requirement: { shape: 'note', icon: '✎', group: 'requirement' },
  solution_candidate: { shape: 'note', icon: '✦', group: 'requirement' },
  term: { shape: 'rect', icon: '§', group: 'other' },
};

export function visualForKind(kind: ObjectKind): NodeVisual {
  return VISUAL_BY_KIND[kind] ?? { shape: 'rect', icon: '?', group: 'other' };
}

/** 来源状态颜色：用于可视化「事实与推断分离」（P4）。 */
export const SOURCE_STATUS_COLORS: Record<SourceStatus, string> = {
  confirmed_fact: '#22c55e',
  approved_requirement: '#14b8a6',
  user_statement: '#3b82f6',
  material_extracted: '#06b6d4',
  consultant_judgment: '#f59e0b',
  agent_inference: '#a855f7',
};

/** 推断类来源需要虚线边框，直观区分「未确认」。 */
export function isInferred(status: SourceStatus): boolean {
  return status === 'agent_inference' || status === 'consultant_judgment';
}

// ---------------------------------------------------------------------------
// 适配层输出类型
// ---------------------------------------------------------------------------

export type CanvasNodeData = {
  objectId: string;
  kind: ObjectKind;
  code: string;
  title: string;
  state: ObjectState;
  sourceStatus: SourceStatus;
  lane: string;
  locked: boolean;
  hasLayout: boolean;
  payload: Record<string, unknown>;
  visual: NodeVisual;
  accent: string;
  inferred: boolean;
};

export type EdgeCategory = 'flow' | 'raci' | 'resource' | 'system' | 'exception' | 'derived';

export type CanvasEdgeData = {
  relationId: string;
  kind: RelationKind;
  category: EdgeCategory;
  conditionLabel: string | null;
  objectId: string | null;
};

export type CanvasNode = Node<CanvasNodeData, 'modelNode'>;
export type CanvasEdge = Edge<CanvasEdgeData>;

export type LaneInfo = {
  id: string;
  label: string;
  kind: 'role' | 'aux';
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ProjectionTiming = {
  totalMs: number;
  layoutMs: number;
  edgesMs: number;
};

export type CanvasProjection = {
  viewId: string | null;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  lanes: LaneInfo[];
  timing: ProjectionTiming;
  stats: {
    objectCount: number;
    nodeCount: number;
    relationCount: number;
    edgeCount: number;
    laneCount: number;
  };
};

export type LayoutMode = 'view_layout' | 'auto';

export type ProjectBundleOptions = {
  /** 使用哪个视图的 viewLayout 坐标；缺省取 isDefault 或第一个视图。 */
  viewId?: string;
  /** 'view_layout' 用 fixture 坐标（缺失处回退自动布局）；'auto' 全部程序化布局。 */
  layout?: LayoutMode;
  /** 仅投影这些关系 kind（用于性能对比）。 */
  relationKinds?: readonly RelationKind[];
};

const EDGE_CATEGORY: Record<RelationKind, EdgeCategory> = {
  flow_to: 'flow',
  triggers: 'flow',
  performs_R: 'raci',
  accountable_A: 'raci',
  consulted_C: 'raci',
  informed_I: 'raci',
  produces: 'resource',
  consumes: 'resource',
  uses_system: 'system',
  has_exception: 'exception',
  derived_from: 'derived',
  supported_by: 'derived',
  resolves: 'derived',
  maps_to: 'derived',
  confirms: 'derived',
  replaces: 'derived',
  belongs_to: 'derived',
};

const EDGE_STYLE: Record<EdgeCategory, { stroke: string; width: number; dash?: string }> = {
  flow: { stroke: '#60a5fa', width: 2 },
  raci: { stroke: '#34d399', width: 1, dash: '5 4' },
  resource: { stroke: '#a78bfa', width: 1.5 },
  system: { stroke: '#22d3ee', width: 1.5, dash: '6 4' },
  exception: { stroke: '#f87171', width: 1.5, dash: '3 3' },
  derived: { stroke: '#facc15', width: 1.5, dash: '6 3' },
};

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function laneOfAuxObject(kind: ObjectKind): string {
  if (kind === 'data_object') return AUX_LANE_DATA;
  if (kind === 'system') return AUX_LANE_SYSTEM;
  return AUX_LANE_INSIGHT;
}

const AUX_LANE_LABEL: Record<string, string> = {
  [AUX_LANE_DATA]: '数据对象',
  [AUX_LANE_SYSTEM]: '系统',
  [AUX_LANE_INSIGHT]: '问题 / 需求',
};

// ---------------------------------------------------------------------------
// 主投影函数
// ---------------------------------------------------------------------------

/**
 * 把 ModelBundle 单向投影为 React Flow 可渲染的 nodes / edges / lanes。
 * 纯函数：不修改输入，无副作用；同一输入必然得到同一输出（幂等）。
 */
export function projectBundle(
  bundle: ModelBundle,
  options: ProjectBundleOptions = {},
): CanvasProjection {
  const totalStart = now();

  const view =
    (options.viewId ? bundle.view.find((v) => v.id === options.viewId) : undefined) ??
    bundle.view.find((v) => v.isDefault) ??
    bundle.view[0] ??
    null;
  const viewId = view?.id ?? null;
  const layoutMode: LayoutMode = options.layout ?? 'view_layout';
  const relationFilter = options.relationKinds
    ? new Set<RelationKind>(options.relationKinds)
    : null;

  const objects = bundle.modelObject;
  const objectById = new Map<string, ModelObject>();
  for (const o of objects) objectById.set(o.id, o);

  const layoutByObjectId = new Map<string, (typeof bundle.viewLayout)[number]>();
  for (const l of bundle.viewLayout) {
    if (viewId !== null && l.viewId !== viewId) continue;
    layoutByObjectId.set(l.objectId, l);
  }

  // 角色泳道顺序：按对象出现顺序（fixture 已按 ROLE-00x 排序）。
  const roleLanes: { id: string; label: string }[] = objects
    .filter((o) => o.kind === 'role')
    .map((o) => ({ id: o.id, label: o.title }));

  const auxLaneIds = [AUX_LANE_DATA, AUX_LANE_SYSTEM, AUX_LANE_INSIGHT] as const;

  /** 为对象解析泳道：显式 layout.lane 优先，其次按责任角色推断，最后按 kind 归入辅助泳道。 */
  const laneForObject = (o: ModelObject): string => {
    const layoutLane = layoutByObjectId.get(o.id)?.lane;
    if (layoutLane) return layoutLane;
    if (o.kind === 'role') return o.id;
    if (PROCESS_KINDS.has(o.kind)) {
      const role = responsibleRoleOf(o.id, bundle);
      if (role) return role;
      return roleLanes[0]?.id ?? AUX_LANE_INSIGHT;
    }
    return laneOfAuxObject(o.kind);
  };

  // ---- 1. 先建节点骨架（不含坐标） ----
  const skeleton: {
    object: ModelObject;
    lane: string;
    /** 自动布局用的排序列：flow level。 */
    level: number;
  }[] = [];

  const laneByObjectId = new Map<string, string>();
  for (const o of objects) {
    const lane = laneForObject(o);
    laneByObjectId.set(o.id, lane);
    skeleton.push({ object: o, lane, level: 0 });
  }

  // ---- 2. 计算 flow level（最长路径近似，容忍环） ----
  const layoutStart = now();
  const positions = new Map<string, { x: number; y: number }>();

  const flowEdges = bundle.modelRelation.filter(
    (r) => r.kind === 'flow_to' && objectById.has(r.fromId) && objectById.has(r.toId),
  );

  const levelByObject = computeLevels(
    objects.map((o) => o.id),
    flowEdges,
    objectById,
    PROCESS_KINDS,
  );
  for (const s of skeleton) s.level = levelByObject.get(s.object.id) ?? 0;

  // 泳道顺序：角色泳道（保持 fixture 顺序）+ 仅当有对象时才出现的辅助泳道。
  const usedAuxLanes = auxLaneIds.filter((id) => skeleton.some((s) => s.lane === id));
  const laneOrder = [...roleLanes.map((l) => l.id), ...usedAuxLanes];
  // 兜底：分配给未知泳道的对象（理论上不会发生）。
  for (const s of skeleton) {
    if (!laneOrder.includes(s.lane)) laneOrder.push(s.lane);
  }

  if (layoutMode === 'view_layout') {
    // 有 layout 用 layout；缺失的走自动兜底，避免节点堆在 (0,0)。
    const autoPositions = computeAutoPositions(skeleton, laneOrder);
    for (const s of skeleton) {
      const layout = layoutByObjectId.get(s.object.id);
      if (layout) {
        positions.set(s.object.id, { x: layout.x, y: layout.y });
      } else {
        positions.set(s.object.id, autoPositions.get(s.object.id) ?? { x: 0, y: 0 });
      }
    }
  } else {
    const autoPositions = computeAutoPositions(skeleton, laneOrder);
    for (const s of skeleton) {
      positions.set(s.object.id, autoPositions.get(s.object.id) ?? { x: 0, y: 0 });
    }
  }
  const layoutMs = now() - layoutStart;

  // ---- 3. 组装节点 ----
  const nodes: CanvasNode[] = skeleton.map((s) => {
    const o = s.object;
    // 只有 view_layout 模式才「采用」fixture 坐标；auto 模式忽略 layout 的坐标与尺寸。
    const layout = layoutMode === 'view_layout' ? layoutByObjectId.get(o.id) : undefined;
    const visual = visualForKind(o.kind);
    const pos = positions.get(o.id) ?? { x: 0, y: 0 };
    return {
      id: o.id,
      type: 'modelNode',
      position: { x: pos.x, y: pos.y },
      width: layout?.width ?? NODE_WIDTH,
      height: layout?.height ?? NODE_HEIGHT,
      draggable: !(layout?.locked ?? false),
      data: {
        objectId: o.id,
        kind: o.kind,
        code: o.code,
        title: o.title,
        state: o.state,
        sourceStatus: o.sourceStatus,
        lane: s.lane,
        locked: layout?.locked ?? false,
        hasLayout: layout !== undefined,
        payload: o.payload,
        visual,
        accent: SOURCE_STATUS_COLORS[o.sourceStatus],
        inferred: isInferred(o.sourceStatus),
      },
    };
  });

  // ---- 4. 组装边（仅保留两端都在投影内的关系） ----
  const edgesStart = now();
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges: CanvasEdge[] = [];
  for (const r of bundle.modelRelation) {
    if (relationFilter && !relationFilter.has(r.kind)) continue;
    if (!nodeIds.has(r.fromId) || !nodeIds.has(r.toId)) continue;
    edges.push(toEdge(r));
  }
  const edgesMs = now() - edgesStart;

  // ---- 5. 泳道包围盒 ----
  const lanes = computeLanes(nodes, laneOrder, roleLanes, bundle);

  return {
    viewId,
    nodes,
    edges,
    lanes,
    timing: { totalMs: now() - totalStart, layoutMs, edgesMs },
    stats: {
      objectCount: objects.length,
      nodeCount: nodes.length,
      relationCount: bundle.modelRelation.length,
      edgeCount: edges.length,
      laneCount: lanes.length,
    },
  };
}

/** 从 RACI 关系推断某对象的责任角色（accountable_A 优先，其次 performs_R）。 */
function responsibleRoleOf(objectId: string, bundle: ModelBundle): string | null {
  const kindOf = new Map(bundle.modelObject.map((o) => [o.id, o.kind]));
  const pick = (kind: RelationKind): string | null => {
    for (const r of bundle.modelRelation) {
      if (r.kind !== kind || r.toId !== objectId) continue;
      if (kindOf.get(r.fromId) === 'role') return r.fromId;
    }
    return null;
  };
  return pick('accountable_A') ?? pick('performs_R');
}

/** 计算 flow level：process 节点沿 flow_to 最长路径；非 process 节点取相邻 process 的最小 level。 */
function computeLevels(
  objectIds: readonly string[],
  flowEdges: readonly ModelRelation[],
  objectById: ReadonlyMap<string, ModelObject>,
  processKinds: ReadonlySet<ObjectKind>,
): Map<string, number> {
  const level = new Map<string, number>();
  for (const id of objectIds) {
    const o = objectById.get(id);
    level.set(id, o && processKinds.has(o.kind) ? 0 : Number.POSITIVE_INFINITY);
  }

  // 最长路径松弛（最多 |V| 轮；有环时提前停止于轮数上限）。
  for (let round = 0; round < objectIds.length; round += 1) {
    let changed = false;
    for (const e of flowEdges) {
      const fromLevel = level.get(e.fromId) ?? 0;
      if (!Number.isFinite(fromLevel)) continue;
      const current = level.get(e.toId) ?? 0;
      if (fromLevel + 1 > current && fromLevel + 1 < Number.POSITIVE_INFINITY) {
        level.set(e.toId, fromLevel + 1);
        changed = true;
      }
    }
    if (!changed) break;
  }

  let maxProcessLevel = 0;
  for (const id of objectIds) {
    const v = level.get(id) ?? 0;
    if (Number.isFinite(v)) maxProcessLevel = Math.max(maxProcessLevel, v);
  }

  // 非 process 节点：取相邻 process 的最小 level；无邻居则放到最右侧。
  for (const id of objectIds) {
    const o = objectById.get(id);
    if (!o || processKinds.has(o.kind)) continue;
    let min = Number.POSITIVE_INFINITY;
    for (const e of flowEdges) {
      const other = e.fromId === id ? e.toId : e.toId === id ? e.fromId : null;
      if (!other) continue;
      const lv = level.get(other);
      if (lv !== undefined && Number.isFinite(lv) && lv < min) min = lv;
    }
    level.set(id, Number.isFinite(min) ? min : maxProcessLevel + 1);
  }

  return level;
}

/** 自动布局：每个泳道一行，泳道内按 (level, code) 从左到右排列。 */
function computeAutoPositions(
  skeleton: readonly { object: ModelObject; lane: string; level: number }[],
  laneOrder: readonly string[],
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  let laneTop = 0;
  for (const laneId of laneOrder) {
    const members = skeleton
      .filter((s) => s.lane === laneId)
      .sort((a, b) => {
        if (a.level !== b.level) return a.level - b.level;
        return a.object.code.localeCompare(b.object.code);
      });
    const baseY = laneTop + LANE_HEADER + LANE_PAD_Y;
    members.forEach((s, index) => {
      positions.set(s.object.id, {
        x: LANE_PAD_X + index * (NODE_WIDTH + COL_GAP),
        y: baseY,
      });
    });
    const rows = Math.max(members.length, 1);
    laneTop += LANE_HEADER + LANE_PAD_Y * 2 + rows * (NODE_HEIGHT + ROW_GAP);
  }
  return positions;
}

function computeLanes(
  nodes: readonly CanvasNode[],
  laneOrder: readonly string[],
  roleLanes: readonly { id: string; label: string }[],
  bundle: ModelBundle,
): LaneInfo[] {
  const roleLabel = new Map(roleLanes.map((l) => [l.id, l.label]));
  const lanes: LaneInfo[] = [];
  for (const laneId of laneOrder) {
    const members = nodes.filter((n) => n.data.lane === laneId);
    if (members.length === 0) continue;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const n of members) {
      const w = n.width ?? NODE_WIDTH;
      const h = n.height ?? NODE_HEIGHT;
      minX = Math.min(minX, n.position.x);
      minY = Math.min(minY, n.position.y);
      maxX = Math.max(maxX, n.position.x + w);
      maxY = Math.max(maxY, n.position.y + h);
    }
    const label =
      roleLabel.get(laneId) ??
      AUX_LANE_LABEL[laneId] ??
      bundle.modelObject.find((o) => o.id === laneId)?.title ??
      laneId;
    lanes.push({
      id: laneId,
      label,
      kind: roleLabel.has(laneId) ? 'role' : 'aux',
      x: minX - LANE_PAD_X,
      y: minY - LANE_HEADER - 6,
      width: maxX - minX + LANE_PAD_X * 2,
      height: maxY - minY + LANE_HEADER + 6 + LANE_PAD_Y,
    });
  }
  return lanes;
}

function toEdge(r: ModelRelation): CanvasEdge {
  const category = EDGE_CATEGORY[r.kind] ?? 'derived';
  const style = EDGE_STYLE[category];
  const conditionLabel = r.label ?? null;
  const objectId = typeof r.payload?.objectId === 'string' ? r.payload.objectId : null;
  return {
    id: r.id,
    source: r.fromId,
    target: r.toId,
    type: 'smoothstep',
    label: conditionLabel ?? undefined,
    labelShowBg: true,
    labelBgPadding: [6, 3],
    labelBgBorderRadius: 4,
    labelBgStyle: { fill: '#0f172a', fillOpacity: 0.85, stroke: style.stroke, strokeWidth: 0.5 },
    labelStyle: { fill: '#e2e8f0', fontSize: 11 },
    animated: false,
    markerEnd: { type: 'arrowclosed', color: style.stroke, width: 14, height: 14 },
    style: {
      stroke: style.stroke,
      strokeWidth: style.width,
      strokeDasharray: style.dash,
    },
    data: {
      relationId: r.id,
      kind: r.kind,
      category,
      conditionLabel,
      objectId,
    },
  };
}
