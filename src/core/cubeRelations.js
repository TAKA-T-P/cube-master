/**
 * 辺・面の位置関係（Three.js 非依存）
 *
 * 正解を手で列挙せず、座標とベクトルから計算する。座標が将来小数になっても
 * 判定がぶれないよう、内積・外積の比較には許容誤差 EPSILON を使う。
 *
 * 用語の定義（中学数学に合わせる）
 * - 辺と辺が「平行」 : 異なる2辺が同じ向きで、同じ直線上にない。自分自身は含めない
 * - 辺と辺が「交わる」: 既定では線分どうしが共有点をもつ（立方体では共通の頂点）。
 *                        { as: 'line' } を指定すると、延長した直線どうしの交わりを判定する
 * - 辺と辺が「垂直」 : 交わって、かつ向きが直角（ねじれの位置で直角のものは含めない）
 * - 「ねじれの位置」  : 同じ平面上にない2直線（平行でも交わりもしない）
 * - 辺が面に「含まれる」: 辺の両端が面をふくむ平面上にある
 * - 辺と面が「平行」 : 辺の向きが面に沿っていて、面に含まれない
 * - 辺と面が「垂直」 : 辺の向きが面の法線と同じ（または逆）
 */
import { EDGES, FACES, VERTICES, ELEMENT_TYPES } from './cubeConstants.js';
import {
  resolveElementOfType,
  getEdgeEndpoints,
  getFaceNormal,
  getFaceCenter,
  getEdge,
  getFace,
  vecSub,
  vecAdd,
  vecScale,
  vecDot,
  vecCross,
  vecLength,
} from './cubeGeometry.js';

/** 数値比較の許容誤差 */
export const EPSILON = 1e-9;

const isZero = (x) => Math.abs(x) <= EPSILON;
const isZeroVec = (v) => vecLength(v) <= EPSILON;
const unit = (v) => vecScale(v, 1 / vecLength(v));

function edgeData(input) {
  const id = resolveElementOfType(input, ELEMENT_TYPES.EDGE);
  const [p, q] = getEdgeEndpoints(id);
  return { id, p, q, d: unit(vecSub(q, p)), length: vecLength(vecSub(q, p)) };
}

function faceData(input) {
  const id = resolveElementOfType(input, ELEMENT_TYPES.FACE);
  return { id, n: unit(getFaceNormal(id)), c: getFaceCenter(id) };
}

/** 2つの向き（単位ベクトル）が平行か */
const sameDirection = (u, v) => isZeroVec(vecCross(u, v));

// ---------- 辺と辺 ----------

/** 2辺をふくむ直線が同じ平面上にあるか */
export function areEdgesCoplanar(a, b) {
  const A = edgeData(a);
  const B = edgeData(b);
  const cross = vecCross(A.d, B.d);
  if (isZeroVec(cross)) return true; // 平行な2直線は必ず同じ平面上にある
  return isZero(vecDot(unit(cross), vecSub(B.p, A.p)));
}

/** 2辺が平行か（自分自身・同じ直線上の辺は含めない） */
export function areEdgesParallel(a, b) {
  const A = edgeData(a);
  const B = edgeData(b);
  if (A.id === B.id) return false;
  return sameDirection(A.d, B.d) && !isZeroVec(vecCross(A.d, vecSub(B.p, A.p)));
}

/**
 * 2辺が交わるか（自分自身は含めない）
 * @param {{ as?: 'segment'|'line' }} [options] segment: 線分として（既定） / line: 延長した直線として
 */
export function doEdgesIntersect(a, b, { as = 'segment' } = {}) {
  const A = edgeData(a);
  const B = edgeData(b);
  if (A.id === B.id) return false;
  if (as === 'line') return !sameDirection(A.d, B.d) && areEdgesCoplanar(A.id, B.id);
  return segmentDistance(A, B) <= EPSILON;
}

