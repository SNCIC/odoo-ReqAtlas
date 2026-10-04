import type { SceneProjection } from '../projection/scene-projection.schema';

/**
 * 文本等价表达（实施方案 §7.1 / ADR-004 §3.3）：
 * 3D 不承载独占信息——所有 3D 实体与故事步骤都能在这里以列表形式表达。
 */

export interface TextSection {
  id: string;
  title: string;
  lines: string[];
}

export function buildTextEquivalent(projection: SceneProjection): TextSection[] {
  const regionLabel = new Map(projection.regions.map((region) => [region.id, region.label]));
  const actorLabel = new Map(projection.actors.map((actor) => [actor.id, actor.label]));
  const stationLabel = new Map(
    projection.stations.map((station) => [station.id, `${station.code} ${station.label}`]),
  );

  return [
    {
      id: 'regions',
      title: `区域（${projection.regions.length}）`,
      lines: projection.regions.map(
        (region) => `${region.label}：包含 ${region.actorIds.length} 个角色。`,
      ),
    },
    {
      id: 'actors',
      title: `角色（${projection.actors.length}）`,
      lines: projection.actors.map(
        (actor) => `${actor.code} ${actor.label}（${actor.department}）`,
      ),
    },
    {
      id: 'stations',
      title: `站点（${projection.stations.length}）`,
      lines: projection.stations.map(
        (station) =>
          `${station.order}. ${station.code} ${station.label} [${station.stationKind}] 区域=${regionLabel.get(station.regionId) ?? station.regionId} 主责=${
            station.actorId ? (actorLabel.get(station.actorId) ?? station.actorId) : '未指定'
          }`,
      ),
    },
    {
      id: 'paths',
      title: `路径（${projection.paths.length}）`,
      lines: projection.paths.map(
        (path) =>
          `${stationLabel.get(path.fromStationId) ?? path.fromStationId} → ${
            stationLabel.get(path.toStationId) ?? path.toStationId
          }${path.label ? `（${path.label}）` : ''}`,
      ),
    },
    {
      id: 'issues',
      title: `问题（${projection.issues.length}）`,
      lines: projection.issues.map(
        (issue) => `${issue.code} ${issue.label}${issue.impact ? `（影响：${issue.impact}）` : ''}`,
      ),
    },
    {
      id: 'artifacts',
      title: `交付物（${projection.artifacts.length}）`,
      lines: projection.artifacts.map(
        (artifact) =>
          `${artifact.code} ${artifact.label}${artifact.docType ? `（${artifact.docType}）` : ''}`,
      ),
    },
    {
      id: 'steps',
      title: `故事步骤（${projection.steps.length}）`,
      lines: projection.steps.map((step) => `${step.order}. ${step.title}：${step.narration}`),
    },
  ];
}
