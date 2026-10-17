/**
 * 立方体の表面の最短経路（Three.js・DOM 非依存）
 *
 * 表面の道は、通る面を平面に広げる（core/cubeSurfaceUnfolding）と、平面の上の線になる。
 * 1. 出発点 P と到着点 Q がのっている面を調べる
 * 2. P の面から Q の面へ、となり合う面をたどる並びを列挙する（同じ面は2回通らない）
 * 3. それぞれの並びを広げ、P と Q を直線で結ぶ
 * 4. その直線が、並びの順に共通の辺の上（両はしの頂点はふくまない）を横切るときだけ、表面の上の道として成り立つ
 *    （面の上で長さ 0 になる並びや、頂点を通る並びは、ほかの並びと同じ道なので数えない）
 * 5. 成り立つ道の長さ（直線の長さ）を比べ、いちばん短いもの（同じ長さならすべて）を最短経路とする
 * 長さは √ をふくむ正確な数（core/surd）で比べるので、同じ長さの道を正しく見分けられる。
 */
import { Q, Q0, Q1, qvec, vAdd, vSub, vScale, vKey, vLength2 } from './rational.js';
import { Surd, SurdSum } from './surd.js';
import { FACES } from './cubeConstants.js';
import { unfoldFaces, adjacentFaces, facesOfPoint, facesOfPointApprox, sharedEdge } from './cubeSurfaceUnfolding.js';
import { EDGES, VERTICES } from './cubeConstants.js';

const VERTEX_Q = new Map(VERTICES.map((v) => [v.id, qvec(v.position)]));
const edgeEnds = (edgeId) => EDGES.find((e) => e.id === edgeId).vertices.map((id) => VERTEX_Q.get(id));

/**
 * start から end へ、となり合う面をたどる並び（同じ面は2回通らない）
 * @param {number} [maxFaces] 並びの長さの上限
 */
export function enumerateFacePaths(startFace, endFace, maxFaces = 5) {
  const result = [];
  const walk = (path) => {
    const last = path.at(-1);
    if (last === endFace) {
      result.push([...path]);
      return;
    }
    if (path.length >= maxFaces) return;
    for (const next of adjacentFaces(last)) if (!path.includes(next)) walk([...path, next]);
  };
  walk([startFace]);
  return result;
}

const cross2 = (a, b) => a[0].mul(b[1]).sub(a[1].mul(b[0]));
const sub2 = (a, b) => [a[0].sub(b[0]), a[1].sub(b[1])];

/**
 * 面の並びを広げて P・Q を直線で結び、表面の上の道として成り立つか調べる
 * @returns {{ valid: boolean, faces: string[], polyline?: Q[][], length2?: Q, length?: Surd, plane?: { p: Q[], q: Q[], crossings: Q[][] }, unfolding? }}
 *   polyline：P → 共通の辺を横切る点 → … → Q（3D）
 */
export function validateUnfoldedPath(p, q, facePath) {
  const P = qvec(p);
  const Qp = qvec(q);
  const faces = facePath;
  const unfolding = unfoldFaces(faces);
  const p2 = unfolding.toPlane(P, 0);
  const q2 = unfolding.toPlane(Qp, faces.length - 1);
  const d = sub2(q2, p2);
  const polyline = [P];
  const crossings = [];
  let lastT = Q0;
  for (let k = 0; k < unfolding.edges.length; k++) {
    const [u, v] = edgeEnds(unfolding.edges[k]);
    const U = unfolding.toPlane(u, k);
    const V = unfolding.toPlane(v, k);
    const e = sub2(V, U);
    const denom = cross2(d, e);
    if (denom.isZero()) return { valid: false, faces };
    const w = sub2(U, p2);
    const t = cross2(w, e).div(denom);
    const s = cross2(w, d).div(denom);
    // 並びの順に、辺の内側（頂点をのぞく）を横切る
    if (!(t.cmp(lastT) > 0 && t.cmp(Q1) < 0 && s.sign() > 0 && s.cmp(Q1) < 0)) return { valid: false, faces };
    lastT = t;
    crossings.push([p2[0].add(d[0].mul(t)), p2[1].add(d[1].mul(t))]);
    polyline.push(vAdd(u, vScale(vSub(v, u), s)));
  }
  polyline.push(Qp);
  const length2 = d[0].mul(d[0]).add(d[1].mul(d[1]));
  return { valid: true, faces: [...faces], polyline, length2, length: Surd.sqrt(length2), plane: { p: p2, q: q2, crossings }, unfolding };
}

