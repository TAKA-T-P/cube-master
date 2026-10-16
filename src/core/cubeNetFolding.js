/**
 * 展開図の折りたたみ（Three.js・DOM 非依存）
 *
 * 基準のセルを立方体の上面（y = +1、面 ABCD の位置）に平らに置き、となりのセルを共有する辺を軸に
 * 90° ずつ下へ（見ている人から遠ざかる向きへ）折る。これを BFS でたどってすべてのセルの位置を求める。
 * 上から見えている側が、組み立てたあとの立方体の外側になる。
 *
 * 各セルの位置は「展開図の点 (u, v) → 3D の点 O + u·U + v·V」で表す（O・U・V は整数ベクトル）。
 * 立方体は README の座標系（中心が原点・一辺 2）に一致する。
 */
import { FACES, VERTICES } from './cubeConstants.js';
import { getAdjacentCells, hasOverlappingCells, isNetConnected, cellCorners, pointKey } from './cubeNet.js';

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const eq = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
const unit = (v) => {
  const len = Math.abs(v[0]) + Math.abs(v[1]) + Math.abs(v[2]); // 軸に平行なベクトルだけを扱う
  return scale(v, 1 / len);
};

/** 展開図の点 → 3D の点 */
export const mapPoint = (frame, [u, v]) => add(frame.O, add(scale(frame.U, u), scale(frame.V, v)));

/**
 * 軸 axis（単位ベクトル）まわりの 90° 回転。sign = +1 / -1
 * 右ねじの向きが正：R v = (a·v) a + sign (a × v)
 */
const rotate90 = (axis, sign, v) => add(scale(axis, dot(axis, v)), scale(cross(axis, v), sign));

/** 折る順番の木（BFS）。基準のセルを省略すると、となりの多いセルを選ぶ */
export function buildFoldTree(cells, rootId) {
  const adjacency = getAdjacentCells(cells);
  const neighbors = new Map(cells.map((c) => [c.id, []]));
  for (const p of adjacency) {
    neighbors.get(p.a).push({ id: p.b, edge: p.edge });
    neighbors.get(p.b).push({ id: p.a, edge: p.edge });
  }
  const root = rootId ?? [...cells].sort((a, b) => neighbors.get(b.id).length - neighbors.get(a.id).length || (a.id < b.id ? -1 : 1))[0].id;
  const parent = { [root]: null };
  const edge = { [root]: null };
  const depth = { [root]: 0 };
  const order = [root];
  for (let i = 0; i < order.length; i++) {
    for (const n of neighbors.get(order[i])) {
      if (n.id in parent) continue;
      parent[n.id] = order[i];
      edge[n.id] = n.edge;
      depth[n.id] = depth[order[i]] + 1;
      order.push(n.id);
    }
  }
  const treeKeys = new Set(order.filter((id) => parent[id]).map((id) => [id, parent[id]].sort().join('|')));
  const extraAdjacency = adjacency.filter((p) => !treeKeys.has([p.a, p.b].sort().join('|')));
  return { root, parent, edge, depth, order, extraAdjacency };
}

const vertexByPosition = new Map(VERTICES.map((v) => [v.position.join(','), v.id]));
const faceByNormal = new Map(FACES.map((f) => [f.normal.join(','), f.id]));

/**
 * 展開図を折りたたむ
 * @returns {{
 *   valid: boolean, reason: string|null, message: string, problemCells: string[],
 *   tree, frames: Record<string, {O,U,V,inward,outward,center}>, cellToFace: Record<string,string>
 * }}
 *   reason: 'count'（6マスでない）| 'overlap-cells'（同じ位置のマス）| 'disconnected'（はなれている）
 *         | 'faces-overlap'（折ると面が重なる）| 'edge-conflict'（となりの辺が合わない）| null
 */