/** 2辺が垂直か（交わって直角。as は doEdgesIntersect と同じ） */
export function areEdgesPerpendicular(a, b, { as = 'segment' } = {}) {
  const A = edgeData(a);
  const B = edgeData(b);
  return isZero(vecDot(A.d, B.d)) && doEdgesIntersect(A.id, B.id, { as });
}

/** 2辺がねじれの位置にあるか */
export function areEdgesSkew(a, b) {
  const A = edgeData(a);
  const B = edgeData(b);
  if (A.id === B.id) return false;
  return !areEdgesCoplanar(A.id, B.id);
}

/**
 * 2辺の位置関係を分類する
 * @returns {'same'|'parallel'|'intersecting'|'skew'|'coplanar'}
 *   coplanar = 同じ平面上だが線分としては交わらない（立方体の辺どうしでは起こらない）
 */
export function classifyEdgePair(a, b) {
  const A = edgeData(a);
  const B = edgeData(b);
  if (A.id === B.id) return 'same';
  if (areEdgesParallel(A.id, B.id)) return 'parallel';
  if (doEdgesIntersect(A.id, B.id)) return 'intersecting';
  if (areEdgesSkew(A.id, B.id)) return 'skew';
  return 'coplanar';
}

/** 2辺の共通の頂点（なければ null） */
export function getCommonVertex(a, b) {
  const A = getEdge(resolveElementOfType(a, ELEMENT_TYPES.EDGE));
  const B = getEdge(resolveElementOfType(b, ELEMENT_TYPES.EDGE));
  if (A.id === B.id) return null;
  return A.vertices.find((v) => B.vertices.includes(v)) ?? null;
}

// ---------- 面と面 ----------

/** 2面が平行か（自分自身は含めない） */
export function areFacesParallel(f, g) {
  const F = faceData(f);
  const G = faceData(g);
  if (F.id === G.id) return false;
  return sameDirection(F.n, G.n);
}

/** 2面が垂直か（法線の内積が 0） */
export function areFacesPerpendicular(f, g) {
  const F = faceData(f);
  const G = faceData(g);
  return isZero(vecDot(F.n, G.n));
}

/** 2面が共有する辺（なければ null） */
export function getCommonEdge(f, g) {
  const F = getFace(resolveElementOfType(f, ELEMENT_TYPES.FACE));
  const G = getFace(resolveElementOfType(g, ELEMENT_TYPES.FACE));
  if (F.id === G.id) return null;
  return EDGES.find((e) => e.vertices.every((v) => F.vertices.includes(v) && G.vertices.includes(v)))?.id ?? null;
}

// ---------- 辺と面 ----------

/** 辺が面（をふくむ平面）に含まれるか */
export function isEdgeContainedInFace(edgeId, faceId) {
  const E = edgeData(edgeId);
  const F = faceData(faceId);
  return isZero(vecDot(vecSub(E.p, F.c), F.n)) && isZero(vecDot(vecSub(E.q, F.c), F.n));
}

/** 辺と面が平行か（面に含まれる辺は平行とはいわない） */
export function isEdgeParallelToFace(edgeId, faceId) {
  const E = edgeData(edgeId);
  const F = faceData(faceId);
  return isZero(vecDot(E.d, F.n)) && !isEdgeContainedInFace(E.id, F.id);
}

/** 辺と面が垂直か */
export function isEdgePerpendicularToFace(edgeId, faceId) {
  const E = edgeData(edgeId);
  const F = faceData(faceId);
  return sameDirection(E.d, F.n);
}

/**
 * 辺と面の位置関係を分類する
 * @returns {'contained'|'parallel'|'perpendicular'|'oblique'} oblique = 垂直でなく斜めに交わる（立方体では起こらない）
 */
export function classifyEdgeFace(edgeId, faceId) {
  if (isEdgeContainedInFace(edgeId, faceId)) return 'contained';
  if (isEdgeParallelToFace(edgeId, faceId)) return 'parallel';
  if (isEdgePerpendicularToFace(edgeId, faceId)) return 'perpendicular';
  return 'oblique';
}