/** 折れ線の長さ（√ をふくむ数の和） */
export function calculatePathLength(polyline) {
  let sum = new SurdSum();
  for (let i = 0; i + 1 < polyline.length; i++) sum = sum.add(Surd.sqrt(vLength2(vSub(qvec(polyline[i + 1]), qvec(polyline[i])))));
  return sum;
}

/** 折れ線（3D）の重複判定用の文字列 */
export const polylineKey = (polyline) => polyline.map((p) => vKey(qvec(p))).join(';');

/**
 * P から Q への、表面の上の道（面の並びを広げて直線で結べるもの）と最短経路
 * @returns {{ length: Surd, length2: Q, shortest: object[], all: object[] }}
 *   all：成り立つすべての道（短い順。同じ道は1つ）/ shortest：いちばん短い道（同じ長さならすべて）
 */
export function findShortestSurfacePaths(p, q, { maxFaces = 5 } = {}) {
  const starts = facesOfPoint(p);
  const ends = facesOfPoint(q);
  if (starts.length === 0 || ends.length === 0) throw new Error('点が立方体の表面の上にありません');
  // 同じ面の上にあれば、その面の上の直線（最短）
  const common = starts.filter((f) => ends.includes(f));
  const found = new Map();
  const consider = (path) => {
    const res = validateUnfoldedPath(p, q, path);
    if (!res.valid) return;
    const key = polylineKey(res.polyline);
    const prev = found.get(key);
    if (!prev || res.faces.length < prev.faces.length) found.set(key, res);
  };
  if (common.length > 0) consider([common[0]]);
  for (const s of starts) for (const e of ends) for (const path of enumerateFacePaths(s, e, maxFaces)) if (path.length > 1) consider(path);
  const all = [...found.values()].sort((a, b) => a.length2.cmp(b.length2) || a.faces.length - b.faces.length);
  const min = all[0].length2;
  return { length: Surd.sqrt(min), length2: min, shortest: all.filter((x) => x.length2.eq(min)), all };
}

/**
 * 面の並びにそって、共通の辺の上の決めた点で折れ曲がる道（直線にならない道。まちがいの候補に使う）
 * @param {Q[][]} bends 共通の辺の上の点（並びの辺の数だけ）
 */
export function bentPath(p, q, facePath, bends) {
  const edges = facePath.slice(1).map((f, i) => sharedEdge(facePath[i], f));
  if (bends.length !== edges.length) throw new Error('折れ曲がる点の数が合いません');
  const polyline = [qvec(p), ...bends.map((b) => qvec(b)), qvec(q)];
  return { faces: [...facePath], polyline, length: calculatePathLength(polyline), bent: true };
}

/** 面の上にのる点か（面の平面の上で、範囲の中） */
export function isPointOnFace(point, faceId) {
  const f = FACES.find((x) => x.id === faceId);
  const P = qvec(point);
  const axis = f.normal.findIndex((x) => x !== 0);
  return P[axis].eq(f.normal[axis]) && P.every((x) => x.abs().cmp(1) <= 0);
}

/**
 * 折れ線が表面の上の道か（となり合う2点がいつも同じ面の上にある。小数の座標でもよい）
 */
export function isSurfacePolyline(polyline) {
  if (polyline.length < 2) return false;
  for (let i = 0; i + 1 < polyline.length; i++) {
    const a = facesOfPointApprox(polyline[i]);
    const b = facesOfPointApprox(polyline[i + 1]);
    if (!a.some((f) => b.includes(f))) return false;
  }
  return true;
}

export { Q };