export function foldNet(cells, { rootId } = {}) {
  const fail = (reason, message, problemCells = [], extra = {}) => ({ valid: false, reason, message, problemCells, frames: {}, cellToFace: {}, ...extra });
  if (cells.length !== 6) return fail('count', `マスが${cells.length}個です（立方体の展開図は6個）。`, cells.map((c) => c.id));
  if (hasOverlappingCells(cells)) return fail('overlap-cells', '同じ場所にマスが重なっています。');
  if (!isNetConnected(cells)) return fail('disconnected', 'マスが1つにつながっていません。', cells.map((c) => c.id));

  const tree = buildFoldTree(cells, rootId);
  const byId = new Map(cells.map((c) => [c.id, c]));
  const root = byId.get(tree.root);
  const frames = {
    [root.id]: { O: [-1 - 2 * root.x, 1, -1 - 2 * root.y], U: [2, 0, 0], V: [0, 0, 2], inward: [0, -1, 0] },
  };
  for (const id of tree.order.slice(1)) {
    const parentFrame = frames[tree.parent[id]];
    const [e0, e1] = tree.edge[id];
    const P0 = mapPoint(parentFrame, e0);
    const P1 = mapPoint(parentFrame, e1);
    const axis = unit(sub(P1, P0));
    const cell = byId.get(id);
    // 折る前（親と同じ平面）のセルの中心が、軸からどちらへ出ているか
    const centerFlat = mapPoint(parentFrame, [cell.x + 0.5, cell.y + 0.5]);
    const w = sub(centerFlat, P0);
    const out = unit(sub(w, scale(axis, dot(w, axis))));
    // 90° 回して、セルが親の内側（立方体の中心側）へ向かう向き
    const sign = eq(cross(axis, out), parentFrame.inward) ? 1 : -1;
    const R = (v) => rotate90(axis, sign, v);
    frames[id] = {
      O: add(P0, R(sub(parentFrame.O, P0))),
      U: R(parentFrame.U),
      V: R(parentFrame.V),
      inward: R(parentFrame.inward),
    };
  }
  for (const c of cells) {
    const f = frames[c.id];
    f.outward = f.inward.map((n) => (n === 0 ? 0 : -n)); // -0 を作らない
    f.center = mapPoint(f, [c.x + 0.5, c.y + 0.5]);
  }

  // 折ったあと、同じ場所にくる面がないか
  const byCenter = new Map();
  for (const c of cells) {
    const k = frames[c.id].center.join(',');
    byCenter.set(k, [...(byCenter.get(k) ?? []), c.id]);
  }
  const overlapping = [...byCenter.values()].filter((ids) => ids.length > 1).flat();
  if (overlapping.length > 0) {
    return fail('faces-overlap', '折りたたむと、2つ以上の面が同じ場所に重なってしまいます。', overlapping, { tree, frames });
  }
  // となり合うのに折る順番で使わなかった辺も、3D で同じ位置にくるか
  for (const p of tree.extraAdjacency) {
    const a = p.edge.map((pt) => mapPoint(frames[p.a], pt));
    const b = p.edge.map((pt) => mapPoint(frames[p.b], pt));
    if (!(eq(a[0], b[0]) && eq(a[1], b[1]))) return fail('edge-conflict', 'となり合うマスの辺が、組み立てたあとに合いません。', [p.a, p.b], { tree, frames });
  }
  // すべての面が立方体の面の位置にあり、角が立方体の頂点にある
  const cellToFace = {};
  for (const c of cells) {
    const f = frames[c.id];
    const faceId = faceByNormal.get(f.outward.join(','));
    if (!faceId || !eq(f.center, f.outward)) return fail('faces-overlap', '面が立方体の位置にきません。', [c.id], { tree, frames });
    for (const corner of cellCorners(c)) {
      if (!vertexByPosition.has(mapPoint(f, corner).join(','))) return fail('edge-conflict', '角が立方体の頂点に合いません。', [c.id], { tree, frames });
    }
    cellToFace[c.id] = faceId;
  }
  return { valid: true, reason: null, message: '立方体になります。', problemCells: [], tree, frames, cellToFace };
}

/** 立方体の展開図になるか */
export const isCubeNet = (cells) => foldNet(cells).valid;

/** セルの角（展開図の点）が組み立て後にくる頂点 ID */
export function cornerVertex(frames, cell, corner) {
  return vertexByPosition.get(mapPoint(frames[cell.id], corner).join(',')) ?? null;
}

export { pointKey };
