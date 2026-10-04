import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { JSX } from 'react';
import type { CanvasNode } from './adapter';

/**
 * 单一自定义节点组件：形状/图标/强调色全部来自适配层投影的 `data.visual` 与
 * `data.accent`（由 kind / sourceStatus 决定），组件本身不含任何语义硬编码。
 *
 * 推断类来源（agent_inference / consultant_judgment）使用虚线边框，直观呈现「事实与推断分离」。
 */
export function ModelNode({ data, selected }: NodeProps<CanvasNode>): JSX.Element {
  return (
    <div
      className={`model-node${selected ? ' is-selected' : ''}${data.inferred ? ' is-inferred' : ''}`}
      data-shape={data.visual.shape}
    >
      <Handle type="target" position={Position.Left} className="mn-handle" />
      <div className="mn-frame" style={{ background: data.accent }} />
      <div className="mn-fill" />
      <div className="mn-content">
        <div className="mn-head">
          <span className="mn-icon" style={{ color: data.accent }}>
            {data.visual.icon}
          </span>
          <span className="mn-code">{data.code}</span>
          <span className="mn-state" data-state={data.state}>
            {data.state}
          </span>
        </div>
        <div className="mn-title" title={data.title}>
          {data.title}
        </div>
        <div className="mn-source" style={{ color: data.accent }}>
          {data.sourceStatus}
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="mn-handle" />
    </div>
  );
}
