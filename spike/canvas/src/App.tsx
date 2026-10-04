import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  ViewportPortal,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import {
  projectBundle,
  SOURCE_STATUS_COLORS,
  type CanvasEdge,
  type CanvasNode,
  type LayoutMode,
} from './adapter';
import { loadDemoTradeBundle } from './bundle';
import { amplifyBundle } from './scale';
import { ModelNode } from './ModelNode';
import {
  createChangeSet,
  layoutDragOperation,
  serializeChangeSet,
  titleUpdateOperation,
  type ChangeOperation,
  type ChangeSource,
  type ChangeSet,
} from './changeset';
import { runBrowserPerf, type BrowserPerfReport, type PerfMode } from './perf/browser-probe';

const nodeTypes = { modelNode: ModelNode };

const SCALE_OPTIONS = [
  { label: '真实 bundle (33 对象)', factor: 1 },
  { label: '×6 (~198 对象)', factor: 6 },
  { label: '×15 (~495 对象)', factor: 15 },
  { label: '×30 (~990 对象)', factor: 30 },
];

const EDGE_LEGEND: { category: string; label: string; color: string; dash?: string }[] = [
  { category: 'flow', label: 'flow_to / triggers', color: '#60a5fa' },
  { category: 'raci', label: 'RACI (R/A/C/I)', color: '#34d399', dash: '5 4' },
  { category: 'resource', label: 'produces / consumes', color: '#a78bfa' },
  { category: 'system', label: 'uses_system', color: '#22d3ee', dash: '6 4' },
  { category: 'exception', label: 'has_exception', color: '#f87171', dash: '3 3' },
  { category: 'derived', label: 'derived_from / …', color: '#facc15', dash: '6 3' },
];

type CanvasPerfWindow = Window & {
  __canvasPerfReport?: BrowserPerfReport;
  __canvasPerfDone?: boolean;
};

function readBenchParams(): { bench: boolean; scale: number; durationMs: number; mode: PerfMode } {
  const params = new URLSearchParams(window.location.search);
  return {
    bench: params.get('bench') === '1',
    scale: Number(params.get('scale') ?? '1') || 1,
    durationMs: Number(params.get('duration') ?? '5000') || 5000,
    mode: ((): PerfMode => {
      const m = params.get('mode');
      return m === 'idle' || m === 'pan' ? m : 'pan-zoom';
    })(),
  };
}

