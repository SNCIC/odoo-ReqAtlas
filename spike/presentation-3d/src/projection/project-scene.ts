import type { ModelBundle, ModelObject, ModelRelation, ObjectKind } from '@reqatlas/testkit';
import {
  SCENE_PROJECTION_SCHEMA_VERSION,
  sceneProjectionSchema,
  type SceneActor,
  type SceneArtifact,
  type SceneCard,
  type SceneIssue,
  type ScenePath,
  type SceneProjection,
  type SceneRegion,
  type SceneStation,
  type SceneStationKind,
  type SceneStep,
} from './scene-projection.schema';

/**
 * 确定性投影器：ModelBundle → SceneProjection。
 *
 * 确定性保证（ADR-004 决策第 5 条）：
 * - 不读取时间、不使用随机、不依赖对象输入顺序（所有集合都按稳定键排序）。
 * - 字符串比较使用与 locale 无关的码元比较，跨平台一致。
 * - 坐标统一四舍五入到 2 位小数。
 */

/** 布局常量：仅展示用途，不承载业务语义。 */
export const SCENE_LAYOUT = {
  stationSpacingX: 4,
  laneSpacingZ: 6,
  issueHeightY: 3,
  laneDepthZ: 5.6,
} as const;

export const UNGROUPED_DEPARTMENT = '未分组';

/** 参与流程拓扑的节点 kind（作为场景站点）。 */
const FLOW_STATION_KINDS: ReadonlySet<ObjectKind> = new Set<ObjectKind>([
  'start',
  'activity',
  'decision',
  'parallel',
  'wait',
  'subprocess',
  'exception',
  'end',
]);