/** 辺（を延長した直線）が面（をふくむ平面）と交わる点にある頂点 ID（なければ null） */
export function getEdgeFaceMeetingVertex(edgeId, faceId) {
  const E = edgeData(edgeId);
  const F = faceData(faceId);
  const denom = vecDot(E.d, F.n);
  if (isZero(denom)) return null;
  const t = vecDot(vecSub(F.c, E.p), F.n) / denom;
  const point = vecAdd(E.p, vecScale(E.d, t));
  return VERTICES.find((v) => isZeroVec(vecSub(v.position, point)))?.id ?? null;
}

// ---------- 一覧の取得（立方体の 12 辺・6 面が対象） ----------

const edgeIds = () => EDGES.map((e) => e.id);
const faceIds = () => FACES.map((f) => f.id);

export const getParallelEdges = (edgeId) => edgeIds().filter((e) => areEdgesParallel(edgeId, e));
export const getIntersectingEdges = (edgeId) => edgeIds().filter((e) => doEdgesIntersect(edgeId, e));
export const getPerpendicularEdges = (edgeId) => edgeIds().filter((e) => areEdgesPerpendicular(edgeId, e));
export const getSkewEdges = (edgeId) => edgeIds().filter((e) => areEdgesSkew(edgeId, e));

export const getParallelFaces = (faceId) => faceIds().filter((f) => areFacesParallel(faceId, f));
export const getPerpendicularFaces = (faceId) => faceIds().filter((f) => areFacesPerpendicular(faceId, f));

export const getFacesContainingEdge = (edgeId) => faceIds().filter((f) => isEdgeContainedInFace(edgeId, f));
export const getFacesParallelToEdge = (edgeId) => faceIds().filter((f) => isEdgeParallelToFace(edgeId, f));
export const getFacesPerpendicularToEdge = (edgeId) => faceIds().filter((f) => isEdgePerpendicularToFace(edgeId, f));

export const getEdgesInFace = (faceId) => edgeIds().filter((e) => isEdgeContainedInFace(e, faceId));
export const getEdgesParallelToFace = (faceId) => edgeIds().filter((e) => isEdgeParallelToFace(e, faceId));
export const getEdgesPerpendicularToFace = (faceId) => edgeIds().filter((e) => isEdgePerpendicularToFace(e, faceId));

// ---------- 内部 ----------

/** 2線分の最短距離（一般的な最近点の計算） */
function segmentDistance(A, B) {
  const u = vecSub(A.q, A.p);
  const v = vecSub(B.q, B.p);
  const w = vecSub(A.p, B.p);
  const a = vecDot(u, u);
  const b = vecDot(u, v);
  const c = vecDot(v, v);
  const d = vecDot(u, w);
  const e = vecDot(v, w);
  const D = a * c - b * b;
  let sN;
  let sD = D;
  let tN;
  let tD = D;
  if (D < EPSILON) {
    // ほぼ平行
    sN = 0;
    sD = 1;
    tN = e;
    tD = c;
  } else {
    sN = b * e - c * d;
    tN = a * e - b * d;
    if (sN < 0) {
      sN = 0;
      tN = e;
      tD = c;
    } else if (sN > sD) {
      sN = sD;
      tN = e + b;
      tD = c;
    }
  }
  if (tN < 0) {
    tN = 0;
    if (-d < 0) sN = 0;
    else if (-d > a) sN = sD;
    else {
      sN = -d;
      sD = a;
    }
  } else if (tN > tD) {
    tN = tD;
    if (-d + b < 0) sN = 0;
    else if (-d + b > a) sN = sD;
    else {
      sN = -d + b;
      sD = a;
    }
  }
  const sc = isZero(sN) ? 0 : sN / sD;
  const tc = isZero(tN) ? 0 : tN / tD;
  const diff = vecSub(vecAdd(w, vecScale(u, sc)), vecScale(v, tc));
  return vecLength(diff);
}
