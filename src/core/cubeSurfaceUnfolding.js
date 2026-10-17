/**
 * 立方体の表面の一部の面を、平面に広げる（最短経路用の部分展開。Three.js・DOM 非依存）
 *
 * 面の並び（例：上面 → 右の面 → 後ろの面）を、となり合う面どうしの共通の辺を軸に 90° ずつ回して、
 * はじめの面と同じ平面に広げる。6面全体の展開図（core/cubeNet）とは別に、面の一部だけを扱う。
 *
 * 回転の軸は座標軸に平行で、立方体の頂点（整数の点）を通るので、広げたあとの座標もすべて整数・有理数になる。
 */
import { FACES, EDGES, VERTICES } from './cubeConstants.js';
import { Q, qvec, vAdd, vSub, vScale, vDot, vCross, vEq } from './rational.js';
import { facesContaining } from './cubeCutting.js';

const FACE_MAP = new Map(FACES.map((f) => [f.id, f]));
const VERTEX_Q = new Map(VERTICES.map((v) => [v.id, qvec(v.position)]));

export const faceNormalQ = (faceId) => qvec(FACE_MAP.get(faceId).normal);

/** 点がのっている面（頂点なら3面、辺の上なら2面、面の内部なら1面） */
export const facesOfPoint = (p) => facesContaining(p);

const EPS = 1e-9;
const num = (x) => (x instanceof Q ? x.toNumber() : x);

/** 点が立方体の表面の上にあるか（保存した問題の小数の座標も調べられるように、わずかな誤差は許す） */
export function isOnCubeSurface(p) {
  if (!Array.isArray(p) || p.length !== 3) return false;
  const P = p.map(num);
  if (!P.every((x) => Number.isFinite(x) && Math.abs(x) <= 1 + EPS)) return false;
  return P.some((x) => Math.abs(Math.abs(x) - 1) < EPS);
}

/** 点がのっている面（小数の座標でもよい） */
export function facesOfPointApprox(p) {
  const P = p.map(num);
  return FACES.filter((f) => {
    const axis = f.normal.findIndex((x) => x !== 0);
    return Math.abs(P[axis] - f.normal[axis]) < EPS;
  }).map((f) => f.id);
}

/** 2つの面の共通の辺（となり合っていなければ null） */
export function sharedEdge(f, g) {
  const a = FACE_MAP.get(f).vertices;
  const b = FACE_MAP.get(g).vertices;
  const common = a.filter((v) => b.includes(v));
  if (common.length !== 2) return null;
  return EDGES.find((e) => e.vertices.every((v) => common.includes(v))).id;
}

/** となり合う面（4つ） */
export const adjacentFaces = (f) => FACES.filter((g) => g.id !== f && sharedEdge(f, g.id)).map((g) => g.id);

/** 点 p を、点 o を通り向き a（単位ベクトル）の直線のまわりに 90° 回す（a(a·v) + a×v） */
function rotate90(p, o, a) {
  const v = vSub(p, o);
  return vAdd(o, vAdd(vScale(a, vDot(a, v)), vCross(a, v)));
}

/** 面の上の 2D の向き（外から見て、右が e1・上が e2。e1 × e2 = 法線） */
export function faceBasis(faceId) {
  const n = faceNormalQ(faceId);
  const e2 = n[1].isZero() ? qvec([0, 1, 0]) : qvec([0, 0, -n[1].n]);
  const e1 = vCross(e2, n);
  return { normal: n, e1, e2 };
}

/**
 * 面の並びを、はじめの面の平面に広げる
 * @param {string[]} facePath となり合う面の並び
 * @returns {{ faces: string[], edges: string[], to3D(p, k): Q[], toPlane(p, k): Q[], hinges: { edge, origin: Q[], axis: Q[] }[] }}
 *   to3D(p, k)：k 番目の面の上の点 p を、広げたときの位置（3D）へ / toPlane(p, k)：広げた図の上の 2D 座標
 *   hinges[k]（k ≥ 1）：k 番目の面を k−1 番目の面の平面へ回す軸（共通の辺の上の点と向き）
 */
export function unfoldFaces(facePath) {
  if (facePath.length === 0) throw new Error('面がありません');
  const edges = [];
  const hinges = [null];
  for (let k = 1; k < facePath.length; k++) {
    const edge = sharedEdge(facePath[k - 1], facePath[k]);
    if (!edge) throw new Error(`となり合っていない面です: ${facePath[k - 1]} → ${facePath[k]}`);
    edges.push(edge);
    const origin = VERTEX_Q.get(EDGES.find((e) => e.id === edge).vertices[0]);
    const axis = vCross(faceNormalQ(facePath[k]), faceNormalQ(facePath[k - 1]));
    hinges.push({ edge, origin, axis });
  }
  const base = faceBasis(facePath[0]);
  const center = vScale(base.normal, Q.of(1)); // はじめの面の中心（法線の向きに 1）
  const to3D = (p, k) => {
    let x = qvec(p);
    for (let i = k; i >= 1; i--) x = rotate90(x, hinges[i].origin, hinges[i].axis);
    return x;
  };
  const toPlane = (p, k) => {
    const x = vSub(to3D(p, k), center);
    return [vDot(x, base.e1), vDot(x, base.e2)];
  };
  return { faces: [...facePath], edges, hinges, to3D, toPlane, basis: base };
}

/** 面の上の点を、広げた図の上の 2D 座標にする（k は面の並びの何番目か） */
export const mapSurfacePointToNet = (point, k, unfolding) => unfolding.toPlane(point, k);

/** 面の4つの頂点（外から見て反時計回り）を、広げた図の上に置く */
export function unfoldedFaceCorners(unfolding, k) {
  const face = FACE_MAP.get(unfolding.faces[k]);
  return face.vertices.map((id) => ({ vertex: id, at: unfolding.toPlane(VERTEX_Q.get(id), k) }));
}

export { vEq };