/** 与 locale 无关的字符串比较，保证跨平台字节级一致。 */
function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function byCode<T extends { code: string }>(): (a: T, b: T) => number {
  return (a, b) => compareStrings(a.code, b.code);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function readString(payload: Record<string, unknown> | undefined, key: string): string | null {
  const value = payload?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function stepId(order: number): string {
  return `step-${String(order).padStart(3, '0')}`;
}

export function projectScene(bundle: ModelBundle): SceneProjection {
  const objects: ModelObject[] = [...bundle.modelObject];
  const objectsById = new Map<string, ModelObject>();
  for (const object of objects) objectsById.set(object.id, object);

  const relations: ModelRelation[] = [...bundle.modelRelation];
  const codeOf = (id: string): string => objectsById.get(id)?.code ?? id;

  // ---- 1. 角色与部门 ----
  const roles = objects.filter((o) => o.kind === 'role').sort(byCode());
  const departmentOf = (role: ModelObject): string =>
    readString(role.payload, 'department') ?? UNGROUPED_DEPARTMENT;

  // ---- 2. 流程站点顺序：从 start / 无入边节点出发的稳定 BFS ----
  const flowObjects = objects.filter((o) => FLOW_STATION_KINDS.has(o.kind));
  const flowRelations = relations.filter((r) => r.kind === 'flow_to');

  const adjacency = new Map<string, ModelRelation[]>();
  for (const relation of flowRelations) {
    const list = adjacency.get(relation.fromId);
    if (list) list.push(relation);
    else adjacency.set(relation.fromId, [relation]);
  }
  const neighborsSorted = (id: string): ModelRelation[] =>
    (adjacency.get(id) ?? []).slice().sort((a, b) => {
      const byTo = compareStrings(codeOf(a.toId), codeOf(b.toId));
      return byTo !== 0 ? byTo : compareStrings(a.id, b.id);
    });

  const roots = flowObjects
    .filter((o) => o.kind === 'start' || !flowRelations.some((r) => r.toId === o.id))
    .sort(byCode());

  const ordered: ModelObject[] = [];
  const visited = new Set<string>();
  const queue: ModelObject[] = [...roots];
  for (const root of roots) visited.add(root.id);
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    ordered.push(current);
    for (const relation of neighborsSorted(current.id)) {
      if (visited.has(relation.toId)) continue;
      const target = objectsById.get(relation.toId);
      if (!target || !FLOW_STATION_KINDS.has(target.kind)) continue;
      visited.add(target.id);
      queue.push(target);
    }
  }
  for (const leftover of flowObjects.filter((o) => !visited.has(o.id)).sort(byCode())) {
    ordered.push(leftover);
  }

  const columnOf = new Map<string, number>();
  ordered.forEach((object, index) => columnOf.set(object.id, index));
  const maxColumn = Math.max(0, ordered.length - 1);
  const centerX = round2((maxColumn * SCENE_LAYOUT.stationSpacingX) / 2);
  const spanX = round2(maxColumn * SCENE_LAYOUT.stationSpacingX + 4);

  // ---- 3. 站点主责角色 ----
  const incomingOf = (id: string, kind: ModelRelation['kind']): ModelRelation[] =>
    relations.filter((r) => r.toId === id && r.kind === kind);
  const rolesIncoming = (stationId: string, kind: ModelRelation['kind']): ModelObject[] =>
    incomingOf(stationId, kind)
      .map((r) => objectsById.get(r.fromId))
      .filter((o): o is ModelObject => o !== undefined && o.kind === 'role')
      .sort(byCode());

  const primaryRoleOf = (station: ModelObject): ModelObject | null => {
    const accountable = rolesIncoming(station.id, 'accountable_A');
    if (accountable.length > 0) return accountable[0] ?? null;
    const performer = rolesIncoming(station.id, 'performs_R');
    return performer[0] ?? null;
  };

  const actorIdOfRoleCode = (roleCode: string): string => `actor-${roleCode}`;

  const stationDepartment = new Map<string, string>();
  const stationActorId = new Map<string, string | null>();
  for (const station of ordered) {
    const role = primaryRoleOf(station);
    stationDepartment.set(station.id, role ? departmentOf(role) : UNGROUPED_DEPARTMENT);
    stationActorId.set(station.id, role ? actorIdOfRoleCode(role.code) : null);
  }

  // ---- 4. 区域：角色部门与站点部门的并集，按名称升序 ----
  const departmentNames = [
    ...new Set([
      ...roles.map(departmentOf),
      ...ordered.map((o) => stationDepartment.get(o.id) ?? UNGROUPED_DEPARTMENT),
    ]),
  ].sort(compareStrings);

  const departmentIndex = new Map<string, number>();
  departmentNames.forEach((name, index) => departmentIndex.set(name, index));
  const regionIdOfDepartment = (department: string): string => `region-${department}`;
  const regionZOfDepartment = (department: string): number =>
    round2((departmentIndex.get(department) ?? 0) * SCENE_LAYOUT.laneSpacingZ);

  const issuesLaneZ = round2(departmentNames.length * SCENE_LAYOUT.laneSpacingZ);
  const artifactsLaneZ = round2(issuesLaneZ + SCENE_LAYOUT.laneSpacingZ);

  const regions: SceneRegion[] = departmentNames.map((department) => {
    const departmentRoles = roles.filter((role) => departmentOf(role) === department);
    return {
      id: regionIdOfDepartment(department),
      label: department,
      department,
      roleObjectIds: departmentRoles.map((role) => role.id),
      actorIds: departmentRoles.map((role) => actorIdOfRoleCode(role.code)),
      position: { x: centerX, y: 0, z: regionZOfDepartment(department) },
      size: { x: spanX, y: 0.4, z: SCENE_LAYOUT.laneDepthZ },
    };
  });
  const regionIdOf = (department: string): string => regionIdOfDepartment(department);

  // ---- 5. 演员：来自 role，按 code 升序 ----
  const actors: SceneActor[] = roles.map((role) => {
    const department = departmentOf(role);
    const siblings = roles.filter((r) => departmentOf(r) === department).map((r) => r.code);
    const offset = siblings.indexOf(role.code) - (siblings.length - 1) / 2;
    return {
      id: actorIdOfRoleCode(role.code),
      sourceObjectId: role.id,
      code: role.code,
      label: role.title,
      department,
      regionId: regionIdOf(department),
      position: {
        x: round2(centerX + offset * 3),
        y: 0,
        z: round2(regionZOfDepartment(department) - 2.2),
      },
    };
  });
  const actorLabelById = new Map(actors.map((actor) => [actor.id, actor.label]));

  // ---- 6. 站点 ----
  const stations: SceneStation[] = ordered.map((station) => {
    const department = stationDepartment.get(station.id) ?? UNGROUPED_DEPARTMENT;
    return {
      id: `station-${station.code}`,
      sourceObjectId: station.id,
      code: station.code,
      label: station.title,
      stationKind: station.kind as SceneStationKind,
      regionId: regionIdOf(department),
      actorId: stationActorId.get(station.id) ?? null,
      order: columnOf.get(station.id) ?? 0,
      position: {
        x: round2((columnOf.get(station.id) ?? 0) * SCENE_LAYOUT.stationSpacingX),
        y: 0.5,
        z: regionZOfDepartment(department),
      },
    };
  });
  const stationIdByObjectId = new Map(stations.map((s) => [s.sourceObjectId, s.id]));
  const stationPositionById = new Map(stations.map((s) => [s.id, s.position]));

  // ---- 7. 路径：flow_to，按 (fromCode, toCode, id) 稳定排序 ----
  const paths: ScenePath[] = flowRelations
    .slice()
    .sort((a, b) => {
      const byFrom = compareStrings(codeOf(a.fromId), codeOf(b.fromId));
      if (byFrom !== 0) return byFrom;
      const byTo = compareStrings(codeOf(a.toId), codeOf(b.toId));
      return byTo !== 0 ? byTo : compareStrings(a.id, b.id);
    })
    .map((relation) => {
      const fromStationId = stationIdByObjectId.get(relation.fromId);
      const toStationId = stationIdByObjectId.get(relation.toId);
      if (!fromStationId || !toStationId) return null;
      const from = stationPositionById.get(fromStationId);
      const to = stationPositionById.get(toStationId);
      if (!from || !to) return null;
      const relationLabel = relation.label?.trim() ?? '';
      const label = relationLabel.length > 0 ? relationLabel : null;
      const condition =
        relationLabel.length > 0 ? relationLabel : readString(relation.payload, 'condition');
      const points = [
        { x: from.x, y: from.y, z: from.z },
        {
          x: round2((from.x + to.x) / 2),
          y: round2(Math.max(from.y, to.y) + 0.8),
          z: round2((from.z + to.z) / 2),
        },
        { x: to.x, y: to.y, z: to.z },
      ];
      return {
        id: `path-${relation.id}`,
        sourceRelationId: relation.id,
        fromStationId,
        toStationId,
        label,
        condition,
        points,
      } satisfies ScenePath;
    })
    .filter((path): path is ScenePath => path !== null);

  // ---- 8. 问题：problem，并回溯 derived_from 关联需求 ----
  const requirementsByProblem = new Map<string, string[]>();
  for (const relation of relations) {
    if (relation.kind !== 'derived_from') continue;
    const from = objectsById.get(relation.fromId);
    if (!from || from.kind !== 'requirement') continue;
    const list = requirementsByProblem.get(relation.toId);
    if (list) list.push(from.code);
    else requirementsByProblem.set(relation.toId, [from.code]);
  }

  const issues: SceneIssue[] = objects
    .filter((o) => o.kind === 'problem')
    .sort(byCode())
    .map((problem, index) => ({
      id: `issue-${problem.code}`,
      sourceObjectId: problem.id,
      code: problem.code,
      label: problem.title,
      impact: readString(problem.payload, 'impact'),
      relatedRequirementIds: (requirementsByProblem.get(problem.id) ?? [])
        .slice()
        .sort(compareStrings),
      position: {
        x: round2(index * SCENE_LAYOUT.stationSpacingX),
        y: SCENE_LAYOUT.issueHeightY,
        z: issuesLaneZ,
      },
    }));

  // ---- 9. 交付物：data_object，并回溯 produces / consumes ----
  const producersByArtifact = new Map<string, string[]>();
  const consumersByArtifact = new Map<string, string[]>();
  for (const relation of relations) {
    if (relation.kind !== 'produces' && relation.kind !== 'consumes') continue;
    const target = objectsById.get(relation.toId);
    const source = objectsById.get(relation.fromId);
    if (!target || target.kind !== 'data_object') continue;
    if (!source || !FLOW_STATION_KINDS.has(source.kind)) continue;
    const targetMap = relation.kind === 'produces' ? producersByArtifact : consumersByArtifact;
    const list = targetMap.get(target.id);
    if (list) list.push(source.id);
    else targetMap.set(target.id, [source.id]);
  }
  const toStationIds = (objectIds: string[]): string[] =>
    objectIds
      .map((objectId) => stationIdByObjectId.get(objectId))
      .filter((stationId): stationId is string => stationId !== undefined)
      .sort(compareStrings);

  const artifacts: SceneArtifact[] = objects
    .filter((o) => o.kind === 'data_object')
    .sort(byCode())
    .map((artifact, index) => ({
      id: `artifact-${artifact.code}`,
      sourceObjectId: artifact.id,
      code: artifact.code,
      label: artifact.title,
      docType: readString(artifact.payload, 'docType'),
      producedByStationIds: toStationIds(producersByArtifact.get(artifact.id) ?? []),
      consumedByStationIds: toStationIds(consumersByArtifact.get(artifact.id) ?? []),
      position: {
        x: round2(index * SCENE_LAYOUT.stationSpacingX),
        y: SCENE_LAYOUT.issueHeightY,
        z: artifactsLaneZ,
      },
    }));

  // ---- 10. 故事步骤：总览 + 站点 + 问题 ----
  const artifactTitlesByProducer = new Map<string, string[]>();
  for (const artifact of objects.filter((o) => o.kind === 'data_object')) {
    for (const objectId of producersByArtifact.get(artifact.id) ?? []) {
      const list = artifactTitlesByProducer.get(objectId);
      if (list) list.push(artifact.title);
      else artifactTitlesByProducer.set(objectId, [artifact.title]);
    }
  }

  const steps: SceneStep[] = [];
  let order = 0;
  steps.push({
    id: stepId(order),
    order,
    title: `场景总览：${bundle.projectId}`,
    narration: `本场景包含 ${regions.length} 个区域、${actors.length} 个角色、${stations.length} 个站点，共 ${paths.length} 条流转路径、${issues.length} 个问题与 ${artifacts.length} 个交付物。`,
    focusKind: 'overview',
    focusId: bundle.projectId,
    stationId: null,
  });
  order += 1;

  for (const station of stations) {
    const actorLabel = station.actorId
      ? (actorLabelById.get(station.actorId) ?? '未指定角色')
      : '未指定角色';
    const produced = (artifactTitlesByProducer.get(station.sourceObjectId) ?? [])
      .slice()
      .sort(compareStrings);
    const producedText = produced.length > 0 ? `，产出 ${produced.join('、')}` : '';
    steps.push({
      id: stepId(order),
      order,
      title: `${station.code} ${station.label}`,
      narration: `站点「${station.label}」由${actorLabel}负责${producedText}。`,
      focusKind: 'station',
      focusId: station.id,
      stationId: station.id,
    });
    order += 1;
  }

  for (const issue of issues) {
    steps.push({
      id: stepId(order),
      order,
      title: `问题 ${issue.code}`,
      narration: `问题「${issue.label}」${issue.impact ? `，影响：${issue.impact}` : ''}。${
        issue.relatedRequirementIds.length > 0
          ? `相关需求：${issue.relatedRequirementIds.join('、')}。`
          : '暂无关联需求。'
      }`,
      focusKind: 'issue',
      focusId: issue.id,
      stationId: null,
    });
    order += 1;
  }

  // ---- 11. 对象卡：通俗说明，供拾取与 2D 列表复用 ----
  const stationLabelById = new Map(stations.map((s) => [s.id, `${s.code} ${s.label}`]));
  const cards: SceneCard[] = [];

  for (const actor of actors) {
    const owned = stations.filter((s) => s.actorId === actor.id).length;
    cards.push({
      id: actor.id,
      objectId: actor.sourceObjectId,
      kind: 'actor',
      code: actor.code,
      title: actor.label,
      summary: `角色「${actor.label}」属于${actor.department}，共负责 ${owned} 个流程站点。`,
    });
  }
  for (const station of stations) {
    const actorLabel = station.actorId
      ? (actorLabelById.get(station.actorId) ?? '未指定角色')
      : '未指定角色';
    const stationArtifacts = artifacts
      .filter(
        (a) =>
          a.producedByStationIds.includes(station.id) ||
          a.consumedByStationIds.includes(station.id),
      )
      .map((a) => a.label)
      .sort(compareStrings);
    cards.push({
      id: station.id,
      objectId: station.sourceObjectId,
      kind: station.stationKind,
      code: station.code,
      title: station.label,
      summary: `流程节点「${station.code} ${station.label}」主责角色：${actorLabel}。${
        stationArtifacts.length > 0
          ? `相关交付物：${stationArtifacts.join('、')}。`
          : '暂无相关交付物。'
      }`,
    });
  }
  for (const issue of issues) {
    cards.push({
      id: issue.id,
      objectId: issue.sourceObjectId,
      kind: 'issue',
      code: issue.code,
      title: issue.label,
      summary: `问题「${issue.label}」。${issue.impact ? `影响：${issue.impact}。` : ''}${
        issue.relatedRequirementIds.length > 0
          ? `相关需求：${issue.relatedRequirementIds.join('、')}。`
          : '暂无关联需求。'
      }`,
    });
  }
  for (const artifact of artifacts) {
    const producers = artifact.producedByStationIds
      .map((id) => stationLabelById.get(id) ?? id)
      .sort(compareStrings);
    cards.push({
      id: artifact.id,
      objectId: artifact.sourceObjectId,
      kind: 'artifact',
      code: artifact.code,
      title: artifact.label,
      summary: `交付物「${artifact.label}」${artifact.docType ? `（${artifact.docType}）` : ''}。${
        producers.length > 0 ? `产出节点：${producers.join('、')}。` : '暂无产出节点。'
      }`,
    });
  }
  cards.sort((a, b) => compareStrings(a.id, b.id));

  return sceneProjectionSchema.parse({
    schemaVersion: SCENE_PROJECTION_SCHEMA_VERSION,
    projectId: bundle.projectId,
    projectRevision: bundle.projectRevision,
    regions,
    actors,
    stations,
    paths,
    issues,
    artifacts,
    steps,
    cards,
  });
}
