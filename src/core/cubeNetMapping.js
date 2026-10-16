/**
 * 展開図と立方体の対応（Three.js・DOM 非依存）
 *
 * 折りたたみ計算（cubeNetFolding）の結果から、
 *   - 展開図の点（格子点）→ 立方体の頂点 ID
 *   - 展開図の辺（長さ 1 の線分）→ 立方体の辺 ID
 *   - 展開図のセル → 立方体の面 ID
 * を求める。展開図の別々の点・辺が、組み立てると同じ頂点・辺に重なることがある。
 *
 * 点が2つのセルの角だけで接していて（斜めに接する）、折ると別々の頂点になる場合は、
 * その点は「あいまい」として扱い、問題のラベルには使わない。
 */
import { foldNet, cornerVertex } from './cubeNetFolding.js';
import { cellCorners, cellSides, pointKey, segmentKey, getBoundarySegments, getAdjacentCells } from './cubeNet.js';
import { resolveElement, getOppositeFace, getFacesOfEdge } from './cubeGeometry.js';

/**
 * @returns {null | {
 *   fold, cellToFace, faceToCell,
 *   points: Map<string, { key, x, y, vertex: string|null, cells: string[], boundary: boolean }>,
 *   segments: Map<string, { key, ends, edge: string, cells: string[], boundary: boolean }>,
 *   vertexToPoints: Map<string, string[]>, edgeToSegments: Map<string, string[]>,
 * }} 立方体の展開図でなければ null
 */
export function getNetMapping(cells, options) {
  const fold = foldNet(cells, options);
  if (!fold.valid) return null;
  const faceToCell = Object.fromEntries(Object.entries(fold.cellToFace).map(([c, f]) => [f, c]));

  // 点 → 頂点
  const pointVertices = new Map();
  const pointCells = new Map();
  for (const c of cells) {
    for (const corner of cellCorners(c)) {
      const k = pointKey(...corner);
      const v = cornerVertex(fold.frames, c, corner);
      pointVertices.set(k, new Set([...(pointVertices.get(k) ?? []), v]));
      pointCells.set(k, [...(pointCells.get(k) ?? []), c.id]);
    }
  }
  const boundary = getBoundarySegments(cells);
  const boundaryKeys = new Set(boundary.map((s) => s.key));
  const boundaryPoints = new Set(boundary.flatMap((s) => s.ends.map((p) => pointKey(...p))));
  const points = new Map();
  for (const [k, vs] of pointVertices) {
    const [x, y] = k.split(',').map(Number);
    points.set(k, { key: k, x, y, vertex: vs.size === 1 ? [...vs][0] : null, cells: pointCells.get(k), boundary: boundaryPoints.has(k) });
  }

  // 辺 → 立方体の辺
  const segments = new Map();
  for (const c of cells) {
    for (const [a, b] of cellSides(c)) {
      const key = segmentKey(a, b);
      const edge = resolveElement(cornerVertex(fold.frames, c, a) + cornerVertex(fold.frames, c, b)).id;
      const prev = segments.get(key);
      if (prev) prev.cells.push(c.id);
      else segments.set(key, { key, ends: [a, b], edge, cells: [c.id], boundary: boundaryKeys.has(key) });
    }
  }

  const vertexToPoints = new Map();
  for (const p of points.values()) if (p.vertex) vertexToPoints.set(p.vertex, [...(vertexToPoints.get(p.vertex) ?? []), p.key]);
  const edgeToSegments = new Map();
  for (const s of segments.values()) edgeToSegments.set(s.edge, [...(edgeToSegments.get(s.edge) ?? []), s.key]);

  return { fold, cellToFace: fold.cellToFace, faceToCell, points, segments, vertexToPoints, edgeToSegments };
}

/** 組み立てると点 key と同じ頂点にくる、ほかの点（まわりの点だけ） */
export function getCoincidentPoints(mapping, key) {
  const v = mapping.points.get(key)?.vertex;
  if (!v) return [];
  return mapping.vertexToPoints.get(v).filter((k) => k !== key && mapping.points.get(k).boundary);
}

/** 組み立てると辺 key と重なる、ほかのまわりの辺 */
export function getCoincidentSegments(mapping, key) {
  const e = mapping.segments.get(key)?.edge;
  return mapping.edgeToSegments.get(e).filter((k) => k !== key && mapping.segments.get(k).boundary);
}

/** 組み立てると向かい合う面になるセル */
export const getOppositeCell = (mapping, cellId) => mapping.faceToCell[getOppositeFace(mapping.cellToFace[cellId])];

/** 組み立てると辺を共有する（となり合う）セル（4つ） */
export function getCubeNeighborCells(mapping, cellId) {
  const face = mapping.cellToFace[cellId];
  const opposite = getOppositeFace(face);
  return Object.keys(mapping.cellToFace).filter((c) => c !== cellId && mapping.cellToFace[c] !== opposite);
}

/** 展開図の上でとなり合っているセル */
export function getNetNeighborCells(cells, cellId) {
  return getAdjacentCells(cells)
    .filter((p) => p.a === cellId || p.b === cellId)
    .map((p) => (p.a === cellId ? p.b : p.a));
}

/** 頂点に集まる立方体の辺（3本） */
export const edgesAtVertex = (vertex) => ['AB', 'BC', 'CD', 'DA', 'EF', 'FG', 'GH', 'HE', 'AE', 'BF', 'CG', 'DH'].filter((e) => e.includes(vertex));

export { getFacesOfEdge };
