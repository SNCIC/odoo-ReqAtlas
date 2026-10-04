import { Line, OrbitControls } from '@react-three/drei';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { useMemo, type JSX } from 'react';
import type {
  SceneActor,
  SceneArtifact,
  SceneIssue,
  ScenePath,
  SceneProjection,
  SceneRegion,
  SceneStation,
  SceneStationKind,
  SceneVector3,
} from '../projection/scene-projection.schema';

/**
 * 低多边形 3D 导览（ADR-004 决策第 3 条）：
 * 只消费 SceneProjection；不做写实办公室 / 数字人 / 物理仿真。
 * 支持轨道浏览（旋转/平移/缩放）与点击拾取。
 */

const STATION_COLORS: Record<SceneStationKind, string> = {
  start: '#22c55e',
  activity: '#3b82f6',
  decision: '#f59e0b',
  parallel: '#a855f7',
  wait: '#94a3b8',
  subprocess: '#0ea5e9',
  exception: '#ef4444',
  end: '#16a34a',
};

const SELECTED_COLOR = '#f8fafc';

function toTuple(point: SceneVector3): [number, number, number] {
  return [point.x, point.y, point.z];
}

function RegionMesh({ region }: { region: SceneRegion }): JSX.Element {
  return (
    <group>
      <mesh position={[region.position.x, -region.size.y / 2, region.position.z]}>
        <boxGeometry args={[region.size.x, region.size.y, region.size.z]} />
        <meshStandardMaterial color="#1e293b" transparent opacity={0.4} />
      </mesh>
      <mesh position={[region.position.x, 0.02, region.position.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[region.size.x, region.size.z]} />
        <meshStandardMaterial color="#0f172a" transparent opacity={0.55} />
      </mesh>
    </group>
  );
}

function ActorMesh({
  actor,
  selected,
  onSelect,
}: {
  actor: SceneActor;
  selected: boolean;
  onSelect: (id: string) => void;
}): JSX.Element {
  return (
    <group
      position={[actor.position.x, 0, actor.position.z]}
      onClick={(event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        onSelect(actor.id);
      }}
    >
      <mesh position={[0, 1, 0]}>
        <cylinderGeometry args={[0.35, 0.5, 2, 16]} />
        <meshStandardMaterial color={selected ? SELECTED_COLOR : '#38bdf8'} />
      </mesh>
      <mesh position={[0, 2.35, 0]}>
        <sphereGeometry args={[0.4, 16, 16]} />
        <meshStandardMaterial color="#e2e8f0" />
      </mesh>
    </group>
  );
}

function StationMesh({
  station,
  selected,
  onSelect,
}: {
  station: SceneStation;
  selected: boolean;
  onSelect: (id: string) => void;
}): JSX.Element {
  const color = selected ? SELECTED_COLOR : STATION_COLORS[station.stationKind];
  let geometry: JSX.Element;
  if (station.stationKind === 'decision') {
    geometry = <octahedronGeometry args={[0.95]} />;
  } else if (station.stationKind === 'start' || station.stationKind === 'end') {
    geometry = <sphereGeometry args={[0.7, 16, 16]} />;
  } else if (station.stationKind === 'exception') {
    geometry = <coneGeometry args={[0.7, 1.4, 16]} />;
  } else {
    geometry = <boxGeometry args={[1.6, 1, 1.6]} />;
  }

  return (
    <group
      position={toTuple(station.position)}
      onClick={(event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        onSelect(station.id);
      }}
    >
      <mesh>
        {geometry}
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

function PathLine({ path }: { path: ScenePath }): JSX.Element {
  return (
    <Line
      points={path.points.map(toTuple)}
      color={path.label ? '#f472b6' : '#64748b'}
      lineWidth={path.label ? 2.5 : 1.5}
    />
  );
}

function IssueMesh({
  issue,
  selected,
  onSelect,
}: {
  issue: SceneIssue;
  selected: boolean;
  onSelect: (id: string) => void;
}): JSX.Element {
  return (
    <mesh
      position={toTuple(issue.position)}
      onClick={(event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        onSelect(issue.id);
      }}
    >
      <tetrahedronGeometry args={[0.9]} />
      <meshStandardMaterial color={selected ? SELECTED_COLOR : '#fb923c'} />
    </mesh>
  );
}

function ArtifactMesh({
  artifact,
  selected,
  onSelect,
}: {
  artifact: SceneArtifact;
  selected: boolean;
  onSelect: (id: string) => void;
}): JSX.Element {
  return (
    <mesh
      position={toTuple(artifact.position)}
      rotation={[Math.PI / 4, Math.PI / 4, 0]}
      onClick={(event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        onSelect(artifact.id);
      }}
    >
      <boxGeometry args={[1.2, 1.2, 1.2]} />
      <meshStandardMaterial color={selected ? SELECTED_COLOR : '#c084fc'} wireframe />
    </mesh>
  );
}

export interface Scene3DProps {
  projection: SceneProjection;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onReady?: () => void;
}

export function Scene3D({ projection, selectedId, onSelect, onReady }: Scene3DProps): JSX.Element {
  const { cameraPosition, target } = useMemo(() => {
    const allPoints: SceneVector3[] = [
      ...projection.stations.map((station) => station.position),
      ...projection.actors.map((actor) => actor.position),
      ...projection.issues.map((issue) => issue.position),
      ...projection.artifacts.map((artifact) => artifact.position),
    ];
    const maxX = Math.max(0, ...allPoints.map((point) => point.x));
    const maxZ = Math.max(0, ...allPoints.map((point) => point.z));
    return {
      cameraPosition: [maxX / 2, Math.max(16, maxZ * 1.4), maxZ + 16] as [number, number, number],
      target: [maxX / 2, 0, maxZ / 2] as [number, number, number],
    };
  }, [projection]);

  return (
    <div className="scene-3d" aria-label="3D 导览画布">
      <Canvas
        camera={{ position: cameraPosition, fov: 50 }}
        onCreated={() => onReady?.()}
        onPointerMissed={() => onSelect(null)}
      >
        <color attach="background" args={['#020617']} />
        <ambientLight intensity={0.7} />
        <hemisphereLight args={['#cbd5e1', '#0f172a', 0.6]} />
        <directionalLight position={[cameraPosition[0], 24, 12]} intensity={1.1} />
        <gridHelper args={[120, 60, '#334155', '#1e293b']} position={[target[0], 0, target[2]]} />
        {projection.regions.map((region) => (
          <RegionMesh key={region.id} region={region} />
        ))}
        {projection.paths.map((path) => (
          <PathLine key={path.id} path={path} />
        ))}
        {projection.actors.map((actor) => (
          <ActorMesh
            key={actor.id}
            actor={actor}
            selected={selectedId === actor.id}
            onSelect={onSelect}
          />
        ))}
        {projection.stations.map((station) => (
          <StationMesh
            key={station.id}
            station={station}
            selected={selectedId === station.id}
            onSelect={onSelect}
          />
        ))}
        {projection.issues.map((issue) => (
          <IssueMesh
            key={issue.id}
            issue={issue}
            selected={selectedId === issue.id}
            onSelect={onSelect}
          />
        ))}
        {projection.artifacts.map((artifact) => (
          <ArtifactMesh
            key={artifact.id}
            artifact={artifact}
            selected={selectedId === artifact.id}
            onSelect={onSelect}
          />
        ))}
        <OrbitControls target={target} enableDamping makeDefault />
      </Canvas>
    </div>
  );
}