function Workbench(): JSX.Element {
  const bench = useMemo(readBenchParams, []);
  const baseBundle = useMemo(() => loadDemoTradeBundle(), []);

  const [factor, setFactor] = useState(bench.scale);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('view_layout');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingOps, setPendingOps] = useState<ChangeOperation[]>([]);
  const [renameValue, setRenameValue] = useState('');
  const [perf, setPerf] = useState<BrowserPerfReport | null>(null);
  const [perfRunning, setPerfRunning] = useState(false);

  const bundle = useMemo(() => amplifyBundle(baseBundle, { factor }), [baseBundle, factor]);
  // 放大副本没有 viewLayout，统一走自动布局，避免坐标重叠。
  const effectiveLayout: LayoutMode = factor === 1 ? layoutMode : 'auto';
  const projection = useMemo(
    () => projectBundle(bundle, { layout: effectiveLayout }),
    [bundle, effectiveLayout],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>(projection.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<CanvasEdge>(projection.edges);
  const { setViewport } = useReactFlow();

  const basePositions = useRef<Map<string, { x: number; y: number }>>(new Map());

  useEffect(() => {
    setNodes(projection.nodes);
    setEdges(projection.edges);
    const map = new Map<string, { x: number; y: number }>();
    for (const n of projection.nodes) map.set(n.id, { ...n.position });
    basePositions.current = map;
    setSelectedId(null);
  }, [projection, setNodes, setEdges]);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedId) ?? null,
    [nodes, selectedId],
  );
  const selectedObject = useMemo(
    () => baseBundle.modelObject.find((o) => o.id === selectedId) ?? null,
    [baseBundle, selectedId],
  );
  const selectedEvidenceCount = useMemo(
    () =>
      selectedId ? baseBundle.evidenceLink.filter((l) => l.objectId === selectedId).length : 0,
    [baseBundle, selectedId],
  );

  const handleNodeDragStop = useCallback(
    (_event: unknown, node: CanvasNode): void => {
      const before = basePositions.current.get(node.id);
      const after = node.position;
      if (!before || (before.x === after.x && before.y === after.y)) return;
      const layoutEntry = baseBundle.viewLayout.find((l) => l.objectId === node.id);
      const op = layoutDragOperation({
        objectId: node.id,
        viewId: projection.viewId ?? 'VIEW-001',
        layoutId: layoutEntry?.id ?? null,
        from: before,
        to: { x: after.x, y: after.y },
        locked: node.data.locked,
      });
      setPendingOps((prev) => [...prev, op]);
      basePositions.current.set(node.id, { x: after.x, y: after.y });
    },
    [baseBundle, projection.viewId],
  );

  const applyRename = useCallback((): void => {
    if (!selectedObject) return;
    const next = renameValue.trim();
    if (next.length === 0 || next === selectedObject.title) return;
    const sourceRefs: ChangeSource[] = baseBundle.evidenceLink
      .filter((l) => l.objectId === selectedObject.id)
      .map((l) => ({ type: 'evidence', referenceIds: [l.evidenceId] }));
    setPendingOps((prev) => [
      ...prev,
      titleUpdateOperation({ object: selectedObject, nextTitle: next, sourceRefs }),
    ]);
    setRenameValue('');
  }, [selectedObject, renameValue, baseBundle]);

  const changeSet: ChangeSet | null = useMemo(() => {
    if (pendingOps.length === 0) return null;
    const kind = pendingOps.every((o) => o.targetType === 'view_layout')
      ? 'view_layout_patch'
      : 'semantic';
    const referenceIds = [
      ...new Set(pendingOps.flatMap((o) => o.sourceRefs.flatMap((s) => s.referenceIds))),
    ];
    return createChangeSet({
      projectId: baseBundle.projectId,
      basedOnRevision: baseBundle.projectRevision,
      kind,
      reason:
        kind === 'view_layout_patch'
          ? '画布拖动产生的布局补丁（不落 revision，ADR-003 决策第 4 条）'
          : '画布语义编辑（修改对象 title）',
      source: { type: 'user_action', referenceIds },
      operations: pendingOps,
    });
  }, [pendingOps, baseBundle]);

  const runPerf = useCallback(
    async (mode: PerfMode, durationMs: number): Promise<void> => {
      setPerfRunning(true);
      const drive =
        mode === 'idle'
          ? undefined
          : (elapsed: number): void => {
              setViewport({
                x: 220 * Math.sin(elapsed / 600),
                y: 140 * Math.sin(elapsed / 900),
                zoom: mode === 'pan-zoom' ? 1 + 0.15 * Math.sin(elapsed / 700) : 1,
              });
            };
      const report = await runBrowserPerf({
        mode,
        durationMs,
        scaleFactor: factor,
        nodeCount: projection.stats.nodeCount,
        edgeCount: projection.stats.edgeCount,
        drive,
      });
      setPerf(report);
      setPerfRunning(false);
      const w = window as CanvasPerfWindow;
      w.__canvasPerfReport = report;
      w.__canvasPerfDone = true;
    },
    [factor, projection, setViewport],
  );

  // 自动化入口：?bench=1&scale=..&mode=..&duration=.. 加载后自动跑一次并写回 window。
  useEffect(() => {
    if (!bench.bench) return;
    const timer = window.setTimeout(() => {
      void runPerf(bench.mode, bench.durationMs);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [bench, runPerf]);

  const printChangeSet = useCallback((): void => {
    if (!changeSet) return;
    console.log('[ChangeSet]', serializeChangeSet(changeSet));
  }, [changeSet]);

  return (
    <div className="app">
      <header className="wb-header">
        <div>
          <h1>ReqAtlas · M0-03 2D 画布 Spike</h1>
          <p className="subtitle">
            数据源：packages/testkit/fixtures/demo-trade/model-bundle.json（经 testkit Schema 校验）
          </p>
        </div>
        <div className="wb-controls">
          <label>
            规模
            <select value={factor} onChange={(e) => setFactor(Number(e.target.value))}>
              {SCALE_OPTIONS.map((o) => (
                <option key={o.factor} value={o.factor}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            布局
            <select
              value={layoutMode}
              disabled={factor !== 1}
              onChange={(e) => setLayoutMode(e.target.value as LayoutMode)}
            >
              <option value="view_layout">使用 fixture viewLayout</option>
              <option value="auto">程序化泳道布局</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => setPendingOps([])}
            disabled={pendingOps.length === 0}
          >
            清空编辑
          </button>
        </div>
      </header>

      <div className="wb-body">
        <div className="wb-canvas">
          <ReactFlow<CanvasNode, CanvasEdge>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={(_e, node) => setSelectedId(node.id)}
            onPaneClick={() => setSelectedId(null)}
            onNodeDragStop={handleNodeDragStop}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            minZoom={0.04}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={24} color="#1e293b" />
            <Controls />
            <MiniMap pannable zoomable nodeStrokeWidth={3} />
            <ViewportPortal>
              {projection.lanes.map((lane) => (
                <div
                  key={lane.id}
                  className={`lane lane--${lane.kind}`}
                  style={{
                    left: lane.x,
                    top: lane.y,
                    width: lane.width,
                    height: lane.height,
                  }}
                >
                  <span className="lane-label">{lane.label}</span>
                </div>
              ))}
            </ViewportPortal>
          </ReactFlow>
        </div>

        <aside className="wb-panel">
          <section>
            <h2>投影统计</h2>
            <ul className="stat-list">
              <li>对象 / 节点：{projection.stats.nodeCount}</li>
              <li>
                关系 / 边：{projection.stats.edgeCount} / {projection.stats.relationCount}
              </li>
              <li>泳道：{projection.stats.laneCount}</li>
              <li>视图：{projection.viewId ?? '—'}</li>
              <li>
                适配耗时：{projection.timing.totalMs.toFixed(2)} ms（布局{' '}
                {projection.timing.layoutMs.toFixed(2)} ms）
              </li>
            </ul>
          </section>

          <section>
            <h2>属性面板</h2>
            {!selectedNode && <p className="hint">点击画布节点查看字段与 sourceStatus。</p>}
            {selectedNode && (
              <ul className="stat-list">
                <li>ID：{selectedNode.data.objectId}</li>
                <li>kind：{selectedNode.data.kind}</li>
                <li>code：{selectedNode.data.code}</li>
                <li>title：{selectedNode.data.title}</li>
                <li>
                  state：
                  <span className="badge" data-state={selectedNode.data.state}>
                    {selectedNode.data.state}
                  </span>
                </li>
                <li>
                  sourceStatus：
                  <span className="badge" style={{ color: selectedNode.data.accent }}>
                    {selectedNode.data.sourceStatus}
                  </span>
                </li>
                <li>lane：{selectedNode.data.lane}</li>
                <li>locked：{String(selectedNode.data.locked)}</li>
                <li>evidenceLink 数：{selectedEvidenceCount}</li>
                <li>
                  position：({Math.round(selectedNode.position.x)},{' '}
                  {Math.round(selectedNode.position.y)})
                </li>
              </ul>
            )}
            {selectedNode && (
              <details>
                <summary>payload</summary>
                <pre className="payload">{JSON.stringify(selectedNode.data.payload, null, 2)}</pre>
              </details>
            )}
            <div className="rename-row">
              <input
                type="text"
                placeholder="新 title…"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                disabled={!selectedNode || factor !== 1}
              />
              <button
                type="button"
                onClick={applyRename}
                disabled={!selectedObject || factor !== 1 || renameValue.trim().length === 0}
              >
                改标题
              </button>
            </div>
            {factor !== 1 && (
              <p className="hint">放大副本为程序化合成对象，语义编辑已禁用（仅用于规模测量）。</p>
            )}
          </section>

          <section>
            <h2>性能探测（浏览器）</h2>
            <div className="perf-buttons">
              <button
                type="button"
                disabled={perfRunning}
                onClick={() => void runPerf('idle', 3000)}
              >
                空转 3s
              </button>
              <button
                type="button"
                disabled={perfRunning}
                onClick={() => void runPerf('pan', 5000)}
              >
                平移压力 5s
              </button>
              <button
                type="button"
                disabled={perfRunning}
                onClick={() => void runPerf('pan-zoom', 5000)}
              >
                缩放压力 5s
              </button>
            </div>
            {perfRunning && <p className="hint">采集中…</p>}
            {perf && (
              <ul className="stat-list">
                <li>mode：{perf.mode}</li>
                <li>FPS 均值：{perf.frames.fpsMean}</li>
                <li>
                  帧时 P50 / P95：{perf.frames.frameMsP50} / {perf.frames.frameMsP95} ms
                </li>
                <li>最差 5% FPS：{perf.frames.fpsP05}</li>
                <li>
                  long task：
                  {perf.longTasks.supported
                    ? `${perf.longTasks.count} 个 / 最长 ${perf.longTasks.maxMs} ms`
                    : '不支持'}
                </li>
                <li>
                  内存：
                  {perf.memoryAfter
                    ? `${perf.memoryBefore?.usedMb ?? 0} → ${perf.memoryAfter.usedMb} MB`
                    : '未提供（非 Chromium）'}
                </li>
              </ul>
            )}
          </section>

          <section>
            <h2>图例</h2>
            <ul className="legend">
              {EDGE_LEGEND.map((l) => (
                <li key={l.category}>
                  <span
                    className="legend-line"
                    style={{ background: l.color, ...(l.dash ? { opacity: 0.9 } : {}) }}
                  />
                  {l.label}
                </li>
              ))}
            </ul>
            <ul className="legend">
              {Object.entries(SOURCE_STATUS_COLORS).map(([status, color]) => (
                <li key={status}>
                  <span className="legend-dot" style={{ background: color }} />
                  {status}
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>

      <section className="wb-changeset">
        <div className="cs-head">
          <h2>
            ChangeSet 输出
            {changeSet && (
              <span className={`cs-kind cs-kind--${changeSet.kind}`}>
                {changeSet.kind}
                {changeSet.bumpsRevision ? ' · 落 revision' : ' · 不落 revision'}
              </span>
            )}
          </h2>
          <div className="cs-actions">
            <span className="hint">{pendingOps.length} 个 operation</span>
            <button type="button" onClick={printChangeSet} disabled={!changeSet}>
              打印到控制台
            </button>
          </div>
        </div>
        {changeSet ? (
          <pre className="cs-json">{serializeChangeSet(changeSet)}</pre>
        ) : (
          <p className="hint">
            拖动节点（产生 view_layout 操作）或修改 title（产生 model_object 操作）后在此显示 §5.3
            结构的 ChangeSet JSON。
          </p>
        )}
      </section>
    </div>
  );
}

export function App(): JSX.Element {
  return (
    <ReactFlowProvider>
      <Workbench />
    </ReactFlowProvider>
  );
}
